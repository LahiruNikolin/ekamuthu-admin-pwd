import BookingDialog, { type CalendarBooking } from "./BookingDialog";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Maximize2,
} from "lucide-react";
import { adminApi } from "@/api/client";
import { addDays, colomboDateKey, displayDate, displayTime } from "./date";
import { calendarDisplayBlocks, calendarTone } from "./calendarVisibility";
import { CalendarSkeleton } from "./ui";
import VirtualList from "./VirtualList";
import type {
  OperatorCalendarBlock,
  OperatorContextValue,
  OperatorPlayArea,
} from "./types";
const OperationsBoard = lazy(() => import("./OperationsBoard"));
const WeekTimeline = lazy(() => import("./WeekTimeline"));
const Timeline = lazy(() => import("./Timeline"));
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monday = (date: string) =>
  addDays(date, -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));
const isBlocked = (b: OperatorCalendarBlock) =>
  b.reservation_purpose === "block" || b.status === "unavailable";
const isCancelled = (b: OperatorCalendarBlock) =>
  b.status === "cancelled" || b.game_status === "cancelled";
const nameOf = (b: OperatorCalendarBlock) =>
  b.admin_assigned_player?.name ||
  b.admin_contact_name ||
  b.booking_creator?.name ||
  b.reservation_note ||
  (isBlocked(b) ? "Blocked time" : "Booking");

export default function OperatorCalendar({
  selectedCourtId,
  selectedCourt,
  courts,
}: OperatorContextValue) {
  const [params, setParams] = useSearchParams();
  const [boardOpen, setBoardOpen] = useState(false);
  const boardOwnsFullscreen = useRef(false);
  function closeBoard() {
    setBoardOpen(false);
    if (boardOwnsFullscreen.current && document.fullscreenElement)
      void document.exitFullscreen().catch(() => {});
    boardOwnsFullscreen.current = false;
  }
  async function openBoard() {
    // Open the dialog after entering browser fullscreen so it stays above that top layer.
    if (
      !document.fullscreenElement &&
      document.documentElement.requestFullscreen
    ) {
      try {
        await document.documentElement.requestFullscreen();
        boardOwnsFullscreen.current = true;
      } catch {
        boardOwnsFullscreen.current = false;
      }
    }
    setBoardOpen(true);
  }
  const [openBooking, setOpenBooking] = useState<CalendarBooking | null>(null);
  const zone = selectedCourt?.timezone || "Asia/Colombo";
  const today = colomboDateKey(new Date(), zone);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "")
    ? params.get("date")!
    : today;
  const mode = params.get("view") === "day" ? "day" : "week";
  const start = mode === "week" ? monday(date) : date;
  const allVenues = params.get("scope") === "all" || !selectedCourtId;
  const venues = allVenues
    ? courts
    : courts.filter((c) => c.id === selectedCourtId);
  const [showCancelled, setShowCancelled] = useState(false);
  const [rowPage, setRowPage] = useState(0);
  const [focus, setFocus] = useState<{
    date: string;
    area: string;
    court: string;
  } | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  function update(values: Record<string, string>) {
    setFocus(null);
    setRowPage(0);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(values)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }
  const calendar = useQuery({
    queryKey: [
      "calendar-overview",
      venues.map((c) => c.id).join(","),
      start,
      mode,
    ],
    queryFn: ({ signal }) =>
      Promise.all(
        venues.map(async (court) => {
          try {
            const [areas, blocks] = await Promise.all([
              adminApi.get<OperatorPlayArea[]>(
                `/courts/${court.id}/play-areas`,
                signal,
              ),
              adminApi.get<OperatorCalendarBlock[]>(
                `/admin/calendar/days?court_id=${court.id}&start_date=${start}&days=${mode === "week" ? 7 : 1}`,
                signal,
              ),
            ]);
            return {
              areas,
              blocks: calendarDisplayBlocks(blocks),
              court,
              failed: false,
            };
          } catch (error) {
            if (signal.aborted) throw error;
            return {
              areas: [] as OperatorPlayArea[],
              blocks: [] as OperatorCalendarBlock[],
              court,
              failed: true,
            };
          }
        }),
      ),
    enabled: !!venues.length,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const loading = calendar.isLoading;
  const refreshing = calendar.isFetching;
  const data = calendar.data || [];
  const areas = data.flatMap((d) =>
    d.areas.map((a) => ({ ...a, court: d.court })),
  );
  const visibleAreas = areas;
  const blocks = data
    .flatMap((d) =>
      d.blocks.map((b) => ({
        ...b,
        court_id: d.court.id,
        court_name: d.court.name,
      })),
    )
    .filter(
      (b) => b.status !== "available" && (showCancelled || !isCancelled(b)),
    );
  const dates = Array.from({ length: mode === "week" ? 7 : 1 }, (_, i) =>
    addDays(start, i),
  );
  // Index once by venue-local day and area. Overnight bookings appear on both days.
  const index = useMemo(() => {
    const result = new Map<string, OperatorCalendarBlock[]>();
    for (const b of blocks) {
      const tz =
        courts.find((c) => c.id === b.court_id)?.timezone || "Asia/Colombo";
      const first = colomboDateKey(new Date(b.starts_at), tz);
      const last = colomboDateKey(new Date(Date.parse(b.ends_at) - 1), tz);
      for (const day of dates)
        if (day >= first && day <= last) {
          const key = `${b.play_area_id}:${day}`;
          const entries = result.get(key) || [];
          entries.push(b);
          result.set(key, entries);
        }
    }
    for (const entries of result.values())
      entries.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return result;
  }, [blocks, courts, start, mode]);
  const focusDate = focus?.date || date;
  const dayBlocks = visibleAreas
    .flatMap((a) =>
      !focus?.area || focus.area === a.id
        ? index.get(`${a.id}:${focusDate}`) || []
        : [],
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const activeBookings = blocks.filter((b) => !isBlocked(b) && !isCancelled(b));
  const timelineCourt =
    venues.find((c) => c.id === (focus?.court || selectedCourtId)) || venues[0];
  const rowOffset = Math.min(
    rowPage * 12,
    Math.max(0, Math.floor((visibleAreas.length - 1) / 12) * 12),
  );
  function choose(day: string, area = "", court = "") {
    setFocus({ date: day, area, court });
  }
  useEffect(() => {
    if (focus)
      detailRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [focus]);
  if (!venues.length) return <p>Select a venue to view its calendar.</p>;
  return (
    <section
      className="operator-page week-calendar"
      onClickCapture={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          !(event.target instanceof Element)
        )
          return;
        const grid = event.target.closest<HTMLElement>(".weekly-time-scroll");
        if (grid && Date.now() < Number(grid.dataset.zoomClickUntil || 0)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const link = event.target.closest<HTMLAnchorElement>("a[href]");
        if (!link || link.closest("dialog")) return;
        const url = new URL(link.href, window.location.origin);
        const match = url.pathname.match(/^\/bookings\/([^/]+)$/);
        if (
          url.origin !== window.location.origin ||
          !match ||
          match[1] === "new"
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        const courtId = url.searchParams.get("courtId") || selectedCourtId;
        setOpenBooking({
          bookingId: decodeURIComponent(match[1]),
          courtId,
          date: url.searchParams.get("date") || date,
          playAreaId: url.searchParams.get("playAreaId") || "",
          zone: courts.find((c) => c.id === courtId)?.timezone || zone,
        });
      }}
    >
      {openBooking && (
        <BookingDialog
          booking={openBooking}
          onClose={() => setOpenBooking(null)}
        />
      )}
      {boardOpen && (
        <Suspense fallback={<p role="status">Opening weekly board…</p>}>
          <OperationsBoard
            initialStart={monday(date)}
            courts={venues}
            onClose={closeBoard}
          />
        </Suspense>
      )}
      <div className="week-title-row">
        <div>
          <p className="week-eyebrow">YOUR SCHEDULE</p>
          <h2>Calendar</h2>
        </div>
        <Link
          className="week-create"
          to={`/bookings/new?date=${focusDate}&courtId=${focus?.court || selectedCourtId || venues[0].id}${focus?.area || "" ? `&playAreaId=${focus?.area || ""}` : ""}`}
        >
          <Plus size={17} />
          New booking
        </Link>
      </div>
      <div className="week-toolbar">
        <div className="week-period">
          <button
            aria-label={`Previous ${mode}`}
            onClick={() =>
              update({ date: addDays(start, mode === "week" ? -7 : -1) })
            }
          >
            <ChevronLeft size={20} />
          </button>
          <label className="week-date-picker">
            <strong>
              {mode === "week"
                ? `${displayDate(start)} – ${displayDate(addDays(start, 6))}`
                : displayDate(date)}
            </strong>
            <span>{start.slice(0, 4)}</span>
            <input
              aria-label="Choose viewing date"
              type="date"
              value={date}
              onChange={(e) =>
                e.target.value && update({ date: e.target.value })
              }
            />
          </label>
          <button
            aria-label={`Next ${mode}`}
            onClick={() =>
              update({ date: addDays(start, mode === "week" ? 7 : 1) })
            }
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="week-view-controls">
          <button onClick={() => update({ date: today })}>Today</button>
          <div className="week-segment" aria-label="Calendar view">
            <button
              aria-pressed={mode === "week"}
              onClick={() => update({ view: "" })}
            >
              Week
            </button>
            <button
              aria-pressed={mode === "day"}
              onClick={() =>
                update({
                  view: "day",
                  date: focusDate,
                  playAreaId: focus?.area || "",
                })
              }
            >
              Day
            </button>
          </div>
          <button
            aria-label="Refresh calendar"
            disabled={refreshing}
            onClick={() => void calendar.refetch()}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
      <button className="calendar-fullscreen-cta" onClick={openBoard}>
        <Maximize2 size={18} />
        <span>
          Full screen<span>Weekly board for every court</span>
        </span>
        <ChevronRight size={17} />
      </button>
      <div className="week-filters">
        {courts.length > 1 && (
          <label>
            <span>Venues</span>
            <select
              aria-label="Calendar venues"
              value={allVenues ? "all" : selectedCourtId}
              onChange={(e) =>
                update({
                  scope: e.target.value === "all" ? "all" : "",
                  courtId:
                    e.target.value === "all" ? selectedCourtId : e.target.value,
                  playAreaId: "",
                })
              }
            >
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="all">All my venues ({courts.length})</option>
            </select>
          </label>
        )}
        <label className="week-history">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
          />
          Show cancelled
        </label>
      </div>
      <div className="week-summary">
        <span>
          <strong>{loading ? "—" : activeBookings.length}</strong> bookings{" "}
          {mode === "week" ? "this week" : "on this day"}
        </span>
        <span>
          <strong>{loading ? "—" : blocks.filter(isBlocked).length}</strong>{" "}
          blocked times
        </span>
        <span className="week-zone">
          {allVenues ? "Times local to each venue" : zone.replaceAll("_", " ")}
        </span>
      </div>
      {(calendar.isError || data.some((d) => d.failed)) && (
        <p role="alert" className="error">
          Some courts could not load. Refresh to retry; totals may be
          incomplete.
        </p>
      )}
      {loading ? (
        <CalendarSkeleton />
      ) : mode === "week" ? (
        <>
          <Suspense fallback={<CalendarSkeleton />}>
            <WeekTimeline
              areas={visibleAreas}
              start={start}
              blocks={blocks}
              courts={venues}
              onSelectDay={(day) => choose(day)}
            />
          </Suspense>
          <details className="week-counts-disclosure">
            <summary>Booking totals by court</summary>
            <div
              className="week-board"
              role="region"
              aria-label="Weekly bookings across courts"
              tabIndex={0}
            >
              <div className="week-grid week-grid-head">
                <div className="week-court-heading">Court</div>
                {dates.map((day, i) => (
                  <button
                    key={day}
                    className={`week-day-heading ${day === today ? "is-today" : ""} ${focusDate === day ? "is-selected" : ""}`}
                    aria-pressed={focusDate === day}
                    onClick={() => choose(day)}
                  >
                    <span>{weekdays[i]}</span>
                    <strong>{Number(day.slice(-2))}</strong>
                  </button>
                ))}
              </div>
              {visibleAreas.slice(rowOffset, rowOffset + 12).map((a) => (
                <div className="week-grid week-court-row" key={a.id}>
                  <div className="week-court-name">
                    <span className="week-court-marker" />
                    <strong>{a.name}</strong>
                    {allVenues && <small>{a.court.name}</small>}
                  </div>
                  {dates.map((day) => {
                    const entries = index.get(`${a.id}:${day}`) || [];
                    const bookings = entries.filter(
                      (b) => !isBlocked(b) && !isCancelled(b),
                    );
                    const blocked = entries.filter(isBlocked).length;
                    return (
                      <button
                        key={day}
                        className={`week-cell ${entries.length ? "has-entries" : ""} ${focus?.area === a.id && focusDate === day ? "is-focused" : ""}`}
                        onClick={() => choose(day, a.id, a.court.id)}
                        aria-label={`${a.name}, ${displayDate(day)}: ${bookings.length} bookings, ${blocked} blocked times${showCancelled ? `, ${entries.filter(isCancelled).length} cancelled` : ""}`}
                        aria-pressed={focus?.area === a.id && focusDate === day}
                      >
                        <span className="week-cell-count">
                          {entries.length ? bookings.length || "—" : "·"}
                        </span>
                        <span className="week-cell-caption">
                          {bookings.length
                            ? `booking${bookings.length === 1 ? "" : "s"}`
                            : entries.length
                              ? "No bookings"
                              : "No bookings"}
                        </span>
                        <span className="week-cell-signals">
                          {blocked > 0 && (
                            <i
                              title={`${blocked} blocked times`}
                              className="blocked-dot"
                            />
                          )}
                          {bookings.some((b) => b.is_recurring) && (
                            <i
                              title="Weekly booking"
                              className="recurring-dot"
                            />
                          )}
                          {entries.some(isCancelled) && (
                            <i title="Cancelled" className="cancelled-dot" />
                          )}
                        </span>
                        <span className="week-cell-preview">
                          {entries.slice(0, 2).map((b) => (
                            <span
                              key={`${b.id}-${b.starts_at}`}
                              className={`preview-${calendarTone(b)}`}
                            >
                              {displayTime(b.starts_at, a.court.timezone)} ·{" "}
                              {nameOf(b)}
                            </span>
                          ))}
                          {entries.length > 2 && (
                            <small>+{entries.length - 2} more</small>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {!visibleAreas.length && (
                <p className="week-empty">
                  No courts available for this selection.
                </p>
              )}
            </div>
            {visibleAreas.length > 12 && (
              <div className="actions">
                <button
                  disabled={!rowOffset}
                  onClick={() => setRowPage((p) => p - 1)}
                >
                  Previous courts
                </button>
                <span>
                  {rowOffset + 1}–
                  {Math.min(rowOffset + 12, visibleAreas.length)} of{" "}
                  {visibleAreas.length}
                </span>
                <button
                  disabled={rowOffset + 12 >= visibleAreas.length}
                  onClick={() => setRowPage((p) => p + 1)}
                >
                  More courts
                </button>
              </div>
            )}
            <div className="week-legend">
              <span>
                <i className="blocked-dot" />
                Blocked
              </span>
              <span>
                <i className="recurring-dot" />
                Weekly
              </span>
              {showCancelled && (
                <span>
                  <i className="cancelled-dot" />
                  Cancelled
                </span>
              )}
              <span>Tap a day for details</span>
            </div>
          </details>
          <div ref={detailRef} className="week-detail">
            <div className="week-detail-heading">
              <div>
                <p>
                  {focus?.area
                    ? areas.find((a) => a.id === focus.area)?.name
                    : "All courts"}
                </p>
                <h3>
                  {displayDate(focusDate)}
                  <span> · {dayBlocks.length} entries</span>
                </h3>
              </div>
              <button
                onClick={() =>
                  update({
                    date: focusDate,
                    view: "day",
                    playAreaId: focus?.area || "",
                  })
                }
              >
                Day timeline <ChevronRight size={15} />
              </button>
            </div>
            {dayBlocks.length ? (
              <VirtualList
                key={`${focusDate}-${focus?.area}`}
                items={dayBlocks}
                itemKey={(b) => `${b.court_id}-${b.id}-${b.starts_at}`}
                render={(b) => (
                  <BookingRow
                    block={b}
                    zone={
                      courts.find((c) => c.id === b.court_id)?.timezone || zone
                    }
                    allVenues={allVenues}
                  />
                )}
              />
            ) : (
              <div className="week-empty">
                <strong>No bookings for this selection</strong>
                <p>
                  Choose another day or add a booking. Availability is checked
                  when you save.
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        timelineCourt && (
          <>
            <div className="week-timeline-caption">
              <strong>{timelineCourt.name}</strong>
              {venues.length > 1 && (
                <select
                  aria-label="Timeline venue"
                  value={timelineCourt.id}
                  onChange={(e) =>
                    setFocus({ date, area: "", court: e.target.value })
                  }
                >
                  {venues.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <span>All times are local to this venue</span>
            </div>
            <Suspense fallback={<CalendarSkeleton />}>
              <Timeline
                courtId={timelineCourt.id}
                key={`${timelineCourt.id}-${date}`}
                blocks={
                  data.find((d) => d.court.id === timelineCourt.id)?.blocks ||
                  []
                }
                areas={visibleAreas.filter(
                  (a) => a.court.id === timelineCourt.id,
                )}
                date={date}
                days={1}
                zone={timelineCourt.timezone || "Asia/Colombo"}
                step={
                  (timelineCourt as { allow_half_hour_bookings?: boolean })
                    .allow_half_hour_bookings === false
                    ? 60
                    : 30
                }
              />
            </Suspense>
          </>
        )
      )}
    </section>
  );
}
function BookingRow({
  block: b,
  zone,
  allVenues,
}: {
  block: OperatorCalendarBlock;
  zone: string;
  allVenues: boolean;
}) {
  return (
    <Link
      className={`week-booking-row tone-${calendarTone(b)}`}
      to={`/bookings/${b.id}?courtId=${b.court_id}&date=${colomboDateKey(new Date(b.starts_at), zone)}&playAreaId=${b.play_area_id || ""}`}
    >
      <div className="week-booking-time">
        <strong>{displayTime(b.starts_at, zone)}</strong>
        <small>{displayTime(b.ends_at, zone)}</small>
      </div>
      <div className="week-booking-description">
        <strong>{nameOf(b)}</strong>
        <span>
          {allVenues ? `${b.court_name} · ` : ""}
          {b.play_area_name}
        </span>
        <small>
          {(isBlocked(b)
            ? "Blocked"
            : b.admin_outcome ||
              b.game_status ||
              (b.is_recurring ? "Weekly booking" : "Booked")
          ).replaceAll("_", " ")}
        </small>
      </div>
      <ChevronRight size={16} />
    </Link>
  );
}
