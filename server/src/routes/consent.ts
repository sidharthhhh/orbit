import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

const logSchema = z.object({
  child_id: z.number().int(),
  session_id: z.string().uuid().optional(),
  event: z.enum(['opt_in', 'pause', 'resume', 'stop', 'permission_denied', 'permission_revoked']),
  actor: z.enum(['child', 'parent', 'system']),
  metadata: z.any().optional(),
});

router.post('/log', rateLimit({ windowMs: 60_000, max: 30, name: 'consent-log' }), validateBody(logSchema), async (req: Request, res: Response) => {
  try {
    const { child_id, session_id, event, actor, metadata } = req.body;
    const result = await query(
      `INSERT INTO consent_log (child_id, session_id, event, actor, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [child_id, session_id || null, event, actor, metadata ? JSON.stringify(metadata) : null]
    );
    res.status(201).json({ entry: result[0] });
  } catch (err) {
    console.error('Log consent error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const childId = req.query.child_id;
    if (!childId) return res.status(400).json({ error: 'child_id required' });
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [childId, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const result = await query(
      `SELECT * FROM consent_log WHERE child_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [childId]
    );
    res.json({ consent_log: result });
  } catch (err) {
    console.error('Get consent log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
