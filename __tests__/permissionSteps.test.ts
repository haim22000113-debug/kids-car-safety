import { currentStepIndex, missingSteps } from '../src/services/permissionSteps';

const steps = (...granted: boolean[]) => granted.map((g, i) => ({ key: `s${i}`, granted: g }));

describe('הגדרת הרשאות מודרכת', () => {
  it('מציגה את השלב הראשון שחסר', () => {
    expect(currentStepIndex(steps(true, false, false), new Set())).toBe(1);
  });

  it('אחרי אישור עוברת לשלב הבא', () => {
    expect(currentStepIndex(steps(true, true, false), new Set())).toBe(2);
  });

  it('שלב שדולג לא חוזר, אבל נשאר ברשימת החסרים', () => {
    const s = steps(true, false, false);
    expect(currentStepIndex(s, new Set(['s1']))).toBe(2);
    expect(missingSteps(s)).toEqual(['s1', 's2']);
  });

  it('כשהכל אושר או דולג - סיימנו', () => {
    expect(currentStepIndex(steps(true, true), new Set())).toBe(-1);
    expect(currentStepIndex(steps(true, false), new Set(['s1']))).toBe(-1);
  });
});
