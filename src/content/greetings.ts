/**
 * ברכות אישיות במקום "שלום" קבוע.
 *
 * הכל כאן פונקציות טהורות: השעה והאקראיות מגיעות מבחוץ, כדי שאפשר לבדוק
 * אותן בלי לחכות לשעה מסוימת ביום ובלי תוצאות שמשתנות בין הרצות.
 */

/**
 * כמה נוסחים לכל חלק של היום, כדי שהברכה לא תחזור על עצמה. בכל חלק אותו
 * מספר נוסחים - אחרת "נוסח אחר" בחלק אחד נופל על אותו נוסח בחלק קצר יותר.
 */
const GREETINGS = {
  morning: ['בוקר טוב', 'בוקר נעים', 'בוקר מקסים'],
  noon: ['צהריים טובים', 'צהריים נעימים', 'צהריים מקסימים'],
  afternoon: ['אחר הצהריים טובים', 'אחר צהריים נעים', 'אחר צהריים מקסים'],
  evening: ['ערב טוב', 'ערב נעים', 'ערב מקסים'],
  night: ['לילה טוב', 'לילה שקט', 'לילה נעים'],
} as const;

function greetingsFor(now: Date): readonly string[] {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return GREETINGS.morning;
  if (hour >= 12 && hour < 16) return GREETINGS.noon;
  if (hour >= 16 && hour < 19) return GREETINGS.afternoon;
  if (hour >= 19) return GREETINGS.evening;
  return GREETINGS.night;
}

/** המספר הגדול ביותר של נוסחים בחלק כלשהו של היום. */
export const GREETING_VARIANTS = Math.max(...Object.values(GREETINGS).map((g) => g.length));

/**
 * בוחר מספר בין 0 ל-count-1 ששונה מ-previous, כדי שאותו נוסח לא יופיע
 * פעמיים ברצף. random הוא מספר בין 0 ל-1 (Math.random).
 */
export function pickDifferent(count: number, previous: number | undefined, random: number): number {
  if (count <= 1) return 0;
  if (previous === undefined || previous < 0 || previous >= count) {
    return Math.floor(random * count) % count;
  }
  const offset = 1 + (Math.floor(random * (count - 1)) % (count - 1));
  return (previous + offset) % count;
}

/** ברכה לפי שעה ביום: "בוקר טוב", "צהריים נעימים" וכו'. */
export function timeOfDayGreeting(now: Date, variant = 0): string {
  const options = greetingsFor(now);
  return options[variant % options.length];
}

/** שורת הפתיחה במסך הבית, למשל "צהריים טובים, דנה". */
export function personalGreeting(name: string, now: Date, variant = 0): string {
  const trimmed = name.trim();
  const greeting = timeOfDayGreeting(now, variant);
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
  { solo: 'נסיעה רגועה ונעימה', group: 'נסיעה רגועה ונעימה', emoji: '😊' },
  { solo: 'העיקר להגיע בשלום', group: 'העיקר להגיע בשלום', emoji: '🏁' },
] as const;

/**
 * איזה איחול שייך לנסיעה. נבחר פעם אחת כשהנסיעה מתחילה ונשמר עליה, כך
 * שכל המסכים וההתראה מציגים את אותו איחול. לנסיעות ישנות שנשמרו לפני
 * שהשדה נוסף - נגזר משעת ההתחלה.
 */
export function wishIndexOf(trip: { wishIndex?: number; startTime: string }): number {
  if (trip.wishIndex !== undefined) return trip.wishIndex % TRIP_WISHES.length;
  return Math.floor(new Date(trip.startTime).getTime() / 60_000) % TRIP_WISHES.length;
}

/** "דנה", "דנה ויואב", "דנה, יואב ונועה". */
export function joinHebrewNames(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length <= 1) return clean.join('');
  return `${clean.slice(0, -1).join(', ')} ו${clean[clean.length - 1]}`;
}

/**
 * איחול לנסיעה, למשל "שתהיה לכם נסיעה טובה, דנה ויואב 🚗".
 *
 * שמות ילדים מועברים רק כשההורה עצמו בחר אותם לנסיעה ידנית. אסור להעביר
 * אותם מזיהוי אוטומטי: המערכת לא יודעת מי ברכב.
 */
export function tripWish(index: number, childNames: string[] = []): string {
  const wish = TRIP_WISHES[index % TRIP_WISHES.length];
  const names = joinHebrewNames(childNames);
  return names ? `${wish.group}, ${names} ${wish.emoji}` : `${wish.solo} ${wish.emoji}`;
}
