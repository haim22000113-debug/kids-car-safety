import { I18nManager, Platform } from 'react-native';

/**
 * האפליקציה מיועדת למשתמשים ישראלים - RTL ועברית הם ברירת המחדל (סעיף 22).
 *
 * ה-RTL נדלק בצד הנייטיב, לפני שהאפליקציה עולה, דרך expo-localization
 * (`forcesRTL` ב-app.json). כך הממשק מימין לשמאל כבר בפתיחה הראשונה.
 * הקריאה כאן היא רק גיבוי: forceRTL מ-JavaScript נכנס לתוקף רק בפתיחה הבאה.
 */
export function ensureRTL(): void {
  if (!I18nManager.isRTL || !I18nManager.allowRTL) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(true);
  }
}

/**
 * יישור טקסט לצד ימין של המסך.
 *
 * למה לא פשוט textAlign: 'right': כשהאפליקציה במצב RTL, React Native הופך
 * את 'left' ו-'right' של רכיב Text (באנדרואיד ובאייפון), ו-'right' נוחת
 * בצד **שמאל**. זה בדיוק הבאג שגרם לעברית להיראות "הפוכה". הקבוע הזה
 * מיישר לימין בפועל, בין אם ה-RTL דלוק ובין אם לא.
 */
export const TEXT_RIGHT: 'left' | 'right' = I18nManager.isRTL ? 'left' : 'right';

/**
 * אותו דבר עבור שדה הקלדה (TextInput). באנדרואיד שדה הקלדה **לא** הופך
 * את הכיוון, ולכן שם 'right' נשאר 'right'. באייפון הוא כן הופך.
 */
export const INPUT_RIGHT: 'left' | 'right' = Platform.OS === 'ios' ? TEXT_RIGHT : 'right';
