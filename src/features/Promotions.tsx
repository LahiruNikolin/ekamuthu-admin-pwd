import { confirmAction as confirm } from "@/confirm";
import { useState } from "react";
import {
  useData,
  useAction,
  adminApi,
  Page,
  Load,
  Form,
  Input,
  Checks,
  Select,
  weekDays,
  type RecordData,
} from "./shared";
import { colomboDateKey, addDays, localISO, localInput } from "@/operator/date";
import type { OperatorContextValue } from "@/operator/types";
export default function Promotions({
  selectedCourtId,
  selectedCourt,
}: OperatorContextValue) {
  const base = `/admin/courts/${selectedCourtId}/promotions`;
  const query = useData(base, !!selectedCourtId);
  const areas = useData(
    `/courts/${selectedCourtId}/play-areas`,
    !!selectedCourtId,
  );
  const action = useAction();
  const zone = selectedCourt?.timezone || "Asia/Colombo";
  const [form, setForm] = useState<RecordData | null>(null);
  const set = (key: string, value: unknown) =>
    setForm({ ...form, [key]: value });
  const today = colomboDateKey(new Date(), zone);
  return (
    <Page title="Promotions">
      <Load query={query} />
      {action.feedback}
      <button
        className="operator-action"
        onClick={() =>
          setForm({
            play_area_id: areas.data?.[0]?.id || "",
            title: "Promo price",
            promo_hourly_price: "",
            starts: today,
            ends: addDays(today, 14),
            local_start_time: "08:00",
            local_end_time: "22:00",
            weekdays: [],
          })
        }
      >
        New promotion
      </button>
      {form && (
        <Form
          busy={action.busy}
          label="Publish promotion"
          onSubmit={async () => {
            void action.run(
              () => {
                const payload = {
                  play_area_id: form.play_area_id,
                  title: form.title,
                  promo_hourly_price: Number(form.promo_hourly_price),
                  starts_at: localISO(form.starts + "T00:00", zone),
                  ends_at: localISO(form.ends + "T23:59", zone),
                  local_start_time: form.local_start_time,
                  local_end_time: form.local_end_time,
                  weekdays: form.weekdays.map(Number),
                };
                return form.id
                  ? adminApi.patch(`/admin/promotions/${form.id}`, payload)
                  : adminApi.post(base, payload);
              },
              "Promotion saved",
              () => setForm(null),
            );
          }}
        >
          <Select
            label="Play area"
            value={form.play_area_id}
            set={(v) => set("play_area_id", v)}
            options={(areas.data || []).map((a) => ({
              id: a.id,
              name: a.name,
            }))}
          />
          <Input
            label="Title"
            value={form.title}
            set={(v) => set("title", v)}
            required
          />
          <Input
            label="Promotional hourly price (LKR)"
            type="number"
            min="0"
            step="0.01"
            value={form.promo_hourly_price}
            set={(v) => set("promo_hourly_price", v)}
            required
          />
          <Input
            label="Start date"
            type="date"
            value={form.starts}
            set={(v) => set("starts", v)}
            required
          />
          <Input
            label="End date"
            type="date"
            min={form.starts}
            value={form.ends}
            set={(v) => set("ends", v)}
            required
          />
          <Input
            label="Daily start"
            type="time"
            value={form.local_start_time}
            set={(v) => set("local_start_time", v)}
            required
          />
          <Input
            label="Daily end"
            type="time"
            value={form.local_end_time}
            set={(v) => set("local_end_time", v)}
            required
          />
          <Checks
            label="Weekdays (none means every day)"
            options={weekDays}
            value={form.weekdays}
            set={(v) => set("weekdays", v)}
          />
          <button type="button" onClick={() => setForm(null)}>
            Cancel editing
          </button>
        </Form>
      )}
      {query.data?.map((p) => (
        <article className="feature-card" key={p.id}>
          <h3>
            {p.title} · {p.play_area_name}
          </h3>
          <p>
            LKR {p.promo_hourly_price}/hour · {p.status}
          </p>
          <p>
            {localInput(p.starts_at, zone)} – {localInput(p.ends_at, zone)}
          </p>
          {p.status === "active" && (
            <div className="actions">
              <button
                onClick={() =>
                  setForm({
                    ...p,
                    starts: localInput(p.starts_at, zone).slice(0, 10),
                    ends: localInput(p.ends_at, zone).slice(0, 10),
                    weekdays: (p.weekdays || []).map(String),
                    local_start_time: (p.local_start_time || "08:00").slice(
                      0,
                      5,
                    ),
                    local_end_time: (p.local_end_time || "22:00").slice(0, 5),
                  })
                }
              >
                Edit
              </button>
              <button
                disabled={action.busy}
                onClick={async () => {
                  if (await confirm("End this promotion?"))
                    void action.run(
                      () => adminApi.post(`/admin/promotions/${p.id}/end`, {}),
                      "Promotion ended",
                    );
                }}
              >
                End promotion
              </button>
            </div>
          )}
        </article>
      ))}
    </Page>
  );
}
