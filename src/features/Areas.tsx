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
  Field,
  type RecordData,
} from "./shared";
import type { OperatorContextValue } from "@/operator/types";
const blank = {
  name: "",
  sport_types: [] as string[],
  surface: "",
  description: "",
  player_count_presets: [2, 4],
  show_in_player_app: true,
  minimum_player_booking_minutes: 30,
  blocks_play_area_ids: [] as string[],
  blocked_by_play_area_ids: [] as string[],
  unit_label: "Court",
};
export default function Areas({ selectedCourtId }: OperatorContextValue) {
  const query = useData(
    `/courts/${selectedCourtId}/play-areas`,
    !!selectedCourtId,
  );
  const sports = useData("/admin/sports");
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState("single");
  const [form, setForm] = useState<RecordData>({ ...blank });
  const [units, setUnits] = useState("Court 1\nCourt 2");
  const [presets, setPresets] = useState("2,4");
  const set = (key: string, value: unknown) =>
    setForm({ ...form, [key]: value });
  const options = (query.data || [])
    .filter(
      (a) =>
        a.id !== form.id && (!form.groupEdit || a.group_id !== form.groupEdit),
    )
    .map((a) => ({ id: a.id, name: a.name }));
  function edit(area?: RecordData, group = false) {
    setForm(
      area
        ? {
            ...blank,
            ...area,
            groupEdit: group ? area.group_id : undefined,
            name: group ? area.group_name : area.name,
          }
        : { ...blank },
    );
    setMode(group ? "group" : "single");
    setPresets((area?.player_count_presets || [2, 4]).join(","));
    setEditing(true);
  }
  async function save() {
    const counts = presets
      .split(",")
      .map(Number)
      .filter((v) => Number.isInteger(v) && v > 0);
    if (!form.name.trim() || !counts.length || (mode === "group" && !form.groupEdit && !units.trim())) {
      await action.run(async () => { throw new Error("Enter a name, valid player counts, and at least one unit for a group."); });
      return;
    }
    const payload = {
      name: form.name.trim(),
      sport_types: form.sport_types,
      surface: form.surface || null,
      description: form.description || null,
      player_count_presets: counts,
      booking_mode: "flexible",
      show_in_player_app: form.show_in_player_app,
      minimum_player_booking_minutes: Number(
        form.minimum_player_booking_minutes,
      ),
      blocks_play_area_ids: form.blocks_play_area_ids,
      blocked_by_play_area_ids: form.blocked_by_play_area_ids,
      unit_label: form.unit_label,
      unit_names: units
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
    };
    const base = `/courts/${selectedCourtId}/${mode === "group" ? "play-area-groups" : "play-areas"}`;
    const id = mode === "group" ? form.groupEdit : form.id;
    await action.run(
      () =>
        id
          ? adminApi.patch(`${base}/${id}`, payload)
          : adminApi.post(base, payload),
      "Play area saved",
      () => setEditing(false),
    );
  }
  return (
    <Page title="Play areas">
      <Load query={query} />
      {action.feedback}
      <button
        className="operator-action"
        disabled={!selectedCourtId}
        onClick={() => edit()}
      >
        Add play area or group
      </button>
      {editing && (
        <Form busy={action.busy} onSubmit={() => void save()}>
          <Select
            label="Type"
            value={mode}
            set={setMode}
            options={
              form.id
                ? [
                    {
                      id: mode,
                      name: mode === "group" ? "Group" : "Single play area",
                    },
                  ]
                : [
                    { id: "single", name: "Single play area" },
                    { id: "group", name: "Group of bookable units" },
                  ]
            }
          />
          <Input
            label="Name"
            value={form.name}
            set={(v) => set("name", v)}
            required
          />
          {mode === "group" && (
            <>
              <Input
                label="Unit label"
                value={form.unit_label}
                set={(v) => set("unit_label", v)}
                required
              />
              {!form.groupEdit && (
                <Field label="Unit names (one per line)">
                  <textarea
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                    required
                  />
                </Field>
              )}
            </>
          )}
          <Load query={sports} />
          <Checks
            label="Sports"
            options={(sports.data || []).map((s) => ({
              id: s.name,
              name: s.name,
            }))}
            value={form.sport_types}
            set={(v) => set("sport_types", v)}
          />
          <Input
            label="Surface"
            value={form.surface || ""}
            set={(v) => set("surface", v)}
          />
          <Input
            label="Description"
            value={form.description || ""}
            set={(v) => set("description", v)}
          />
          <Input
            label="Player count choices (comma separated)"
            value={presets}
            set={setPresets}
            required
          />
          <Input
            label="Minimum player booking (minutes)"
            type="number"
            min="30"
            step="30"
            value={form.minimum_player_booking_minutes}
            set={(v) => set("minimum_player_booking_minutes", v)}
          />
          <Field label="Show in player app">
            <input
              type="checkbox"
              checked={form.show_in_player_app}
              onChange={(e) => set("show_in_player_app", e.target.checked)}
            />
          </Field>
          <Checks
            label="Booking this area blocks"
            options={options}
            value={form.blocks_play_area_ids || []}
            set={(v) => set("blocks_play_area_ids", v)}
          />
          <Checks
            label="Blocked by bookings in"
            options={options}
            value={form.blocked_by_play_area_ids || []}
            set={(v) => set("blocked_by_play_area_ids", v)}
          />
          <button type="button" onClick={() => setEditing(false)}>
            Cancel editing
          </button>
        </Form>
      )}
      {query.data?.map((a) => (
        <article className="feature-card" key={a.id}>
          <h3>{a.name}</h3>
          <p>
            {a.group_name} · {a.sport_types?.join(", ")} ·{" "}
            {a.show_in_player_app === false ? "Hidden" : "Visible"}
          </p>
          <div className="actions">
            <button onClick={() => edit(a)}>Edit area</button>
            {a.group_id && (
              <button onClick={() => edit(a, true)}>Edit group</button>
            )}
            <button
              disabled={action.busy}
              onClick={async () => {
                if (
                  await confirm(
                    `Deactivate ${a.name}? Existing bookings may prevent this action.`,
                  )
                )
                  void action.run(
                    () =>
                      adminApi.delete(
                        `/courts/${selectedCourtId}/play-areas/${a.id}`,
                      ),
                    "Play area deactivated",
                  );
              }}
            >
              Deactivate
            </button>
          </div>
        </article>
      ))}
    </Page>
  );
}
