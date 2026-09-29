import React, { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { ScreenHeader } from './ScreenHeader';

interface Props {
  children: ReactNode;
  footer?: ReactNode;
  /**
   * מציג כותרת עם כפתור חזרה.
   * כבוי כברירת מחדל: במסכי האונבורדינג חזרה אחורה שוברת את רצף
   * ההרשמה, ושם ההמשך הוא הפעולה היחידה שאמורה להיות זמינה.
   */
  showBack?: boolean;
  title?: string;
  backFallback?: string;
}

/** עטיפה אחידה למסכי טפסים - גלילה + הימנעות ממקלדת שמסתירה שדות. */
export function FormScreen({ children, footer, showBack, title, backFallback }: Props) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {showBack ? <ScreenHeader title={title} fallback={backFallback} /> : null}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
    flexGrow: 1,
  },
  footer: {
    padding: theme.spacing.lg,
    paddingTop: 0,
  },
});
