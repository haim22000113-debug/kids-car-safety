import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../src/theme';
import { TEXT_RIGHT } from '../src/i18n/rtl';
import { TripStorage } from '../src/storage';
import { Trip } from '../src/models';
import { formatDateTime, formatDuration } from '../src/utils/format';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Icon } from '../src/components/Icon';
import { IconBadge } from '../src/components/Card';

// Trip History (סעיף 18) - בלי גרפים, רשימה פשוטה.
function tripStatusLabel(trip: Trip): string {
  if (trip.status === 'CONFIRMED') {
    if (trip.skippedSafetyCheck) return 'הילדים לא היו איתך';
    if (trip.endTime && trip.confirmedAt) {
      const gapMs = new Date(trip.confirmedAt).getTime() - new Date(trip.endTime).getTime();
      if (gapMs > 90 * 1000) return 'אושר אחרי תזכורת';
    }
    return 'אושר';
  }
  if (trip.status === 'TRIP_ACTIVE') return 'בנסיעה פעילה';
  return 'לא אושר שהילדים יצאו';
}

type Tone = { icon: React.ComponentProps<typeof Icon>['name']; fg: string; bg: string };
function tripTone(trip: Trip): Tone {
  if (trip.status === 'TRIP_ACTIVE') return { icon: 'car-sport', fg: theme.colors.primary, bg: theme.colors.primarySoft };
  if (trip.status !== 'CONFIRMED') return { icon: 'alert', fg: theme.colors.danger, bg: theme.colors.dangerSoft };
  if (trip.skippedSafetyCheck) return { icon: 'people-outline', fg: theme.colors.textSecondary, bg: theme.colors.surfaceMuted };
  return { icon: 'checkmark', fg: theme.colors.success, bg: theme.colors.successSoft };
}

export default function History() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    TripStorage.getTripHistory()
      .then((t) => {
        setTrips(t);
        setLoading(false);
      })
      .catch(() => {
        setError('לא הצלחנו לטעון את היסטוריית הנסיעות. נסה שוב.');
        setLoading(false);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || error) {
    return <LoadingScreen error={error} onRetry={load} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader title="הנסיעות שלי" fallback="/home" />

      {trips.length === 0 ? (
        <View style={styles.emptyWrap}>
          <IconBadge name="car-outline" color={theme.colors.primary} background={theme.colors.primarySoft} size={72} />
          <Text style={styles.empty}>עדיין לא היו נסיעות. אחרי הנסיעה הראשונה שלך היא תופיע כאן.</Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const tone = tripTone(item);
            const pending = item.status !== 'CONFIRMED' && item.status !== 'TRIP_ACTIVE';
            return (
              <View style={[styles.row, pending ? styles.rowPending : null]}>
                <IconBadge name={tone.icon} color={tone.fg} background={tone.bg} size={40} />
                <View style={styles.rowText}>
                  <Text style={styles.rowDate}>{formatDateTime(item.startTime)}</Text>
                  <Text style={[styles.rowStatus, { color: pending ? theme.colors.danger : theme.colors.textSecondary }]}>
                    {tripStatusLabel(item)}
                  </Text>
                </View>
                {item.endTime ? (
                  <View style={styles.duration}>
                    <Icon name="time-outline" size={14} color={theme.colors.textMuted} />
                    <Text style={styles.rowDuration}>
                      {formatDuration(item.startTime, new Date(item.endTime).getTime())}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.md },
  empty: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
    lineHeight: 24,
  },
  list: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xl, paddingTop: theme.spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.card,
  },
  rowPending: { borderColor: theme.colors.danger, borderWidth: 1.5, backgroundColor: theme.colors.dangerSoft },
  rowText: { flex: 1 },
  rowDate: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
  },
  rowStatus: {
    fontSize: theme.typography.caption + 1,
    fontFamily: theme.fonts.regular,
    textAlign: TEXT_RIGHT,
    marginTop: 2,
  },
  duration: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowDuration: { fontSize: theme.typography.caption, fontFamily: theme.fonts.medium, color: theme.colors.textMuted },
});
