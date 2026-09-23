export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

// גובה מינימלי לכפתורים כדי שיהיו גדולים ונוחים ללחיצה (סעיף 22 - Accessibility).
export const minTouchTarget = 56;
