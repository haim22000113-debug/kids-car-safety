import { config } from '../src/config';

/**
 * ציר הזמן של שרשרת ההסלמה.
 *
 * המספרים האלה נקבעו על ידי הבעלים אחרי בדיקת שטח, והם החלטה מוצרית ולא
 * פרט טכני. השיקול: מצד אחד הסלמה מהירה מדי מייצרת רעש על אירועים
 * שנגמרים בסדר, ומצד שני ילד שנשאר ברכב סגור בקיץ לא יכול לחכות.
 * הסיכון השני חמור יותר, ולכן הפער הראשון הוא ארבע דקות ולא שבע.
 *
 * הבדיקה כאן לא בודקת קוד אלא **נועלת את ההחלטה**. אם מישהו ישנה את
 * הזמנים בטעות - למשל "לעגל את המספרים" - הבדיקה תיכשל ותכריח אותו
 * לשים לב שהוא משנה התנהגות בטיחות.
 */

const minutes = (n: number) => n * 60;

describe('ציר הזמן של שרשרת ההסלמה', () => {
  it('האזהרה הראשונה נשלחת מיד', () => {
    expect(config.FIRST_WARNING_DELAY_SECONDS).toBe(0);
  });

  it('השנייה ארבע דקות אחרי הראשונה', () => {
    expect(config.SECOND_WARNING_DELAY_SECONDS).toBe(minutes(4));
  });

  it('השלישית שלוש דקות אחרי השנייה', () => {
    expect(config.ESCALATION_DELAY_SECONDS).toBe(minutes(3));
  });

  it('הרביעית חמש דקות אחרי השלישית', () => {
    expect(config.FOURTH_WARNING_DELAY_SECONDS).toBe(minutes(5));
  });

  it('ציר הזמן המצטבר הוא 0, 4, 7, 12 דקות', () => {
    const first = config.FIRST_WARNING_DELAY_SECONDS;
    const second = first + config.SECOND_WARNING_DELAY_SECONDS;
    const third = second + config.ESCALATION_DELAY_SECONDS;
    const fourth = third + config.FOURTH_WARNING_DELAY_SECONDS;

    expect([first, second, third, fourth]).toEqual([
      minutes(0),
      minutes(4),
      minutes(7),
      minutes(12),
    ]);
  });

  it('כל אזהרה מאוחרת מקודמתה', () => {
    // מגן מפני ערך שלילי או אפס שהיה גורם לשתי אזהרות להישלח יחד.
    expect(config.SECOND_WARNING_DELAY_SECONDS).toBeGreaterThan(0);
    expect(config.ESCALATION_DELAY_SECONDS).toBeGreaterThan(0);
    expect(config.FOURTH_WARNING_DELAY_SECONDS).toBeGreaterThan(0);
  });
});
