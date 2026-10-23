/**
 * Expo config plugin: stable release signing for CI-built APKs.
 *
 * Adds a `release` signingConfig to android/app/build.gradle that is used ONLY when these
 * Gradle properties are set (e.g. -P flags or ~/.gradle/gradle.properties in CI):
 *   BLOOM_UPLOAD_STORE_FILE      absolute path to the .jks/.keystore
 *   BLOOM_UPLOAD_STORE_PASSWORD
 *   BLOOM_UPLOAD_KEY_ALIAS
 *   BLOOM_UPLOAD_KEY_PASSWORD
 * Without them the release build keeps the template's debug signing, so local builds and
 * forks without secrets still work. Nothing secret is ever written into the project.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// @bloom/release-signing';

const SIGNING_BLOCK = `
        ${MARKER}
        release {
            if (project.hasProperty('BLOOM_UPLOAD_STORE_FILE')) {
                storeFile file(BLOOM_UPLOAD_STORE_FILE)
                storePassword BLOOM_UPLOAD_STORE_PASSWORD
                keyAlias BLOOM_UPLOAD_KEY_ALIAS
                keyPassword BLOOM_UPLOAD_KEY_PASSWORD
            }
        }`;

function applySigning(src) {
  if (src.includes(MARKER)) return src;

  // 1) add the release signingConfig next to the debug one
  const signingRe = /signingConfigs\s*\{\s*\n(\s*)debug\s*\{[\s\S]*?\n\1\}/;
  if (!signingRe.test(src)) throw new Error('[withReleaseSigning] signingConfigs.debug block not found in app/build.gradle');
  src = src.replace(signingRe, (m) => `${m}${SIGNING_BLOCK}`);

  // 2) inside buildTypes.release, pick release signing when configured
  const releaseRe = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!releaseRe.test(src)) throw new Error('[withReleaseSigning] buildTypes.release signingConfig not found in app/build.gradle');
  src = src.replace(
    releaseRe,
    `$1signingConfig project.hasProperty('BLOOM_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`
  );
  return src;
}

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') throw new Error('[withReleaseSigning] only Groovy build.gradle is supported');
    cfg.modResults.contents = applySigning(cfg.modResults.contents);
    return cfg;
  });

module.exports = withReleaseSigning;
module.exports.applySigning = applySigning;
