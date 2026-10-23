import { confirmAction as confirm } from "@/confirm";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useData,
  useAction,
  adminApi,
  Page,
  EmptyState,
  Load,
  Form,
  Input,
  Select,
  Contact,
  statusLabel,
  type RecordData,
} from "./shared";
import type {
  OperatorContextValue,
  OperatorCourt,
  OperatorGame,
} from "@/operator/types";
import { colomboDateKey, displayTime } from "@/operator/date";
import {
  Avatar,
  fullDate,
  GameRow,
  Pagination,
  StatusBadge,
} from "@/operator/presentation";
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
  const query = useData<OperatorGame[]>(
    `/admin/games?court_id=${courtId}&status=${status}&date=${date}&limit=25&offset=${offset}`,
  );
  return (
    <Page title="Games" backTo="/" backLabel="Dashboard">
      <div className="filter-panel">
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
      </div>
      <Load query={query} />
      <div className="game-list">
        {query.data?.map((g) => (
          <GameRow
            key={g.id}
            game={g}
            timeZone={
              courts.find((c) => c.id === g.court_id)?.timezone || timeZone
            }
          />
        ))}
      </div>
      {!query.isLoading && !query.isError && query.data?.length === 0 && (
        <EmptyState title="No games in this view">
          Try a different status or date range to find a game.
        </EmptyState>
      )}
      <Pagination
        offset={offset}
        size={25}
        more={(query.data?.length ?? 0) === 25}
        set={setOffset}
      />
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
    <Page title="Game details" backTo="/games" backLabel="Games">
      <Load query={query} />
      {action.feedback}
      {g && (
        <>
          <article className="game-summary">
            <div className="section-heading">
              <span className="section-eyebrow">PLAYER GAME</span>
              <StatusBadge status={g.status} />
            </div>
            <h3>{g.court_name || "Game"}</h3>
            <p className="game-start-time">
              {displayTime(g.starts_at, timeZone)}
              <span>Start time · {timeZone}</span>
            </p>
            <p>{fullDate(g.starts_at, timeZone)}</p>
            <Link
              className="inline-link"
              to={`/calendar?date=${colomboDateKey(new Date(g.starts_at), timeZone)}&courtId=${g.court_id}`}
            >
              View in calendar →
            </Link>
            {g.cancellation_reason && (
              <div className="attention-note">
                <strong>Cancellation reason</strong>
                <p>{g.cancellation_reason}</p>
              </div>
            )}
          </article>
          <section className="surface-section">
            <header className="section-heading">
              <h3>Game organiser</h3>
            </header>
            <div className="organiser-contact">
              <Avatar name={g.creator_name} />
              <Contact
                name={g.creator_name || "Organiser"}
                phone={g.creator_phone}
              />
            </div>
          </section>
          <section className="surface-section">
            <header className="section-heading">
              <div>
                <h3>Players</h3>
                <p>
                  {
                    (g.players || []).filter(
                      (p: RecordData) => p.status === "accepted",
                    ).length
                  }{" "}
                  accepted · Up to {g.max_players}{" "}
                  {g.max_players === 1 ? "player" : "players"}
                </p>
              </div>
            </header>
            <div className="people-list">
              {g.players?.map((p: RecordData) => (
                <Link
                  className="person-row"
                  key={p.user_id}
                  to={`/players/${p.user_id}?name=${encodeURIComponent(p.name)}`}
                >
                  <Avatar name={p.name} />
                  <div>
                    <strong>{p.name}</strong>
                    {p.username && <span>@{p.username}</span>}
                    <span>
                      {statusLabel(p.role)} · {statusLabel(p.status)}
                    </span>
                    {p.strike_count > 0 && (
                      <span className="attention-note">
                        {p.strike_count} strikes
                      </span>
                    )}
                  </div>
                  <span className="row-chevron" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </div>
            {!g.players?.length && (
              <p className="operator-muted">
                No players have joined this game.
              </p>
            )}
          </section>
          {["confirmed", "ongoing"].includes(g.status) && (
            <details className="management-panel">
              <summary>Cancel game</summary>
              <p className="supporting-copy">
                Players will be notified and the booked time will be released.
              </p>
              <div className="destructive-form">
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
              </div>
            </details>
          )}
          {["ongoing", "completed"].includes(g.status) && (
            <details className="management-panel">
              <summary>Report a no-show</summary>
              <p className="supporting-copy">
                Use this when the game’s players did not attend.
              </p>
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
            </details>
          )}
          {["completed", "no_show"].includes(g.status) && (
            <details className="management-panel">
              <summary>Issue a player strike</summary>
              <p className="supporting-copy">
                Choose the player and explain what happened. The strike will be
                added to their record.
              </p>
              <Form
                busy={action.busy}
                label="Issue strike"
                onSubmit={async () => {
                  if (
                    player &&
                    (await confirm("Issue this strike to the selected player?"))
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
                  required
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
            </details>
          )}
        </>
      )}
    </Page>
  );
}
