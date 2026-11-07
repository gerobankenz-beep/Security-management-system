// Task 9: dashboard numbers and reports. (API contract section 10)
// Start from the tested SQL queries in the Database and Repository Guide.
const express = require('express');
const { stub } = require('../../utils/stub');
const router = express.Router();

stub(router, 'get', '/dashboard/overview', ['ops_manager', 'supervisor']);
stub(router, 'get', '/dashboard/sites/:id/status', ['ops_manager', 'supervisor']);
stub(router, 'get', '/reports/patrol-compliance', ['ops_manager', 'supervisor']);
stub(router, 'get', '/reports/proof-of-service', ['client', 'ops_manager']);

module.exports = router;
