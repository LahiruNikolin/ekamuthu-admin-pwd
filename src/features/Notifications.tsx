import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useData,
  useAction,
  adminApi,
  Page,
  EmptyState,
  Load,
  type RecordData,
} from "./shared";
import { addDays, colomboDateKey, displayTime } from "@/operator/date";
import { fullDate, Pagination } from "@/operator/presentation";
import type { OperatorContextValue } from "@/operator/types";
export default function Notifications({
  courts,
  setSelectedCourtId,
}: OperatorContextValue) {
  const [offset, setOffset] = useState(0);
  const [unread, setUnread] = useState(false);
  const query = useData<RecordData>(
    `/notifications?limit=20&offset=${offset}&unread=${unread}`,
  );
  const action = useAction();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const openId = params.get("open") || "";
  const direct = useData<RecordData>(
    `/notifications/${encodeURIComponent(openId)}`,
    !!openId,
  );
  const opened = useRef("");
  useEffect(() => {
    if (direct.data && opened.current !== openId) {
      opened.current = openId;
      void open(direct.data);
    }
  }, [direct.data, openId]);
  const items = Array.isArray(query.data)
    ? query.data
    : query.data?.items || [];
  function open(n: RecordData) {
    // A delayed read receipt must not hold up opening the game.
    void action.run(() => adminApi.patch(`/notifications/${n.id}/read`), "");
    const p = n.payload || {};
    if (p.court_id) setSelectedCourtId(p.court_id);
    const game =
      p.game_id ||
      ([
        "AdminGameBooked",
        "AdminGameCancelled",
        "AdminGameNoShow",
        "AdminScheduleChanged",
        "GameCreated",
        "GameCancelled",
        "game.cancelled.schedule_change",
      ].includes(n.type)
        ? p.entity_id
        : "");
    if (game) {
      navigate(`/games/${encodeURIComponent(game)}`, { replace: !!openId });
      return;
    }
    const params = new URLSearchParams();
    if (p.court_id) params.set("courtId", p.court_id);
    if (p.play_area_id) params.set("playAreaId", p.play_area_id);
    if (p.starts_at)
      params.set(
        "date",
        colomboDateKey(
          new Date(p.starts_at),
          courts.find((c) => c.id === p.court_id)?.timezone || "Asia/Colombo",
        ),
      );
    const booking =
      p.flexible_booking_id ||
      p.reservation_id ||
      (["AdminReservationCreated", "AdminReservationReleased"].includes(n.type)
        ? p.entity_id
        : "") ||
      p.recurring_booking_id;
    if (booking) navigate(`/bookings/${booking}?${params}`);
    else navigate(`/calendar?${params}`);
  }
  return (
    <Page title="Notifications" backTo="/account" backLabel="Account">
      <div className="feed-toolbar">
        <div
          className="feed-tabs"
          role="group"
          aria-label="Notification filter"
        >
          {[false, true].map((value) => (
            <button
              key={String(value)}
              aria-pressed={unread === value}
              onClick={() => {
                setUnread(value);
                setOffset(0);
              }}
            >
              {value ? "Unread" : "All updates"}
            </button>
          ))}
        </div>
        <button
          className="text-action"
          disabled={action.busy || !items.length}
          onClick={() =>
            void action.run(
              () => adminApi.patch("/notifications/read-all"),
              "All notifications marked read",
            )
          }
        >
          Mark all read
        </button>
      </div>
      <Load query={query} />
      {openId && <Load query={direct} />}
      {action.feedback}
      <div className="notification-feed" aria-busy={action.busy}>
        {items.map((n: RecordData, i: number) => {
          const zone =
            courts.find((c) => c.id === n.payload?.court_id)?.timezone ||
            "Asia/Colombo";
          const day = colomboDateKey(new Date(n.created_at), zone);
          const today = colomboDateKey(new Date(), zone);
          const previous = items[i - 1];
          const newDay =
            !previous ||
            colomboDateKey(
              new Date(previous.created_at),
              courts.find((c) => c.id === previous.payload?.court_id)
                ?.timezone || "Asia/Colombo",
            ) !== day;
          const title =
            n.payload?.title || n.type.replace(/([a-z])([A-Z])/g, "$1 $2");
          const cancelled = /Cancelled|Released|NoShow/.test(n.type);
          return (
            <Fragment key={n.id}>
              {newDay && (
                <h3 className="feed-day">
                  {day === today
                    ? "Today"
                    : day === addDays(today, -1)
                      ? "Yesterday"
                      : fullDate(n.created_at, zone)}
                </h3>
              )}
              <button
                className={`notification-row ${!n.read_at ? "is-unread" : ""}`}
                disabled={action.busy}
                onClick={() => void open(n)}
              >
                <span
                  className={`notification-symbol ${cancelled ? "is-alert" : ""}`}
                  aria-hidden="true"
                >
                  {cancelled ? "!" : "↗"}
                </span>
                <span className="notification-content">
                  <span className="notification-title">
                    {title}
                    {!n.read_at && (
                      <span
                        className="unread-dot"
                        role="img"
                        aria-label="Unread"
                      />
                    )}
                  </span>
                  {n.payload?.body && (
                    <span className="notification-body">{n.payload.body}</span>
                  )}
                  <time
                    dateTime={n.created_at}
                    title={`${fullDate(n.created_at, zone)} · ${zone}`}
                  >
                    {displayTime(n.created_at, zone)}
                  </time>
                </span>
                <span className="row-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            </Fragment>
          );
        })}
      </div>
      {!query.isLoading && !query.isError && items.length === 0 && (
        <EmptyState
          title={unread ? "You’re all caught up" : "No notifications yet"}
        >
          {unread
            ? "There are no unread updates. Select All updates to see previous notifications."
            : "Booking updates and venue activity will appear here."}
        </EmptyState>
      )}
      <Pagination
        offset={offset}
        size={20}
        more={
          Array.isArray(query.data)
            ? items.length === 20
            : !!query.data?.has_more
        }
        set={setOffset}
      />
    </Page>
  );
}
