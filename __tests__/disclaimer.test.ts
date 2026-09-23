import AsyncStorage from '@react-native-async-storage/async-storage';
import { DisclaimerStorage } from '../src/storage';
import { CURRENT_DISCLAIMER_VERSION } from '../src/storage/DisclaimerStorage';
import { DISCLAIMER_POINTS, DISCLAIMER_EMERGENCY } from '../src/content/disclaimer';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('אישור האזהרה', () => {
  it('הורה חדש נחשב כמי שלא אישר', async () => {
    expect(await DisclaimerStorage.hasAcceptedCurrent()).toBe(false);
    expect(await DisclaimerStorage.getAcceptance()).toBeNull();
  });

  it('אחרי אישור נשמרת הגרסה והתאריך', async () => {
    const acceptance = await DisclaimerStorage.accept();

    expect(acceptance.version).toBe(CURRENT_DISCLAIMER_VERSION);
    expect(Number.isNaN(Date.parse(acceptance.acceptedAt))).toBe(false);
    expect(await DisclaimerStorage.hasAcceptedCurrent()).toBe(true);
  });

  it('אישור של גרסה ישנה לא נחשב - ההורה יתבקש לאשר מחדש', async () => {
    // מדמה הורה שאישר נוסח קודם, לפני שעדכנו את האזהרה.
    await AsyncStorage.setItem(
      '@kids_car_safety/disclaimer',
      JSON.stringify({ version: CURRENT_DISCLAIMER_VERSION - 1, acceptedAt: new Date().toISOString() })
    );

    expect(await DisclaimerStorage.hasAcceptedCurrent()).toBe(false);
  });
});

describe('תוכן האזהרה', () => {
  it('כולל את הנקודות הקריטיות שאסור שייעלמו בעריכה עתידית', () => {
    const all = DISCLAIMER_POINTS.join(' ');

    // האפליקציה לא מזהה ילדים - הנחת היסוד שהכי חשוב שההורה יבין.
    expect(all).toContain('אינה מזהה ילדים');
    // אסור להשאיר ילד לבד ברכב.
    expect(all).toContain('אל תשאיר ילד לבד ברכב');
    // האחריות נשארת אצל ההורה.
    expect(all).toContain('האחריות לבטיחות הילדים היא שלך');
    // מספר החירום מופיע בנפרד ובולט.
    expect(DISCLAIMER_EMERGENCY).toContain('101');
  });
});
