import {
  timeOfDayGreeting,
  personalGreeting,
  tripWish,
  TRIP_WISHES,
} from '../src/content/greetings';

const at = (hour: number, day = 15) => new Date(2026, 9, day, hour, 30);

describe('greetings', () => {
  it('picks the greeting by hour of day', () => {
    expect(timeOfDayGreeting(at(7))).toBe('בוקר טוב');
    expect(timeOfDayGreeting(at(13))).toBe('צהריים טובים');
    expect(timeOfDayGreeting(at(17))).toBe('אחר הצהריים טובים');
    expect(timeOfDayGreeting(at(20))).toBe('ערב טוב');
    expect(timeOfDayGreeting(at(2))).toBe('לילה טוב');
  });

  it('adds the name, and works without one', () => {
    expect(personalGreeting('דנה', at(13))).toBe('צהריים טובים, דנה');
    expect(personalGreeting('  ', at(13))).toBe('צהריים טובים');
  });

  it('keeps the same trip wish all day and rotates between days', () => {
    expect(tripWish(at(6))).toBe(tripWish(at(22)));
    const wishes = new Set([at(12, 1), at(12, 2), at(12, 3)].map(tripWish));
    expect(wishes.size).toBe(TRIP_WISHES.length);
  });
});
