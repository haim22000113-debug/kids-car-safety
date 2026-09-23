// מכונת מצבים לנסיעה, בהתאם לסעיף 28 (State Machine) במסמך המוצר.
//
// IDLE -> TRIP_ACTIVE -> SAFETY_CHECK_REQUIRED -> CONFIRMED
//                                |
//                                v
//                         REMINDER_SENT -> REMINDER_SENT_AGAIN -> NO_RESPONSE
//
// הערה: הלוגיקה שמפעילה את המעברים בין המצבים (state machine עצמה) תיבנה
// ב-Phase 3 (Core Trip Flow) וב-Phase 4 (Notifications). כאן מוגדר רק המודל.
export type TripStatus =
  | 'IDLE'
  | 'TRIP_ACTIVE'
  | 'SAFETY_CHECK_REQUIRED'
  | 'REMINDER_SENT'
  | 'REMINDER_SENT_AGAIN'
  | 'NO_RESPONSE'
  | 'CONFIRMED';
