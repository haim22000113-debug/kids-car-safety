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

// Trip History (סעיף 18) - בלי גרפים, רשימה פשוטה.
function tripStatusLabel(trip: Trip): string {
  if (trip.status === 'CONFIRMED') {
    if (trip.skippedSafetyCheck) return '✓ הילדים לא היו איתך';
    if (trip.endTime && trip.confirmedAt) {
      const gapMs = new Date(trip.confirmedAt).getTime() - new Date(trip.endTime).getTime();
      if (gapMs > 90 * 1000) return '⚠️ נדרשה תזכורת';
    }
    return '✓ כל הילדים יצאו';
  }
  if (trip.status === 'TRIP_ACTIVE') return 'בנסיעה פעילה';
  return '⚠️ לא אושר שהילדים יצאו';
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
        <Text style={styles.empty}>עדיין לא היו נסיעות. אחרי הנסיעה הראשונה שלך היא תופיע כאן.</Text>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View
              style={[
                styles.row,
                item.status !== 'CONFIRMED' && item.status !== 'TRIP_ACTIVE' ? styles.rowPending : null,
              ]}
            >
              <View style={styles.rowHeader}>
                <Text style={styles.rowDate}>{formatDateTime(item.startTime)}</Text>
                {item.endTime ? (
                  <Text style={styles.rowDuration}>
                    {formatDuration(item.startTime, new Date(item.endTime).getTime())}
                  </Text>
                ) : null}
              </View>
              <Text
                style={[
                  styles.rowStatus,
                  item.status !== 'CONFIRMED' && item.status !== 'TRIP_ACTIVE' ? styles.rowStatusPending : null,
                ]}
              >
                {tripStatusLabel(item)}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: theme.typography.title,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginVertical: theme.spacing.lg,
  },
  empty: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body,
    marginTop: theme.spacing.xl,
  },
  list: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  row: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  rowDate: {
    fontSize: theme.typography.body,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.textPrimary,
  },
  rowDuration: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  rowPending: {
    borderColor: theme.colors.danger,
    borderWidth: 2,
    backgroundColor: '#FDECEA',
  },
  rowStatusPending: {
    color: theme.colors.danger,
    fontWeight: theme.fontWeight.bold,
  },
  rowStatus: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: TEXT_RIGHT,
  },
});
