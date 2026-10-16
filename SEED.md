# Seed data

`npm run seed` (= `tsx scripts/seed.ts`) populates a sandbox with a realistic small school. It is
idempotent – existing IDs are skipped – and goes through the **same admin mutations the app uses**
(`createStudent`, `createTeacher`, `registerBus` (the spec's `createBus`), `submitFeedback`, `sendMessage`, `sendBroadcast`),
so it also exercises the Lambdas end to end.

## Prerequisites

1. `npx ampx sandbox` has deployed and written `amplify_outputs.json`.
2. AWS credentials for the sandbox account in your shell (the script creates the admin Cognito user
   directly; everything else is done signed in as that admin).
3. Optional: `SEED_EMAIL=you@example.com` – every parent/teacher credential e-mail is then sent to
   `you+s-1001@example.com`, `you+t-1001@example.com`, … (Gmail/Outlook plus-addressing). Without it
   the accounts use `*@seed.invalid` addresses and no e-mail is delivered. Cognito's default sender is
   limited to 50 e-mails/day in sandbox – the seed sends 27.

```bash
SEED_EMAIL=you@example.com npm run seed
```

## What gets created

| Entity | Count | Details |
|---|---|---|
| School | 1 | "Al Noor International School", logo (`school/branding/logo.png`), primary colour `#2563EB`, school pin at Riyadh 24.7136 / 46.6753 (`SCHOOL` constant in `scripts/seed.ts` – change it to your city), timezone `Asia/Riyadh`, trips 06:30 / 13:30, student chat on, alarm 20 s × 5 |
| Admin | 1 | `ADMIN-01` / `Admin#2026` (permanent password) |
| Classes | 3 | `3A` (grade 3), `4B` (grade 4), `5C` (grade 5) |
| Teachers | 3 | `T-1001` Ms. Huda Al-Amri → 3A, `T-1002` Mr. Sami Al-Rashid → 4B, `T-1003` Ms. Nadia Al-Fahad → 5C. Temporary password `Welcome#2026` (forced change on first login). |
| Buses / drivers | 2 | `BUS-01` plate RUH 4521 (Abu Khalid), `BUS-02` plate RUH 7788 (Abu Saleh), capacity 20 each. Password `Driver#2026` (permanent – drivers log in immediately). |
| Students | 24 | `S-1001` … `S-1024`, 8 per class, alternating buses (12 per bus). Home pins on a golden-angle spiral 0.7–3.5 km around the school so the driver map and route optimisation have something to chew on. Temporary password `Welcome#2026`. |
| Day statuses | 3 | `S-1001`, `S-1002`, `S-1003` are **NOT_GOING** today ("Doctor appointment") – they show red on the driver map and in the office absences list. |
| Messages | 2 | Office → class group 3A welcome message; office → parent of `S-1001` in their office chat. |
| Feedback | 3 | PRAISE ★5 to `S-1002` and `S-1003` (parent), ATTENDANCE to `S-1005` (parent + office). |
| Broadcast | 1 | "Early dismissal on Thursday" to all students (fan-out creates a Notification per student). |

Group chats (`class_<id>`, `bus_<id>`) and every user's office chat (`office_<userId>`) are created
automatically by the mutations.

## Demo logins (printed at the end and saved to `seed-output.json`)

| Workspace | ID | Password | First-login flow |
|---|---|---|---|
| School office (web) | `ADMIN-01` | `Admin#2026` | none |
| Teacher | `T-1001` | `Welcome#2026` | forced new password |
| Bus driver (tablet) | `BUS-01` | `Driver#2026` | none |
| Parent / student | `S-1001` | `Welcome#2026` | forced new password → home location already set by the office; notification permission |

`npm run smoke` signs in as each of the four (checking that the temporary-password accounts are
forced to set a new password, without completing it so the demo logins stay valid), then – as the
driver – runs a full trip through the Lambdas: `startTrip` → `computeTripRoute` → `alarmStudent` →
`setStopStatus(BOARDED)` → `endTrip`. Set `SMOKE_TRIP=0` to skip the trip part.

## Trying the live flows

1. Sign in as `BUS-01` on a tablet/phone, choose *Morning pickup*, **Start trip**: 12 stops are created
   (3 absent → red), the route is computed (Google if `GOOGLE_ROUTES_API_KEY` is set, otherwise the
   straight-line fallback) and the bus position starts publishing.
2. Sign in as `S-1004` on another phone: the Bus tab shows the moving bus, the route and the ETA to
   the stop. Toggle **Not going today** – the driver's marker turns red instantly.
3. On the driver, tap a student marker → **ALARM**: the student's phone rings until **I'm coming**.
4. Mark boarded → the parent gets the "Boarded" push and the stop shows in trip history.
