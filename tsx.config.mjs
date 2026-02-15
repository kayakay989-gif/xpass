// tsx configuration to exclude React Native
export default {
  // Tell tsx to treat these as external (don't bundle)
  external: [
    'react-native',
    'react-native/*',
    'expo',
    'expo/*',
    '@react-native/*',
    '@expo/*',
  ],
};

