#!/bin/sh
# Construit l'APK signée de Playzino : mobile/dist/playzino.apk
# Prérequis : JDK 21 (JAVA_HOME, ou ~/.jdks/jdk-21*), SDK Android (ANDROID_HOME), clé ~/.playzino/keystore.properties.
# Pour une mise à jour : augmenter versionCode (et versionName) dans android/app/build.gradle.
set -e
cd "$(dirname "$0")"
[ -n "$JAVA_HOME" ] || JAVA_HOME=$(ls -d "$HOME"/.jdks/jdk-21*/Contents/Home 2>/dev/null | head -1)
export JAVA_HOME
export ANDROID_HOME=${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}
npx cap sync android
(cd android && ./gradlew --no-daemon assembleRelease)
mkdir -p dist
cp android/app/build/outputs/apk/release/app-release.apk dist/playzino.apk
"$ANDROID_HOME"/build-tools/36.0.0/apksigner verify dist/playzino.apk
ls -lh dist/playzino.apk
