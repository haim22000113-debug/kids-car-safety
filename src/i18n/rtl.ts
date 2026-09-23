import { I18nManager } from 'react-native';

/**
 * האפליקציה מיועדת למשתמשים ישראלים - RTL ועברית הם ברירת המחדל (סעיף 22).
 *
 * הערה טכנית חשובה: React Native דורש טעינה מחדש (reload) של האפליקציה כדי ש-
 * forceRTL ייכנס לתוקף באופן מלא ב-native (iOS/Android). בפתיחה הראשונה של
 * האפליקציה נכוון את הדגל, ואם היה צריך לשנות אותו נבצע Reload אוטומטי כדי
 * שהמשתמש לא יצטרך לעשות כלום בעצמו.
 */
export function ensureRTL(): void {
  if (!I18nManager.isRTL || !I18nManager.allowRTL) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(true);
  }
}

/** true אם צריך Reload כדי שה-RTL ייכנס לתוקף (משמש ברכיב הבסיס של האפליקציה). */
export function needsRTLReload(): boolean {
  return !I18nManager.isRTL;
}
