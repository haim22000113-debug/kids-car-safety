import {
  AutoTripSnapshot,
  GeoPoint,
  TripState,
  VehicleStopLocation,
  INITIAL_SNAPSHOT,
} from '../models/TripState';
import { config } from '../config';
import { TripEventName, TripEventNameType } from './eventLog';
import { assessTripStart, assessTripStop, assessTripResume, pickStopPoint } from './tripDetection';
import { hasLeftVehicleArea } from './geoUtils';

/**
 * מכונת המצבים של הנסיעה (סעיף 27).
 *
 * פונקציה טהורה לחלוטין: מקבלת מצב + קלט, מחזירה מצב חדש + רשימת אירועים.
 * אין כאן זמן מערכת, אין קריאות ל-OS, ואין תופעות לוואי. כל תרחיש
 * מהסעיפים 38-41 נבדק כאן בבדיקות אוטומטיות, בלי לצאת לכביש.
 *
 * הצד שמפעיל אותה (tripStateService) הוא זה שקורא ל-GPS, שולח התראות
 * ושומר לדיסק. ההפרדה הזו היא מה שהופך מוצר בטיחות לניתן לבדיקה.
 */

export type MachineInput =
  /** דגימת מיקום חדשה, עם חלון הדגימות האחרונות. */
  | { kind: 'LOCATION'; point: GeoPoint; samples: GeoPoint[]; now: number }
  /** פעימת זמן - מטפלת במעברים שתלויים רק בזמן שעבר. */
  | { kind: 'TICK'; now: number }
  /** זוהתה יציאה מרכב על ידי חיישני התנועה (אנדרואיד). */
  | { kind: 'VEHICLE_EXIT'; now: number; point?: GeoPoint }
  /** זוהתה כניסה לרכב על ידי חיישני התנועה (אנדרואיד). */
  | { kind: 'VEHICLE_ENTER'; now: number }
  | { kind: 'USER_CONFIRMED_SAFE'; now: number }
  | { kind: 'USER_REQUESTED_HELP'; now: number }
  | { kind: 'MANUAL_START'; now: number }
  | { kind: 'MANUAL_END'; now: number }
  | { kind: 'RESET'; now: number };

export interface MachineResult {
  snapshot: AutoTripSnapshot;
  events: { name: TripEventNameType; detail?: string }[];
  /** פעולות שהשכבה החיצונית צריכה לבצע. המכונה עצמה לא מבצעת כלום. */
  effects: MachineEffect[];
}

export type MachineEffect =
  | { type: 'CREATE_GEOFENCE'; stop: VehicleStopLocation }
  | { type: 'REMOVE_GEOFENCE' }
  | { type: 'SEND_FIRST_WARNING' }
  | { type: 'SEND_SECOND_WARNING' }
  | { type: 'SHOW_ESCALATION' }
  /**
   * לבטל אזהרות שתוזמנו מראש ועוד לא הגיעו.
   *
   * נדרש כי שרשרת ההסלמה מתוזמנת כולה ברגע האזהרה הראשונה ולא נשלחת
   * אחת-אחת מתוך האפליקציה - אחרת היא לא הייתה שורדת סגירה שלה. המחיר
   * הוא שצריך לבטל אותה במפורש ברגע שההורה מאשר.
   */
  | { type: 'CANCEL_WARNINGS' }
  | { type: 'PERSIST_TRIP' };

const secondsSince = (from: number, now: number) => (now - from) / 1000;

function transition(
  snapshot: AutoTripSnapshot,
  state: TripState,
  now: number,
  patch: Partial<AutoTripSnapshot> = {}
): AutoTripSnapshot {
  return { ...snapshot, ...patch, state, stateSince: now };
}

/**
 * מצבים שמהם אישור "כולם איתי" הוא פעולה משמעותית.
 * מ-IDLE אין מה לאשר.
 */
const CONFIRMABLE = new Set<TripState>([
  TripState.ACTIVE,
  TripState.STOPPED,
  TripState.GRACE_PERIOD,
  TripState.LEFT_VEHICLE_AREA,
  TripState.WARNING,
  TripState.ESCALATION,
]);

export function reduce(snapshot: AutoTripSnapshot, input: MachineInput): MachineResult {
  const events: MachineResult['events'] = [];
  const effects: MachineEffect[] = [];
  let next = snapshot;

  const goTo = (state: TripState, patch: Partial<AutoTripSnapshot> = {}, detail?: string) => {
    next = transition(next, state, input.now, patch);
    events.push({
      name: TripEventName.STATE_CHANGED,
      detail: `${snapshot.state} → ${state}${detail ? ' (' + detail + ')' : ''}`,
    });
  };

  // ---------- קלטים שמתאפסים מכל מצב ----------

  if (input.kind === 'RESET') {
    if (snapshot.state !== TripState.IDLE) {
      effects.push({ type: 'REMOVE_GEOFENCE' }, { type: 'CANCEL_WARNINGS' });
      events.push({ name: TripEventName.TRIP_CANCELLED });
    }
    return { snapshot: { ...INITIAL_SNAPSHOT, stateSince: input.now }, events, effects };
  }

  if (input.kind === 'USER_CONFIRMED_SAFE') {
    if (!CONFIRMABLE.has(snapshot.state)) {
      return { snapshot, events, effects };
    }
    effects.push(
      { type: 'REMOVE_GEOFENCE' },
      { type: 'CANCEL_WARNINGS' },
      { type: 'PERSIST_TRIP' }
    );
    events.push({ name: TripEventName.USER_CONFIRMED_SAFE });
    goTo(TripState.CONFIRMED_SAFE, { confirmedSafeAt: input.now });
    return { snapshot: next, events, effects };
  }

  if (input.kind === 'USER_REQUESTED_HELP') {
    events.push({ name: TripEventName.USER_REQUESTED_HELP });
    effects.push({ type: 'SHOW_ESCALATION' });
    goTo(TripState.ESCALATION);
    return { snapshot: next, events, effects };
  }

  if (input.kind === 'MANUAL_START') {
    events.push({ name: TripEventName.TRIP_STARTED, detail: 'ידני' });
    goTo(TripState.ACTIVE, { tripStartedAt: input.now, manual: true });
    return { snapshot: next, events, effects };
  }

  if (input.kind === 'MANUAL_END') {
    // סיום ידני לא סוגר את האירוע - עדיין צריך לשאול אם הילדים יצאו (סעיף 21).
    if (snapshot.state === TripState.IDLE) return { snapshot, events, effects };
    events.push({ name: TripEventName.TRIP_STOPPED, detail: 'ידני' });
    effects.push({ type: 'SEND_FIRST_WARNING' });
    goTo(TripState.WARNING, { firstWarningAt: input.now });
    return { snapshot: next, events, effects };
  }

  // ---------- זיהוי תנועה מהחיישנים (אנדרואיד) ----------

  if (input.kind === 'VEHICLE_ENTER') {
    events.push({ name: TripEventName.VEHICLE_ENTER_DETECTED });
    if (snapshot.state === TripState.IDLE || snapshot.state === TripState.CONFIRMED_SAFE) {
      events.push({ name: TripEventName.TRIP_STARTED, detail: 'זוהה אוטומטית - כניסה לרכב' });
      goTo(TripState.ACTIVE, { tripStartedAt: input.now, manual: false });
    }
    return { snapshot: next, events, effects };
  }

  if (input.kind === 'VEHICLE_EXIT') {
    events.push({ name: TripEventName.VEHICLE_EXIT_DETECTED });

    // יציאה מרכב היא הסיגנל החזק ביותר שיש לנו: היא מדלגת ישר על
    // שלב העצירה ותקופת החסד, כי היא כבר אומרת שההורה מחוץ לרכב.
    if (
      snapshot.state === TripState.ACTIVE ||
      snapshot.state === TripState.STOPPED ||
      snapshot.state === TripState.GRACE_PERIOD ||
      snapshot.state === TripState.POSSIBLE_TRIP
    ) {
      const stop: VehicleStopLocation | undefined = input.point
        ? {
            latitude: input.point.latitude,
            longitude: input.point.longitude,
            accuracy: input.point.accuracy,
            stoppedAt: input.now,
            lastMovementAt: input.now,
            tripDurationSeconds: snapshot.tripStartedAt
              ? Math.round(secondsSince(snapshot.tripStartedAt, input.now))
              : 0,
          }
        : snapshot.stopLocation;

      events.push({ name: TripEventName.WARNING_SENT, detail: 'יציאה מרכב' });
      effects.push({ type: 'SEND_FIRST_WARNING' });
      goTo(TripState.WARNING, { stopLocation: stop, firstWarningAt: input.now });
    }
    return { snapshot: next, events, effects };
  }

  // ---------- דגימת מיקום ----------

  if (input.kind === 'LOCATION') {
    switch (snapshot.state) {
      case TripState.IDLE:
      case TripState.CONFIRMED_SAFE: {
        const assessment = assessTripStart(input.samples);
        if (assessment.isTrip) {
          events.push({ name: TripEventName.TRIP_DETECTED, detail: assessment.reason });
          events.push({ name: TripEventName.TRIP_STARTED, detail: 'זוהה אוטומטית' });
          goTo(TripState.ACTIVE, { tripStartedAt: input.now, manual: false });
        } else if (assessment.isPossible) {
          goTo(TripState.POSSIBLE_TRIP, {}, assessment.reason);
        }
        break;
      }

      case TripState.POSSIBLE_TRIP: {
        const assessment = assessTripStart(input.samples);
        if (assessment.isTrip) {
          events.push({ name: TripEventName.TRIP_STARTED, detail: 'זוהה אוטומטית' });
          goTo(TripState.ACTIVE, { tripStartedAt: input.now, manual: false });
        } else if (!assessment.isPossible) {
          // הייתה תזוזה אבל היא לא התפתחה לנסיעה - חזרה למנוחה.
          // זה התרחיש של סעיף 40: הורה שהלך ברגל.
          goTo(TripState.IDLE, {}, 'התנועה לא התפתחה לנסיעה');
        }
        break;
      }

      case TripState.ACTIVE: {
        const stopAssessment = assessTripStop(input.samples);
        if (stopAssessment.hasStopped) {
          const stopPoint = pickStopPoint(input.samples);
          if (stopPoint) {
            const stop: VehicleStopLocation = {
              latitude: stopPoint.latitude,
              longitude: stopPoint.longitude,
              accuracy: stopPoint.accuracy,
              stoppedAt: input.now,
              lastMovementAt: stopPoint.timestamp,
              tripDurationSeconds: snapshot.tripStartedAt
                ? Math.round(secondsSince(snapshot.tripStartedAt, input.now))
                : 0,
            };
            events.push({ name: TripEventName.TRIP_STOPPED, detail: stopAssessment.reason });
            events.push({ name: TripEventName.STOP_LOCATION_SAVED });
            events.push({ name: TripEventName.GEOFENCE_CREATED });
            events.push({ name: TripEventName.GRACE_PERIOD_STARTED });
            effects.push({ type: 'CREATE_GEOFENCE', stop });
            goTo(TripState.GRACE_PERIOD, { stopLocation: stop });
          }
        }
        break;
      }

      case TripState.STOPPED:
      case TripState.GRACE_PERIOD: {
        if (!snapshot.stopLocation) break;

        // אם ההורה חזר לנסוע - הנסיעה ממשיכה ואין מה להתריע. רק לפי
        // דגימות מאז העצירה - ראה assessTripResume.
        const startAgain = assessTripResume(input.samples, snapshot.stopLocation.stoppedAt);
        if (startAgain.resumed) {
          effects.push({ type: 'REMOVE_GEOFENCE' });
          events.push({ name: TripEventName.GEOFENCE_REMOVED, detail: 'הנסיעה התחדשה' });
          goTo(TripState.ACTIVE, { stopLocation: undefined });
          break;
        }

        const graceOver =
          secondsSince(snapshot.stateSince, input.now) >= config.EXIT_GRACE_PERIOD_SECONDS;

        if (graceOver && hasLeftVehicleArea(snapshot.stopLocation, input.point)) {
          events.push({ name: TripEventName.USER_LEFT_GEOFENCE });
          goTo(TripState.LEFT_VEHICLE_AREA);
        }
        break;
      }

      default:
        break;
    }

    return { snapshot: next, events, effects };
  }

  // ---------- מעברים שתלויים בזמן בלבד ----------

  if (input.kind === 'TICK') {
    switch (snapshot.state) {
      case TripState.LEFT_VEHICLE_AREA: {
        if (
          secondsSince(snapshot.stateSince, input.now) >= config.FIRST_WARNING_DELAY_SECONDS
        ) {
          events.push({ name: TripEventName.WARNING_SENT });
          effects.push({ type: 'SEND_FIRST_WARNING' });
          goTo(TripState.WARNING, { firstWarningAt: input.now });
        }
        break;
      }

      case TripState.WARNING: {
        const sinceFirst = snapshot.firstWarningAt
          ? secondsSince(snapshot.firstWarningAt, input.now)
          : 0;

        if (
          !snapshot.secondWarningAt &&
          sinceFirst >= config.SECOND_WARNING_DELAY_SECONDS
        ) {
          events.push({ name: TripEventName.NO_RESPONSE });
          events.push({ name: TripEventName.SECOND_WARNING_SENT });
          effects.push({ type: 'SEND_SECOND_WARNING' });
          next = { ...next, secondWarningAt: input.now };
          break;
        }

        if (
          snapshot.secondWarningAt &&
          secondsSince(snapshot.secondWarningAt, input.now) >= config.ESCALATION_DELAY_SECONDS
        ) {
          events.push({ name: TripEventName.ESCALATION_STARTED });
          effects.push({ type: 'SHOW_ESCALATION' });
          goTo(TripState.ESCALATION);
        }
        break;
      }

      default:
        break;
    }

    return { snapshot: next, events, effects };
  }

  return { snapshot: next, events, effects };
}
