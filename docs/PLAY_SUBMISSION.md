# Chess Studio: Google Play submission sheet

The Android package is `com.leglord.chessstudio`. Use the built and signed App Bundle from `android/README.md`. This sheet describes the code in this repository as of September 29, 2026; recheck it when network behavior, SDKs, or Play's forms change. Play Console declarations and review must be completed in the owner's account.

## Privacy policy and app content

- **Privacy policy URL:** `https://leglerisaac.github.io/ChessDrill/privacy.html` (public GitHub Pages HTML page; no paid hosting). The same policy is bundled offline and linked in the app footer on every screen.
- **Support contact:** the policy links to the repository's public GitHub issue form. Do not request sensitive personal details in a public issue. Play Console also requires its own developer contact fields.
- **Account creation/deletion:** Chess Studio has no accounts. Looking up a public Chess.com or Lichess username does not sign the user into Chess Studio. Account deletion form should be marked accordingly; local study deletion is in Progress → Import, export, and reset.
- **Ads and in-app purchases:** none in this build. No advertising ID permission, analytics SDK, or payment integration.
- **App access instructions:** no login required. Offline lessons, drills, and a pasted PGN can be tested without a third-party account. Public account analysis requires internet access and an existing public Chess.com or Lichess username.
- **Target audience/content rating:** choose the actual intended audience in Console and complete Google's questionnaire based on the app's chess lessons, game analysis, and external public game links. Do not select a child-directed audience without separately reviewing the Families requirements and external links.
- **Permissions:** `INTERNET` only in the manifest. The Android file picker and save picker use system document intents rather than broad storage permission.

## Data safety form: code-based starting answers

Google defines collection as transmitting data off the device, including from an app-controlled WebView. Locally processed PGNs, puzzle progress, and Stockfish positions are not collected merely because they are stored on the device. Optional account analysis sends the supplied public username to Chess.com or Lichess over HTTPS, including via an isolated Chess.com public API fallback. For that reason, do **not** answer that the app collects no data. See [Google's Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469).

| Form item | Starting answer for this build | Reason |
| --- | --- | --- |
| Collects or shares user data | Yes | An entered public account name leaves the device when the user requests account analysis. |
| Collected type | Personal info → User IDs | A Chess.com or Lichess account name can identify a person. |
| User IDs: required? | Optional | All offline study features work without account analysis. |
| User IDs: purpose | App functionality | Fetch public games and show a requested analysis report. |
| User IDs: encrypted in transit? | Yes | Requests use HTTPS. Recheck any newly added network code. |
| User IDs: processed ephemerally? | No | The username and fetched report may remain in local storage after the request. Do not assume a third party's retention period. |
| User IDs: shared? | Review the user-initiated exception | The only transfer is the user's explicit request to the named chess platform. Google's specific user-initiated action exception may make this non-reportable as “sharing”; the privacy policy still names both providers. If a later feature sends account names automatically, update this answer. |
| Data deletion request | Local deletion is available; privacy inquiries go to GitHub Issues | The app has no developer-hosted account data to erase. The owner should check the exact wording of the current Console badge before claiming remote data can be deleted. |

The public chess services also see normal request metadata such as IP address. Review Google's data type definitions against the final release and each provider's current handling; do not infer location or device-ID collection solely from ordinary HTTPS requests. File exports chosen in the system picker and links that users deliberately open are described in the privacy policy. The Data safety declaration applies to **all** versions currently distributed under this package, not just the newest build.

## Suggested store listing

**Title:** Chess Studio: Learn & Review

**Short description:** Learn openings, review your games, and turn mistakes into practice.

**Full description:**

> Build a chess study routine with guided opening lessons, a large repertoire catalog, and drills that revisit positions you miss. Replay your own PGNs, check important moves with Stockfish on your device, read explanations of the ideas behind stronger moves, and save mistakes as interactive puzzles.
>
> Optionally enter a public Chess.com or Lichess username to review recent public games and spot recurring themes. Account analysis needs an internet connection; lessons, opening drills, local PGN review, and the bundled engine work offline. No Chess Studio account or subscription is required. Study data stays on your device, with export and local deletion controls in Progress.
>
> Chess Studio is independent and is not affiliated with or endorsed by Chess.com or Lichess. Stockfish is free software; credits and licenses are available inside the app.

Avoid claiming a guaranteed rating improvement or that every engine suggestion is objectively best at every depth. The app's engine analyses a bounded set of positions, and its explanations are study guidance.

## Before a release

1. Set **Store presence → Store settings / Main store listing** to the current name, contact details, privacy URL, descriptions, icon, and screenshots captured from the actual Android build. Do not reuse Chess.com or Lichess logos as app branding.
2. Complete **Policy and programs → App content**: Data safety, ads, target audience, content rating, app access, and any declaration newly required by Play. The policy URL must remain live and match the in-app text.
3. Test a signed build on a physical phone: policy and license links offline, Android Back from those pages, file import/export, external game links, engine review, local data deletion, and reopening after deletion. Check both narrow and large screens.
4. Finish the first signed upload and Play App Signing enrollment in Console, add the GitHub environment secrets described in `android/README.md`, then confirm that the automatic internal-testing release succeeds. New builds can then use the existing internal release workflow.
5. Review licensing of every bundled dependency and asset before a public release. The credits page includes Stockfish GPLv3, Cburnett GPLv2+, chess.js BSD 2-Clause, AndroidX Apache 2.0, and source links. The Chess Studio repository is the source location for the combined build.

Google's approval is determined by the final artifact, current Console answers, account details, and review. This repository cannot complete those account-only steps on its own.
