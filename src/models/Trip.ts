import { TripStatus } from './TripStatus';

export interface Trip {
  id: string;
  startTime: string; // ISO timestamp
  endTime?: string; // ISO timestamp - נקבע כשלוחצים "סיים נסיעה"
  confirmedAt?: string; // ISO timestamp - נקבע כשמאשרים "כן, כולם יצאו"
  status: TripStatus;
  childrenIds: string[];
  remindersSent: number; // כמה תזכורות כבר נשלחו בנסיעה הזו
  skippedSafetyCheck: boolean; // true אם היה במצב "הילדים לא איתי" בזמן הנסיעה
  reminderNotificationIds?: string[]; // מזהי התזכורות שאחרי סיום הנסיעה - לביטול כשמאשרים
  startNotificationIds?: string[]; // ההתראה שנשלחת עם תחילת הנסיעה + תזכורת "שכחת לסיים"
}
