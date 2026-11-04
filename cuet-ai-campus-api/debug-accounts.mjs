const API = 'http://localhost:3000/api/v1';

async function login(email) {
  const res = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Campus123' }),
  });
  const j = await res.json();
  if (!j.success) throw new Error(email + ': ' + j.message);
  return { token: j.data.token, user: j.data.user };
}

async function main() {
  const accounts = [
    'u2204001@student.cuet.ac.bd',
    'u2204002@student.cuet.ac.bd',
    'u2204037@student.cuet.ac.bd',
    'coordinator@cuet.ac.bd',
  ];
  for (const email of accounts) {
    const { token, user } = await login(email);
    const headers = { Authorization: 'Bearer ' + token };
    const meRes = await fetch(API + '/auth/me', { headers });
    const me = (await meRes.json()).data;
    const secRes = await fetch(API + '/calendar/day?date=2026-11-08', { headers });
    const day = (await secRes.json()).data;
    console.log('\n=== ' + email + ' (' + JSON.stringify(user.roles) + ') ===');
    console.log('sectionId:', me.sectionId?._id || me.sectionId, '| name:', me.sectionId?.name);
    console.log('classes:', day?.classes?.length);
    for (const c of day?.classes || []) {
      console.log('  -', c.classType, '|', c.course?.code || c.courseId, '|', c.startTime + '-' + c.endTime, '| room', c.room, '| status', c.status, '| source', c.source);
    }
    console.log('activeOverrides:', day?.activeOverrides?.length);
  }
}

main().catch((e) => console.error('ERROR:', e.message));
