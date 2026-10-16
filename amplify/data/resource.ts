import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { adminUsers } from '../functions/admin-users/resource';
import { trips } from '../functions/trips/resource';
import { alarm } from '../functions/alarm/resource';
import { comms } from '../functions/comms/resource';

/**
 * School system schema.
 *
 * Design rules (see PERFORMANCE.md):
 *  - every list access pattern has a secondary index; the client never calls a bare `list()` on a
 *    growing table;
 *  - display fields (names, plates, class names) are denormalised onto child records;
 *  - STUDENT / TEACHER / DRIVER can read what they need and *create* only where the product says so;
 *    every other write goes through a Lambda-backed custom mutation that validates the caller;
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
    Role: a.enum(['ADMIN', 'TEACHER', 'DRIVER', 'STUDENT']),
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
    NotificationType: a.enum(['ALARM', 'MESSAGE', 'FEEDBACK', 'BROADCAST', 'BUS_NEAR', 'BOARDED', 'DROPPED', 'SYSTEM']),
    ImportJobStatus: a.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']),

    // ───────────────────────────── school ─────────────────────────────
    SchoolSettings: a
      .model({
        schoolId: a.id().required(),
        name: a.string().required(),
        logoKey: a.string(),
        primaryColor: a.string(),
        address: a.string(),
        schoolLocation: a.ref('Location'),
        timezone: a.string().default('Asia/Riyadh'),
        defaultLanguage: a.string().default('en'),
        morningTripStart: a.string().default('06:30'),
        afternoonTripStart: a.string().default('13:30'),
        studentChatEnabled: a.boolean().default(true),
        alarmRepeatSeconds: a.integer().default(20),
        alarmMaxRepeats: a.integer().default(5),
        senderEmail: a.string(),
      })
      .identifier(['schoolId'])
      .authorization((allow) => [allow.authenticated().to(['read']), allow.group('ADMIN')]),

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
        homeLocation: a.ref('Location'),
        homeAddress: a.string(),
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
      ])
      .authorization((allow) => [allow.authenticated().to(['read']), allow.group('ADMIN')]),

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
      .authorization((allow) => [allow.ownerDefinedIn('userId'), allow.group('ADMIN')]),

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
      .authorization((allow) => [allow.authenticated().to(['read']), allow.group('ADMIN')]),

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
      .authorization((allow) => [allow.authenticated().to(['read']), allow.group('ADMIN')]),

    // One row per bus, updated in place by the driver device.
    BusLocation: a
      .model({
        busId: a.id().required(),
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
      .authorization((allow) => [
        allow.authenticated().to(['read']),
        allow.ownerDefinedIn('driverUserId').to(['read', 'update']),
        allow.group('ADMIN'),
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
      ])
      .authorization((allow) => [
        allow.ownerDefinedIn('ownerId').to(['create', 'update', 'read']),
        allow.groups(['TEACHER', 'DRIVER']).to(['read']),
        allow.group('ADMIN'),
      ]),

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
      ])
      .authorization((allow) => [allow.authenticated().to(['read']), allow.group('ADMIN')]),

    TripStop: a
      .model({
        tripId: a.id().required(),
        busId: a.string().required(),
        date: a.string().required(),
        studentId: a.id().required(),
        studentName: a.string().required(),
        parentPhone: a.string(),
        homeAddress: a.string(),
        location: a.ref('Location'),
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
      .authorization((allow) => [allow.authenticated().to(['read']), allow.group('ADMIN')]),

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
      ])
      .authorization((allow) => [allow.authenticated().to(['read']), allow.group('ADMIN')]),

    ConversationMember: a
      .model({
        conversationId: a.id().required(),
        userId: a.id().required(), // 'OFFICE' for the shared school-office seat
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
      .authorization((allow) => [allow.ownerDefinedIn('ownerId').to(['read', 'update']), allow.group('ADMIN')]),

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
      .authorization((allow) => [allow.authenticated().to(['read']), allow.group('ADMIN')]),

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
      .authorization((allow) => [allow.group('ADMIN')]),

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
      .authorization((allow) => [
        allow.ownerDefinedIn('studentId').to(['read']),
        allow.group('TEACHER').to(['read']),
        allow.group('ADMIN'),
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
      .authorization((allow) => [allow.authenticated().to(['read']), allow.group('ADMIN')]),

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
      .authorization((allow) => [allow.ownerDefinedIn('userId').to(['read', 'update']), allow.group('ADMIN')]),

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
      .authorization((allow) => [allow.authenticated().to(['read']), allow.group('ADMIN')]),

    CourseLesson: a
      .model({
        courseId: a.id().required(),
        title: a.string().required(),
        description: a.string(),
        videoKey: a.string(),
        durationSeconds: a.integer(),
        order: a.integer().required(),
        published: a.boolean().default(false),
      })
      .secondaryIndexes((index) => [index('courseId').sortKeys(['order']).queryField('listLessonsByCourse')])
      .authorization((allow) => [allow.authenticated().to(['read']), allow.group('ADMIN')]),

    CourseEnrollment: a
      .model({
        courseId: a.id().required(),
        studentId: a.id().required(),
        progress: a.float().default(0),
        enrolledAt: a.datetime().required(),
      })
      .secondaryIndexes((index) => [
        index('studentId').queryField('listEnrollmentsByStudent'),
        index('courseId').queryField('listEnrollmentsByCourse'),
      ])
      .authorization((allow) => [allow.ownerDefinedIn('studentId').to(['read', 'update']), allow.group('ADMIN')]),

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
      .authorization((allow) => [allow.group('ADMIN')]),

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
      .authorization((allow) => [allow.group('ADMIN')]),

    // ───────────────────────────── custom operation result types ─────────────────────────────
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
      .arguments({ busId: a.string().required(), type: a.ref('TripType').required() })
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
      .arguments({ tripId: a.string().required(), force: a.boolean() })
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
      .arguments({ query: a.string().required(), lat: a.float(), lng: a.float() })
      .returns(a.ref('PlacesResult'))
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

    updateMyProfile: a
      .mutation()
      .arguments({ avatarKey: a.string(), language: a.string(), phone: a.string(), parentPhone: a.string() })
      .returns(a.ref('Profile'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(comms)),

    updateHomeLocation: a
      .mutation()
      .arguments({ lat: a.float().required(), lng: a.float().required(), address: a.string(), userId: a.string() })
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
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
