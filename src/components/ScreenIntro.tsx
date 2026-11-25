import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { IconName } from './Icon';
import { IconBadge } from './Card';

/**
 * ראש מסך אחיד: נקודות התקדמות (בהגדרה הראשונית), אייקון, כותרת והסבר.
 */
export function ScreenIntro({
  icon,
  title,
  subtitle,
  step,
  steps,
  tone = 'primary',
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  /** 1-based. מוצג רק כששניהם קיימים. */
  step?: number;
  steps?: number;
  tone?: 'primary' | 'danger' | 'success';
}) {
  const fg = tone === 'danger' ? theme.colors.danger : tone === 'success' ? theme.colors.success : theme.colors.primary;
  const bg =
    tone === 'danger' ? theme.colors.dangerSoft : tone === 'success' ? theme.colors.successSoft : theme.colors.primarySoft;
  return (
    <View style={styles.wrap}>
      {step && steps ? (
        <View style={styles.dots} accessibilityLabel={`שלב ${step} מתוך ${steps}`}>
          {Array.from({ length: steps }, (_, i) => (
            <View key={i} style={[styles.dot, i < step ? styles.dotDone : null, i === step - 1 ? styles.dotNow : null]} />
          ))}
        </View>
      ) : null}
      <IconBadge name={icon} color={fg} background={bg} size={64} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginBottom: theme.spacing.lg },
  dots: { flexDirection: 'row', gap: 6, marginBottom: theme.spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.border },
  dotDone: { backgroundColor: theme.colors.primary },
  dotNow: { width: 24 },
  title: {
    fontSize: theme.typography.title - 2,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  subtitle: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    lineHeight: 23,
  },
});
