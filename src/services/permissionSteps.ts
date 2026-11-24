/**
 * ההגדרה המודרכת של ההרשאות: איזה שלב מציגים עכשיו.
 *
 * סקירת מוצר (24.11): שמונה פריטים ברצף במסך אחד מפחידים הורה חדש, והוא
 * לוחץ "המשך בינתיים" בלי לאשר כלום. בהגדרה הראשונית מציגים שלב אחד בכל
 * פעם. מסך ההרשאות מההגדרות נשאר רשימה, כי שם ההורה בא לתקן דבר מסוים.
 */
export interface StepState {
  key: string;
  granted: boolean;
}

/** האינדקס של השלב הראשון שעוד לא אושר ולא דולג, או -1 כשסיימנו. */
export function currentStepIndex(steps: StepState[], skipped: ReadonlySet<string>): number {
  return steps.findIndex((s) => !s.granted && !skipped.has(s.key));
}

/** כמה שלבים עוד חסרים בסוף (דולגו או נדחו). */
export function missingSteps(steps: StepState[]): string[] {
  return steps.filter((s) => !s.granted).map((s) => s.key);
}
