import * as fs from 'fs';
import * as path from 'path';

/**
 * בדיקת שטח: נרשם מעבר מסוג ON_FOOT, שגוגל לא תומכת בו במעברים. גוגל
 * דחתה את כל הבקשה - כולל כניסה ויציאה מרכב - ואף נסיעה לא זוהתה.
 * הבדיקה קוראת את קובץ ה-Kotlin ומוודאת שנרשמים רק סוגים נתמכים.
 */
const SUPPORTED = new Set(['IN_VEHICLE', 'ON_BICYCLE', 'RUNNING', 'STILL', 'WALKING']);

describe('רישום מעברים מול גוגל', () => {
  const file = path.join(
    __dirname,
    '../modules/vehicle-detection/android/src/main/java/com/kidscarsafety/vehicledetection/VehicleTracking.kt'
  );
  const source = fs.readFileSync(file, 'utf8');
  const types = [...source.matchAll(/setActivityType\(DetectedActivity\.([A-Z_]+)\)/g)].map((m) => m[1]);

  it('נרשמים רק סוגים שגוגל תומכת בהם', () => {
    expect(types.length).toBeGreaterThan(0);
    expect(types.filter((t) => !SUPPORTED.has(t))).toEqual([]);
  });

  it('כניסה ויציאה מרכב תמיד ברישום', () => {
    expect(types.filter((t) => t === 'IN_VEHICLE')).toHaveLength(2);
  });
});
