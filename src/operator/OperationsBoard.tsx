import WeekTimeline from "./WeekTimeline";
import { useEffect, useRef, useState } from "react";
import useWeekCalendar from "./useWeekCalendar";
import { ChevronLeft, ChevronRight, Minimize2, RefreshCw } from "lucide-react";
import { addDays, displayDate } from "./date";
import type {
  OperatorCourt,
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
  const calendar = useWeekCalendar(courts, start);
  const data = calendar.data || [];
  const { areas, blocks } = calendar;
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
            onCreateBooking={onClose}
          />
        )}
      </div>
      {booking && (
        <BookingDialog booking={booking} onClose={() => setBooking(null)} />
      )}
    </dialog>
  );
}
