/**
 * בדיקת שטח: אחרי "ראיתי, אני מטפל" ההתראות המשיכו להגיע.
 *
 * כשהאפליקציה סגורה, הלחיצה מעירה אותה, והאישור הגיע למכונה לפני שהמצב
 * נטען מהדיסק. המכונה חשבה שאין אזהרה והתעלמה מהאישור. הבדיקה כאן
 * משחזרת בדיוק את זה: אזהרה שמורה בדיסק, תהליך "טרי", ולחיצה מיידית.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TripState, INITIAL_SNAPSHOT } from '../src/models/TripState';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn() } }));

const mockCancelEscalation = jest.fn();
const mockScheduleEscalation = jest.fn();
let mockLastAckAt = 0;
let mockPending: { type: string; at: number; enteredAt: number } | null = null;
jest.mock('../modules/vehicle-detection', () => ({
  getLastAckAt: () => mockLastAckAt,
  cancelEscalation: () => mockCancelEscalation(),
  configureEscalation: jest.fn(),
  scheduleEscalation: (at: number) => mockScheduleEscalation(at),
  setSuppression: jest.fn(),
  consumeSuppressionUsed: () => false,
  consumeConfirmation: () => 0,
  getPendingEvent: () => mockPending,
  clearPendingEvent: () => {
    mockPending = null;
  },
  handlesUrgentAlarm: () => true,
  startTracking: async () => false,
  stopTracking: async () => true,
  isSupported: () => true,
}));

const mockCancelWarningLadder = jest.fn(async (_ids: string[] | undefined) => {});
const mockScheduleWarningLadder = jest.fn(async (..._args: unknown[]) => [] as string[]);
jest.mock('../src/notifications/notificationService', () => ({
  scheduleWarningLadder: (...args: unknown[]) => mockScheduleWarningLadder(...args),
  cancelWarningLadder: (ids: string[] | undefined) => mockCancelWarningLadder(ids),
  cancelReminders: jest.fn(async () => {}),
}));

jest.mock('../src/services/locationService', () => ({
  onSample: () => () => {},
  getLastSample: () => undefined,
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
    mockScheduleWarningLadder.mockClear();
    mockScheduleEscalation.mockClear();
    mockPush.mockClear();
    mockLastAckAt = 0;
    mockPending = null;
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

  it('לחיצה על ההתראה הנייטיב: האפליקציה עולה ולא פותחת שוב את מסך האזהרה', async () => {
    const now = Date.now();
    // הצד הנייטיב רשם יציאה, ואחריה ההורה לחץ על ההתראה ("ראיתי").
    mockPending = { type: 'EXIT_VEHICLE', at: now - 20_000, enteredAt: now - 600_000 };
    mockLastAckAt = now - 5_000;

    const protectionService = require('../src/services/protectionService');
    const tripStateService = require('../src/services/tripStateService');
    await protectionService.restoreAfterRestart();

    expect(mockPush).not.toHaveBeenCalledWith('/warning');
    expect(mockScheduleWarningLadder).not.toHaveBeenCalled();
    expect(tripStateService.getSnapshot().state).not.toBe(TripState.WARNING);
    expect(mockPending).toBeNull();
  });

  it('יציאה שלא אושרה עדיין - מתריעים כרגיל', async () => {
    const now = Date.now();
    mockPending = { type: 'EXIT_VEHICLE', at: now - 2_000, enteredAt: now - 600_000 };
    // "ראיתי" מנסיעה קודמת, לפני היציאה הזו.
    mockLastAckAt = now - 3_600_000;

    const protectionService = require('../src/services/protectionService');
    const tripStateService = require('../src/services/tripStateService');
    await protectionService.restoreAfterRestart();

    expect(tripStateService.getSnapshot().state).toBe(TripState.WARNING);
    expect(mockScheduleWarningLadder).toHaveBeenCalled();
    expect(mockScheduleEscalation).toHaveBeenCalled();
  });

  it('המזהה לפי מיקום לא מתריע על נסיעה שההורה כבר אמר עליה "ראיתי"', async () => {
    const { TripStateStorage } = require('../src/storage');
    const now = Date.now();
    // ה-JS עדיין בזמן חסד על הנסיעה, וההורה כבר לחץ "ראיתי" בהתראה הנייטיב.
    await TripStateStorage.save({
      ...INITIAL_SNAPSHOT,
      state: TripState.ACTIVE,
      stateSince: now - 900_000,
      tripStartedAt: now - 900_000,
    });
    mockLastAckAt = now - 60_000;

    const protectionService = require('../src/services/protectionService');
    const tripStateService = require('../src/services/tripStateService');
    await protectionService.ensureEngineReady();
    await tripStateService.onVehicleExit(undefined, now);

    expect(mockScheduleWarningLadder).not.toHaveBeenCalled();
    expect(mockScheduleEscalation).not.toHaveBeenCalled();
    expect(tripStateService.getSnapshot().state).toBe(TripState.CONFIRMED_SAFE);
  });

  it('נסיעה חדשה אחרי "ראיתי" - מתריעים', async () => {
    const { TripStateStorage } = require('../src/storage');
    const now = Date.now();
    await TripStateStorage.save({
      ...INITIAL_SNAPSHOT,
      state: TripState.ACTIVE,
      stateSince: now - 300_000,
      tripStartedAt: now - 300_000,
    });
    // האישור היה על הנסיעה הקודמת, לפני שהנסיעה הזו התחילה.
    mockLastAckAt = now - 600_000;

    const protectionService = require('../src/services/protectionService');
    const tripStateService = require('../src/services/tripStateService');
    await protectionService.ensureEngineReady();
    await tripStateService.onVehicleExit(undefined, now);

    expect(tripStateService.getSnapshot().state).toBe(TripState.WARNING);
    expect(mockScheduleWarningLadder).toHaveBeenCalled();
  });
});
