import { Router, Request, Response } from 'express';
import { query } from '../db/connection.js';
import { validateBody } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { locationSchema } from '../utils/schemas.js';
import { getSocketIO } from '../socket/index.js';
import { evaluateGeofences } from '../services/geofence.js';
import { checkLowBattery } from '../services/alerts.js';
import { checkCrashHeuristic } from '../services/escalation.js';
import { checkBatteryGuardian, checkSignalStrength } from '../services/batterySignal.js';
import { learnRoutine, checkRoutineDeviations } from '../services/routines.js';
import { requestConsentReconfirmation } from '../services/dailyDigest.js';

const router = Router();

/**
 * @swagger
 * /locations:
 *   post:
 *     summary: Ingest a new location ping from the tracker
 *     tags: [Locations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - session_id
 *               - latitude
 *               - longitude
 *             properties:
 *               session_id:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               accuracy_m:
 *                 type: number
 *               location_source:
 *                 type: string
 *               battery_level:
 *                 type: integer
 *               battery_charging:
 *                 type: boolean
 *               network_type:
 *                 type: string
 *               is_online:
 *                 type: boolean
 *               timezone:
 *                 type: string
 *               speed_ms:
 *                 type: number
 *     responses:
 *       200:
 *         description: Location recorded successfully
 *       404:
 *         description: No active session
 */
router.post('/', rateLimit({ windowMs: 10_000, max: 30, name: 'locations' }), validateBody(locationSchema), async (req: Request, res: Response) => {
  try {
    const { session_id, latitude, longitude, accuracy_m, location_source, battery_level, battery_charging, network_type, is_online, timezone, screen_width, screen_height, ip_city, ip_country, speed_ms } = req.body;

    const session = await query(
      `SELECT ts.*, cp.parent_id, cp.id as profile_id, cp.routine_tracking_enabled FROM tracking_sessions ts JOIN child_profiles cp ON ts.child_id = cp.id WHERE ts.session_id = $1 AND ts.is_active = true`,
      [session_id]
    );
    if (session.length === 0) return res.status(404).json({ error: 'No active session' });
    if (session[0].paused) return res.status(409).json({ error: 'Session is paused' });

    if (!session[0].consent_acked_at) {
      await query('UPDATE tracking_sessions SET consent_acked_at = NOW() WHERE session_id = $1', [session_id]);
    }

    const result = await query(
      `INSERT INTO live_locations (session_id, latitude, longitude, accuracy_m, location_source, battery_level, battery_charging, network_type, is_online, timezone, screen_width, screen_height, ip_city, ip_country, speed_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [session_id, latitude, longitude, accuracy_m || null, location_source || 'gps', battery_level ?? null, battery_charging ?? null, network_type || null, is_online, timezone || null, screen_width || null, screen_height || null, ip_city || null, ip_country || null, speed_ms || null]
    );

    const location = result[0];
    const childId = session[0].profile_id;

    const io = getSocketIO();
    if (io) {
      io.to(`child_${childId}`).emit('location:update', {
        child_id: childId, session_id, location, is_ip_location: location_source === 'ip',
      });
    }

    // Fire-and-forget background checks
    evaluateGeofences(childId, session_id, latitude, longitude).catch(() => {});
    if (battery_level != null) checkLowBattery(childId, session_id, battery_level).catch(() => {});
    if (battery_level != null) checkBatteryGuardian(childId, session_id, battery_level).catch(() => {});
    checkSignalStrength(childId, session_id, network_type || null, is_online).catch(() => {});
    checkCrashHeuristic(childId, session_id, speed_ms || null, accuracy_m || null).catch(() => {});
    if (session[0].routine_tracking_enabled) {
      learnRoutine(childId, latitude, longitude, null).catch(() => {});
      checkRoutineDeviations(childId, session_id, latitude, longitude).catch(() => {});
    }

    // Consent re-confirmation check
    requestConsentReconfirmation(childId, session_id).catch(() => {});

    res.json({ location, is_ip_location: location_source === 'ip' });
  } catch (err) {
    console.error('Location ingest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /locations/latest/{childId}:
 *   get:
 *     summary: Get the latest location for a child
 *     tags: [Locations]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Latest location object
 */
router.get('/latest/:childId', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT ll.*, ll.location_source, ll.ip_city, ll.ip_country FROM live_locations ll
       JOIN tracking_sessions ts ON ll.session_id = ts.session_id
       WHERE ts.child_id = $1 AND ts.is_active = true
       ORDER BY ll.recorded_at DESC LIMIT 1`,
      [req.params.childId]
    );
    const location = result[0] || null;
    const is_ip_location = location?.location_source === 'ip';
    res.json({
      location, is_ip_location,
      ip_warning: is_ip_location ? `Approximate location based on IP (${location?.ip_city || 'Unknown'}, ${location?.ip_country || 'Unknown'}). Accuracy: ~5km.` : null
    });
  } catch (err) {
    console.error('Get latest location error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /locations/history/{childId}:
 *   get:
 *     summary: Get recent location history for a child
 *     tags: [Locations]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: childId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of records to fetch
 *     responses:
 *       200:
 *         description: List of historical locations
 */
router.get('/history/:childId', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const result = await query(
      `SELECT ll.latitude, ll.longitude, ll.accuracy_m, ll.recorded_at, ll.location_source FROM live_locations ll
       JOIN tracking_sessions ts ON ll.session_id = ts.session_id
       WHERE ts.child_id = $1 ORDER BY ll.recorded_at DESC LIMIT $2`,
      [req.params.childId, limit]
    );
    res.json({ locations: result });
  } catch (err) {
    console.error('Get location history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
