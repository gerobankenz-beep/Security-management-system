// Task 5: shift templates, rosters, shifts, validation rules, publish. (API contract section 6)
// Tip: write the rules (rest hours, double booking...) as plain functions in rules.js and unit test them first.
const express = require('express');
const { stub } = require('../../utils/stub');
const router = express.Router();

stub(router, 'post', '/shift-templates', ['ops_manager']);
stub(router, 'get', '/shift-templates', ['ops_manager', 'supervisor']);
stub(router, 'post', '/rosters', ['ops_manager']);
stub(router, 'get', '/rosters', ['ops_manager', 'supervisor']);
stub(router, 'get', '/rosters/:id', ['ops_manager', 'supervisor']);
stub(router, 'post', '/rosters/:id/shifts', ['ops_manager']);
stub(router, 'delete', '/rosters/:id/shifts/:shiftId', ['ops_manager']);
stub(router, 'get', '/rosters/:id/validate', ['ops_manager']);
stub(router, 'post', '/rosters/:id/publish', ['ops_manager']);
stub(router, 'get', '/me/shifts', ['guard']);
stub(router, 'post', '/rosters/:id/auto-fill', ['ops_manager'], 'stretch goal');

module.exports = router;
