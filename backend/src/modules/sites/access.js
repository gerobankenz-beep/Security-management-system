// Which sites may this user see? (API contract, section 3)
const { query } = require('../../config/db');
const { notFound } = require('../../utils/errors');

// Returns an "AND ..." SQL piece and pushes its parameter onto `params`.
function siteScope(user, params, alias = 's') {
  switch (user.role) {
    case 'supervisor':
      params.push(user.id);
      return `AND ${alias}.id IN (SELECT site_id FROM site_supervisors WHERE user_id = $${params.length})`;
    case 'guard':
      params.push(user.id);
      return `AND ${alias}.id IN (SELECT site_id FROM site_guards WHERE guard_id = $${params.length})`;
    case 'client':
      params.push(user.client_id);
      return `AND ${alias}.client_id = $${params.length}`;
    default:
      return ''; // admin and ops_manager see all sites
  }
}

// 404 (not 403) when the site is out of scope, so ids cannot be discovered.
async function assertSiteAccess(user, siteId) {
  const params = [siteId];
  const filter = siteScope(user, params);
  const { rows } = await query(`SELECT s.id FROM sites s WHERE s.id = $1 ${filter}`, params);
  if (!rows[0]) throw notFound(`Site ${siteId} not found`);
}

module.exports = { siteScope, assertSiteAccess };
