# Performance notes

The app is built to feel instant for 100 000+ students: every screen renders from a persisted
cache first, every list query hits a DynamoDB index, real-time traffic is scoped per bus /
conversation / user, and all heavy work (routing, user creation, pushes, imports) runs in Lambdas.

## Client principles

| Concern | Implementation |
|---|---|
| Instant screens | TanStack Query with an MMKV-persisted cache (`src/lib/query/client.ts`). Lists render cached data immediately and refetch in the background (`staleTime` 15 s, `gcTime` 7 days). Skeletons, never spinners, on navigation. |
| Minimal payloads | Index queries use `selectionSet` where the row is large (profiles), `limit: 50` + `nextToken` everywhere (`useInfiniteQuery`). Messages load the latest 50 and page upwards. |
| Denormalised reads | `ConversationMember` carries title / avatar / last message / unread so the inbox is **one** index query. `TripStop` carries the student name, phone and address. `Profile` carries `className`, `busName`. Counters (`studentCount`, `unreadCount`, `boardedCount`) are maintained by the Lambdas, never computed by listing. |
| Scoped subscriptions | `BusLocation.onUpdate(busId)`, `TripStop.onUpdate(tripId)`, `Trip.onUpdate(id)`, `StudentDayStatus.onCreate/onUpdate(busId)`, `Message.onCreate(conversationId)`, `ConversationMember.onUpdate(userId)`, `Notification.onCreate(userId)`. All are created in `useEffect` and torn down on unmount/blur (`useFocusEffect`). |
| Location writes | Driver publishes every 4 s **or** 15 m (whichever first), skipping fixes with accuracy > 50 m, into **one** `BusLocation` row per bus (`src/lib/rules/location.ts`). Parents never poll. |
| Media | `expo-image` disk cache; images downscaled to 1600 px + 320 px thumbnail before upload; signed URLs cached in memory + MMKV for their 15-minute lifetime (`src/lib/storage/s3.ts`). |
| Lists | `@shopify/flash-list` v2 (auto item sizing) with stable keys and memoised rows (`ListItem`, `MessageBubble`). |
| Bundle | Route groups are lazy by Expo Router; `react-native-maps` is only imported by the screens that render a map; web uses `@vis.gl/react-google-maps` through `MapView.web.tsx`. Hermes is on by default. |
| Offline | Reads come from the persisted cache; mutations use `networkMode: 'offlineFirst'`, paused sends are persisted and resumed (`resumePausedMutations`) – the message composer shows sending / failed / retry. `OfflineBanner` reflects NetInfo. |

## Every query and its index

| Screen / hook | Query | Index (GSI) |
|---|---|---|
| Own profile | `Profile.get(userId)` | primary key (`userId` = Cognito sub) |
| Admin students / teachers | `listProfilesByRole(role)` | `role` → `fullName` |
| Class roster, classmates, feedback form | `listProfilesByClass(classId)` | `classId` → `fullName` |
| Driver students, bus assignment, trip start | `listProfilesByBus(busId)` | `busId` → `fullName` |
| Lookup by school ID (Lambdas, seed) | `listProfilesByUsername(username)` | `username` |
| Devices for push (Lambdas) | `listDevicesByUser(userId)` / `listDevicesByToken` | `userId` / `expoPushToken` |
| Classes | `listClassesBySchool(schoolId)` / `listClassesByTeacher(teacherId)` | `schoolId` → `name` / `teacherId` |
| Buses | `listBusesBySchool(schoolId)` | `schoolId` → `plate` |
| Live bus position | `BusLocation.get(busId)` + `onUpdate` | primary key |
| Today's / history trips per bus | `listTripsByBusAndDate(busId, date)` | `busId` → `date` |
| Office: today's trips | `listTripsByDate(date)` | `date` → `busId` |
| Stops of a trip | `listStopsByTrip(tripId)` | `tripId` → `order` |
| Parent trip history | `listStopsByStudentAndDate(studentId, date between)` | `studentId` → `date` |
| My day status | `StudentDayStatus.get(studentId, date)` | composite primary key |
| Driver day statuses | `listDayStatusByBusAndDate(busId, date)` | `busId` → `date` |
| Office absences | `listDayStatusByDate(date, status = NOT_GOING)` | `date` → `status` |
| Inbox | `listMembershipsByUser(userId)` (`OFFICE` seat for admins) | `userId` → `lastMessageAt` |
| Members of a chat | `ConversationMember.list(conversationId)` | composite primary key (hash) |
| Chat history | `listMessagesByConversation(conversationId)` DESC | `conversationId` → `sentAt` |
| Office oversight | `listConversationsByType(CLASS_GROUP/BUS_GROUP)` | `type` → `lastMessageAt` |
| Parent / teacher feedback | `listFeedbackByStudent(studentId)` | `studentId` → `postedAt` |
| Teacher "sent by me" | `listFeedbackByAuthor(authorId)` | `authorId` → `postedAt` |
| Office feedback browser | `listFeedbackBySchool(schoolId)` | `schoolId` → `postedAt` |
| Broadcast inbox | `listBroadcastsByAudience(audience)` + `listBroadcastsByTarget(classId/busId)` | `audience` / `targetId` → `postedAt` |
| Office broadcasts | `listBroadcastsBySchool(schoolId)` | `schoolId` → `postedAt` |
| Notifications | `listNotificationsByUser(userId)` | `userId` → `sentAt` |
| Courses | `listCoursesBySchool` / `listCoursesByClass` / `listLessonsByCourse` | `schoolId` → `title` / `classId` / `courseId` → `order` |
| Audit log | `listAuditBySchool(schoolId)` (+ filter) | `schoolId` → `occurredAt` |
| Import jobs | `ImportJob.get(id)` + `onUpdate(id)`, `listImportJobsByAdmin` | primary key / `adminId` → `startedAt` |
| Reported messages | `listReportsBySchool(schoolId)` | `schoolId` → `reportedAt` |

Group conversations use deterministic ids (`class_<classId>`, `bus_<busId>`, `office_<userId>`,
`dm_<a>_<b>`) so they are fetched by primary key without a lookup query.

## Server-side cost controls

- Route computation is rate-limited to one Google call per trip per 30 s (cached result returned
  otherwise) and uses ≤ 25 intermediates per request (chunked for larger buses).
- Alarm: max 1 per stop per 15 s; repeats run in Step Functions (no idle Lambda time).
- Pushes are chunked 100 per Expo request; dead tokens are deleted on `DeviceNotRegistered`.
- Bulk import runs asynchronously (`.async()` mutation) with concurrency 3 and exponential retry
  on Cognito throttling; progress is streamed to the UI through `ImportJob.onUpdate`.
- Broadcast fan-out iterates the role index page by page (100 users per page) in an async Lambda.

## Known trade-offs

- Admin "search by name" filters the loaded pages client-side (DynamoDB has no full-text search).
  For very large schools filter by class or bus first, or add OpenSearch later.
- `Message` and `Conversation` rows are readable by any signed-in user who knows the (unguessable)
  conversation id; membership is enforced on write by the `sendMessage` Lambda. A stricter read
  policy needs a JS resolver that checks `ConversationMember` – documented in README.
