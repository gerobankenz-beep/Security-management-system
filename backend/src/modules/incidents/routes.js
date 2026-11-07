// Task 10: incidents and notifications. (API contract section 11)
// Suggested: export a notify(userIds, type, message) function from notifications.service.js
// so every other module can create notifications with one call.
const express = require('express');
const { stub } = require('../../utils/stub');
const router = express.Router();

stub(router, 'post', '/incidents', ['guard']);
stub(router, 'get', '/incidents', ['supervisor', 'ops_manager']);
stub(router, 'get', '/incidents/:id', ['supervisor', 'ops_manager', 'guard']);
stub(router, 'patch', '/incidents/:id', ['supervisor', 'ops_manager']);
stub(router, 'get', '/notifications', []);
stub(router, 'patch', '/notifications/:id', []);
stub(router, 'post', '/incidents/:id/photos', ['guard'], 'stretch goal');

module.exports = router;
