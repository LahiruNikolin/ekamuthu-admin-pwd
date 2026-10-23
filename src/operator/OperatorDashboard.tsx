import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/api/client";
import { decodeAuth } from "@/lib/auth";
import { addDays, colomboDateKey, monthBounds, localISO } from "./date";
import type {
  OperatorAnalytics,
  OperatorGame,
  OperatorContextValue,
} from "./types";
import { MetricCard, OperatorListSkeleton, QueryError } from "./ui";
import { fullDate, GameRow } from "./presentation";
export default function OperatorDashboard({
  selectedCourtId,
  selectedCourt,
  courts,
}: OperatorContextValue) {
  const timeZone = selectedCourt?.timezone || "Asia/Colombo";
  const today = colomboDateKey(new Date(), timeZone);
  const month = monthBounds(new Date(), timeZone);
  const enabled = !!selectedCourtId || decodeAuth().role === "sys_admin";
  const analytics = useQuery({
    queryKey: ["operator-analytics", selectedCourtId, month],
    queryFn: ({ signal }) =>
      adminApi.get<OperatorAnalytics>(
        `/admin/analytics?court_id=${selectedCourtId}&from=${encodeURIComponent(localISO(month.start + "T00:00", timeZone))}&to=${encodeURIComponent(new Date(Date.parse(localISO(addDays(month.end, 1) + "T00:00", timeZone)) - 1).toISOString())}`,
        signal,
      ),
    enabled,
  });
  const games = useQuery({
    queryKey: ["operator-games-today", selectedCourtId, today],
    queryFn: ({ signal }) =>
      adminApi.get<OperatorGame[]>(
        `/admin/games?court_id=${selectedCourtId}&date=${today}&limit=10`,
        signal,
      ),
    enabled,
  });
  const data = analytics.data;
  if (!enabled) return null;
  return (
    <section className="operator-page dashboard-page">
      <header className="overview-heading">
        <p className="section-eyebrow">YOUR VENUE AT A GLANCE</p>
        <h2>Dashboard</h2>
        <p>{fullDate(new Date().toISOString(), timeZone)}</p>
      </header>
      <nav className="dashboard-shortcuts" aria-label="Quick actions">
        <Link className="operator-action primary" to="/bookings/new">
          ＋ New booking
        </Link>
        <Link className="operator-action" to="/calendar">
          Open calendar <span aria-hidden="true">↗</span>
        </Link>
      </nav>
      <section className="surface-section">
        <header className="section-heading">
          <div>
            <h3>Today’s games</h3>
            <p>Latest 10 · {timeZone}</p>
          </div>
          <Link to="/games">View all →</Link>
        </header>
        {games.isLoading ? (
          <OperatorListSkeleton />
        ) : games.isError ? (
          <QueryError retry={() => void games.refetch()} />
        ) : games.data?.length ? (
          <div className="game-list">
            {[...games.data]
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
              .map((game) => (
                <GameRow
                  key={game.id}
                  game={game}
                  timeZone={
                    courts.find((c) => c.id === game.court_id)?.timezone ||
                    timeZone
                  }
                />
              ))}
          </div>
        ) : (
          <div className="quiet-state">
            <strong>A clear day ahead</strong>
            <p>
              No games scheduled for today. Check the calendar for all venue
              bookings.
            </p>
            <Link to="/calendar">View calendar →</Link>
          </div>
        )}
      </section>
      <section className="dashboard-performance">
        <header className="section-heading">
          <div>
            <h3>This month</h3>
            <p>Revenue and game activity</p>
          </div>
          <Link to="/reports">Report →</Link>
        </header>
        {analytics.isLoading ? (
          <OperatorListSkeleton />
        ) : analytics.isError ? (
          <QueryError retry={() => void analytics.refetch()} />
        ) : (
          data && (
            <>
              <div className="revenue-summary">
                <span>Confirmed revenue</span>
                <strong>
                  <small>LKR</small> {data.revenue_confirmed.toLocaleString()}
                </strong>
                <p>{selectedCourt?.name || "All venues"} · This month</p>
              </div>
              <div className="operator-grid two">
                <MetricCard
                  label="Completed games"
                  value={data.games_by_status?.completed ?? 0}
                  tone="cyan"
                />
                <MetricCard
                  label="Upcoming games"
                  value={data.games_by_status?.confirmed ?? 0}
                  tone="blue"
                />
                <MetricCard
                  label="Occupancy"
                  value={`${Math.round((data.occupancy_rate ?? 0) * 100)}%`}
                  tone="green"
                />
                <MetricCard
                  label="Cancelled / no-show"
                  value={
                    (data.games_by_status?.cancelled ?? 0) +
                    (data.games_by_status?.no_show ?? 0)
                  }
                  tone="red"
                />
              </div>
            </>
          )
        )}
      </section>
    </section>
  );
}
