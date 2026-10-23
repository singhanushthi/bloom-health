#!/usr/bin/env bash
# Create a release keystore for Bloom's GitHub Actions APK builds and print the values
# to store as repository secrets. Run once, keep the .jks somewhere safe (password manager /
# private backup). If you lose it, future APKs can't update the installed app.
#
# Usage: scripts/make-keystore.sh [output.jks]
# Needs: keytool (comes with any JDK), base64.
set -euo pipefail

OUT="${1:-bloom-release.jks}"
ALIAS="${BLOOM_KEY_ALIAS:-bloom}"

if [ -e "$OUT" ]; then
  echo "Refusing to overwrite existing $OUT" >&2
  exit 1
fi
command -v keytool >/dev/null || { echo "keytool not found — install a JDK (e.g. Temurin 17)" >&2; exit 1; }

read -r -s -p "Choose a keystore password (min 6 chars): " STOREPASS; echo
read -r -s -p "Repeat it: " STOREPASS2; echo
[ "$STOREPASS" = "$STOREPASS2" ] || { echo "Passwords don't match" >&2; exit 1; }
[ ${#STOREPASS} -ge 6 ] || { echo "Password too short" >&2; exit 1; }

# PKCS12 keystores use the same password for the key.
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore "$OUT" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$STOREPASS" -keypass "$STOREPASS" \
  -dname "CN=Bloom, O=Personal, C=IN"

echo
echo "Created $OUT (alias: $ALIAS). It is gitignored (*.jks) — never commit it."
echo
echo "Now set the GitHub secrets (needs the GitHub CLI, logged in, run inside the repo):"
echo
echo "  base64 -w0 \"$OUT\" | gh secret set ANDROID_KEYSTORE_BASE64     # macOS: base64 -i \"$OUT\" | gh secret set ANDROID_KEYSTORE_BASE64"
echo "  gh secret set ANDROID_KEYSTORE_PASSWORD   # paste the password when asked"
echo "  gh secret set ANDROID_KEY_ALIAS --body \"$ALIAS\""
echo "  gh secret set ANDROID_KEY_PASSWORD        # same password again"
