// Read-only database viewer — prints collections and documents as terminal tables.
//
//   node db-view.mjs                  list every collection with its document count
//   node db-view.mjs users            show documents from one collection
//   node db-view.mjs users courses    show several collections
//   node db-view.mjs --all            sample every non-empty collection
//   node db-view.mjs users --limit=50 change the row limit (default 20)
//   node db-view.mjs users --fields=email,name,roles   pick the columns
//
// Uses the URI from .env (MONGODB_URI) through src/config/env.js.
import { MongoClient } from 'mongodb';
import { env } from './src/config/env.js';

const args = process.argv.slice(2);
const names = args.filter((arg) => !arg.startsWith('--'));
const showAll = args.includes('--all');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limit = Number.parseInt(limitArg?.split('=')[1] ?? '20', 10) || 20;
const fieldsArg = args.find((arg) => arg.startsWith('--fields='));
const fields = fieldsArg
  ? fieldsArg
      .split('=')[1]
      .split(',')
      .map((field) => field.trim())
      .filter(Boolean)
  : null;

const cell = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toHexString === 'function') return value.toHexString();
  if (Array.isArray(value)) return value.length ? value.join(', ') : '[]';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
};

const toRow = (doc) => {
  const entries = fields
    ? fields.map((field) => [field, doc[field]])
    : Object.entries(doc);
  return Object.fromEntries(entries.map(([key, value]) => [key, cell(value)]));
};

const client = new MongoClient(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
await client.connect();
const db = client.db();

try {
  const collections = (await db.listCollections().toArray())
    .map((collection) => collection.name)
    .sort((a, b) => a.localeCompare(b));

  if (collections.length === 0) {
    console.log(`Database "${db.databaseName}" has no collections yet. Run: npm run seed:fresh`);
  } else if (names.length === 0) {
    const rows = [];
    for (const name of collections) {
      rows.push({ collection: name, documents: await db.collection(name).countDocuments() });
    }
    console.log(`\nDatabase: ${db.databaseName} (${env.mongoUri.replace(/\/\/[^@]*@/, '//')})`);
    console.table(rows);
    console.log(`Tip: node db-view.mjs <collection>   e.g. node db-view.mjs users`);
  } else {
    let targets = names;
    if (showAll) {
      targets = [];
      for (const name of collections) {
        if ((await db.collection(name).countDocuments()) > 0) targets.push(name);
      }
    }
    for (const name of targets) {
      const exists = collections.includes(name);
      console.log(`\n=== ${name} ===`);
      if (!exists) {
        console.log(`(no such collection — available: ${collections.join(', ')})`);
        continue;
      }
      const projection = fields
        ? Object.fromEntries(fields.map((field) => [field, 1]))
        : {};
      const docs = await db.collection(name).find({}, { projection }).limit(limit).toArray();
      const total = await db.collection(name).countDocuments();
      if (docs.length === 0) {
        console.log('(empty)');
        continue;
      }
      console.table(docs.map(toRow));
      console.log(`${docs.length} of ${total} document(s) shown`);
    }
  }
} finally {
  await client.close();
}
