# Bloom: personal health hub (Android)

Bloom tracks your **cycle, steps, sleep, heart rate and SpO₂** in one calm place.

**Bloom works on its own.** You don't need Flo, a Noise watch, NoiseFit or Google Fit. You log periods, symptoms, mood, sleep and readings in Bloom, and your phone counts your steps. Everything is stored on the phone. There's no account, no server and no analytics.

Extras are optional:
- **Health Connect** gives you all-day step counting on Android 14+. It also brings in data from apps you already use (Flo, a watch through NoiseFit → Google Fit).
- **AI Coach** answers questions about your data in plain language. It uses your own free Google Gemini key.

---

## Install the app (no computer tools needed)

The APK is built automatically on GitHub every time `main` changes.

1. On your phone, open the repository's **Releases** page (`https://github.com/<you>/<repo>/releases`).
2. Open the newest release (for example **Bloom v1.0.0**) and tap **`bloom-1.0.0.apk`** under *Assets*.
3. When Android asks, allow **Install unknown apps** for your browser, then tap **Install**.
4. Open **Bloom**. Onboarding takes about a minute.

The same APK is also attached to each workflow run as the artifact **bloom-apk** (Actions tab → *Android APK* → latest run). Artifacts download as a `.zip`, so the Release is easier on a phone.

**Updates:** install the newer APK over the old one and your data stays. This needs the build to use the same signing key every time; see [Stable signing](#stable-signing-do-this-once).

**Alternative (EAS):** `npx eas-cli@latest build -p android --profile preview` builds the same APK on Expo's servers. It needs a free Expo account. EAS manages its own keystore, so an EAS build and a GitHub build can't update each other.

---

## Features

### Today
- A greeting, plus a small **Ask Bloom** card that opens the AI coach.
- Cards for the areas you chose to track (cycle, steps, sleep, heart rate & SpO₂).
- **Every card shows where its data came from**: "Logged in Bloom", "Phone (Health Connect)", "Phone (while Bloom is open)", "Flo", "Google Fit", "NoiseFit"…
- One floating **Log** button opens an action sheet: **Period**, **Day log**, **Sleep** or **Reading**.
- Pull down to refresh.

### Cycle (in-app logging first)
- **Log period**: start date, optional end date ("Still going" / "Ended"), and flow (light / medium / heavy).
- **Day log**: flow (none / light / medium / heavy), symptom chips (cramps, headache, bloating, acne, tender breasts, fatigue, back pain), mood chips (calm, happy, energetic, irritable, anxious, low) and a note. Flow logged here also counts as a period day.
- **Tap any day** on the calendar (today or earlier) to open that day's log.
- Predictions come from the **merged** history: your Bloom logs plus Health Connect `MenstruationPeriod`/`MenstruationFlow` (for example from Flo), when connected. If the same period appears in both, overlapping and adjacent days are merged into one period. The cycle history shows which source each period came from.
- Predictions are always labelled as **estimates**. They are not contraception advice.

### Steps
Bloom uses the first of these that has data:
1. **Your manual value for today** ("Edit today's steps"), if you set one.
2. **Health Connect aggregate**, if it's available and you allowed Steps. On **Android 14+** Health Connect counts steps from the phone's own sensor all day, with **no other app installed**. It also removes duplicates when several apps write steps.
3. **Bloom's own counter** (the phone sensor through `expo-sensors` `Pedometer.watchStepCount`). It counts **only while Bloom is open**, saves the count per day on the phone, and the card says: *"Counts only while Bloom is open — Android 14+ with Health Connect counts all day."* It needs the **Physical activity** (`ACTIVITY_RECOGNITION`) permission. Bloom asks for it during onboarding or from the Steps card or Settings.

Distance is Health Connect's value when there is one. Otherwise it's **steps × stride**: 72 cm by default, which you can change in Settings. Bloom labels this distance "est.". **Calories appear only if Health Connect provides them.** Bloom never estimates calories.

### Sleep
- **Log sleep**: bedtime, wake time and quality (1–5). Bloom uses the native Android date/time pickers.
- If Health Connect has sleep from a watch, Bloom merges it in. When the same night comes from both, it isn't counted twice. **Stages** (deep / light / REM) appear only when a source recorded them.

### Heart rate and SpO₂
- **Add reading**: heart rate (30–220 bpm) or SpO₂ (70–100 %), with date and time. An invalid value shows an error right under the field.
- Health Connect values (for example from a watch) are merged in when connected. Resting heart rate comes only from a watch; Bloom never guesses it.
- With no data, the card shows **Add reading** and **Connect a watch in Settings for automatic readings**.
- Bloom does **not** measure anything with the camera.

### Trends
7- or 30-day charts for steps (with a goal line), sleep and heart rate. With no watch, the heart chart shows the daily average of your logged readings and says so. Each chart has a source label and a spoken summary.

### Settings
- **What you track**: choose which areas Today shows.
- **Steps**: daily goal, stride length, and the phone-sensor permission.
- **AI Coach**: set up your Gemini key (see below).
- **Health Connect (optional)**: connect, manage permissions, and see which app supplied each data type.
- **Connected apps (optional)**: checklist for Flo → Health Connect, NoiseFit → Google Fit, and **Google Fit → Profile → Settings → "Sync Fit with Health Connect"**.
- **Your data**: **Export as JSON** (opens the share sheet) and **Delete all my data** (asks you to confirm first).
- **Demo mode**: fills every screen with realistic sample data.

### Onboarding
Welcome → **What to track** (cycle / steps / sleep / heart) → *optional* **"Connect Health Connect for all-day steps (and your watch/Flo if you use them)"** with **Skip for now** → done.

### Accessibility
- Text contrast is at least 4.5:1.
- Touch targets are at least 44×44 dp.
- Body text is 16 sp.
- Every input has a visible label, and errors appear inline next to the field.
- Every card and chart has a spoken summary.
- Meaning never depends on colour alone. Icons, dashes, patterns and check marks carry it too.
- Animations last 150–300 ms and are skipped when Reduce Motion is on.

---

## AI Coach (optional, uses your own free Gemini key)

1. Go to **https://aistudio.google.com/app/apikey** on any device and sign in with a Google account.
2. Tap **Create API key** and copy it. New keys start with **`AQ.`**; older keys start with `AIza`. Both work.
3. In Bloom open **Settings → AI Coach**, paste the key into **Gemini API key** and tap **Use my key**.
   - Bloom sends one tiny test request. You'll see **"AI coach turned on"** or **"Google didn't accept that key"**.
   - The key is stored encrypted on the phone (`expo-secure-store`). It is only ever sent to `generativelanguage.googleapis.com`, in the `x-goog-api-key` header. **Remove key** deletes it.
4. On Today, tap **Ask Bloom**. You can tap a suggested question ("Explain my cycle phase", "How was my sleep this week?", "Am I hitting my step goal?"), use **Morning brief** or **Weekly review**, or type your own question.

**What gets sent:** your question, plus a compact summary of the last 30 days. The summary includes cycle day and phase, averages, steps and sleep for the last 7 days, symptom and mood counts, and your latest readings. **Day-log notes are never sent.** Bloom builds the summary once and rebuilds it only when your data changes. In demo mode the coach sees the sample data.

> On screen: *"Your question and a summary of your data are sent to Google to answer. On the free tier Google may use them to improve its products."*

**The coach is instructed to:**
- answer in plain language and use only your data;
- say when data is missing;
- never diagnose;
- suggest seeing a doctor if a pattern looks concerning;
- treat cycle predictions as estimates, not contraception advice.

**Free limits:** the free tier allows only a few requests a minute and has a small daily cap, which differs by model. Bloom tries models in this order:
1. the model that last worked (remembered on the phone);
2. Gemini **3.8 Flash**;
3. **3.6 Flash**;
4. **3.5 Flash-Lite**;
5. **3.1 Flash-Lite**.

It moves to the next model when one is out of quota, retired or overloaded. When every model is used up, you'll see *"You've hit Gemini's free limit for now — it resets around 12:30–1:30 pm IST"*. Daily quotas reset at midnight Pacific time.

**Technical details:**
- Calls go to the REST endpoint `v1beta/models/{model}:streamGenerateContent?alt=sse`.
- Replies stream token by token through `expo/fetch`, because React Native's built-in `fetch` can't stream response bodies. If streaming isn't available, Bloom calls `:generateContent` and shows the whole answer at once.
- Bloom requests the fastest thinking level each model supports: `minimal`, or `low` for 3.8 Flash. If a model rejects that setting, Bloom retries once without it.
- Bloom never calls the list-models endpoint.

---

## Stable signing (do this once)

Android installs an update over an existing app **only if both are signed with the same key**. The workflow handles this as follows:

- **With secrets (recommended):** it signs with your own keystore.
- **Without secrets:** it falls back to the debug keystore that `expo prebuild` copies from Expo's template, and posts a warning in the job summary. That keystore is the same from build to build today, but it is **public** and can change when Expo updates its template (for example with a new SDK). If it changes, updates stop installing.

Create your keystore and set the secrets. You need a JDK (for `keytool`) and the GitHub CLI (`gh auth login`):

```bash
scripts/make-keystore.sh bloom-release.jks       # asks for a password, creates the keystore
base64 -w0 bloom-release.jks | gh secret set ANDROID_KEYSTORE_BASE64     # macOS: base64 -i bloom-release.jks | gh secret set …
gh secret set ANDROID_KEYSTORE_PASSWORD          # paste the password
gh secret set ANDROID_KEY_ALIAS --body bloom
gh secret set ANDROID_KEY_PASSWORD               # same password
```

**Back up `bloom-release.jks` and its password**, for example in a password manager. `*.jks` is gitignored, so never commit it. If you lose the keystore, you'll have to uninstall Bloom (export your data first) before a build signed with a new key will install.

> Switching from debug signing to your own key changes the signature once, so Android will refuse to install the new build over the old one. Export your data first (Settings → Your data). Bloom can't import yet, so keep that JSON file as a backup. Then uninstall the old build and install the new one.

### How the CI build works

[`.github/workflows/android-apk.yml`](.github/workflows/android-apk.yml) runs on a push to `main` or when started manually from the Actions tab (`workflow_dispatch`):

1. Sets up `ubuntu-latest`, **Node 22** and **JDK 17** (Temurin), with Gradle caching through `gradle/actions/setup-gradle`. JDK 17 is the version React Native recommends, and RN 0.88's Gradle plugin targets the JDK 17 toolchain.
2. Runs `npm ci`, then `tsc` and `jest`.
3. Runs `npx expo prebuild --platform android --no-install`. The local config plugin [`plugins/withReleaseSigning.js`](plugins/withReleaseSigning.js) adds a release signing config that is used only when the `BLOOM_UPLOAD_*` Gradle properties exist. The workflow writes those properties to `~/.gradle/gradle.properties` from the secrets.
4. Runs `./gradlew assembleRelease` and renames the output to `bloom-<version>.apk`. The version comes from `app.json` → `expo.version`.
5. Uploads the artifact **bloom-apk** and creates or updates the GitHub Release **`v<version>`** with the APK attached (`permissions: contents: write`).

To publish a new version, bump `expo.version` (and `android.versionCode`) in `app.json`. Pushing without a bump replaces the APK on the existing release.

---

## Build locally (developers)

You need **Node.js 22.13+** and npm, plus Android Studio (SDK platform 37, JDK 17) for native builds.

```bash
npm install            # .npmrc sets legacy-peer-deps=true (see Notes)
npm run typecheck      # tsc --noEmit
npm test               # jest-expo: cycle math + merging, SQLite repos, AI key/fallback/summary, signing plugin, screen smoke tests
npx expo run:android   # prebuild + install a debug build on a USB-connected phone
```

Bloom needs a development or release build. Expo Go can't load the native modules (Health Connect, SQLite, secure store), so there you can only use demo mode.

---

## Architecture

```
src/
├── app/                     expo-router routes
│   ├── _layout.tsx          fonts + providers: AppState → StepSensor → Coach → LogSheets
│   ├── index.tsx            redirect → onboarding | tabs
│   ├── coach.tsx            AI coach chat (pushed from Today's "Ask Bloom" card)
│   ├── onboarding/          index (welcome) · track · connect (optional HC) · done
│   └── (tabs)/              index (Today + Log button) · trends · cycle · settings
├── db/                      expo-sqlite store: schema + migrations, repositories, JSON export/share
├── sensors/                 Pedometer foreground counting → step_days; StepSensor provider
├── health/                  data layer — merges Bloom's own data with optional Health Connect
│   ├── cyclePrediction.ts   pure: grouping, merge/dedupe of sources, averages, phases, predictions
│   └── activity, sleep, heart, spo2, cycle, trends, sources, capabilities, client, read
├── ai/                      key (format + secure store), gemini (REST, SSE, fallback), summary, prompts, CoachState
├── components/              ui, charts, cards (with SourceTag), sheets/ (Sheet, DateTimeField, LogSheets)
├── data/mock.ts             deterministic demo data
└── theme/tokens.ts          design tokens (light + dark)
plugins/withReleaseSigning.js   config plugin for CI signing
scripts/make-keystore.sh        one-time keystore creation
```

- **Local store:** `expo-sqlite` holds `period_logs`, `day_logs` (flow, symptoms, moods, note), `sleep_logs`, `vitals` (HR, SpO₂) and `step_days` (sensor count plus manual override). Repositories depend only on a small `SqlDriver` interface. Tests run the real SQL against Node's built-in `node:sqlite`.
- **Health Connect is optional:** every reader works without it and returns `{ status, data, sources }`. `react-native-health-connect` is loaded lazily, so the app also runs where the native module is missing.
- **Phone step origin:** on Android 14+, Health Connect labels phone-sensor steps with origin `android` or a per-device `com.android.healthconnect…` package. Bloom aggregates without a `dataOrigin` filter so these are included, and labels them "Phone (Health Connect)".

---

## Known limitations

- **Steps without Health Connect are counted only while Bloom is open.** On Android, the `expo-sensors` Pedometer only reports steps since you subscribed and can't run in the background. All-day counting needs Android 14+ with Health Connect, or another app that writes steps to Health Connect.
- **Android 14+ phone steps through Health Connect:** counting starts when an app is first granted Steps, with no history before that. It also needs Health Connect SDK extension ≥ 20. JavaScript can't read the extension version, so Bloom checks only for API 34+. If there are still no steps, it shows "No steps yet…" instead of failing.
- **Noise watches** reach Bloom only through NoiseFit → Google Fit → Health Connect. Some models sync only steps. Google Fit's own APIs are being shut down; Bloom never uses them.
- **AI Coach:** the free tier has tight limits, and Google may use free-tier prompts to improve its products. The coach is not medical advice.
- **No import yet.** Export is JSON only.
- Bloom is read-only towards Health Connect; it never writes there. Android only.

---

## Notes and decisions

- **Versions (Expo SDK 58 `bundledNativeModules`):** expo-sqlite ~58.0.13, expo-sensors ~58.0.4, expo-sharing ~58.0.20, expo-file-system ~58.0.10, **expo-secure-store ~58.0.2**, @react-native-community/datetimepicker 9.2.1. `react-native-health-connect` ^4.1.3 ships its own config plugin; don't also install the deprecated `expo-health-connect`.
- **SDK levels:** minSdk 26, compileSdk 37 and targetSdk 36, set through `expo-build-properties`. These match the RN 0.88 and Health Connect library defaults.
- **Permissions:**
  - 11 Health Connect read permissions, including `READ_HEALTH_DATA_HISTORY`.
  - `ACTIVITY_RECOGNITION`, declared in `app.json` and also merged in from expo-sensors.
  - `expo-secure-store` excludes its data from Android backups.
  - Bloom requests no write permissions.
- **`.npmrc` `legacy-peer-deps=true`:** expo-router 58 has an optional `react-dom` peer, and npm resolves it to 19.3.1. That conflicts with `react@19.3.0`, so the flag lets the install go through.
- **Library typing quirk:** the TypeScript types declare `MenstruationPeriod` as instantaneous (`time`). The native bridge actually returns `startTime`/`endTime`. `src/health/cycle.ts` handles both shapes.
