// פלטת צבעים רגועה ולא מפחידה, בהשראת סעיף 21 (UX Principles) וסעיף 22 (Accessibility).
// ניגודיות גבוהה בין טקסט לרקע, וצבע ייעודי לכל מצב (רגיל / תזכורת / חירום / הצלחה).
export const colors = {
  background: '#F7F9FC',
  surface: '#FFFFFF',
  border: '#E2E8F0',

  textPrimary: '#1A202C',
  textSecondary: '#4A5568',
  textOnPrimary: '#FFFFFF',

  primary: '#2B6CB0', // כפתור פעולה ראשי (התחל נסיעה / אישור)
  primaryDark: '#1E4E8C',

  success: '#2F855A', // אושר שהילדים יצאו
  warning: '#DD6B20', // תזכורת
  danger: '#C53030', // No response / חירום

  overlay: 'rgba(26, 32, 44, 0.4)',
} as const;
