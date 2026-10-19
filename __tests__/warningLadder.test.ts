import { config } from '../src/config';

/**
 * ציר הזמן של ההסלמה.
 *
 * המספרים האלה הם החלטה מוצרית של הבעלים ולא פרט טכני: אם ההורה לא
 * אישר שראה את ההתראות תוך שתי דקות, מתקשרים לאיש הקשר.
 *
 * הבדיקה לא בודקת קוד אלא **נועלת את ההחלטה**. מי שמשנה את הזמנים
 * בטעות - למשל "לעגל" אותם - יראה אותה נכשלת ויבין שהוא משנה התנהגות
 * בטיחות.
 */

const callAt =
  config.FIRST_WARNING_DELAY_SECONDS +
  config.SECOND_WARNING_DELAY_SECONDS +
  config.ESCALATION_DELAY_SECONDS +
  config.CALL_COUNTDOWN_SECONDS;

describe('ציר הזמן של ההסלמה', () => {
  it('האזהרה הראשונה נשלחת מיד', () => {
    expect(config.FIRST_WARNING_DELAY_SECONDS).toBe(0);
  });

  it('האזעקה מגיעה דקה אחרי הראשונה', () => {
    expect(config.SECOND_WARNING_DELAY_SECONDS).toBe(60);
  });

  it('השיחה לאיש הקשר יוצאת בדיוק שתי דקות אחרי הזיהוי', () => {
    expect(callAt).toBe(120);
  });

  it('יש ספירה לאחור לפני השיחה, כדי שאפשר יהיה לבטל', () => {
    expect(config.CALL_COUNTDOWN_SECONDS).toBeGreaterThanOrEqual(5);
  });

  it('האזעקה מגיעה לפני הספירה לאחור', () => {
    expect(config.ESCALATION_DELAY_SECONDS).toBeGreaterThan(0);
  });
});
