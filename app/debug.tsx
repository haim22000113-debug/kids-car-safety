import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button } from '../src/components/Button';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { theme } from '../src/theme';
import { TEXT_RIGHT } from '../src/i18n/rtl';
import { config, APP_ENV } from '../src/config';
import { AutoTripSnapshot, TripState } from '../src/models/TripState';
import * as tripStateService from '../src/services/tripStateService';
import * as locationService from '../src/services/locationService';
import { isGeofenceActive } from '../src/services/geofenceService';
import { getEvents, clearEvents, subscribe as subscribeEvents, LoggedEvent } from '../src/services/eventLog';
import { distanceFromStop } from '../src/services/geoUtils';
import { makeTrack, makeStationary, makePointAtDistance, ORIGIN } from '../src/services/mockLocation';
import * as vehicleDetection from '../modules/vehicle-detection';

/**
 * מסך Debug (סעיף 29).
 *
 * לא מוצג להורה רגיל - הכניסה אליו רק מההגדרות ורק ב-development.
 * כפתורי הסימולציה הם החלק החשוב כאן: הם מזינים למכונת המצבים דגימות
 * מדומות ומאפשרים לעבור את כל התרחישים בלי לצאת לכביש.
 */
export default function Debug() {
  const [snapshot, setSnapshot] = useState<AutoTripSnapshot>(tripStateService.getSnapshot());
  const [events, setEvents] = useState<LoggedEvent[]>(getEvents());
  const [permissions, setPermissions] = useState<locationService.PermissionSnapshot | null>(null);
  const [tracking, setTracking] = useState(false);
  const [geofence, setGeofence] = useState(false);
  const [nativeHistory, setNativeHistory] = useState<vehicleDetection.NativeHistoryEntry[]>([]);

  const refresh = useCallback(async () => {
    setPermissions(await locationService.getPermissions());
    setTracking(await locationService.isTracking());
    setGeofence(await isGeofenceActive());
    setNativeHistory(vehicleDetection.getHistory().slice().reverse());
  }, []);

  useEffect(() => {
    void refresh();
    const unsubState = tripStateService.subscribe(setSnapshot);
    const unsubEvents = subscribeEvents(setEvents);
    return () => {
      unsubState();
      unsubEvents();
    };
  }, [refresh]);

  const last = locationService.getLastSample();
  const distance = distanceFromStop(snapshot.stopLocation, last);

  // ---------- סימולציות ----------

  const simulateTripStart = async () => {
    const now = Date.now();
    const samples = makeTrack({ startAt: now - 300_000, count: 10, intervalSeconds: 30, speedMps: 15 });
    samples.forEach(locationService.pushSample);
    await tripStateService.onLocation(samples[samples.length - 1], samples);
  };

  const simulateTripStop = async () => {
    const now = Date.now();
    const last = locationService.getLastSample();
    const origin = last ? { latitude: last.latitude, longitude: last.longitude } : ORIGIN;
    const samples = makeStationary({ startAt: now - 300_000, count: 10, intervalSeconds: 30, origin });
    samples.forEach(locationService.pushSample);
    await tripStateService.onLocation(samples[samples.length - 1], samples);
  };

  const simulateLeftArea = async () => {
    const stop = snapshot.stopLocation;
    if (!stop) return;
    // מזייפים גם את חותמת הזמן של הכניסה למצב, כדי לעקוף את תקופת החסד.
    tripStateService.forceSnapshot({
      ...snapshot,
      stateSince: Date.now() - (config.EXIT_GRACE_PERIOD_SECONDS + 10) * 1000,
    });
    const away = makePointAtDistance(stop, config.VEHICLE_GEOFENCE_RADIUS_METERS + 300, {
      timestamp: Date.now(),
    });
    locationService.pushSample(away);
    await tripStateService.onLocation(away, [away]);
  };

  const simulateWarning = () => tripStateService.tick();

  const simulateVehicleExit = () =>
    tripStateService.onVehicleExit(locationService.getLastSample());

  /**
   * שולח את שני היומנים כטקסט, כדי שאפשר יהיה לאבחן תקלה שקרתה בשטח.
   * Share המובנה ולא ספרייה חיצונית: עובד גם בלי סים, דרך מייל, טלגרם או
   * Drive. אין ביומנים מיקומים - רק אירועים ושעות.
   */
  const shareLog = async () => {
    const fmt = (t: number) => new Date(t).toLocaleString('he-IL');
    const lines = [
      'Little Shield - יומן אבחון',
      'נוצר: ' + fmt(Date.now()),
      'State: ' + snapshot.state,
      'מעקב מיקום: ' + (tracking ? 'פעיל' : 'כבוי'),
      'מיקום ברקע: ' + (permissions?.background ? 'ניתנה' : 'חסרה'),
      'זיהוי תנועה: ' + (vehicleDetection.isSupported() ? (vehicleDetection.isTracking() ? 'פעיל' : 'כבוי') : 'לא נתמך'),
      '',
      '=== חיישנים (נייטיב) ===',
      ...nativeHistory.map((e) => fmt(e.at) + ' | ' + e.type + (e.detail ? ' | ' + e.detail : '')),
      '',
      '=== אפליקציה ===',
      ...events.map((e) => fmt(e.at) + ' | ' + e.name + (e.detail ? ' | ' + e.detail : '')),
    ];
    try {
      await Share.share({ message: lines.join(String.fromCharCode(10)) });
    } catch {
      // ההורה ביטל את השיתוף - לא קריטי.
    }
  };

  const resetAll = async () => {
    await tripStateService.reset();
    locationService.clearSamples();
    clearEvents();
    vehicleDetection.clearHistory();
    await refresh();
  };

  const Row = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.row}>
      <Text style={styles.rowValue}>{value}</Text>
      <Text style={styles.rowLabel}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader title="מסך אבחון" fallback="/settings" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.env}>סביבה: {APP_ENV}</Text>

        <Text style={styles.section}>מצב נוכחי</Text>
        <Row label="State" value={snapshot.state} />
        <Row label="במצב מאז" value={new Date(snapshot.stateSince).toLocaleTimeString('he-IL')} />
        <Row label="נסיעה ידנית" value={snapshot.manual ? 'כן' : 'לא'} />
        <Row
          label="תחילת נסיעה"
          value={snapshot.tripStartedAt ? new Date(snapshot.tripStartedAt).toLocaleTimeString('he-IL') : '—'}
        />
        <Row
          label="נקודת עצירה"
          value={
            snapshot.stopLocation
              ? `${snapshot.stopLocation.latitude.toFixed(5)}, ${snapshot.stopLocation.longitude.toFixed(5)}`
              : '—'
          }
        />
        <Row label="מרחק מהעצירה" value={distance != null ? `${distance} מ׳` : '—'} />

        <Text style={styles.section}>מיקום</Text>
        <Row
          label="דגימה אחרונה"
          value={last ? `${last.latitude.toFixed(5)}, ${last.longitude.toFixed(5)}` : '—'}
        />
        <Row label="דיוק" value={last ? `${Math.round(last.accuracy)} מ׳` : '—'} />
        <Row label="מהירות" value={last?.speed != null ? `${last.speed.toFixed(1)} מ״ש` : '—'} />
        <Row
          label="עודכן"
          value={last ? new Date(last.timestamp).toLocaleTimeString('he-IL') : '—'}
        />
        <Row label="דגימות במאגר" value={String(locationService.getSamples().length)} />

        <Text style={styles.section}>מערכת</Text>
        <Row label="מעקב מיקום" value={tracking ? 'פעיל' : 'כבוי'} />
        <Row label="Geofence" value={geofence ? 'פעיל' : 'כבוי'} />
        <Row label="הרשאת מיקום" value={permissions?.foreground ? 'ניתנה' : 'חסרה'} />
        <Row label="מיקום ברקע" value={permissions?.background ? 'ניתנה' : 'חסרה'} />
        <Row
          label="זיהוי תנועה"
          value={vehicleDetection.isSupported() ? (vehicleDetection.isTracking() ? 'פעיל' : 'זמין, כבוי') : 'לא נתמך'}
        />

        <Text style={styles.section}>סימולציה</Text>
        <Button title="Simulate Trip Start" variant="ghost" onPress={simulateTripStart} />
        <Button title="Simulate Trip Stop" variant="ghost" onPress={simulateTripStop} />
        <Button title="Simulate User Left Area" variant="ghost" onPress={simulateLeftArea} />
        <Button title="Simulate Warning" variant="ghost" onPress={simulateWarning} />
        <Button title="Simulate Vehicle Exit (חיישנים)" variant="ghost" onPress={simulateVehicleExit} />
        <Button title="Reset Trip" variant="ghost" onPress={resetAll} />
        <Button
          title="פתח מסך אזהרה"
          variant="ghost"
          onPress={() => router.push('/warning')}
        />

        <Text style={styles.section}>חיישנים (נייטיב)</Text>
        <Text style={styles.empty}>
          כל מה שגוגל דיווחה על כניסה ויציאה מרכב. delay = כמה שניות אחרי שזה קרה בפועל
          הדיווח הגיע. שורד סגירה של האפליקציה.
        </Text>
        {nativeHistory.length === 0 ? (
          <Text style={styles.empty}>אין רישומים עדיין</Text>
        ) : (
          nativeHistory.slice(0, 40).map((e, index) => (
            <Text key={`n-${e.at}-${index}`} style={styles.event}>
              {new Date(e.at).toLocaleString('he-IL')} · {e.type}
              {e.detail ? ` — ${e.detail}` : ''}
            </Text>
          ))
        )}

        <Text style={styles.section}>יומן אירועים</Text>
        {events.length === 0 ? (
          <Text style={styles.empty}>אין אירועים עדיין</Text>
        ) : (
          events.slice(0, 40).map((event, index) => (
            <Text key={`${event.at}-${index}`} style={styles.event}>
              {new Date(event.at).toLocaleTimeString('he-IL')} · {event.name}
              {event.detail ? ` — ${event.detail}` : ''}
            </Text>
          ))
        )}

        <Button title="📤 שתף יומן" onPress={shareLog} style={styles.refresh} />
        <Button title="רענן" variant="ghost" onPress={refresh} style={styles.refresh} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg },
  title: {
    fontSize: theme.typography.title,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  env: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  section: {
    fontSize: theme.typography.subtitle,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
    textAlign: TEXT_RIGHT,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowLabel: { fontSize: theme.typography.caption, color: theme.colors.textSecondary },
  rowValue: { fontSize: theme.typography.caption, color: theme.colors.textPrimary, fontWeight: theme.fontWeight.medium },
  event: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: TEXT_RIGHT,
    marginBottom: 2,
  },
  empty: { fontSize: theme.typography.caption, color: theme.colors.textSecondary, textAlign: 'center' },
  refresh: { marginTop: theme.spacing.lg, marginBottom: theme.spacing.xl },
});
