import { getItem, setItem, removeItem } from './storage/StorageService';
import { StorageKeys } from './storage/storageKeys';
import { sha256Hex } from './utils/sha256';

/**
 * מסך האבחון: רק לבעלים (בקשת הבעלים, 25.11.2026).
 *
 * קודם המסך הוצג לכל מי שהתקין את ה-APK מהברקוד - כולל הבודקים, שהיו רואים
 * יומנים טכניים וכפתורי סימולציה שמפעילים אזהרות אמיתיות. עכשיו הוא מוסתר
 * בכל הבניות, ונפתח רק כך: 7 לחיצות על מספר הגרסה בתחתית ההגדרות, ואז קוד.
 * אחרי קוד נכון הטלפון זוכר (עד "נעל" במסך האבחון).
 *
 * הקוד עצמו לא נמצא כאן - רק ה-hash שלו. מי שקורא את הקוד לא יודע אותו.
 * הבעלים קיבל את הקוד בצ'אט. להחלפה: מחשבים sha256 של SALT + קוד חדש.
 */
const SALT = 'little-shield-diag-v1:';
const CODE_HASH = '9d1213da748620646ac17563eeaca63ba15f49dbc9408075f83fb3a11a4bf9b1';

/** כמה לחיצות על מספר הגרסה פותחות את חלון הקוד. */
export const DIAGNOSTICS_TAPS = 7;

export function isDiagnosticsCode(code: string): boolean {
  return sha256Hex(SALT + code.trim()) === CODE_HASH;
}

export async function isDiagnosticsUnlocked(): Promise<boolean> {
  return (await getItem<boolean>(StorageKeys.DIAGNOSTICS_UNLOCKED)) === true;
}

/** מחזיר true אם הקוד נכון (ואז הטלפון זוכר). */
export async function unlockDiagnostics(code: string): Promise<boolean> {
  if (!isDiagnosticsCode(code)) return false;
  await setItem(StorageKeys.DIAGNOSTICS_UNLOCKED, true);
  return true;
}

export async function lockDiagnostics(): Promise<void> {
  await removeItem(StorageKeys.DIAGNOSTICS_UNLOCKED);
}
