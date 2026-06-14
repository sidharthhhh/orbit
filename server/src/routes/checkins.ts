import { Router, Request, Response } from 'express';
import { query } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { requestCheckinSchema, respondCheckinSchema } from '../utils/schemas.js';
import { getSocketIO } from '../socket/index.js';

const router = Router();

router.post('/request', requireAuth, validateBody(requestCheckinSchema), async (req: Request, res: Response) => {
  try {
    const { child_id, session_id } = req.body;
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [child_id, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });

    const result = await query(
      `INSERT INTO check_ins (session_id, child_id, status, requested_by) VALUES ($1, $2, 'no_response', $3) RETURNING *`,
      [session_id, child_id, req.user!.id]
    );

    const io = getSocketIO();
    if (io) {
      io.to(`child_${child_id}`).emit('checkin:requested', { checkin: result[0] });
    }

    res.status(201).json({ checkin: result[0] });
  } catch (err) {
    console.error('Request checkin error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/respond', validateBody(respondCheckinSchema), async (req: Request, res: Response) => {
  try {
    const { checkin_id, status, lat, lng, message } = req.body;
    const result = await query(
      `UPDATE check_ins SET status = $1, lat = $2, lng = $3, message = $4 WHERE id = $5 AND status = 'no_response' RETURNING *`,
      [status, lat || null, lng || null, message || null, checkin_id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Check-in not found or already responded' });

    const checkin = result[0];

    const io = getSocketIO();
    if (io) {
      io.to(`child_${checkin.child_id}`).emit('checkin:responded', { checkin });
    }

    res.json({ checkin });
  } catch (err) {
    console.error('Respond checkin error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const childId = req.query.child_id;
    if (!childId) return res.status(400).json({ error: 'child_id required' });
    const result = await query(
      `SELECT ci.* FROM check_ins ci JOIN child_profiles cp ON ci.child_id = cp.id WHERE ci.child_id = $1 AND cp.parent_id = $2 ORDER BY ci.created_at DESC LIMIT 50`,
      [childId, req.user!.id]
    );
    res.json({ checkins: result });
  } catch (err) {
    console.error('Get checkins error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
