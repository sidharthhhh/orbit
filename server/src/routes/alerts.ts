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
