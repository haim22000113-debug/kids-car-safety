import * as fs from 'fs';
import * as path from 'path';

/**
 * באייפון אין שיחה אוטומטית (אפל לא מאפשרת). הבטחה "נתקשר לאיש הקשר"
 * שלא תקוים גרועה מאין הבטחה - ההורה מרגיש מוגן כשהוא לא. לכן כל קובץ
 * שכותב "נתקשר" או "תתקשר" חייב לבדוק את AUTO_CALL_SUPPORTED.
 */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

describe('הבטחת שיחה אוטומטית', () => {
  const root = path.join(__dirname, '..');
  const files = [...sourceFiles(path.join(root, 'app')), ...sourceFiles(path.join(root, 'src'))];

  it('כל טקסט שמבטיח שיחה תלוי ב-AUTO_CALL_SUPPORTED', () => {
    const offenders = files.filter((f) => {
      const text = fs.readFileSync(f, 'utf8');
      // רק טקסט שמוצג, לא הערות בקוד.
      const visible = text
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      const promises = /(נתקשר|תתקשר)/.test(visible);
      return promises && !text.includes('AUTO_CALL_SUPPORTED') && !f.endsWith('permissions.tsx');
    });
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
});
