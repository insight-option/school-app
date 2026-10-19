# Build report – School Bus system

Built on 2026-10-16 from the Amplify Gen 2 + Expo starter in this folder (Expo SDK 57,
React Native 0.86, Amplify backend 1.25). Everything below is deployed to the sandbox
`amplify-schoolapp-Musta-sandbox-c92e82ad2d` (ap-south-1) and seeded.

## Verification status

| Check | Result |
|---|---|
| `npx tsc --noEmit` (app) and `tsc -p amplify` (backend) | 0 errors |
| `npx expo lint` | 0 errors (8 style warnings) |
| `npm test` (jest-expo) | 27 tests / 5 suites pass: route chunking & ordering, auth routing, day-status rules, alarm state machine, GPS publish throttle |
| `npx ampx sandbox --once` | deploys cleanly (auth, data with 21 models, storage, 4 Lambdas, Step Functions) |
| `npm run seed` | 1 school + logo, 3 classes, 3 teachers, 2 buses, 24 students with home pins, 3 absences, messages, feedback, broadcast |
| `npm run smoke` | 10/10: sign-in for all 4 roles (forced password change confirmed for teacher + student), driver trip lifecycle startTrip → computeTripRoute → alarmStudent → BOARDED → endTrip |
| `npx expo export --platform web` | builds (5.3 MB JS) |
| `npx expo-doctor` | 20/21 (remaining item: duplicate dev-only react under `@aws-amplify/form-generator`, not bundled) |
| Device builds (Android / iOS) | **not run here** – no emulator/Xcode in this session; config plugins validated by `expo-doctor` and the config evaluates |

## What was built

**Backend (`amplify/`)** – Cognito with free-form school-ID usernames (CDK deletion override on
`UsernameAttributes`, email kept as required attribute), groups `ADMIN TEACHER DRIVER STUDENT`,
custom attributes, invitation e-mail template, SES sender wiring behind `SES_FROM_EMAIL`. Data
schema with every model from the spec plus `MessageReport`, `ImportJob`; every list access pattern
backed by a GSI (see `PERFORMANCE.md`). S3 paths with per-path access rules. Four Lambdas (Node 20):
`admin-users` (create student/teacher/bus, async CSV bulk import with progress, reset/enable/
delete, contact updates, class/bus/teacher assignment maintaining counters + group chats),
`trips` (start/end, Google Routes optimisation with 25-stop chunking + straight-line fallback,
manual reorder, stop status with boarded/dropped pushes, bus-near push, Places search),
`alarm` (alarm push to all devices, Step Functions repeat loop, acknowledge, test alarm),
`comms` (send message with unread counters + pushes to non-viewing members, DM/office chat creation
with role rules, report message, feedback fan-out, broadcast fan-out, push, profile self-service,
home-location change with audit + office notice, data-deletion request).

**App (`src/`)** – Expo Router with `Stack.Protected` route guards per role; design system in
`src/ui`; TanStack Query + MMKV persistence; EN/AR i18n with RTL; shared `ChatScreen`/`Composer`
(text, hold-to-record voice with cancel, camera/gallery/files, compression + thumbnails, upload
progress, optimistic + offline-resumable sends, report/delete); full-screen alarm with looping
sound, vibration and "I'm coming"; native (Google) and web (`@vis.gl`) map behind one interface.

- **Parent/Student**: mandatory home-location onboarding, notification onboarding, Bus tab (status
  card, animated bus, route, ETA, call/message driver, Not-going with until-date/note, 30-day
  history), Messages (class group, classmates, teacher, driver, office), Feedback timeline,
  My Courses (coming-soon + real player once published), Profile (language, appearance, test alarm,
  privacy, delete-my-data).
- **Driver**: tablet-aware map screen (side panel ≥ 900 px), trip type + start/end, coloured
  numbered student markers, follow/re-center, traffic, GPS quality, stop sheet (ALARM / boarded /
  skip reasons / call / message / undo), drag-to-reorder stops, background location with Android
  foreground service, bus-near automation, off-route + 5-min recompute, Students tab, bus group.
- **Teacher**: roster with today's attendance, student profile, multi-student feedback with
  attachments and confirmation, class groups, office chat, broadcasts inbox.
- **Office (web sidebar / phone tabs)**: dashboard with live buses, students table + add + CSV
  import + detail (edit, assign, reset, disable, delete, home override, history, feedback),
  teachers, buses (credentials copy/share, capacity-aware assignment, map), classes, trips with
  timeline + CSV export, inbox + group oversight + reported messages, feedback CRUD, broadcasts,
  courses/lessons with video upload, settings & branding, audit log.

## Improvements included (Section 13)

All items in the spec's list are implemented: trip types with boarded/dropped pushes, bus-near
push, date-range absence with office visibility, per-student ETA + call button, class/bus groups
with office oversight and message reporting, feedback categories/rating/attachments/multi-student,
broadcasts with attachments, notification inbox with badges, audit log, soft disable + confirm
dialogs, Arabic/English RTL, offline queue + cached-first screens, capacity display and warning,
delete-my-data path + privacy screen, minimal PII in pushes, server-side validation with zod,
alarm (15 s) and route (30 s) rate limits.

## Deviations and limits (closest working alternatives)

1. **Routes API:** Google rejects `optimizeWaypointOrder` with `TRAFFIC_AWARE_OPTIMAL`; optimised
   calls use `TRAFFIC_AWARE` (live traffic), fixed-order calls use `TRAFFIC_AWARE_OPTIMAL`.
   Without `GOOGLE_ROUTES_API_KEY` the backend falls back to straight-line routing (seen in the
   smoke test as `route FALLBACK`).
2. **Mutation names:** `createBus` and `updateTripStop` collide with the mutations Amplify generates
   for the `Bus` and `TripStop` models; they are exposed as `registerBus` and `setStopStatus`.
3. **Owner auth on keys:** Amplify forbids an owner field that is a primary-key sort key, so
   `ConversationMember` and `StudentDayStatus` carry an `ownerId` copy of the user id.
4. **Sort-key timestamps:** GSIs cannot use the auto `createdAt`, so sortable timestamps are
   explicit (`sentAt`, `postedAt`, `occurredAt`, …).
5. **Android full-screen intent:** manifest permission + `showWhenLocked/turnScreenOn` are added by
   the config plugin; posting a true full-screen-intent notification from a remote push needs a
   small native module that `expo-notifications` does not expose. The MAX-importance channel +
   heads-up + in-app alarm screen cover the behaviour on tap.
6. **iOS Critical Alerts** are behind `ENABLE_IOS_CRITICAL_ALERTS` pending Apple's entitlement.
7. **Alarm sound** is one bundled `alarm.wav` (30 s) used for both the push and the in-app loop.
8. **Message/Conversation read scope:** readable by any signed-in user who knows the unguessable
   conversation id; membership is enforced on write. Tightening reads needs a JS resolver.
9. **Admin name search** filters loaded pages client-side (DynamoDB has no full-text search).
10. **Expo SDK stayed on 57** (the installed version) rather than upgrading to 58; TypeScript was
    bumped to 6.0 as expo-doctor demanded and `types` were made explicit.
11. **Sandbox recreated:** the starter pool had `UsernameAttributes=email`, which CloudFormation
    cannot change in place, so the day-old starter sandbox (Todo model only) was deleted and
    redeployed. Seeded credential e-mails were not sent (no `SEED_EMAIL`), the printed passwords
    work; re-run `SEED_EMAIL=you@… npm run seed` or add a student from the office to receive one.
12. **Not verified on devices** in this session: background location, push delivery, voice
    recording and maps on Android/iOS hardware. Everything compiles and the web build runs.

## Amplify Hosting fix (deployments 1 and 2 failed)

Both console deployments died ~45 s in, during `npm ci`: `package.json` and `package-lock.json`
had drifted apart (the lock pinned `zod@3.24.2` where a nested dependency needed `3.25.17`, and
two `@opentelemetry/core@2.0.0` entries were missing), so `npm ci` refused to install. Fixes:

- regenerated `package-lock.json` (`npm install --package-lock-only`) and verified a clean
  `npm ci` on a scratch copy succeeds;
- added `amplify.yml` (backend `pipeline-deploy` + frontend `expo export`, Node 22 via nvm,
  `dist/` artifacts, npm + node_modules cache) instead of relying on the auto-detected spec;
- added `npm run build` and `engines.node` to `package.json`, `.nvmrc`;
- README §8 lists the console settings still needed: service role, environment variables, the
  `GOOGLE_ROUTES_API_KEY` secret, and the SPA rewrite rule.

Deployment 3 (commit `4010d4d`) succeeded. Hosting configuration done through the AWS API on
2026-10-19 (account 946385207602, app `dg9g67lujh0do`, branch `main`):

| Item | State |
|---|---|
| Service role | `AmplifySSRLoggingRole-68f8232c…` already carries `AmplifyBackendDeployFullAccess` (verified) |
| Environment variables | `EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID`, `EXPO_PUBLIC_SCHOOL_ID=default`, `SCHOOL_NAME=Al Noor International School`, `SES_FROM_NAME=School Office` set on the app |
| Rewrites | regex SPA rewrite (200) + `/<*>` fallback (404-200); `/chat/<id>`, `/(admin)/dashboard`, `/notifications` now return the app shell |
| SES | identity `mastaisshakh@gmail.com` created in ap-south-1, verification e-mail sent (status PENDING); account is in SES sandbox (200/day, verified recipients only) |
| Google Maps key | The user's Maps Platform key (created 2026-10-19, restricted to 32 Maps APIs) is set as `EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY` on the app and as the `GOOGLE_ROUTES_API_KEY` secret (shared + branch SSM paths). Validated against Routes, Places (New), Static Maps and the Maps JavaScript loader. Also written to the git-ignored local `.env` for Android/iOS/web dev builds. |
| Not settable here | `EXPO_PUBLIC_EAS_PROJECT_ID` (needs an Expo account login) |
| Branch backend | user pool `ap-south-1_NBbyBcsLa`, seeded with the same demo data as the sandbox (`AMPLIFY_OUTPUTS=… npm run seed`) |
