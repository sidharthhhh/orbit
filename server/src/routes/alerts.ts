import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { resolveAlertSchema } from '../utils/schemas.js';
import { createSOSAlert } from '../services/alerts.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

const sosSchema = z.object({
  session_id: z.string().uuid(),
  child_id: z.number().int(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

/**
 * @swagger
 * /alerts/sos:
 *   post:
 *     summary: Trigger an SOS alert from the tracker
 *     tags: [Alerts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - session_id
 *               - child_id
 *             properties:
 *               session_id:
 *                 type: string
 *               child_id:
 *                 type: integer
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *     responses:
 *       201:
 *         description: SOS alert created
 */
router.post('/sos', rateLimit({ windowMs: 60_000, max: 5, name: 'sos' }), validateBody(sosSchema), async (req: Request, res: Response) => {
  try {
    const { session_id, child_id, lat, lng } = req.body;
    const alert = await createSOSAlert(child_id, session_id, lat, lng);
    res.status(201).json({ alert });
  } catch (err) {
    console.error('SOS error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /alerts:
 *   get:
 *     summary: Get alerts for children
 *     tags: [Alerts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: child_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: unresolved
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of alerts
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const childId = req.query.child_id;
    const unresolvedOnly = req.query.unresolved === 'true';
    let sql = `SELECT a.*, cp.name as child_name FROM alerts a JOIN child_profiles cp ON a.child_id = cp.id WHERE cp.parent_id = $1`;
    const params: unknown[] = [req.user!.id];
    if (childId) {
      sql += ` AND a.child_id = $2`;
      params.push(childId);
    }
    if (unresolvedOnly) {
      sql += ` AND a.resolved = false`;
    }
    sql += ` ORDER BY a.created_at DESC LIMIT 100`;
    const result = await query(sql, params);
    res.json({ alerts: result });
  } catch (err) {
    console.error('Get alerts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /alerts/{id}/resolve:
 *   put:
 *     summary: Resolve an alert
 *     tags: [Alerts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resolved_by
 *             properties:
 *               resolved_by:
 *                 type: string
 *     responses:
 *       200:
 *         description: Alert resolved
 *       404:
 *         description: Alert not found
 */
router.put('/:id/resolve', requireAuth, validateBody(resolveAlertSchema), async (req: Request, res: Response) => {
  try {
    const { resolved_by } = req.body;
    const result = await query(
      `UPDATE alerts SET resolved = true, resolved_by = $1 WHERE id = $2 AND resolved = false RETURNING *`,
      [resolved_by, req.params.id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Alert not found or already resolved' });
    res.json({ alert: result[0] });
  } catch (err) {
    console.error('Resolve alert error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
