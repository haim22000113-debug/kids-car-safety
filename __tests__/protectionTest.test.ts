jest.mock('../modules/vehicle-detection', () => ({}));
jest.mock('../src/services/locationService', () => ({}));
jest.mock('../src/notifications/notificationService', () => ({}));
import { buildTestReport, TestInput } from '../src/services/protectionTest';

const allGood: TestInput = {
  alarm: { notificationsEnabled: true, channelBlocked: false, dndOn: false, alarmVolumeBefore: 6, alarmVolumeMax: 7 },
  alarmSent: true,
  notifications: true,
  locationBackground: true,
  motionSupported: true,
  motion: true,
  battery: true,
  exactAlarm: true,
  protectionOn: true,
  hasContact: true,
};

describe('בדוק את ההגנה', () => {
  it('הכל תקין - האזעקה צלצלה וההגנה מוכנה', () => {
    const report = buildTestReport(allGood);
    expect(report.every((i) => i.ok)).toBe(true);
    expect(report.map((i) => i.text).join(' ')).toContain('ההגנה מוכנה');
  });

  it('התראות חסומות - בעיה ראשונה, עם הפניה להגדרות', () => {
    const report = buildTestReport({ ...allGood, notifications: false, alarmSent: false });
    expect(report[0]).toMatchObject({ ok: false, action: 'notificationSettings' });
  });

  it('קטגוריית האזעקה כבויה - מזוהה גם כשההתראות הכלליות מותרות', () => {
    const report = buildTestReport({
      ...allGood,
      alarm: { ...allGood.alarm!, channelBlocked: true },
      alarmSent: false,
    });
    expect(report.some((i) => !i.ok && i.text.includes('אזעקה ושיחה'))).toBe(true);
  });

  it('עוצמה על אפס ו"נא לא להפריע" - שתי אזהרות', () => {
    const report = buildTestReport({
      ...allGood,
      alarm: { ...allGood.alarm!, alarmVolumeBefore: 0, dndOn: true },
    });
    expect(report.filter((i) => !i.ok)).toHaveLength(2);
  });

  it('הרשאות חסרות מפנות למסך ההרשאות', () => {
    const report = buildTestReport({ ...allGood, motion: false, battery: false });
    const bad = report.filter((i) => !i.ok);
    expect(bad).toHaveLength(2);
    expect(bad.every((i) => i.action === 'permissions')).toBe(true);
  });
});
