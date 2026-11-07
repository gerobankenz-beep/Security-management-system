// Mounts every module. Add a line here when you create a new module.
const express = require('express');
const router = express.Router();

router.use(require('./auth/routes'));
router.use(require('./sites/routes'));
router.use(require('./roster/routes'));
router.use(require('./attendance/routes'));
router.use(require('./patrol/routes'));
router.use(require('./anomaly/routes'));
router.use(require('./dashboard/routes'));
router.use(require('./incidents/routes'));

module.exports = router;
