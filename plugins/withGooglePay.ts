import { ConfigPlugin, withAppBuildGradle } from '@expo/config-plugins';

/**
 * Expo config plugin to add Google Pay SDK dependency for Android
 * Adds Google Pay SDK dependency to app/build.gradle
 * 
 * Note: The native module (GooglePayModule.kt) must be manually registered in MainApplication.kt
 * after running `expo prebuild`. See GOOGLE_PAY_SETUP.md for details.
 */
const withGooglePay: ConfigPlugin = (config) => {
  // Only apply to Android builds, skip for web
  if (!config.android) {
    return config;
  }

  // Add Google Pay dependency to app/build.gradle
  config = withAppBuildGradle(config, (config) => {
    const buildGradle = config.modResults.contents;

    // Check if Google Pay dependency already exists
    if (buildGradle.includes('play-services-wallet')) {
      return config;
    }

    // Find dependencies block and add Google Pay SDK
    const dependenciesRegex = /dependencies\s*\{([^}]*)\}/;
    const dependenciesMatch = buildGradle.match(dependenciesRegex);

    if (dependenciesMatch) {
      // Add Google Pay dependency before the closing brace
      const newDependenciesBlock = dependenciesMatch[0].replace(
        /(\s*)\}/,
        `$1    implementation 'com.google.android.gms:play-services-wallet:19.5.0'\n$1}`
      );
      config.modResults.contents = buildGradle.replace(dependenciesRegex, newDependenciesBlock);
    } else {
      // Add dependencies block if it doesn't exist
      const dependenciesBlock = `
dependencies {
    implementation 'com.google.android.gms:play-services-wallet:19.5.0'
}`;
      config.modResults.contents = buildGradle + dependenciesBlock;
    }

    return config;
  });

  return config;
};

export default withGooglePay;
