import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * אייקון אחיד לכל האפליקציה (Ionicons), במקום אימוג'י.
 * אימוג'י נראים אחרת בכל טלפון (סמסונג, פיקסל, אייפון) ולא מתאימים לצבעי
 * המצב. אייקון וקטורי מקבל את הצבע שלנו ונראה אותו דבר בכל מכשיר.
 *
 * שים לב לכיוון: אייקונים לא מתהפכים לבד ב-RTL. "חזור" = chevron-forward.
 */
export function Icon({
  name,
  size = 22,
  color = theme.colors.textPrimary,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}
