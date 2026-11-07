// Task 6: check-in/out, exceptions, swaps and leave. (API contract section 7)
// Use utils/geo.js distanceMetres() to compare the guard's GPS with the site.
// jobs/noShowJob.js should mark shifts with no check-in after 30 minutes.
const express = require('express');
const { stub } = require('../../utils/stub');
const router = express.Router();

stub(router, 'post', '/attendance/check-in', ['guard']);
stub(router, 'post', '/attendance/check-out', ['guard']);
stub(router, 'get', '/attendance', ['ops_manager', 'supervisor']);
stub(router, 'get', '/attendance/exceptions', ['ops_manager', 'supervisor']);
stub(router, 'post', '/swap-requests', ['guard'], 'stretch goal');
stub(router, 'patch', '/swap-requests/:id', ['supervisor'], 'stretch goal');
stub(router, 'post', '/leave-requests', ['guard'], 'stretch goal');
stub(router, 'patch', '/leave-requests/:id', ['supervisor'], 'stretch goal');

module.exports = router;
