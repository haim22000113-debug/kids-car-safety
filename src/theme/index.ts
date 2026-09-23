import { colors } from './colors';
import { typography, fontWeight } from './typography';
import { spacing, radius, minTouchTarget } from './spacing';

export const theme = {
  colors,
  typography,
  fontWeight,
  spacing,
  radius,
  minTouchTarget,
};

export type Theme = typeof theme;
export { colors, typography, fontWeight, spacing, radius, minTouchTarget };
