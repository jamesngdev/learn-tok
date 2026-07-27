export function relativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const min = Math.max(0, Math.floor(diffMs / 60000));
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/** 45000 -> "45.000đ" — full VND with thousand separators. */
export function formatVnd(amount: number): string {
  const n = Math.round(amount);
  const sign = n < 0 ? "-" : "";
  return sign + Math.abs(n).toLocaleString("vi-VN") + "đ";
}

/** 4500000 -> "4,5tr", 45000 -> "45k" — for totals that must fit a chip. */
export function formatVndShort(amount: number): string {
  const n = Math.round(amount);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const trim = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)}tr`;
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)}k`;
  return `${sign}${abs}đ`;
}

/** "2026-07-27" -> "27/07" */
export function formatDayShort(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

export function readTimeSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(5, Math.round(words / 3.3));
}
