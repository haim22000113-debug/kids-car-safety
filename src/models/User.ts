import { Child } from './Child';
import { EmergencyContact } from './EmergencyContact';

// זמני ברירת מחדל לתזכורות בדקות, לפי סעיף 13. ניתן לשנות ב-Settings.
export interface ReminderSettings {
  firstReminderMinutes: number;
  secondReminderMinutes: number;
  thirdReminderMinutes: number;
  /**
   * כמה דקות אחרי תחילת נסיעה נזכיר להורה שהנסיעה עדיין פעילה.
   * סוגר את המקרה שבו ההורה יוצא מהרכב ופשוט שוכח ללחוץ "סיים נסיעה",
   * ולכן מסך בדיקת הבטיחות לעולם לא מוצג.
   *
   * שים לב: השדה נוסף אחרי שכבר היו משתמשים עם נתונים שמורים, ולכן הוא
   * עשוי להיות undefined אצל משתמש ותיק. תמיד לגשת אליו דרך
   * getTripActiveReminderMinutes() שמחזירה ברירת מחדל במקרה כזה.
   */
  tripActiveReminderMinutes: number;
  soundEnabled: boolean;
}

export const DEFAULT_TRIP_ACTIVE_REMINDER_MINUTES = 15;

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  firstReminderMinutes: 0,
  secondReminderMinutes: 2,
  thirdReminderMinutes: 5,
  tripActiveReminderMinutes: DEFAULT_TRIP_ACTIVE_REMINDER_MINUTES,
  soundEnabled: true,
};

// מצב "הילדים לא איתי" (סעיף 16). scope=null כאשר המצב לא פעיל.
export interface ChildrenNotWithMeState {
  active: boolean;
  scope: 'trip' | 'day' | null;
  setAt?: string; // ISO timestamp - מתי המצב הופעל (רלוונטי בעיקר ל-scope='day')
}

export const DEFAULT_CHILDREN_NOT_WITH_ME_STATE: ChildrenNotWithMeState = {
  active: false,
  scope: null,
};

export interface UserSettings {
  reminders: ReminderSettings;
  childrenNotWithMe: ChildrenNotWithMeState;
  /**
   * האם ההגנה האוטומטית מופעלת.
   *
   * ברירת המחדל היא כן, וההורה יכול לכבות אותה בהגדרות. הסיבה שזה קיים:
   * הורה שמקבל אזהרות שווא ואין לו כפתור כיבוי - מסיר את האפליקציה.
   * עדיף שיכבה את ההגנה האוטומטית וישאר עם המצב הידני.
   *
   * השדה אופציונלי כי הוא נוסף אחרי שכבר היו משתמשים עם נתונים שמורים.
   * תמיד לגשת אליו דרך isAutoProtectionEnabled().
   */
  autoProtectionEnabled?: boolean;
}

/** ברירת המחדל היא הגנה דלוקה, כולל אצל משתמש ותיק שהשדה חסר אצלו. */
export function isAutoProtectionEnabled(settings: UserSettings): boolean {
  return settings.autoProtectionEnabled !== false;
}

export interface User {
  id: string;
  name: string;
  children: Child[];
  emergencyContact?: EmergencyContact;
  settings: UserSettings;
  onboardingCompleted: boolean;
}

export function createDefaultUser(name: string): User {
  return {
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    children: [],
    emergencyContact: undefined,
    settings: {
      reminders: { ...DEFAULT_REMINDER_SETTINGS },
      childrenNotWithMe: { ...DEFAULT_CHILDREN_NOT_WITH_ME_STATE },
      autoProtectionEnabled: true,
    },
    onboardingCompleted: false,
  };
}
