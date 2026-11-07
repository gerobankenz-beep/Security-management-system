// DEVELOPMENT ONLY. Sets the same test password for every user in the database,
// replacing the placeholder hashes from seed.sql.
//   npm run set-passwords            -> password is Password123!
//   TEST_PASSWORD=MyPass123 npm run set-passwords
const bcrypt = require('bcryptjs');
const { pool, query } = require('../src/config/db');

(async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production');
  const password = process.env.TEST_PASSWORD || 'Password123!';
  const hash = await bcrypt.hash(password, 10);
  const { rowCount } = await query('UPDATE users SET password_hash = $1', [hash]);
  console.log(`Updated ${rowCount} users. Test password: ${password}`);
  await pool.end();
})().catch((err) => { console.error(err.message); process.exit(1); });
