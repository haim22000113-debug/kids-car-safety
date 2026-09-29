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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader title="הגדרות" fallback="/home" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <Text style={styles.sectionTitle}>השם שלך</Text>
        <TextField label="שם פרטי" value={name} onChangeText={setName} />

        <Text style={styles.sectionTitle}>ילדים</Text>
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

        <Text style={styles.sectionTitle}>איש קשר לחירום</Text>
        <Text style={styles.infoText}>
          {user.emergencyContact
            ? `${user.emergencyContact.name} · ${user.emergencyContact.phone}`
            : 'לא הוגדר איש קשר'}
        </Text>
        <Button
          title="ערוך איש קשר"
          variant="ghost"
          onPress={() => router.push('/settings/emergency-contact')}
        />

        <Text style={styles.sectionTitle}>זמני תזכורות (בדקות מסיום הנסיעה)</Text>
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

        <Text style={styles.sectionTitle}>תזכורת בזמן נסיעה</Text>
        <Text style={styles.infoText}>
          עם תחילת נסיעה תישלח התראה לטלפון, ואם לא תסיים את הנסיעה תוך הזמן הזה נזכיר לך שוב —
          למקרה שיצאת מהרכב ושכחת ללחוץ &quot;סיים נסיעה&quot;.
        </Text>
        <TextField
          label="תזכורת אם הנסיעה עדיין פעילה (בדקות)"
          value={tripActiveMin}
          onChangeText={(t) => setTripActiveMin(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          maxLength={3}
        />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>צלילי התראות</Text>
          <Switch value={soundEnabled} onValueChange={setSoundEnabled} />
        </View>

        {notWithMeActive ? (
          <>
            <Text style={styles.sectionTitle}>מצב &quot;הילדים לא איתי&quot;</Text>
            <Text style={styles.infoText}>
              פעיל כרגע ({user.settings.childrenNotWithMe.scope === 'day' ? 'עד סוף היום' : 'לנסיעה הבאה'})
            </Text>
            <Button title="בטל מצב" variant="ghost" onPress={cancelNotWithMe} />
          </>
        ) : null}

        <Text style={styles.sectionTitle}>ההגנה האוטומטית</Text>
        <Text style={styles.infoText}>
          כשההגנה דלוקה, האפליקציה מזהה לבד שנסיעה הסתיימה ושואלת אותך אם כל הילדים יצאו — בלי
          שתצטרך ללחוץ על כלום. כיבוי ישאיר אותך עם המצב הידני בלבד.
        </Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>הגנה אוטומטית</Text>
          <Switch
            value={autoProtection}
            onValueChange={setAutoProtection}
            accessibilityLabel="הפעל או כבה הגנה אוטומטית"
          />
        </View>
        {!autoProtection ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              ההגנה האוטומטית תהיה כבויה. תקבל תזכורות רק על נסיעות שתפעיל ידנית.
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>הרשאות</Text>
        <Button
          title="הגדרות ההגנה האוטומטית"
          variant="ghost"
          onPress={() => router.push('/permissions')}
        />
        <Button
          title="פתח הגדרות התראות במכשיר"
          variant="ghost"
          onPress={() => Linking.openSettings()}
        />

        {isDiagnosticsEnabled() ? (
          <>
            <Text style={styles.sectionTitle}>אבחון</Text>
            <Text style={styles.infoText}>
              מציג מה המערכת מזהה בזמן אמת, ומאפשר להריץ תרחיש מלא בסימולציה בלי לצאת לכביש.
            </Text>
            <Button title="מסך אבחון" variant="ghost" onPress={() => router.push('/debug')} />
          </>
        ) : null}

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

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saved ? <Text style={styles.savedText}>נשמר בהצלחה</Text> : null}
        <Button title="שמור שינויים" onPress={onSave} loading={saving} style={styles.saveButton} />

        <Text style={styles.versionText}>
          גרסה {Constants.expoConfig?.version ?? '—'}
        </Text>

        <Text style={[styles.sectionTitle, styles.dangerTitle]}>איזור מסוכן</Text>
        <Button title="מחק את כל הנתונים" variant="ghost" onPress={onResetData} style={styles.dangerButton} />
      </ScrollView>
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
  },
  pageTitle: {
    fontSize: theme.typography.title,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.subtitle,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'right',
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
    textAlign: 'right',
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
    textAlign: 'right',
    lineHeight: 22,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
  },
  savedText: {
    color: theme.colors.success,
    fontSize: theme.typography.body,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
  },
  saveButton: {
    marginTop: theme.spacing.lg,
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
    marginLeft: theme.spacing.sm,
    lineHeight: 22,
  },
  pointText: {
    flex: 1,
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'right',
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
    textAlign: 'right',
    lineHeight: 22,
  },
  versionText: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
  },
});
