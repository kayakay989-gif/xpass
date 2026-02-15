const { withGradleProperties, withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Expo config plugin to automatically configure Google Services for Android
 * This plugin:
 * 1. Adds the Google Services Gradle plugin to root build.gradle
 * 2. Applies the plugin in app/build.gradle
 * 3. Ensures google-services.json is properly referenced
 */
const withGoogleServices = (config) => {
  // Ensure google-services.json is copied to android/app/
  config = withGradleProperties(config, (config) => {
    return config;
  });

  // Modify app-level build.gradle to apply Google Services plugin
  config = withAppBuildGradle(config, (config) => {
    const buildGradle = config.modResults.contents;

    // Check if Google Services plugin is already applied
    if (buildGradle.includes('com.google.gms.google-services')) {
      return config;
    }

    // Find the plugins block and add Google Services plugin
    const pluginsRegex = /plugins\s*\{([^}]*)\}/;
    const pluginsMatch = buildGradle.match(pluginsRegex);

    if (pluginsMatch) {
      // Add Google Services plugin to existing plugins block
      const newPluginsBlock = pluginsMatch[0].replace(
        /([\s\S]*?)(id\([^)]+\)[\s\n]*)/,
        `$1$2    id("com.google.gms.google-services")\n`
      );
      config.modResults.contents = buildGradle.replace(pluginsRegex, newPluginsBlock);
    } else {
      // Add plugins block if it doesn't exist (shouldn't happen in Expo)
      const pluginsBlock = `plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
    // ... other plugins
}`;
      config.modResults.contents = pluginsBlock + '\n' + buildGradle;
    }

    return config;
  });

  return config;
};

module.exports = withGoogleServices;







