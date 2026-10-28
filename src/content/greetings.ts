/**
 * ברכות אישיות במקום "שלום" קבוע.
 *
 * פונקציות טהורות שמקבלות את השעה מבחוץ, כדי שאפשר לבדוק אותן בלי לחכות
 * לשעה מסוימת ביום.
 */

/** ברכה לפי שעה ביום: "בוקר טוב", "צהריים טובים" וכו'. */
export function timeOfDayGreeting(now: Date): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 16) return 'צהריים טובים';
  if (hour >= 16 && hour < 19) return 'אחר הצהריים טובים';
  if (hour >= 19 && hour < 23) return 'ערב טוב';
  return 'לילה טוב';
}

/** שורת הפתיחה במסך הבית, למשל "צהריים טובים, דנה". */
export function personalGreeting(name: string, now: Date): string {
  const trimmed = name.trim();
  const greeting = timeOfDayGreeting(now);
  return trimmed ? `${greeting}, ${trimmed}` : greeting;
}

export const TRIP_WISHES = [
  'שתהיה לך נסיעה טובה',
  'שתהיה לך נסיעה בטוחה',
  'נסיעה טובה ובטוחה',
] as const;

/**
 * איחול לנסיעה. מתחלף לפי היום כדי שלא ירגיש כמו טקסט קבוע, אבל נשאר
 * אותו איחול לאורך כל היום, כך שהוא לא קופץ בין מסכים באותה נסיעה.
 */
export function tripWish(now: Date): string {
  const dayIndex = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000
  );
  return TRIP_WISHES[dayIndex % TRIP_WISHES.length];
}
