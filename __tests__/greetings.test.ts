import {
  timeOfDayGreeting,
  personalGreeting,
  pickDifferent,
  tripWish,
  wishIndexOf,
  joinHebrewNames,
  TRIP_WISHES,
  GREETING_VARIANTS,
} from '../src/content/greetings';

const at = (hour: number) => new Date(2026, 9, 15, hour, 30);

describe('greetings', () => {
  it('picks the greeting by hour of day', () => {
    expect(timeOfDayGreeting(at(7))).toBe('בוקר טוב');
    expect(timeOfDayGreeting(at(13))).toBe('צהריים טובים');
    expect(timeOfDayGreeting(at(17))).toBe('אחר הצהריים טובים');
    expect(timeOfDayGreeting(at(20))).toBe('ערב טוב');
    expect(timeOfDayGreeting(at(23))).toBe('ערב טוב');
    expect(timeOfDayGreeting(at(2))).toBe('לילה טוב');
  });

  it('has more than one wording for every part of the day', () => {
    for (const hour of [7, 13, 17, 20, 2]) {
      const options = new Set(
        Array.from({ length: GREETING_VARIANTS }, (_, v) => timeOfDayGreeting(at(hour), v))
      );
      expect(options.size).toBe(GREETING_VARIANTS);
    }
  });

  it('adds the name, and works without one', () => {
    expect(personalGreeting('דנה', at(13))).toBe('צהריים טובים, דנה');
    expect(personalGreeting('  ', at(13))).toBe('צהריים טובים');
  });

  it('never picks the same option twice in a row', () => {
    for (let previous = 0; previous < 5; previous++) {
      for (const random of [0, 0.25, 0.5, 0.75, 0.9999]) {
        const next = pickDifferent(5, previous, random);
        expect(next).not.toBe(previous);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(5);
      }
    }
    // כל האפשרויות האחרות זמינות, לא רק "הבא בתור".
    const reachable = new Set([0, 0.3, 0.6, 0.9].map((r) => pickDifferent(5, 0, r)));
    expect(reachable).toEqual(new Set([1, 2, 3, 4]));
  });

  it('uses the wish saved on the trip, and falls back for old trips', () => {
    expect(wishIndexOf({ wishIndex: 3, startTime: '2026-10-15T10:00:00Z' })).toBe(3);
    const old = wishIndexOf({ startTime: '2026-10-15T10:00:00Z' });
    expect(old).toBeGreaterThanOrEqual(0);
    expect(old).toBeLessThan(TRIP_WISHES.length);
  });

  it('joins children names in Hebrew', () => {
    expect(joinHebrewNames(['דנה'])).toBe('דנה');
    expect(joinHebrewNames(['דנה', 'יואב'])).toBe('דנה ויואב');
    expect(joinHebrewNames(['דנה', 'יואב', 'נועה'])).toBe('דנה, יואב ונועה');
  });

  it('uses the plural form when children are named', () => {
    TRIP_WISHES.forEach((_, i) => {
      expect(tripWish(i, ['דנה', 'יואב'])).toContain('דנה ויואב');
      expect(tripWish(i, ['דנה', 'יואב'])).not.toContain('לך ');
      expect(tripWish(i)).not.toContain('לכם');
    });
  });
});
