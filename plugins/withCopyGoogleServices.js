const {
  withDangerousMod,
  withProjectBuildGradle,
  withAppBuildGradle,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * 1) Copies project-root google-services.json → android/app/google-services.json
 * 2) Wires the Google Services Gradle plugin (classpath + apply) via config-plugins
 *
 * Note: expo-build-properties does not implement googleServicesFile in its schema;
 * the old app.json key was ignored during prebuild.
 */
function withCopyGoogleServices(config) {
  config = withProjectBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes('com.google.gms:google-services')) {
      contents = contents.replace(
        /classpath\('org\.jetbrains\.kotlin:kotlin-gradle-plugin'\)/,
        "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')\n    classpath('com.google.gms:google-services:4.4.2')"
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes('com.google.gms.google-services')) {
      contents = contents.replace(
        /apply plugin: "com\.facebook\.react"/,
        'apply plugin: "com.facebook.react"\napply plugin: "com.google.gms.google-services"'
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const src = path.join(projectRoot, 'google-services.json');
      const dest = path.join(platformRoot, 'app', 'google-services.json');

      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }

      return cfg;
    },
  ]);

  return config;
}

module.exports = withCopyGoogleServices;
