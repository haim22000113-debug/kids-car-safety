import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, ViewStyle, Pressable } from 'react-native';
import { theme } from '../theme';
import { TEXT_RIGHT } from '../i18n/rtl';
import { Icon, IconName } from './Icon';

/** כרטיס לבן עם צל רך. אופציונלית: כותרת עם אייקון. */
export function Card({
  title,
  icon,
  children,
  style,
}: {
  title?: string;
  icon?: IconName;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.card, style]}>
      {title ? (
        <View style={styles.header}>
          {icon ? (
            <View style={styles.iconWrap}>
              <Icon name={icon} size={18} color={theme.colors.primary} />
            </View>
          ) : null}
          <Text style={styles.title}>{title}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** עיגול צבעוני עם אייקון - לכותרות מסכים ולכרטיסי מצב. */
export function IconBadge({
  name,
  color,
  background,
  size = 64,
  halo = false,
}: {
  name: IconName;
  color: string;
  background: string;
  size?: number;
  /** טבעת רכה מסביב - לאייקון הראשי של מסך שלם. */
  halo?: boolean;
}) {
  const badge = (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }]}>
      <Icon name={name} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
  if (!halo) return badge;
  const outer = Math.round(size * 1.45);
  return (
    <View
      style={[
        styles.badge,
        { width: outer, height: outer, borderRadius: outer / 2, backgroundColor: background, opacity: 1 },
      ]}
    >
      <View style={[StyleSheet.absoluteFill, { borderRadius: outer / 2, backgroundColor: '#FFFFFF', opacity: 0.45 }]} />
      {badge}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md + 4,
    marginBottom: theme.spacing.md,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: theme.typography.subtitle,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
  },
  badge: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: 52,
    paddingVertical: theme.spacing.sm,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  rowPressed: { opacity: 0.6 },
  rowLabel: {
    flex: 1,
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.medium,
    textAlign: TEXT_RIGHT,
  },
});

/**
 * שורה לחיצה ברשימת הגדרות: אייקון, טקסט וחץ. במקום שורת כפתורי טקסט
 * אפורים, שלא נראו לחיצים.
 */
export function ListRow({
  icon,
  label,
  onPress,
  tone = 'default',
  last = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  last?: boolean;
}) {
  const color = tone === 'danger' ? theme.colors.danger : theme.colors.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.rowPressed]}
    >
      <Icon name={icon} size={20} color={tone === 'danger' ? theme.colors.danger : theme.colors.primary} />
      <Text style={[styles.rowLabel, { color }]}>{label}</Text>
      <Icon name="chevron-back" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}
