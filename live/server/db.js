const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false'
    ? { rejectUnauthorized: false }
    : false
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, close };
