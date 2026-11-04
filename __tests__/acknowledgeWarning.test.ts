/**
 * בדיקת שטח: אחרי "ראיתי, אני מטפל" ההתראות המשיכו להגיע.
 *
 * כשהאפליקציה סגורה, הלחיצה מעירה אותה, והאישור הגיע למכונה לפני שהמצב
 * נטען מהדיסק. המכונה חשבה שאין אזהרה והתעלמה מהאישור. הבדיקה כאן
 * משחזרת בדיוק את זה: אזהרה שמורה בדיסק, תהליך "טרי", ולחיצה מיידית.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TripState, INITIAL_SNAPSHOT } from '../src/models/TripState';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

const mockCancelEscalation = jest.fn();
jest.mock('../modules/vehicle-detection', () => ({
  cancelEscalation: () => mockCancelEscalation(),
  configureEscalation: jest.fn(),
  scheduleEscalation: jest.fn(),
  setSuppression: jest.fn(),
  consumeSuppressionUsed: () => false,
  consumeConfirmation: () => 0,
  getPendingEvent: () => null,
  clearPendingEvent: jest.fn(),
  handlesUrgentAlarm: () => true,
  startTracking: async () => false,
  stopTracking: async () => true,
  isSupported: () => true,
}));

const mockCancelWarningLadder = jest.fn(async (_ids: string[] | undefined) => {});
jest.mock('../src/notifications/notificationService', () => ({
  scheduleWarningLadder: jest.fn(async () => []),
  cancelWarningLadder: (ids: string[] | undefined) => mockCancelWarningLadder(ids),
  cancelReminders: jest.fn(async () => {}),
}));

jest.mock('../src/services/locationService', () => ({
  onSample: () => () => {},
  startTracking: async () => false,
  stopTracking: async () => {},
}));

jest.mock('../src/services/geofenceService', () => ({
  createVehicleGeofence: jest.fn(async () => true),
  removeVehicleGeofence: jest.fn(async () => {}),
}));

describe('"ראיתי, אני מטפל" מהתראה כשהאפליקציה עולה מאפס', () => {
  beforeEach(async () => {
    jest.resetModules();
    mockCancelEscalation.mockClear();
    mockCancelWarningLadder.mockClear();
    await AsyncStorage.clear();
  });

  // restoreAfterRestart מדליק פעימת זמן של 15 שניות; בלי לכבות אותה jest לא מסתיים.
  afterEach(() => {
    require('../src/services/tripStateService').stopEngine();
  });

  it('מאשר גם כשהלחיצה מגיעה לפני שהמצב נטען, ומבטל את כל השרשרת', async () => {
    const { TripStateStorage } = require('../src/storage');
    const now = Date.now();
    await TripStateStorage.save({
      ...INITIAL_SNAPSHOT,
      state: TripState.WARNING,
      stateSince: now - 30_000,
      firstWarningAt: now - 30_000,
    });
    await TripStateStorage.saveWarningIds(['urgent-1']);

    // תהליך חדש: אף אחד עוד לא טען את המצב. בדיוק כמו אחרי לחיצה על
    // כפתור בהתראה כשהאפליקציה סגורה.
    const protectionService = require('../src/services/protectionService');
    const tripStateService = require('../src/services/tripStateService');
    expect(tripStateService.getSnapshot().state).toBe(TripState.IDLE);

    await protectionService.acknowledgeWarning();

    expect(tripStateService.getSnapshot().state).toBe(TripState.CONFIRMED_SAFE);
    expect(mockCancelEscalation).toHaveBeenCalled();
    expect(mockCancelWarningLadder).toHaveBeenCalledWith(['urgent-1']);
    expect(await TripStateStorage.loadWarningIds()).toEqual([]);
  });

  it('מבטל את הצלצולים גם כשהמכונה בכלל לא במצב אזהרה', async () => {
    const { TripStateStorage } = require('../src/storage');
    await TripStateStorage.saveWarningIds(['urgent-2']);

    const protectionService = require('../src/services/protectionService');
    await protectionService.acknowledgeWarning();

    expect(mockCancelEscalation).toHaveBeenCalled();
    expect(mockCancelWarningLadder).toHaveBeenCalledWith(['urgent-2']);
  });

  it('טעינה מאוחרת של האפליקציה לא מחזירה את האזהרה אחרי האישור', async () => {
    const { TripStateStorage } = require('../src/storage');
    const now = Date.now();
    await TripStateStorage.save({
      ...INITIAL_SNAPSHOT,
      state: TripState.WARNING,
      stateSince: now - 30_000,
      firstWarningAt: now - 30_000,
    });

    const protectionService = require('../src/services/protectionService');
    const tripStateService = require('../src/services/tripStateService');

    // הלחיצה והעלייה של האפליקציה רצות במקביל, כמו ב-_layout.
    await Promise.all([protectionService.acknowledgeWarning(), protectionService.restoreAfterRestart()]);

    expect(tripStateService.getSnapshot().state).toBe(TripState.CONFIRMED_SAFE);
  });
});
