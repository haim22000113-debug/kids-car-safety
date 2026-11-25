import { Share } from 'react-native';
import * as tripStateService from './tripStateService';
import * as locationService from './locationService';
import { getEvents } from './eventLog';
import * as vehicleDetection from '../../modules/vehicle-detection';
import { eventLabel, nativeLabel, stateLabel, translateDetail } from '../content/diagnosticLabels';

/**
 * יומן התקלות כטקסט, בעברית.
 *
 * משותף למסך האבחון (הבעלים) ולכפתור "שלח דיווח על תקלה" בהגדרות (כל
 * המשתמשים, כולל הבודקים). **אין ביומנים מיקומים** - רק אירועים ושעות -
 * ולכן מותר לתת אותו לכל הורה לשתף.
 */
export async function buildLogReport(): Promise<string> {
  const fmt = (t: number) => new Date(t).toLocaleString('he-IL');
  const permissions = await locationService.getPermissions().catch(() => null);
  const tracking = await locationService.isTracking().catch(() => false);
  const nativeHistory = vehicleDetection.getHistory().slice().reverse();
  const lines = [
    'Little Shield - יומן אבחון',
    'נוצר: ' + fmt(Date.now()),
    'מצב: ' + stateLabel(tripStateService.getSnapshot().state),
    'מעקב מיקום: ' + (tracking ? 'פעיל' : 'כבוי'),
    'מיקום ברקע: ' + (permissions?.background ? 'ניתנה' : 'חסרה'),
    'זיהוי תנועה: ' +
      (vehicleDetection.isSupported() ? (vehicleDetection.isTracking() ? 'פעיל' : 'כבוי') : 'לא נתמך'),
    '',
    '=== חיישנים (גוגל) ===',
    ...nativeHistory.map(
      (e) => fmt(e.at) + ' | ' + nativeLabel(e.type) + (e.detail ? ' | ' + translateDetail(e.detail) : '')
    ),
    '',
    '=== אפליקציה ===',
    ...getEvents().map(
      (e) => fmt(e.at) + ' | ' + eventLabel(e.name) + (e.detail ? ' | ' + translateDetail(e.detail) : '')
    ),
  ];
  return lines.join(String.fromCharCode(10));
}

/**
 * פותח את חלון השיתוף של הטלפון (וואטסאפ, מייל...). Share המובנה ולא
 * ספרייה חיצונית: עובד בלי סים ובלי הרשאות.
 */
export async function shareLogReport(): Promise<void> {
  try {
    await Share.share({ message: await buildLogReport() });
  } catch {
    // ההורה ביטל את השיתוף - לא קריטי.
  }
}
