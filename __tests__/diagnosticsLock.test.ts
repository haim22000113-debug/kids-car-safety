jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { sha256Hex } from '../src/utils/sha256';
import { isDiagnosticsCode, isDiagnosticsUnlocked, unlockDiagnostics, lockDiagnostics } from '../src/diagnostics';

describe('מסך האבחון - רק עם הקוד של הבעלים', () => {
  it('sha256 נכון (וקטורי בדיקה רשמיים)', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    );
    expect(sha256Hex('שלום עולם')).toBe('5fdd1afb5cef74cd5b28d3e00fd12a2b638cefdc0642b99eb82822924713faca');
  });

  it('קוד שגוי לא פותח', async () => {
    expect(isDiagnosticsCode('000000')).toBe(false);
    expect(await unlockDiagnostics('123456')).toBe(false);
    expect(await isDiagnosticsUnlocked()).toBe(false);
  });

  it('נעול כברירת מחדל, ו"נעל" סוגר שוב', async () => {
    await lockDiagnostics();
    expect(await isDiagnosticsUnlocked()).toBe(false);
  });
});
