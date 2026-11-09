import { reduce, MachineInput } from '../src/services/tripStateMachine';
import { AutoTripSnapshot, TripState, INITIAL_SNAPSHOT } from '../src/models/TripState';
import { config } from '../src/config';
import {
  makeTrack,
  makeStationary,
  makePointAtDistance,
  ORIGIN,
  pointNorthOf,
} from '../src/services/mockLocation';

const T0 = 1_000_000_000_000;
const seconds = (n: number) => n * 1000;

/** מריץ רצף קלטים דרך המכונה ומחזיר את המצב הסופי ואת כל האפקטים. */
function run(inputs: MachineInput[], start: AutoTripSnapshot = { ...INITIAL_SNAPSHOT, stateSince: T0 }) {
  let snapshot = start;
  const effects: string[] = [];
  for (const input of inputs) {
    const result = reduce(snapshot, input);
    snapshot = result.snapshot;
    effects.push(...result.effects.map((e) => e.type));
  }
  return { snapshot, effects };
}

/** דגימות של נסיעה שמסתיימת בעצירה ארוכה באותו מקום. */
function drivingThenStopped() {
  const drive = makeTrack({ startAt: T0, count: 10, intervalSeconds: 30, speedMps: 15 });
  const stopOrigin = { latitude: drive[drive.length - 1].latitude, longitude: drive[drive.length - 1].longitude };
  const parked = makeStationary({
    startAt: drive[drive.length - 1].timestamp + seconds(30),
    count: 8,
    intervalSeconds: 30,
    origin: stopOrigin,
  });
  return { drive, parked, stopOrigin };
}

describe('תרחיש 38 — הזרימה המרכזית', () => {
  it('נסיעה → עצירה → התרחקות → אזהרה → אישור → נסיעה נסגרת', () => {
    const { drive, parked, stopOrigin } = drivingThenStopped();

    // 1-2. זיהוי נסיעה
    let step = run([
      { kind: 'LOCATION', point: drive[drive.length - 1], samples: drive, now: drive[drive.length - 1].timestamp },
    ]);
    expect(step.snapshot.state).toBe(TripState.ACTIVE);
    expect(step.snapshot.tripStartedAt).toBeDefined();

    // 3-5. זיהוי עצירה, שמירת מיקום, יצירת geofence
    const lastParked = parked[parked.length - 1];
    step = run([{ kind: 'LOCATION', point: lastParked, samples: parked, now: lastParked.timestamp }], step.snapshot);

    expect(step.snapshot.state).toBe(TripState.GRACE_PERIOD);
    expect(step.snapshot.stopLocation).toBeDefined();
    expect(step.effects).toContain('CREATE_GEOFENCE');

    // 6. ההורה מתרחק, אחרי שתקופת החסד נגמרה
    const afterGrace = lastParked.timestamp + seconds(config.EXIT_GRACE_PERIOD_SECONDS + 30);
    const away = makePointAtDistance(stopOrigin, 400, { timestamp: afterGrace });
    step = run([{ kind: 'LOCATION', point: away, samples: [away], now: afterGrace }], step.snapshot);

    expect(step.snapshot.state).toBe(TripState.LEFT_VEHICLE_AREA);

    // 7. אזהרה
    step = run([{ kind: 'TICK', now: afterGrace + seconds(1) }], step.snapshot);
    expect(step.snapshot.state).toBe(TripState.WARNING);
    expect(step.effects).toContain('SEND_FIRST_WARNING');

    // 8-9. ההורה מאשר
    step = run([{ kind: 'USER_CONFIRMED_SAFE', now: afterGrace + seconds(20) }], step.snapshot);
    expect(step.snapshot.state).toBe(TripState.CONFIRMED_SAFE);
    expect(step.snapshot.confirmedSafeAt).toBeDefined();
    expect(step.effects).toContain('REMOVE_GEOFENCE');
    expect(step.effects).toContain('PERSIST_TRIP');

    // קריטי: שרשרת ההסלמה מתוזמנת מראש במערכת ההפעלה, ולכן אישור של
    // ההורה חייב לבטל אותה במפורש. בלי זה הוא יקבל "לא התקבלה תגובה"
    // שתי דקות אחרי שכבר בדק ואישר - וזה מה שגורם להורים להתעלם מהתראות.
    expect(step.effects).toContain('CANCEL_WARNINGS');
  });

  it('לא מתריע בתוך תקופת החסד גם אם ההורה התרחק', () => {
    const { parked, stopOrigin } = drivingThenStopped();
    const lastParked = parked[parked.length - 1];

    const inGrace: AutoTripSnapshot = {
      state: TripState.GRACE_PERIOD,
      stateSince: lastParked.timestamp,
      manual: false,
      stopLocation: {
        latitude: stopOrigin.latitude,
        longitude: stopOrigin.longitude,
        accuracy: 10,
        stoppedAt: lastParked.timestamp,
        lastMovementAt: lastParked.timestamp,
        tripDurationSeconds: 300,
      },
    };

    // 30 שניות בלבד אחרי העצירה - עדיין בתוך החסד (60 שניות).
    const tooSoon = lastParked.timestamp + seconds(30);
    const away = makePointAtDistance(stopOrigin, 400, { timestamp: tooSoon });
    const step = run([{ kind: 'LOCATION', point: away, samples: [away], now: tooSoon }], inGrace);

    expect(step.snapshot.state).toBe(TripState.GRACE_PERIOD);
  });
});

describe('תרחיש 39 — אין תגובה', () => {
  it('אזהרה → אזהרה שנייה → escalation', () => {
    const warning: AutoTripSnapshot = {
      state: TripState.WARNING,
      stateSince: T0,
      firstWarningAt: T0,
      manual: false,
    };

    // לפני הזמן - שום דבר לא קורה.
    let step = run([{ kind: 'TICK', now: T0 + seconds(30) }], warning);
    expect(step.snapshot.secondWarningAt).toBeUndefined();

    // אחרי SECOND_WARNING_DELAY - אזהרה שנייה.
    const secondAt = T0 + seconds(config.SECOND_WARNING_DELAY_SECONDS + 5);
    step = run([{ kind: 'TICK', now: secondAt }], warning);
    expect(step.effects).toContain('SEND_SECOND_WARNING');
    expect(step.snapshot.secondWarningAt).toBeDefined();
    expect(step.snapshot.state).toBe(TripState.WARNING);

    // אחרי ESCALATION_DELAY מהאזהרה השנייה - escalation.
    const escalateAt = secondAt + seconds(config.ESCALATION_DELAY_SECONDS + 5);
    step = run([{ kind: 'TICK', now: escalateAt }], step.snapshot);
    expect(step.snapshot.state).toBe(TripState.ESCALATION);
    expect(step.effects).toContain('SHOW_ESCALATION');
  });
});

describe('תרחיש 40 — התרעת שווא', () => {
  it('הליכה ברגל לא מייצרת נסיעה ולא אזהרה', () => {
    const walking = makeTrack({ startAt: T0, speedMps: 1.3, count: 25, intervalSeconds: 30 });
    const last = walking[walking.length - 1];

    const step = run([{ kind: 'LOCATION', point: last, samples: walking, now: last.timestamp }]);

    expect(step.snapshot.state).toBe(TripState.IDLE);
    expect(step.effects).not.toContain('SEND_FIRST_WARNING');
    expect(step.effects).not.toContain('CREATE_GEOFENCE');
  });

  it('חוזר ל-IDLE אם תנועה חשודה לא התפתחה לנסיעה', () => {
    const possible: AutoTripSnapshot = {
      state: TripState.POSSIBLE_TRIP,
      stateSince: T0,
      manual: false,
    };
    const stationary = makeStationary({ startAt: T0, count: 4 });
    const last = stationary[stationary.length - 1];

    const step = run(
      [{ kind: 'LOCATION', point: last, samples: stationary, now: last.timestamp }],
      possible
    );
    expect(step.snapshot.state).toBe(TripState.IDLE);
  });
});

describe('זיהוי יציאה מרכב מהחיישנים (אנדרואיד)', () => {
  it('מדלג ישר לאזהרה, בלי לחכות ל-geofence', () => {
    const active: AutoTripSnapshot = {
      state: TripState.ACTIVE,
      stateSince: T0,
      tripStartedAt: T0,
      manual: false,
    };
    const point = { ...ORIGIN, accuracy: 12, timestamp: T0 + seconds(600) };

    const step = run([{ kind: 'VEHICLE_EXIT', now: T0 + seconds(600), point }], active);

    expect(step.snapshot.state).toBe(TripState.WARNING);
    expect(step.effects).toContain('SEND_FIRST_WARNING');
    expect(step.snapshot.stopLocation?.latitude).toBeCloseTo(ORIGIN.latitude, 5);
  });

  it('כניסה לרכב פותחת נסיעה בלי לחיצה של ההורה', () => {
    const step = run([{ kind: 'VEHICLE_ENTER', now: T0 }]);
    expect(step.snapshot.state).toBe(TripState.ACTIVE);
    expect(step.snapshot.manual).toBe(false);
    expect(step.snapshot.tripStartedAt).toBe(T0);
  });

  it('יציאה מרכב במצב IDLE לא מייצרת אזהרה', () => {
    // ההורה היה נוסע ברכב של מישהו אחר בלי שהמערכת זיהתה נסיעה.
    const step = run([{ kind: 'VEHICLE_EXIT', now: T0 }]);
    expect(step.snapshot.state).toBe(TripState.IDLE);
    expect(step.effects).not.toContain('SEND_FIRST_WARNING');
  });
});

describe('מצב ידני ופעולות משתמש', () => {
  it('התחלה ידנית מסמנת את הנסיעה כידנית', () => {
    const step = run([{ kind: 'MANUAL_START', now: T0 }]);
    expect(step.snapshot.state).toBe(TripState.ACTIVE);
    expect(step.snapshot.manual).toBe(true);
  });

  it('סיום ידני שואל אם הילדים יצאו במקום לסגור מיד', () => {
    const active: AutoTripSnapshot = { state: TripState.ACTIVE, stateSince: T0, manual: true };
    const step = run([{ kind: 'MANUAL_END', now: T0 + seconds(60) }], active);

    expect(step.snapshot.state).toBe(TripState.WARNING);
    expect(step.effects).toContain('SEND_FIRST_WARNING');
  });

  it('"אני צריך עזרה" מעביר ל-escalation', () => {
    const warning: AutoTripSnapshot = {
      state: TripState.WARNING,
      stateSince: T0,
      firstWarningAt: T0,
      manual: false,
    };
    const step = run([{ kind: 'USER_REQUESTED_HELP', now: T0 + seconds(10) }], warning);
    expect(step.snapshot.state).toBe(TripState.ESCALATION);
  });

  it('אישור מ-IDLE לא עושה כלום', () => {
    const step = run([{ kind: 'USER_CONFIRMED_SAFE', now: T0 }]);
    expect(step.snapshot.state).toBe(TripState.IDLE);
    expect(step.effects).not.toContain('PERSIST_TRIP');
  });

  it('RESET מנקה geofence וחוזר ל-IDLE', () => {
    const warning: AutoTripSnapshot = { state: TripState.WARNING, stateSince: T0, manual: false };
    const step = run([{ kind: 'RESET', now: T0 + seconds(5) }], warning);
    expect(step.snapshot.state).toBe(TripState.IDLE);
    expect(step.effects).toContain('REMOVE_GEOFENCE');
    expect(step.effects).toContain('CANCEL_WARNINGS');
  });
});

describe('בדיקת שטח: רכב חונה עם מאגר דגימות אמיתי', () => {
  /**
   * הבאג שהתגלה בשטח: באפליקציה האמיתית מאגר הדגימות מכיל גם את הנסיעה
   * שלפני העצירה. הבדיקות הקודמות העבירו למכונה רק את דגימות החניה,
   * ולכן לא ראו שכל דגימה של רכב עומד הוחזרה ל"נסיעה התחדשה".
   */
  function parkedWithRealBuffer() {
    const { drive, parked, stopOrigin } = drivingThenStopped();
    let buffer = [...drive];
    let snapshot: AutoTripSnapshot = { ...INITIAL_SNAPSHOT, stateSince: T0 };
    const feed = (point: (typeof drive)[number]) => {
      buffer = [...buffer, point].slice(-config.LOCATION_BUFFER_SIZE);
      const step = run([{ kind: 'LOCATION', point, samples: buffer, now: point.timestamp }], snapshot);
      snapshot = step.snapshot;
      return step;
    };
    snapshot = run([
      { kind: 'LOCATION', point: drive[drive.length - 1], samples: drive, now: drive[drive.length - 1].timestamp },
    ]).snapshot;
    parked.forEach(feed);
    return { feed, getSnapshot: () => snapshot, stopOrigin, lastParked: parked[parked.length - 1] };
  }

  it('רכב שעומד במקום נשאר בעצירה ולא "מתחדש" בכל דגימה', () => {
    const { feed, getSnapshot, lastParked, stopOrigin } = parkedWithRealBuffer();
    expect(getSnapshot().state).toBe(TripState.GRACE_PERIOD);

    // עוד חמש דקות של עמידה במקום, דגימה כל 45 שניות - כמו בטלפון.
    for (let i = 1; i <= 7; i++) {
      const still = makeStationary({
        startAt: lastParked.timestamp + seconds(45 * i),
        count: 1,
        origin: stopOrigin,
      })[0];
      const step = feed(still);
      expect(step.effects).not.toContain('REMOVE_GEOFENCE');
      expect(getSnapshot().state).toBe(TripState.GRACE_PERIOD);
    }
  });

  it('עצירה ברמזור ואז המשך נסיעה - אין אזהרה, גם כשהדגימה הבאה כבר רחוקה', () => {
    // בדיקת שטח: אזהרות באמצע נסיעה. דגימה אחת אחרי העצירה, כבר 600 מטר
    // משם (13 מ"ש), עברה את תקופת החסד ונראתה כמו "התרחק מהרכב".
    const { feed, getSnapshot, lastParked, stopOrigin } = parkedWithRealBuffer();
    const later = lastParked.timestamp + seconds(config.EXIT_GRACE_PERIOD_SECONDS + 45);
    feed({ ...makePointAtDistance(stopOrigin, 600, { timestamp: later }), speed: null });
    expect(getSnapshot().state).not.toBe(TripState.LEFT_VEHICLE_AREA);
  });

  it('המכשיר מדווח מהירות נסיעה - לא מתריעים גם בלי היסטוריה', () => {
    const { feed, getSnapshot, lastParked, stopOrigin } = parkedWithRealBuffer();
    const later = lastParked.timestamp + seconds(config.EXIT_GRACE_PERIOD_SECONDS + 600);
    // עשר דקות אחרי: מרחק/זמן איטי, אבל המכשיר רואה 14 מ"ש עכשיו.
    feed({ ...makePointAtDistance(stopOrigin, 300, { timestamp: later }), speed: 14 });
    expect(getSnapshot().state).not.toBe(TripState.LEFT_VEHICLE_AREA);
  });

  it('אחרי "ראיתי" לא נפתחת נסיעה חדשה מהדגימות של הנסיעה שנגמרה', () => {
    // בדיקת שטח: אחרי "ראיתי, אני מטפל" האזהרות חזרו כעבור כמה דקות. המאגר
    // עדיין הכיל את הנסיעה, והדגימה הבאה "גילתה" בה נסיעה חדשה.
    const { getSnapshot, lastParked, stopOrigin } = parkedWithRealBuffer();
    const confirmAt = lastParked.timestamp + seconds(30);
    const confirmed = run([{ kind: 'USER_CONFIRMED_SAFE', now: confirmAt }], getSnapshot()).snapshot;
    expect(confirmed.state).toBe(TripState.CONFIRMED_SAFE);

    // ממשיכים להזין את אותו מאגר: עמידה ליד הרכב, ואז הליכה ממנו.
    let snapshot = confirmed;
    let buffer = [...makeTrack({ startAt: T0, count: 10, intervalSeconds: 30, speedMps: 15 })];
    for (let i = 1; i <= 6; i++) {
      const point =
        i < 4
          ? makeStationary({ startAt: confirmAt + seconds(45 * i), count: 1, origin: stopOrigin })[0]
          : makePointAtDistance(stopOrigin, 60 * i, { timestamp: confirmAt + seconds(45 * i) });
      buffer = [...buffer, point].slice(-config.LOCATION_BUFFER_SIZE);
      const step = run([{ kind: 'LOCATION', point, samples: buffer, now: point.timestamp }], snapshot);
      snapshot = step.snapshot;
      expect(step.effects).not.toContain('SEND_FIRST_WARNING');
      expect(snapshot.state).toBe(TripState.CONFIRMED_SAFE);
    }
  });

  it('אחרי "ראיתי", נסיעה חדשה באמת עדיין מזוהה', () => {
    const { getSnapshot, lastParked } = parkedWithRealBuffer();
    const confirmAt = lastParked.timestamp + seconds(30);
    const confirmed = run([{ kind: 'USER_CONFIRMED_SAFE', now: confirmAt }], getSnapshot()).snapshot;
    const newDrive = makeTrack({ startAt: confirmAt + seconds(600), count: 10, intervalSeconds: 30, speedMps: 15 });
    const last = newDrive[newDrive.length - 1];
    const step = run([{ kind: 'LOCATION', point: last, samples: newDrive, now: last.timestamp }], confirmed);
    expect(step.snapshot.state).toBe(TripState.ACTIVE);
  });

  it('אחרי עצירה אמיתית, התרחקות מהרכב מגיעה לאזהרה', () => {
    const { feed, getSnapshot, lastParked, stopOrigin } = parkedWithRealBuffer();
    const afterGrace = lastParked.timestamp + seconds(config.EXIT_GRACE_PERIOD_SECONDS + 240);
    feed(makePointAtDistance(stopOrigin, 400, { timestamp: afterGrace }));
    expect(getSnapshot().state).toBe(TripState.LEFT_VEHICLE_AREA);
  });
});

describe('חידוש נסיעה', () => {
  it('אם ההורה חזר לנסוע בזמן החסד, הנסיעה ממשיכה ואין אזהרה', () => {
    const stopOrigin = ORIGIN;
    const inGrace: AutoTripSnapshot = {
      state: TripState.GRACE_PERIOD,
      stateSince: T0,
      manual: false,
      stopLocation: {
        latitude: stopOrigin.latitude,
        longitude: stopOrigin.longitude,
        accuracy: 10,
        stoppedAt: T0,
        lastMovementAt: T0,
        tripDurationSeconds: 200,
      },
    };

    const resumed = makeTrack({ startAt: T0 + seconds(90), count: 10, intervalSeconds: 30, speedMps: 15, origin: stopOrigin });
    const last = resumed[resumed.length - 1];

    const step = run([{ kind: 'LOCATION', point: last, samples: resumed, now: last.timestamp }], inGrace);

    expect(step.snapshot.state).toBe(TripState.ACTIVE);
    expect(step.effects).toContain('REMOVE_GEOFENCE');
  });
});
