import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
const AXIS_WIDTH = 58;
const HEADER_HEIGHT = 88;
const STORAGE_KEY = "admin-calendar-grid-zoom";
export const clampZoom = (value: number) =>
  Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)) * 100) / 100;
type Anchor = { worldX: number; worldY: number; x: number; y: number };
type Pinch = Anchor & { distance: number; zoom: number };

// Resize calendar coordinates rather than scaling the page or its navigation.
export default function useCalendarZoom(
  viewport: RefObject<HTMLDivElement | null>,
  measure: () => void,
  enabled: boolean,
) {
  const [zoom, setZoom] = useState(() => {
    try {
      const saved = Number(sessionStorage.getItem(STORAGE_KEY));
      return saved > 0 && Number.isFinite(saved) ? clampZoom(saved) : 1;
    } catch {
      return 1;
    }
  });
  const currentZoom = useRef(zoom);
  const pendingAnchor = useRef<Anchor | null>(null);
  const measureRef = useRef(measure);
  measureRef.current = measure;

  useLayoutEffect(() => {
    currentZoom.current = zoom;
    const el = viewport.current,
      anchor = pendingAnchor.current;
    if (el && anchor) {
      el.scrollLeft = anchor.worldX * zoom + AXIS_WIDTH - anchor.x;
      el.scrollTop = anchor.worldY * zoom + HEADER_HEIGHT - anchor.y;
      pendingAnchor.current = null;
      measureRef.current();
    }
  }, [zoom, viewport]);
  // Persist after movement settles, avoiding synchronous storage writes during pinch frames.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { sessionStorage.setItem(STORAGE_KEY, String(zoom)); } catch { /* Optional preference only. */ }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [zoom]);

  function anchorAt(el: HTMLDivElement, x: number, y: number): Anchor {
    return {
      x,
      y,
      worldX: (el.scrollLeft + x - AXIS_WIDTH) / currentZoom.current,
      worldY: (el.scrollTop + y - HEADER_HEIGHT) / currentZoom.current,
    };
  }
  function zoomTo(value: number) {
    const el = viewport.current;
    if (!el) return;
    pendingAnchor.current = anchorAt(
      el,
      (el.clientWidth + AXIS_WIDTH) / 2,
      (el.clientHeight + HEADER_HEIGHT) / 2,
    );
    setZoom(clampZoom(value));
  }

  useEffect(() => {
    const el = viewport.current;
    if (!el || !enabled) return;
    let pinch: Pinch | null = null;
    let frame = 0;
    let nextZoom = currentZoom.current;
    let nextAnchor: Anchor | null = null;
    const midpoint = (event: TouchEvent) => {
      const a = event.touches[0],
        b = event.touches[1],
        rect = el.getBoundingClientRect();
      return {
        x: (a.clientX + b.clientX) / 2 - rect.left - el.clientLeft,
        y: (a.clientY + b.clientY) / 2 - rect.top - el.clientTop,
        distance: Math.max(
          1,
          Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        ),
      };
    };
    const suppressTap = () => {
      el.dataset.zoomClickUntil = String(Date.now() + 600);
    };
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      if (event.cancelable) event.preventDefault();
      const point = midpoint(event);
      pinch = {
        ...anchorAt(el, point.x, point.y),
        distance: point.distance,
        zoom: currentZoom.current,
      };
      el.dataset.pinching = "true";
      suppressTap();
    };
    const move = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return;
      if (event.cancelable) event.preventDefault();
      const point = midpoint(event);
      nextZoom = clampZoom((pinch.zoom * point.distance) / pinch.distance);
      nextAnchor = {
        worldX: pinch.worldX,
        worldY: pinch.worldY,
        x: point.x,
        y: point.y,
      };
      suppressTap();
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          pendingAnchor.current = nextAnchor;
          if (nextZoom === currentZoom.current) {
            // At a zoom boundary, keep following the two-finger midpoint.
            if (nextAnchor) {
              el.scrollLeft =
                nextAnchor.worldX * nextZoom + AXIS_WIDTH - nextAnchor.x;
              el.scrollTop =
                nextAnchor.worldY * nextZoom + HEADER_HEIGHT - nextAnchor.y;
              measureRef.current();
            }
            pendingAnchor.current = null;
          } else setZoom(nextZoom);
        });
    };
    const finish = (event: TouchEvent) => {
      if (!pinch) return;
      if (event.cancelable) event.preventDefault();
      suppressTap();
      if (event.touches.length < 2) {
        pinch = null;
        delete el.dataset.pinching;
      }
    };
    el.addEventListener("touchstart", start, { passive: false });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", finish, { passive: false });
    el.addEventListener("touchcancel", finish, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      delete el.dataset.pinching;
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", finish);
      el.removeEventListener("touchcancel", finish);
    };
  }, [enabled, viewport]);
  return {
    zoom,
    zoomIn: () => zoomTo(currentZoom.current + 0.25),
    zoomOut: () => zoomTo(currentZoom.current - 0.25),
    resetZoom: () => zoomTo(1),
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
  };
}
