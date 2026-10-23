export type Entry = {
  start_time: string;
  end_time: string;
  start_day_offset: number;
  end_day_offset: number;
  price: number;
  sort_order: number;
};
const mins = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const start = (e: Entry) => e.start_day_offset * 1440 + mins(e.start_time);
const end = (e: Entry) => e.end_day_offset * 1440 + mins(e.end_time);

export function normalize(entries: Entry[], hourly: boolean) {
  if (!entries.length) throw new Error("Add at least one time range.");
  const out = entries.map((entry, i) => {
    const e = { ...entry, start_time: entry.start_time.slice(0, 5), end_time: entry.end_time.slice(0, 5), sort_order: i };
    const label = `Range ${i + 1}: `;
    const clock = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
    if (!clock(e.start_time) || !clock(e.end_time) || ![0, 1].includes(e.start_day_offset) || ![0, 1].includes(e.end_day_offset))
      throw new Error(label + "Enter valid opening and closing times.");
    if (end(e) <= start(e))
      throw new Error(label + "Closing time must follow opening time. For overnight hours, choose Following day.");
    if (hourly) e.price = Math.round(e.price * (end(e) - start(e)) / 60 * 100) / 100;
    if (!Number.isFinite(e.price) || e.price < 0)
      throw new Error(label + "Enter a valid price of zero or more.");
    return e;
  });
  let previous: Entry | undefined;
  for (const e of [...out].sort((a, b) => start(a) - start(b))) {
    if (previous && start(e) < end(previous))
      throw new Error(`Ranges ${previous.sort_order + 1} and ${e.sort_order + 1} overlap. Adjust their times.`);
    previous = e;
  }
  return out;
}

// Repeat opening days across a week boundary; offsets remain relative to each opening day.
export function validateWeek(weekday: Entry[] = [], weekend: Entry[] = []) {
  const ranges: { start: number; end: number; label: string }[] = [];
  for (let day = 0; day < 9; day++) {
    const isWeekday = day % 7 < 5;
    for (const [i, e] of (isWeekday ? weekday : weekend).entries())
      ranges.push({ start: day * 1440 + start(e), end: day * 1440 + end(e), label: `${isWeekday ? "Weekdays" : "Weekends"} range ${i + 1}` });
  }
  ranges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++)
    if (ranges[i].start < ranges[i - 1].end)
      throw new Error(`${ranges[i - 1].label} overlaps ${ranges[i].label} on the next opening day. Adjust overnight hours.`);
}

export type Template = { day_type: string; entries: Entry[]; activations?: { play_area_id: string }[] };
export function validateAssignment(candidates: Template[], existing: Template[] = [], ids: string[] = []) {
  const check = (members: Template[]) => {
    const rows = (type: string) => {
      const t = members.find((m) => m.day_type === type);
      return t ? normalize(t.entries, false) : [];
    };
    validateWeek(rows("weekday"), rows("weekend"));
  };
  check(candidates);
  for (const id of new Set(ids))
    check([...candidates, ...existing.filter((m) => !candidates.some((c) => c.day_type === m.day_type) && m.activations?.some((a) => a.play_area_id === id))]);
}
