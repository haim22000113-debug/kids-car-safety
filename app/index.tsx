import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/components/Button';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { theme } from '../src/theme';
import { UserStorage, DisclaimerStorage } from '../src/storage';

// Welcome (סעיף 6).
export default function Welcome() {
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback((cancelledRef: { current: boolean }) => {
    setChecking(true);
    setError(null);
    Promise.all([UserStorage.getUser(), DisclaimerStorage.hasAcceptedCurrent()])
      .then(([user, acceptedDisclaimer]) => {
        if (cancelledRef.current) return;
        if (user?.onboardingCompleted) {
          // הורה קיים: אם הוא עוד לא אישר את האזהרה (למשל שדרג מגרסה
          // קודמת שבה היא לא הייתה) - חוסמים אותו עד שיאשר.
          router.replace(acceptedDisclaimer ? '/home' : '/disclaimer');
        } else {
          // הורה חדש: קודם מסך הפתיחה, וממנו ממשיכים לאזהרה.
          setChecking(false);
        }
      })
      .catch(() => {
        if (cancelledRef.current) return;
        // סעיף 27 - Error Handling: לא משאירים מסך לבן תקוע, מציגים הודעה עם אפשרות לנסות שוב.
        setError('לא הצלחנו לטעון את הנתונים שלך. בדוק שהאפליקציה מעודכנת ונסה שוב.');
        setChecking(false);
      });
  }, []);

  useEffect(() => {
    const cancelledRef = { current: false };
    check(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [check]);

  if (checking || error) {
    return <LoadingScreen error={error} onRetry={() => check({ current: false })} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>מי יצא מהרכב?</Text>
        <Text style={styles.subtitle}>
          אנחנו עוזרים לך לעצור לרגע ולוודא שכל הילדים יצאו מהרכב.
        </Text>
      </View>
      <View style={styles.footer}>
        <Button title="מתחילים" onPress={() => router.push('/disclaimer')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  title: {
    fontSize: theme.typography.title,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  subtitle: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    padding: theme.spacing.lg,
  },
});
