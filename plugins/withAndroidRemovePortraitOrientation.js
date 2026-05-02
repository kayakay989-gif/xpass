const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Removes android:screenOrientation locks from MainActivity and Google ML Kit barcode
 * activities so large-screen / foldable devices are not forced into portrait (Google Play guidance).
 */
function withAndroidRemovePortraitOrientation(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    const activities = app?.activity;
    if (!Array.isArray(activities)) return config;

    for (const activity of activities) {
      const attrs = activity.$;
      if (!attrs) continue;
      const name = attrs['android:name'];
      if (!name || typeof name !== 'string') continue;
      const shouldStrip =
        name.includes('MainActivity') || name.includes('GmsBarcodeScanningDelegateActivity');
      if (shouldStrip && attrs['android:screenOrientation'] != null) {
        delete attrs['android:screenOrientation'];
      }
    }

    return config;
  });
}

module.exports = withAndroidRemovePortraitOrientation;
