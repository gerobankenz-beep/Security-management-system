const bcrypt = require('bcryptjs');
const { query } = require('../../config/db');
const { notFound, validationError } = require('../../utils/errors');
const { writeAudit } = require('../../utils/audit');

// Never send password_hash to anyone. Always select these columns, not SELECT *.
const PUBLIC_COLUMNS = 'id, full_name, email, phone, role, client_id, is_active, created_at, updated_at';

async function createUser(actor, input) {
  if (input.role === 'client' && !input.client_id) {
    throw validationError([{ field: 'client_id', issue: 'is required when role is client' }]);
  }
  const hash = await bcrypt.hash(input.password, 10); // never store the plain password
  const { rows } = await query(
    `INSERT INTO users (full_name, email, phone, password_hash, role, client_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${PUBLIC_COLUMNS}`,
    [input.full_name, input.email.toLowerCase(), input.phone || null, hash, input.role, input.client_id || null]
  );
  await writeAudit({ userId: actor.id, action: 'CREATE', entityType: 'user', entityId: rows[0].id, details: { role: input.role } });
  return rows[0];
}

async function listUsers({ role, perPage, offset }) {
  const params = [];
  let where = '';
  if (role) {
    params.push(role);
    where = `WHERE role = $${params.length}`;
  }
  const total = (await query(`SELECT count(*) AS n FROM users ${where}`, params)).rows[0].n;
  params.push(perPage, offset);
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS} FROM users ${where} ORDER BY id LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { rows, total };
}

async function getUser(id) {
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound(`User ${id} not found`);
  return rows[0];
}

// Only these fields may be changed through PATCH /users/:id
const EDITABLE = ['full_name', 'phone', 'role', 'is_active'];

async function updateUser(actor, id, input) {
  const sets = [];
  const params = [];
  for (const field of EDITABLE) {
    if (input[field] !== undefined) {
      params.push(input[field]);
      sets.push(`${field} = $${params.length}`);
    }
  }
  if (sets.length === 0) throw validationError([{ field: 'body', issue: `send at least one of: ${EDITABLE.join(', ')}` }]);
  sets.push('updated_at = now()');
  params.push(id);
  const { rows } = await query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${PUBLIC_COLUMNS}`,
    params
  );
  if (!rows[0]) throw notFound(`User ${id} not found`);
  await writeAudit({ userId: actor.id, action: 'UPDATE', entityType: 'user', entityId: id, details: input });
  return rows[0];
}

async function listAuditLogs({ userId, from, to, perPage, offset }) {
  const params = [];
  const conditions = [];
  if (userId) { params.push(userId); conditions.push(`user_id = $${params.length}`); }
  if (from) { params.push(from); conditions.push(`created_at >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`created_at <= $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = (await query(`SELECT count(*) AS n FROM audit_logs ${where}`, params)).rows[0].n;
  params.push(perPage, offset);
  const { rows } = await query(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { rows, total };
}

module.exports = { createUser, listUsers, getUser, updateUser, listAuditLogs };
