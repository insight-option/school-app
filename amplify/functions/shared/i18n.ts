/** Tiny bilingual strings for server-generated notifications (push text is rendered by the OS). */
export type Lang = 'en' | 'ar';

const strings = {
  en: {
    alarmTitle: '🚌 The bus is here!',
    alarmBody: 'Your bus is waiting — come out now',
    testAlarmTitle: '🔔 Test alarm',
    testAlarmBody: 'This is how the bus alarm sounds. Tap to open.',
    busNearTitle: '🚌 Bus is near',
    busNearBody: (min: number) => `Your bus is about ${min} min away. Get ready!`,
    boardedTitle: '✅ Boarded the bus',
    boardedBody: (name: string, time: string) => `${name} boarded the bus at ${time}.`,
    droppedTitle: '🏠 Dropped off',
    droppedBody: (name: string, time: string) => `${name} was dropped off at ${time}.`,
    feedbackTitle: (category: string) => `New feedback · ${category}`,
    broadcastTitle: (title: string) => `📢 ${title}`,
    previewVoice: '🎤 Voice note',
    previewImage: '📷 Photo',
    previewVideo: '🎬 Video',
    previewFile: '📎 File',
    homeChanged: 'Home location changed',
    homeChangedBody: (name: string) => `${name} updated their home location.`,
    reportTitle: 'Message reported',
    reportBody: (name: string) => `${name} reported a message. Open the office inbox to review it.`,
    applicationTitle: '📝 New application',
    applicationBody: (student: string, grade: string | null | undefined) => `${student}${grade ? ` · ${grade}` : ''} applied online.`,
    deletionTitle: 'Data deletion request',
    deletionBody: (name: string) => `${name} requested deletion of their data.`,
    tripStartedMorningTitle: '🚌 Your bus is on the way',
    tripStartedMorningBody: (driver: string, min: number | null) =>
      min ? `${driver} started the morning trip. Pickup in about ${min} min – track the bus live.` : `${driver} started the morning trip. Track the bus live.`,
    tripStartedAfternoonTitle: '🚌 Heading home',
    tripStartedAfternoonBody: (driver: string) => `${driver} started the trip home. Track the bus live.`,
    tripNoHomeTitle: '📍 Pickup point missing',
    tripNoHomeBody: 'The bus has started but you have no pickup location yet. Set it in the app so the driver can come to you.',
    arrivedSchoolTitle: '🏫 Arrived at school',
    arrivedSchoolBody: (name: string, time: string) => `${name} arrived at school at ${time}.`,
    riderAbsentTitle: (name: string) => `${name} is not riding today`,
    riderAbsentBody: 'The stop was removed from your route.',
    riderBackTitle: (name: string) => `${name} is riding again`,
    riderBackBody: 'The stop was added back to your route.',
    pickupMovedTitle: (name: string) => `📍 ${name} changed the pickup point`,
    pickupMovedBody: (place: string) => `New pickup: ${place}. Your route was updated.`,
  },
  ar: {
    alarmTitle: '🚌 وصلت الحافلة!',
    alarmBody: 'الحافلة بانتظارك — اخرج الآن',
    testAlarmTitle: '🔔 تجربة المنبّه',
    testAlarmBody: 'هكذا يبدو منبّه الحافلة. اضغط للفتح.',
    busNearTitle: '🚌 الحافلة قريبة',
    busNearBody: (min: number) => `تصل الحافلة خلال ${min} دقيقة تقريبًا. استعد!`,
    boardedTitle: '✅ صعد إلى الحافلة',
    boardedBody: (name: string, time: string) => `صعد ${name} إلى الحافلة في ${time}.`,
    droppedTitle: '🏠 تم الإنزال',
    droppedBody: (name: string, time: string) => `تم إنزال ${name} في ${time}.`,
    feedbackTitle: (category: string) => `ملاحظة جديدة · ${category}`,
    broadcastTitle: (title: string) => `📢 ${title}`,
    previewVoice: '🎤 رسالة صوتية',
    previewImage: '📷 صورة',
    previewVideo: '🎬 فيديو',
    previewFile: '📎 ملف',
    homeChanged: 'تم تغيير موقع المنزل',
    homeChangedBody: (name: string) => `قام ${name} بتحديث موقع المنزل.`,
    reportTitle: 'تم الإبلاغ عن رسالة',
    reportBody: (name: string) => `أبلغ ${name} عن رسالة. افتح صندوق المكتب لمراجعتها.`,
    applicationTitle: '📝 طلب التحاق جديد',
    applicationBody: (student: string, grade: string | null | undefined) => `قدّم ${student}${grade ? ` · ${grade}` : ''} طلبًا إلكترونيًا.`,
    deletionTitle: 'طلب حذف البيانات',
    deletionBody: (name: string) => `طلب ${name} حذف بياناته.`,
    tripStartedMorningTitle: '🚌 الحافلة في الطريق إليك',
    tripStartedMorningBody: (driver: string, min: number | null) =>
      min ? `بدأ ${driver} رحلة الصباح. تصل إليك خلال ${min} دقيقة تقريبًا – تابع الحافلة مباشرة.` : `بدأ ${driver} رحلة الصباح. تابع الحافلة مباشرة.`,
    tripStartedAfternoonTitle: '🚌 في الطريق إلى المنزل',
    tripStartedAfternoonBody: (driver: string) => `بدأ ${driver} رحلة العودة. تابع الحافلة مباشرة.`,
    tripNoHomeTitle: '📍 موقع الاستلام غير محدد',
    tripNoHomeBody: 'بدأت الحافلة رحلتها ولم تحدد موقع الاستلام بعد. حدده في التطبيق ليصل إليك السائق.',
    arrivedSchoolTitle: '🏫 الوصول إلى المدرسة',
    arrivedSchoolBody: (name: string, time: string) => `وصل ${name} إلى المدرسة في ${time}.`,
    riderAbsentTitle: (name: string) => `${name} لن يركب اليوم`,
    riderAbsentBody: 'أُزيلت المحطة من مسارك.',
    riderBackTitle: (name: string) => `${name} سيركب مجددًا`,
    riderBackBody: 'أُعيدت المحطة إلى مسارك.',
    pickupMovedTitle: (name: string) => `📍 غيّر ${name} موقع الاستلام`,
    pickupMovedBody: (place: string) => `الاستلام الجديد: ${place}. تم تحديث المسار.`,
  },
} as const;

export type ServerStrings = (typeof strings)['en'];

export function t(lang: string | null | undefined): ServerStrings {
  return (lang === 'ar' ? strings.ar : strings.en) as ServerStrings;
}

export function formatTime(iso: string, timeZone: string | null | undefined, lang: string | null | undefined) {
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit', timeZone: timeZone || 'UTC' }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(11, 16);
  }
}
