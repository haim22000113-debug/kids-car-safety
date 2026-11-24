jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import {
  latestWarningAt,
  shouldAskFeedback,
  isFalseAlarm,
  formatWarningTime,
  SAME_WARNING_WINDOW_MS,
} from '../src/services/warningFeedback';

const HOUR = 60 * 60 * 1000;
const now = new Date(2026, 10, 24, 12, 0).getTime();

describe('"האזהרה הייתה במקום?"', () => {
  it('לוקח את האזהרה המאוחרת מבין הנייטיב וה-JS', () => {
    const history = [
      { type: 'EXIT', at: now - 3 * HOUR, detail: '' },
      { type: 'NOTIFY_OK', at: now - 2 * HOUR, detail: '' },
      { type: 'TEST_ALARM', at: now - HOUR, detail: '' },
    ];
    expect(latestWarningAt(null, history)).toBe(now - 2 * HOUR);
    expect(latestWarningAt(now - HOUR / 2, history)).toBe(now - HOUR / 2);
    expect(latestWarningAt(null, [])).toBeNull();
  });

  it('בדיקת ההגנה לא נחשבת אזהרה', () => {
    expect(latestWarningAt(null, [{ type: 'TEST_ALARM', at: now, detail: '' }])).toBeNull();
  });

  it('שואל על אזהרה מהשעות האחרונות שלא ענו עליה', () => {
    expect(shouldAskFeedback(now - HOUR, null, now)).toBe(true);
  });

  it('לא שואל על אזהרה ישנה', () => {
    expect(shouldAskFeedback(now - 13 * HOUR, null, now)).toBe(false);
  });

  it('לא שואל שוב אחרי תשובה, גם כשהצד השני רשם את אותה אזהרה כמה דקות אחר כך', () => {
    const answered = now - HOUR;
    expect(shouldAskFeedback(answered, answered, now)).toBe(false);
    expect(shouldAskFeedback(answered + 4 * 60 * 1000, answered, now)).toBe(false);
  });

  it('אזהרה חדשה אחרי תשובה - שואל עליה', () => {
    const answered = now - 3 * HOUR;
    expect(shouldAskFeedback(answered + SAME_WARNING_WINDOW_MS + 1, answered, now)).toBe(true);
  });

  it('אין אזהרה או אזהרה מהעתיד (שעון שהוזז) - לא שואל', () => {
    expect(shouldAskFeedback(null, null, now)).toBe(false);
    expect(shouldAskFeedback(now + HOUR, null, now)).toBe(false);
  });

  it('רק "עוד הייתי בנסיעה" ו"לא הייתי ברכב" הן אזעקת שווא', () => {
    expect(isFalseAlarm('STILL_DRIVING')).toBe(true);
    expect(isFalseAlarm('NOT_IN_CAR')).toBe(true);
    expect(isFalseAlarm('CORRECT')).toBe(false);
    expect(isFalseAlarm('LATE')).toBe(false);
    expect(isFalseAlarm('UNSURE')).toBe(false);
  });

  it('מציג שעה בלבד', () => {
    expect(formatWarningTime(new Date(2026, 10, 24, 9, 5).getTime())).toBe('09:05');
  });
});
