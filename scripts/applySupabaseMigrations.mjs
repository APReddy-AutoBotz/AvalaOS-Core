import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error('Provide at least one SQL file path.');
  process.exit(1);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  for (const file of files) {
    const absolute = path.resolve(file);
    const sql = await fs.readFile(absolute, 'utf8');
    console.log(`Applying ${file}`);
    await client.query(sql);
    console.log(`Applied ${file}`);
  }
} finally {
  await client.end();
}
