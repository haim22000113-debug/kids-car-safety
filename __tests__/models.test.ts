import { createDefaultUser, DEFAULT_REMINDER_SETTINGS } from '../src/models/User';

// בדיקה #1 מסעיף 29: יצירת משתמש.
describe('createDefaultUser', () => {
  it('creates a user with no children and default reminder settings', () => {
    const user = createDefaultUser('נועה');

    expect(user.name).toBe('נועה');
    expect(user.children).toEqual([]);
    expect(user.onboardingCompleted).toBe(false);
    expect(user.settings.reminders).toEqual(DEFAULT_REMINDER_SETTINGS);
    expect(user.settings.childrenNotWithMe).toEqual({ active: false, scope: null });
  });

  it('gives each user a unique id', () => {
    const a = createDefaultUser('א');
    const b = createDefaultUser('ב');
    expect(a.id).not.toBe(b.id);
  });
});
