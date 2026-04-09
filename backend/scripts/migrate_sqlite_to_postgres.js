require('dotenv').config();

const path = require('path');
const Database = require('better-sqlite3');
const { Client } = require('pg');

const SQLITE_PATH = process.env.SQLITE_PATH
  ? path.resolve(process.cwd(), process.env.SQLITE_PATH)
  : path.resolve(__dirname, '..', 'midiakit.db');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const TABLES_IN_ORDER = [
  'admin_users',
  'pontos',
  'app_settings',
  'entorno_jobs',
  'pdf_cache',
  'cidade_fotos',
  'propostas',
  'entorno_cache',
  'pdf_cache_snapshot',
  'propostas_aprovacoes',
];

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

async function migrateTable(sqlite, pg, table) {
  const columnsInfo = sqlite.prepare(`PRAGMA table_info(${table})`).all();
  const columns = columnsInfo.map((c) => c.name);

  if (!columns.length) {
    console.warn(`[migrate] Skipping ${table} (no columns found).`);
    return;
  }

  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
  if (!rows.length) {
    console.log(`[migrate] ${table}: 0 rows`);
    return;
  }

  const colList = columns.map(quoteIdent).join(', ');
  const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
  const sql = `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${placeholders})`;

  for (const row of rows) {
    const values = columns.map((c) => row[c]);
    await pg.query(sql, values);
  }

  console.log(`[migrate] ${table}: ${rows.length} rows`);
}

async function resetIdentitySequence(pg, table) {
  const query = `
    SELECT setval(
      pg_get_serial_sequence($1, 'id'),
      COALESCE((SELECT MAX(id) FROM ${quoteIdent(table)}), 1),
      (SELECT COUNT(*) > 0 FROM ${quoteIdent(table)})
    )
  `;
  await pg.query(query, [table]);
}

async function main() {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pg = new Client({ connectionString: DATABASE_URL });

  await pg.connect();

  try {
    console.log(`[migrate] SQLite: ${SQLITE_PATH}`);
    console.log('[migrate] Starting transaction...');

    await pg.query('BEGIN');
    await pg.query("SET session_replication_role = 'replica'");
    await pg.query(`TRUNCATE TABLE ${TABLES_IN_ORDER.map(quoteIdent).join(', ')} RESTART IDENTITY CASCADE`);

    for (const table of TABLES_IN_ORDER) {
      await migrateTable(sqlite, pg, table);
    }

    for (const table of TABLES_IN_ORDER) {
      const hasId = sqlite.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === 'id');
      if (hasId) {
        await resetIdentitySequence(pg, table);
      }
    }

    await pg.query("SET session_replication_role = 'origin'");
    await pg.query('COMMIT');

    console.log('[migrate] Done. SQLite data copied to PostgreSQL successfully.');
  } catch (error) {
    await pg.query('ROLLBACK');
    console.error('[migrate] Failed:', error.message);
    process.exitCode = 1;
  } finally {
    sqlite.close();
    await pg.end();
  }
}

main();
