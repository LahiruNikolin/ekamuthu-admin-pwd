import WeekTimeline from "./WeekTimeline";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Minimize2, RefreshCw } from "lucide-react";
import { adminApi } from "@/api/client";
import { addDays, displayDate } from "./date";
import { calendarDisplayBlocks } from "./calendarVisibility";
import type {
  OperatorCourt,
  OperatorPlayArea,
  OperatorCalendarBlock,
} from "./types";
import BookingDialog, { type CalendarBooking } from "./BookingDialog";

export default function OperationsBoard({
  initialStart,
  courts,
  onClose,
}: {
  initialStart: string;
  courts: OperatorCourt[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [start, setStart] = useState(initialStart);
  const [booking, setBooking] = useState<CalendarBooking | null>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal();
    closeButton.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  const calendar = useQuery({
    queryKey: [
      "calendar-overview",
      courts.map((c) => c.id).join(","),
      start,
      "week",
    ],
    queryFn: ({ signal }) =>
      Promise.all(
        courts.map(async (court) => {
          try {
            const [areas, blocks] = await Promise.all([
              adminApi.get<OperatorPlayArea[]>(
                `/courts/${court.id}/play-areas`,
                signal,
              ),
              adminApi.get<OperatorCalendarBlock[]>(
                `/admin/calendar/days?court_id=${court.id}&start_date=${start}&days=7`,
                signal,
              ),
            ]);
            return {
              court,
              areas,
              blocks: calendarDisplayBlocks(blocks),
              failed: false,
            };
          } catch (error) {
            if (signal.aborted) throw error;
            return {
              court,
              areas: [] as OperatorPlayArea[],
              blocks: [] as OperatorCalendarBlock[],
              failed: true,
            };
          }
        }),
      ),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const data = calendar.data || [];
  const areas = data.flatMap((d) =>
    d.areas.map((a) => ({ ...a, court: d.court })),
  );
  const blocks = data
    .flatMap((d) =>
      d.blocks.map((b) => ({
        ...b,
        court_id: d.court.id,
        court_name: d.court.name,
      })),
    )
    .filter((b) => b.status !== "available");
  const changeWeek = (next: string) => setStart(next);
  return (
    <dialog
      ref={dialog}
      className="operations-board operations-calendar-board"
      aria-labelledby="operations-board-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!booking) onClose();
      }}
    >
      <header className="operations-header">
        <div>
          <span className="operations-eyebrow">COURT OPERATIONS</span>
          <h2 id="operations-board-title">Weekly calendar</h2>
          <p>
            {courts.length === 1 ? courts[0].name : `${courts.length} venues`} ·
            Times local to each venue
          </p>
        </div>
        <div className="operations-week-nav">
          <button
            aria-label="Previous board week"
            onClick={() => changeWeek(addDays(start, -7))}
          >
            <ChevronLeft size={20} />
          </button>
          <strong>
            {displayDate(start)} – {displayDate(addDays(start, 6))}
            <small>{start.slice(0, 4)}</small>
          </strong>
          <button
            aria-label="Next board week"
            onClick={() => changeWeek(addDays(start, 7))}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <button
          className="operations-calendar-refresh"
          aria-label="Refresh full-screen calendar"
          disabled={calendar.isFetching}
          onClick={() => void calendar.refetch()}
        >
          <RefreshCw size={17} />
        </button>
        <button ref={closeButton} className="operations-exit" onClick={onClose}>
          <Minimize2 size={18} />
          Exit
        </button>
      </header>
      {(calendar.isError || data.some((d) => d.failed)) && (
        <p role="alert" className="operations-warning">
          Some courts could not load. Refresh to retry; this board may be
          incomplete.
        </p>
      )}
      <div className="operations-calendar-content">
        {calendar.isLoading ? (
          <p role="status">Loading court schedules…</p>
        ) : (
          <WeekTimeline
            start={start}
            blocks={blocks}
            courts={courts}
            areas={areas}
            onOpenBooking={setBooking}
          />
        )}
      </div>
      {booking && (
        <BookingDialog booking={booking} onClose={() => setBooking(null)} />
      )}
    </dialog>
  );
}
