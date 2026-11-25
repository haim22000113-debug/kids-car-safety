/**
 * פלטת הצבעים של Little Shield (עיצוב 2, 25.11.2026).
 *
 * כחול עמוק ובטוח כצבע המותג (מגן), רקע אפור-כחלחל רך, וצבע "רך" לכל מצב
 * (רקע בהיר של אותו גוון) - כדי שכרטיס מצב ייראה כמו חלק מהעיצוב ולא כמו
 * תיבת אזהרה צועקת. הניגודיות של טקסט על רקע עומדת ב-WCAG AA.
 */
export const colors = {
  background: '#F3F5FA',
  surface: '#FFFFFF',
  surfaceMuted: '#F7F8FC',
  border: '#E2E6EF',

  textPrimary: '#16213E',
  textSecondary: '#5A6479',
  textMuted: '#8A93A6',
  textOnPrimary: '#FFFFFF',

  primary: '#2F5BEA', // כפתור פעולה ראשי (התחל נסיעה / אישור)
  primaryDark: '#1F43C4',
  primarySoft: '#E8EEFF',

  success: '#16885A', // אושר / ההגנה פעילה
  successSoft: '#E3F5EC',
  warning: '#C2570C', // תזכורת / משהו חסר
  warningSoft: '#FFF1E2',
  danger: '#D1343A', // אזהרה / חירום
  dangerSoft: '#FDECEC',

  overlay: 'rgba(22, 33, 62, 0.45)',
  shadow: '#16213E',
} as const;
