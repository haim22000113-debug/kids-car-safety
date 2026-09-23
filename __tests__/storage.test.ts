import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserStorage, TripStorage } from '../src/storage';
import { createDefaultUser, Trip } from '../src/models';

// בדיקות שכבת ה-storage (סעיף 29): יצירת משתמש, הוספת ילדים, נסיעה מלאה,
// מספר ילדים, איש קשר לחירום, "הילדים לא איתי", ופתיחת האפליקציה מחדש
// באמצע נסיעה (מדומה על ידי קריאה טרייה ל-storage בלי state בזיכרון).
beforeEach(async () => {
  await AsyncStorage.clear();
});

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: `trip_${Math.random()}`,
    startTime: new Date().toISOString(),
    status: 'TRIP_ACTIVE',
    childrenIds: [],
    remindersSent: 0,
    skippedSafetyCheck: false,
    ...overrides,
  };
}

describe('UserStorage', () => {
  it('שומר וטוען משתמש (בדיקה #1 - יצירת משתמש)', async () => {
    const user = createDefaultUser('נועה');
    await UserStorage.saveUser(user);
    const loaded = await UserStorage.getUser();
    expect(loaded?.name).toBe('נועה');
    expect(loaded?.id).toBe(user.id);
  });

  it('מוסיף ילד למשתמש קיים (בדיקה #2 - הוספת ילד)', async () => {
    const user = createDefaultUser('דנה');
    await UserStorage.saveUser(user);

    const updated = await UserStorage.updateUser({
      children: [{ id: 'c1', name: 'נועם', age: 4, active: true }],
    });

    expect(updated?.children).toHaveLength(1);
    expect(updated?.children[0].name).toBe('נועם');
  });

  it('תומך במספר ילדים (בדיקה #12)', async () => {
    const user = createDefaultUser('אמא');
    user.children = [
      { id: 'c1', name: 'נועם', age: 4, active: true },
      { id: 'c2', name: 'איתי', age: 7, active: true },
      { id: 'c3', name: 'מאיה', age: 10, active: true },
    ];
    await UserStorage.saveUser(user);

    const loaded = await UserStorage.getUser();
    expect(loaded?.children).toHaveLength(3);
    expect(loaded?.children.map((c) => c.name)).toEqual(['נועם', 'איתי', 'מאיה']);
  });

  it('שומר איש קשר לחירום (בדיקה #9)', async () => {
    await UserStorage.saveUser(createDefaultUser('הורה'));
    const updated = await UserStorage.updateUser({
      emergencyContact: { name: 'אמא', phone: '0501234567' },
    });
    expect(updated?.emergencyContact?.phone).toBe('0501234567');
  });

  it('מפעיל ומבטל מצב "הילדים לא איתי" (בדיקה #10)', async () => {
    const user = createDefaultUser('הורה');
    await UserStorage.saveUser(user);

    const activated = await UserStorage.updateUser({
      settings: {
        ...user.settings,
        childrenNotWithMe: { active: true, scope: 'day', setAt: new Date().toISOString() },
      },
    });
    expect(activated?.settings.childrenNotWithMe.active).toBe(true);

    const cancelled = await UserStorage.updateUser({
      settings: { ...user.settings, childrenNotWithMe: { active: false, scope: null } },
    });
    expect(cancelled?.settings.childrenNotWithMe.active).toBe(false);
  });
});

describe('TripStorage', () => {
  it('מתחיל נסיעה ומזהה אותה כפעילה (בדיקה #3 - התחלת נסיעה)', async () => {
    const trip = makeTrip();
    await TripStorage.saveTrip(trip);

    const active = await TripStorage.getActiveTrip();
    expect(active?.id).toBe(trip.id);
    expect(active?.status).toBe('TRIP_ACTIVE');
  });

  it('מסיים נסיעה ומעביר למצב הצריך בדיקת בטיחות (בדיקה #4-5)', async () => {
    const trip = makeTrip();
    await TripStorage.saveTrip(trip);

    const ended: Trip = { ...trip, endTime: new Date().toISOString(), status: 'SAFETY_CHECK_REQUIRED' };
    await TripStorage.saveTrip(ended);

    const loaded = await TripStorage.getTripById(trip.id);
    expect(loaded?.status).toBe('SAFETY_CHECK_REQUIRED');
    // עדיין "פעילה" מבחינת המערכת - עוד לא אושרה (סטטוס שונה מ-CONFIRMED).
    const active = await TripStorage.getActiveTrip();
    expect(active?.id).toBe(trip.id);
  });

  it('מאשר שכל הילדים יצאו (בדיקה #6)', async () => {
    const trip = makeTrip({ status: 'SAFETY_CHECK_REQUIRED', endTime: new Date().toISOString() });
    await TripStorage.saveTrip(trip);

    const confirmed: Trip = { ...trip, confirmedAt: new Date().toISOString(), status: 'CONFIRMED' };
    await TripStorage.saveTrip(confirmed);

    const active = await TripStorage.getActiveTrip();
    expect(active).toBeNull();

    const history = await TripStorage.getTripHistory();
    expect(history[0].status).toBe('CONFIRMED');
  });

  it('שולף נסיעה פעילה גם "אחרי פתיחה מחדש" של האפליקציה (בדיקה #11)', async () => {
    const trip = makeTrip();
    await TripStorage.saveTrip(trip);

    // מדמה פתיחה מחדש: אין state בזיכרון, רק קריאה טרייה מה-storage.
    const activeAfterRestart = await TripStorage.getActiveTrip();
    expect(activeAfterRestart?.id).toBe(trip.id);
  });

  it('שומר את מזהי ההתראות של תחילת הנסיעה כדי שאפשר יהיה לבטל אותן', async () => {
    const trip = makeTrip({ startNotificationIds: ['notif_a', 'notif_b'] });
    await TripStorage.saveTrip(trip);

    const loaded = await TripStorage.getTripById(trip.id);
    expect(loaded?.startNotificationIds).toEqual(['notif_a', 'notif_b']);
  });

  it('ממיין את ההיסטוריה מהחדש לישן', async () => {
    const older = makeTrip({
      id: 'trip_old',
      startTime: new Date('2026-01-01T10:00:00Z').toISOString(),
      status: 'CONFIRMED',
    });
    const newer = makeTrip({
      id: 'trip_new',
      startTime: new Date('2026-01-02T10:00:00Z').toISOString(),
      status: 'CONFIRMED',
    });
    await TripStorage.saveTrip(older);
    await TripStorage.saveTrip(newer);

    const history = await TripStorage.getTripHistory();
    expect(history[0].id).toBe('trip_new');
    expect(history[1].id).toBe('trip_old');
  });
});
