/* eslint-disable @typescript-eslint/no-require-imports */
const { applySigning } = require('../plugins/withReleaseSigning') as { applySigning: (s: string) => string };

const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            shrinkResources false
        }
    }
}`;

describe('withReleaseSigning', () => {
  it('adds a property-gated release signing config and keeps debug as fallback', () => {
    const out = applySigning(TEMPLATE);
    expect(out).toContain("if (project.hasProperty('BLOOM_UPLOAD_STORE_FILE'))");
    expect(out).toContain('storeFile file(BLOOM_UPLOAD_STORE_FILE)');
    expect(out).toContain(
      "signingConfig project.hasProperty('BLOOM_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug"
    );
    // debug build type untouched
    expect(out).toMatch(/debug \{\n\s+signingConfig signingConfigs\.debug\n/);
  });

  it('is idempotent', () => {
    const once = applySigning(TEMPLATE);
    expect(applySigning(once)).toBe(once);
  });

  it('fails loudly if the template changes shape', () => {
    expect(() => applySigning('android {}')).toThrow(/signingConfigs.debug/);
  });
});
