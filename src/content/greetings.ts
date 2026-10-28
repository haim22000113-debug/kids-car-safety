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
  if (hour >= 19) return 'ערב טוב';
  return 'לילה טוב';
}

/** שורת הפתיחה במסך הבית, למשל "צהריים טובים, דנה". */
export function personalGreeting(name: string, now: Date): string {
  const trimmed = name.trim();
  const greeting = timeOfDayGreeting(now);
  return trimmed ? `${greeting}, ${trimmed}` : greeting;
}

/**
 * איחולי נסיעה. לכל אחד יש נוסח להורה לבד ("לך") ונוסח כשיש ילדים בנסיעה
 * ("לכם"). הניסוחים ניטרליים מגדרית בכוונה - אין לנו מידע על מגדר ההורה.
 */
export const TRIP_WISHES = [
  { solo: 'שתהיה לך נסיעה טובה', group: 'שתהיה לכם נסיעה טובה', emoji: '🚗' },
  { solo: 'שתהיה לך נסיעה בטוחה', group: 'שתהיה לכם נסיעה בטוחה', emoji: '🛡️' },
  { solo: 'נסיעה טובה ובטוחה', group: 'נסיעה טובה ובטוחה', emoji: '💙' },
  { solo: 'דרך צלחה', group: 'דרך צלחה', emoji: '🌤️' },
  { solo: 'שתהיה לך נסיעה נעימה', group: 'שתהיה לכם נסיעה נעימה', emoji: '🎶' },
] as const;

/** "דנה", "דנה ויואב", "דנה, יואב ונועה". */
export function joinHebrewNames(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length <= 1) return clean.join('');
  return `${clean.slice(0, -1).join(', ')} ו${clean[clean.length - 1]}`;
}

/**
 * איחול לנסיעה, למשל "שתהיה לכם נסיעה טובה, דנה ויואב 🚗".
 *
 * מתחלף לפי היום כדי שלא ירגיש כמו טקסט קבוע, אבל נשאר אותו איחול לאורך
 * כל היום, כך שהוא לא קופץ בין מסכים באותה נסיעה.
 *
 * שמות ילדים מועברים רק כשההורה עצמו בחר אותם לנסיעה ידנית. אסור להעביר
 * אותם מזיהוי אוטומטי: המערכת לא יודעת מי ברכב.
 */
export function tripWish(now: Date, childNames: string[] = []): string {
  const dayIndex = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000
  );
  const wish = TRIP_WISHES[dayIndex % TRIP_WISHES.length];
  const names = joinHebrewNames(childNames);
  return names ? `${wish.group}, ${names} ${wish.emoji}` : `${wish.solo} ${wish.emoji}`;
}
