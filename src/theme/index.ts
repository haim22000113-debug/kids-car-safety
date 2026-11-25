import { Platform, ViewStyle } from 'react-native';
import { colors } from './colors';
import { typography, fontWeight, fonts } from './typography';
import { spacing, radius, minTouchTarget } from './spacing';

/** צל רך לכרטיסים. elevation באנדרואיד, shadow* באייפון. */
function shadow(level: 1 | 2): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation: level === 1 ? 2 : 6, shadowColor: colors.shadow },
    default: {
      shadowColor: colors.shadow,
      shadowOpacity: level === 1 ? 0.06 : 0.12,
      shadowRadius: level === 1 ? 10 : 18,
      shadowOffset: { width: 0, height: level === 1 ? 3 : 8 },
    },
  })!;
}

export const shadows = { card: shadow(1), raised: shadow(2) };

export const theme = {
  colors,
  typography,
  fontWeight,
  fonts,
  spacing,
  radius,
  minTouchTarget,
  shadows,
};

export type Theme = typeof theme;
export { colors, typography, fontWeight, fonts, spacing, radius, minTouchTarget };
