import { Router, Request, Response } from 'express';
import { query } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/forget', requireAuth, async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });

    // Verify ownership
    const session = await query(
      `SELECT ts.session_id, ts.child_id FROM tracking_sessions ts JOIN child_profiles cp ON ts.child_id = cp.id WHERE ts.session_id = $1 AND cp.parent_id = $2`,
      [session_id, req.user!.id]
    );
    if (session.length === 0) return res.status(404).json({ error: 'Session not found' });

    // Cascade delete locations
    await query('DELETE FROM live_locations WHERE session_id = $1', [session_id]);
    await query('DELETE FROM tracking_sessions WHERE session_id = $1', [session_id]);

    res.json({ ok: true, message: 'Session data deleted' });
  } catch (err) {
    console.error('Forget error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/forget-child', requireAuth, async (req: Request, res: Response) => {
  try {
    const { child_id } = req.body;
    if (!child_id) return res.status(400).json({ error: 'child_id required' });

    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [child_id, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });

    // Delete all location data for this child
    await query(
      `DELETE FROM live_locations WHERE session_id IN (SELECT session_id FROM tracking_sessions WHERE child_id = $1)`,
      [child_id]
    );
    await query('DELETE FROM tracking_sessions WHERE child_id = $1', [child_id]);
    await query('DELETE FROM consent_log WHERE child_id = $1', [child_id]);
    await query('DELETE FROM alerts WHERE child_id = $1', [child_id]);
    await query('DELETE FROM check_ins WHERE child_id = $1', [child_id]);
    await query('DELETE FROM trips WHERE child_id = $1', [child_id]);
    // Delete monitoring data
    await query('DELETE FROM website_usage WHERE child_id = $1', [child_id]);
    await query('DELETE FROM app_usage WHERE child_id = $1', [child_id]);
    await query('DELETE FROM content_flags WHERE child_id = $1', [child_id]);
    await query('DELETE FROM screen_time_violations WHERE child_id = $1', [child_id]);
    await query('DELETE FROM screen_time_rules WHERE child_id = $1', [child_id]);
    await query('DELETE FROM blocked_items WHERE child_id = $1', [child_id]);
    await query('DELETE FROM monitoring_consent WHERE child_id = $1', [child_id]);
    await query('DELETE FROM child_profiles WHERE id = $1', [child_id]);

    res.json({ ok: true, message: 'Child profile and all data deleted' });
  } catch (err) {
    console.error('Forget child error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
