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
export default function OperatorPlayers() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const usersQuery = useQuery({
    queryKey: ["operator-users", search],
    queryFn: ({ signal }) =>
      adminApi.get<
        Array<{
          id: string;
          name: string;
          username: string;
          strike_count?: number;
        }>
      >(`/users/search?q=${encodeURIComponent(search)}`, signal),
    enabled: search.length >= 2,
  });
  const users = usersQuery.data ?? [];

  if (usersQuery.isError) return <QueryError />;

  return (
    <section className="operator-page">
      <label className="operator-search">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search players"
        />
      </label>
      <Panel title="Players" icon={<Users size={18} />}>
        {usersQuery.isLoading ? (
          <OperatorListSkeleton />
        ) : users.length === 0 ? (
          <p className="operator-muted">
            {search.length < 2
              ? "Enter at least two characters to search."
              : "No matching players found."}
          </p>
        ) : (
          <div className="operator-list">
            {users.map((user) => (
              <div key={user.id} className="operator-list-row">
                <div>
                  <Link
                    to={`/players/${user.id}?name=${encodeURIComponent(user.name)}`}
                  >
                    {user.name}
                  </Link>
                  <span>@{user.username}</span>
                </div>
                <span className="operator-pill">
                  {user.strike_count ?? 0} strikes
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </section>
  );
}
