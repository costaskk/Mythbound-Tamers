# Native updater trigger

App.jsx v0.51.0 detects `window.Capacitor.Plugins.MythboundUpdater.downloadAndInstallApk`.

When an update is available:
- the popup detects the native bridge;
- the button changes to `Download & Install`;
- pressing it downloads the APK inside the app and opens Android installer automatically.

Android still asks the user to confirm installation. Keep using the native plugin files from the earlier v0.48 package if you have not installed them yet.
