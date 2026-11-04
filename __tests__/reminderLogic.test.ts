import {
  getReminderDefs,
  getTripStartNotificationDefs,
  getTripActiveReminderMinutes,
  isReminderDeadlinePassed,
} from '../src/notifications/reminderLogic';
import { DEFAULT_REMINDER_SETTINGS, ReminderSettings } from '../src/models';

// בדיקות #7-8 מסעיף 29: תוכן התזכורות, ומצב No Response.
describe('getReminderDefs', () => {
  it('מחזיר 3 תזכורות עם הטקסטים מסעיף 13', () => {
    const defs = getReminderDefs(DEFAULT_REMINDER_SETTINGS);
    expect(defs).toHaveLength(3);
    expect(defs[0].body).toBe('בדקת שהילדים יצאו מהרכב?');
    expect(defs[1].body).toBe('חשוב לבדוק את הרכב עכשיו.');
    expect(defs[2].body).toBe('לא התקבלה תגובה. בדוק את הרכב.');
  });

  it('הראשונה עדינה, השתיים שאחריה בעוצמת אזעקה', () => {
    // בדיקת שטח: הורה שהתעלם מהתזכורת הראשונה לא שמע את הבאות, כי כולן
    // היו צליל קצר רגיל. אם מישהו מחזיר אותן לעדינות - הבדיקה נכשלת.
    const defs = getReminderDefs(DEFAULT_REMINDER_SETTINGS);
    expect(defs.map((d) => d.urgent)).toEqual([false, true, true]);
  });

  it('משתמש בזמנים מההגדרות ולא בערכים קבועים', () => {
    const custom = { ...DEFAULT_REMINDER_SETTINGS, firstReminderMinutes: 1, secondReminderMinutes: 3, thirdReminderMinutes: 10 };
    const defs = getReminderDefs(custom);
    expect(defs.map((d) => d.minutes)).toEqual([1, 3, 10]);
  });
});

describe('isReminderDeadlinePassed', () => {
  const endTime = new Date('2026-01-01T12:00:00Z').toISOString();

  it('false לפני שעברו כל התזכורות', () => {
    const now = new Date('2026-01-01T12:03:00Z').getTime(); // 3 דקות אחרי הסיום
    expect(isReminderDeadlinePassed(endTime, 5, now)).toBe(false);
  });

  it('true אחרי שעברו כל התזכורות בלי תגובה (מצב No Response)', () => {
    const now = new Date('2026-01-01T12:06:00Z').getTime(); // 6 דקות אחרי הסיום
    expect(isReminderDeadlinePassed(endTime, 5, now)).toBe(true);
  });
});

// התראת תחילת נסיעה + תזכורת "שכחת לסיים נסיעה".
describe('getTripActiveReminderMinutes', () => {
  it('מחזיר את הערך מההגדרות כשהוא תקין', () => {
    const settings = { ...DEFAULT_REMINDER_SETTINGS, tripActiveReminderMinutes: 25 };
    expect(getTripActiveReminderMinutes(settings)).toBe(25);
  });

  it('נופל לברירת מחדל אצל משתמש ותיק ששמר הגדרות לפני שהשדה נוסף', () => {
    // מדמה נתונים שנשמרו בגרסה קודמת של האפליקציה - בלי השדה החדש.
    const legacy = {
      firstReminderMinutes: 0,
      secondReminderMinutes: 2,
      thirdReminderMinutes: 5,
      soundEnabled: true,
    } as unknown as ReminderSettings;
    expect(getTripActiveReminderMinutes(legacy)).toBe(15);
  });

  it('נופל לברירת מחדל גם על ערך לא הגיוני', () => {
    const broken = { ...DEFAULT_REMINDER_SETTINGS, tripActiveReminderMinutes: 0 };
    expect(getTripActiveReminderMinutes(broken)).toBe(15);
  });
});

describe('getTripStartNotificationDefs', () => {
  it('מחזיר התראה מיידית שנשארת בשורת ההתראות, ואחריה תזכורת', () => {
    const defs = getTripStartNotificationDefs(DEFAULT_REMINDER_SETTINGS);
    expect(defs).toHaveLength(2);

    // ההתראה המיידית: נשלחת מיד (0 דקות), נשארת על המסך, ובלי צליל.
    expect(defs[0].minutes).toBe(0);
    expect(defs[0].sticky).toBe(true);
    expect(defs[0].useSound).toBe(false);
    expect(defs[0].body).toContain('הנסיעה החלה');
    expect(defs[0].title).toBe('נסיעה פעילה');
    expect(getTripStartNotificationDefs(DEFAULT_REMINDER_SETTINGS, 'דרך צלחה 🌤️')[0].title).toBe('דרך צלחה 🌤️');

    // התזכורת: אחרי 15 דקות כברירת מחדל, ומזכירה לבדוק את הרכב.
    expect(defs[1].minutes).toBe(15);
    expect(defs[1].body).toContain('הילדים יצאו מהרכב');
  });

  it('מכבד זמן תזכורת מותאם אישית מההגדרות', () => {
    const settings = { ...DEFAULT_REMINDER_SETTINGS, tripActiveReminderMinutes: 40 };
    expect(getTripStartNotificationDefs(settings)[1].minutes).toBe(40);
  });
});
