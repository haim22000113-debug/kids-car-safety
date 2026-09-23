import { StorageKeys } from './storageKeys';
import { getItem, setItem, removeItem } from './StorageService';
import { User } from '../models';

export async function getUser(): Promise<User | null> {
  return getItem<User>(StorageKeys.USER);
}

export async function saveUser(user: User): Promise<boolean> {
  return setItem<User>(StorageKeys.USER, user);
}

export async function updateUser(patch: Partial<User>): Promise<User | null> {
  const current = await getUser();
  if (!current) return null;
  const updated: User = { ...current, ...patch };
  await saveUser(updated);
  return updated;
}

/** מחיקת כל נתוני המשתמש (Settings -> מחיקת חשבון / איפוס נתונים, סעיף 19). */
export async function clearUser(): Promise<void> {
  await removeItem(StorageKeys.USER);
}
