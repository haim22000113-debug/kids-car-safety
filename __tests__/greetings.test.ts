import {
  timeOfDayGreeting,
  personalGreeting,
  tripWish,
  joinHebrewNames,
  TRIP_WISHES,
} from '../src/content/greetings';

const at = (hour: number, day = 15) => new Date(2026, 9, day, hour, 30);

describe('greetings', () => {
  it('picks the greeting by hour of day', () => {
    expect(timeOfDayGreeting(at(7))).toBe('בוקר טוב');
    expect(timeOfDayGreeting(at(13))).toBe('צהריים טובים');
    expect(timeOfDayGreeting(at(17))).toBe('אחר הצהריים טובים');
    expect(timeOfDayGreeting(at(20))).toBe('ערב טוב');
    expect(timeOfDayGreeting(at(23))).toBe('ערב טוב');
    expect(timeOfDayGreeting(at(2))).toBe('לילה טוב');
  });

  it('adds the name, and works without one', () => {
    expect(personalGreeting('דנה', at(13))).toBe('צהריים טובים, דנה');
    expect(personalGreeting('  ', at(13))).toBe('צהריים טובים');
  });

  it('keeps the same trip wish all day and rotates between days', () => {
    expect(tripWish(at(6))).toBe(tripWish(at(22)));
    const days = TRIP_WISHES.map((_, i) => at(12, i + 1));
    expect(new Set(days.map((d) => tripWish(d))).size).toBe(TRIP_WISHES.length);
  });

  it('joins children names in Hebrew', () => {
    expect(joinHebrewNames(['דנה'])).toBe('דנה');
    expect(joinHebrewNames(['דנה', 'יואב'])).toBe('דנה ויואב');
    expect(joinHebrewNames(['דנה', 'יואב', 'נועה'])).toBe('דנה, יואב ונועה');
  });

  it('uses the plural form when children are named', () => {
    for (let day = 1; day <= TRIP_WISHES.length; day++) {
      expect(tripWish(at(12, day), ['דנה', 'יואב'])).toContain('דנה ויואב');
      expect(tripWish(at(12, day), ['דנה', 'יואב'])).not.toContain('לך ');
      expect(tripWish(at(12, day))).not.toContain('לכם');
    }
  });
});
