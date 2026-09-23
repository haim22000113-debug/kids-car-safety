import { getItem, setItem } from './StorageService';
import { StorageKeys } from './storageKeys';

/**
 * גרסת האזהרה שההורה אישר.
 * אם נשנה בעתיד את נוסח האזהרה בצורה מהותית, נעלה את המספר הזה - וכל
 * ההורים יתבקשו לקרוא ולאשר מחדש. זו הסיבה שאנחנו שומרים גרסה ולא רק
 * "אישר/לא אישר".
 */
export const CURRENT_DISCLAIMER_VERSION = 1;

export interface DisclaimerAcceptance {
  version: number;
  acceptedAt: string; // ISO timestamp
}

export async function getAcceptance(): Promise<DisclaimerAcceptance | null> {
  return getItem<DisclaimerAcceptance>(StorageKeys.DISCLAIMER);
}

/** true רק אם ההורה אישר את הגרסה הנוכחית של האזהרה. */
export async function hasAcceptedCurrent(): Promise<boolean> {
  const acceptance = await getAcceptance();
  return acceptance?.version === CURRENT_DISCLAIMER_VERSION;
}

export async function accept(): Promise<DisclaimerAcceptance> {
  const acceptance: DisclaimerAcceptance = {
    version: CURRENT_DISCLAIMER_VERSION,
    acceptedAt: new Date().toISOString(),
  };
  await setItem(StorageKeys.DISCLAIMER, acceptance);
  return acceptance;
}
