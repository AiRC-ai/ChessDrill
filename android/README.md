# Chess Studio for Android

The Android app bundles the Chess Studio website and Stockfish 19 Lite in a local WebView. Opening lessons, drills, saved game puzzles, and PGN game review work without a connection. Fetching recent Chess.com or Lichess games and opening original game links require internet access. Progress is stored on this device under the app's own storage origin.

## Build

Install Android Studio with Android SDK 35 and JDK 17, plus Node.js 22. From the repository root run `npm ci`. Open `android/` in Android Studio and build the `app` module, or run `gradle :app:assembleDebug` from `android/` with Gradle 8.11.1 installed. Gradle rebuilds the web app with `/assets/web/` as its base and includes the output in the APK. GitHub Actions also produces debug and unsigned release APK artifacts on changes to the app.

The Android package currently uses `com.leglerisaac.chessstudio.preview` so it can be installed while a permanent distribution key and Play Store listing are decided. Debug APKs are signed with a temporary development key and may require uninstalling before a later build can be installed. Back up progress before uninstalling.

## Transfer progress from the website

On the website, go to **Progress → Back up progress**. In the Android app, go to **Progress → Import PGN / backup** and choose that JSON file. These backups include opening selections, custom repertoire, lesson completion, spaced reviews, and saved game puzzle cards. Cached analysis reports and full game reviews are device-specific and are not included in that export; import a PGN or analyze an account again on Android to recreate those reports.

The native file picker imports PGN and JSON files. Exports open Android's **Save to…** picker. External chess links open in the device's browser. Android's Back button exits the current study, review, or page before closing the app.

## Source and licenses

The web application remains the single source of truth for both platforms. The bundled Stockfish code and its GPLv3 `Copying.txt` are placed in `assets/web/stockfish/` by the web build. The Android source code and dependency declarations are in this folder.
