import { validateAssignment, type Template } from "./schedule";
import { confirmAction as confirm } from "@/confirm";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  changeSummary,
  useData,
  useAction,
  adminApi,
  Page,
  Load,
  Form,
  Checks,
  type RecordData,
} from "./shared";
import type { OperatorContextValue } from "@/operator/types";
export default function Templates({ selectedCourtId }: OperatorContextValue) {
  const base = `/admin/courts/${selectedCourtId}`;
  const query = useData(`${base}/templates`, !!selectedCourtId);
  const areas = useData(
    `/courts/${selectedCourtId}/play-areas`,
    !!selectedCourtId,
  );
  const action = useAction();
  const savedId = (useLocation().state as { savedSchedule?: string } | null)
    ?.savedSchedule;
  const revealed = useRef("");
  const activationPanel = useRef<HTMLDivElement>(null);
  const [activation, setActivation] = useState<RecordData | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const card = savedId && document.getElementById(`schedule-${savedId}`);
    if (card && revealed.current !== savedId) {
      card.scrollIntoView({ block: "center" });
      revealed.current = savedId!;
    }
  }, [savedId, query.data]);
  useEffect(() => {
    if (activation) activationPanel.current?.scrollIntoView({ block: "start" });
  }, [activation]);
  const sets: RecordData[] = [];
  const seen = new Set<string>();
  for (const t of query.data || []) {
    const id = t.template_group_id || t.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const members = (query.data || []).filter(
      (m) => (m.template_group_id || m.id) === id,
    );
    sets.push({
      id,
      name: t.name,
      members,
      paired: members.length === 2,
      activeMembers: members.filter((m) => m.activations?.length).length,
    });
  }
  sets.sort(
    (a, b) => Number(b.activeMembers > 0) - Number(a.activeMembers > 0),
  );
  return (
    <Page title="Price templates">
      <Load query={query} />
      {action.feedback}
      <Link className="operator-action primary" to="/templates/new">
        ＋ New template
      </Link>
      {activation && (
        <div ref={activationPanel} className="schedule-activation-panel">
          <Form
            busy={action.busy}
            label={activation.active ? "Activate" : "Suspend"}
            onSubmit={async () => {
              if (
                !ids.length ||
                !(await confirm(
                  activation.active
                    ? "Activate for these areas? Existing templates may be replaced and affected games notified or cancelled."
                    : "Suspend this template for these areas?",
                ))
              )
                return;
              void action.run(
                async () => {
                  if (activation.active) validateAssignment(activation.members, query.data as Template[], ids);
                  const totals: RecordData = {};
                  for (const m of activation.members) {
                    const result = await adminApi.patch<RecordData>(
                      `${base}/templates/${m.id}/active`,
                      {
                        is_active: activation.active,
                        play_area_ids: ids,
                      },
                    );
                    for (const key of [
                      "created",
                      "skipped",
                      "cancelled_games",
                      "price_notified_games",
                      "replaced_templates",
                    ])
                      totals[key] = (totals[key] || 0) + (result?.[key] || 0);
                  }
                  return totals;
                },
                (result) => changeSummary("Activation updated", result),
                () => setActivation(null),
              );
            }}
          >
            <Checks
              label="Play areas"
              options={(areas.data || []).map((a) => ({
                id: a.id,
                name: a.name,
              }))}
              value={ids}
              set={setIds}
            />
            <button type="button" onClick={() => setActivation(null)}>
              Cancel
            </button>
          </Form>
        </div>
      )}
      {sets.map((t) => (
        <article
          id={`schedule-${t.id}`}
          className={`feature-card template-card ${t.activeMembers ? "is-active" : ""} ${savedId === t.id ? "is-recent" : ""}`}
          key={t.id}
        >
          <div className="template-card-heading">
            <h3>{t.name}</h3>
            <span
              className={`template-status ${t.activeMembers ? "is-active" : ""}`}
            >
              {t.activeMembers === t.members.length
                ? "Currently active"
                : t.activeMembers
                  ? "Partly active"
                  : "Not active"}
            </span>
          </div>
          {t.members.map((m: RecordData) => (
            <section className="template-member" key={m.id}>
              <div>
                <strong>{m.day_type.replaceAll("_", " ")}</strong>
                <span>
                  {m.activations?.length ? "Active" : "Not active"} ·{" "}
                  {m.entries?.length || 0} time ranges
                </span>
              </div>
              {m.activations?.length ? (
                <div className="template-area-tags">
                  {m.activations.map((a: RecordData) => (
                    <span key={a.play_area_id}>{a.play_area_name}</span>
                  ))}
                </div>
              ) : (
                <p>No play areas assigned</p>
              )}
            </section>
          ))}
          <div className="actions">
            <Link to={`/templates/${t.id}/edit`}>Edit</Link>
            <button
              disabled={action.busy || !!t.activeMembers}
              onClick={async () => {
                setActivation({ ...t, active: true });
                setIds([]);
              }}
            >
              Activate
            </button>
            <button
              disabled={action.busy || !t.activeMembers}
              onClick={async () => {
                setActivation({ ...t, active: false });
                setIds([
                  ...new Set<string>(
                    t.members.flatMap(
                      (m: RecordData) =>
                        m.activations?.map((a: RecordData) => a.play_area_id) ||
                        [],
                    ),
                  ),
                ]);
              }}
            >
              Suspend
            </button>
            <button
              disabled={action.busy}
              onClick={async () => {
                if (await confirm("Delete this template?"))
                  void action.run(async () => {
                    for (const m of t.members)
                      await adminApi.delete(`${base}/templates/${m.id}`);
                  }, "Template deleted");
              }}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
    </Page>
  );
}
