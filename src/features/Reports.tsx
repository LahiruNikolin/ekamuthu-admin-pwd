import { useState } from "react";
import {
  useData,
  Page,
  Load,
  Select,
  Input,
  statusLabel,
  type RecordData,
} from "./shared";
import {
  colomboDateKey,
  monthBounds,
  addDays,
  localISO,
} from "@/operator/date";
import { decodeAuth } from "@/lib/auth";
import type { OperatorContextValue } from "@/operator/types";
const money = (v: number) => `LKR ${Math.round(v || 0).toLocaleString()}`;
export default function Reports({
  selectedCourtId,
  selectedCourt,
}: OperatorContextValue) {
  const zone = selectedCourt?.timezone || "Asia/Colombo";
  const [range, setRange] = useState("this_month");
  const [start, setStart] = useState(colomboDateKey(new Date(), zone));
  const [end, setEnd] = useState(start);
  const now = new Date();
  let bounds = monthBounds(now, zone);
  if (range === "last_month") {
    const first = bounds.start;
    bounds = monthBounds(new Date(addDays(first, -1) + "T12:00:00Z"), zone);
  }
  if (range === "today")
    bounds = {
      start: colomboDateKey(now, zone),
      end: colomboDateKey(now, zone),
    };
  if (range === "custom") bounds = { start, end };
  const validRange =
    range === "all_time" ||
    (/^\d{4}-\d{2}-\d{2}$/.test(bounds.start) &&
      /^\d{4}-\d{2}-\d{2}$/.test(bounds.end) &&
      bounds.start <= bounds.end);
  const platform = !selectedCourtId && decodeAuth().role === "sys_admin";
  const params = new URLSearchParams(
    range === "all_time" || !validRange
      ? { all_time: "true" }
      : {
          from: localISO(bounds.start + "T00:00", zone),
          to: new Date(
            Date.parse(localISO(addDays(bounds.end, 1) + "T00:00", zone)) - 1,
          ).toISOString(),
        },
  );
  if (!platform) params.set("court_id", selectedCourtId);
  const query = useData<RecordData>(
    `/admin/${platform ? "platform-analytics" : "analytics"}?${params}`,
    validRange && (platform || !!selectedCourtId),
  );
  const d = query.data;
  const metrics = d
    ? platform
      ? {
          "Confirmed revenue": money(d.revenue.confirmed),
          "Captured revenue": money(d.revenue.captured),
          "Potential revenue": money(d.revenue.potential),
          Occupancy: `${Math.round(d.occupancy.rate * 100)}%`,
          Users: d.totals.users,
          "Active users (30 days)": d.totals.active_users_30d,
          Venues: d.totals.courts,
          "Published venues": d.totals.active_courts,
          Games: d.totals.games_in_range,
        }
      : {
          "Confirmed revenue": money(d.revenue_confirmed),
          "Captured revenue": money(d.revenue_captured),
          "Potential revenue": money(d.revenue_potential),
          Occupancy: `${Math.round(d.occupancy_rate * 100)}%`,
          "Total times": d.total_slots,
          "Booked times": d.booked_slots,
          "Peak hour": `${d.peak_hour}:00`,
        }
    : {};
  return (
    <Page title="Analytics report" backTo="/" backLabel="Dashboard">
      <div className="filter-panel">
        <Select
          label="Period"
          value={range}
          set={setRange}
          options={[
            { id: "today", name: "Today" },
            { id: "this_month", name: "This month" },
            { id: "last_month", name: "Last month" },
            { id: "all_time", name: "All time" },
            { id: "custom", name: "Custom range" },
          ]}
        />
        {range === "custom" && (
          <>
            <Input label="From" type="date" value={start} set={setStart} />
            <Input
              label="To"
              type="date"
              min={start}
              value={end}
              set={setEnd}
            />
          </>
        )}
      </div>
      {!validRange && <p role="alert">Choose a valid start and end date.</p>}
      <Load query={query} />
      <button
        className="operator-action report-refresh"
        disabled={!validRange}
        onClick={() => void query.refetch()}
      >
        Refresh report
      </button>
      <div className="operator-grid two report-metrics">
        {Object.entries(metrics).map(([label, value]) => (
          <article className="operator-metric" key={label}>
            <span>{label}</span>
            <strong>{String(value ?? 0)}</strong>
          </article>
        ))}
      </div>
      {d && (
        <section className="feature-card report-statuses">
          <h3>Games by status</h3>
          {Object.entries(d.games_by_status as Record<string, number>).map(
            ([status, count]) => (
              <p key={status}>
                {statusLabel(status)}: {count}{" "}
                <meter
                  aria-label={statusLabel(status)}
                  min={0}
                  max={Math.max(
                    1,
                    ...Object.values(
                      d.games_by_status as Record<string, number>,
                    ),
                  )}
                  value={count}
                />
              </p>
            ),
          )}
        </section>
      )}
      {platform && d && (
        <>
          <Table
            title="Revenue by venue"
            rows={d.revenue.by_court || []}
            columns={["court_name", "revenue"]}
          />
          <Table
            title="Top venues"
            rows={d.top_courts || []}
            columns={["court_name", "game_count", "revenue"]}
          />
          <Table
            title="Growth"
            rows={d.growth || []}
            columns={["date", "new_users", "new_games"]}
          />
        </>
      )}
    </Page>
  );
}
function Table({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: RecordData[];
  columns: string[];
}) {
  const [pageOffset, setOffset] = useState(0);
  const offset = Math.min(
    pageOffset,
    Math.max(0, Math.floor((rows.length - 1) / 25) * 25),
  );
  return (
    <section className="feature-card">
      <h3>{title}</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c.replaceAll("_", " ")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(offset, offset + 25).map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c}>{String(row[c] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 25 && (
        <div className="actions">
          <button
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 25))}
          >
            Previous
          </button>
          <span>
            {offset + 1}–{Math.min(offset + 25, rows.length)} of {rows.length}
          </span>
          <button
            disabled={offset + 25 >= rows.length}
            onClick={() => setOffset(offset + 25)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
