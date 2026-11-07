// Task 7: rounds and scans. (API contract section 8)
// Remember: POST /scans/batch must accept the same client_scan_id twice and answer "duplicate".
// The scans table has UNIQUE (client_scan_id), so catch that error and report it as a duplicate.
const express = require('express');
const { stub } = require('../../utils/stub');
const router = express.Router();

stub(router, 'get', '/shifts/:id/rounds', ['guard', 'supervisor']);
stub(router, 'get', '/shifts/:id/route', ['guard']);
stub(router, 'post', '/scans', ['guard']);
stub(router, 'post', '/scans/batch', ['guard']);
stub(router, 'get', '/rounds/:id', ['supervisor', 'ops_manager']);

module.exports = router;
