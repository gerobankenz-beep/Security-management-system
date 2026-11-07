// One shared connection pool to PostgreSQL.
const { Pool, types } = require('pg');
const env = require('./env');

// By default pg returns NUMERIC (type 1700) and BIGINT (type 20) as strings.
// Convert them to JavaScript numbers so latitude, counts and ids behave as expected.
types.setTypeParser(1700, (value) => parseFloat(value));
types.setTypeParser(20, (value) => parseInt(value, 10));

const pool = new Pool({ connectionString: env.databaseUrl });

// Always use placeholders ($1, $2 ...) for values. Never build SQL by joining strings,
// otherwise attackers can inject their own SQL.
function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
