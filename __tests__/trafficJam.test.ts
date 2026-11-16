/**
 * בדיקת שטח (16.11): אזהרות באמצע נסיעה הביתה.
 *
 * פקק: נסיעה, עצירה של כמה דקות, ואז זחילה. לפני התיקון המזהה לפי מיקום
 * התריע בכל מהירות זחילה עד 18 קמ"ש - הרכב "התרחק מנקודת העצירה" כמו
 * הורה שהולך ברגל. הבדיקות מזינות את המכונה בדיוק כמו האפליקציה: מאגר של
 * 20 דגימות אחרונות, דגימה כל 45 שניות, ופעימת זמן אחרי כל דגימה.
 */
import { reduce } from '../src/services/tripStateMachine';
import { AutoTripSnapshot, GeoPoint, INITIAL_SNAPSHOT, TripState } from '../src/models/TripState';
import { config } from '../src/config';
import { makeTrack, makeStationary, pointNorthOf } from '../src/services/mockLocation';

const T0 = 1_000_000_000_000;
const STEP = config.LOCATION_UPDATE_INTERVAL_SECONDS * 1000;

/** נסיעה, עצירה של stopSamples דגימות, ואז תנועה במהירות moveMps. */
function scenario(moveMps: number, moveSamples: number, stopSamples = 5) {
  const drive = makeTrack({ startAt: T0, count: 10, intervalSeconds: STEP / 1000, speedMps: 15 });
  const last = drive[drive.length - 1];
  const origin = { latitude: last.latitude, longitude: last.longitude };
  const stopped = makeStationary({ startAt: last.timestamp + STEP, count: stopSamples, intervalSeconds: STEP / 1000, origin });
  const moving: GeoPoint[] = [];
  let t = stopped[stopped.length - 1].timestamp;
  for (let i = 1; i <= moveSamples; i++) {
    t += STEP;
    moving.push({ ...pointNorthOf(origin, moveMps * (STEP / 1000) * i), accuracy: 15, timestamp: t } as GeoPoint);
  }
  return [...drive, ...stopped, ...moving];
}

function feed(points: GeoPoint[], awaitMotionConfirmation = false) {
  let snap: AutoTripSnapshot = { ...INITIAL_SNAPSHOT, stateSince: T0 };
  let buffer: GeoPoint[] = [];
  const states: TripState[] = [];
  const effects: string[] = [];
  for (const p of points) {
    buffer = [...buffer, p].slice(-config.LOCATION_BUFFER_SIZE);
    for (const input of [
      { kind: 'LOCATION' as const, point: p, samples: buffer, now: p.timestamp },
      { kind: 'TICK' as const, now: p.timestamp + 1, awaitMotionConfirmation },
    ]) {
      const r = reduce(snap, input);
      snap = r.snapshot;
      effects.push(...r.effects.map((e) => e.type));
    }
    states.push(snap.state);
  }
  return { snap, states, effects };
}

describe('פקק לא מייצר אזהרה', () => {
  it.each([3.2, 4.5, 8])('זחילה ב-%s מ"ש אחרי עצירה ארוכה = הנסיעה ממשיכה', (mps) => {
    const { states, effects, snap } = feed(scenario(mps, 10));
    expect(states).toContain(TripState.GRACE_PERIOD); // העצירה זוהתה
    expect(effects).not.toContain('SEND_FIRST_WARNING');
    expect(snap.state).toBe(TripState.ACTIVE);
  });

  it('זחילה איטית מאוד באנדרואיד: מחכים לגוגל לפני אזהרה לפי מיקום בלבד', () => {
    // 1.5 מ"ש נראה בדיוק כמו הליכה. 4 דגימות = 3 דקות של זחילה.
    const { effects, states } = feed(scenario(1.5, 4), true);
    expect(states).toContain(TripState.LEFT_VEHICLE_AREA);
    expect(effects).not.toContain('SEND_FIRST_WARNING');
  });

  it('אבל אם גוגל לא מאשרת - האזהרה יוצאת בכל זאת, באיחור קטן', () => {
    const { effects } = feed(scenario(1.3, 12), true);
    expect(effects).toContain('SEND_FIRST_WARNING');
  });
});

describe('הליכה אמיתית מהרכב עדיין מתריעה', () => {
  it('הורה שהולך ברגל מהרכב, בלי זיהוי תנועה (אייפון) - אזהרה מיד', () => {
    const { effects, states } = feed(scenario(1.3, 6), false);
    expect(effects).toContain('SEND_FIRST_WARNING');
    expect(states).toContain(TripState.WARNING);
  });

  it('יציאה מרכב מגוגל בזמן ההמתנה - אזהרה מיד, בלי לחכות', () => {
    const { snap } = feed(scenario(1.3, 3), true);
    expect(snap.state).toBe(TripState.LEFT_VEHICLE_AREA);
    const r = reduce(snap, { kind: 'VEHICLE_EXIT', now: snap.stateSince + 10_000 });
    expect(r.snapshot.state).toBe(TripState.WARNING);
    expect(r.effects.map((e) => e.type)).toContain('SEND_FIRST_WARNING');
  });
});

describe('נקודת העצירה נבחרת מהעצירה עצמה', () => {
  it('דגימה מהנסיעה שלפני העצירה לא נבחרת, גם כשהיא מדויקת יותר', () => {
    const { pickStopPoint } = require('../src/services/tripDetection');
    const parked = { latitude: 32.1, longitude: 34.78, accuracy: 25, timestamp: T0 + 200_000 };
    const samples: GeoPoint[] = [
      // GPS בנסיעה: מדויק יותר, אבל 600 מטר אחורה בכביש.
      { ...pointNorthOf(parked, -600), accuracy: 5, timestamp: T0 } as GeoPoint,
      { ...parked, timestamp: T0 + 100_000 },
      { ...pointNorthOf(parked, 5), accuracy: 20, timestamp: T0 + 150_000 } as GeoPoint,
      parked,
    ];
    const stop = pickStopPoint(samples);
    expect(stop.accuracy).toBe(20);
  });
});
