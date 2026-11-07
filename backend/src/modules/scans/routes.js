const express = require('express');
const router = express.Router();
const { pool } = require('../../db');
const { authorize } = require('../../middleware/auth');
const { calculateDistance } = require('../../utils/geometry');

// POST /scans - Record a checkpoint scan
router.post('/', authorize, async (req, res, next) => {
  try {
    const { client_scan_id, checkpoint_id, timestamp, latitude, longitude, qr_data } = req.body;
    const guard_id = req.user.id;

    // 1. Prevent duplicate scans (idempotency for offline sync)
    const existing = await pool.query('SELECT id FROM scan_events WHERE client_scan_id = $1', [client_scan_id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Duplicate scan' });
    }

    // 2. Get checkpoint details for validation
    const cpRes = await pool.query(
      'SELECT site_id, latitude, longitude, max_distance_meters FROM checkpoints WHERE id = $1',
      [checkpoint_id]
    );
    if (cpRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Checkpoint not found' });
    }
    const cp = cpRes.rows[0];

    // 3. Anomaly Detection: Distance check
    const distance = calculateDistance(latitude, longitude, cp.latitude, cp.longitude);
    let anomaly_flags = [];
    
    if (distance > cp.max_distance_meters) {
      anomaly_flags.push('WRONG_LOCATION');
    }

    // 4. Anomaly Detection: Too fast check (consecutive scans at same site)
    const prevScanRes = await pool.query(
      `SELECT timestamp FROM scan_events se
       JOIN checkpoints c ON se.checkpoint_id = c.id
       WHERE se.guard_id = $1 AND c.site_id = $2
       ORDER BY se.timestamp DESC LIMIT 1`,
      [guard_id, cp.site_id]
    );
    
    if (prevScanRes.rows.length > 0) {
      const prevTime = new Date(prevScanRes.rows[0].timestamp).getTime();
      const currentTime = new Date(timestamp).getTime();
      const timeDiffMinutes = (currentTime - prevTime) / (1000 * 60);
      
      if (timeDiffMinutes < 1) { // Less than 1 minute between scans
        anomaly_flags.push('TOO_FAST');
      }
    }

    // 5. Insert scan event
    const insertRes = await pool.query(
      `INSERT INTO scan_events 
       (client_scan_id, guard_id, checkpoint_id, timestamp, latitude, longitude, qr_data, anomaly_flags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [client_scan_id, guard_id, checkpoint_id, timestamp, latitude, longitude, qr_data, anomaly_flags]
    );

    res.status(201).json({ 
      success: true, 
      data: { id: insertRes.rows[0].id, anomaly_flags } 
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;