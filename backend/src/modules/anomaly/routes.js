// Task 8: flags and the anomaly rules. (API contract section 9)
// Suggested files: rules/missedCheckpoint.js, rules/tooFast.js ... each exports a function
// that takes a round with its scans and returns a list of flags. Unit test each one.
const express = require('express');
const { stub } = require('../../utils/stub');
const router = express.Router();

stub(router, 'get', '/flags', ['supervisor', 'ops_manager']);
stub(router, 'get', '/flags/:id', ['supervisor', 'ops_manager']);
stub(router, 'patch', '/flags/:id', ['supervisor', 'ops_manager']);
stub(router, 'get', '/anomaly-settings', ['ops_manager']);
stub(router, 'patch', '/anomaly-settings', ['ops_manager']);
stub(router, 'post', '/rounds/:id/evaluate', ['ops_manager']);

module.exports = router;
