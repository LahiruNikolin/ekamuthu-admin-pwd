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
export default function OperatorVenue({
  selectedCourtId,
  selectedCourt,
}: OperatorContextValue) {
  const playAreasQuery = useQuery({
    queryKey: ["operator-venue-play-areas", selectedCourtId],
    queryFn: () =>
      adminApi.get<OperatorPlayArea[]>(`/courts/${selectedCourtId}/play-areas`),
    enabled: !!selectedCourtId,
  });
  const templatesQuery = useQuery({
    queryKey: ["operator-templates", selectedCourtId],
    queryFn: () =>
      adminApi.get<unknown[]>(`/admin/courts/${selectedCourtId}/templates`),
    enabled: !!selectedCourtId,
  });
  const closuresQuery = useQuery({
    queryKey: ["operator-closures", selectedCourtId],
    queryFn: () =>
      adminApi.get<unknown[]>(`/admin/courts/${selectedCourtId}/closures`),
    enabled: !!selectedCourtId,
  });

  if (!selectedCourtId)
    return (
      <section className="feature-empty">
        <h3>Choose a venue to manage</h3>
        <p>
          Select an individual venue in Settings to manage its play areas and
          pricing.
        </p>
        <Link className="operator-action" to="/settings">
          Open settings
        </Link>
      </section>
    );
  if (
    playAreasQuery.isLoading ||
    templatesQuery.isLoading ||
    closuresQuery.isLoading
  )
    return <OperatorListSkeleton />;
  if (playAreasQuery.isError || templatesQuery.isError || closuresQuery.isError)
    return <QueryError />;

  return (
    <section className="operator-page">
      <header className="venue-page-heading">
        <p className="week-eyebrow">VENUE MANAGEMENT</p>
        <h2>Make your venue work for you</h2>
        <p>Manage your spaces, schedule and player experience.</p>
      </header>
      <nav className="venue-tools" aria-label="Venue management">
        {[
          ["/areas", "Play areas", "Courts, spaces & visibility", "▦"],
          ["/templates", "Schedules & pricing", "Opening hours & rates", "◷"],
          ["/closures", "Shutdowns", "Holidays & maintenance", "⊘"],
          ["/photos", "Photos", "Your venue’s first impression", "▧"],
          ["/promotions", "Promotions", "Special prices & offers", "%"],
          ["/settings", "Settings", "Venue, booking rules & location", "⚙"],
          ["/games", "Games", "Players & game activity", "◉"],
          ["/reports", "Reports", "Revenue & occupancy", "▥"],
        ].map(([to, title, description, icon]) => (
          <Link key={to} to={to}>
            <span aria-hidden="true">{icon}</span>
            <div>
              <strong>{title}</strong>
              <small>{description}</small>
            </div>
            <b aria-hidden="true">›</b>
          </Link>
        ))}
      </nav>
      <Panel title="Venue status" icon={<Building2 size={18} />}>
        <div className="operator-list-row">
          <div>
            <strong>{selectedCourt?.name ?? "Venue"}</strong>
            <span>
              {selectedCourt?.is_active === false ? "Draft" : "Published"}
            </span>
          </div>
          <span className="operator-pill">
            {selectedCourt?.timezone ?? "Asia/Colombo"}
          </span>
        </div>
      </Panel>
      <div className="operator-grid two">
        <MetricCard
          label="Play areas"
          value={playAreasQuery.data?.length ?? 0}
          tone="green"
        />
        <MetricCard
          label="Templates"
          value={templatesQuery.data?.length ?? 0}
          tone="blue"
        />
        <MetricCard
          label="Closures"
          value={closuresQuery.data?.length ?? 0}
          tone="red"
        />
        <MetricCard label="Mode" value="Flexible" tone="cyan" />
      </div>
      <Panel title="Play areas" icon={<Building2 size={18} />}>
        {playAreasQuery.isLoading ? (
          <OperatorListSkeleton />
        ) : (
          <div className="operator-list">
            {(playAreasQuery.data ?? []).map((area) => (
              <div key={area.id} className="operator-list-row">
                <div>
                  <strong>{area.name}</strong>
                  <span>
                    {area.sport_types?.join(", ") || "Sport"} ·{" "}
                    {area.surface || "Surface not set"}
                  </span>
                </div>
                <span className="operator-pill">
                  {area.show_in_player_app === false ? "Hidden" : "Visible"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </section>
  );
}
