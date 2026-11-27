/**
 * Format a Date as a local calendar date string (`YYYY-MM-DD`) using the
 * user's local timezone rather than UTC (`toISOString()`), preventing
 * off-by-one-day shifts around midnight.
 */
export function toLocalDateStr(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
