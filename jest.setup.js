// Jest crashes when a test file imports the real AsyncStorage module directly,
// because the real native module doesn't exist in the Jest (Node) environment.
// Just listing the package's own mock file in `setupFiles` isn't enough on
// this AsyncStorage version — it has to be wired in explicitly with
// jest.mock() so every `import AsyncStorage from '@react-native-async-storage/async-storage'`
// resolves to the mock instead of the native implementation.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
