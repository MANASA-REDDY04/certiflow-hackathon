import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  let client;
  try {
    client = await db.connect();
    console.log('[Migrate] Connected to database. Checking migrations...');

    // Locate migrations directory (compatible with monorepo root or package cwd)
    const possiblePaths = [
      path.resolve(__dirname, '../../../supabase/migrations'),
      path.resolve(__dirname, '../../supabase/migrations'),
      path.resolve(process.cwd(), '../supabase/migrations'),
      path.resolve(process.cwd(), 'supabase/migrations'),
      path.resolve(process.cwd(), 'migrations'),
    ];

    let migrationsDir: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        migrationsDir = p;
        break;
      }
    }

    if (!migrationsDir) {
      console.warn('[Migrate] No migrations directory found. Skipping.');
      return;
    }

    console.log(`[Migrate] Found migrations in ${migrationsDir}`);
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    // Create migrations tracker table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    for (const file of files) {
      const version = file.split('_')[0];
      const check = await client.query(
        'SELECT 1 FROM _schema_migrations WHERE version = $1',
        [version]
      );
      if (check.rows.length === 0) {
        console.log(`[Migrate] Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        await client.query(sql);
        await client.query('INSERT INTO _schema_migrations (version) VALUES ($1)', [version]);
        console.log(`[Migrate] Applied: ${file}`);
      } else {
        console.log(`[Migrate] Already applied: ${file}`);
      }
    }

    console.log('[Migrate] Migrations completed successfully.');
  } catch (error: any) {
    console.warn('[Migrate] Migration notice (start PostgreSQL to apply schema):', error.message || error);
  } finally {
    if (client) {
      client.release();
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
