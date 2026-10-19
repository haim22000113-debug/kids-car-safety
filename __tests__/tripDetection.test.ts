import { assessTripStart, assessTripStop, pickStopPoint } from '../src/services/tripDetection';
import { distanceMeters, hasLeftVehicleArea, isReliable } from '../src/services/geoUtils';
import { makeTrack, makeStationary, makePointAtDistance, ORIGIN, pointNorthOf } from '../src/services/mockLocation';
import { config } from '../src/config';

describe('geoUtils', () => {
  it('מחשב מרחק בין שתי נקודות בדיוק סביר', () => {
    const a = ORIGIN;
    const b = pointNorthOf(ORIGIN, 1000);
    const d = distanceMeters(a, b);
    // סובלנות של אחוז - נוסחת haversine מול הקירוב הליניארי של המחולל.
    expect(d).toBeGreaterThan(990);
    expect(d).toBeLessThan(1010);
  });

  it('פוסל דגימה עם דיוק גרוע', () => {
    expect(isReliable({ ...ORIGIN, accuracy: 500, timestamp: 1 })).toBe(false);
    expect(isReliable({ ...ORIGIN, accuracy: 10, timestamp: 1 })).toBe(true);
  });
});

describe('זיהוי תחילת נסיעה', () => {
  it('מזהה נסיעה אמיתית', () => {
    // 10 דגימות כל 30 שניות במהירות 15 מ"ש = 4.5 דקות, 4050 מטר.
    const result = assessTripStart(makeTrack());
    expect(result.isTrip).toBe(true);
    expect(result.distanceMeters).toBeGreaterThanOrEqual(config.TRIP_START_MIN_DISTANCE_METERS);
  });

  it('תרחיש 40: הליכה ברגל אינה נסיעה', () => {
    // הורה שהולך לשכן: 1.3 מ"ש (הליכה רגילה), 12 דקות, ~940 מטר.
    // המרחק והזמן עוברים את הסף - רק המהירות מפרידה בין השניים.
    const walking = makeTrack({ speedMps: 1.3, count: 25, intervalSeconds: 30 });
    const result = assessTripStart(walking);

    expect(result.isTrip).toBe(false);
    expect(result.samplesAboveSpeed).toBe(0);
  });

  it('תנועה קצרה של כמה מטרים אינה נסיעה', () => {
    const result = assessTripStart(makeStationary({ count: 5 }));
    expect(result.isTrip).toBe(false);
    expect(result.isPossible).toBe(false);
  });

  it('מסמן POSSIBLE_TRIP כשיש מהירות אבל עוד לא מספיק מרחק', () => {
    // שתי דגימות במהירות נסיעה, אבל רק דקה אחת ו-900 מטר.
    const short = makeTrack({ count: 4, intervalSeconds: 20, speedMps: 15 });
    const result = assessTripStart(short);
    expect(result.isTrip).toBe(false);
    expect(result.isPossible).toBe(true);
  });

  it('מתעלם מדגימות עם דיוק גרוע', () => {
    const noisy = makeTrack({ accuracy: 400 });
    const result = assessTripStart(noisy);
    expect(result.isTrip).toBe(false);
    expect(result.reason).toContain('אמינות');
  });
});

describe('זיהוי עצירה', () => {
  it('מזהה עצירה אחרי שהמכשיר לא זז מספיק זמן', () => {
    const stationary = makeStationary({ count: 8, intervalSeconds: 30 });
    const result = assessTripStop(stationary);
    expect(result.hasStopped).toBe(true);
    expect(result.stationarySeconds).toBeGreaterThanOrEqual(config.TRIP_STOP_DURATION_SECONDS);
  });

  it('לא מזהה עצירה בעמידה קצרה ברמזור', () => {
    // 60 שניות בלבד - מתחת לסף של 120.
    const shortStop = makeStationary({ count: 3, intervalSeconds: 30 });
    expect(assessTripStop(shortStop).hasStopped).toBe(false);
  });

  it('לא מזהה עצירה כשהמכשיר עדיין נוסע', () => {
    expect(assessTripStop(makeTrack()).hasStopped).toBe(false);
  });

  it('בוחר כנקודת עצירה את הדגימה המדויקת ביותר', () => {
    const samples = makeStationary({ count: 5 });
    samples[samples.length - 1].accuracy = 60;
    samples[samples.length - 3].accuracy = 4;

    const stop = pickStopPoint(samples);
    expect(stop?.accuracy).toBe(4);
  });
});

describe('יציאה מאזור הרכב', () => {
  const stop = ORIGIN;

  it('לא מתריע כשההורה עדיין ליד הרכב', () => {
    const near = makePointAtDistance(stop, 40);
    expect(hasLeftVehicleArea(stop, near)).toBe(false);
  });

  it('מזהה יציאה כשההורה התרחק משמעותית', () => {
    const far = makePointAtDistance(stop, 400);
    expect(hasLeftVehicleArea(stop, far)).toBe(true);
  });

  it('דיוק גרוע לא מייצר התרעת שווא', () => {
    // 200 מטר מהעצירה, אבל עם דיוק של ±150 מטר - לא מספיק ודאי.
    const uncertain = makePointAtDistance(stop, 200, { accuracy: 90 });
    expect(hasLeftVehicleArea(stop, uncertain)).toBe(false);
  });
});

/**
 * בדיקות שטח הראו שהזיהוי לפי מיקום כמעט לא עובד בפועל. שתי סיבות:
 *
 * 1. במצב חיסכון בסוללה הטלפון לרוב לא מדווח מהירות בכלל, והזיהוי הסתמך
 *    רק על המהירות המדווחת - ולכן אף פעם לא זיהה נסיעה.
 * 2. כשהרכב חונה, הדיוק בחניונים ובין בניינים גרוע, והמיקום "קופץ" יותר
 *    מ-30 המטרים שזיהוי העצירה סבל - ולכן לא זיהה עצירה.
 *
 * הבדיקות כאן מוודאות שהתיקון עובד, ובעיקר שהוא לא מחזיר את אזעקות השווא
 * על הליכה ועל רעידות GPS.
 */
describe('זיהוי כשהטלפון לא מדווח מהירות', () => {
  const noSpeed = (points: ReturnType<typeof makeTrack>) =>
    points.map((p) => ({ ...p, speed: null }));

  it('מזהה נסיעה גם בלי מהירות מדווחת - מחשב אותה מהמרחק והזמן', () => {
    const drive = noSpeed(makeTrack({ count: 8, intervalSeconds: 45, speedMps: 15, accuracy: 30 }));
    expect(assessTripStart(drive).isTrip).toBe(true);
  });

  it('תרחיש 40 גם כאן: הליכה בלי מהירות מדווחת אינה נסיעה', () => {
    const walk = noSpeed(makeTrack({ count: 25, intervalSeconds: 45, speedMps: 1.4, accuracy: 15 }));
    const result = assessTripStart(walk);
    expect(result.isTrip).toBe(false);
    expect(result.isPossible).toBe(false);
  });

  it('רעידות GPS של טלפון שעומד במקום לא נחשבות לנסיעה', () => {
    // קפיצות של 80 מטר כל 45 שניות = "1.8 מ"ש" - אבל הדיוק הוא 60 מטר,
    // אז המרחק קטן מחוסר הוודאות של שתי הנקודות ואי אפשר לסמוך עליו.
    const jitter = noSpeed(
      makeStationary({ count: 12, intervalSeconds: 45, accuracy: 60, jitterMeters: 40 })
    );
    const result = assessTripStart(jitter);
    expect(result.isTrip).toBe(false);
    expect(result.isPossible).toBe(false);
  });

  it('קפיצה גדולה במיוחד של GPS לא נחשבת למהירות נסיעה', () => {
    // נקודה אחת שקפצה 150 מטר בדיוק של 90 מטר - בתוך חוסר הוודאות.
    const base = makeStationary({ count: 4, intervalSeconds: 45, accuracy: 90, jitterMeters: 0 });
    base[2] = { ...base[2], ...pointNorthOf(ORIGIN, 150) };
    expect(assessTripStart(noSpeed(base)).samplesAboveSpeed).toBe(0);
  });
});

describe('זיהוי עצירה כשהדיוק גרוע', () => {
  it('מזהה עצירה גם כשהמיקום "קופץ" יותר מ-30 מטר בגלל דיוק גרוע', () => {
    const parked = makeStationary({ count: 5, intervalSeconds: 45, accuracy: 60, jitterMeters: 22 });
    expect(assessTripStop(parked).hasStopped).toBe(true);
  });

  it('פקק איטי אינו עצירה', () => {
    // 2.5 מ"ש = 9 קמ"ש. כל 45 שניות זה 112 מטר - יותר מכל סובלנות דיוק.
    const traffic = makeTrack({ count: 6, intervalSeconds: 45, speedMps: 2.5, accuracy: 60 });
    expect(assessTripStop(traffic).hasStopped).toBe(false);
  });

  it('עם דיוק טוב, הסובלנות נשארת 30 מטר כמו קודם', () => {
    // תזוזה של 40 מטר בדיוק של 10 מטר - זו תזוזה אמיתית, לא רעש.
    const creeping = makeStationary({ count: 5, intervalSeconds: 45, accuracy: 10, jitterMeters: 20 });
    expect(assessTripStop(creeping).hasStopped).toBe(false);
  });
});
