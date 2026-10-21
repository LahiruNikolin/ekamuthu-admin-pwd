import { confirmAction as confirm } from "@/confirm";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useData,
  useAction,
  adminApi,
  Page,
  Load,
  Form,
  Input,
  Select,
  Contact,
  statusLabel,
  type RecordData,
} from "./shared";
import type { OperatorContextValue, OperatorCourt } from "@/operator/types";
import { displayTime } from "@/operator/date";
export default function Games({
  selectedCourtId,
  selectedCourt,
  courts,
}: OperatorContextValue) {
  const { gameId } = useParams();
  return gameId ? (
    <Game
      gameId={gameId}
      courts={courts}
      timeZone={selectedCourt?.timezone || "Asia/Colombo"}
    />
  ) : (
    <GameList
      courtId={selectedCourtId}
      courts={courts}
      timeZone={selectedCourt?.timezone || "Asia/Colombo"}
    />
  );
}
function GameList({
  courtId,
  courts,
  timeZone,
}: {
  courtId: string;
  courts: OperatorCourt[];
  timeZone: string;
}) {
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("");
  const [offset, setOffset] = useState(0);
  const query = useData(
    `/admin/games?court_id=${courtId}&status=${status}&date=${date}&limit=25&offset=${offset}`,
  );
  return (
    <Page title="Games">
      <Select
        label="Status"
        value={status}
        set={(v) => {
          setStatus(v);
          setOffset(0);
        }}
        options={[
          "",
          "confirmed",
          "ongoing",
          "completed",
          "cancelled",
          "no_show",
        ].map((id) => ({ id, name: id ? statusLabel(id) : "All statuses" }))}
      />
      <Input
        label="Date (optional)"
        type="date"
        value={date}
        set={(v) => {
          setDate(v);
          setOffset(0);
        }}
      />
      <Load query={query} />
      {query.data?.map((g) => {
        const venueZone =
          courts.find((c) => c.id === g.court_id)?.timezone || timeZone;
        return (
          <Link className="feature-card" key={g.id} to={`/games/${g.id}`}>
            <strong>
              {g.court_name || "Game"} · {statusLabel(g.status)}
            </strong>
            <p>
              {new Date(g.starts_at).toLocaleDateString("en", {
                timeZone: venueZone,
              })}{" "}
              · {displayTime(g.starts_at, venueZone)}
            </p>
            <span>
              {g.player_count ?? g.accepted_players ?? 0}/{g.max_players}{" "}
              players
            </span>
          </Link>
        );
      })}
      {query.data?.length === 0 && <p>No games found.</p>}
      <div className="actions">
        <button disabled={!offset} onClick={() => setOffset(offset - 25)}>
          Previous
        </button>
        <button
          disabled={(query.data?.length ?? 0) < 25}
          onClick={() => setOffset(offset + 25)}
        >
          Next
        </button>
      </div>
    </Page>
  );
}
function Game({
  gameId,
  courts,
  timeZone: fallbackZone,
}: {
  gameId: string;
  courts: OperatorCourt[];
  timeZone: string;
}) {
  const query = useData<RecordData>(`/admin/games/${gameId}`);
  const action = useAction();
  const [reason, setReason] = useState("");
  const [player, setPlayer] = useState("");
  const [strike, setStrike] = useState("");
  const g = query.data;
  const timeZone =
    courts.find((c) => c.id === g?.court_id)?.timezone || fallbackZone;
  return (
    <Page title="Game details">
      <Link to="/games">All games</Link>
      <Load query={query} />
      {action.feedback}
      {g && (
        <>
          <article className="feature-card">
            <h3>
              {g.court_name} · {statusLabel(g.status)}
            </h3>
            <p>
              {new Date(g.starts_at).toLocaleDateString("en", { timeZone })} ·{" "}
              {displayTime(g.starts_at, timeZone)}
            </p>
            <Contact name={g.creator_name} phone={g.creator_phone} />
            {g.cancellation_reason && (
              <p>Cancellation: {g.cancellation_reason}</p>
            )}
          </article>
          <h3>
            Players ({g.players?.length || 0}/{g.max_players})
          </h3>
          {g.players?.map((p: RecordData) => (
            <article className="feature-card" key={p.user_id}>
              <Link
                to={`/players/${p.user_id}?name=${encodeURIComponent(p.name)}`}
              >
                {p.name} @{p.username}
              </Link>
              <p>
                {p.role} · {p.status} · {p.strike_count} strikes
              </p>
            </article>
          ))}
          {["confirmed", "ongoing"].includes(g.status) && (
            <Form
              busy={action.busy}
              label="Cancel game"
              onSubmit={async () => {
                if (await confirm("Cancel this game and notify players?"))
                  void action.run(
                    () =>
                      adminApi.patch(`/admin/games/${gameId}/cancel`, {
                        reason,
                      }),
                    "Game cancelled",
                  );
              }}
            >
              <Input
                label="Cancellation reason"
                value={reason}
                set={setReason}
                required
              />
            </Form>
          )}
          {["ongoing", "completed"].includes(g.status) && (
            <button
              className="operator-action danger"
              disabled={action.busy}
              onClick={async () => {
                if (await confirm("Mark this game as no-show?"))
                  void action.run(
                    () =>
                      adminApi.patch(`/admin/games/${gameId}/status`, {
                        status: "no_show",
                      }),
                    "Marked no-show",
                  );
              }}
            >
              Mark no-show
            </button>
          )}
          {["completed", "no_show"].includes(g.status) && (
            <Form
              busy={action.busy}
              label="Issue strike"
              onSubmit={async () => {
                if (
                  player &&
                  await confirm("Issue this strike to the selected player?")
                )
                  void action.run(
                    () =>
                      adminApi.post(`/admin/games/${gameId}/strikes`, {
                        user_id: player,
                        reason: strike,
                      }),
                    "Strike issued",
                  );
              }}
            >
              <Select
                label="Player"
                value={player}
                set={setPlayer}
                options={[
                  { id: "", name: "Select player" },
                  ...(g.players || []).map((p: RecordData) => ({
                    id: p.user_id,
                    name: p.name,
                  })),
                ]}
              />
              <Input
                label="Strike reason"
                value={strike}
                set={setStrike}
                required
              />
            </Form>
          )}
        </>
      )}
    </Page>
  );
}
