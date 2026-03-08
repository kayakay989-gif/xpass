const { withProjectBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to fix expo-firebase-core build.gradle issues:
 * 1. Ensures compileSdk is set for all subprojects (fixes expo-firebase-core missing compileSdk)
 * 2. Fixes androidSourcesJar classifier issue (Gradle 8.x compatibility)
 * 3. Directly patches expo-firebase-core build.gradle if needed
 * 
 * Note: Autolinking is handled automatically by expo-router
 */
function withExpoFirebaseCoreFix(config) {
  // Fix project-level build.gradle to ensure all subprojects have compileSdk
  config = withProjectBuildGradle(config, (config) => {
    const buildGradle = config.modResults.contents;
    
    // Check if subprojects block already exists
    if (!buildGradle.includes('subprojects {')) {
      // Add subprojects block at the end
      config.modResults.contents = buildGradle + `

subprojects {
    afterEvaluate { project ->
        // Ensure all Android projects have compileSdk (fixes expo-firebase-core issue)
        if (project.hasProperty('android')) {
            project.android {
                if (!project.android.hasProperty('compileSdk') || project.android.compileSdk == null) {
                    compileSdk 36
                }
            }
        }
        
        // Fix androidSourcesJar classifier issue for expo-firebase-core (Gradle 8.x compatibility)
        project.tasks.configureEach { task ->
            if (task.name == 'androidSourcesJar') {
                try {
                    // Remove classifier property if it exists (not supported in Gradle 8.x)
                    if (task.hasProperty('classifier')) {
                        task.classifier = null
                    }
                } catch (e) {
                    // Ignore if classifier can't be modified
                }
            }
        }
    }
}
`;
    } else {
      // If subprojects block exists, check if our fixes are already there
      if (!buildGradle.includes('compileSdk 36') || !buildGradle.includes('androidSourcesJar')) {
        // Try to inject our fixes into the existing subprojects block
        // Find the subprojects block and add our code before the closing brace
        const subprojectsRegex = /(subprojects\s*\{[^}]*)(\})/s;
        if (subprojectsRegex.test(buildGradle)) {
          config.modResults.contents = buildGradle.replace(
            subprojectsRegex,
            `$1
    afterEvaluate { project ->
        // Ensure all Android projects have compileSdk (fixes expo-firebase-core issue)
        if (project.hasProperty('android')) {
            project.android {
                if (!project.android.hasProperty('compileSdk') || project.android.compileSdk == null) {
                    compileSdk 36
                }
            }
        }
        
        // Fix androidSourcesJar classifier issue for expo-firebase-core (Gradle 8.x compatibility)
        project.tasks.configureEach { task ->
            if (task.name == 'androidSourcesJar') {
                try {
                    if (task.hasProperty('classifier')) {
                        task.classifier = null
                    }
                } catch (e) {
                    // Ignore if classifier can't be modified
                }
            }
        }
    }
$2`
          );
        }
      }
    }
    
    return config;
  });

  // Also try to directly patch expo-firebase-core build.gradle if it exists
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const expoFirebaseCorePath = path.join(
        projectRoot,
        'node_modules',
        'expo-firebase-core',
        'android',
        'build.gradle'
      );

      if (fs.existsSync(expoFirebaseCorePath)) {
        let buildGradle = fs.readFileSync(expoFirebaseCorePath, 'utf8');
        let modified = false;

        // Add compileSdk if missing
        if (!buildGradle.includes('compileSdk')) {
          if (buildGradle.includes('android {')) {
            buildGradle = buildGradle.replace(
              /(android\s*\{)/,
              `$1
    compileSdk 36`
            );
            modified = true;
          }
        }

        // Remove classifier from androidSourcesJar task
        if (buildGradle.includes('classifier')) {
          buildGradle = buildGradle.replace(
            /(\s+)classifier\s*=\s*['"][^'"]*['"]/g,
            ''
          );
          modified = true;
        }

        if (modified) {
          fs.writeFileSync(expoFirebaseCorePath, buildGradle, 'utf8');
          console.log('[withExpoFirebaseCoreFix] Patched expo-firebase-core build.gradle');
        }
      }

      return config;
    },
  ]);

  return config;
}

module.exports = withExpoFirebaseCoreFix;
