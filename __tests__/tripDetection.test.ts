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
