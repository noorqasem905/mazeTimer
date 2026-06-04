export function formatTimeMs(timeMs: number | null | undefined): string {
  if (timeMs === null || timeMs === undefined) return "--";
  return (timeMs / 1000).toFixed(2) + " s";
}

export function formatStopwatch(timeMs: number): string {
  const date = new Date(timeMs);
  const m = date.getUTCMinutes().toString().padStart(2, '0');
  const s = date.getUTCSeconds().toString().padStart(2, '0');
  const ms = Math.floor(date.getUTCMilliseconds() / 10).toString().padStart(2, '0');
  return `${m}:${s}.${ms}`;
}
