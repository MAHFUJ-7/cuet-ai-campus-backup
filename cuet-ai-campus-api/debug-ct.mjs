import { MongoClient } from 'mongodb';

const client = new MongoClient('mongodb://127.0.0.1:27017/cuet_ai_campus');
await client.connect();
const db = client.db('cuet_ai_campus');

const overrides = await db.collection('scheduleoverrides').find({}).toArray();
console.log('Total overrides:', overrides.length);
for (const o of overrides) {
  console.log(JSON.stringify({
    id: String(o._id),
    type: o.type,
    classType: o.classType,
    specificDate: o.specificDate,
    startDate: o.startDate,
    endDate: o.endDate,
    startTime: o.startTime,
    endTime: o.endTime,
    courseId: String(o.courseId || ''),
    sectionId: String(o.sectionId || ''),
    status: o.status,
    declaredBy: String(o.declaredBy || ''),
    createdAt: o.createdAt,
  }));
}

console.log('\n--- Nov 8 2026 overrides ---');
const nov8 = await db.collection('scheduleoverrides').find({ specificDate: '2026-11-08' }).toArray();
console.log('Count:', nov8.length);
nov8.forEach(o => console.log(JSON.stringify(o)));

console.log('\n--- Users ---');
const users = await db.collection('users').find({}).toArray();
users.forEach(u => console.log(u.email, '| roles:', JSON.stringify(u.roles), '| sectionId:', String(u.sectionId || '')));

console.log('\n--- Sections ---');
const sections = await db.collection('sections').find({}).toArray();
sections.forEach(s => console.log(String(s._id), s.name, s.label));

console.log('\n--- CT routine slots ---');
const cts = await db.collection('routineentries').find({ classType: 'ct' }).toArray();
cts.forEach(r => console.log('section', String(r.sectionId), '| day', r.day, '| period', r.period, '| ', r.startTime, '-', r.endTime));

await client.close();
