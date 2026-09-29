# Chess Studio for Android

The Android app bundles the Chess Studio website and Stockfish 19 Lite in a local WebView. Opening lessons, drills, saved game puzzles, and PGN game review work without a connection. Fetching recent Chess.com or Lichess games and opening original game links require internet access. Progress is stored on this device under the app's own storage origin.

## Build

Install Android Studio with Android SDK 36 and JDK 17, plus Node.js 22. From the repository root run `npm ci`. Open `android/` in Android Studio and build the `app` module, or run `gradle :app:assembleDebug` from `android/` with Gradle 8.11.1 installed. Gradle rebuilds the web app with `/assets/web/` as its base and includes the output in the APK. GitHub Actions produces debug and unsigned release APK artifacts, plus an unsigned App Bundle, on changes to the app.

The Android package is `com.leglerisaac.chessstudio`. CI produces an unsigned release APK and a debug APK for verification. Sign release APKs with the same private signing key for all updates; never commit that key or password to the repository. Debug APKs have a different signature and cannot update an installed release build. Back up progress before changing build variants or uninstalling.

## Automatic Google Play internal releases

Each successful `main` build of the Android workflow signs the exact App Bundle produced by its test/build job and uploads it to the **internal testing** track. A manual **Run workflow** on `main` does the same. This does not publish to production. The version code is generated from the GitHub workflow run number and attempt; change `appVersionName` in `android/gradle.properties` when you want a new visible version. Avoid rerunning an older workflow after a newer version has reached Play, since Play rejects older version codes. CI permits up to nine attempts of the same run; start a new run after that.

The publishing job requires a one-time Play Console and GitHub setup:

1. In Play Console, create the app with package name `com.leglerisaac.chessstudio`. Complete its app information and required declarations. Configure **Play App Signing** and upload the **first signed App Bundle in Play Console**; the Publishing API cannot bootstrap an app with no first uploaded artifact. Set up internal testers. If the app already exists, use its registered **upload key**, not an unrelated key. Back up your upload keystore and password securely.
2. In Google Cloud, create or choose a project and enable the **Google Play Developer API**. Create a service account and invite its email address under **Play Console → Users and permissions**. Grant access only to Chess Studio and the **View app information and download bulk reports (read-only)** and **Release apps to testing tracks** permissions. Create a JSON key for that service account.
3. In the GitHub repository, create an environment called `play-internal` under **Settings → Environments**. Restrict deployment branches to `main`. Leave required reviewers off if every build should deploy automatically. Add the following *environment secrets*:

   | Secret | Value |
   | --- | --- |
   | `PLAY_UPLOAD_KEYSTORE_BASE64` | Base64 of the PKCS#12 (`.p12`) keystore containing the registered upload key |
   | `PLAY_UPLOAD_STORE_PASSWORD` | Keystore password |
   | `PLAY_UPLOAD_KEY_PASSWORD` | Key password (can be the same as the keystore password) |
   | `PLAY_UPLOAD_KEY_ALIAS` | Alias of the upload key, for example `chessstudio` |
   | `PLAY_SERVICE_ACCOUNT_JSON` | Entire downloaded Google service account JSON key |

   To prepare the keystore value locally without line breaks, run `base64 < upload-key.p12 | tr -d '\n'` and paste its output directly into the secret field. Never commit the keystore, passwords, base64 text, or service account JSON. Remove any local temporary copies you no longer need.
4. Run **Build Chess Studio Android** from the repository’s Actions tab, or push a change to the Android app. Check the `build` and `publish-internal` jobs, then confirm the release and tester availability in Play Console. Before those secrets are added, the publishing job fails with the name of the missing secret; the APK and App Bundle artifacts still build.

For the first Console upload, download the unsigned `chess-studio-unsigned-bundle` workflow artifact and sign `app-release.aab` with the same PKCS#12 key using JDK 17:

```bash
export PLAY_UPLOAD_STORE_PASSWORD='your keystore password'
export PLAY_UPLOAD_KEY_PASSWORD='your key password'
jarsigner -keystore upload-key.p12 -storetype PKCS12 \
  -storepass:env PLAY_UPLOAD_STORE_PASSWORD -keypass:env PLAY_UPLOAD_KEY_PASSWORD \
  -signedjar chess-studio-first.aab app-release.aab chessstudio
jarsigner -verify chess-studio-first.aab
```

Replace `chessstudio` with your key alias. Keep these values out of shell history and transcripts. The first workflow publish attempt will fail until Play accepts the initial Console upload. A later new run creates a higher version code automatically.

If you previously installed a directly signed APK and let Play generate a different **app signing key**, the Play-distributed app has a different device signature. Export your Progress JSON before uninstalling the old APK, then install the Play build and import the backup. Supplying your existing app signing key during Play App Signing setup preserves the device signature, but gives Google a copy of that private key; choose that setup deliberately.

## Transfer progress from the website

On the website, go to **Progress → Back up progress**. In the Android app, go to **Progress → Import PGN / backup** and choose that JSON file. These backups include opening selections, custom repertoire, lesson completion, spaced reviews, and saved game puzzle cards. Cached analysis reports and full game reviews are device-specific and are not included in that export; import a PGN or analyze an account again on Android to recreate those reports.

The native file picker imports PGN and JSON files. Exports open Android's **Save to…** picker. External chess links open in the device's browser. Android's Back button exits the current study, review, or page before closing the app.

The app footer opens the bundled **Privacy policy** and **Open-source credits** pages without needing an internet connection. Back returns to the study screen. Progress → Import, export, and reset → **Delete all local data** erases this app's saved openings, progress, cached account reports, games, full reviews, and puzzles. The public Play privacy URL is `https://leglerisaac.github.io/ChessDrill/privacy.html`; the [Play submission sheet](../docs/PLAY_SUBMISSION.md) lists the Console declarations that accompany this build.

## Source and licenses

The web application remains the single source of truth for both platforms. The bundled Stockfish code and its GPLv3 `Copying.txt` are placed in `assets/web/stockfish/` by the web build. The Android source code and dependency declarations are in this folder.
