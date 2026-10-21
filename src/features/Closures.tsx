import { confirmAction as confirm } from "@/confirm";
import { useState } from "react";
import {
  changeSummary,
  useData,
  useAction,
  adminApi,
  Page,
  Load,
  Form,
  Input,
  Checks,
  Select,
  type RecordData,
} from "./shared";
import { colomboDateKey, addDays } from "@/operator/date";
import type { OperatorContextValue } from "@/operator/types";
export default function Closures({
  selectedCourtId,
  selectedCourt,
}: OperatorContextValue) {
  const base = `/admin/courts/${selectedCourtId}/closures`;
  const query = useData(base, !!selectedCourtId);
  const areas = useData(
    `/courts/${selectedCourtId}/play-areas`,
    !!selectedCourtId,
  );
  const action = useAction();
  const tomorrow = addDays(
    colomboDateKey(new Date(), selectedCourt?.timezone || "Asia/Colombo"),
    1,
  );
  const [form, setForm] = useState<RecordData | null>(null);
  const set = (key: string, value: unknown) =>
    setForm({ ...form, [key]: value });
  return (
    <Page title="Shutdowns">
      <Load query={query} />
      {action.feedback}
      <button
        className="operator-action"
        onClick={() =>
          setForm({
            scope_type: "facility",
            play_area_ids: [],
            start_date: tomorrow,
            end_date: tomorrow,
            reason: "",
          })
        }
      >
        Create shutdown
      </button>
      {form && (
        <Form
          busy={action.busy}
          label={form.id ? "Update shutdown" : "Create shutdown"}
          onSubmit={async () => {
            if (
              form.end_date < form.start_date ||
              (form.scope_type === "play_areas" && !form.play_area_ids.length)
            ) {
              void action.run(async () => { throw new Error("Choose valid dates and at least one area for an area shutdown."); });
              return;
            }
            if (
              await confirm(
                `Close ${form.start_date} to ${form.end_date}? Future bookings in this range will be cancelled and players notified.`,
              )
            )
              void action.run(
                () =>
                  form.id
                    ? adminApi.patch(`${base}/${form.id}`, form)
                    : adminApi.post(base, form),
                result => changeSummary("Shutdown saved", result),
                () => setForm(null),
              );
          }}
        >
          <Select
            label="Scope"
            value={form.scope_type}
            set={(v) => set("scope_type", v)}
            options={[
              { id: "facility", name: "Whole facility" },
              { id: "play_areas", name: "Selected play areas" },
            ]}
          />
          {form.scope_type === "play_areas" && (
            <Checks
              label="Play areas"
              options={(areas.data || []).map((a) => ({
                id: a.id,
                name: a.name,
              }))}
              value={form.play_area_ids}
              set={(v) => set("play_area_ids", v)}
            />
          )}
          <Input
            label="Start date"
            type="date"
            value={form.start_date}
            set={(v) => set("start_date", v)}
            required
          />
          <Input
            label="End date"
            type="date"
            min={form.start_date}
            value={form.end_date}
            set={(v) => set("end_date", v)}
            required
          />
          <Input
            label="Reason"
            value={form.reason}
            set={(v) => set("reason", v)}
            required
          />
          <button type="button" onClick={() => setForm(null)}>
            Cancel editing
          </button>
        </Form>
      )}
      {query.data?.map((c) => (
        <article className="feature-card" key={c.id}>
          <h3>{c.reason}</h3>
          <p>
            {c.start_date} – {c.end_date} · {c.status}
          </p>
          <p>
            {c.scope_type === "facility"
              ? "Whole facility"
              : c.play_areas?.map((a: RecordData) => a.name).join(", ")}
          </p>
          <div className="actions">
            <button
              onClick={() =>
                setForm({
                  ...c,
                  play_area_ids:
                    c.play_areas?.map((a: RecordData) => a.id) || [],
                })
              }
            >
              Edit
            </button>
            <button
              disabled={action.busy}
              onClick={async () => {
                if (
                  await confirm(
                    "Remove shutdown? Previously cancelled games will not be restored.",
                  )
                )
                  void action.run(
                    () => adminApi.delete(`${base}/${c.id}`),
                    "Shutdown removed",
                  );
              }}
            >
              Remove
            </button>
          </div>
        </article>
      ))}
    </Page>
  );
}
