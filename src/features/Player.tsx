import { confirmAction as confirm } from "@/confirm";
import { useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import {
  useData,
  useAction,
  adminApi,
  Page,
  Load,
  Form,
  Input,
  Select,
} from "./shared";
import type { OperatorContextValue } from "@/operator/types";
export default function Player({ selectedCourtId }: OperatorContextValue) {
  const { playerId } = useParams();
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
    <Page title={params.get("name") || "Player"}>
      <Link to="/players">Player search</Link>
      <Load query={strikes} />
      {action.feedback}
      <h3>Strike history</h3>
      {strikes.data?.map((s) => (
        <article className="feature-card" key={s.id}>
          <strong>{s.reason}</strong>
          <p>
            {s.court_name} · {new Date(s.created_at).toLocaleDateString()}
          </p>
        </article>
      ))}
      {strikes.data?.length === 0 && <p>No strikes.</p>}
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
          if (gameId && await confirm("Issue this strike?"))
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
          value={gameId}
          set={setGameId}
          options={[
            { id: "", name: "Select game" },
            ...(games.data || [])
              .filter((g) => ["completed", "no_show"].includes(g.status))
              .map((g) => ({
                id: g.id,
                name: `${g.court_name} · ${g.starts_at} · ${g.status}`,
              })),
          ]}
        />
        <Input label="Reason" value={reason} set={setReason} required />
      </Form>
    </Page>
  );
}
