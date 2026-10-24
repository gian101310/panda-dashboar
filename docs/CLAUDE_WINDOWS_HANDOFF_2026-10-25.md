# Windows to Mac handoff — 2026-10-25

## Goal for Mac Codex

Boss-G wants to prepare a separate iOS app for Panda Engine on his Mac. The existing website and Android app must keep working while the iOS project is developed. This handoff records the starting point; no iOS project or App Store submission has been created yet.

## Current mobile state

- The responsive site at `https://pandaengine.app` works on an iPhone and Boss-G has installed it on the Home Screen from Chrome.
- Android source is in `android-app/`; see `docs/ANDROID_APP.md`. It is a Bubblewrap Trusted Web Activity for `https://pandaengine.app/dashboard` with package ID `app.pandaengine`.
- The Android APK was installed and opened successfully on Boss-G's phone. Android device testing does not verify iOS native packaging.
- The site's login and maintenance gates remain server controlled. Do not weaken or bypass them for mobile packaging. Test unauthenticated login, normal user login, admin access during maintenance, navigation, and logout on a real iPhone.
- Screenshot blocking was discussed for Android but was not implemented. Do not assume that request applies to iOS.

## iOS work boundaries

1. In the Mac checkout, run `git fetch` and `git pull --ff-only origin main`; read `AGENTS.md`, `CLAUDE.md`, this handoff, and `docs/ANDROID_APP.md`. Check `git status` and recent commits before editing because Windows and Mac share `main`.
2. Keep iOS-specific source and configuration in a separate `ios-app/` directory. Keep `android-app/` and existing web/engine behavior intact unless Boss-G explicitly requests a shared change. Do not reuse the Android APK, package ID, upload key, or keystore for iOS.
3. Choose an iOS packaging approach that suits the existing authenticated Next.js site, then build and test it on the Mac with Xcode and an iPhone. The installed Home Screen web app is already a usable baseline; an App Store binary is separate work. Check Apple's current review rules for web wrappers before committing to a thin WebView shell.
4. Keep Apple signing credentials, provisioning profiles, and any secrets out of Git. An Apple Developer Program account and App Store Connect setup are needed for store distribution; neither has been reported as complete.
5. Keep changes scoped, run the project checks required by `AGENTS.md`, commit and push only to `gian101310/panda-dashboar` on `main`, and write a dated `docs/MAC_HANDOFF_<YYYY-MM-DD>.md` with what was built and actually tested. Never force-push or overwrite another machine's uncommitted work.

## Windows repo state at handoff

- `origin/main` was at `b530e42 add-admin-access-to-maintenance-screen` before this documentation commit.
- Existing Windows edits in `.gitignore`, `app.py`, `snapshot.png`, and `tools/journal-sync-agent.mjs`, plus untracked scratch files, are unrelated and were left untouched.
- This handoff changes documentation only. It does not create an iOS app, alter production site behavior, or submit to either app store.
