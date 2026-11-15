export function yearLabel(year: number | null | undefined): string | null {
  if (!year) return null;
  if (year <= 4) return `${year}${["st", "nd", "rd", "th"][year - 1]} year`;
  return year === 5 ? "5th year" : "PG";
}

export function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
