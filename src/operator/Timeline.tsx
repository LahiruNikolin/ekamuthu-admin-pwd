import { calendarTone } from "./calendarVisibility";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addDays, colomboDateKey, displayTime, localISO } from "./date";
import type { OperatorCalendarBlock, OperatorPlayArea } from "./types";
// Native browser scrolling, with rows and columns limited to the viewport.
// Bookings are indexed by lane once per response; no gesture or animation engine.
export default function Timeline({
  courtId,
  blocks,
  areas,
  date,
  days,
  zone,
  step,
}: {
  courtId: string;
  blocks: OperatorCalendarBlock[];
  areas: OperatorPlayArea[];
  date: string;
  days: number;
  zone: string;
  step: number;
}) {
  const navigate = useNavigate();
  const [scroll, setScroll] = useState({ row: 0, col: 0 });
  const [density, setDensity] = useState(48);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<
    Record<string, { play_area_id: string; starts_at: string; ends_at: string }>
  >({});
  const width = 160;
  const rows = days === 1 ? (32 * 60) / step : (24 * 60) / step;
  const lanes = useMemo(
    () =>
      Array.from({ length: days }, (_, d) =>
        areas.map((a) => ({
          id: `${d}-${a.id}`,
          area: a,
          date: addDays(date, d),
          start: Date.parse(localISO(addDays(date, d) + "T00:00", zone)),
        })),
      ).flat(),
    [areas, date, days, zone],
  );
  const indexed = useMemo(
    () =>
      lanes.map((lane) =>
        blocks.filter(
          (b) =>
            b.play_area_id === lane.area.id &&
            Date.parse(b.ends_at) > lane.start &&
            Date.parse(b.starts_at) < lane.start + rows * step * 60000,
        ),
      ),
    [lanes, blocks, rows, step],
  );
  const firstRow = Math.max(0, scroll.row - 2),
    lastRow = Math.min(rows, scroll.row + Math.ceil(528 / density) + 3);
  const firstCol = Math.max(0, scroll.col - 1),
    lastCol = Math.min(lanes.length, scroll.col + 5);
  function pick(lane: (typeof lanes)[number], row: number) {
    const item = {
      play_area_id: lane.area.id,
      starts_at: new Date(lane.start + row * step * 60000).toISOString(),
      ends_at: new Date(lane.start + (row + 1) * step * 60000).toISOString(),
    };
    if (selecting) {
      const key = `${lane.id}-${row}`;
      setSelected((prev) => {
        const next = { ...prev };
        if (next[key]) delete next[key];
        else next[key] = item;
        return next;
      });
    } else
      navigate(`/bookings/new?courtId=${courtId}&date=${lane.date}`, {
        state: { items: [item] },
      });
  }
  return (
    <>
      <div className="actions">
        <button onClick={() => setDensity(density === 48 ? 72 : 48)}>
          {density === 48 ? "Larger blocks" : "Compact blocks"}
        </button>
        <button
          onClick={() => {
            setSelecting(!selecting);
            setSelected({});
          }}
        >
          {selecting ? "Cancel selection" : "Select multiple times"}
        </button>
        {selecting && (
          <button
            disabled={!Object.keys(selected).length}
            onClick={() =>
              navigate(`/bookings/new?courtId=${courtId}&date=${date}`, {
                state: { items: Object.values(selected) },
              })
            }
          >
            Book/block {Object.keys(selected).length} ranges
          </button>
        )}
      </div>
      <p className="operator-muted">
        Tap an empty time to choose a booking range. The server checks
        availability when saved. Swipe across for other areas or days.
      </p>
      <div
        className="timeline"
        tabIndex={0}
        role="region"
        aria-label="Booking timeline"
        onScroll={(e) => {
          const t = e.currentTarget;
          const row = Math.floor(t.scrollTop / density),
            col = Math.floor(t.scrollLeft / width);
          setScroll((prev) =>
            prev.row === row && prev.col === col ? prev : { row, col },
          );
        }}
      >
        <div
          style={{
            height: rows * density + 48,
            width: Math.max(1, lanes.length) * width + 52,
            position: "relative",
          }}
        >
          <div className="timeline-headings">
            {lanes.slice(firstCol, lastCol).map((lane, n) => {
              const col = firstCol + n;
              return (
                <div
                  key={lane.id}
                  className="timeline-heading"
                  style={{ left: 52 + col * width, width }}
                >
                  {lane.area.name}
                  <small>{lane.date}</small>
                </div>
              );
            })}
          </div>
          {Array.from(
            { length: Math.max(0, lastRow - firstRow) },
            (_, i) => firstRow + i,
          ).map((row) => (
            <div
              key={row}
              className="timeline-time"
              style={{ top: 48 + row * density, height: density }}
            >
              {String(Math.floor((row * step) / 60) % 24).padStart(2, "0")}:
              {String((row * step) % 60).padStart(2, "0")}
              {row * step >= 1440 ? "+1" : ""}
            </div>
          ))}
          {lanes.slice(firstCol, lastCol).flatMap((lane, n) => {
            const col = firstCol + n;
            return Array.from(
              { length: Math.max(0, lastRow - firstRow) },
              (_, i) => firstRow + i,
            ).map((row) => (
              <button
                key={`${lane.id}-${row}`}
                className="timeline-cell"
                aria-label={`Choose ${lane.area.name} ${lane.date} ${Math.floor((row * step) / 60)}:${String((row * step) % 60).padStart(2, "0")}`}
                aria-pressed={!!selected[`${lane.id}-${row}`]}
                style={{
                  top: 48 + row * density,
                  left: 52 + col * width,
                  width,
                  height: density,
                  background: selected[`${lane.id}-${row}`]
                    ? "#bbf7d0"
                    : undefined,
                }}
                onClick={() => pick(lane, row)}
              />
            ));
          })}
          {lanes.slice(firstCol, lastCol).flatMap((lane, n) => {
            const col = firstCol + n;
            return indexed[col]
              .filter(
                (b) =>
                  b.status !== "available" &&
                  Date.parse(b.ends_at) >
                    lane.start + firstRow * step * 60000 &&
                  Date.parse(b.starts_at) < lane.start + lastRow * step * 60000,
              )
              .map((b) => {
                const start = Math.max(
                    0,
                    (Date.parse(b.starts_at) - lane.start) / 60000 / step,
                  ),
                  end = Math.min(
                    rows,
                    (Date.parse(b.ends_at) - lane.start) / 60000 / step,
                  );
                return (
                  <Link
                    key={`${lane.id}-${b.id}-${b.starts_at}`}
                    to={`/bookings/${b.id}?courtId=${courtId}&date=${colomboDateKey(new Date(b.starts_at), zone)}&playAreaId=${b.play_area_id || ""}`}
                    className={`timeline-booking tone-${calendarTone(b)}`}
                    style={{
                      left: 54 + col * width,
                      top: 48 + start * density,
                      width: width - 4,
                      height: Math.max(24, (end - start) * density - 2),
                    }}
                  >
                    <strong>
                      {b.admin_contact_name ||
                        b.booking_creator?.name ||
                        b.reservation_note ||
                        b.booking_type ||
                        b.status}
                    </strong>
                    <small>
                      {displayTime(b.starts_at, zone)}–
                      {displayTime(b.ends_at, zone)}
                    </small>
                    <small>
                      {b.admin_outcome || b.game_status || b.status}
                    </small>
                  </Link>
                );
              });
          })}
        </div>
      </div>
    </>
  );
}
