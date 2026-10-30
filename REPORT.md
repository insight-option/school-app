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
| Expo / EAS | Project `e081390e-15bc-4648-8903-133ad6b3eb9b` created under `masta-jazz`; `EXPO_PUBLIC_EAS_PROJECT_ID` set on Amplify and in `app.config.ts`; `eas.json` profiles; EAS Update published to branch `preview` (Expo Go link); Android APK built with the `preview` profile and a locally generated keystore |
| Native fixes found by the first builds | `aws-amplify` needs `@aws-amplify/react-native`, async-storage, get-random-values and url-polyfill on native (the export failed without them); Expo Go has no SRP module, so the user-pool client now also allows `USER_PASSWORD_AUTH` and the app uses it only inside Expo Go; MMKV falls back to memory and the map to Apple Maps inside Expo Go |
| Branch backend | user pool `ap-south-1_NBbyBcsLa`, seeded with the same demo data as the sandbox (`AMPLIFY_OUTPUTS=… npm run seed`) |

## Hard delete and data wipe (2026-10-20)

Deleting a person from the office used to be a soft delete: the Cognito account went, but the
profile stayed as "Deleted user" and a driver's bus was only disabled, so rows lingered in every
list. `deleteUser` now cascades: profile, devices, notifications, private chats (direct + office),
group-chat memberships; for students also day statuses, trip stops, feedback, enrolments and the
class/bus counters; for drivers the bus, its live position, trips with stops and the bus group chat,
and the students are detached from the bus. Deleting a class detaches its students, teacher and
courses and removes the class group chat. Group messages a deleted person sent and audit rows stay.

`npm run wipe -- --yes` (`scripts/wipe.ts`, documented in `SEED.md`) empties a backend except
`SchoolSettings`, the branding files and the accounts in `KEEP_USERS`. It was run against the hosting
backend to clear the demo data; the hosted `admin-users` Lambda was hot-patched with the new bundle
(same esbuild settings Amplify uses) and verified on real rows before the wipe, and the next
`git push` redeploys the identical code through the pipeline.

## Location, storage and alarm findings (2026-10-20, from device testing)

| Symptom | Root cause | Fix |
|---|---|---|
| Red banner `User: arn:aws:sts::…:assumed-role/amplify-…` and voice/photo messages stuck on "Failed" for drivers, students, teachers | Every user is in a Cognito group and the identity pool maps group members to their **group IAM role**, not the generic authenticated role. Only the ADMIN group role carried S3 permissions, so `allow.authenticated` / `allow.entity` storage rules never applied to real users. | `amplify/storage/resource.ts` grants every path to the groups explicitly (members read/write chat, read branding/broadcasts/courses/feedback, own avatars; admins everything incl. CSV imports). |
| `ERR_LOCATION_INFO_PLIST` console error when the driver pressed Start trip in Expo Go (iOS) | `requestBackgroundPermissionsAsync` was called even where background location is unavailable (Expo Go, web); the promise chain had no catch. | `ensureLocationPermissions` only asks for background permission in real builds and tolerates failures; the trip screen catches setup errors. |
| Route drawn "between the student and the school" instead of from the driver | Before a trip starts the device publishes nothing, so the route origin fell back to the bus's last stored position = the school. | `startTrip` / `computeTripRoute` accept the driver's live `lat`/`lng`; the trip screen sends its GPS fix (fetching one if needed) and writes it to `BusLocation`; the foreground watcher now publishes the bus position even before a trip. Morning: driver → all pending students (optimised, live traffic) → school. Afternoon: driver → students (optimised) → farthest stop. |
| "School location not saved" | It was saved (DynamoDB held the new coordinates) but the preview map kept its first region, and other devices cached the old settings for five minutes. | Preview re-centres on the new coordinates and shows them with an "unsaved" hint until Save; all workspaces subscribe to `SchoolSettings` updates (`useSettingsSubscription`). |
| Alarm never rang on the student's phone | The only registered push device belonged to the driver's iPhone. The student's Android phone cannot obtain a push token: the build has no Firebase (FCM) configuration, which only the project owner can create. Signing out also deleted the device row. | `app.config.ts` picks up `google-services.json` / `GOOGLE_SERVICES_JSON`; README §7 gives the exact Firebase + `eas credentials` steps; devices stay registered after sign-out so alarms keep ringing on that phone. The Step Functions repeat loop and the Lambda were verified in CloudWatch (no errors, repeats fired). |

Still outside the code: Firebase project + FCM key upload + a new APK (user), Apple developer account for iOS
builds/APNs and Critical Alerts, and Expo Go's own limits (default notification sound, Apple Maps,
no background location). Expo Go over the ngrok tunnel is a development bundle and is several times
slower than the published update or the APK; performance should be judged on those.

## Multi-school platform, public directory, admissions, premium driver map (2026-10-30)

**Expo SDK 58.** The local upgrade (expo 58, React Native 0.88.1, React 19.3, expo-router 58) was
finished: the half-converted lockfile (still pinning expo-router/@expo/ui 57) was regenerated and a
clean `npm ci` validated; React Navigation 8 tab-bar API changes fixed. Expo Go on iOS now only
supports SDK 58, which is why the previous build stopped opening.

**What was added**

| Area | Result |
|---|---|
| Landing | Public school directory for signed-out users: instant search (Arabic/Latin normalised), filters (applications open, bus service, curriculum), premium cards, cached for instant start; **Sign in** and **Create my school** always visible |
| School page | Cover, logo, facts grid, admissions (status, deadline, documents), facilities, map + directions, contact actions, sticky **Apply now** |
| Online applications | Guest form with saved draft and validation; reference number; status lookup by reference + e-mail; abuse limits (5 per e-mail per day, 40 per school per 10 min, duplicate detection) |
| Create my school | Sign-up (e-mail + password) → 6-digit e-mail code → wizard (name, logo, location, timezone/language, profile & admissions) → office workspace |
| Office | **Applications** (live list, status filters, decision + message to the family, "Create student account" prefilled) and **Public profile** editor (visibility, logo/cover, about, contact, location, academics, fees, admissions) |
| Isolation | School-scoped auth rules on every model, per-school admin groups, Lambda checks on every operation, school-partitioned indexes, per-school office chat seat, storage without listing, custom attributes not writable by users |
| Driver map | Live tracking from app open, trip starts at the live fix, traffic-coloured route with casing, traffic layer on by default, full screen, navigation camera, map types, next-stop card, remaining distance/time/arrival |
| Alarm | Rings on signed-out phones (devices stay registered, signed token answers "I'm coming"), server-side device ownership, permission prompt + banner for families |

**Verification done here:** TypeScript (app + backend), lint (0 errors), 46 unit tests, local CDK
synthesis of the whole backend (schema transform, auth rules, IAM policies – no circular
dependencies), iOS/Android/web bundle export, and one live Google Routes call proving
`TRAFFIC_ON_POLYLINE` works together with waypoint optimisation.

**Not verified yet (needs AWS access, which was expired during this session):** the deployed
backend. After `git push` the hosting pipeline deploys the new schema (four new indexes on existing
tables are back-filled by DynamoDB), then: regenerate `amplify_outputs.json`, publish the Expo update,
build the SDK 58 Android APK, and run the end-to-end checks (sign-up → school → staff → trip → alarm,
directory → application → office decision).

**Known limits:** anyone can create a school (no moderation queue yet); Android push still needs the
Firebase/FCM setup in README §7; iOS custom sound and Critical Alerts need a real iOS build and
Apple's entitlement; a school admin could rename a record's `schoolId` to another school's id (moving
it out of their own school, never reading the other school's data) – closing this needs field-level
rules or Lambda-only writes.
