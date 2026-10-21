import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useData,
  useAction,
  adminApi,
  Page,
  Load,
  type RecordData,
} from "./shared";
import { colomboDateKey } from "@/operator/date";
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
  async function open(n: RecordData) {
    await action.run(() => adminApi.patch(`/notifications/${n.id}/read`), "");
    const p = n.payload || {};
    if (p.court_id) setSelectedCourtId(p.court_id);
    const game =
      p.game_id ||
      ([
        "AdminGameBooked",
        "AdminGameCancelled",
        "AdminGameNoShow",
        "AdminScheduleChanged",
      ].includes(n.type)
        ? p.entity_id
        : "");
    if (game) {
      navigate(`/games/${game}`);
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
    <Page title="Notifications">
      <label>
        <input
          type="checkbox"
          checked={unread}
          onChange={(e) => {
            setUnread(e.target.checked);
            setOffset(0);
          }}
        />
        Unread only
      </label>
      <Load query={query} />
      {openId && <Load query={direct} />}
      {action.feedback}
      <button
        className="operator-action"
        disabled={action.busy}
        onClick={() =>
          void action.run(
            () => adminApi.patch("/notifications/read-all"),
            "All notifications marked read",
          )
        }
      >
        Mark all read
      </button>
      {items.map((n: RecordData) => (
        <button
          className="feature-card"
          key={n.id}
          style={{ textAlign: "left" }}
          onClick={() => void open(n)}
        >
          <strong>
            {!n.read_at ? "● " : ""}
            {n.payload?.title || n.type.replace(/([a-z])([A-Z])/g, "$1 $2")}
          </strong>
          <p>{n.payload?.body}</p>
          <small>{new Date(n.created_at).toLocaleString()}</small>
        </button>
      ))}
      {items.length === 0 && <p>No notifications.</p>}
      <div className="actions">
        <button disabled={!offset} onClick={() => setOffset(offset - 20)}>
          Previous
        </button>
        <button
          disabled={!query.data?.has_more}
          onClick={() => setOffset(query.data?.next_offset ?? offset + 20)}
        >
          Next
        </button>
      </div>
    </Page>
  );
}
