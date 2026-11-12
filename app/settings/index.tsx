import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Alert, Linking } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { isDiagnosticsEnabled } from '../../src/diagnostics';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { theme } from '../../src/theme';
import { AUTO_CALL_SUPPORTED } from '../../src/content/autoCall';
import { TEXT_RIGHT } from '../../src/i18n/rtl';
import { UserStorage, TripStorage } from '../../src/storage';
import { User, isAutoProtectionEnabled } from '../../src/models';
import { getTripActiveReminderMinutes } from '../../src/notifications/reminderLogic';
import { cancelAllNotifications } from '../../src/notifications/notificationService';
import * as protectionService from '../../src/services/protectionService';
import {
  DISCLAIMER_INTRO,
  DISCLAIMER_POINTS,
  DISCLAIMER_EMERGENCY,
} from '../../src/content/disclaimer';

/** קטגוריה במסך ההגדרות: כותרת ומסגרת, כדי שההפרדה תהיה ברורה במבט. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

interface ChildDraft {
  id: string;
  name: string;
  age: string;
}

// Settings (סעיף 19).
export default function Settings() {
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [children, setChildren] = useState<ChildDraft[]>([]);
  const [firstMin, setFirstMin] = useState('0');
  const [secondMin, setSecondMin] = useState('2');
  const [thirdMin, setThirdMin] = useState('5');
  const [tripActiveMin, setTripActiveMin] = useState('15');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoProtection, setAutoProtection] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    UserStorage.getUser()
      .then((u) => {
        if (!u) {
          router.replace('/');
          return;
        }
        setUser(u);
        setName(u.name);
        setChildren(u.children.map((c) => ({ id: c.id, name: c.name, age: String(c.age) })));
        setFirstMin(String(u.settings.reminders.firstReminderMinutes));
        setSecondMin(String(u.settings.reminders.secondReminderMinutes));
        setThirdMin(String(u.settings.reminders.thirdReminderMinutes));
        setTripActiveMin(String(getTripActiveReminderMinutes(u.settings.reminders)));
        setSoundEnabled(u.settings.reminders.soundEnabled);
        setAutoProtection(isAutoProtectionEnabled(u.settings));
      })
      .catch(() => {
        // סעיף 27 - Error Handling: לא נשארים על מסך ריק, מציעים לנסות שוב.
        setLoadError('לא הצלחנו לטעון את ההגדרות שלך. נסה שוב.');
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const addChild = () => {
    setChildren((prev) => [...prev, { id: `child_${Date.now()}`, name: '', age: '' }]);
  };

  const removeChild = (id: string) => {
    setChildren((prev) => prev.filter((c) => c.id !== id));
  };

  const updateChild = (id: string, patch: Partial<ChildDraft>) => {
    setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const onSave = async () => {
    if (!user) return;
    setError(null);
    setSaved(false);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('אנא הכנס שם');
      return;
    }
    for (const child of children) {
      const age = parseInt(child.age, 10);
      if (!child.name.trim() || Number.isNaN(age) || age < 0 || age > 17) {
        setError('אנא ודא ששם וגיל תקינים לכל ילד');
        return;
      }
    }
    const first = parseInt(firstMin, 10);
    const second = parseInt(secondMin, 10);
    const third = parseInt(thirdMin, 10);
    if ([first, second, third].some((n) => Number.isNaN(n) || n < 0)) {
      setError('זמני התזכורות חייבים להיות מספרים תקינים');
      return;
    }
    const tripActive = parseInt(tripActiveMin, 10);
    if (Number.isNaN(tripActive) || tripActive < 1) {
      setError('תזכורת הנסיעה הפעילה חייבת להיות לפחות דקה אחת');
      return;
    }

    setSaving(true);
    const updated = await UserStorage.updateUser({
      name: trimmedName,
      children: children.map((c) => ({
        id: c.id,
        name: c.name.trim(),
        age: parseInt(c.age, 10),
        active: true,
      })),
      settings: {
        ...user.settings,
        autoProtectionEnabled: autoProtection,
        reminders: {
          firstReminderMinutes: first,
          secondReminderMinutes: second,
          thirdReminderMinutes: third,
          tripActiveReminderMinutes: tripActive,
          soundEnabled,
        },
      },
    });
    if (updated) setUser(updated);

    // מפעילים או מכבים בפועל, לא רק שומרים את ההעדפה. הורה שכיבה את
    // ההגנה ועדיין ראה התראת שירות חזית היה מסיק שהכפתור לא עובד.
    if (autoProtection) {
      await protectionService.startProtection();
    } else {
      await protectionService.stopProtection();
    }

    setSaving(false);
    setSaved(true);
  };

  const cancelNotWithMe = async () => {
    if (!user) return;
    const updated = await UserStorage.updateUser({
      settings: { ...user.settings, childrenNotWithMe: { active: false, scope: null } },
    });
    if (updated) setUser(updated);
    await protectionService.syncNativeConfig();
  };

  const onResetData = () => {
    Alert.alert(
      'איפוס נתונים',
      'פעולה זו תמחק את כל הנתונים שלך (משתמש, ילדים, היסטוריית נסיעות) לצמיתות. להמשיך?',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק הכל',
          style: 'destructive',
          onPress: async () => {
            // גם ההתראות נמחקות, אחרת תישאר תלויה התראה של נסיעה שכבר לא קיימת.
            await cancelAllNotifications();
            await UserStorage.clearUser();
            await TripStorage.clearAllTrips();
            router.replace('/');
          },
        },
      ]
    );
  };

  if (!user || loadError) {
    return <LoadingScreen error={loadError} onRetry={load} />;
  }

  const notWithMeActive = user.settings.childrenNotWithMe.active;

  /**
   * האם יש שינויים שלא נשמרו.
   *
   * עד עכשיו כפתור השמירה ישב בתחתית מסך ארוך, וההורה היה צריך לגלול עד
   * הסוף אחרי כל שינוי - ובלי שום סימן שמשהו עוד לא נשמר. הורה ששינה
   * משהו ויצא בלי לגלול איבד את השינוי בלי לדעת. עכשיו הכפתור קבוע
   * בתחתית המסך, ואומר במפורש אם יש מה לשמור.
   */
  const reminders = user.settings.reminders;
  const isDirty =
    name.trim() !== user.name ||
    JSON.stringify(children.map((c) => [c.id, c.name.trim(), c.age])) !==
      JSON.stringify(user.children.map((c) => [c.id, c.name, String(c.age)])) ||
    firstMin !== String(reminders.firstReminderMinutes) ||
    secondMin !== String(reminders.secondReminderMinutes) ||
    thirdMin !== String(reminders.thirdReminderMinutes) ||
    tripActiveMin !== String(getTripActiveReminderMinutes(reminders)) ||
    soundEnabled !== reminders.soundEnabled ||
    autoProtection !== isAutoProtectionEnabled(user.settings);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader title="הגדרות" fallback="/home" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {notWithMeActive ? (
          <View style={styles.notWithMeBox}>
            <Text style={styles.notWithMeText}>
              מצב &quot;הילדים לא איתי&quot; פעיל (
              {user.settings.childrenNotWithMe.scope === 'day' ? 'עד סוף היום' : 'לנסיעה הבאה'})
            </Text>
            <Button title="בטל מצב" variant="ghost" onPress={cancelNotWithMe} />
          </View>
        ) : null}

        <Card title="👤 השם שלך">
          <TextField label="שם פרטי" value={name} onChangeText={setName} />
        </Card>

        <Card title="👧 ילדים">
          {children.map((child) => (
            <View key={child.id} style={styles.childBlock}>
              <TextField
                label="שם"
                value={child.name}
                onChangeText={(text) => updateChild(child.id, { name: text })}
              />
              <TextField
                label="גיל"
                value={child.age}
                onChangeText={(text) => updateChild(child.id, { age: text.replace(/[^0-9]/g, '') })}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Button title="הסר ילד" variant="ghost" onPress={() => removeChild(child.id)} />
            </View>
          ))}
          <Button title="+ הוסף ילד" variant="ghost" onPress={addChild} style={styles.addChildButton} />
        </Card>

        <Card title="📞 איש קשר לחירום">
          <Text style={styles.infoText}>
            {user.emergencyContact
              ? `${user.emergencyContact.name} · ${user.emergencyContact.phone}`
              : AUTO_CALL_SUPPORTED
                ? 'לא הוגדר איש קשר. בלי איש קשר לא תהיה שיחה אוטומטית.'
                : 'לא הוגדר איש קשר.'}
          </Text>
          <Button
            title={user.emergencyContact ? 'ערוך איש קשר' : 'הוסף איש קשר'}
            variant="ghost"
            onPress={() => router.push('/settings/emergency-contact')}
          />
        </Card>

        <Card title="🔔 תזכורות">
          <Text style={styles.subTitle}>תזכורות בנסיעה ידנית (דקות מסיום הנסיעה)</Text>
          <TextField
            label="תזכורת ראשונה"
            value={firstMin}
            onChangeText={(t) => setFirstMin(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={2}
          />
          <TextField
            label="תזכורת שנייה"
            value={secondMin}
            onChangeText={(t) => setSecondMin(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={2}
          />
          <TextField
            label="תזכורת שלישית"
            value={thirdMin}
            onChangeText={(t) => setThirdMin(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={2}
          />

          <Text style={styles.subTitle}>תזכורת אם שכחת לסיים נסיעה</Text>
          <TextField
            label="אחרי כמה דקות (מתחילת הנסיעה)"
            value={tripActiveMin}
            onChangeText={(t) => setTripActiveMin(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={3}
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>צלילי התראות</Text>
            <Switch value={soundEnabled} onValueChange={setSoundEnabled} />
          </View>
        </Card>

        <Card title="🛡️ הגנה והרשאות">
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>הגנה אוטומטית</Text>
            <Switch
              value={autoProtection}
              onValueChange={setAutoProtection}
              accessibilityLabel="הפעל או כבה הגנה אוטומטית"
            />
          </View>
          <Text style={styles.infoText}>
            מזהה לבד שנסיעה הסתיימה ושואלת אם כל הילדים יצאו, בלי שתצטרך ללחוץ על כלום.
          </Text>
          {!autoProtection ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                ההגנה האוטומטית תהיה כבויה. תקבל תזכורות רק על נסיעות שתפעיל ידנית.
              </Text>
            </View>
          ) : null}
          <Button title="בדיקת הרשאות" variant="ghost" onPress={() => router.push('/permissions')} />
          <Button
            title="הגדרות התראות במכשיר"
            variant="ghost"
            onPress={() => Linking.openSettings()}
          />
          {isDiagnosticsEnabled() ? (
            <Button title="מסך אבחון" variant="ghost" onPress={() => router.push('/debug')} />
          ) : null}
        </Card>

        {/* מידע - לא הגדרות. בתחתית, כדי שלא יפריד בין ההגדרות עצמן. */}
        <Text style={styles.sectionTitle}>פרטיות</Text>
        <Text style={styles.infoText}>
          כל הנתונים שלך (הילדים, הנסיעות, איש הקשר) נשמרים מקומית על המכשיר בלבד ולא נשלחים לשום שרת
          חיצוני. אין שימוש במצלמה, זיהוי פנים או שיתוף מידע עם צד שלישי.
        </Text>

        <Text style={styles.sectionTitle}>אחריות ומגבלות</Text>
        <Text style={styles.infoText}>{DISCLAIMER_INTRO}</Text>
        {DISCLAIMER_POINTS.map((point, index) => (
          <View key={index} style={styles.pointRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{point}</Text>
          </View>
        ))}
        <View style={styles.emergencyBox}>
          <Text style={styles.emergencyText}>{DISCLAIMER_EMERGENCY}</Text>
        </View>

        <Text style={styles.versionText}>
          גרסה {Constants.expoConfig?.version ?? '—'}
        </Text>

        <Text style={[styles.sectionTitle, styles.dangerTitle]}>איזור מסוכן</Text>
        <Button title="מחק את כל הנתונים" variant="ghost" onPress={onResetData} style={styles.dangerButton} />
      </ScrollView>

      {/* כפתור השמירה קבוע בתחתית - תמיד גלוי, באזור האגודל. */}
      <View style={styles.saveBar}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!error && isDirty ? <Text style={styles.dirtyText}>יש שינויים שלא נשמרו</Text> : null}
        {!error && !isDirty && saved ? <Text style={styles.savedText}>✓ נשמר</Text> : null}
        <Button
          title={isDirty ? 'שמור שינויים' : 'אין שינויים לשמירה'}
          onPress={onSave}
          loading={saving}
          disabled={!isDirty}
        />
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
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  cardTitle: {
    fontSize: theme.typography.subtitle,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
    marginBottom: theme.spacing.sm,
  },
  subTitle: {
    fontSize: theme.typography.body,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.textSecondary,
    textAlign: TEXT_RIGHT,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  saveBar: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  dirtyText: {
    color: theme.colors.warning,
    fontSize: theme.typography.caption,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
    fontWeight: theme.fontWeight.medium,
  },
  notWithMeBox: {
    backgroundColor: '#FFF3E0',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  notWithMeText: {
    color: theme.colors.warning,
    textAlign: TEXT_RIGHT,
    fontSize: theme.typography.body,
  },
  sectionTitle: {
    fontSize: theme.typography.subtitle,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
  },
  dangerTitle: {
    color: theme.colors.danger,
  },
  childBlock: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  addChildButton: {
    marginTop: theme.spacing.xs,
  },
  infoText: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: TEXT_RIGHT,
    marginBottom: theme.spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
  },
  switchLabel: {
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
  },
  warningBox: {
    backgroundColor: '#FFF3E0',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  warningText: {
    fontSize: theme.typography.caption,
    color: theme.colors.warning,
    textAlign: TEXT_RIGHT,
    lineHeight: 22,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  savedText: {
    color: theme.colors.success,
    fontSize: theme.typography.body,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  dangerButton: {
    marginBottom: theme.spacing.xl,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  bullet: {
    fontSize: theme.typography.body,
    color: theme.colors.primary,
    marginEnd: theme.spacing.sm,
    lineHeight: 22,
  },
  pointText: {
    flex: 1,
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: TEXT_RIGHT,
    lineHeight: 22,
  },
  emergencyBox: {
    backgroundColor: '#FDECEA',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  emergencyText: {
    fontSize: theme.typography.caption,
    color: theme.colors.danger,
    fontWeight: theme.fontWeight.medium,
    textAlign: TEXT_RIGHT,
    lineHeight: 22,
  },
  versionText: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
  },
});
