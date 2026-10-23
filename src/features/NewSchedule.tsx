import { useRef, useState } from "react";
import { normalize, validateAssignment, type Template, type Entry } from "./schedule";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "@/Toast";
import { confirmAction as confirm } from "@/confirm";
import {
  useData,
  useAction,
  adminApi,
  Page,
  Load,
  Form,
  Input,
  Select,
  type RecordData,
} from "./shared";
import type { OperatorContextValue } from "@/operator/types";
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
  hourly,
}: {
  title: string;
  value: Entry[];
  set: (v: Entry[]) => void;
  hourly: boolean;
}) {
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("22:00");
  const [duration, setDuration] = useState("60");
  const [price, setPrice] = useState("0");
  function change(i: number, field: keyof Entry, v: string) {
    set(
      value.map((e, n) =>
        n === i
          ? {
              ...e,
              [field]: field.includes("time")
                ? v
                : field === "price" && !v
                  ? NaN
                  : Number(v),
            }
          : e,
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
    <section className="schedule-hours">
      <h3>{title}</h3>
      {!hourly && (
        <details>
          <summary>Quick fill time ranges</summary>
          <Input
            label="Opening time"
            type="time"
            value={start}
            set={setStart}
          />
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
      )}
      {!value.length && (
        <p className="form-hint">
          No opening hours yet. Add a time range to continue.
        </p>
      )}
      {value.map((e, i) => (
        <div className="feature-card schedule-range" key={i}>
          <div className="schedule-range-label">Time range {i + 1}</div>
          <div className="schedule-time-pair">
            <Input
              label="Opening time"
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
          </div>
          <div className="schedule-time-pair">
            <Input
              label="Closing time"
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
          </div>
          <Input
            label={hourly ? "Hourly rate (LKR)" : "Range price (LKR)"}
            type="number"
            min="0"
            step="0.01"
            value={Number.isFinite(e.price) ? e.price : ""}
            set={(v) => change(i, "price", v)}
            required
          />
          <button
            type="button"
            onClick={() => set(value.filter((_, n) => n !== i))}
          >
            Remove time range
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          set([
            ...value,
            {
              ...initial(),
              ...(hourly ? { start_time: "", end_time: "", price: NaN } : {}),
            },
          ])
        }
      >
        ＋ Add time range
      </button>
    </section>
  );
}
export default function NewSchedule(ctx: OperatorContextValue) {
  const { templateId } = useParams();
  const query = useData(
    `/admin/courts/${ctx.selectedCourtId}/templates`,
    !!templateId,
  );
  const members = (query.data || []).filter(
    (m) => (m.template_group_id || m.id) === templateId,
  );
  return (
    <Page
      title={templateId ? "Edit template" : "New template"}
      backTo="/templates"
      backLabel="Templates"
    >
      {templateId && (query.isLoading || query.isError) ? (
        <Load query={query} />
      ) : templateId && !members.length ? (
        <p>
          This template is no longer available.{" "}
          <Link to="/templates">Return to templates</Link>
        </p>
      ) : (
        <ScheduleForm
          key={templateId || "new"}
          {...ctx}
          members={members}
          templates={(query.data || []) as Template[]}
          templateId={templateId}
        />
      )}
    </Page>
  );
}
function ScheduleForm({
  selectedCourtId,
  selectedCourt,
  members,
  templateId,
  templates,
}: OperatorContextValue & { members: RecordData[]; templates: Template[]; templateId?: string }) {
  const navigate = useNavigate();
  const feedback = useRef<HTMLDivElement>(null);
  const action = useAction();
  const [error, setError] = useState("");
  const [name, setName] = useState(members[0]?.name || "");
  const [mode, setMode] = useState(
    members.length === 1 ? members[0].day_type : "paired",
  );
  const fresh = () => ({ ...initial(), price: templateId ? 0 : NaN });
  const [weekday, setWeekday] = useState<Entry[]>(
    members.find((m) => m.day_type === "weekday")?.entries || [fresh()],
  );
  const [weekend, setWeekend] = useState<Entry[]>(
    members.find((m) => m.day_type === "weekend")?.entries || [fresh()],
  );
  const base = `/admin/courts/${selectedCourtId}`;
  return (
    <div className="booking-create schedule-create">
      <div className="booking-context">
        <span className="booking-context-dot" />
        <strong>{selectedCourt?.name}</strong>
        <span>{selectedCourt?.timezone?.replaceAll("_", " ")} time</span>
      </div>
      <div ref={feedback}>
        {error && <p role="alert" className="error">{error}</p>}
        {action.feedback}
      </div>
      <Form
        busy={action.busy}
        label={templateId ? "Save changes" : "Save template"}
        onSubmit={async () => {
          setError("");
          const paired = mode === "paired";
          let payload;
          try {
            if (!name.trim()) throw new Error("Give this template a name.");
            const rows = (paired ? ["weekday", "weekend"] : [mode]).map((day_type) => ({
              day_type,
              entries: normalize(day_type === "weekday" ? weekday : weekend, !templateId),
            }));
            validateAssignment(rows, templates, members.flatMap((m) => m.activations?.map((a: RecordData) => a.play_area_id) || []));
            payload = paired
              ? { name: name.trim(), weekend_pricing_mode: "custom", weekday_entries: rows[0].entries, weekend_entries: rows[1].entries }
              : { name: name.trim(), ...rows[0] };
          } catch (e) {
            setError((e as Error).message);
            feedback.current?.scrollIntoView({ block: "center" });
            return;
          }
          if (
            templateId &&
            !(await confirm("Apply template changes? Conflicting future bookings may be cancelled and prices updated."))
          ) return;
          let savedId = templateId;
          const saved = await action.run(
            () => {
              const path = `${base}/${paired ? "template-sets" : "templates"}${templateId ? "/" + templateId : ""}`;
              return templateId
                ? adminApi.patch(path, payload)
                : adminApi.post(path, payload);
            },
            (result) => {
              savedId = result?.group_id || result?.id || templateId;
              return "Template saved";
            },
            () => {
              toast.success(
                templateId
                  ? "Template updated"
                  : "Template saved. Choose Activate to apply it to play areas.",
              );
              navigate("/templates", { state: { savedSchedule: savedId } });
            },
          );
          if (!saved) feedback.current?.scrollIntoView({ block: "center" });
        }}
      >
        <section className="booking-section">
          <div className="form-section-heading">
            <span>1</span>
            <div>
              <h3>Template basics</h3>
              <p>A clear name helps your team choose the right template.</p>
            </div>
          </div>
          <Input
            label="Template name"
            placeholder="e.g. Regular opening hours"
            value={name}
            set={setName}
            required
          />
          {!templateId && (
            <Select
              label="Days covered"
              value={mode}
              set={setMode}
              options={[
                { id: "paired", name: "Weekdays & weekends" },
                { id: "weekday", name: "Weekdays only" },
                { id: "weekend", name: "Weekends only" },
              ]}
            />
          )}
        </section>
        <section className="booking-section">
          <div className="form-section-heading">
            <span>2</span>
            <div>
              <h3>Opening hours & prices</h3>
              <p>
                {templateId
                  ? "Update your existing time ranges and prices."
                  : "Set an hourly rate for each opening range. Add another range for breaks or peak pricing."}
              </p>
            </div>
          </div>
          {mode !== "weekend" && (
            <Entries
              title="Weekdays · Mon–Fri"
              value={weekday}
              set={setWeekday}
              hourly={!templateId}
            />
          )}
          {mode === "paired" && (
            <button
              type="button"
              className="schedule-copy"
              onClick={async () => {
                if (
                  weekend.some((e) => Number.isFinite(e.price)) &&
                  !(await confirm(
                    "Replace weekend hours and prices with weekdays?",
                  ))
                )
                  return;
                setWeekend(weekday.map((e) => ({ ...e })));
                toast.success("Weekday hours and prices copied");
              }}
            >
              Copy weekday hours & prices to weekends
            </button>
          )}
          {mode !== "weekday" && (
            <Entries
              title="Weekends · Sat–Sun"
              value={weekend}
              set={setWeekend}
              hourly={!templateId}
            />
          )}
          <p className="form-hint">
            For overnight hours, set the closing day to Following day. Times
            follow the venue’s timezone.
          </p>
        </section>
        <section className="booking-section">
          <div className="form-section-heading">
            <span>3</span>
            <div>
              <h3>Review & save</h3>
              <p>
                {templateId
                  ? "Changes apply to this template’s assigned play areas."
                  : "Saving creates a reusable template. Activate it on the next screen when you’re ready."}
              </p>
            </div>
          </div>
          <div className="schedule-review">
            <strong>{name.trim() || "Your new template"}</strong>
            {[
              ["Weekdays", weekday, mode !== "weekend"],
              ["Weekends", weekend, mode !== "weekday"],
            ].map(
              ([label, rows, show]) =>
                show && (
                  <div key={label as string}>
                    <h4>{label as string}</h4>
                    {(rows as Entry[]).map((e, i) => (
                      <p key={i}>
                        <span>
                          {e.start_time}
                          {e.start_day_offset ? " +1 day" : ""} – {e.end_time}
                          {e.end_day_offset ? " +1 day" : ""}
                        </span>
                        <strong>
                          {Number.isFinite(e.price)
                            ? `LKR ${e.price.toLocaleString()}${templateId ? " / range" : " / hr"}`
                            : "Set a price"}
                        </strong>
                      </p>
                    ))}
                  </div>
                ),
            )}
          </div>
        </section>
      </Form>
      <Link className="booking-cancel" to="/templates">
        Cancel and return to templates
      </Link>
    </div>
  );
}
