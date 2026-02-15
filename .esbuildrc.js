// esbuild config to exclude React Native from server builds
module.exports = {
  external: [
    'react-native',
    'react-native/*',
    'expo',
    'expo/*',
    '@react-native/*',
    '@expo/*',
    'expo-constants',
    'expo-router',
  ],
};

