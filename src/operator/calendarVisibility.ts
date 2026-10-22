import type { OperatorCalendarBlock } from "./types";

// Match native engagement visibility: retain real booking/game history, not obsolete generated slots.
export function isCalendarEngagement(block: OperatorCalendarBlock) {
  if (!["cancelled", "expired"].includes(block.status)) return true;
  const gameLinked =
    block.booking_type === "one_time" || !!block.locked_by_game;
  if (
    gameLinked &&
    (block.status === "cancelled" ||
      ["completed", "no_show", "cancelled"].includes(block.game_status || ""))
  )
    return true;
  return (
    block.status === "expired" &&
    block.reservation_purpose === "booking" &&
    (["expired", "admin_reservation"].includes(block.booking_type || "") ||
      block.recurring_booking_kind === "admin_reservation")
  );
}

export function isCalendarCancelled(block: OperatorCalendarBlock) {
  return block.status === "cancelled" || block.game_status === "cancelled";
}
export function isCalendarBlocked(block: OperatorCalendarBlock) {
  return (
    !block.locked_by_game &&
    block.booking_type !== "one_time" &&
    (block.status === "unavailable" || block.reservation_purpose === "block")
  );
}
// Mark both historical cancellations and their overlapping replacement bookings.
// Sorted starts and prefix maximum ends keep dense weeks O(n log n).
export function calendarRebookedBlocks(blocks: OperatorCalendarBlock[]) {
  const result = new Set<OperatorCalendarBlock>();
  const groups = new Map<string, OperatorCalendarBlock[]>();
  for (const b of blocks) {
    if (b.status === "available" || isCalendarBlocked(b)) continue;
    const key = `${b.court_id}:${b.play_area_id || ""}`;
    const group = groups.get(key) || [];
    group.push(b);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    for (const cancelled of [true, false]) {
      const candidates = group
        .filter((b) => isCalendarCancelled(b) !== cancelled)
        .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
      const ends: number[] = [];
      for (const b of candidates)
        ends.push(
          Math.max(ends[ends.length - 1] || -Infinity, Date.parse(b.ends_at)),
        );
      for (const b of group) {
        if (isCalendarCancelled(b) !== cancelled) continue;
        let lo = 0,
          hi = candidates.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (Date.parse(candidates[mid].starts_at) < Date.parse(b.ends_at))
            lo = mid + 1;
          else hi = mid;
        }
        if (lo > 0 && ends[lo - 1] > Date.parse(b.starts_at)) result.add(b);
      }
    }
  }
  return result;
}
export function calendarTone(block: OperatorCalendarBlock) {
  const status = block.admin_outcome || block.game_status || block.status;
  if (isCalendarCancelled(block) || status === "no_show") return "red";
  if (status === "completed" || status === "expired") return "blue";
  if (isCalendarBlocked(block)) return "slate";
  return "green";
}

// Flexible schedules and occupied ranges are separate records in the API. Subtract
// occupancy before presenting available time so a schedule never advertises a booking as free.
export function calendarDisplayBlocks(input: OperatorCalendarBlock[]) {
  const blocks = input.filter(isCalendarEngagement);
  const occupied = new Map<string, [number, number][]>();
  for (const b of blocks) {
    if (
      b.status === "available" ||
      b.status === "cancelled" ||
      b.game_status === "cancelled"
    )
      continue;
    const key = b.play_area_id || "";
    const ranges = occupied.get(key) || [];
    ranges.push([Date.parse(b.starts_at), Date.parse(b.ends_at)]);
    occupied.set(key, ranges);
  }
  for (const [key, ranges] of occupied) {
    ranges.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const range of ranges) {
      const previous = merged[merged.length - 1];
      if (previous && range[0] <= previous[1])
        previous[1] = Math.max(previous[1], range[1]);
      else merged.push([...range]);
    }
    occupied.set(key, merged);
  }
  return blocks
    .flatMap((b) => {
      if (b.status !== "available") return [b];
      let start = Date.parse(b.starts_at);
      const end = Date.parse(b.ends_at);
      const ranges = occupied.get(b.play_area_id || "") || [];
      const parts: OperatorCalendarBlock[] = [];
      const add = (from: number, to: number) =>
        parts.push({
          ...b,
          starts_at: new Date(from).toISOString(),
          ends_at: new Date(to).toISOString(),
        });
      // Merged ends are ordered too; locate the first overlap without scanning old ranges.
      let lo = 0,
        hi = ranges.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (ranges[mid][1] <= start) lo = mid + 1;
        else hi = mid;
      }
      for (let i = lo; i < ranges.length && ranges[i][0] < end; i++) {
        const [from, to] = ranges[i];
        if (from > start) add(start, Math.min(from, end));
        start = Math.max(start, to);
        if (start >= end) break;
      }
      if (start < end) add(start, end);
      return parts;
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
