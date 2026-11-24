import { buildContactBriefing } from '../src/content/contactBriefing';

describe('ההודעה לאיש הקשר לחירום', () => {
  it('מסבירה ששיחה שקטה היא מהאפליקציה, ומה לעשות', () => {
    const text = buildContactBriefing('אמא', 'חיים', true);
    expect(text).toContain('היי אמא,');
    expect(text).toContain('אף אחד לא מדבר');
    expect(text).toContain('להתקשר אליי מיד');
    expect(text).toContain('חיים');
  });

  it('לעולם לא טוענת שיש ילד ברכב', () => {
    for (const autoCall of [true, false]) {
      const text = buildContactBriefing('אמא', 'חיים', autoCall);
      expect(text).not.toMatch(/שכחתי ילד|שכחת ילד|הילד ברכב/);
    }
  });

  it('באייפון לא מבטיחה שיחה אוטומטית', () => {
    expect(buildContactBriefing('אמא', 'חיים', false)).not.toContain('שיחה אוטומטית');
  });
});
