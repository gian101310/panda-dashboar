# Panda Engine Android app

The Android project in `android-app/` wraps `https://pandaengine.app/dashboard` as a Trusted Web Activity. Its package ID is `app.pandaengine`, minimum Android API is 24, and target API is 36.

## Build

Run `powershell -ExecutionPolicy Bypass -File android-app/build-android.ps1` from the repo root. The script writes `android-app/app-release-signed.apk` for device testing and `android-app/app-release-bundle.aab` for Play Console. Generated packages and build directories are ignored by Git.

The upload key and its password are stored only in `%USERPROFILE%\.bubblewrap\pandaengine-signing\`. Back up both `release.keystore` and `signing-password.txt` securely before publishing. Keep them out of Git. Future app updates must use the same upload key unless Google Play's key reset process is used.

## Website association

`public/.well-known/assetlinks.json` contains the certificate fingerprint for the locally signed APK. Bubblewrap generates the source copy at `android-app/assetlinks.json`. After enabling Play App Signing, add Google Play's **app signing certificate** fingerprint to the `sha256_cert_fingerprints` array and deploy the updated website file. The Play signing fingerprint can differ from the upload key fingerprint.

The APK and AAB have been built and signature checked locally. A device test of the Android package and Play Console submission are separate steps.
