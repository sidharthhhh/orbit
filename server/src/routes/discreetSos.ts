import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { getSocketIO } from '../socket/index.js';

const router = Router();

const discreetSOSSchema = z.object({
  child_id: z.number().int(),
  session_id: z.string().uuid(),
  action: z.enum(['fake_shutdown', 'discreet_confirm']),
});

router.post('/discreet-sos', rateLimit({ windowMs: 60_000, max: 3, name: 'discreet-sos' }), validateBody(discreetSOSSchema), async (req: Request, res: Response) => {
  try {
    const { child_id, session_id, action } = req.body;

    const child = await query(
      `SELECT cp.*, ts.is_active FROM child_profiles cp
       LEFT JOIN tracking_sessions ts ON ts.session_id = $2
       WHERE cp.id = $1 AND cp.discreet_sos_enabled = true`,
      [child_id, session_id]
    );

    if (child.length === 0) return res.status(404).json({ error: 'Child not found or discreet SOS not enabled' });

    if (action === 'fake_shutdown') {
      await query(
        `UPDATE tracking_sessions SET is_discreet = true WHERE session_id = $1`,
        [session_id]
      );

      const alert = await query(
        `INSERT INTO alerts (session_id, child_id, alert_type, message, severity)
         VALUES ($1, $2, 'discreet_sos', '🚨 DISCREET SOS — Child activated fake shutdown. Location still transmitting.', 'critical') RETURNING *`,
        [session_id, child_id]
      );

      await query(
        `INSERT INTO consent_log (child_id, session_id, event, actor, metadata)
         VALUES ($1, $2, 'discreet_sos_activated', 'child', '{"action":"fake_shutdown"}'::jsonb)`,
        [child_id, session_id]
      );

      const io = getSocketIO();
      if (io) {
        io.to(`child_${child_id}`).emit('alert:new', { alert: alert[0], discreet: true });
        io.to(`child_${child_id}`).emit('session:discreet', { session_id, active: true });
      }

      return res.json({ ok: true, message: 'Discreet mode active. Location still transmitting.' });
    }

    if (action === 'discreet_confirm') {
      await query(
        `UPDATE tracking_sessions SET is_discreet = false WHERE session_id = $1`,
        [session_id]
      );

      const io = getSocketIO();
      if (io) io.to(`child_${child_id}`).emit('session:discreet', { session_id, active: false });

      return res.json({ ok: true, message: 'Discreet mode deactivated.' });
    }
  } catch (err) {
    console.error('Discreet SOS error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const liveSOSLinkSchema = z.object({
  alert_id: z.number().int(),
  session_id: z.string().uuid(),
});

router.post('/live-link', requireAuth, validateBody(liveSOSLinkSchema), async (req: Request, res: Response) => {
  try {
    const { alert_id, session_id } = req.body;

    const alert = await query(
      `SELECT a.*, cp.parent_id FROM alerts a JOIN child_profiles cp ON a.child_id = cp.id WHERE a.id = $1 AND a.alert_type IN ('sos', 'discreet_sos', 'auto_escalated')`,
      [alert_id]
    );

    if (alert.length === 0) return res.status(404).json({ error: 'SOS alert not found' });
    if (alert[0].parent_id !== req.user!.id) return res.status(403).json({ error: 'Not authorized' });

    const existing = await query(
      `SELECT share_token FROM live_sos_links WHERE alert_id = $1 AND expires_at > NOW()`,
      [alert_id]
    );

    if (existing.length > 0) {
      return res.json({ token: existing[0].share_token, expires_at: null });
    }

    const token = uuidv4().replace(/-/g, '');
    const expires = new Date(Date.now() + 4 * 60 * 60 * 1000);

    await query(
      `INSERT INTO live_sos_links (alert_id, child_id, session_id, share_token, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [alert_id, alert[0].child_id, session_id, token, expires]
    );

    res.json({ token, expires_at: expires });
  } catch (err) {
    console.error('Live SOS link error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/live/:token', async (req: Request, res: Response) => {
  try {
    const link = await query(
      `SELECT lsl.*, cp.name as child_name FROM live_sos_links lsl
       JOIN child_profiles cp ON lsl.child_id = cp.id
       WHERE lsl.share_token = $1 AND lsl.expires_at > NOW()`,
      [req.params.token]
    );

    if (link.length === 0) return res.status(404).json({ error: 'Link expired or not found' });

    await query(`UPDATE live_sos_links SET view_count = view_count + 1 WHERE id = $1`, [link[0].id]);

    const location = await query(
      `SELECT latitude, longitude, accuracy_m, battery_level, network_type, is_online, recorded_at
       FROM live_locations WHERE session_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [link[0].session_id]
    );

    res.json({
      child_name: link[0].child_name,
      session_id: link[0].session_id,
      location: location[0] || null,
      created_at: link[0].created_at,
      view_count: link[0].view_count + 1,
    });
  } catch (err) {
    console.error('Live SOS view error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
