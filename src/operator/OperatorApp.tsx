import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type React from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
  Settings as SettingsIcon,
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
import { OperatorBootScreen, OperatorListSkeleton, QueryError } from "./ui";
const OperatorDashboard = lazy(() => import("./OperatorDashboard"));
const OperatorCalendar = lazy(() => import("./OperatorCalendar"));
const OperatorVenue = lazy(() => import("./OperatorVenue"));
const OperatorPlayers = lazy(() => import("./OperatorPlayers"));

const Games = lazy(() => import("../features/Games"));
const Player = lazy(() => import("../features/Player"));
const Settings = lazy(() => import("../features/Settings"));
const Photos = lazy(() => import("../features/Photos"));
const Areas = lazy(() => import("../features/Areas"));
const Closures = lazy(() => import("../features/Closures"));
const Promotions = lazy(() => import("../features/Promotions"));
const Templates = lazy(() => import("../features/Templates"));
const Booking = lazy(() => import("../features/Booking"));
const Reports = lazy(() => import("../features/Reports"));
const Account = lazy(() => import("../features/Account"));
const Notifications = lazy(() => import("../features/Notifications"));
function useOperatorContext(): OperatorContextValue {
  const courtsQuery = useQuery({
    queryKey: ["operator-courts"],
    queryFn: () => adminApi.get<OperatorCourt[]>("/admin/courts"),
  });
  const courts = courtsQuery.data ?? [];
  const [selectedCourtId, setSelectedCourtId] = useState("");
  const location = useLocation();
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("courtId");
    if (id && courts.some((c) => c.id === id)) setSelectedCourtId(id);
  }, [location.search, courts]);

  useEffect(() => {
    if (!selectedCourtId && courts[0]?.id) setSelectedCourtId(courts[0].id);
    if (
      selectedCourtId &&
      selectedCourtId !== "__all__" &&
      courts.length > 0 &&
      !courts.some((court) => court.id === selectedCourtId)
    ) {
      setSelectedCourtId(courts[0]?.id ?? "");
    }
  }, [courts, selectedCourtId]);

  return {
    courtsLoading: courtsQuery.isLoading,
    courtsError: courtsQuery.isError,
    retryCourts: () => {
      void courtsQuery.refetch();
    },
    courts,
    selectedCourtId: selectedCourtId === "__all__" ? "" : selectedCourtId,
    selectedCourt: courts.find((court) => court.id === selectedCourtId),
    setSelectedCourtId,
  };
}

function OperatorAuthGate({ children }: { children: React.ReactNode }) {
  const isAdminSession = () => {
    const auth = decodeAuth();
    return (
      auth.isAuthenticated &&
      (auth.role === "court_admin" || auth.role === "sys_admin")
    );
  };
  const [sessionError, setSessionError] = useState("");
  const [sessionRetry, setSessionRetry] = useState(0);
  const [checking, setChecking] = useState(() => !isAdminSession());
  const [authenticated, setAuthenticated] = useState(() => isAdminSession());

  useEffect(() => {
    let alive = true;
    if (authenticated) return;
    setChecking(true);
    setSessionError("");
    refreshWebSession()
      .then((ok) => {
        if (!alive) return;
        setAuthenticated(ok && isAdminSession());
        setChecking(false);
      })
      .catch((error) => {
        if (alive) {
          setSessionError(error.message);
          setChecking(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [authenticated, sessionRetry]);

  if (checking) return <OperatorBootScreen title="Opening admin console" />;
  if (sessionError)
    return (
      <main className="operator-boot">
        <p role="alert">{sessionError}</p>
        <button onClick={() => setSessionRetry((n) => n + 1)}>
          Retry session
        </button>
      </main>
    );
  if (!authenticated)
    return (
      <Navigate
        to={
          "/login?next=" +
          encodeURIComponent(window.location.pathname + window.location.search)
        }
        replace
      />
    );
  return <>{children}</>;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
});

export default function OperatorApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <OperatorAuthGate>
        <OperatorShell />
      </OperatorAuthGate>
    </QueryClientProvider>
  );
}

function OperatorShell() {
  const client = useQueryClient();
  useEffect(() => {
    const refresh = (event: MessageEvent) => {
      if (event.data?.type === "VENUE_UPDATED") void client.invalidateQueries();
    };
    navigator.serviceWorker?.addEventListener("message", refresh);
    return () =>
      navigator.serviceWorker?.removeEventListener("message", refresh);
  }, [client]);
  const ctx = useOperatorContext();
  const location = useLocation();
  const unread = useQuery({
    queryKey: ["unread-notifications"],
    queryFn: () =>
      adminApi.get<{ total?: number; items?: unknown[] }>(
        "/notifications?unread=true&limit=1",
      ),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  return (
    <div className="operator-app">
      <header className="operator-header">
        <div>
          <p className="operator-eyebrow">Ekamuthu Admin</p>
          <h1>
            {ctx.selectedCourt?.name ??
              (ctx.courts.length ? "Select venue" : "No venue selected")}
          </h1>
        </div>
        <Link
          to="/notifications"
          className="operator-icon-button"
          aria-label={`Notifications (${unread.data?.total ?? unread.data?.items?.length ?? 0} unread)`}
        >
          <Bell size={21} />
          {unread.data?.total || ""}
        </Link>
        <Link
          to="/account"
          className="operator-icon-button"
          aria-label="Account"
        >
          <SettingsIcon size={21} />
        </Link>
      </header>

      <main
        className={`operator-main ${location.pathname === "/calendar" ? "calendar-main" : ""}`}
      >
        {location.pathname !== "/calendar" && (
          <button
            className="operator-action"
            onClick={() => void client.invalidateQueries()}
          >
            Refresh current view
          </button>
        )}
        {ctx.courtsLoading && <p role="status">Loading venues…</p>}
        {ctx.courtsError && <QueryError retry={ctx.retryCourts} />}
        {!ctx.courtsLoading && !ctx.courtsError && !ctx.courts.length && (
          <p>No venues assigned to this account. Contact your administrator.</p>
        )}
        {location.pathname !== "/calendar" && <CourtSwitcher {...ctx} />}
        <Suspense fallback={<OperatorListSkeleton />}>
          <Routes>
            <Route path="/" element={<OperatorDashboard {...ctx} />} />
            <Route
              path="/calendar"
              element={<OperatorCalendar key={ctx.selectedCourtId} {...ctx} />}
            />
            <Route path="/venue" element={<OperatorVenue {...ctx} />} />
            <Route path="/players" element={<OperatorPlayers />} />
            <Route path="/account" element={<Account />} />
            <Route
              path="/games"
              element={<Games key={ctx.selectedCourtId} {...ctx} />}
            />
            <Route
              path="/games/:gameId"
              element={<Games key={ctx.selectedCourtId} {...ctx} />}
            />
            <Route
              path="/players/:playerId"
              element={<Player key={ctx.selectedCourtId} {...ctx} />}
            />
            <Route
              path="/settings"
              element={
                ctx.selectedCourtId ? (
                  <Settings key={ctx.selectedCourtId} {...ctx} />
                ) : (
                  <p>Select a venue to continue.</p>
                )
              }
            />
            <Route
              path="/photos"
              element={
                ctx.selectedCourtId ? (
                  <Photos key={ctx.selectedCourtId} {...ctx} />
                ) : (
                  <p>Select a venue to continue.</p>
                )
              }
            />
            <Route
              path="/areas"
              element={
                ctx.selectedCourtId ? (
                  <Areas key={ctx.selectedCourtId} {...ctx} />
                ) : (
                  <p>Select a venue to continue.</p>
                )
              }
            />
            <Route
              path="/closures"
              element={
                ctx.selectedCourtId ? (
                  <Closures key={ctx.selectedCourtId} {...ctx} />
                ) : (
                  <p>Select a venue to continue.</p>
                )
              }
            />
            <Route
              path="/promotions"
              element={
                ctx.selectedCourtId ? (
                  <Promotions key={ctx.selectedCourtId} {...ctx} />
                ) : (
                  <p>Select a venue to continue.</p>
                )
              }
            />
            <Route
              path="/templates"
              element={
                ctx.selectedCourtId ? (
                  <Templates key={ctx.selectedCourtId} {...ctx} />
                ) : (
                  <p>Select a venue to continue.</p>
                )
              }
            />
            <Route
              path="/bookings/new"
              element={
                ctx.selectedCourtId ? (
                  <Booking key={ctx.selectedCourtId} {...ctx} />
                ) : (
                  <p>Select a venue to continue.</p>
                )
              }
            />
            <Route
              path="/bookings/:bookingId"
              element={
                ctx.selectedCourtId ? (
                  <Booking key={ctx.selectedCourtId} {...ctx} />
                ) : (
                  <p>Select a venue to continue.</p>
                )
              }
            />
            <Route
              path="/reports"
              element={<Reports key={ctx.selectedCourtId} {...ctx} />}
            />
            <Route
              path="/notifications"
              element={<Notifications key={ctx.selectedCourtId} {...ctx} />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <nav className="operator-tabbar" aria-label="Operator navigation">
        <OperatorTab
          to="/"
          icon={<Home />}
          label="Dashboard"
          active={location.pathname === "/"}
        />
        <OperatorTab
          to="/calendar"
          icon={<CalendarDays />}
          label="Calendar"
          active={location.pathname.startsWith("/calendar")}
        />
        <OperatorTab
          to="/venue"
          icon={<Building2 />}
          label="Venue"
          active={location.pathname.startsWith("/venue")}
        />
        <OperatorTab
          to="/players"
          icon={<Users />}
          label="Players"
          active={location.pathname.startsWith("/players")}
        />
        <OperatorTab
          to="/account"
          icon={<Menu />}
          label="Account"
          active={location.pathname.startsWith("/account")}
        />
      </nav>
    </div>
  );
}

function CourtSwitcher({
  courts,
  selectedCourtId,
  setSelectedCourtId,
}: OperatorContextValue) {
  if (courts.length <= 1 && decodeAuth().role !== "sys_admin") return null;
  return (
    <label className="operator-select">
      <span>Venue</span>
      <select
        value={selectedCourtId || "__all__"}
        onChange={(event) => setSelectedCourtId(event.target.value)}
      >
        {decodeAuth().role === "sys_admin" && (
          <option value="__all__">All venues</option>
        )}
        {courts.map((court) => (
          <option key={court.id} value={court.id}>
            {court.name}
          </option>
        ))}
      </select>
      <ChevronDown size={18} />
    </label>
  );
}

function OperatorTab({
  to,
  icon,
  label,
  active,
}: {
  to: string;
  icon: React.ReactElement;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      className={cn("operator-tab", active && "operator-tab-active")}
      to={to}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
