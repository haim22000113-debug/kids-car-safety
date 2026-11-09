import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { ensureRTL } from '../src/i18n/rtl';
import { trackEvent } from '../src/analytics/analyticsService';
import { AnalyticsEvent } from '../src/analytics/events';
import { theme } from '../src/theme';
import {
  ACTION_CONFIRM_SAFE,
} from '../src/notifications/notificationService';
// חייב להיות ייבוא בשורה נפרדת ובלי שימוש: הוא רושם את משימות הרקע
// בזמן טעינת המודול, לפני שריאקט מרנדר. אם המערכת מעירה את האפליקציה
// לאירוע רקע והמשימה לא רשומה - האירוע פשוט הולך לאיבוד.
import '../src/services/backgroundTasks';
import * as protectionService from '../src/services/protectionService';

/**
 * לחיצה על התראה מעבירה למסך הרלוונטי (סעיף 14). התראות של תחילת נסיעה
 * ושל "שכחת לסיים" מסומנות target: 'active' ולכן מחזירות למסך הנסיעה
 * הפעילה - שם יש את הכפתור "סיים נסיעה". כל השאר מובילות לבדיקת הבטיחות.
 */
function openFromNotification(data: Record<string, unknown> | undefined) {
  // אזהרות ההגנה האוטומטית לא קשורות לנסיעה ידנית ואין להן tripId.
  // לחיצה על אזהרה אוטומטית = "ראיתי, אני מטפל" (החלטת הבעלים): מי שלחץ
  // על ההתראה ראה אותה. בסמסונג הכפתור מוסתר כשההתראה מכווצת, ובלי זה
  // השיחה לאיש הקשר יצאה גם אחרי שההורה לחץ ופתח את האפליקציה.
  if (data?.target === 'warning') {
    trackEvent(AnalyticsEvent.REMINDER_OPENED);
    void protectionService.acknowledgeWarning();
    router.replace('/safe');
    return;
  }

  const tripId = data?.tripId;
  if (typeof tripId !== 'string' || !tripId) return;

  trackEvent(AnalyticsEvent.REMINDER_OPENED);
  if (data?.target === 'active') {
    router.push({ pathname: '/trip/active', params: { tripId } });
  } else {
    router.push({ pathname: '/trip/safety-check', params: { tripId } });
  }
}

/**
 * הכפתור "ראיתי, אני מטפל" מופיע גם על אזהרות אוטומטיות וגם על תזכורות
 * של נסיעה ידנית. לתזכורת ידנית יש tripId, ואז סוגרים את הנסיעה הזו.
 */
async function confirmFromNotification(data: Record<string, unknown> | undefined): Promise<void> {
  const tripId = data?.tripId;
  if (typeof tripId === 'string' && tripId) {
    await protectionService.confirmManualTrip(tripId);
    return;
  }
  await protectionService.acknowledgeWarning();
}

export default function RootLayout() {
  useEffect(() => {
    ensureRTL();
    trackEvent(AnalyticsEvent.APP_OPENED);

    // התראה שנלחצת בזמן שהאפליקציה פתוחה/ברקע (סעיף 14 - לחיצה על התראה
    // מעבירה ישר ל-Safety Check).
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      /**
       * לחיצה על כפתור "ראיתי, אני מטפל" שעל ההתראה עצמה.
       *
       * זה מה שמשתיק את אזעקת ה-12 שניות מיד ומבטל את כל שאר השרשרת,
       * בלי שההורה יצטרך לנווט בתוך האפליקציה. ברגע שהוא כבר שם לב,
       * כל שנייה נוספת של צלצול היא רק מטרד.
       */
      if (response.actionIdentifier === ACTION_CONFIRM_SAFE) {
        trackEvent(AnalyticsEvent.REMINDER_OPENED);
        void confirmFromNotification(response.notification.request.content.data);
        router.replace('/safe');
        return;
      }

      openFromNotification(response.notification.request.content.data);
    });

    // מקרה של פתיחת האפליקציה מאפס על ידי לחיצה על התראה (cold start).
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      if (response.actionIdentifier === ACTION_CONFIRM_SAFE) {
        void confirmFromNotification(response.notification.request.content.data);
        router.replace('/safe');
        return;
      }
      openFromNotification(response.notification.request.content.data);
    });

    // שני הצעדים האלה חייבים לקרות בסדר הזה, ולכן הם באותה שרשרת:
    //
    // 1. משחזרים מהדיסק מצב שהיה פעיל כשהאפליקציה נסגרה. אם ההורה היה
    //    באמצע אזהרה ואנדרואיד סגר את האפליקציה, הוא חוזר לאזהרה ולא
    //    למסך בית שמשדר "הכל בסדר".
    // 2. רק אחר כך קוראים את מה שהמודול הנייטיב רשם בזמן שלא היינו.
    //    הוא צריך להגיע למכונה שכבר יודעת מה היה המצב, אחרת האירוע
    //    ייפול על מצב IDLE ריק וייעלם.
    void protectionService.restoreAfterRestart();

    // התראה שמגיעה בזמן שהאפליקציה פתוחה - לצורכי אנליטיקס בלבד.
    // נספרות רק תזכורות בדיקת הבטיחות, לא ההתראה של תחילת נסיעה.
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      if (notification.request.content.data?.target !== 'active') {
        trackEvent(AnalyticsEvent.REMINDER_SENT);
      }
    });

    return () => {
      responseSub.remove();
      receivedSub.remove();
    };
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    />
  );
}
