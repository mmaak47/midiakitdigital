const { execFileSync } = require('child_process');

const DB_ENGINE = String(process.env.DB_ENGINE || 'sqlite').toLowerCase();

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !Buffer.isBuffer(value);
}

function escapeLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (Buffer.isBuffer(value)) return `E'\\x${value.toString('hex')}'`;
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function rewriteSqliteSyntax(sql) {
  let out = String(sql);

  out = out.replace(/datetime\('now'\)/gi, 'NOW()');
  out = out.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, 'INSERT INTO');

  out = out.replace(
    /INSERT\s+OR\s+REPLACE\s+INTO\s+([a-zA-Z_][\w]*)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi,
    (_, tableName, columnsRaw, valuesRaw) => {
      const columns = columnsRaw.split(',').map((c) => c.trim());
      const conflictKey = columns[0];
      const updateSet = columns
        .slice(1)
        .map((c) => `${c} = EXCLUDED.${c}`)
        .join(', ');

      if (!updateSet) {
        return `INSERT INTO ${tableName} (${columnsRaw}) VALUES (${valuesRaw}) ON CONFLICT (${conflictKey}) DO NOTHING`;
      }

      return `INSERT INTO ${tableName} (${columnsRaw}) VALUES (${valuesRaw}) ON CONFLICT (${conflictKey}) DO UPDATE SET ${updateSet}`;
    }
  );

  return out;
}

function bindSql(sql, params) {
  let out = rewriteSqliteSyntax(sql);

  if (params.length === 1 && isPlainObject(params[0])) {
    const named = params[0];
    out = out.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => escapeLiteral(named[key]));
    return out;
  }

  let idx = 0;
  out = out.replace(/\?/g, () => escapeLiteral(params[idx++]));
  return out;
}

function createPostgresCompat() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required when DB_ENGINE=postgres');
  }

  let psqlConnectionString = connectionString;
  try {
    const parsed = new URL(connectionString);
    parsed.searchParams.delete('schema');
    psqlConnectionString = parsed.toString();
  } catch {
    psqlConnectionString = connectionString;
  }

  function runPsql(sql) {
    const output = execFileSync(
      'psql',
      [psqlConnectionString, '-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql],
      { encoding: 'utf8' }
    );
    return String(output || '').trim();
  }

  function queryRows(sql) {
    const wrapped = `SELECT COALESCE(json_agg(t), '[]'::json)::text FROM (${sql}) t`;
    const raw = runPsql(wrapped);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  function prepare(sql) {
    return {
      get(...params) {
        const rows = queryRows(bindSql(sql, params));
        return rows[0];
      },
      all(...params) {
        return queryRows(bindSql(sql, params));
      },
      run(...params) {
        let finalSql = bindSql(sql, params);

        if (!/^\s*(insert|update|delete)/i.test(finalSql)) {
          runPsql(finalSql);
          return { changes: 0, lastInsertRowid: 0 };
        }

        if (!/\breturning\b/i.test(finalSql)) {
          finalSql = `${finalSql} RETURNING *`;
        }

        const wrapped = `
          WITH q AS (${finalSql})
          SELECT json_build_object(
            'changes', COUNT(*),
            'rows', COALESCE(json_agg(to_jsonb(q)), '[]'::json)
          )::text
          FROM q
        `;

        const raw = runPsql(wrapped);
        let payload = { changes: 0, rows: [] };
        try {
          payload = raw ? JSON.parse(raw) : payload;
        } catch {
          payload = { changes: 0, rows: [] };
        }

        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        const last = rows.length ? rows[rows.length - 1] : null;
        const lastInsertRowid = last && last.id != null ? Number(last.id) : 0;

        return {
          changes: Number(payload.changes || 0),
          lastInsertRowid,
        };
      },
    };
  }

  // Compatibility no-op methods used by legacy SQLite services.
  function exec(sql) {
    runPsql(rewriteSqliteSyntax(sql));
  }

  function pragma() {
    return null;
  }

  function transaction(fn) {
    return (...args) => fn(...args);
  }

  // Validate connection at startup.
  runPsql('SELECT 1');

  return {
    prepare,
    exec,
    pragma,
    transaction,
    backup() {
      throw new Error('backup() is SQLite-only');
    },
    engine: 'postgres',
  };
}

if (DB_ENGINE === 'postgres') {
  module.exports = createPostgresCompat();
} else {
  module.exports = require('./database.sqlite');
}
