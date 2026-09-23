import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * עטיפה גנרית מעל AsyncStorage.
 * כל הנתונים נשמרים מקומית בלבד (סעיף 20 - Privacy: אם אין backend, שמור מקומית).
 * שגיאות קריאה/כתיבה לא מקריסות את האפליקציה (סעיף 27 - Error Handling) - הן
 * נלכדות ומוחזר ערך ברירת מחדל בטוח, יחד עם לוג לדיבוג.
 */
export async function getItem<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`[storage] נכשלה קריאה של ${key}`, error);
    return null;
  }
}

export async function setItem<T>(key: string, value: T): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`[storage] נכשלה כתיבה של ${key}`, error);
    return false;
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.warn(`[storage] נכשלה מחיקה של ${key}`, error);
  }
}
