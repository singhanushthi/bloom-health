# Bloom: personal health hub (Android)

Bloom tracks your **cycle, steps, sleep, heart rate and SpO₂**, plus a gentle **weight, food and activity plan**, guided **yoga** and a healthy **kitchen**, in one calm place.

**Current version: 1.1.0** (Android `versionCode` 2 — installs as an update over 1.0.0 when both are signed with the same key).

**Bloom works on its own.** You don't need Flo, a Noise watch, NoiseFit or Google Fit. You log periods, symptoms, mood, sleep and readings in Bloom, and your phone counts your steps. Everything is stored on the phone. There's no account, no server and no analytics.

Extras are optional:
- **Health Connect** gives you all-day step counting on Android 14+. It also brings in data from apps you already use (Flo, a watch through NoiseFit → Google Fit).
- **AI Coach** answers questions about your data in plain language. It uses your own free Google Gemini key.

---

## Install the app (no computer tools needed)

The APK is built automatically on GitHub every time `main` changes.

1. On your phone, open the repository's **Releases** page (`https://github.com/<you>/<repo>/releases`).
2. Open the newest release (for example **Bloom v1.1.0**) and tap **`bloom-1.1.0.apk`** under *Assets*. Older releases (v1.0.0) stay available.
3. When Android asks, allow **Install unknown apps** for your browser, then tap **Install**.
4. Open **Bloom**. Onboarding takes about a minute.

The same APK is also attached to each workflow run as the artifact **bloom-apk** (Actions tab → *Android APK* → latest run). Artifacts download as a `.zip`, so the Release is easier on a phone.

**Updates:** install the newer APK over the old one and your data stays. This needs the build to use the same signing key every time; see [Stable signing](#stable-signing-do-this-once).

**Alternative (EAS):** `npx eas-cli@latest build -p android --profile preview` builds the same APK on Expo's servers. It needs a free Expo account. EAS manages its own keystore, so an EAS build and a GitHub build can't update each other.

---

## Features

### Navigation
Bottom tabs (five at most): **Today · Plan · Yoga · Cycle · Trends**. **Settings** opens from the gear button (labelled "Settings") in the Today header.

### Today
- A greeting with a **Settings** gear, plus a small **Ask Bloom** card that opens the AI coach.
- A **watch chip** ("Watch connected · 72 bpm") appears under the greeting only after you've paired a watch directly; tap it to open the Watch screen.
- Compact plan cards: **Weight** (latest morning weight + trend arrow, *Log weight*), **Food** (kcal eaten vs your range, as a ring), **Workouts** (minutes + extra burn) and **Today's yoga**. Without a goal, a *Set up my plan* card appears instead.
- **Today in your cycle**: cycle day, phase, next period (or "may be late") and three tips for the phase. Hidden when cycle tracking is off or *Hide cycle data on Today* is on.
- Cards for the other areas you chose to track (steps, sleep, heart rate & SpO₂).
- **Every card shows where its data came from**: "Logged in Bloom", "Phone (Health Connect)", "Phone (while Bloom is open)", "Flo", "Google Fit", "NoiseFit"…
- One floating **Log** button opens an action sheet: **Weight**, **Food**, **Activity**, **Period**, **Day log** (the full cycle day log, with pain, energy, pills and more), **Sleep** or **Reading**.
- Pull down to refresh.

### Plan (weight, food & activity)
A gentle, flexible plan. Targets are shown as a **comfortable range** ("aim around 1,450–1,650 kcal"), with a weekly **flex** allowance for treats. Nothing is strict, and the wording never shames.

**Profile & goal** (optional onboarding step, editable from Plan → pencil or Settings → Your plan):
formula (female/male: *"Which formula should we use?"*), birth year, height (cm or ft + in), current weight, target weight, how active you are (four plain descriptions), food preference (vegetarian, eggetarian, non-veg, vegan, **Jain** = vegetarian without onion, garlic or root vegetables, filtered by food names), pace (**Gentle / Steady / Faster**) and yoga sessions a week. A live preview shows the range before you save.

**How the numbers are made** (`src/plan/engine.ts`, tested):
- BMR: **Mifflin–St Jeor**. TDEE = BMR × 1.2 / 1.375 / 1.55 / 1.725.
- Daily target = TDEE ± pace × 7700 / 7, shown as ±100 kcal.
- Protein 1.2 g/kg (loss, of the goal-adjusted weight) or 1.4 g/kg (gain); fibre 25 g; water ≈ 35 ml/kg; a steps goal from your activity level; an estimated goal date.

**Safety rules** (enforced and explained kindly):
- A target with **BMI under 18.5 isn't allowed**; Bloom suggests the lowest healthy target and says *"talk to a doctor if you're unsure"*.
- If your **current BMI is under 18.5**, weight loss is blocked; maintain or gain is offered.
- Loss pace 0.25 / 0.5 / 0.75 kg a week, **never more than 1% of body weight a week**. Gain 0.25 / 0.35 / 0.5 kg a week.
- **Calorie floor 1,200 kcal** (female formula) / **1,500 kcal** (male formula). If a pace would go lower, Bloom slows the pace and says so. Weekly adjustments respect the floor too.
- **Under 18:** *"Bloom's plans are for adults — please plan with a doctor or parent."* Tracking works; no calorie targets are shown.

**Plan screen:** progress (start → now → target, kg to go, % done, projected date), today's targets, weight chart, food summary + *Log food*, activity summary + *Log activity*, **next meal ideas**, the week's **yoga goal** (sessions from the Yoga tab count automatically), **plan updates**, and *Ask Bloom for a weekly plan* (optional, AI).

**Adaptive plan** (`src/plan/adapt.ts`, tested):
- *Next meal ideas*: 2–4 suggestions from the Indian food list that match your diet and fit what's left today. When protein is behind, protein-rich combos come first (for example *Paneer bhurji + Roti*). Tap **+** to log one.
- *Weekly review*: every 7 days from your goal's start, if the week has at least 4 morning weigh-ins, Bloom compares the change with your pace. Losing too slowly two weeks in a row → −100 kcal (never below the floor); losing faster than 1% a week → +100 kcal; gaining too slowly two weeks in a row → +100 kcal. Each decision is saved with a reason, for example *"Week 3: added 100 kcal because you lost faster than planned — slow and steady keeps the weight off."*

### Weight
- Quick add: kg stepper (0.1 kg steps, or type it), **Morning / Night** preselected by the time of day, and a date. Valid range 25–300 kg, with errors shown under the field. Edit and delete from the history.
- **Trend = 7-day moving average of morning weights.** If you have no morning weights, any weights are used. Night weight is usually 0.5–1.5 kg higher (the day's food and water), so it doesn't drive the trend.
- Chart: filled dots for mornings, a solid trend line, a dashed target line and (optional) hollow night dots, with a legend in words.
- **Cycle-aware:** if cycle tracking is on and you're on your period or in the last days before it, Bloom notes *"Water retention around your period can add 1–2 kg — it passes."*

### Food
- Meals: Breakfast, Lunch, Evening snack, Dinner, Other.
- Add food by **Search** (filtered by your diet), **Recent**, **Saved** (favourites, the star) or **Mine** (custom foods). Choose servings (0.5 steps) or grams, and see kcal and protein update as you go. Entries can be edited or deleted.
- **My own food**: name, serving, kcal and optional protein, carbs, fat and fibre, saved on the phone.
- **AI quick add** (needs your Gemini key): type *"2 roti, dal, salad"*. Gemini returns JSON items (`responseMimeType: application/json` + `responseSchema`), which you check and edit before saving. They're labelled **AI estimate**. Without a key, a hint points to Settings → AI Coach.
- Daily summary: eaten vs your range, remaining, protein / carbs / fat / fibre bars with numbers, and a **water** tracker (tap a glass = 250 ml).

### Activity
- Log what you did: activity grid (walk, run, cycling, gym, yoga, dance, swimming, sports, housework, stairs, HIIT, other) → minutes (10/20/30/45/60 or custom) → intensity (light / moderate / vigorous).
- **kcal = MET × body weight (kg) × hours** (`src/plan/met.ts`), using your morning trend weight or profile weight.
- Your plan already includes your usual activity level, so logged exercise is shown as **extra burn**, and only **half** of it is added to the day's food allowance: *"We count half of exercise calories to stay on the safe side."* Steps are never added again.
- Health Connect exercise sessions from other apps appear read-only, labelled by source, and their calories aren't added.
- Finished yoga sessions from the Yoga tab are logged automatically (`addActivity` in `src/plan/activity.ts`, source `bloom-yoga`).

### Cycle 2.0 (in-app logging first)
- **First-time setup** (or skip): last period start, usual period and cycle length, "my cycles are irregular", and your goal — *Track my periods*, *Know my higher-chance days* or *Trying to conceive*.
- **One-tap** *Period started today* / *Period ended*, plus **Log period** with start date, optional end date and flow (light / medium / heavy). Edit or delete any period.
- **Day log** (from the calendar or the Log button): flow, **pain 0–3**, symptoms, mood, **energy**, **sleep quality**, **cravings**, **discharge**, **sex drive**, **pills/medication tags** (recent tags one tap away) and a note. Flow logged here also counts as a period day.
- **Calendar**: period days, predicted period (estimate), estimated fertile window and ovulation (only for the two fertility goals), PMS days and days with a log. Meaning is carried by shape and pattern, not colour alone. Tap any day up to today to log it.
- **Phase suggestions**: food, movement (period-friendly yoga) and self-care ideas for each phase, matched to your diet and yoga level, plus **Insights** (cycle lengths, typical symptoms per phase).
- **"Late" banner** when the period is a few days past the estimate, with calm wording.
- **Reminders** (Settings → Cycle reminders, all optional): period coming soon, period may be late, fertile window, daily check-in at a time you choose, daily pill reminder. Scheduled on the phone with `expo-notifications`; Android asks for notification permission only when you turn one on. Reminders are kept in sync automatically when you log or change settings.
- **Discreet mode** (on by default): notifications say only "Bloom reminder" and never mention periods. **Hide cycle data on Today** keeps the cycle card off the home screen.
- Predictions come from the **merged** history: your Bloom logs plus Health Connect `MenstruationPeriod`/`MenstruationFlow` (for example from Flo), when connected. Overlapping and adjacent days are merged into one period, and the history shows each period's source.
- Predictions are always labelled as **estimates**. **Bloom is not a method of contraception**, and the fertile window is an awareness aid only.

### Yoga
- A library of original poses and guided sessions for **beginner, intermediate and advanced** levels, with short spoken-style cues (optional **voice** via `expo-speech`) and haptics.
- Multi-day **programs**: *7-day Beginner Start*, *14-day Flexibility*, *21-day Strength & Core*.
- **Period-friendly** sessions never include inversions, strong twists, strong core work or kapalbhati.
- A **safety sheet** before your first session (who should check with a doctor first; stop if anything hurts). No medical or weight-loss claims.
- A weekly sessions goal, streaks and history. After a session Bloom asks how it felt and may suggest an easier or harder level.
- Finished sessions are logged as activity in your plan automatically.

### Kitchen
- **Pantry**: add what you have at home (an ingredient list with typical shelf life gives a gentle "use within…" date) or **scan a barcode**.
- **Barcode scan** (EAN-13 / EAN-8 / UPC) with `expo-camera`, or type the number. Bloom looks the product up on **Open Food Facts** (free, open data). Only the barcode is sent. Camera permission is asked only when you tap *Start scanning*.
- **Product health check** using the UK FSA traffic-light thresholds per 100 g (sugar, salt, fat/saturated fat, with protein and fibre bonuses): *Everyday*, *Sometimes* or *Treat*. The wording is always kind, and no food is "bad".
- **Recipes**: original Indian home recipes ranked by what's in your pantry and filtered by your diet (incl. Jain). *Cook now* shows the ones you can make. Log a recipe to Food in one tap.
- **AI recipe** (optional, your Gemini key) from what you have, labelled **AI estimate**.
- **Shopping list** and **My recipes**. Everything is stored on the phone; demo mode uses an in-memory sample kitchen.
- Opens from the Kitchen card on the Plan tab.

### Connect apps
Settings → **Connect apps** explains, app by app (Noise watch, Flo, Google Fit, Google Health, Samsung Health, Fitbit, HealthifyMe, MyFitnessPal, Strava, Mi Fitness / Zepp, boAt / Fire-Boltt, Huawei Health…), how its data can reach Bloom through **Health Connect**, with step-by-step instructions and whether Bloom has actually seen data from it yet. Bloom never talks to these apps directly; it only sees each record's source app.

### Direct watch (beta)
Settings → **Watch (direct, beta)** connects to a watch or chest strap over **standard Bluetooth LE** — no companion app needed, *when the watch supports it*:
- Reads only public Bluetooth SIG services: **Heart Rate (0x180D)**, **Battery (0x180F)** and **Device Information (0x180A)**. No proprietary protocols.
- Shows live heart rate and saves **one reading per minute** (the median) into Bloom, labelled **"Watch (direct)"** on cards and charts.
- Reconnects automatically to the paired watch **while Bloom is open** (nothing runs in the background). If nothing was paired, Bloom never touches Bluetooth at start-up.
- Android 12+ asks for **Nearby devices** (`BLUETOOTH_SCAN` declared *neverForLocation*, `BLUETOOTH_CONNECT`). Android 11 and older need location for BLE scanning (declared only up to API 30).
- **Limits:** many budget watches (including some Noise models) don't share heart rate this way, and **steps, sleep and SpO₂ can't be read** over standard BLE. A watch usually allows one connection at a time, so close NoiseFit first. If it doesn't work, use NoiseFit → Google Fit / Google Health → Health Connect instead. Without NoiseFit the watch may not get time sync or firmware updates.

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
- **Your plan**: edit your goal, and optional **Health Connect sharing** toggles — read weight (smart scales, Google Health), save weights, save meals (Nutrition records) and save workouts (exercise sessions). All are off by default. Bloom asks Health Connect for each permission only when you turn its toggle on.
- **Your cycle / Cycle reminders / Privacy**: usual lengths, goal, reminders, discreet notifications and *Hide cycle data on Today*.
- **Connect apps**: a step-by-step screen for Health Connect, Google Fit, a watch or Flo.
- **Watch (direct, beta)**: pair, disconnect or forget a Bluetooth watch.
- **Steps**: daily goal, stride length, and the phone-sensor permission.
- **AI Coach**: set up your Gemini key (see below).
- **Health Connect (optional)**: connect, manage permissions, and see which app supplied each data type.
- **Connected apps (optional)**: checklist for Flo → Health Connect, NoiseFit → Google Fit, and **Google Fit → Profile → Settings → "Sync Fit with Health Connect"**.
- **Your data**: **Export as JSON** (opens the share sheet; includes cycle extras and settings, plan, kitchen, yoga history and the paired watch) and **Delete all my data** (asks you to confirm first; wipes every Bloom table, yoga preferences, the paired watch and scheduled cycle reminders).
- **Demo mode**: fills every screen with realistic sample data.

### Onboarding
Welcome → **What to track** (cycle / steps / sleep / heart) → *optional* **Profile & goal** (Skip for now) → *optional* **"Connect Health Connect for all-day steps (and your watch/Flo if you use them)"** with **Skip for now** → done.

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
   - The key is stored encrypted on the phone (`expo-secure-store`). It is only ever sent to `generativelanguage.googleapis.com`, in the `x-goog-api-key` header. If Google rejects the key in the header with an auth error (some `AQ.` keys reportedly need this), Bloom retries once with the key as a `?key=` URL parameter and remembers which way worked; quota errors never trigger this. The key is never logged. **Remove key** deletes it.
4. On Today, tap **Ask Bloom**. You can tap a suggested question ("Explain my cycle phase", "How was my sleep this week?", "Am I hitting my step goal?"), use **Morning brief** or **Weekly review**, or type your own question.

**What gets sent:** your question, plus a compact summary of the last 30 days. The summary includes cycle day and phase, averages, steps and sleep for the last 7 days, symptom and mood counts, your latest readings and, when you use the plan, your weight trend, average intake and protein, activity minutes and yoga sessions for the last 7 days (food **item names** only). **Day-log notes are never sent.** Bloom builds the summary once and rebuilds it only when your data changes. In demo mode the coach sees the sample data.

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
- Replies stream token by token through `expo/fetch`, because React Native's built-in `fetch` can't stream response bodies. If streaming isn't available, or the stream breaks before any text arrives, Bloom calls `:generateContent` and shows the whole answer at once.
- Bloom requests the fastest thinking level each model supports: `minimal`, or `low` for 3.8 Flash. If a model rejects that setting, Bloom retries once without it.
- Bloom never calls the list-models endpoint.

---

## Stable signing (do this once)

> **Status (24 Oct 2026):** the four `ANDROID_*` secrets are set to the key that signed v1.0.0 and v1.1.0 (Expo's template debug key, SHA-256 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`). That locks it in, so future Expo template changes can't break updates. Because this key is public, only install Bloom APKs from this repository's Releases. Moving to a private key later needs a one-time reinstall, so add data import first.

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

1. Sets up `ubuntu-latest`, **Node 22** and **JDK 17** (Temurin), with Gradle caching through `gradle/actions/setup-gradle` (open-source `basic` cache provider). JDK 17 is the version React Native recommends, and RN 0.88's Gradle plugin targets the JDK 17 toolchain.
2. Runs `npm ci`, then `tsc` and `jest`.
3. Runs `npx expo prebuild --platform android --no-install`. The local config plugin [`plugins/withReleaseSigning.js`](plugins/withReleaseSigning.js) adds a release signing config that is used only when the `BLOOM_UPLOAD_*` Gradle properties exist. The workflow passes them from the secrets as `ORG_GRADLE_PROJECT_BLOOM_UPLOAD_*` environment variables, so no password is written to `~/.gradle`.
4. Runs `./gradlew assembleRelease` and renames the output to `bloom-<version>.apk`. The version comes from `app.json` → `expo.version`.
5. Uploads the artifact **bloom-apk** and creates or updates the GitHub Release **`v<version>`** with the APK attached (`permissions: contents: write`).

To publish a new version, bump `expo.version` (and `android.versionCode`) in `app.json`. Pushing (or re-running) without a bump replaces the APK on the existing release; the tag stays on the first commit of that version and the release notes name the commit actually built.

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
│   ├── _layout.tsx          fonts + providers: AppState → StepSensor → Coach → LogSheets;
│   │                        mounts CycleReminderSync and reconnects a paired watch (initWatchIfPaired)
│   ├── index.tsx            redirect → onboarding | tabs
│   ├── coach.tsx            AI coach chat (pushed from Today's "Ask Bloom" card)
│   ├── connect.tsx · watch.tsx   Connect apps guide · direct Bluetooth watch (beta)
│   ├── weight/ · food/ · activity/   plan logging screens
│   ├── cycle/ · yoga/ · kitchen/     deep screens for those tabs/features
│   ├── onboarding/          index (welcome) · track · profile (optional) · connect (optional HC) · done
│   └── (tabs)/              index (Today) · plan · yoga · cycle · trends · settings (hidden from the tab bar)
├── db/                      expo-sqlite store: schema + migrations (v3), repositories, allData (export/delete everything)
├── plan/                    weight engine, adaptive plan, food/activity, Health Connect sharing
├── cycle/ · notify/         cycle 2.0 store (cycle_kv, cycle_day_extras), UI, reminders (expo-notifications)
├── yoga/ · content/         yoga player/programs/history; content: foods, recipes, yoga
├── kitchen/                 pantry/shopping/recipes (kitchen_* tables), Open Food Facts, health check
├── watch/                   direct BLE heart rate (react-native-ble-plx, created lazily)
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

- **Local store:** `expo-sqlite` holds `period_logs`, `day_logs` (flow, symptoms, moods, note), `sleep_logs`, `vitals` (HR, SpO₂, with a nullable `source` since schema v3), `step_days` (sensor count plus manual override), the plan tables (schema v2) and `kv`. Feature modules create their own tables after the main migrations have run: `cycle_kv`, `cycle_day_extras`, `kitchen_pantry`, `kitchen_shopping`, `kitchen_recipes`, `yoga_history`. Migrations are re-runnable and upgrade a 1.0.0 database (schema v1) in place. Repositories depend only on a small `SqlDriver` interface. Tests run the real SQL against Node's built-in `node:sqlite`.
- **Health Connect is optional:** every reader works without it and returns `{ status, data, sources }`. `react-native-health-connect` is loaded lazily, so the app also runs where the native module is missing.
- **Phone step origin:** on Android 14+, Health Connect labels phone-sensor steps with origin `android` or a per-device `com.android.healthconnect…` package. Bloom aggregates without a `dataOrigin` filter so these are included, and labels them "Phone (Health Connect)".

---

## Known limitations

- **Steps without Health Connect are counted only while Bloom is open.** On Android, the `expo-sensors` Pedometer only reports steps since you subscribed and can't run in the background. All-day counting needs Android 14+ with Health Connect, or another app that writes steps to Health Connect.
- **Android 14+ phone steps through Health Connect:** counting starts when an app is first granted Steps, with no history before that. It also needs Health Connect SDK extension ≥ 20. JavaScript can't read the extension version, so Bloom checks only for API 34+. If there are still no steps, it shows "No steps yet…" instead of failing.
- **Noise watches** reach Bloom only through NoiseFit → Google Fit → Health Connect. Some models sync only steps. Google Fit's own APIs are being shut down; Bloom never uses them.
- **AI Coach:** the free tier has tight limits, and Google may use free-tier prompts to improve its products. The coach is not medical advice.
- **No import yet.** Export is JSON only.
- **Direct watch (beta)** only works with watches that expose the standard Bluetooth Heart Rate service, only while Bloom is open, and reads heart rate only.
- **Cycle reminders** are local notifications. Some phones' battery savers delay or drop them; they're estimates, not alarms to rely on.
- **Kitchen barcode lookup** needs internet and depends on Open Food Facts having the product; you can always enter it by hand.
- Bloom only writes to Health Connect if you turn on a sharing toggle (Settings → Your plan): weights, meals (Nutrition) and workouts (ExerciseSession). Records Bloom wrote are skipped when it reads Health Connect back, so nothing is counted twice. Android only.
- **Plan numbers are estimates.** Calorie formulas, MET values, food values (some marked *approx.*) and AI estimates are all approximate. The plan is general guidance, not medical advice. If you're pregnant, breastfeeding, under 18 or managing a health condition, plan with your doctor.
- **Demo mode** shows sample plan data. Anything you log while it's on is saved to your real (hidden) data.

---

## Notes and decisions

- **Plan storage:** schema v2 adds `kv` (profile, plan settings), `weight_logs`, `food_entries`, `custom_foods`, `food_favourites`, `water_days`, `activity_logs` and `plan_adjustments`. Every statement uses `IF NOT EXISTS`, so migrations can run again safely. Export and "Delete all my data" include these tables.
- **Health Connect permissions added for the plan:** `READ_WEIGHT`, `WRITE_WEIGHT`, `READ_NUTRITION`, `WRITE_NUTRITION`, `WRITE_EXERCISE`. Record shapes were checked against react-native-health-connect 4.1.3 types: `Weight.weight: Mass`, `Nutrition.energy/protein/totalCarbohydrate/totalFat/dietaryFiber`, `ExerciseSession.exerciseType` (ExerciseType constants). Write permissions are requested only when a toggle is turned on.

- **Versions (Expo SDK 58 `bundledNativeModules`):** expo-sqlite ~58.0.13, expo-sensors ~58.0.4, expo-sharing ~58.0.20, expo-file-system ~58.0.10, **expo-secure-store ~58.0.2**, @react-native-community/datetimepicker 9.2.1. `react-native-health-connect` ^4.1.3 ships its own config plugin; don't also install the deprecated `expo-health-connect`.
- **SDK levels:** minSdk 26, compileSdk 37 and targetSdk 36, set through `expo-build-properties`. These match the RN 0.88 and Health Connect library defaults.
- **Permissions:**
  - 11 Health Connect read permissions, including `READ_HEALTH_DATA_HISTORY`.
  - `ACTIVITY_RECOGNITION`, declared in `app.json` and also merged in from expo-sensors.
  - `expo-secure-store` excludes its data from Android backups.
  - Bloom requests no write permissions.
- **`.npmrc` `legacy-peer-deps=true`:** expo-router 58 has an optional `react-dom` peer, and npm resolves it to 19.3.1. That conflicts with `react@19.3.0`, so the flag lets the install go through.
- **Library typing quirk:** the TypeScript types declare `MenstruationPeriod` as instantaneous (`time`). The native bridge actually returns `startTime`/`endTime`. `src/health/cycle.ts` handles both shapes.
