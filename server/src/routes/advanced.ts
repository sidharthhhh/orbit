import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { getSocketIO } from '../socket/index.js';

const router = Router();

// Heartbeat pings
const pingSchema = z.object({
  child_id: z.number().int(),
  message: z.string().max(100).optional(),
});

router.post('/ping', requireAuth, rateLimit({ windowMs: 60_000, max: 20, name: 'ping' }), validateBody(pingSchema), async (req: Request, res: Response) => {
  try {
    const { child_id, message } = req.body;
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [child_id, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });

    const result = await query(
      `INSERT INTO heartbeat_pings (child_id, sender_id, sender_role, message) VALUES ($1, $2, $3, $4) RETURNING *`,
      [child_id, req.user!.id, req.user!.role, message || null]
    );

    const io = getSocketIO();
    if (io) io.to(`child_${child_id}`).emit('ping:received', { ping: result[0] });

    res.status(201).json({ ping: result[0] });
  } catch (err) {
    console.error('Ping error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/ping/respond', validateBody(z.object({
  ping_id: z.number().int(),
  is_read: z.boolean().default(true),
})), async (req: Request, res: Response) => {
  try {
    const { ping_id } = req.body;
    const result = await query(`UPDATE heartbeat_pings SET is_read = true WHERE id = $1 RETURNING *`, [ping_id]);
    if (result.length === 0) return res.status(404).json({ error: 'Ping not found' });

    const io = getSocketIO();
    if (io) io.to(`child_${result[0].child_id}`).emit('ping:acknowledged', { ping_id });

    res.json({ ok: true });
  } catch (err) {
    console.error('Ping respond error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/pings/:childId', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT * FROM heartbeat_pings WHERE child_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.childId]
    );
    res.json({ pings: result });
  } catch (err) {
    console.error('Get pings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Pickup confirmations
const pickupSchema = z.object({
  child_id: z.number().int(),
  session_id: z.string().uuid().optional(),
  pickup_person: z.string().min(1).max(100),
  pickup_person_contact: z.string().max(50).optional(),
  expires_hours: z.number().min(1).max(24).default(4),
});

router.post('/pickup', requireAuth, validateBody(pickupSchema), async (req: Request, res: Response) => {
  try {
    const { child_id, session_id, pickup_person, pickup_person_contact, expires_hours } = req.body;
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [child_id, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });

    const expires = new Date(Date.now() + expires_hours * 3600000);
    const result = await query(
      `INSERT INTO pickup_confirmations (child_id, session_id, pickup_person, pickup_person_contact, assigned_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [child_id, session_id || null, pickup_person, pickup_person_contact || null, req.user!.id, expires]
    );

    const io = getSocketIO();
    if (io) io.to(`child_${child_id}`).emit('pickup:assigned', { pickup: result[0] });

    res.status(201).json({ pickup: result[0] });
  } catch (err) {
    console.error('Pickup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/pickup/confirm', validateBody(z.object({
  pickup_id: z.number().int(),
  lat: z.number().optional(),
  lng: z.number().optional(),
})), async (req: Request, res: Response) => {
  try {
    const { pickup_id, lat, lng } = req.body;
    const result = await query(
      `UPDATE pickup_confirmations SET child_confirmed = true, child_confirmed_at = NOW(), child_confirmed_lat = $2, child_confirmed_lng = $3 WHERE id = $1 AND expires_at > NOW() RETURNING *`,
      [pickup_id, lat || null, lng || null]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Pickup not found or expired' });

    const io = getSocketIO();
    if (io) io.to(`child_${result[0].child_id}`).emit('pickup:confirmed', { pickup: result[0] });

    res.json({ pickup: result[0] });
  } catch (err) {
    console.error('Pickup confirm error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Guardian roles
const guardianSchema = z.object({
  child_id: z.number().int(),
  user_email: z.string().email(),
  role_type: z.enum(['primary_parent', 'secondary_parent', 'grandparent', 'babysitter', 'relative', 'carpool']),
  can_track: z.boolean().default(true),
  can_manage_contacts: z.boolean().default(false),
  can_manage_geofences: z.boolean().default(false),
  can_receive_alerts: z.boolean().default(true),
  time_window_start: z.string().optional(),
  time_window_end: z.string().optional(),
  active_days: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  expires_hours: z.number().min(1).max(8760).optional(),
});

router.post('/guardian', requireAuth, validateBody(guardianSchema), async (req: Request, res: Response) => {
  try {
    const { child_id, user_email, role_type, can_track, can_manage_contacts, can_manage_geofences, can_receive_alerts, time_window_start, time_window_end, active_days, expires_hours } = req.body;

    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [child_id, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });

    const user = await query('SELECT id FROM users WHERE email = $1', [user_email]);
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const expires = expires_hours ? new Date(Date.now() + expires_hours * 3600000) : null;

    const result = await query(
      `INSERT INTO guardian_roles (child_id, user_id, role_type, can_track, can_manage_contacts, can_manage_geofences, can_receive_alerts, time_window_start, time_window_end, active_days, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (child_id, user_id) DO UPDATE SET role_type = $3, can_track = $4, can_manage_contacts = $5, can_manage_geofences = $6, can_receive_alerts = $7, time_window_start = $8, time_window_end = $9, active_days = $10, expires_at = $11
       RETURNING *`,
      [child_id, user[0].id, role_type, can_track, can_manage_contacts, can_manage_geofences, can_receive_alerts, time_window_start || null, time_window_end || null, active_days, expires]
    );

    await query(
      `INSERT INTO settings_audit (child_id, changed_by, change_type, new_value) VALUES ($1, $2, 'guardian_added', $3)`,
      [child_id, req.user!.id, JSON.stringify(result[0])]
    );

    res.status(201).json({ guardian: result[0] });
  } catch (err) {
    console.error('Guardian error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/guardians/:childId', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT gr.*, u.email, u.display_name FROM guardian_roles gr JOIN users u ON gr.user_id = u.id WHERE gr.child_id = $1`,
      [req.params.childId]
    );
    res.json({ guardians: result });
  } catch (err) {
    console.error('Get guardians error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/guardian/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `DELETE FROM guardian_roles gr USING child_profiles cp WHERE gr.child_id = cp.id AND gr.id = $1 AND cp.parent_id = $2 RETURNING gr.id`,
      [req.params.id, req.user!.id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete guardian error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Group trips
const groupTripSchema = z.object({
  name: z.string().min(1).max(100),
  destination_lat: z.number().optional(),
  destination_lng: z.number().optional(),
  destination_name: z.string().max(100).optional(),
  child_ids: z.array(z.number().int()).min(1),
  duration_hours: z.number().min(1).max(24).default(4),
});

router.post('/group-trip', requireAuth, validateBody(groupTripSchema), async (req: Request, res: Response) => {
  try {
    const { name, destination_lat, destination_lng, destination_name, child_ids, duration_hours } = req.body;

    const expires = new Date(Date.now() + duration_hours * 3600000);
    const result = await query(
      `INSERT INTO group_trips (name, created_by, destination_lat, destination_lng, destination_name, starts_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6) RETURNING *`,
      [name, req.user!.id, destination_lat || null, destination_lng || null, destination_name || null, expires]
    );

    const trip = result[0];

    for (const childId of child_ids) {
      const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [childId, req.user!.id]);
      if (child.length > 0) {
        const session = await query(
          `SELECT session_id FROM tracking_sessions WHERE child_id = $1 AND is_active = true LIMIT 1`,
          [childId]
        );
        await query(
          `INSERT INTO group_trip_members (group_trip_id, child_id, session_id) VALUES ($1, $2, $3)`,
          [trip.id, childId, session[0]?.session_id || null]
        );

        const io = getSocketIO();
        if (io) io.to(`child_${childId}`).emit('group_trip:started', { trip });
      }
    }

    res.status(201).json({ trip });
  } catch (err) {
    console.error('Group trip error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/group-trips', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT gt.*, array_agg(gtm.child_id) as child_ids FROM group_trips gt
       LEFT JOIN group_trip_members gtm ON gt.id = gtm.group_trip_id
       WHERE gt.created_by = $1 AND gt.status = 'active' AND gt.expires_at > NOW()
       GROUP BY gt.id ORDER BY gt.created_at DESC`,
      [req.user!.id]
    );
    res.json({ trips: result });
  } catch (err) {
    console.error('Get group trips error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
