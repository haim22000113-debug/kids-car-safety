/**
 * בדיקת שטח (16.11): אחרי התקנה מחדש, ההגנה הודלקה לפני שההורה אישר את
 * ההרשאות. ההרשאות אושרו שניות אחר כך - אבל זיהוי התנועה של גוגל לא נרשם
 * שעתיים, ואף נסיעה לא זוהתה. ensureProtectionRunning סוגר את הפער.
 */
const mockStartMotion = jest.fn(async () => true);
let mockTracking = false;
let mockPermission = true;
jest.mock('../modules/vehicle-detection', () => ({
  isSupported: () => true,
  isTracking: () => mockTracking,
  hasPermission: async () => mockPermission,
  startTracking: () => mockStartMotion(),
  stopTracking: async () => true,
  configureEscalation: jest.fn(),
  setLowBatteryPercent: jest.fn(),
  setSuppression: jest.fn(),
  consumeSuppressionUsed: () => false,
}));
jest.mock('../src/services/locationService', () => ({
  onSample: () => () => {},
  startTracking: async () => true,
  stopTracking: async () => {},
}));
jest.mock('../src/notifications/notificationService', () => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

import AsyncStorage from '@react-native-async-storage/async-storage';

async function saveUser(autoProtectionEnabled: boolean) {
  const { UserStorage } = require('../src/storage');
  await UserStorage.saveUser({
    id: 'u',
    name: 'חיים',
    children: [],
    settings: { autoProtectionEnabled, childrenNotWithMe: { active: false, scope: null } },
  });
}

describe('ההגנה נרשמת ברגע שההרשאות מאושרות', () => {
  beforeEach(async () => {
    jest.resetModules();
    mockStartMotion.mockClear();
    mockTracking = false;
    mockPermission = true;
    await AsyncStorage.clear();
  });
  afterEach(() => require('../src/services/tripStateService').stopEngine());

  it('הרשאה אושרה אבל המעקב לא רשום - רושמים עכשיו', async () => {
    await saveUser(true);
    const protectionService = require('../src/services/protectionService');
    await protectionService.ensureProtectionRunning();
    expect(mockStartMotion).toHaveBeenCalled();
  });

  it('הורה שכיבה את ההגנה - לא מדליקים מאחורי גבו', async () => {
    await saveUser(false);
    const protectionService = require('../src/services/protectionService');
    await protectionService.ensureProtectionRunning();
    expect(mockStartMotion).not.toHaveBeenCalled();
  });

  it('כשהכל כבר רץ - לא רושמים שוב (כל רישום גורם לגוגל לשלוח שוב מעברים ישנים)', async () => {
    await saveUser(true);
    const protectionService = require('../src/services/protectionService');
    await protectionService.ensureProtectionRunning();
    mockStartMotion.mockClear();
    mockTracking = true;
    await protectionService.ensureProtectionRunning();
    expect(mockStartMotion).not.toHaveBeenCalled();
  });
});
