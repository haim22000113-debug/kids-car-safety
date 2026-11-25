import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Alert, Linking, Pressable, Modal, TextInput } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { DIAGNOSTICS_TAPS, isDiagnosticsUnlocked, unlockDiagnostics } from '../../src/diagnostics';
import { shareLogReport } from '../../src/services/logReport';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { Card, ListRow } from '../../src/components/Card';
import { Icon } from '../../src/components/Icon';
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
import { runProtectionTest, TestItem, TestAction } from '../../src/services/protectionTest';
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
  const [testing, setTesting] = useState(false);
  const [testItems, setTestItems] = useState<TestItem[] | null>(null);
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
  /** מסך האבחון - רק בטלפון שבו הוזן הקוד של הבעלים. ראה src/diagnostics.ts. */
  const [diagUnlocked, setDiagUnlocked] = useState(false);
  const [codeVisible, setCodeVisible] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const versionTaps = useRef<{ count: number; at: number }>({ count: 0, at: 0 });

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
      void isDiagnosticsUnlocked().then(setDiagUnlocked);
    }, [load])
  );

  /** 7 לחיצות רצופות (בהפרש של עד 1.5 שניות) על מספר הגרסה פותחות את חלון הקוד. */
  const onVersionTap = () => {
    const now = Date.now();
    const taps = versionTaps.current;
    taps.count = now - taps.at < 1500 ? taps.count + 1 : 1;
    taps.at = now;
    if (taps.count >= DIAGNOSTICS_TAPS) {
      taps.count = 0;
      if (diagUnlocked) {
        router.push('/debug');
      } else {
        setCode('');
        setCodeError(false);
        setCodeVisible(true);
      }
    }
  };

  const submitCode = async () => {
    if (await unlockDiagnostics(code)) {
      setDiagUnlocked(true);
      setCodeVisible(false);
      router.push('/debug');
    } else {
      setCodeError(true);
      setCode('');
    }
  };

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

  const onTestProtection = async () => {
    setTesting(true);
    try {
      setTestItems(await runProtectionTest());
    } finally {
      setTesting(false);
    }
  };

  const onTestAction = (action: TestAction) => {
    if (action === 'permissions') router.push('/permissions');
    else if (action === 'emergencyContact') router.push('/settings/emergency-contact');
    else if (action === 'notificationSettings') void Linking.openSettings();
    // 'settings' - המתג "הגנה אוטומטית" נמצא באותו מסך, ממש מתחת.
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader title="הגדרות" fallback="/home" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {notWithMeActive ? (
          <View style={styles.notWithMeBox}>
            <Icon name="people-outline" size={20} color={theme.colors.warning} />
            <Text style={styles.notWithMeText}>
              &quot;הילדים לא איתי&quot; פעיל{' '}
              {user.settings.childrenNotWithMe.scope === 'day' ? 'עד סוף היום' : 'לנסיעה הבאה'}
            </Text>
            <Pressable onPress={cancelNotWithMe} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.notWithMeCancel}>ביטול</Text>
            </Pressable>
          </View>
        ) : null}

        <Card title="הגנה" icon="shield-checkmark">
          <View style={styles.switchRow}>
            <View style={styles.switchTextWrap}>
              <Text style={styles.switchLabel}>הגנה אוטומטית</Text>
              <Text style={styles.switchHint}>
                מזהה לבד שנסיעה הסתיימה ושואלת אם כל הילדים יצאו, בלי שתצטרך ללחוץ על כלום.
              </Text>
            </View>
            <Switch
              value={autoProtection}
              onValueChange={setAutoProtection}
              trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
              thumbColor={theme.colors.surface}
              accessibilityLabel="הפעל או כבה הגנה אוטומטית"
            />
          </View>
          {!autoProtection ? (
            <View style={styles.warningBox}>
              <Icon name="alert-circle" size={18} color={theme.colors.warning} />
              <Text style={styles.warningText}>
                ההגנה האוטומטית תהיה כבויה. תקבל תזכורות רק על נסיעות שתפעיל ידנית.
              </Text>
            </View>
          ) : null}

          <View style={styles.testBlock}>
            <Text style={styles.testTitle}>בדוק את ההגנה</Text>
            <Text style={styles.infoText}>
              מצלצל את האזעקה האמיתית (בלי להתקשר לאף אחד) ובודק שאין שום דבר בטלפון שחוסם את האזהרות.
            </Text>
            <Button
              title="בדוק עכשיו"
              icon="notifications"
              variant="secondary"
              onPress={onTestProtection}
              loading={testing}
            />
            {testItems
              ? testItems.map((item, i) => (
                  <View key={i} style={[styles.testItem, item.ok ? styles.testOk : styles.testBad]}>
                    <Icon
                      name={item.ok ? 'checkmark-circle' : 'alert-circle'}
                      size={20}
                      color={item.ok ? theme.colors.success : theme.colors.warning}
                    />
                    <Text style={styles.testItemText}>{item.text}</Text>
                    {item.action ? (
                      <Pressable onPress={() => onTestAction(item.action!)} accessibilityRole="button" hitSlop={8}>
                        <Text style={styles.testFix}>תקן</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))
              : null}
          </View>

          <View style={styles.rows}>
            <ListRow icon="key-outline" label="בדיקת הרשאות" onPress={() => router.push('/permissions')} />
            <ListRow
              icon="notifications-outline"
              label="הגדרות התראות במכשיר"
              onPress={() => Linking.openSettings()}
            />
            {/* לכולם, כולל בודקים: היומן בלי מיקומים, ואפשר לשלוח אותו בוואטסאפ. */}
            <ListRow
              icon="chatbubble-ellipses-outline"
              label="שלח דיווח על תקלה"
              onPress={shareLogReport}
              last={!diagUnlocked}
            />
            {diagUnlocked ? (
              <ListRow icon="pulse-outline" label="מסך אבחון" onPress={() => router.push('/debug')} last />
            ) : null}
          </View>
        </Card>

        <Card title="איש קשר לחירום" icon="call">
          <View style={styles.contactRow}>
            <View style={styles.contactAvatar}>
              <Icon
                name={user.emergencyContact ? 'person' : 'person-add-outline'}
                size={22}
                color={theme.colors.primary}
              />
            </View>
            <View style={styles.switchTextWrap}>
              <Text style={styles.switchLabel}>
                {user.emergencyContact ? user.emergencyContact.name : 'לא הוגדר איש קשר'}
              </Text>
              <Text style={styles.switchHint}>
                {user.emergencyContact
                  ? user.emergencyContact.phone
                  : AUTO_CALL_SUPPORTED
                    ? 'בלי איש קשר לא תהיה שיחה אוטומטית.'
                    : 'אפשר להתקשר אליו בלחיצה אחת מהאזהרה.'}
              </Text>
            </View>
          </View>
          <Button
            title={user.emergencyContact ? 'ערוך איש קשר' : 'הוסף איש קשר'}
            variant="secondary"
            onPress={() => router.push('/settings/emergency-contact')}
          />
        </Card>

        <Card title="השם שלך" icon="person-circle-outline">
          <TextField label="שם פרטי" value={name} onChangeText={setName} />
        </Card>

        <Card title="ילדים" icon="happy-outline">
          {children.map((child) => (
            <View key={child.id} style={styles.childRow}>
              <View style={styles.childName}>
                <TextField
                  label="שם"
                  value={child.name}
                  onChangeText={(text) => updateChild(child.id, { name: text })}
                />
              </View>
              <View style={styles.childAge}>
                <TextField
                  label="גיל"
                  value={child.age}
                  onChangeText={(text) => updateChild(child.id, { age: text.replace(/[^0-9]/g, '') })}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
              <Pressable
                onPress={() => removeChild(child.id)}
                style={({ pressed }) => [styles.removeChild, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`הסר את ${child.name || 'הילד'}`}
                hitSlop={6}
              >
                <Icon name="trash-outline" size={20} color={theme.colors.danger} />
              </Pressable>
            </View>
          ))}
          <Button title="הוסף ילד" icon="add" variant="secondary" onPress={addChild} style={styles.addChildButton} />
        </Card>

        <Card title="תזכורות בנסיעה ידנית" icon="alarm-outline">
          <Text style={styles.subTitle}>כמה דקות אחרי &quot;סיים נסיעה&quot;</Text>
          <View style={styles.reminderRow}>
            <View style={styles.reminderCell}>
              <TextField
                label="ראשונה"
                value={firstMin}
                onChangeText={(t) => setFirstMin(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
            <View style={styles.reminderCell}>
              <TextField
                label="שנייה"
                value={secondMin}
                onChangeText={(t) => setSecondMin(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
            <View style={styles.reminderCell}>
              <TextField
                label="שלישית"
                value={thirdMin}
                onChangeText={(t) => setThirdMin(t.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
          </View>

          <TextField
            label="תזכורת אם שכחת לסיים נסיעה (דקות מתחילתה)"
            value={tripActiveMin}
            onChangeText={(t) => setTripActiveMin(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={3}
          />

          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, styles.switchTextWrap]}>צלילי התראות</Text>
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
              thumbColor={theme.colors.surface}
            />
          </View>
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

        <Card style={styles.dangerCard}>
          <ListRow icon="trash-outline" label="מחק את כל הנתונים" onPress={onResetData} tone="danger" last />
        </Card>

        {/* 7 לחיצות כאן = כניסה למסך האבחון (עם קוד). בלי שום רמז במסך. */}
        <Pressable onPress={onVersionTap} hitSlop={12}>
          <Text style={styles.versionText}>
            Little Shield · גרסה {Constants.expoConfig?.version ?? '—'}
          </Text>
        </Pressable>
      </ScrollView>

      <Modal visible={codeVisible} transparent animationType="fade" onRequestClose={() => setCodeVisible(false)}>
        <View style={styles.codeOverlay}>
          <View style={styles.codeCard}>
            <Text style={styles.codeTitle}>קוד כניסה</Text>
            <TextInput
              style={[styles.codeInput, codeError ? styles.codeInputError : null]}
              value={code}
              onChangeText={(t) => {
                setCode(t.replace(/[^0-9]/g, ''));
                setCodeError(false);
              }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              autoFocus
              onSubmitEditing={submitCode}
              accessibilityLabel="קוד כניסה"
            />
            {codeError ? <Text style={styles.codeErrorText}>קוד שגוי</Text> : null}
            <Button title="כניסה" onPress={submitCode} disabled={code.length < 6} />
            <Button title="ביטול" variant="ghost" onPress={() => setCodeVisible(false)} />
          </View>
        </View>
      </Modal>

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
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
    marginBottom: theme.spacing.sm,
  },
  subTitle: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.medium,
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
    fontFamily: theme.fonts.medium,
  },
  notWithMeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.warningSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  notWithMeText: {
    flex: 1,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.medium,
  },
  sectionTitle: {
    fontSize: theme.typography.subtitle,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
  },
  switchTextWrap: { flex: 1 },
  switchHint: {
    fontSize: theme.typography.caption + 1,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: TEXT_RIGHT,
    marginTop: 2,
    lineHeight: 19,
  },
  notWithMeCancel: { fontSize: theme.typography.body, fontFamily: theme.fonts.semibold, color: theme.colors.warning },
  testBlock: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  testTitle: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
    marginBottom: 2,
  },
  testItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm + 4,
    marginTop: theme.spacing.sm,
  },
  testBad: { backgroundColor: theme.colors.warningSoft },
  testItemText: {
    flex: 1,
    fontSize: theme.typography.caption + 1,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
    lineHeight: 20,
  },
  testFix: { fontSize: theme.typography.body, fontFamily: theme.fonts.semibold, color: theme.colors.primary },
  rows: { marginTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.md },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm },
  childName: { flex: 2 },
  childAge: { flex: 1 },
  removeChild: {
    width: 44,
    height: theme.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  reminderRow: { flexDirection: 'row', gap: theme.spacing.sm },
  reminderCell: { flex: 1 },
  dangerCard: { marginTop: theme.spacing.lg, paddingVertical: theme.spacing.xs },
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
  addChildButton: { marginTop: theme.spacing.xs },
  infoText: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: TEXT_RIGHT,
    marginBottom: theme.spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  switchLabel: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
  },
  testOk: { backgroundColor: theme.colors.successSoft },
  testOkText: { color: theme.colors.success },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.warningSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm + 4,
    marginTop: theme.spacing.md,
  },
  warningText: {
    flex: 1,
    fontSize: theme.typography.caption + 1,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
    lineHeight: 20,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  savedText: {
    color: theme.colors.success,
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
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
    fontFamily: theme.fonts.regular,
    color: theme.colors.primary,
    marginEnd: theme.spacing.sm,
    lineHeight: 22,
  },
  pointText: {
    flex: 1,
    fontSize: theme.typography.caption,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: TEXT_RIGHT,
    lineHeight: 22,
  },
  emergencyBox: {
    backgroundColor: theme.colors.dangerSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  emergencyText: {
    fontSize: theme.typography.caption,
    color: theme.colors.danger,
    fontFamily: theme.fonts.medium,
    textAlign: TEXT_RIGHT,
    lineHeight: 22,
  },
  codeOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  codeCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  codeTitle: {
    fontSize: theme.typography.subtitle,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  codeInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    height: theme.minTouchTarget,
    fontSize: 24,
    fontFamily: theme.fonts.regular,
    letterSpacing: 8,
    textAlign: 'center',
    color: theme.colors.textPrimary,
  },
  codeInputError: { borderColor: theme.colors.danger },
  codeErrorText: { color: theme.colors.danger, textAlign: 'center', fontSize: theme.typography.caption  ,fontFamily: theme.fonts.regular,},
  versionText: {
    fontSize: theme.typography.caption,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
  },
});
