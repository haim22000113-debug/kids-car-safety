import * as Updates from 'expo-updates';
import { APP_ENV } from './config';

/**
 * האם להציג את מסך האבחון.
 *
 * היה כאן קודם תנאי אחד בלבד: `APP_ENV === 'development'`. המשמעות הייתה
 * שהמסך נעלם בכל בנייה אמיתית - כולל בנייה פנימית שנועדה בדיוק לבדיקות
 * שטח. בפעם הראשונה שהבעלים התקין APK ורצה לראות מה המערכת מזהה, הכפתור
 * פשוט לא היה שם.
 *
 * עכשיו הוא מוצג גם בבניות הפנימיות (ערוץ preview), ומוסתר רק בבנייה
 * שמיועדת לחנות. הורה רגיל לעולם לא יראה אותו.
 */
export function isDiagnosticsEnabled(): boolean {
  if (APP_ENV === 'development') return true;

  try {
    // הערוץ נקבע ב-eas.json לפי פרופיל הבנייה.
    return Updates.channel === 'preview';
  } catch {
    // expo-updates לא זמין בהקשר הזה - לא סיבה להקריס מסך הגדרות.
    return false;
  }
}
