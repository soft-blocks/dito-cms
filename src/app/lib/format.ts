const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

/** "3 minutes ago", "in 2 days", etc. Accepts epoch ms or Date. */
export function formatRelativeTime(value: number | Date): string {
  const date = typeof value === "number" ? new Date(value) : value;
  let duration = (date.getTime() - Date.now()) / 1000;
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return relativeTime.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return dateTime.format(date);
}

export function formatDateTime(value: number | Date): string {
  return dateTime.format(typeof value === "number" ? new Date(value) : value);
}

/** Human file size, e.g. 1.4 MB. */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exp);
  return `${value.toFixed(value < 10 && exp > 0 ? 1 : 0)} ${units[exp]}`;
}
