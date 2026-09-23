// גדלי טקסט ברורים וגדולים כדי לתמוך בסעיף 22 (Accessibility) וסעיף 21 (מעט טקסט, קריאות מיידית).
export const typography = {
  title: 28,
  subtitle: 20,
  body: 16,
  caption: 13,
  button: 18,
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium: '600' as const,
  bold: '700' as const,
};
