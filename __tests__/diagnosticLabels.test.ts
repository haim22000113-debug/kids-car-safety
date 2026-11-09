import * as fs from 'fs';
import * as path from 'path';
import {
  EVENT_LABELS,
  NATIVE_LABELS,
  STATE_LABELS,
  translateDetail,
  nativeLabel,
} from '../src/content/diagnosticLabels';
import { TripEventName } from '../src/services/eventLog';
import { TripState } from '../src/models/TripState';

/** כל הקודים שהצד הנייטיב כותב ליומן, נשלפים ישירות מקבצי ה-Kotlin. */
function nativeCodesInSource(): string[] {
  const dir = path.join(__dirname, '../modules/vehicle-detection/android/src/main/java');
  const codes = new Set<string>();
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.kt')) {
        const text = fs.readFileSync(full, 'utf8');
        for (const m of text.matchAll(/appendHistory\(\s*context,\s*"([A-Z_]+)"/g)) codes.add(m[1]);
      }
    }
  };
  walk(dir);
  return [...codes];
}

describe('יומן האבחון בעברית', () => {
  it('לכל אירוע ולכל מצב יש תרגום', () => {
    for (const name of Object.values(TripEventName)) expect(EVENT_LABELS[name]).toBeTruthy();
    for (const state of Object.values(TripState)) expect(STATE_LABELS[state]).toBeTruthy();
  });

  it('לכל קוד שהצד הנייטיב כותב יש תרגום', () => {
    const codes = nativeCodesInSource();
    expect(codes.length).toBeGreaterThan(10);
    const missing = codes.filter((c) => !NATIVE_LABELS[c]);
    expect(missing).toEqual([]);
  });

  it('מתרגם את השורות מבדיקת השטח', () => {
    expect(nativeLabel('EXIT') + ' — ' + translateDetail('delay=18s')).toBe(
      'גוגל: יציאה מהרכב — איחור של 18 שניות'
    );
    expect(translateDetail('alarm_in=59s call_in=119s')).toBe('אזעקה בעוד 59 שניות, שיחה בעוד 119 שניות');
    expect(translateDetail('ACTIVE → GRACE_PERIOD')).toBe('בנסיעה → זמן חסד');
    expect(translateDetail('WARNING → CONFIRMED_SAFE')).toBe('אזהרה → אושר');
    expect(translateDetail('children not with me')).toBe('הילדים לא איתי');
    expect(translateDetail('BOOT_COMPLETED')).toBe('הטלפון הופעל');
    expect(translateDetail('ENTER delay=1013s')).toBe('כניסה, איחור של 1013 שניות');
    expect(translateDetail('הגנה: מיקום=true, תנועה=false')).toBe('הגנה: מיקום=כן, תנועה=לא');
  });

  it('פרטים בעברית נשארים כמו שהם', () => {
    expect(translateDetail('רדיוס 120 מטר')).toBe('רדיוס 120 מטר');
  });
});
