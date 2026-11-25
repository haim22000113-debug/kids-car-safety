// גדלי טקסט ברורים וגדולים כדי לתמוך בסעיף 22 (Accessibility) וסעיף 21 (מעט טקסט, קריאות מיידית).
export const typography = {
  hero: 32,
  title: 26,
  subtitle: 19,
  body: 16,
  caption: 13,
  button: 17,
} as const;

/**
 * הגופן: Rubik, שיש לו עברית מעוגלת וחמה, ונטען ב-app/_layout.
 *
 * באנדרואיד, גופן מותאם לא בוחר משקל לפי fontWeight - כל משקל הוא משפחה
 * נפרדת. לכן **משתמשים ב-fonts ולא ב-fontWeight**: `fontFamily: fonts.bold`.
 * אם הגופן לא נטען (נדיר), אנדרואיד נופל לגופן המערכת וזה עדיין קריא.
 */
export const fonts = {
  regular: 'Rubik_400Regular',
  medium: 'Rubik_500Medium',
  semibold: 'Rubik_600SemiBold',
  bold: 'Rubik_700Bold',
} as const;

/** נשאר לתאימות. בקוד חדש - fonts. */
export const fontWeight = {
  regular: '400' as const,
  medium: '600' as const,
  bold: '700' as const,
};
