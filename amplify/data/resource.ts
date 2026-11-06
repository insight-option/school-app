import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { adminUsers } from '../functions/admin-users/resource';
import { trips } from '../functions/trips/resource';
import { alarm } from '../functions/alarm/resource';
import { comms } from '../functions/comms/resource';
import { platform } from '../functions/platform/resource';

/**
 * School system schema – multi-school (multi-tenant).
 *
 * Tenancy (every school's data is isolated from every other school):
 *  - Every record carries `schoolId`. Users carry the same id in the `custom:schoolId` Cognito
 *    attribute, which only the backend can write (the app client's write attributes exclude it).
 *  - MEMBER READ  `allow.ownerDefinedIn('schoolId').identityClaim('custom:schoolId').to(['read'])`:
 *    signed-in users read records of their own school. The app sends the ID token (which carries
 *    custom attributes) to AppSync – see src/lib/amplify.ts.
 *  - SCHOOL ADMIN `allow.groupDefinedIn('schoolId')`: each school has a Cognito group named after its
 *    schoolId that contains only that school's office admins; they get full access to their school's
 *    records and nothing else. The static ADMIN group is only used for routing and custom operations,
 *    whose Lambdas scope every action to the caller's school.
 *  - Public directory: `School` is readable by guests (identity pool) and every signed-in user;
 *    applications are submitted through a guest-callable mutation and readable only by the school.
 *  - PLATFORM OWNER `allow.group('OWNER')` on every model: the owner group (created by defineAuth,
 *    members added by hand in Cognito) can read, change and delete everything.
 *  - Activity businesses (partners) follow the school pattern: one Cognito group per business named
 *    after its businessId (`biz-…`) holds that business's admins (`groupDefinedIn('businessId')`).
 *    Customers book through Lambda-backed mutations; they read only their own bookings.
 *
 * Design rules (see PERFORMANCE.md):
 *  - every list access pattern has a secondary index, partitioned by school where it spans users;
 *  - display fields (names, plates, class names) are denormalised onto child records;
 *  - writes that need validation go through Lambda-backed custom mutations;
 *  - timestamps used as sort keys are explicit fields (`sentAt`, `postedAt`, …) because the
 *    auto-managed `createdAt` cannot be used as a GSI sort key.
 */
const schema = a
  .schema({
    // ───────────────────────────── shared types ─────────────────────────────
    Location: a.customType({
      lat: a.float().required(),
      lng: a.float().required(),
    }),
    Role: a.enum(['ADMIN', 'TEACHER', 'DRIVER', 'STUDENT', 'OWNER', 'PARTNER', 'CUSTOMER']),
    TripType: a.enum(['MORNING_PICKUP', 'AFTERNOON_DROPOFF']),
    TripStatus: a.enum(['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED']),
    StopStatus: a.enum(['PENDING', 'ALARMED', 'ACKNOWLEDGED', 'BOARDED', 'DROPPED', 'SKIPPED', 'ABSENT']),
    DayStatus: a.enum(['GOING', 'NOT_GOING']),
    ConversationType: a.enum(['DIRECT', 'CLASS_GROUP', 'BUS_GROUP', 'OFFICE']),
    MessageType: a.enum(['TEXT', 'VOICE', 'IMAGE', 'VIDEO', 'FILE']),
    FeedbackAudience: a.enum(['PARENT', 'OFFICE', 'BOTH']),
    FeedbackCategory: a.enum(['ACADEMIC', 'BEHAVIOR', 'ATTENDANCE', 'PRAISE', 'OTHER']),
    AuthorRole: a.enum(['TEACHER', 'ADMIN']),
    BroadcastAudience: a.enum(['ALL_TEACHERS', 'ALL_STUDENTS', 'ALL_DRIVERS', 'CLASS', 'BUS']),
    NotificationType: a.enum(['ALARM', 'MESSAGE', 'FEEDBACK', 'BROADCAST', 'BUS_NEAR', 'BOARDED', 'DROPPED', 'SYSTEM', 'APPLICATION', 'BOOKING', 'TRIP']),
    ImportJobStatus: a.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']),
    GenderPolicy: a.enum(['MIXED', 'BOYS', 'GIRLS']),
    ApplicationStatus: a.enum(['NEW', 'REVIEWING', 'ACCEPTED', 'WAITLISTED', 'REJECTED']),
    // ── platform (owner console, activity businesses, bookings, billing) ──
    TenantStatus: a.enum(['ACTIVE', 'SUSPENDED', 'PENDING']),
    PriceMode: a.enum(['PER_HOUR', 'PER_SESSION', 'PER_PERSON', 'ON_REQUEST', 'FREE']),
    BookingMode: a.enum(['INSTANT', 'REQUEST', 'CONTACT']),
    BookingStatus: a.enum(['PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']),
    SubscriptionStatus: a.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED']),
    BillingCycle: a.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
    InvoiceStatus: a.enum(['DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'VOID']),

    // ───────────────────────────── school ─────────────────────────────
    /** Public directory listing – what parents see before signing in. Written by the school's admins. */
    School: a
      .model({
        schoolId: a.id().required(),
        name: a.string().required(),
        nameLower: a.string().required(), // search + sort key
        directory: a.string().required(), // 'PUBLIC' (listed) | 'HIDDEN' – never null (GSI key)
        tagline: a.string(),
        description: a.string(),
        logoKey: a.string(),
        coverKey: a.string(),
        primaryColor: a.string(),
        city: a.string(),
        country: a.string(),
        address: a.string(),
        location: a.ref('Location'),
        phone: a.string(),
        email: a.string(),
        website: a.string(),
        curriculum: a.string(),
        grades: a.string(), // display text, e.g. "KG1 – Grade 12"
        gradeOptions: a.string().array(), // choices on the application form
        languages: a.string(),
        genderPolicy: a.ref('GenderPolicy'),
        feesFrom: a.float(),
        feesTo: a.float(),
        currency: a.string(),
        transportAvailable: a.boolean(),
        foundedYear: a.integer(),
        facilities: a.string().array(),
        applicationsOpen: a.boolean(),
        academicYear: a.string(),
        applicationDeadline: a.string(), // YYYY-MM-DD
        admissionsNote: a.string(),
        requiredDocuments: a.string().array(),
        seatsAvailable: a.integer(),
        status: a.ref('TenantStatus'), // null = ACTIVE (legacy rows); SUSPENDED blocks the workspace
      })
      .identifier(['schoolId'])
      .secondaryIndexes((index) => [index('directory').sortKeys(['nameLower']).queryField('listDirectorySchools')])
      .authorization((allow) => [allow.group('OWNER'), allow.guest().to(['read']), allow.authenticated().to(['read']), allow.groupDefinedIn('schoolId').to(['read'])]),

    /** Online admission applications – submitted without an account, reviewed by the school office. */
    Application: a
      .model({
        schoolId: a.string().required(),
        reference: a.string().required(),
        status: a.ref('ApplicationStatus').required(),
        studentName: a.string().required(),
        dateOfBirth: a.string(),
        gender: a.string(),
        gradeApplying: a.string(),
        parentName: a.string().required(),
        relationship: a.string(),
        parentEmail: a.string().required(),
        parentEmailLower: a.string().required(),
        parentPhone: a.string().required(),
        address: a.string(),
        currentSchool: a.string(),
        needsTransport: a.boolean(),
        notes: a.string(),
        language: a.string(),
        reviewerNote: a.string(),
        reviewedBy: a.string(),
        reviewedAt: a.datetime(),
        submittedAt: a.datetime().required(),
      })
      .secondaryIndexes((index) => [
        index('schoolId').sortKeys(['submittedAt']).queryField('listApplicationsBySchool'),
        index('reference').queryField('listApplicationsByReference'),
        index('parentEmailLower').sortKeys(['submittedAt']).queryField('listApplicationsByEmail'),
      ])
      .authorization((allow) => [allow.group('OWNER'), allow.groupDefinedIn('schoolId')]),

    SchoolSettings: a
      .model({
        schoolId: a.id().required(),
        name: a.string().required(),
        logoKey: a.string(),
        primaryColor: a.string(),
        address: a.string(),
        schoolLocation: a.ref('Location'),
        timezone: a.string().default('Asia/Qatar'),
        defaultLanguage: a.string().default('en'),
        morningTripStart: a.string().default('06:30'),
        afternoonTripStart: a.string().default('13:30'),
        studentChatEnabled: a.boolean().default(true),
        alarmRepeatSeconds: a.integer().default(20),
        alarmMaxRepeats: a.integer().default(5),
        senderEmail: a.string(),
      })
      .identifier(['schoolId'])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('schoolId').identityClaim('custom:schoolId').to(['read']), allow.groupDefinedIn('schoolId')]),
    // ───────────────────────────── people ─────────────────────────────
    Profile: a
      .model({
        userId: a.id().required(), // Cognito sub
        username: a.string().required(), // school ID number
        role: a.ref('Role').required(),
        schoolId: a.string().required(),
        fullName: a.string().required(),
        email: a.string(),
        phone: a.string(),
        avatarKey: a.string(),
        classId: a.string(),
        className: a.string(),
        busId: a.string(),
        busName: a.string(),
        parentEmail: a.string(),
        parentPhone: a.string(),
        homeLocation: a.ref('Location'), // the active pickup / drop-off point (one of the saved places)
        homeAddress: a.string(),
        homePlaceId: a.string(), // SavedPlace currently used for pickup
        homeLabel: a.string(), // its name ("Home", "Grandparents", …) – shown to the driver
        homeNote: a.string(), // directions for the driver (gate colour, building, …)
        isActive: a.boolean().default(true),
        language: a.string().default('en'),
        grade: a.string(),
        // teachers: classes they teach (denormalised list for fast guards)
        classIds: a.string().array(),
      })
      .identifier(['userId'])
      .secondaryIndexes((index) => [
        index('role').sortKeys(['fullName']).queryField('listProfilesByRole'),
        index('classId').sortKeys(['fullName']).queryField('listProfilesByClass'),
        index('busId').sortKeys(['fullName']).queryField('listProfilesByBus'),
        index('username').queryField('listProfilesByUsername'),
        index('schoolId').sortKeys(['fullName']).queryField('listProfilesBySchool'),
        index('schoolId').sortKeys(['role']).queryField('listProfilesBySchoolAndRole'),
      ])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('schoolId').identityClaim('custom:schoolId').to(['read']), allow.groupDefinedIn('schoolId')]),
    Device: a
      .model({
        userId: a.id().required(),
        expoPushToken: a.string().required(),
        platform: a.string().required(),
        deviceName: a.string(),
        lastSeenAt: a.datetime().required(),
      })
      .secondaryIndexes((index) => [
        index('userId').queryField('listDevicesByUser'),
        index('expoPushToken').queryField('listDevicesByToken'),
      ])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('userId')]),
    Class: a
      .model({
        schoolId: a.string().required(),
        name: a.string().required(),
        grade: a.string(),
        teacherId: a.string(),
        teacherName: a.string(),
        studentCount: a.integer().default(0),
        conversationId: a.string(),
      })
      .secondaryIndexes((index) => [
        index('schoolId').sortKeys(['name']).queryField('listClassesBySchool'),
        index('teacherId').queryField('listClassesByTeacher'),
      ])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('schoolId').identityClaim('custom:schoolId').to(['read']), allow.groupDefinedIn('schoolId')]),
    Bus: a
      .model({
        busId: a.id().required(), // = driver username
        schoolId: a.string().required(),
        plate: a.string().required(),
        driverName: a.string().required(),
        driverPhone: a.string(),
        capacity: a.integer().default(40),
        driverUserId: a.string(),
        studentCount: a.integer().default(0),
        isActive: a.boolean().default(true),
        conversationId: a.string(),
      })
      .identifier(['busId'])
      .secondaryIndexes((index) => [index('schoolId').sortKeys(['plate']).queryField('listBusesBySchool')])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('schoolId').identityClaim('custom:schoolId').to(['read']), allow.groupDefinedIn('schoolId')]),
    // One row per bus, updated in place by the driver device.
    BusLocation: a
      .model({
        busId: a.id().required(),
        schoolId: a.string(), // optional only for rows written before multi-school support
        driverUserId: a.string().required(),
        lat: a.float().required(),
        lng: a.float().required(),
        heading: a.float(),
        speed: a.float(),
        accuracy: a.float(),
        updatedAt: a.datetime().required(),
        tripId: a.string(),
      })
      .identifier(['busId'])
      .authorization((allow) => [allow.group('OWNER'), 
        allow.ownerDefinedIn('schoolId').identityClaim('custom:schoolId').to(['read']),
        allow.ownerDefinedIn('driverUserId').to(['read', 'update']),
        allow.groupDefinedIn('schoolId'),
      ]),
    // ───────────────────────────── transport ─────────────────────────────
    StudentDayStatus: a
      .model({
        studentId: a.id().required(),
        date: a.string().required(), // YYYY-MM-DD
        ownerId: a.string().required(), // = studentId; owner auth cannot sit on a key field
        busId: a.string().required(),
        schoolId: a.string().required(),
        studentName: a.string(),
        status: a.ref('DayStatus').required(),
        note: a.string(),
        setBy: a.string(),
        untilDate: a.string(),
      })
      .identifier(['studentId', 'date'])
      .secondaryIndexes((index) => [
        index('busId').sortKeys(['date']).queryField('listDayStatusByBusAndDate'),
        index('date').sortKeys(['status']).queryField('listDayStatusByDate'),
        index('schoolId').sortKeys(['date']).queryField('listDayStatusBySchoolAndDate'),
      ])
      .authorization((allow) => [allow.group('OWNER'), 
        // 'delete' also lets the student clear note/untilDate (null) when switching back to "going".
        allow.ownerDefinedIn('ownerId').to(['create', 'update', 'read', 'delete']),
        allow.ownerDefinedIn('schoolId').identityClaim('custom:schoolId').to(['read']),
        allow.groupDefinedIn('schoolId'),
      ]),
    /**
     * Addresses a user saved ("Home", "Grandparents", …). The active one is mirrored on
     * Profile.homeLocation by the updateHomeLocation mutation, which also moves today's pickup on an
     * active trip and re-routes the bus. Owners create, rename and delete their places directly.
     */
    SavedPlace: a
      .model({
        ownerId: a.string().required(), // = userId (Cognito sub)
        schoolId: a.string(),
        label: a.string().required(),
        kind: a.string().required(), // HOME | FAMILY | WORK | OTHER
        lat: a.float().required(),
        lng: a.float().required(),
        address: a.string(),
        area: a.string(),
        city: a.string(),
        street: a.string(),
        zone: a.string(),
        building: a.string(),
        note: a.string(),
        lastUsedAt: a.datetime().required(),
      })
      .secondaryIndexes((index) => [index('ownerId').sortKeys(['lastUsedAt']).queryField('listPlacesByOwner')])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('ownerId'), allow.groupDefinedIn('schoolId')]),
    Trip: a
      .model({
        busId: a.string().required(),
        schoolId: a.string().required(),
        date: a.string().required(),
        type: a.ref('TripType').required(),
        status: a.ref('TripStatus').required(),
        driverUserId: a.string(),
        driverName: a.string(),
        busPlate: a.string(),
        startedAt: a.datetime(),
        endedAt: a.datetime(),
        routePolyline: a.string(),
        routeMeta: a.json(),
        startLocation: a.ref('Location'),
        stopCount: a.integer().default(0),
        boardedCount: a.integer().default(0),
      })
      .secondaryIndexes((index) => [
        index('busId').sortKeys(['date']).queryField('listTripsByBusAndDate'),
        index('date').sortKeys(['busId']).queryField('listTripsByDate'),
        index('schoolId').sortKeys(['date']).queryField('listTripsBySchoolAndDate'),
      ])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('schoolId').identityClaim('custom:schoolId').to(['read']), allow.groupDefinedIn('schoolId')]),
    TripStop: a
      .model({
        tripId: a.id().required(),
        busId: a.string().required(),
        schoolId: a.string(), // optional only for rows written before multi-school support
        date: a.string().required(),
        studentId: a.id().required(),
        studentName: a.string().required(),
        parentPhone: a.string(),
        homeAddress: a.string(),
        location: a.ref('Location'),
        pickupLabel: a.string(), // name of the saved place the student is picked up from today
        pickupNote: a.string(), // directions for the driver
        order: a.integer().required(),
        status: a.ref('StopStatus').required(),
        etaSeconds: a.integer(),
        distanceMeters: a.integer(),
        alarmedAt: a.datetime(),
        alarmCount: a.integer().default(0),
        acknowledgedAt: a.datetime(),
        boardedAt: a.datetime(),
        droppedAt: a.datetime(),
        skippedAt: a.datetime(),
        skipReason: a.string(),
        nearNotifiedAt: a.datetime(),
      })
      .secondaryIndexes((index) => [
        index('tripId').sortKeys(['order']).queryField('listStopsByTrip'),
        index('studentId').sortKeys(['date']).queryField('listStopsByStudentAndDate'),
      ])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('schoolId').identityClaim('custom:schoolId').to(['read']), allow.groupDefinedIn('schoolId')]),
    // ───────────────────────────── messaging ─────────────────────────────
    Conversation: a
      .model({
        schoolId: a.string().required(),
        type: a.ref('ConversationType').required(),
        title: a.string().required(),
        classId: a.string(),
        busId: a.string(),
        participantIds: a.string().array(),
        memberCount: a.integer().default(0),
        lastMessageText: a.string(),
        lastMessageAt: a.datetime().required(),
        lastMessageSenderName: a.string(),
        lastMessageType: a.ref('MessageType'),
      })
      .secondaryIndexes((index) => [
        index('classId').queryField('listConversationsByClass'),
        index('busId').queryField('listConversationsByBus'),
        index('type').sortKeys(['lastMessageAt']).queryField('listConversationsByType'),
        index('schoolId').sortKeys(['lastMessageAt']).queryField('listConversationsBySchool'),
      ])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('schoolId').identityClaim('custom:schoolId').to(['read']), allow.groupDefinedIn('schoolId')]),
    ConversationMember: a
      .model({
        conversationId: a.id().required(),
        userId: a.id().required(), // the school-office seat is officeSeatId(schoolId)
        ownerId: a.string().required(), // = userId; owner auth cannot sit on the sort key
        schoolId: a.string().required(),
        role: a.string(),
        conversationType: a.ref('ConversationType').required(),
        title: a.string().required(), // what this member sees as the chat title
        subtitle: a.string(),
        avatarKey: a.string(),
        peerUserId: a.string(),
        lastReadAt: a.datetime(),
        unreadCount: a.integer().default(0),
        isViewing: a.boolean().default(false),
        lastMessageText: a.string(),
        lastMessageAt: a.datetime().required(),
        lastMessageSenderName: a.string(),
        lastMessageType: a.ref('MessageType'),
      })
      .identifier(['conversationId', 'userId'])
      .secondaryIndexes((index) => [index('userId').sortKeys(['lastMessageAt']).queryField('listMembershipsByUser')])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('ownerId').to(['read', 'update']), allow.groupDefinedIn('schoolId')]),
    Message: a
      .model({
        conversationId: a.id().required(),
        schoolId: a.string().required(),
        senderId: a.string().required(),
        senderName: a.string().required(),
        senderRole: a.ref('Role').required(),
        type: a.ref('MessageType').required(),
        text: a.string(),
        attachmentKey: a.string(),
        attachmentMeta: a.json(),
        sentAt: a.datetime().required(),
        clientId: a.string(),
        deleted: a.boolean().default(false),
      })
      .secondaryIndexes((index) => [index('conversationId').sortKeys(['sentAt']).queryField('listMessagesByConversation')])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('schoolId').identityClaim('custom:schoolId').to(['read']), allow.groupDefinedIn('schoolId')]),
    MessageReport: a
      .model({
        schoolId: a.string().required(),
        messageId: a.string().required(),
        conversationId: a.string().required(),
        reporterId: a.string().required(),
        reporterName: a.string(),
        reason: a.string(),
        messageText: a.string(),
        senderName: a.string(),
        reportedAt: a.datetime().required(),
        resolved: a.boolean().default(false),
      })
      .secondaryIndexes((index) => [index('schoolId').sortKeys(['reportedAt']).queryField('listReportsBySchool')])
      .authorization((allow) => [allow.group('OWNER'), allow.groupDefinedIn('schoolId')]),
    // ───────────────────────────── feedback & broadcasts ─────────────────────────────
    Feedback: a
      .model({
        schoolId: a.string().required(),
        studentId: a.id().required(),
        studentName: a.string().required(),
        classId: a.string(),
        className: a.string(),
        authorId: a.string().required(),
        authorName: a.string().required(),
        authorRole: a.ref('AuthorRole').required(),
        audience: a.ref('FeedbackAudience').required(),
        category: a.ref('FeedbackCategory').required(),
        rating: a.integer(),
        title: a.string().required(),
        body: a.string().required(),
        attachmentKeys: a.string().array(),
        postedAt: a.datetime().required(),
      })
      .secondaryIndexes((index) => [
        index('studentId').sortKeys(['postedAt']).queryField('listFeedbackByStudent'),
        index('authorId').sortKeys(['postedAt']).queryField('listFeedbackByAuthor'),
        index('schoolId').sortKeys(['postedAt']).queryField('listFeedbackBySchool'),
      ])
      .authorization((allow) => [allow.group('OWNER'), 
        // the student/parent sees feedback about them; teachers see what they wrote (other teachers'
        // notes about a student come through the listStudentFeedback query, which checks the class)
        allow.ownerDefinedIn('studentId').to(['read']),
        allow.ownerDefinedIn('authorId').to(['read']),
        allow.groupDefinedIn('schoolId'),
      ]),
    Broadcast: a
      .model({
        schoolId: a.string().required(),
        authorId: a.string().required(),
        authorName: a.string(),
        audience: a.ref('BroadcastAudience').required(),
        targetId: a.string().default('ALL'),
        targetName: a.string(),
        title: a.string().required(),
        body: a.string().required(),
        attachmentKeys: a.string().array(),
        postedAt: a.datetime().required(),
        recipientCount: a.integer().default(0),
        deliveryStatus: a.string().default('PENDING'),
      })
      .secondaryIndexes((index) => [
        index('audience').sortKeys(['postedAt']).queryField('listBroadcastsByAudience'),
        index('targetId').sortKeys(['postedAt']).queryField('listBroadcastsByTarget'),
        index('schoolId').sortKeys(['postedAt']).queryField('listBroadcastsBySchool'),
      ])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('schoolId').identityClaim('custom:schoolId').to(['read']), allow.groupDefinedIn('schoolId')]),
    Notification: a
      .model({
        userId: a.id().required(),
        schoolId: a.string().required(),
        type: a.ref('NotificationType').required(),
        title: a.string().required(),
        body: a.string(),
        data: a.json(),
        read: a.boolean().default(false),
        sentAt: a.datetime().required(),
      })
      .secondaryIndexes((index) => [index('userId').sortKeys(['sentAt']).queryField('listNotificationsByUser')])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('userId').to(['read', 'update'])]),
    // ───────────────────────────── courses (content arrives later) ─────────────────────────────
    Course: a
      .model({
        schoolId: a.string().required(),
        title: a.string().required(),
        description: a.string(),
        coverKey: a.string(),
        classId: a.string(),
        className: a.string(),
        published: a.boolean().default(false),
        lessonCount: a.integer().default(0),
      })
      .secondaryIndexes((index) => [
        index('schoolId').sortKeys(['title']).queryField('listCoursesBySchool'),
        index('classId').queryField('listCoursesByClass'),
      ])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('schoolId').identityClaim('custom:schoolId').to(['read']), allow.groupDefinedIn('schoolId')]),
    CourseLesson: a
      .model({
        courseId: a.id().required(),
        schoolId: a.string(),
        title: a.string().required(),
        description: a.string(),
        videoKey: a.string(),
        durationSeconds: a.integer(),
        order: a.integer().required(),
        published: a.boolean().default(false),
      })
      .secondaryIndexes((index) => [index('courseId').sortKeys(['order']).queryField('listLessonsByCourse')])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('schoolId').identityClaim('custom:schoolId').to(['read']), allow.groupDefinedIn('schoolId')]),
    CourseEnrollment: a
      .model({
        courseId: a.id().required(),
        studentId: a.id().required(),
        schoolId: a.string(),
        progress: a.float().default(0),
        enrolledAt: a.datetime().required(),
      })
      .secondaryIndexes((index) => [
        index('studentId').queryField('listEnrollmentsByStudent'),
        index('courseId').queryField('listEnrollmentsByCourse'),
      ])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('studentId').to(['read', 'update']), allow.groupDefinedIn('schoolId')]),
    // ───────────────────────────── ops ─────────────────────────────
    AuditLog: a
      .model({
        schoolId: a.string().required(),
        actorId: a.string().required(),
        actorName: a.string(),
        action: a.string().required(),
        entityType: a.string().required(),
        entityId: a.string().required(),
        before: a.json(),
        after: a.json(),
        occurredAt: a.datetime().required(),
      })
      .secondaryIndexes((index) => [
        index('schoolId').sortKeys(['occurredAt']).queryField('listAuditBySchool'),
        index('entityId').sortKeys(['occurredAt']).queryField('listAuditByEntity'),
        index('actorId').sortKeys(['occurredAt']).queryField('listAuditByActor'),
      ])
      .authorization((allow) => [allow.group('OWNER'), allow.groupDefinedIn('schoolId')]),
    ImportJob: a
      .model({
        adminId: a.string().required(),
        schoolId: a.string().required(),
        fileKey: a.string(),
        status: a.ref('ImportJobStatus').required(),
        total: a.integer().default(0),
        processed: a.integer().default(0),
        created: a.integer().default(0),
        failed: a.integer().default(0),
        results: a.json(),
        error: a.string(),
        startedAt: a.datetime().required(),
        finishedAt: a.datetime(),
      })
      .secondaryIndexes((index) => [index('adminId').sortKeys(['startedAt']).queryField('listImportJobsByAdmin')])
      .authorization((allow) => [allow.group('OWNER'), allow.groupDefinedIn('schoolId')]),
    // ───────────────────────────── custom operation result types ─────────────────────────────
    // ───────────────────────────── platform: branding & categories ─────────────────────────────
    /** Single row (id 'app'): name, logo and colours of the whole app – edited in the owner console. */
    AppConfig: a
      .model({
        appName: a.string().required(),
        appNameAr: a.string(),
        tagline: a.string(),
        taglineAr: a.string(),
        logoKey: a.string(),
        iconKey: a.string(),
        heroImageKey: a.string(),
        primaryColor: a.string(),
        accentColor: a.string(),
        heroTitle: a.string(),
        heroTitleAr: a.string(),
        heroSubtitle: a.string(),
        heroSubtitleAr: a.string(),
        announcement: a.string(),
        announcementAr: a.string(),
        supportEmail: a.string(),
        supportPhone: a.string(),
        whatsapp: a.string(),
        instagram: a.string(),
        website: a.string(),
        currency: a.string(),
        defaultCommissionPercent: a.float(),
      })
      .authorization((allow) => [allow.group('OWNER'), allow.guest().to(['read']), allow.authenticated().to(['read'])]),

    /** Explore categories (Schools, Football, Padel, …); `kind` SCHOOL | ACTIVITY. */
    Category: a
      .model({
        slug: a.string().required(),
        kind: a.string().required(),
        nameEn: a.string().required(),
        nameAr: a.string(),
        descriptionEn: a.string(),
        descriptionAr: a.string(),
        icon: a.string(),
        color: a.string(),
        imageKey: a.string(),
        order: a.integer(),
        active: a.boolean(),
      })
      .authorization((allow) => [allow.group('OWNER'), allow.guest().to(['read']), allow.authenticated().to(['read'])]),

    // ───────────────────────────── platform: activity businesses & venues ─────────────────────────────
    /** A company that lists bookable activities (football pitches, padel courts, …). */
    Business: a
      .model({
        businessId: a.id().required(),
        name: a.string().required(),
        nameLower: a.string().required(),
        directory: a.string().required(), // 'PUBLIC' | 'HIDDEN'
        status: a.ref('TenantStatus').required(),
        categoryIds: a.string().array(),
        tagline: a.string(),
        description: a.string(),
        logoKey: a.string(),
        coverKey: a.string(),
        primaryColor: a.string(),
        phone: a.string(),
        email: a.string(),
        whatsapp: a.string(),
        website: a.string(),
        instagram: a.string(),
        city: a.string(),
        area: a.string(),
        address: a.string(),
        location: a.ref('Location'),
        ownerUserId: a.string().required(),
        verified: a.boolean(),
        venueCount: a.integer(),
      })
      .identifier(['businessId'])
      .secondaryIndexes((index) => [index('directory').sortKeys(['nameLower']).queryField('listDirectoryBusinesses')])
      .authorization((allow) => [allow.group('OWNER'), allow.guest().to(['read']), allow.authenticated().to(['read']), allow.groupDefinedIn('businessId').to(['read'])]),

    /** A bookable place of a business (one pitch type / court set) with hours and pricing. */
    Venue: a
      .model({
        businessId: a.string().required(),
        businessName: a.string(),
        businessLogoKey: a.string(),
        name: a.string().required(),
        nameLower: a.string().required(),
        categoryId: a.string().required(),
        directory: a.string().required(), // 'PUBLIC' only while listed AND the business is active & public
        listed: a.boolean(), // the partner's own show/hide choice
        description: a.string(),
        photos: a.string().array(),
        city: a.string(),
        area: a.string(),
        address: a.string(),
        location: a.ref('Location'),
        amenities: a.string().array(),
        audience: a.string(), // ALL | MEN | WOMEN | KIDS | FAMILY
        indoor: a.boolean(),
        surface: a.string(),
        priceMode: a.ref('PriceMode').required(),
        price: a.float(),
        currency: a.string(),
        priceNote: a.string(),
        openingHours: a.json(), // { "0": [["08:00","23:00"]], … } weekday 0 = Sunday, Qatar time
        slotMinutes: a.integer(),
        minDurationMinutes: a.integer(),
        maxDurationMinutes: a.integer(),
        capacity: a.integer(), // bookable units at the same time (courts / pitches)
        unitLabel: a.string(),
        maxPeople: a.integer(),
        bookingMode: a.ref('BookingMode').required(),
        advanceDays: a.integer(),
        cancellationHours: a.integer(),
        rules: a.string(),
        phone: a.string(),
        whatsapp: a.string(),
        featured: a.boolean(),
        bookingCount: a.integer(),
      })
      .secondaryIndexes((index) => [
        index('directory').sortKeys(['nameLower']).queryField('listDirectoryVenues'),
        index('categoryId').sortKeys(['nameLower']).queryField('listVenuesByCategory'),
        index('businessId').sortKeys(['nameLower']).queryField('listVenuesByBusiness'),
      ])
      .authorization((allow) => [allow.group('OWNER'), allow.guest().to(['read']), allow.authenticated().to(['read']), allow.groupDefinedIn('businessId').to(['read'])]),

    /** Slot lock (venueId + date#HH:mm#unit) – written only by the booking Lambda; prevents double booking. */
    VenueSlot: a
      .model({
        venueId: a.string().required(),
        slotKey: a.string().required(),
        date: a.string().required(),
        bookingId: a.string().required(),
      })
      .identifier(['venueId', 'slotKey'])
      .secondaryIndexes((index) => [index('venueId').sortKeys(['date']).queryField('listSlotsByVenueAndDate')])
      .authorization((allow) => [allow.group('OWNER')]),

    Booking: a
      .model({
        reference: a.string().required(),
        venueId: a.string().required(),
        venueName: a.string(),
        venuePhotoKey: a.string(),
        businessId: a.string().required(),
        businessName: a.string(),
        categoryId: a.string(),
        customerId: a.string().required(),
        customerName: a.string(),
        customerPhone: a.string(),
        customerEmail: a.string(),
        date: a.string().required(),
        startTime: a.string().required(),
        endTime: a.string().required(),
        durationMinutes: a.integer().required(),
        unit: a.integer(),
        unitLabel: a.string(),
        people: a.integer(),
        price: a.float(),
        currency: a.string(),
        priceMode: a.ref('PriceMode'),
        status: a.ref('BookingStatus').required(),
        note: a.string(),
        businessNote: a.string(),
        cancelledBy: a.string(),
        respondedAt: a.datetime(),
        bookedAt: a.datetime().required(),
      })
      .secondaryIndexes((index) => [
        index('venueId').sortKeys(['date']).queryField('listBookingsByVenue'),
        index('businessId').sortKeys(['bookedAt']).queryField('listBookingsByBusiness'),
        index('businessId').sortKeys(['date']).queryField('listBookingsByBusinessAndDate'),
        index('customerId').sortKeys(['bookedAt']).queryField('listBookingsByCustomer'),
        index('reference').queryField('listBookingsByReference'),
      ])
      .authorization((allow) => [allow.group('OWNER'), allow.ownerDefinedIn('customerId').to(['read']), allow.groupDefinedIn('businessId').to(['read'])]),

    // ───────────────────────────── platform: billing (owner charges schools & businesses) ─────────────────────────────
    Plan: a
      .model({
        name: a.string().required(),
        nameAr: a.string(),
        tenantType: a.string().required(), // SCHOOL | BUSINESS | ANY
        priceMonthly: a.float(),
        priceYearly: a.float(),
        currency: a.string(),
        commissionPercent: a.float(),
        features: a.string().array(),
        featuresAr: a.string().array(),
        trialDays: a.integer(),
        active: a.boolean(),
        highlight: a.boolean(),
        order: a.integer(),
      })
      .authorization((allow) => [allow.group('OWNER'), allow.guest().to(['read']), allow.authenticated().to(['read'])]),

    /** One per tenant (school or business); `tenantId` = schoolId | businessId. */
    TenantSubscription: a
      .model({
        tenantId: a.id().required(),
        tenantType: a.string().required(), // SCHOOL | BUSINESS
        tenantName: a.string().required(),
        planId: a.string(),
        planName: a.string(),
        status: a.ref('SubscriptionStatus').required(),
        cycle: a.ref('BillingCycle'),
        price: a.float(),
        currency: a.string(),
        commissionPercent: a.float(),
        trialEndsAt: a.string(),
        currentPeriodStart: a.string(),
        currentPeriodEnd: a.string(),
        billingName: a.string(),
        billingEmail: a.string(),
        billingPhone: a.string(),
        notes: a.string(),
        startedAt: a.datetime(),
      })
      .identifier(['tenantId'])
      .authorization((allow) => [allow.group('OWNER'), allow.groupDefinedIn('tenantId').to(['read'])]),

    Invoice: a
      .model({
        number: a.string().required(),
        tenantId: a.string().required(),
        tenantType: a.string().required(),
        tenantName: a.string().required(),
        issueDate: a.string().required(),
        dueDate: a.string(),
        periodStart: a.string(),
        periodEnd: a.string(),
        items: a.json(), // [{ description, quantity, unitPrice, total }]
        subtotal: a.float(),
        discount: a.float(),
        tax: a.float(),
        total: a.float().required(),
        currency: a.string(),
        status: a.ref('InvoiceStatus').required(),
        paidAt: a.datetime(),
        paymentMethod: a.string(),
        paymentReference: a.string(),
        notes: a.string(),
      })
      .secondaryIndexes((index) => [index('tenantId').sortKeys(['issueDate']).queryField('listInvoicesByTenant')])
      .authorization((allow) => [allow.group('OWNER'), allow.groupDefinedIn('tenantId').to(['read'])]),

    /** Owner activity feed: sign-ups, new venues, bookings, billing changes (written by Lambdas). */
    PlatformEvent: a
      .model({
        feed: a.string().required(), // always 'ALL' (GSI partition)
        type: a.string().required(),
        title: a.string().required(),
        detail: a.string(),
        tenantId: a.string(),
        tenantType: a.string(),
        actorId: a.string(),
        data: a.json(),
        occurredAt: a.datetime().required(),
      })
      .secondaryIndexes((index) => [index('feed').sortKeys(['occurredAt']).queryField('listEventsByFeed')])
      .authorization((allow) => [allow.group('OWNER')]),

    CreateUserResult: a.customType({
      userId: a.string().required(),
      username: a.string().required(),
      temporaryPassword: a.string(),
      emailSent: a.boolean(),
    }),
    OkResult: a.customType({
      ok: a.boolean().required(),
      message: a.string(),
      count: a.integer(),
    }),
    PlaceResult: a.customType({
      placeId: a.string(),
      description: a.string().required(),
      lat: a.float(),
      lng: a.float(),
    }),
    PlacesResult: a.customType({
      places: a.ref('PlaceResult').array(),
    }),
    /** Reverse-geocoded address parts (Qatar: area, street, zone, building number). */
    GeocodeResult: a.customType({
      formatted: a.string(),
      title: a.string(),
      area: a.string(),
      city: a.string(),
      street: a.string(),
      zone: a.string(),
      building: a.string(),
      country: a.string(),
    }),
    SchoolAccessResult: a.customType({
      schoolId: a.string(),
      role: a.string(),
      changed: a.boolean().required(),
    }),
    AvailabilitySlot: a.customType({
      time: a.string().required(),
      endTime: a.string().required(),
      free: a.integer().required(),
      capacity: a.integer().required(),
      past: a.boolean(),
    }),
    VenueAvailability: a.customType({
      venueId: a.string().required(),
      date: a.string().required(),
      open: a.boolean().required(),
      slotMinutes: a.integer().required(),
      slots: a.ref('AvailabilitySlot').array(),
    }),
    OwnerOverview: a.customType({
      json: a.string().required(), // aggregated counters & series (see platform Lambda)
    }),
    PlatformUser: a.customType({
      username: a.string().required(),
      sub: a.string(),
      email: a.string(),
      name: a.string(),
      enabled: a.boolean(),
      status: a.string(),
      groups: a.string().array(),
      schoolId: a.string(),
      createdAt: a.string(),
    }),
    PlatformUserPage: a.customType({
      users: a.ref('PlatformUser').array(),
      nextToken: a.string(),
    }),
    ApplicationReceipt: a.customType({
      reference: a.string().required(),
      schoolName: a.string().required(),
      submittedAt: a.string().required(),
    }),
    ApplicationStatusResult: a.customType({
      reference: a.string().required(),
      schoolId: a.string().required(),
      schoolName: a.string().required(),
      studentName: a.string().required(),
      status: a.string().required(),
      submittedAt: a.string().required(),
      reviewedAt: a.string(),
      message: a.string(),
    }),
    StudentFeedbackItem: a.customType({
      id: a.string().required(),
      studentId: a.string().required(),
      studentName: a.string().required(),
      className: a.string(),
      authorId: a.string().required(),
      authorName: a.string().required(),
      authorRole: a.string().required(),
      audience: a.string().required(),
      category: a.string().required(),
      rating: a.integer(),
      title: a.string().required(),
      body: a.string().required(),
      attachmentKeys: a.string().array(),
      postedAt: a.string().required(),
    }),

    // ───────────────────────────── schools: self-service sign-up & public profile (Lambda: admin-users) ─────────────────────────────
    /** A signed-in account without a school creates one and becomes its first office admin (named
     *  registerSchool because the School model already generates createSchool). */
    registerSchool: a
      .mutation()
      .arguments({
        name: a.string().required(),
        adminName: a.string().required(),
        phone: a.string(),
        city: a.string(),
        country: a.string(),
        address: a.string(),
        lat: a.float(),
        lng: a.float(),
        timezone: a.string(),
        language: a.string(),
        logoKey: a.string(),
        profile: a.json(), // optional public profile fields (tagline, description, curriculum, …)
      })
      .returns(a.ref('SchoolAccessResult'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(adminUsers)),

    /** Repairs the caller's access after sign-in (school attribute, school-admin group, directory row). */
    syncMyAccess: a
      .mutation()
      .arguments({ note: a.string() })
      .returns(a.ref('SchoolAccessResult'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(adminUsers)),

    /** Validated save of the public directory profile (keeps SchoolSettings name/logo/location in sync). */
    saveSchoolProfile: a
      .mutation()
      .arguments({ profile: a.json().required() })
      .returns(a.ref('School'))
      .authorization((allow) => [allow.group('ADMIN')])
      .handler(a.handler.function(adminUsers)),

    // ───────────────────────────── platform (Lambda: platform) ─────────────────────────────
    /** "List my business": a signed-in account without a role creates an activity business. */
    registerBusiness: a
      .mutation()
      .arguments({ business: a.json().required() })
      .returns(a.ref('SchoolAccessResult'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(platform)),

    /** A self-signed-up account becomes a customer (books activities). */
    registerCustomer: a
      .mutation()
      .arguments({ name: a.string().required(), phone: a.string(), language: a.string() })
      .returns(a.ref('SchoolAccessResult'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(platform)),

    venueAvailability: a
      .query()
      .arguments({ venueId: a.string().required(), date: a.string().required() })
      .returns(a.ref('VenueAvailability'))
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(platform)),

    /** Sign-in with e-mail for owner/staff accounts whose username is not their e-mail (platform/signin.ts). */
    signInName: a
      .query()
      .arguments({ email: a.string().required() })
      .returns(a.string())
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(platform)),

    bookVenue: a
      .mutation()
      .arguments({
        venueId: a.string().required(),
        date: a.string().required(),
        startTime: a.string().required(),
        durationMinutes: a.integer().required(),
        people: a.integer(),
        note: a.string(),
        phone: a.string(),
      })
      .returns(a.ref('Booking'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(platform)),

    /** Customer cancels own booking, or the business cancels it. */
    cancelBooking: a
      .mutation()
      .arguments({ bookingId: a.string().required(), reason: a.string() })
      .returns(a.ref('Booking'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(platform)),

    /** Business: CONFIRMED | DECLINED | COMPLETED | NO_SHOW. */
    respondBooking: a
      .mutation()
      .arguments({ bookingId: a.string().required(), status: a.ref('BookingStatus').required(), note: a.string() })
      .returns(a.ref('Booking'))
      .authorization((allow) => [allow.groups(['PARTNER', 'OWNER'])])
      .handler(a.handler.function(platform)),

    /** Partner: save a venue (validated, denormalised, listed only when the business is active). */
    saveVenue: a
      .mutation()
      .arguments({ venue: a.json().required() })
      .returns(a.ref('Venue'))
      .authorization((allow) => [allow.groups(['PARTNER', 'OWNER'])])
      .handler(a.handler.function(platform)),

    removeVenue: a
      .mutation()
      .arguments({ venueId: a.string().required() })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.groups(['PARTNER', 'OWNER'])])
      .handler(a.handler.function(platform)),

    /** Partner: update the public business profile. */
    saveBusinessProfile: a
      .mutation()
      .arguments({ profile: a.json().required(), businessId: a.string() })
      .returns(a.ref('Business'))
      .authorization((allow) => [allow.groups(['PARTNER', 'OWNER'])])
      .handler(a.handler.function(platform)),

    ownerOverview: a
      .query()
      .returns(a.ref('OwnerOverview'))
      .authorization((allow) => [allow.group('OWNER')])
      .handler(a.handler.function(platform)),

    ownerListUsers: a
      .query()
      .arguments({ search: a.string(), nextToken: a.string() })
      .returns(a.ref('PlatformUserPage'))
      .authorization((allow) => [allow.group('OWNER')])
      .handler(a.handler.function(platform)),

    /** ENABLE | DISABLE | DELETE | RESET_PASSWORD */
    ownerUserAction: a
      .mutation()
      .arguments({ username: a.string().required(), action: a.string().required() })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.group('OWNER')])
      .handler(a.handler.function(platform)),

    /** Suspend / reactivate a school or business (hides it and blocks its workspace). */
    ownerSetTenantStatus: a
      .mutation()
      .arguments({ tenantType: a.string().required(), tenantId: a.string().required(), status: a.ref('TenantStatus').required() })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.group('OWNER')])
      .handler(a.handler.function(platform)),

    /** Permanently deletes a school or business: data, files' records, accounts and admin group. */
    ownerDeleteTenant: a
      .mutation()
      .arguments({ tenantType: a.string().required(), tenantId: a.string().required(), confirmName: a.string().required() })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.group('OWNER')])
      .handler(a.handler.function(platform)),

    // ───────────────────────────── admissions (Lambda: comms) ─────────────────────────────
    submitApplication: a
      .mutation()
      .arguments({ schoolId: a.string().required(), application: a.json().required() })
      .returns(a.ref('ApplicationReceipt'))
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(comms)),

    checkApplication: a
      .query()
      .arguments({ reference: a.string().required(), email: a.string().required() })
      .returns(a.ref('ApplicationStatusResult'))
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(comms)),

    reviewApplication: a
      .mutation()
      .arguments({ applicationId: a.string().required(), status: a.ref('ApplicationStatus').required(), note: a.string() })
      .returns(a.ref('Application'))
      .authorization((allow) => [allow.group('ADMIN')])
      .handler(a.handler.function(comms)),

    // ───────────────────────────── admin user management (Lambda: admin-users) ─────────────────────────────
    createStudent: a
      .mutation()
      .arguments({
        username: a.string().required(),
        password: a.string().required(),
        parentEmail: a.string().required(),
        fullName: a.string().required(),
        classId: a.string(),
        busId: a.string(),
        parentPhone: a.string(),
        homeAddress: a.string(),
        homeLat: a.float(),
        homeLng: a.float(),
        grade: a.string(),
      })
      .returns(a.ref('CreateUserResult'))
      .authorization((allow) => [allow.group('ADMIN')])
      .handler(a.handler.function(adminUsers)),

    createTeacher: a
      .mutation()
      .arguments({
        username: a.string().required(),
        password: a.string().required(),
        email: a.string().required(),
        fullName: a.string().required(),
        phone: a.string(),
        classIds: a.string().array(),
      })
      .returns(a.ref('CreateUserResult'))
      .authorization((allow) => [allow.group('ADMIN')])
      .handler(a.handler.function(adminUsers)),

    // Named registerBus because the Bus model already generates a createBus mutation.
    registerBus: a
      .mutation()
      .arguments({
        username: a.string().required(),
        password: a.string().required(),
        plate: a.string().required(),
        driverName: a.string().required(),
        driverPhone: a.string(),
        capacity: a.integer(),
        email: a.string(),
      })
      .returns(a.ref('CreateUserResult'))
      .authorization((allow) => [allow.group('ADMIN')])
      .handler(a.handler.function(adminUsers)),

    createStudentsBulk: a
      .mutation()
      .arguments({
        jobId: a.string().required(),
        rowsJson: a.string().required(), // JSON array of validated rows (≤ ~3000 rows / 1 MB per call)
      })
      .authorization((allow) => [allow.group('ADMIN')])
      .handler(a.handler.function(adminUsers).async()),

    resetUserPassword: a
      .mutation()
      .arguments({
        username: a.string().required(),
        newPassword: a.string().required(),
        sendEmail: a.boolean(),
        permanent: a.boolean(),
      })
      .returns(a.ref('CreateUserResult'))
      .authorization((allow) => [allow.group('ADMIN')])
      .handler(a.handler.function(adminUsers)),

    setUserEnabled: a
      .mutation()
      .arguments({ username: a.string().required(), enabled: a.boolean().required() })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.group('ADMIN')])
      .handler(a.handler.function(adminUsers)),

    deleteUser: a
      .mutation()
      .arguments({ username: a.string().required() })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.group('ADMIN')])
      .handler(a.handler.function(adminUsers)),

    updateUserContact: a
      .mutation()
      .arguments({ username: a.string().required(), email: a.string(), phone: a.string() })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.group('ADMIN')])
      .handler(a.handler.function(adminUsers)),

    assignStudents: a
      .mutation()
      .arguments({
        studentIds: a.string().array().required(),
        classId: a.string(), // '' clears
        busId: a.string(), // '' clears
      })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.group('ADMIN')])
      .handler(a.handler.function(adminUsers)),

    assignTeacher: a
      .mutation()
      .arguments({ teacherId: a.string().required(), classIds: a.string().array().required() })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.group('ADMIN')])
      .handler(a.handler.function(adminUsers)),

    // ───────────────────────────── trips (Lambda: trips) ─────────────────────────────
    startTrip: a
      .mutation()
      // lat/lng: the driver's current GPS fix – the route starts there, not at the bus's last known spot.
      .arguments({ busId: a.string().required(), type: a.ref('TripType').required(), lat: a.float(), lng: a.float() })
      .returns(a.ref('Trip'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(trips)),

    endTrip: a
      .mutation()
      .arguments({ tripId: a.string().required() })
      .returns(a.ref('Trip'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(trips)),

    computeTripRoute: a
      .mutation()
      .arguments({ tripId: a.string().required(), force: a.boolean(), lat: a.float(), lng: a.float() })
      .returns(a.ref('Trip'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(trips)),

    // Named setStopStatus because the TripStop model already generates an updateTripStop mutation.
    setStopStatus: a
      .mutation()
      .arguments({ tripStopId: a.string().required(), status: a.ref('StopStatus').required(), reason: a.string() })
      .returns(a.ref('TripStop'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(trips)),

    reorderTripStops: a
      .mutation()
      .arguments({ tripId: a.string().required(), stopIds: a.string().array().required() })
      .returns(a.ref('Trip'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(trips)),

    notifyBusNear: a
      .mutation()
      .arguments({ tripStopId: a.string().required() })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(trips)),

    searchPlaces: a
      .query()
      .arguments({ query: a.string().required(), lat: a.float(), lng: a.float(), language: a.string() })
      .returns(a.ref('PlacesResult'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(trips)),

    /** "Not going today" / "I'm going again" – also updates a running trip (stop, route, driver). */
    setDayStatus: a
      .mutation()
      .arguments({ date: a.string().required(), status: a.ref('DayStatus').required(), note: a.string(), untilDate: a.string() })
      .returns(a.ref('StudentDayStatus').array())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(trips)),

    reverseGeocode: a
      .query()
      .arguments({ lat: a.float().required(), lng: a.float().required(), language: a.string() })
      .returns(a.ref('GeocodeResult'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(trips)),

    /**
     * Sets the pickup point: an existing saved place (placeId), a new one (newPlace + details) or
     * plain coordinates (onboarding, school office, older apps). Moves today's stop on an active trip,
     * re-routes the bus and tells the driver.
     */
    updateHomeLocation: a
      .mutation()
      .arguments({
        lat: a.float().required(),
        lng: a.float().required(),
        address: a.string(),
        userId: a.string(),
        placeId: a.string(),
        newPlace: a.boolean(),
        label: a.string(),
        kind: a.string(),
        note: a.string(),
        area: a.string(),
        city: a.string(),
        street: a.string(),
        zone: a.string(),
        building: a.string(),
      })
      .returns(a.ref('Profile'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(trips)),

    // ───────────────────────────── alarm (Lambda: alarm) ─────────────────────────────
    alarmStudent: a
      .mutation()
      .arguments({ tripStopId: a.string().required() })
      .returns(a.ref('TripStop'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(alarm)),

    acknowledgeAlarm: a
      .mutation()
      .arguments({ tripStopId: a.string().required() })
      .returns(a.ref('TripStop'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(alarm)),

    /** "I'm coming" from the alarm notification on a phone that is signed out (token from the push). */
    acknowledgeAlarmWithToken: a
      .mutation()
      .arguments({ tripStopId: a.string().required(), expires: a.integer().required(), token: a.string().required() })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(alarm)),

    testAlarm: a
      .mutation()
      .arguments({ note: a.string() })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(alarm)),

    // ───────────────────────────── comms (Lambda: comms) ─────────────────────────────
    sendMessage: a
      .mutation()
      .arguments({
        conversationId: a.string().required(),
        type: a.ref('MessageType').required(),
        text: a.string(),
        attachmentKey: a.string(),
        attachmentMeta: a.json(),
        clientId: a.string(),
      })
      .returns(a.ref('Message'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(comms)),

    openDirectConversation: a
      .mutation()
      .arguments({ otherUserId: a.string().required() })
      .returns(a.ref('Conversation'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(comms)),

    openOfficeConversation: a
      .mutation()
      .arguments({ userId: a.string() }) // admins pass the target user; others open their own
      .returns(a.ref('Conversation'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(comms)),

    reportMessage: a
      .mutation()
      .arguments({ messageId: a.string().required(), reason: a.string() })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(comms)),

    submitFeedback: a
      .mutation()
      .arguments({
        studentIds: a.string().array().required(),
        audience: a.ref('FeedbackAudience').required(),
        category: a.ref('FeedbackCategory').required(),
        rating: a.integer(),
        title: a.string().required(),
        body: a.string().required(),
        attachmentKeys: a.string().array(),
      })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.groups(['TEACHER', 'ADMIN'])])
      .handler(a.handler.function(comms)),

    /** Feedback history of one student for the teachers of that student's class (and the office). */
    listStudentFeedback: a
      .query()
      .arguments({ studentId: a.string().required() })
      .returns(a.ref('StudentFeedbackItem').array())
      .authorization((allow) => [allow.groups(['TEACHER', 'ADMIN'])])
      .handler(a.handler.function(comms)),

    sendBroadcast: a
      .mutation()
      .arguments({ broadcastId: a.string().required() })
      .authorization((allow) => [allow.group('ADMIN')])
      .handler(a.handler.function(comms).async()),

    sendPush: a
      .mutation()
      .arguments({
        userIds: a.string().array().required(),
        title: a.string().required(),
        body: a.string().required(),
        data: a.json(),
      })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.group('ADMIN')])
      .handler(a.handler.function(comms)),

    /** Registers this phone's push token for the caller and detaches it from anyone who used the phone before. */
    registerDevice: a
      .mutation()
      .arguments({ expoPushToken: a.string().required(), platform: a.string().required(), deviceName: a.string() })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(comms)),

    updateMyProfile: a
      .mutation()
      .arguments({ avatarKey: a.string(), language: a.string(), phone: a.string(), parentPhone: a.string() })
      .returns(a.ref('Profile'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(comms)),

    requestDataDeletion: a
      .mutation()
      .arguments({ reason: a.string() })
      .returns(a.ref('OkResult'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(comms)),
  })
  .authorization((allow) => [
    allow.resource(adminUsers).to(['query', 'mutate']),
    allow.resource(trips).to(['query', 'mutate']),
    allow.resource(alarm).to(['query', 'mutate']),
    allow.resource(comms).to(['query', 'mutate']),
    allow.resource(platform).to(['query', 'mutate']),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
