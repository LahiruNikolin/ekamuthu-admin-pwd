import type { CSSProperties } from "react";
import useCalendarZoom from "./useCalendarZoom";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { slotIsEmpty, slotRange } from "./calendarSlot";
import {
  addDays,
  colomboDateKey,
  displayDate,
  displayTime,
  localInput,
} from "./date";
import type {
  OperatorCalendarBlock,
  OperatorCourt,
  OperatorPlayArea,
} from "./types";
import type { CalendarBooking } from "./BookingDialog";
import {
  calendarTone,
  isCalendarCancelled,
  isCalendarBlocked,
  calendarRebookedBlocks,
} from "./calendarVisibility";

type CourtArea = OperatorPlayArea & { court: OperatorCourt };
type Entry = {
  block: OperatorCalendarBlock;
  from: number;
  to: number;
  column: number;
  columns: number;
  zone: string;
  cancelled: boolean;
};
const minute = (value: string) =>
  Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const baseHourHeight = 72;
const baseLaneWidth = 116;
const axisWidth = 58;
const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function WeekTimeline({
  start,
  blocks,
  courts,
  areas,
  onSelectDay,
  onOpenBooking,
  onCreateBooking,
}: {
  start: string;
  blocks: OperatorCalendarBlock[];
  courts: OperatorCourt[];
  areas: CourtArea[];
  onSelectDay?: (day: string) => void;
  onOpenBooking?: (booking: CalendarBooking) => void;
  onCreateBooking?: () => void;
}) {
  const navigate = useNavigate();
  const viewport = useRef<HTMLDivElement>(null);
  const press = useRef({ x: 0, y: 0 });
  const [scroll, setScroll] = useState({
    top: 8 * baseHourHeight,
    left: 0,
    width: 400,
    height: 600,
  });
  const { zoom } = useCalendarZoom(
    viewport,
    () => {
      const el = viewport.current;
      if (el)
        setScroll({
          top: el.scrollTop,
          left: el.scrollLeft,
          width: el.clientWidth,
          height: el.clientHeight,
        });
    },
    areas.length > 0 || blocks.length > 0,
  );
  const hourHeight = baseHourHeight * zoom;
  const laneWidth = baseLaneWidth * zoom;
  const rebooked = useMemo(() => calendarRebookedBlocks(blocks), [blocks]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(start, i)),
    [start],
  );
  const resources = useMemo(() => {
    const result = [...areas];
    const known = new Set(result.map((a) => `${a.court.id}:${a.id}`));
    // Retain historical bookings if their play area is no longer in the active area list.
    for (const b of blocks) {
      const key = `${b.court_id}:${b.play_area_id || ""}`;
      const court = courts.find((c) => c.id === b.court_id);
      if (court && !known.has(key)) {
        result.push({
          id: b.play_area_id || "",
          name: b.play_area_name || "Unassigned",
          court,
        });
        known.add(key);
      }
    }
    return result;
  }, [areas, blocks, courts]);
  const dayWidth = Math.max(1, resources.length) * laneWidth;
  const lanes = useMemo(
    () =>
      days.flatMap((day, dayIndex) =>
        resources.map((area, areaIndex) => ({
          day,
          dayIndex,
          area,
          index: dayIndex * resources.length + areaIndex,
        })),
      ),
    [days, resources],
  );
  const indexed = useMemo(() => {
    const result: Entry[][] = lanes.map(() => []);
    const resourceIndex = new Map(
      resources.map((a, i) => [`${a.court.id}:${a.id}`, i]),
    );
    const zones = new Map(
      courts.map((c) => [c.id, c.timezone || "Asia/Colombo"]),
    );
    for (const block of blocks) {
      if (block.status === "available") continue;
      const resource = resourceIndex.get(
        `${block.court_id}:${block.play_area_id || ""}`,
      );
      if (resource === undefined) continue;
      const zone = zones.get(block.court_id) || "Asia/Colombo";
      const from = localInput(block.starts_at, zone),
        to = localInput(block.ends_at, zone);
      days.forEach((day, i) => {
        const a = from.slice(0, 10) < day ? 0 : minute(from),
          b = to.slice(0, 10) > day ? 1440 : minute(to);
        if (from.slice(0, 10) <= day && to.slice(0, 10) >= day && b > a)
          result[i * resources.length + resource].push({
            block,
            from: a,
            to: b,
            column: 0,
            columns: 1,
            zone,
            cancelled: isCalendarCancelled(block),
          });
      });
    }
    // Overlap only divides a lane when bookings belong to the same play area.
    for (const lane of result) {
      lane.sort((a, b) => a.from - b.from || b.to - a.to);
      let group: Entry[] = [],
        ends: number[] = [],
        groupEnd = -1;
      const finish = () => {
        for (const e of group) e.columns = ends.length;
      };
      for (const entry of lane) {
        if (entry.from >= groupEnd) {
          finish();
          group = [];
          ends = [];
          groupEnd = -1;
        }
        let column = ends.findIndex((end) => end <= entry.from);
        if (column < 0) column = ends.length;
        ends[column] = entry.to;
        entry.column = column;
        group.push(entry);
        groupEnd = Math.max(groupEnd, entry.to);
      }
      finish();
    }
    return result;
  }, [blocks, courts, days, resources, lanes]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () =>
      setScroll({
        top: element.scrollTop,
        left: element.scrollLeft,
        width: element.clientWidth,
        height: element.clientHeight,
      });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [resources.length > 0]);
  useEffect(() => {
    if (viewport.current) {
      viewport.current.scrollTop = 8 * hourHeight;
      viewport.current.scrollLeft = 0;
    }
  }, [start, resources.length > 0]);
  const firstLane = Math.max(0, Math.floor(scroll.left / laneWidth) - 1);
  const lastLane = Math.min(
    lanes.length,
    Math.ceil((scroll.left + scroll.width) / laneWidth) + 1,
  );
  const visibleLanes = lanes.slice(firstLane, lastLane);
  const firstMinute = Math.max(0, ((scroll.top - 100) / hourHeight) * 60),
    lastMinute = Math.min(
      1440,
      ((scroll.top + scroll.height + 100) / hourHeight) * 60,
    );
  const activeDay = Math.min(6, Math.floor(scroll.left / dayWidth));
  const today = colomboDateKey(new Date(), courts[0]?.timezone);
  return (
    <section
      className="weekly-time-section nested-week"
      aria-label="Weekly time schedule"
      data-density={
        zoom < 0.5 ? "overview" : zoom < 0.8 ? "compact" : "comfortable"
      }
    >
      <nav
        className="nested-day-nav"
        aria-label="Jump to day in weekly schedule"
      >
        {days.map((day, i) => (
          <button
            key={day}
            aria-current={i === activeDay ? "date" : undefined}
            className={day === today ? "is-today" : ""}
            onClick={() => {
              if (viewport.current) viewport.current.scrollLeft = i * dayWidth;
            }}
          >
            <span>{dayNames[i]}</span>
            <strong>{Number(day.slice(-2))}</strong>
          </button>
        ))}
      </nav>
      <p className="weekly-time-hint">
        Tap an empty time to book. Pinch to zoom.
      </p>
      {resources.length === 0 ? (
        <p className="week-empty">No play areas available.</p>
      ) : (
        <div
          ref={viewport}
          className="weekly-time-scroll"
          role="region"
          aria-label="Weekly booking timeline with play-area columns inside each day"
          tabIndex={0}
          onPointerDownCapture={(e) => {
            press.current = { x: e.clientX, y: e.clientY };
          }}
          onClickCapture={(event) => {
            if (
              Date.now() <
              Number(event.currentTarget.dataset.zoomClickUntil || 0) ||
              (event.detail > 0 &&
                Math.hypot(
                  event.clientX - press.current.x,
                  event.clientY - press.current.y,
                ) > 8)
            ) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onScroll={(e) => {
            const el = e.currentTarget;
            setScroll({
              top: el.scrollTop,
              left: el.scrollLeft,
              width: el.clientWidth,
              height: el.clientHeight,
            });
          }}
        >
          <div
            className="weekly-time-canvas"
            style={
              {
                width: axisWidth + dayWidth * 7,
                "--calendar-hour": `${hourHeight}px`,
                "--calendar-text-scale": Math.min(1.35, Math.max(0.9, zoom)),
              } as CSSProperties
            }
          >
            <div className="weekly-time-header nested-week-header">
              <div className="weekly-time-corner">Time</div>
              {days.map((day, i) => (
                <div
                  className={`nested-day-group ${day === today ? "is-today" : ""}`}
                  key={day}
                  style={{ left: axisWidth + i * dayWidth, width: dayWidth }}
                >
                  <button
                    onClick={() => {
                      if (onSelectDay) onSelectDay(day);
                      else if (viewport.current)
                        viewport.current.scrollLeft = i * dayWidth;
                    }}
                    aria-label={`See bookings for ${displayDate(day)}`}
                  >
                    <strong>
                      {dayNames[i]} · {displayDate(day)}
                    </strong>
                  </button>
                </div>
              ))}
              {visibleLanes.map((lane) => (
                <div
                  className="nested-area-heading"
                  key={`${lane.day}-${lane.area.court.id}-${lane.area.id}`}
                  style={{
                    left: axisWidth + lane.index * laneWidth,
                    width: laneWidth,
                  }}
                  title={`${lane.area.name} · ${lane.area.court.name}`}
                >
                  <strong>{lane.area.name}</strong>
                  {courts.length > 1 && <small>{lane.area.court.name}</small>}
                </div>
              ))}
            </div>
            <div
              className="weekly-time-body"
              style={{ height: 24 * hourHeight }}
            >
              <div className="weekly-time-axis">
                {Array.from({ length: 24 }, (_, hour) => (
                  <span key={hour} style={{ top: hour * hourHeight }}>
                    {hourLabel(hour)}
                  </span>
                ))}
              </div>
              <div className="weekly-time-days nested-time-lanes">
                {visibleLanes.map((lane) => {
                  const step =
                    lane.area.court.allow_half_hour_bookings === false ? 60 : 30;
                  const first = Math.floor(firstMinute / step),
                    last = Math.min(1440 / step, Math.ceil(lastMinute / step));
                  return (
                  <div
                    className={`weekly-time-day nested-time-lane ${lane.index % resources.length === 0 ? "is-day-start" : ""}`}
                    key={`${lane.day}-${lane.area.court.id}-${lane.area.id}`}
                    style={{ left: lane.index * laneWidth, width: laneWidth }}
                    aria-label={`${lane.day}, ${lane.area.name}`}
                  >
                    {areas.includes(lane.area) &&
                      lane.area.booking_mode !== "slot_based" &&
                      Array.from(
                        { length: last - first },
                        (_, i) => (first + i) * step,
                      )
                        .filter((from) =>
                          slotIsEmpty(from, step, indexed[lane.index]),
                        )
                        .map((from) => {
                          const range = slotRange(lane.day, from, step);
                          const label = `New booking · ${lane.area.court.name} · ${lane.area.name} · ${lane.day} · ${range.start.slice(11)}–${range.end.slice(11)}`;
                          return (<button
                            type="button"
                            key={from}
                            className="weekly-time-slot"
                            style={{
                              top: (from / 60) * hourHeight,
                              height: (step / 60) * hourHeight,
                            }}
                            aria-label={label}
                            title={label}
                            onClick={() => {
                              onCreateBooking?.();
                              navigate(`/bookings/new?${new URLSearchParams({
                                courtId: lane.area.court.id,
                                playAreaId: lane.area.id,
                                date: lane.day,
                                ...range,
                              })}`);
                            }}
                          >
                            <span>＋ {range.start.slice(11)}</span>
                          </button>);
                        })}
                    {indexed[lane.index]
                      .filter((e) => e.to > firstMinute && e.from < lastMinute)
                      .map((e) => {
                        const b = e.block,
                          blocked = isCalendarBlocked(b),
                          cancelled = isCalendarCancelled(b);
                        const name =
                          b.admin_assigned_player?.name ||
                          b.admin_contact_name ||
                          b.booking_creator?.name ||
                          (blocked ? "Blocked" : "Booking");
                        const time = `${localInput(b.starts_at, e.zone).slice(11)}–${localInput(b.ends_at, e.zone).slice(11)}`;
                        const label = `${lane.area.name} · ${name} · ${displayTime(b.starts_at, e.zone)} – ${displayTime(b.ends_at, e.zone)} · ${lane.area.court.name}${cancelled ? " · Cancelled" : ""}${rebooked.has(b) ? (cancelled ? " · Time rebooked" : " · Rebooked") : ""}`;
                        return (
                          <Link
                            key={`${b.id}-${b.starts_at}`}
                            className={`weekly-time-event tone-${calendarTone(b)} ${cancelled ? "is-cancelled" : ""}`}
                            style={{
                              top: (e.from / 60) * hourHeight + 1,
                              height: Math.max(
                                zoom < 0.5 ? 8 : 18,
                                ((e.to - e.from) / 60) * hourHeight - 2,
                              ),
                              left: `calc(${(e.column / e.columns) * 100}% + 3px)`,
                              width: `calc(${100 / e.columns}% - 6px)`,
                            }}
                            onClick={(event) => {
                              if (
                                !onOpenBooking ||
                                event.button !== 0 ||
                                event.metaKey ||
                                event.ctrlKey ||
                                event.shiftKey ||
                                event.altKey
                              )
                                return;
                              event.preventDefault();
                              onOpenBooking({
                                bookingId: b.id,
                                courtId: b.court_id,
                                date: colomboDateKey(
                                  new Date(b.starts_at),
                                  e.zone,
                                ),
                                playAreaId: b.play_area_id || "",
                                zone: e.zone,
                              });
                            }}
                            title={label}
                            aria-label={label}
                            to={`/bookings/${b.id}?courtId=${b.court_id}&date=${colomboDateKey(new Date(b.starts_at), e.zone)}&playAreaId=${b.play_area_id || ""}`}
                          >
                            <strong>{time}</strong>
                            <span>{name}</span>
                            <small>
                              {cancelled
                                ? rebooked.has(b)
                                  ? "Cancelled · rebooked"
                                  : "Cancelled"
                                : rebooked.has(b)
                                  ? "Rebooked"
                                  : blocked
                                    ? "Blocked"
                                    : b.is_recurring
                                      ? "Weekly booking"
                                      : (
                                          b.game_status ||
                                          b.admin_outcome ||
                                          "Booked"
                                        ).replaceAll("_", " ")}
                            </small>
                          </Link>
                        );
                      })}
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
