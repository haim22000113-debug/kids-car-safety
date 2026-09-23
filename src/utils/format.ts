import { Trip } from '../models';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** מציג משך זמן שחלף מ-startIso ועד nowMs, כ-mm:ss או hh:mm:ss. */
export function formatDuration(startIso: string, nowMs: number): string {
  const elapsedSec = Math.max(0, Math.floor((nowMs - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const s = elapsedSec % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** תאריך ושעה בפורמט DD/MM HH:mm (כמו בדוגמה בסעיף 18 - Trip History). */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTripSummary(trip: Trip): string {
  return formatDateTime(trip.startTime);
}
