import { config } from '../src/config';

jest.mock('expo-location', () => ({}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { isLocationStale } = require('../src/services/locationService');

/**
 * בדיקת שטח: אחרי הפעלה מחדש של הטלפון מעקב המיקום נראה "פעיל" אבל לא
 * שלח מיקום שעה וחצי. isLocationStale הוא מה שמחליט להפעיל אותו מחדש.
 */
describe('isLocationStale', () => {
  const now = 1_000_000_000_000;

  it('מיקום טרי - לא תקוע', () => {
    expect(isLocationStale(now - config.LOCATION_UPDATE_INTERVAL_SECONDS * 1000, now)).toBe(false);
  });

  it('שעה וחצי בלי מיקום, כמו בבדיקת השטח - תקוע', () => {
    expect(isLocationStale(now - 90 * 60 * 1000, now)).toBe(true);
  });

  it('אף מיקום לא נרשם - נחשב תקוע', () => {
    expect(isLocationStale(null, now)).toBe(true);
  });

  it('הסף מספיק רחב כדי לא להפעיל מחדש על דגימה אחת שאיחרה', () => {
    expect(config.LOCATION_STALE_SECONDS).toBeGreaterThanOrEqual(config.LOCATION_UPDATE_INTERVAL_SECONDS * 4);
  });
});
