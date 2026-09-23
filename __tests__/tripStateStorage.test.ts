import AsyncStorage from '@react-native-async-storage/async-storage';
import { TripStateStorage } from '../src/storage';
import { AutoTripSnapshot, TripState } from '../src/models/TripState';

/**
 * בדיקות שמירת מצב הנסיעה לדיסק.
 *
 * זה המנגנון שאמור להבטיח שאזהרה פעילה שורדת סגירה של האפליקציה על ידי
 * מערכת ההפעלה. בלי הבדיקות האלה אין שום דרך לדעת שהוא עובד, כי התרחיש
 * האמיתי דורש שאנדרואיד יהרוג את האפליקציה באמצע אזהרה.
 */

const T0 = 1_000_000_000_000;
const hours = (n: number) => n * 60 * 60 * 1000;

beforeEach(async () => {
  await AsyncStorage.clear();
});

function snapshotAt(state: TripState, stateSince: number): AutoTripSnapshot {
  return { state, stateSince, manual: false, firstWarningAt: stateSince };
}

describe('שמירת מצב הנסיעה', () => {
  it('אזהרה פעילה שורדת סגירה של האפליקציה', async () => {
    await TripStateStorage.save(snapshotAt(TripState.WARNING, T0));

    const restored = await TripStateStorage.load(T0 + hours(1));

    expect(restored?.state).toBe(TripState.WARNING);
    expect(restored?.firstWarningAt).toBe(T0);
  });

  it('מצב ESCALATION משוחזר גם הוא', async () => {
    await TripStateStorage.save(snapshotAt(TripState.ESCALATION, T0));
    const restored = await TripStateStorage.load(T0 + hours(1));
    expect(restored?.state).toBe(TripState.ESCALATION);
  });

  it('לא משחזר אזהרה ישנה מדי', async () => {
    // אזהרה מלפני שמונה שעות. ההורה מזמן יצא מהרכב, והצגה שלה עכשיו רק
    // תלמד אותו להתעלם מהאפליקציה.
    await TripStateStorage.save(snapshotAt(TripState.WARNING, T0));

    const restored = await TripStateStorage.load(T0 + hours(8));

    expect(restored).toBeNull();
  });

  it('לא משחזר מצב עם חותמת זמן עתידית', async () => {
    // שעון שקפץ (שינוי אזור זמן, כיוון ידני) - מצב לא אמין, מוותרים עליו.
    await TripStateStorage.save(snapshotAt(TripState.WARNING, T0 + hours(2)));

    const restored = await TripStateStorage.load(T0);

    expect(restored).toBeNull();
  });

  it('לא משחזר מצבים שלא דורשים פעולה של ההורה', async () => {
    await TripStateStorage.save(snapshotAt(TripState.CONFIRMED_SAFE, T0));
    expect(await TripStateStorage.load(T0 + 1000)).toBeNull();

    await TripStateStorage.save(snapshotAt(TripState.POSSIBLE_TRIP, T0));
    expect(await TripStateStorage.load(T0 + 1000)).toBeNull();
  });

  it('שמירת IDLE מוחקת את המצב במקום לשמור אותו', async () => {
    await TripStateStorage.save(snapshotAt(TripState.WARNING, T0));
    await TripStateStorage.save(snapshotAt(TripState.IDLE, T0));

    expect(await TripStateStorage.load(T0 + 1000)).toBeNull();
  });

  it('מחזיר null כשאין שום דבר שמור', async () => {
    expect(await TripStateStorage.load(T0)).toBeNull();
  });
});

describe('מזהי ההתראות של שרשרת האזהרה', () => {
  it('נשמרים ונטענים, כדי שאפשר יהיה לבטל אותם אחרי אתחול', async () => {
    await TripStateStorage.saveWarningIds(['a', 'b', 'c']);
    expect(await TripStateStorage.loadWarningIds()).toEqual(['a', 'b', 'c']);
  });

  it('מחזיר רשימה ריקה ולא קורס כשאין מזהים', async () => {
    expect(await TripStateStorage.loadWarningIds()).toEqual([]);
  });

  it('ניקוי מוחק אותם', async () => {
    await TripStateStorage.saveWarningIds(['a']);
    await TripStateStorage.clearWarningIds();
    expect(await TripStateStorage.loadWarningIds()).toEqual([]);
  });
});
