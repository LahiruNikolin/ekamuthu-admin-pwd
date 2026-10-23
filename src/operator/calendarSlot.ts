// Grid coordinates are venue wall time, independent of the device's timezone.
export function slotRange(day: string, minute: number, step: number) {
  const start = Date.parse(`${day}T00:00:00Z`) + minute * 60000;
  return {
    start: new Date(start).toISOString().slice(0, 16),
    end: new Date(start + step * 60000).toISOString().slice(0, 16),
  };
}

export function slotIsEmpty(
  from: number,
  step: number,
  entries: { from: number; to: number; cancelled: boolean }[],
) {
  return !entries.some(
    (e) => !e.cancelled && e.from < from + step && e.to > from,
  );
}
