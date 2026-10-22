import { lazy, Suspense, useEffect, useRef } from "react";
import { X } from "lucide-react";
const Details = lazy(() =>
  import("@/features/Booking").then((module) => ({
    default: module.BookingDetails,
  })),
);
export type CalendarBooking = {
  bookingId: string;
  courtId: string;
  date: string;
  playAreaId: string;
  zone: string;
};
export default function BookingDialog({
  booking,
  onClose,
}: {
  booking: CalendarBooking;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    closeButton.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="calendar-booking-dialog"
      aria-labelledby="calendar-booking-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <header className="calendar-dialog-header">
        <div>
          <p>CALENDAR</p>
          <h2 id="calendar-booking-title">Booking details</h2>
        </div>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="Close booking details"
        >
          <X size={20} />
        </button>
      </header>
      <div className="calendar-dialog-content">
        <Suspense fallback={<p role="status">Loading booking…</p>}>
          <Details {...booking} onReleased={onClose} />
        </Suspense>
      </div>
    </dialog>
  );
}
