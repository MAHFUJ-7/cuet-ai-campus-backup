import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

const uri = 'mongodb://127.0.0.1:27017/cuet_ai_campus';
const client = new MongoClient(uri);

async function main() {
    try {
        await client.connect();
        const db = client.db('cuet_ai_campus');
        
        // Find CR user (u2204002@student.cuet.ac.bd)
        const users = await db.collection('users').find({}).toArray();
        const crUser = users.find(u => u.email === 'u2204002@student.cuet.ac.bd');
        if (!crUser) {
            console.error('CR user not found');
            return;
        }
        
        // Find Section A
        const sections = await db.collection('sections').find({ name: 'Section A' }).toArray();
        if (!sectionDoc) {
            console.error('Section A not found');
            return;
        }
        
        // Create event
        const event = await db.collection('updates').insertOne({
          authorId: crUser._id,
          sectionId: sectionDoc._id,
          courseId: '6ae30e9b34a8f6c45ec54a83', // CSE-300
          type: 'event',
          title: 'CSE Department Career Talk',
          description: 'Join the CSE Department\'s Career Talk session to learn about internship and job opportunities from alumni working at top tech companies. RSVP recommended.',
          eventDateTime: '2026-11-15T16:00:00',
          eventLocation: 'Main Auditorium',
          scope: 'section',
          priority: 'normal',
          status: 'approved',
        });
        
        console.log('✅ Created demo event:', {
          title: 'CSE Department Career Talk',
          status: 'approved',
          directPublish: true // This should work since CR_DIRECT_PUBLISH = true
        });
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    } finally {
        await client.close();
    }
}

main();