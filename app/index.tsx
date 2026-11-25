import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/components/Button';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { theme } from '../src/theme';
import { TEXT_RIGHT } from '../src/i18n/rtl';
import { AUTO_CALL_SUPPORTED } from '../src/content/autoCall';
import { Icon, IconName } from '../src/components/Icon';
import { IconBadge } from '../src/components/Card';
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

  const features: { icon: IconName; text: string }[] = [
    { icon: 'car-sport-outline', text: 'בסוף נסיעה שואלת אם כל הילדים יצאו מהרכב' },
    {
      icon: 'notifications-outline',
      text: AUTO_CALL_SUPPORTED
        ? 'אין תשובה? מצלצלת חזק, ואז מתקשרת לאיש קשר שבחרת'
        : 'אין תשובה? מזכירה שוב, בצליל חזק יותר',
    },
    { icon: 'lock-closed-outline', text: 'הכל נשמר רק בטלפון שלך' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <IconBadge name="shield-checkmark" color={theme.colors.textOnPrimary} background={theme.colors.primary} size={88} halo />
        <Text style={styles.brand}>Little Shield</Text>
        <Text style={styles.title}>מי יצא מהרכב?</Text>
        <Text style={styles.subtitle}>
          אנחנו עוזרים לך לעצור לרגע ולוודא שכל הילדים יצאו מהרכב.
        </Text>
        <View style={styles.features}>
          {features.map((f) => (
            <View key={f.icon} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Icon name={f.icon} size={20} color={theme.colors.primary} />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>
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
    padding: theme.spacing.lg,
  },
  brand: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.primary,
    letterSpacing: 1,
    marginTop: theme.spacing.lg,
  },
  title: {
    fontSize: theme.typography.hero,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  features: {
    alignSelf: 'stretch',
    marginTop: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    ...theme.shadows.card,
  },
  feature: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
    lineHeight: 22,
  },
  footer: {
    padding: theme.spacing.lg,
  },
});
