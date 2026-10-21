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
  Select,
  Checks,
  type RecordData,
} from "./shared";
import type { OperatorContextValue } from "@/operator/types";
type Entry = {
  start_time: string;
  end_time: string;
  start_day_offset: number;
  end_day_offset: number;
  price: number;
  sort_order: number;
};
const initial = (): Entry => ({
  start_time: "08:00",
  end_time: "22:00",
  start_day_offset: 0,
  end_day_offset: 0,
  price: 0,
  sort_order: 0,
});
function Entries({
  title,
  value,
  set,
}: {
  title: string;
  value: Entry[];
  set: (v: Entry[]) => void;
}) {
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("22:00");
  const [duration, setDuration] = useState("60");
  const [price, setPrice] = useState("0");
  function change(i: number, field: keyof Entry, v: string) {
    set(
      value.map((e, n) =>
        n === i ? { ...e, [field]: field.includes("time") ? v : Number(v) } : e,
      ),
    );
  }
  function fill() {
    const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    let stop = mins(end);
    if (stop <= mins(start)) stop += 1440;
    const step = Number(duration);
    if (step < 30 || !Number.isFinite(step)) return;
    const format = (v: number) =>
      `${String(Math.floor((v % 1440) / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
    const rows: Entry[] = [];
    for (let n = mins(start); n < stop; n += step)
      rows.push({
        start_time: format(n),
        end_time: format(Math.min(stop, n + step)),
        start_day_offset: Math.floor(n / 1440),
        end_day_offset: Math.floor(Math.min(stop, n + step) / 1440),
        price: Number(price),
        sort_order: rows.length,
      });
    set(rows);
  }
  return (
    <section>
      <h3>{title}</h3>
      <details>
        <summary>Quick fill schedule</summary>
        <Input label="Opening time" type="time" value={start} set={setStart} />
        <Input label="Closing time" type="time" value={end} set={setEnd} />
        <Input
          label="Interval minutes"
          type="number"
          min="30"
          step="30"
          value={duration}
          set={setDuration}
        />
        <Input
          label="Price per entry (LKR)"
          type="number"
          min="0"
          value={price}
          set={setPrice}
        />
        <button type="button" onClick={fill}>
          Fill entries
        </button>
      </details>
      {value.map((e, i) => (
        <div className="feature-card" key={i}>
          <Input
            label={`Entry ${i + 1} start`}
            type="time"
            value={e.start_time.slice(0, 5)}
            set={(v) => change(i, "start_time", v)}
            required
          />
          <Select
            label="Start day"
            value={String(e.start_day_offset)}
            set={(v) => change(i, "start_day_offset", v)}
            options={[
              { id: "0", name: "Opening day" },
              { id: "1", name: "Following day" },
            ]}
          />
          <Input
            label={`Entry ${i + 1} end`}
            type="time"
            value={e.end_time.slice(0, 5)}
            set={(v) => change(i, "end_time", v)}
            required
          />
          <Select
            label="End day"
            value={String(e.end_day_offset)}
            set={(v) => change(i, "end_day_offset", v)}
            options={[
              { id: "0", name: "Opening day" },
              { id: "1", name: "Following day" },
            ]}
          />
          <Input
            label="Price (LKR)"
            type="number"
            min="0"
            step="0.01"
            value={e.price}
            set={(v) => change(i, "price", v)}
            required
          />
          <button
            type="button"
            onClick={() => set(value.filter((_, n) => n !== i))}
          >
            Remove entry
          </button>
        </div>
      ))}
      <button type="button" onClick={() => set([...value, initial()])}>
        Add entry
      </button>
    </section>
  );
}
export default function Templates({ selectedCourtId }: OperatorContextValue) {
  const base = `/admin/courts/${selectedCourtId}`;
  const query = useData(`${base}/templates`, !!selectedCourtId);
  const areas = useData(
    `/courts/${selectedCourtId}/play-areas`,
    !!selectedCourtId,
  );
  const action = useAction();
  const [form, setForm] = useState<RecordData | null>(null);
  const [weekday, setWeekday] = useState<Entry[]>([]);
  const [weekend, setWeekend] = useState<Entry[]>([]);
  const [activation, setActivation] = useState<RecordData | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const sets: RecordData[] = [];
  const seen = new Set<string>();
  for (const t of query.data || []) {
    const id = t.template_group_id || t.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const members = (query.data || []).filter(
      (m) => (m.template_group_id || m.id) === id,
    );
    sets.push({ id, name: t.name, members, paired: members.length === 2 });
  }
  function edit(set?: RecordData) {
    const members: RecordData[] = set?.members || [];
    setForm({
      id: set?.id,
      name: set?.name || "",
      mode: set ? (set.paired ? "paired" : members[0].day_type) : "paired",
    });
    setWeekday(
      members.find((t) => t.day_type === "weekday")?.entries || [initial()],
    );
    setWeekend(
      members.find((t) => t.day_type === "weekend")?.entries || [initial()],
    );
  }
  function normalize(entries: Entry[]) {
    const out = entries.map((e, i) => ({
      ...e,
      start_time: e.start_time.slice(0, 5),
      end_time: e.end_time.slice(0, 5),
      sort_order: i,
    }));
    const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const sorted = [...out].sort(
      (a, b) =>
        a.start_day_offset * 1440 +
        mins(a.start_time) -
        (b.start_day_offset * 1440 + mins(b.start_time)),
    );
    let end = -1;
    for (const e of sorted) {
      const start = e.start_day_offset * 1440 + mins(e.start_time),
        finish = e.end_day_offset * 1440 + mins(e.end_time);
      if (start < end || finish <= start)
        throw new Error(
          "Schedule entries overlap or have an invalid end time.",
        );
      end = finish;
    }
    if (!out.length) throw new Error("Add at least one entry.");
    return out;
  }
  return (
    <Page title="Schedules & pricing">
      <Load query={query} />
      {action.feedback}
      <button className="operator-action" onClick={() => edit()}>
        New schedule
      </button>
      {form && (
        <Form
          busy={action.busy}
          onSubmit={async () => {
            if (
              form.id &&
              !await confirm(
                "Apply schedule changes? Conflicting future bookings may be cancelled and prices updated.",
              )
            )
              return;
            void action.run(
              () => {
                const paired = form.mode === "paired";
                const path = `${base}/${paired ? "template-sets" : "templates"}${form.id ? "/" + form.id : ""}`;
                const payload = paired
                  ? {
                      name: form.name,
                      weekend_pricing_mode: "custom",
                      weekday_entries: normalize(weekday),
                      weekend_entries: normalize(weekend),
                    }
                  : {
                      name: form.name,
                      day_type: form.mode,
                      entries: normalize(
                        form.mode === "weekday" ? weekday : weekend,
                      ),
                    };
                return form.id
                  ? adminApi.patch(path, payload)
                  : adminApi.post(path, payload);
              },
              result => changeSummary("Schedule saved", result),
              () => setForm(null),
            );
          }}
        >
          <Input
            label="Schedule name"
            value={form.name}
            set={(name) => setForm({ ...form, name })}
            required
          />
          {!form.id && (
            <Select
              label="Schedule type"
              value={form.mode}
              set={(mode) => setForm({ ...form, mode })}
              options={[
                { id: "paired", name: "Weekday and weekend" },
                { id: "weekday", name: "Weekday only" },
                { id: "weekend", name: "Weekend only" },
              ]}
            />
          )}
          {form.mode !== "weekend" && (
            <Entries title="Weekdays" value={weekday} set={setWeekday} />
          )}
          {form.mode !== "weekday" && (
            <Entries title="Weekends" value={weekend} set={setWeekend} />
          )}
          <button type="button" onClick={() => setForm(null)}>
            Cancel editing
          </button>
        </Form>
      )}
      {activation && (
        <Form
          busy={action.busy}
          label={activation.active ? "Activate" : "Suspend"}
          onSubmit={async () => {
            if (
              !ids.length ||
              !await confirm(
                activation.active
                  ? "Activate for these areas? Existing schedules may be replaced and affected games notified or cancelled."
                  : "Suspend this schedule for these areas?",
              )
            )
              return;
            void action.run(
              async () => {
                const totals: RecordData = {};
                for (const m of activation.members) {
                  const result = await adminApi.patch<RecordData>(`${base}/templates/${m.id}/active`, {
                    is_active: activation.active,
                    play_area_ids: ids,
                  });
                  for (const key of ["created", "skipped", "cancelled_games", "price_notified_games", "replaced_templates"]) totals[key] = (totals[key] || 0) + (result?.[key] || 0);
                }
                return totals;
              },
              result => changeSummary("Activation updated", result),
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
      )}
      {sets.map((t) => (
        <article className="feature-card" key={t.id}>
          <h3>{t.name}</h3>
          {t.members.map((m: RecordData) => (
            <p key={m.id}>
              {m.day_type} · {m.entries?.length} entries ·{" "}
              {m.activations
                ?.map((a: RecordData) => a.play_area_name)
                .join(", ") || "Not active"}
            </p>
          ))}
          <div className="actions">
            <button onClick={() => edit(t)}>Edit</button>
            <button
              onClick={async () => {
                setActivation({ ...t, active: true });
                setIds([]);
              }}
            >
              Activate
            </button>
            <button
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
                if (await confirm("Delete this schedule?"))
                  void action.run(async () => {
                    for (const m of t.members)
                      await adminApi.delete(`${base}/templates/${m.id}`);
                  }, "Schedule deleted");
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
