# School Bus – transport & communication system

One Expo app (Android · iOS · Web) with four workspaces – **Parent/Student**, **Bus driver**,
**Teacher**, **School office** – on an AWS Amplify Gen 2 backend (Cognito, AppSync/DynamoDB, S3,
Lambda, Step Functions). Live bus tracking, optimised pickup routes on Google Maps, a loud
driver→student alarm, real-time chat with voice/photo/video/files, feedback, broadcasts, and a
"My Courses" section ready for content.

```
school-app/
├─ amplify/                 backend (auth, data schema, storage, 4 Lambdas, CDK overrides)
├─ src/app/                 expo-router routes: (auth) (student) (driver) (teacher) (admin) + shared chat/alarm
├─ src/features/            TanStack Query hooks per domain (profiles, trips, messaging, …)
├─ src/components/          map (native + web), chat, driver, admin, feedback, …
├─ src/lib/                 amplify, auth session, i18n (en/ar), push, alarm, location task, storage, rules
├─ src/ui/                  design system (theme tokens, Button, Input, Card, Sheet, Toast, …)
├─ scripts/                 seed.ts, create-admin.ts, smoke.ts
├─ __tests__/               unit tests (routing/chunking, auth routing, day status, alarm, throttle)
└─ README.md · SEED.md · PERFORMANCE.md
```

## 1. Prerequisites

- Node 20+ (tested on 24), npm 10
- An AWS account with credentials in your shell (`aws sso login` / access keys) for `ampx`
- Google Cloud project with **Maps SDK for Android**, **Maps SDK for iOS**, **Maps JavaScript API**,
  **Routes API** and **Places API (New)** enabled
- An Expo account (`npx eas-cli login`) for push notifications and builds
- For device builds: Android Studio / Xcode, or EAS Build (cloud)

## 2. Environment variables

Copy `.env.example` → `.env` and fill in:

| Variable | Where it is used | Notes |
|---|---|---|
| `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` | app.config.ts → react-native-maps | Restrict to your Android package + SHA-1 |
| `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY` | app.config.ts → react-native-maps | Restrict to the iOS bundle id |
| `EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY` | `MapView.web.tsx` | Restrict by HTTP referrer |
| `EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID` | web Advanced Markers | `DEMO_MAP_ID` works for development |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Expo push tokens | from `npx eas-cli init` |
| `EXPO_PUBLIC_SCHOOL_ID` | multi-school key | keep `default` for one school |
| `SES_FROM_EMAIL`, `SES_FROM_NAME` | Cognito e-mails via SES | leave empty in sandbox (see §5) |
| `SCHOOL_NAME` | invitation e-mail template, outputs | |

The **Routes/Places API key never ships with the app**. It is an Amplify secret read only by the
`trips` Lambda:

```bash
npx ampx sandbox secret set GOOGLE_ROUTES_API_KEY
```

Without it the backend still works and falls back to straight-line routing with estimated ETAs
(the driver map shows "Approximate route").

## 3. Deploy the backend (sandbox)

```bash
npm install
npx ampx sandbox            # keeps running, redeploys on change; writes amplify_outputs.json
#   or: npm run sandbox:once
```

> **First deploy after cloning:** `backend.ts` removes `UsernameAttributes` so the username is the
> free-form school ID. That property is immutable, so CloudFormation **replaces the user pool**. On
> an existing sandbox that still has the e-mail-username pool, run `npx ampx sandbox delete` once
> and deploy again.

The deploy creates: Cognito user pool + groups `ADMIN TEACHER DRIVER STUDENT`, AppSync API with
all models/indexes (see `PERFORMANCE.md`), the private S3 bucket, Lambdas `admin-users`, `trips`,
`alarm`, `comms`, and the `school-alarm-repeat-*` Step Functions state machine.

### Create the first office account and demo data

```bash
ADMIN_USERNAME=ADMIN-01 ADMIN_PASSWORD='Admin#2026' ADMIN_EMAIL=office@yourschool.example npm run create-admin
SEED_EMAIL=you@example.com npm run seed      # 1 school, 3 classes, 3 teachers, 2 buses, 24 students … (SEED.md)
npm run smoke                                # signs in as each role and runs a query
```

## 4. Run the app

```bash
npx expo start            # dev server – press w (web), a (Android), i (iOS)
npm run web               # web only
npx expo run:android      # development build (needed for push, background location, maps on device)
npx expo run:ios
npm run typecheck && npm run lint && npm test
npm run export:web        # production web bundle → dist/
npx expo-doctor
```

Expo Go cannot deliver remote push notifications or run the background location task; use a
development build for the driver and parent flows.

### Demo logins (after `npm run seed`)

| Workspace | ID | Password |
|---|---|---|
| School office (web) | `ADMIN-01` | `Admin#2026` |
| Teacher | `T-1001` | `Welcome#2026` → forced new password |
| Bus driver (tablet) | `BUS-01` | `Driver#2026` |
| Parent / student | `S-1001` | `Welcome#2026` → forced new password → home location |

Sign in on the same build with any ID; the app reads `cognito:groups` from the access token and
routes to the matching workspace. Route groups are guarded with `Stack.Protected`, so a user can
never open another role's screens.

## 5. E-mail (Amazon SES)

In sandbox Cognito uses its default sender (max **50 e-mails/day**). For production:

1. In SES (same region as the backend) verify your sending domain or address and request
   production access (leave the sandbox).
2. Set `SES_FROM_EMAIL=noreply@yourschool.example` and `SES_FROM_NAME` in the deploy environment.
   `defineAuth({ senders: { email } })` then makes Cognito send invitations and reset codes through
   SES. The `admin-users` Lambda also uses SES (`ses:SendEmail`) to e-mail new passwords when the
   office ticks "E-mail the new password".
3. The invitation template (school name, download instruction, ID + temporary password) is in
   `amplify/auth/resource.ts`.

## 6. Google Maps & Routes

- **Rendering keys** (`EXPO_PUBLIC_GOOGLE_MAPS_*`) are baked into the native apps/web bundle –
  restrict them in Google Cloud Console. Today one key ("Maps Platform API Key", 32 Maps APIs) is
  used for the web bundle, the native builds (`.env`) and the Routes/Places secret. Before going
  live split it: create a **browser key** restricted to the HTTP referrers
  `https://main.dg9g67lujh0do.amplifyapp.com/*` (plus your custom domain) and to *Maps JavaScript
  API*; put it in `EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY`. Create **Android/iOS keys** restricted by
  package + SHA-1 / bundle id for `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` / `_IOS_KEY`. Keep the
  current key as the **server key**: no application restriction (Lambda calls it), API
  restriction *Routes API* + *Places API (New)* only. A referrer-restricted key cannot be used
  from Lambda, and an unrestricted key inside a public web bundle can be abused for billable calls.
- **Routes API / Places API (New)** are called only by the `trips` Lambda with the secret
  `GOOGLE_ROUTES_API_KEY`. `computeRoutes` is requested with `optimizeWaypointOrder: true`,
  `travelMode: DRIVE`, `departureTime: now`, ≤ 25 intermediates per call. Google rejects waypoint
  optimisation together with `TRAFFIC_AWARE_OPTIMAL`, so optimised runs use `TRAFFIC_AWARE` and
  fixed-order runs (manual reorder) use `TRAFFIC_AWARE_OPTIMAL`.
- Buses with **more than 25 stops**: stops are grouped by a nearest-neighbour sweep from the bus
  into chunks of ≤ 25, each chunk is optimised and the chunks are chained (end of chunk N = origin
  of chunk N+1). This is a good heuristic, not a global optimum; for very large fleets the upgrade
  path is Google's Route Optimization API.
- Recompute triggers: trip start, student toggles going/not going, driver skips a stop, manual
  "Recompute", > 300 m off the polyline for > 60 s, and every 5 minutes while active. The Lambda
  rate-limits to one Google call per trip per 30 s.

## 7. Push notifications & the alarm

1. `npx eas-cli init` → put the project id in `EXPO_PUBLIC_EAS_PROJECT_ID`.
2. **Android (FCM v1):** create a Firebase project, download the service account JSON and upload
   it: `npx eas-cli credentials` → Android → Push Notifications. Add `google-services.json` to the
   project root and `android.googleServicesFile` in `app.config.ts` if you need it for other
   Firebase features (not required for Expo push).
3. **iOS (APNs):** `npx eas-cli credentials` → iOS → Push Notifications → let EAS create the key.
4. Build a development build and allow notifications on the device; the token is stored in the
   `Device` table (several devices per account – parent and student phones share the login).

The alarm (driver → student) has all layers:

- Lambda `alarmStudent`: validates the driver, sets `TripStop.status = ALARMED`, writes a
  `Notification`, pushes to every device with `priority: high`, `channelId: bus-alarm`,
  `sound: alarm.wav`, `interruptionLevel: time-sensitive`, and starts the Step Functions loop that
  re-sends every `alarmRepeatSeconds` (default 20 s) up to `alarmMaxRepeats` (default 5) until the
  stop becomes ACKNOWLEDGED / BOARDED or the trip ends.
- Android channel `bus-alarm`: importance MAX, custom `alarm.wav`, vibration, `bypassDnd`,
  lock-screen visibility PUBLIC, audio usage ALARM.
- iOS: bundled 30-second `alarm.wav`, time-sensitive interruption. **Critical Alerts** need Apple's
  entitlement – flip `ENABLE_IOS_CRITICAL_ALERTS` in `src/lib/push/notifications.ts` and add
  `com.apple.developer.usernotifications.critical-alerts` to `ios.entitlements` after approval.
- In-app full-screen alarm (`/alarm/[tripStopId]`) loops the sound with `expo-audio`
  (`playsInSilentMode`), vibrates, shows driver / plate / ETA, **I'm coming** → ACKNOWLEDGED (the
  driver's sheet flips instantly via subscription) and **Call driver**.
- "Test alarm" in the parent Profile sends a real push to the user's own devices and opens the
  alarm screen.

### Alarm over the lock screen (Android)

`plugins/withAlarmFullScreenIntent.js` adds `USE_FULL_SCREEN_INTENT` and marks `MainActivity`
`showWhenLocked` / `turnScreenOn`, so tapping the MAX-importance heads-up notification opens the
alarm screen over the keyguard. Posting a true *full-screen intent* notification from a remote push
needs native code that `expo-notifications` does not expose (a small Expo module implementing
`NotificationCompat.Builder.setFullScreenIntent`). The manifest is prepared for it; see the final
report for the upgrade path.

## 8. Hosting on Amplify (web + backend CI/CD)

The repo contains `amplify.yml`, so a connected GitHub branch builds in two phases:

1. **Backend** – `npm ci` + `npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID`
   deploys `amplify/` into the hosting account and writes `amplify_outputs.json` (which is
   git-ignored on purpose – never commit a sandbox's outputs).
2. **Frontend** – `npm run build` (= `expo export --platform web`) and publishes `dist/`.

Setup checklist in the Amplify console (App → Hosting), with the equivalent CLI commands
(`--profile` = a profile for the hosting account, region `ap-south-1`, app id `dg9g67lujh0do`):

- **Service role**: the app needs a role with `AmplifyBackendDeployFullAccess` (General settings →
  Service role). Gen 2 backend deploys fail immediately without it.
  `aws iam list-attached-role-policies --role-name <service role>` must list the policy.
- **Environment variables** (Hosting → Environment variables). Already set on the app:
  `EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID`, `EXPO_PUBLIC_SCHOOL_ID=default`, `SCHOOL_NAME`,
  `SES_FROM_NAME`. Still to add with your own values (they cannot be generated for you):
  - `EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY` – Google Cloud Console → Credentials → API key restricted to
    the HTTP referrer `https://main.dg9g67lujh0do.amplifyapp.com/*` with *Maps JavaScript API* enabled.
  - `EXPO_PUBLIC_EAS_PROJECT_ID` – `npx eas-cli init` prints it (needed for push tokens).
  - `SES_FROM_EMAIL` – only after the SES identity is verified (see §5).

  ```bash
  aws amplify update-app --app-id dg9g67lujh0do --environment-variables \
    "EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY=<key>,EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID,EXPO_PUBLIC_SCHOOL_ID=default,SCHOOL_NAME=Al Noor International School,SES_FROM_NAME=School Office"
  aws amplify start-job --app-id dg9g67lujh0do --branch-name main --job-type RELEASE   # rebuild to bake them in
  ```

  `update-app` replaces the whole variable map, so always pass every variable.
- **Secrets** (Hosting → Secrets): `GOOGLE_ROUTES_API_KEY`. Backend secrets are SSM SecureString
  parameters; every branch's Lambdas look first at the branch path
  `/amplify/<appId>/<branch-stack>/<name>` and then at the shared path, which is the simplest
  one to set by hand (the exact paths are in the Lambda's `AMPLIFY_SSM_ENV_CONFIG` variable):

  ```bash
  aws ssm put-parameter --name /amplify/shared/dg9g67lujh0do/GOOGLE_ROUTES_API_KEY --type SecureString --overwrite --value "<key>"
  ```

  Enable *Routes API* and *Places API (New)* on that key and keep it unrestricted by referrer
  (it is used from Lambda). The Lambda reads it at cold start; to pick a new value up immediately,
  touch the function (`aws lambda update-function-configuration --function-name <trips fn> --description x`).
- **Rewrites and redirects**: the web build is a single-page app. Two rules are configured:
  the regex rewrite `</^[^.]+$|\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|wav|webp)$)([^.]+$)/>`
  → `/index.html` (200) and the fallback `/<*>` → `/index.html` (404-200).
- **Seeding the branch backend**: download its outputs and point the scripts at them:

  ```bash
  npx ampx generate outputs --branch main --app-id dg9g67lujh0do --out-dir ./hosting
  AMPLIFY_OUTPUTS=./hosting/amplify_outputs.json npm run seed
  AMPLIFY_OUTPUTS=./hosting/amplify_outputs.json npm run smoke
  ```

If a build fails, open the deployment → **Build** log and scroll past the npm warnings: the real
error is the last `npm error` / `[ERROR]` line. The most common ones:

| Log line | Fix |
|---|---|
| `npm ci can only install packages when your package.json and package-lock.json are in sync` | run `npm install` locally, commit `package-lock.json` |
| `Missing script: "build"` | the default build spec is being used – make sure `amplify.yml` is committed |
| `AccessDenied` / `not authorized to perform` during `pipeline-deploy` | attach the service role (see above) |
| `Updates are not allowed for property - UsernameAttributes` | an older pool exists for that branch – delete the branch backend (Hosting → Backend) and redeploy |

## 9. Building with EAS

```bash
npx eas-cli build:configure
npx eas-cli build --profile development --platform android   # dev client for testing
npx eas-cli build --profile production --platform all
npx eas-cli submit --platform ios
npx eas-cli update --branch production --message "…"          # OTA JS updates
```

`runtimeVersion` follows the app version (`app.config.ts`). Background location on Android
requires Google Play review (foreground-service location) – describe the driver use-case in the
Play Console.

## 10. Workspaces – what's where

| Workspace | Routes | Highlights |
|---|---|---|
| Parent / Student | `src/app/(student)` | mandatory home-location onboarding, Bus tab (status card, live map with animated bus + route + ETA, Not-going toggle with until-date & note, 30-day history), Messages (class group, classmates, teacher, driver, office), Feedback timeline, My Courses (coming-soon state until published), Profile (language EN/AR, test alarm, privacy, delete-my-data) |
| Bus driver | `src/app/(driver)` | full-screen map, trip type + Start/End, student markers (green/red/grey/orange + stop numbers), route polyline, follow mode, stop sheet with ALARM / boarded / skip / call / message, drag-reorder stops, background location publishing with foreground service, "bus is near" automation, off-route & 5-min recompute, GPS quality, Students tab, bus group chat |
| Teacher | `src/app/(teacher)` | roster with today's attendance, student profile + feedback history, multi-student feedback with attachments and confirmation (immutable), class group chats, office chat, broadcasts inbox |
| School office | `src/app/(admin)` | sidebar on web / tabs on phone; dashboard with live buses, students (table, add, CSV bulk import, edit, assign, reset password, disable, delete, home override), teachers, buses (credentials copy/share, assign with capacity), classes, trips (timeline, CSV export), office inbox + group oversight + reported messages, feedback CRUD, broadcasts, courses & lessons (video upload), settings & branding, audit log |

Shared: `chat/[conversationId]` (one `ChatScreen` + `Composer` for every role), `alarm/[tripStopId]`,
`notifications`, `privacy`, `change-password`.

## 11. Troubleshooting

- **"Not Authorized" on sign-in / queries** – the user is not in a Cognito group. Add them to
  `ADMIN|TEACHER|DRIVER|STUDENT` (the admin mutations do this automatically).
- **Students see "Routes API failed … fallback"** – `GOOGLE_ROUTES_API_KEY` is missing or the API
  is not enabled.
- **No push token** – running in Expo Go or on a simulator, or `EXPO_PUBLIC_EAS_PROJECT_ID` is
  missing.
- **Web map blank** – `EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY` missing or referrer-restricted.
- **Arabic layout does not flip** – native apps need a restart after switching language (the app
  offers it); web flips instantly.
- **`expo-doctor` reports duplicate `react`/`react-dom`** – the second copy sits under the
  dev-only `@aws-amplify/form-generator` (pulled in by `@aws-amplify/backend-cli`). It is never
  bundled into the app; the warning is cosmetic.
- **`amplify_outputs.json` still lists `username_attributes: ["email"]`** – that is Amplify's
  generated metadata for `defineAuth`; the deployed pool has free-form usernames (the CDK override
  in `backend.ts`), which is what the sign-in screen and the seed/smoke scripts rely on.
