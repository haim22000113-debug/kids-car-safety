import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { theme } from '../theme';

interface Props {
  title?: string;
  /**
   * לאן ללכת אם אין היסטוריה לחזור אליה.
   * רלוונטי כשהמסך נפתח מלחיצה על התראה ולא מניווט רגיל.
   */
  fallback?: string;
}

/**
 * כותרת מסך עם כפתור חזרה.
 *
 * למה זה קיים: לאפליקציה אין כותרות ניווט (headerShown: false), ולכן עד
 * עכשיו לא היה בשום מסך כפתור חזרה - רק כפתור החזרה של אנדרואיד. הורה
 * שלא רגיל להשתמש בו נתקע. במסך איש הקשר זה היה חמור במיוחד: הכפתור
 * היחיד היה "שמור", והוא דורש שם וטלפון תקינים, כך שמי שנכנס רק להציץ
 * לא יכול היה לצאת בלי למלא את הטופס.
 *
 * החץ מצביע ימינה כי הממשק כולו בעברית מימין לשמאל.
 */
export function ScreenHeader({ title, fallback = '/home' }: Props) {
  const goBack = () => {
    // canGoBack מחזיר false כשהמסך נפתח ישירות, למשל מלחיצה על התראה.
    // בלי הבדיקה הזו הלחיצה פשוט לא הייתה עושה כלום.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallback);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        onPress={goBack}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="חזור"
        hitSlop={12}
      >
        <Text style={styles.backArrow}>→</Text>
      </Pressable>

      {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}

      {/* מרווח באותו רוחב של הכפתור, כדי שהכותרת תישאר ממורכזת באמת. */}
      <View style={styles.backButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 28,
    color: theme.colors.primary,
    lineHeight: 32,
  },
  title: {
    flex: 1,
    fontSize: theme.typography.subtitle,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
});
