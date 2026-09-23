import { AnalyticsEventName } from './events';

/**
 * מעקב אירועים בסיסי ל-MVP (סעיף 23-24).
 * שומר על עקרון הפרטיות בסעיף 20: אין שליחת מידע לצד שלישי, הכל נשאר מקומית
 * (כרגע רק לוג לצורכי פיתוח). כשיהיה צורך אמיתי במדדים אפשר להחליף מימוש זה
 * בשירות אנליטיקס חיצוני בלי לשנות את שאר האפליקציה (הקריאות תמיד עוברות דרך
 * trackEvent).
 */
export function trackEvent(name: AnalyticsEventName, props?: Record<string, unknown>): void {
  if (__DEV__) {
    console.log(`[analytics] ${name}`, props ?? {});
  }
}
