const express = require('express');
const router = express.Router();
const { pool } = require('../../db');
const { authorize } = require('../../middleware/auth');

// GET /sites - List sites based on user role
router.get('/', authorize, async (req, res, next) => {
  try {
    let query = 'SELECT id, name, client_id, address FROM sites';
    const params = [];

    if (req.user.role === 'client') {
      query += ' WHERE client_id = $1';
      params.push(req.user.id);
    } else if (req.user.role === 'guard') {
      query = `SELECT DISTINCT s.id, s.name, s.client_id, s.address 
               FROM sites s 
               JOIN shifts sh ON s.id = sh.site_id 
               WHERE sh.guard_id = $1`;
      params.push(req.user.id);
    }

    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;