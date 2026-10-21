const COLOMBO_TIME_ZONE = "Asia/Colombo";

function parts(date: Date, timeZone = COLOMBO_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const values = formatter
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

export function colomboDateKey(
  date = new Date(),
  timeZone = COLOMBO_TIME_ZONE,
) {
  const p = parts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return colomboDateKey(date);
}

export function monthBounds(date = new Date(), timeZone = COLOMBO_TIME_ZONE) {
  const p = parts(date, timeZone);
  const start = `${p.year}-${String(p.month).padStart(2, "0")}-01`;
  const nextMonth = new Date(Date.UTC(p.year, p.month, 1, 12));
  const end = addDays(colomboDateKey(nextMonth), -1);
  return { start, end };
}

export function displayDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function displayTime(value: string, timeZone = COLOMBO_TIME_ZONE) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

// Convert venue wall time to an instant without depending on the browser/device timezone.
export function localISO(value: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Choose a valid date and time.");
  const target = Date.parse(value + ":00Z");
  let instant = target;
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 4; i++) {
    const actual = formatter.format(new Date(instant)).replace(" ", "T");
    const delta = target - Date.parse(actual + "Z");
    if (delta === 0) return new Date(instant).toISOString();
    instant += delta;
  }
  throw new Error("This local time does not exist in the venue timezone.");
}
export function localInput(value: string, timeZone: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
