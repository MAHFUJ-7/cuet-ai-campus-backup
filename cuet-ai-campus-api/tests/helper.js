import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { seedDatabase } from '../src/seed/seed.js';

let mongod;

export async function setupDatabase() {
  mongod = await MongoMemoryServer.create({ instance: { port: 0 } });
  const uri = mongod.getUri();
  await connectDB(uri);
  await seedDatabase({ clear: true });
  return uri;
}

export async function teardownDatabase() {
  try {
    await disconnectDB();
  } catch {
    /* ignore */
  }
  if (mongod) await mongod.stop();
}
