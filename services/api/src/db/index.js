import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import config from '@aipd/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbClient = null;
let isPglite = false;

/**
 * Initializes database connection (Native PostgreSQL or Embedded PGlite)
 */
export async function getDb() {
  if (dbClient) return dbClient;

  if (config.databaseUrl) {
    try {
      console.log(`[DB] Connecting to PostgreSQL at ${config.databaseUrl.replace(/:\/\/.*@/, '://***@')}`);
      const pool = new pg.Pool({ connectionString: config.databaseUrl });
      // Test connection
      await pool.query('SELECT 1');
      dbClient = pool;
      isPglite = false;
      console.log('[DB] PostgreSQL pool initialized successfully.');
      return dbClient;
    } catch (err) {
      console.warn(`[DB] Failed to connect to DATABASE_URL: ${err.message}. Falling back to embedded PGlite.`);
    }
  }

  // Fallback to embedded PGlite
  console.log('[DB] Initializing embedded PGlite database...');
  const isTest = process.env.NODE_ENV === 'test' || process.argv.some(a => a.includes('test'));
  const dataDir = isTest ? undefined : path.resolve(process.cwd(), config.pgliteDataDir);
  dbClient = new PGlite(dataDir);
  await dbClient.waitReady;
  isPglite = true;
  console.log(`[DB] Embedded PGlite initialized (${dataDir ? `storage: ${dataDir}` : 'in-memory'}).`);
  return dbClient;
}

/**
 * Unified SQL query runner
 * @param {string} text - SQL query with $1, $2 parameters
 * @param {Array} params - Query arguments
 * @returns {Promise<{ rows: Array, rowCount: number }>}
 */
export async function query(text, params = []) {
  const client = await getDb();
  if (isPglite) {
    const res = await client.query(text, params);
    return {
      rows: res.rows || [],
      rowCount: res.affectedRows ?? (res.rows ? res.rows.length : 0),
    };
  } else {
    const res = await client.query(text, params);
    return {
      rows: res.rows || [],
      rowCount: res.rowCount ?? 0,
    };
  }
}

/**
 * Executes initial migration schema
 */
export async function initDb() {
  const client = await getDb();
  const migrationsDir = path.resolve(__dirname, '../../../../database/migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      if (isPglite) {
        await client.exec(sql);
      } else {
        await client.query(sql);
      }
      console.log(`[DB] ${file} executed successfully.`);
    }
  } else {
    console.warn(`[DB] Migration directory not found at: ${migrationsDir}`);
  }
}

/**
 * Seeds initial mock data
 */
export async function seedDb() {
  const seedPath = path.resolve(__dirname, '../../../../database/seed/seed.sql');
  if (fs.existsSync(seedPath)) {
    const sql = fs.readFileSync(seedPath, 'utf8');
    const client = await getDb();
    if (isPglite) {
      await client.exec(sql);
    } else {
      await client.query(sql);
    }
    console.log('[DB] seed.sql executed successfully.');
  }
}

/**
 * Closes the database connection
 */
export async function closeDb() {
  if (dbClient) {
    if (isPglite) {
      await dbClient.close();
    } else {
      await dbClient.end();
    }
    dbClient = null;
  }
}

export default {
  getDb,
  query,
  initDb,
  seedDb,
  closeDb,
};
