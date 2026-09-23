import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { Button } from './Button';

interface Props {
  error?: string | null;
  onRetry?: () => void;
}

/**
 * מסך טעינה אחיד לכל האפליקציה (Phase 7 - Polish).
 * לפני כן מסכים שהיו טוענים נתונים הציגו מסך לבן ריק בזמן ההמתנה, מה שגרם
 * למשתמשים לחשוב שהאפליקציה "תקועה". עכשיו מוצג ספינר ברור, ואם קרתה שגיאה
 * בלתי צפויה בטעינה - מוצגת הודעה ידידותית עם כפתור "נסה שוב" במקום להשאיר
 * מסך ריק לצמיתות (סעיף 27 - Error Handling: לעולם לא מסך תקוע).
 */
export function LoadingScreen({ error, onRetry }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          {onRetry ? (
            <Button title="נסה שוב" onPress={onRetry} style={styles.retryButton} />
          ) : null}
        </View>
      ) : (
        <ActivityIndicator size="large" color={theme.colors.primary} accessibilityLabel="טוען" />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  errorBox: {
    alignItems: 'center',
    width: '100%',
  },
  errorText: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  retryButton: {
    minWidth: 160,
  },
});
