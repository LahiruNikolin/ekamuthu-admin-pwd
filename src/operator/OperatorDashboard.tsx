import { useEffect, useMemo, useState } from "react";
import type React from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  Home,
  LogOut,
  Menu,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { toast } from "@/Toast";
import { adminApi } from "@/api/client";
import { decodeAuth, logout, refreshWebSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  addDays,
  colomboDateKey,
  displayDate,
  displayTime,
  monthBounds,
  localISO,
} from "./date";
import type {
  OperatorAnalytics,
  OperatorCalendarBlock,
  OperatorCourt,
  OperatorGame,
  OperatorNotification,
  OperatorPlayArea,
} from "./types";

import type { OperatorContextValue } from "./types";
import {
  MetricCard,
  Panel,
  OperatorListSkeleton,
  CalendarSkeleton,
  QueryError,
} from "./ui";
export default function OperatorDashboard({
  selectedCourtId,
  selectedCourt,
}: OperatorContextValue) {
  const timeZone = selectedCourt?.timezone || "Asia/Colombo";
  const today = colomboDateKey(new Date(), timeZone);
  const month = monthBounds(new Date(), timeZone);
  const analyticsQuery = useQuery({
    queryKey: ["operator-analytics", selectedCourtId, month],
    queryFn: () =>
      adminApi.get<OperatorAnalytics>(
        `/admin/analytics?court_id=${selectedCourtId}&from=${encodeURIComponent(localISO(month.start + "T00:00", timeZone))}&to=${encodeURIComponent(new Date(Date.parse(localISO(addDays(month.end, 1) + "T00:00", timeZone)) - 1).toISOString())}`,
      ),
    enabled: !!selectedCourtId || decodeAuth().role === "sys_admin",
  });
  const gamesQuery = useQuery({
    queryKey: ["operator-games-today", selectedCourtId, today],
    queryFn: ({ signal }) =>
      adminApi.get<OperatorGame[]>(
        `/admin/games?court_id=${selectedCourtId}&date=${today}&limit=10`,
        signal,
      ),
    enabled: !!selectedCourtId || decodeAuth().role === "sys_admin",
  });
  const data = analyticsQuery.data;
  const cancelled =
    (data?.games_by_status?.cancelled ?? 0) +
    (data?.games_by_status?.no_show ?? 0);

  if (!selectedCourtId && decodeAuth().role !== "sys_admin") return null;
  if (analyticsQuery.isLoading) return <OperatorListSkeleton />;
  if (analyticsQuery.isError || gamesQuery.isError) return <QueryError />;

  return (
    <section className="operator-page">
      <nav className="actions">
        <Link to="/games">All games</Link>
        <Link to="/reports">Analytics report</Link>
        <Link to="/bookings/new">New booking</Link>
      </nav>
      <div className="operator-hero">
        <p>This month</p>
        <strong>LKR {(data?.revenue_confirmed ?? 0).toLocaleString()}</strong>
        <span>{selectedCourt?.name ?? "Venue"} booked revenue</span>
      </div>
      <div className="operator-grid two">
        <MetricCard
          label="Completed"
          value={data?.games_by_status?.completed ?? 0}
          tone="cyan"
        />
        <MetricCard label="Cancelled / no-show" value={cancelled} tone="red" />
        <MetricCard
          label="Upcoming"
          value={data?.games_by_status?.confirmed ?? 0}
          tone="blue"
        />
        <MetricCard
          label="Occupancy"
          value={`${Math.round((data?.occupancy_rate ?? 0) * 100)}%`}
          tone="green"
        />
      </div>
      <Panel title="Today’s games (latest 10)" icon={<BarChart3 size={18} />}>
        {gamesQuery.isLoading ? (
          <OperatorListSkeleton />
        ) : (gamesQuery.data ?? []).length === 0 ? (
          <p className="operator-muted">No games scheduled for today.</p>
        ) : (
          <div className="operator-list">
            {(gamesQuery.data ?? []).map((game) => (
              <div key={game.id} className="operator-list-row">
                <div>
                  <Link to={`/games/${game.id}`}>
                    {displayTime(game.starts_at, timeZone)}
                  </Link>
                  <span>{game.status.replaceAll("_", " ")}</span>
                </div>
                <span className="operator-pill">
                  {game.max_players ?? "-"} players
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </section>
  );
}
