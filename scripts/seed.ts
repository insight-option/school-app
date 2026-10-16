/* eslint-disable no-console */
/**
 * Demo data: 1 school (with logo), 3 classes, 3 teachers, 2 buses, 24 students with home pins
 * spread around the school, today's statuses (3 × NOT_GOING), messages, feedback and a broadcast.
 *
 *   SEED_EMAIL=you@example.com npm run seed
 *
 * SEED_EMAIL receives every credential e-mail via plus-addressing (you+s001@example.com …). Without
 * it, parents get `.invalid` addresses (no e-mail is delivered) – the printed passwords still work.
 * Everything goes through the real admin mutations, so this doubles as an end-to-end backend test.
 * Re-running is safe: existing IDs are skipped.
 */
import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { uploadData } from 'aws-amplify/storage';
import { dataClient, ensureCognitoUser, loadOutputs, log, must, signInAs, sleep } from './lib';

const SCHOOL = { lat: 24.7136, lng: 46.6753 }; // Riyadh – change to your school
const ADMIN = { username: 'ADMIN-01', password: 'Admin#2026' };
const TEMP_PASSWORD = 'Welcome#2026'; // students & teachers must change it on first login
const DRIVER_PASSWORD = 'Driver#2026';
const seedEmail = process.env.SEED_EMAIL;
const emailFor = (tag: string) => {
  if (!seedEmail) return `${tag}@seed.invalid`;
  const [user, domain] = seedEmail.split('@');
  return `${user}+${tag}@${domain}`;
};

const FIRST = ['Sara', 'Omar', 'Lina', 'Yousef', 'Maha', 'Khalid', 'Noor', 'Faisal', 'Reem', 'Hamza', 'Dana', 'Tariq', 'Layla', 'Majed', 'Hana', 'Saud', 'Aisha', 'Ziad', 'Rana', 'Nasser', 'Jana', 'Bader', 'Mariam', 'Sultan'];
const LAST = ['Al-Harbi', 'Al-Qahtani', 'Al-Otaibi', 'Al-Dossari', 'Al-Shehri', 'Al-Ghamdi', 'Al-Zahrani', 'Al-Mutairi'];

/** Pseudo-random but deterministic offsets so re-runs give the same map. */
function offset(i: number): { lat: number; lng: number } {
  const a = (i * 137.508 * Math.PI) / 180; // golden angle spiral
  const r = 0.006 + 0.004 * Math.sqrt(i + 1); // ~0.7–3.5 km
  return { lat: SCHOOL.lat + Math.sin(a) * r, lng: SCHOOL.lng + Math.cos(a) * r * 1.1 };
}

async function main() {
  const outputs = loadOutputs();
  const schoolId = outputs.custom?.schoolId ?? 'default';

  // 1. Admin (Cognito directly – everything else goes through the app's mutations).
  const admin = await ensureCognitoUser(outputs, { ...ADMIN, email: emailFor('admin'), name: 'School Office', group: 'ADMIN', schoolId });
  log(admin.created ? 'Admin created' : 'Admin exists', ADMIN.username);
  const signedIn = await signInAs(ADMIN.username, ADMIN.password);
  if (!signedIn.ok) throw new Error(`admin sign-in failed: ${signedIn.step}`);
  const client = dataClient();
  if (!(await client.models.Profile.get({ userId: admin.sub })).data) {
    must(await client.models.Profile.create({ userId: admin.sub, username: ADMIN.username, role: 'ADMIN', schoolId, fullName: 'School Office', email: emailFor('admin'), isActive: true, language: 'en' }), 'admin profile');
  }

  // 2. School settings + logo
  let logoKey: string | undefined;
  try {
    const logo = readFileSync(resolve(process.cwd(), 'assets/images/school-logo-placeholder.png'));
    logoKey = 'school/branding/logo.png';
    await uploadData({ path: logoKey, data: logo, options: { contentType: 'image/png' } }).result;
    log('Logo uploaded');
  } catch (e) {
    console.warn('logo upload skipped', (e as Error).message);
  }
  const settingsInput = { schoolId, name: 'Al Noor International School', logoKey, primaryColor: '#2563EB', address: 'King Fahd Rd, Riyadh', schoolLocation: SCHOOL, timezone: 'Asia/Riyadh', defaultLanguage: 'en', morningTripStart: '06:30', afternoonTripStart: '13:30', studentChatEnabled: true, alarmRepeatSeconds: 20, alarmMaxRepeats: 5 };
  const existingSettings = await client.models.SchoolSettings.get({ schoolId });
  must(existingSettings.data ? await client.models.SchoolSettings.update(settingsInput) : await client.models.SchoolSettings.create(settingsInput), 'settings');
  log('School settings saved');

  // 3. Classes
  const classDefs = [
    { name: '3A', grade: '3' },
    { name: '4B', grade: '4' },
    { name: '5C', grade: '5' },
  ];
  const existingClasses = (await client.models.Class.listClassesBySchool({ schoolId }, { limit: 100 })).data;
  const classes = [] as { id: string; name: string }[];
  for (const def of classDefs) {
    const found = existingClasses.find((c) => c.name === def.name);
    const cls = found ?? must(await client.models.Class.create({ schoolId, name: def.name, grade: def.grade, studentCount: 0 }), 'class');
    classes.push({ id: cls.id, name: cls.name });
  }
  log('Classes', classes.map((c) => c.name));

  // 4. Buses (drivers)
  const busDefs = [
    { username: 'BUS-01', plate: 'RUH 4521', driverName: 'Abu Khalid', driverPhone: '+966500000101', capacity: 20 },
    { username: 'BUS-02', plate: 'RUH 7788', driverName: 'Abu Saleh', driverPhone: '+966500000102', capacity: 20 },
  ];
  for (const b of busDefs) {
    const exists = await client.models.Bus.get({ busId: b.username });
    if (exists.data) continue;
    const res = await client.mutations.registerBus({ ...b, password: DRIVER_PASSWORD });
    if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '));
    log('Bus created', b.username);
  }

  // 5. Teachers
  const teacherDefs = [
    { username: 'T-1001', fullName: 'Ms. Huda Al-Amri', classIds: [classes[0].id] },
    { username: 'T-1002', fullName: 'Mr. Sami Al-Rashid', classIds: [classes[1].id] },
    { username: 'T-1003', fullName: 'Ms. Nadia Al-Fahad', classIds: [classes[2].id] },
  ];
  for (const tdef of teacherDefs) {
    const existing = (await client.models.Profile.listProfilesByUsername({ username: tdef.username }, { limit: 1 })).data[0];
    if (existing) continue;
    const res = await client.mutations.createTeacher({ username: tdef.username, password: TEMP_PASSWORD, email: emailFor(tdef.username.toLowerCase()), fullName: tdef.fullName, phone: '+96650000020' + tdef.username.slice(-1), classIds: tdef.classIds });
    if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '));
    log('Teacher created', tdef.username);
  }

  // 6. Students (24) – 8 per class, alternating buses
  const studentIds: { userId: string; username: string; fullName: string; classId: string; busId: string }[] = [];
  for (let i = 0; i < 24; i++) {
    const username = `S-${String(1001 + i)}`;
    const fullName = `${FIRST[i]} ${LAST[i % LAST.length]}`;
    const cls = classes[Math.floor(i / 8)];
    const busId = busDefs[i % 2].username;
    const home = offset(i);
    const existing = (await client.models.Profile.listProfilesByUsername({ username }, { limit: 1 })).data[0];
    if (existing) {
      studentIds.push({ userId: existing.userId, username, fullName, classId: cls.id, busId });
      continue;
    }
    const res = await client.mutations.createStudent({
      username,
      password: TEMP_PASSWORD,
      parentEmail: emailFor(username.toLowerCase()),
      fullName,
      classId: cls.id,
      busId,
      parentPhone: `+9665000003${String(i).padStart(2, '0')}`,
      homeAddress: `House ${10 + i}, District ${1 + (i % 6)}, Riyadh`,
      homeLat: home.lat,
      homeLng: home.lng,
      grade: cls.name[0],
    });
    if (res.errors?.length) throw new Error(`${username}: ${res.errors.map((e) => e.message).join('; ')}`);
    studentIds.push({ userId: res.data!.userId, username, fullName, classId: cls.id, busId });
    log('Student created', `${username} ${fullName}`);
    await sleep(150); // be gentle with Cognito's AdminCreateUser rate limit
  }

  // 7. Today's statuses: 3 students not going
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
  for (const s of studentIds.slice(0, 3)) {
    const existing = await client.models.StudentDayStatus.get({ studentId: s.userId, date: today });
    if (existing.data) continue;
    must(await client.models.StudentDayStatus.create({ studentId: s.userId, date: today, ownerId: s.userId, busId: s.busId, schoolId, studentName: s.fullName, status: 'NOT_GOING', note: 'Doctor appointment', setBy: admin.sub }), 'day status');
  }
  log('Day statuses set (3 × NOT_GOING)');

  // 8. Sample messages (office → class group, office → a parent)
  const classGroup = `class_${classes[0].id}`;
  const existingMsgs = await client.models.Message.listMessagesByConversation({ conversationId: classGroup }, { limit: 1 });
  if (!existingMsgs.data.length) {
    await client.mutations.sendMessage({ conversationId: classGroup, type: 'TEXT', text: 'Welcome to the 3A class group! 📚 Trip updates and announcements will be posted here.', clientId: 'seed-1' });
    const office = must(await client.mutations.openOfficeConversation({ userId: studentIds[0].userId }), 'office conversation');
    await client.mutations.sendMessage({ conversationId: office.id, type: 'TEXT', text: `Hello! This is the school office. Reply here any time you need help with the bus.`, clientId: 'seed-2' });
    log('Sample messages sent');
  }

  // 9. Feedback (office as author)
  const fb = await client.models.Feedback.listFeedbackByStudent({ studentId: studentIds[1].userId }, { limit: 1 });
  if (!fb.data.length) {
    await client.mutations.submitFeedback({ studentIds: [studentIds[1].userId, studentIds[2].userId], audience: 'PARENT', category: 'PRAISE', rating: 5, title: 'Great participation this week', body: 'Excellent effort in the science project – keep it up!', attachmentKeys: [] });
    await client.mutations.submitFeedback({ studentIds: [studentIds[4].userId], audience: 'BOTH', category: 'ATTENDANCE', title: 'Late arrival', body: 'Arrived 15 minutes late twice this week. Please make sure the bus pickup is on time.', attachmentKeys: [] });
    log('Feedback created');
  }

  // 10. Broadcast
  const bc = await client.models.Broadcast.listBroadcastsBySchool({ schoolId }, { limit: 1 });
  if (!bc.data.length) {
    const created = must(await client.models.Broadcast.create({ schoolId, authorId: admin.sub, authorName: 'School Office', audience: 'ALL_STUDENTS', targetId: 'ALL', title: 'Early dismissal on Thursday', body: 'School ends at 12:00 on Thursday. Afternoon buses leave at 12:15.', attachmentKeys: [], postedAt: new Date().toISOString(), recipientCount: 0, deliveryStatus: 'PENDING' }), 'broadcast');
    await client.mutations.sendBroadcast({ broadcastId: created.id });
    log('Broadcast sent');
  }

  const demo = {
    admin: { id: ADMIN.username, password: ADMIN.password },
    teacher: { id: 'T-1001', temporaryPassword: TEMP_PASSWORD },
    driver: { id: 'BUS-01', password: DRIVER_PASSWORD },
    student: { id: 'S-1001', temporaryPassword: TEMP_PASSWORD, parentEmail: emailFor('s-1001') },
  };
  writeFileSync(resolve(process.cwd(), 'seed-output.json'), JSON.stringify(demo, null, 2));
  console.log('\n══════════ DEMO LOGINS ══════════');
  console.log(`School office (web):   ID ${demo.admin.id}            password ${demo.admin.password}`);
  console.log(`Teacher:               ID ${demo.teacher.id}             temporary password ${demo.teacher.temporaryPassword} (forced change on first login)`);
  console.log(`Bus driver (tablet):   ID ${demo.driver.id}             password ${demo.driver.password}`);
  console.log(`Parent/Student:        ID ${demo.student.id}             temporary password ${demo.student.temporaryPassword} (forced change, then set home location)`);
  console.log(`Credential e-mails:    ${seedEmail ? `sent to ${seedEmail} (+tag addresses)` : 'not sent (set SEED_EMAIL to receive them)'}`);
  console.log('══════════════════════════════════\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
