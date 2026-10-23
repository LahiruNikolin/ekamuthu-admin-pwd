import { confirmAction as confirm } from "@/confirm";
import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  useData,
  useAction,
  adminApi,
  Page,
  Load,
  Form,
  Input,
  Select,
  EmptyState,
} from "./shared";
import { fullDate, statusLabel } from "@/operator/presentation";
import { displayTime } from "@/operator/date";
import type { OperatorContextValue } from "@/operator/types";
export default function Player({
  selectedCourtId,
  selectedCourt,
}: OperatorContextValue) {
  const { playerId } = useParams();
  const zone = selectedCourt?.timezone || "Asia/Colombo";
  const [params] = useSearchParams();
  const [gameId, setGameId] = useState("");
  const [offset, setOffset] = useState(0);
  const [reason, setReason] = useState("");
  const strikes = useData(`/admin/users/${playerId}/strikes`);
  const games = useData(
    `/admin/games?court_id=${selectedCourtId}&limit=25&offset=${offset}`,
  );
  const action = useAction();
  return (
    <Page
      title={params.get("name") || "Player"}
      backTo="/players"
      backLabel="Players"
    >
      <Load query={strikes} />
      {action.feedback}
      <h3>Strike history</h3>
      {strikes.data?.map((s) => (
        <article className="feature-card" key={s.id}>
          <strong>{s.reason}</strong>
          <p>
            {s.court_name} · {fullDate(s.created_at, zone)}
          </p>
        </article>
      ))}
      {strikes.data?.length === 0 && (
        <EmptyState title="A clear record">
          This player has no recorded strikes.
        </EmptyState>
      )}
      <details className="management-panel">
        <summary>Issue a player strike</summary>
        <p className="supporting-copy">
          Choose a completed or no-show game and explain what happened.
        </p>
        <Load query={games} />
        <div className="actions">
          <button
            disabled={!offset}
            onClick={async () => {
              setOffset(Math.max(0, offset - 25));
              setGameId("");
            }}
          >
            Previous games
          </button>
          <button
            disabled={(games.data?.length || 0) < 25}
            onClick={async () => {
              setOffset(offset + 25);
              setGameId("");
            }}
          >
            More games
          </button>
        </div>
        <Form
          busy={action.busy}
          label="Issue strike"
          onSubmit={async () => {
            if (gameId && (await confirm("Issue this strike?")))
              void action.run(
                () =>
                  adminApi.post(`/admin/games/${gameId}/strikes`, {
                    user_id: playerId,
                    reason,
                  }),
                "Strike issued",
              );
          }}
        >
          <Select
            label="Completed or no-show game"
            required
            value={gameId}
            set={setGameId}
            options={[
              { id: "", name: "Select game" },
              ...(games.data || [])
                .filter((g) => ["completed", "no_show"].includes(g.status))
                .map((g) => ({
                  id: g.id,
                  name: `${g.court_name} · ${fullDate(g.starts_at, zone)} ${displayTime(g.starts_at, zone)} · ${statusLabel(g.status)}`,
                })),
            ]}
          />
          <Input label="Reason" value={reason} set={setReason} required />
        </Form>
      </details>
    </Page>
  );
}
