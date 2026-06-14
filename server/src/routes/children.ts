import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/connection.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createChildSchema, updateChildSchema, pairSchema } from '../utils/schemas.js';

const router = Router();

router.get('/', requireAuth, requireRole('parent', 'guardian'), async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT cp.*, 
        (SELECT json_build_object('latitude', ll.latitude, 'longitude', ll.longitude, 'recorded_at', ll.recorded_at, 'battery_level', ll.battery_level, 'network_type', ll.network_type)
         FROM live_locations ll
         JOIN tracking_sessions ts ON ll.session_id = ts.session_id
         WHERE ts.child_id = cp.id AND ts.is_active = true
         ORDER BY ll.recorded_at DESC LIMIT 1) as last_location,
        (SELECT ts.is_active FROM tracking_sessions ts WHERE ts.child_id = cp.id AND ts.is_active = true LIMIT 1) as is_tracking
       FROM child_profiles cp WHERE cp.parent_id = $1 ORDER BY cp.created_at`,
      [req.user!.id]
    );
    res.json({ children: result });
  } catch (err) {
    console.error('Get children error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', requireAuth, requireRole('parent', 'guardian'), async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT cp.* FROM child_profiles cp WHERE cp.id = $1 AND cp.parent_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Child not found' });
    res.json({ child: result[0] });
  } catch (err) {
    console.error('Get child error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requireAuth, requireRole('parent', 'guardian'), validateBody(createChildSchema), async (req: Request, res: Response) => {
  try {
    const { name, photo_url, indicator_style, update_interval_s } = req.body;
    const pairing_token = uuidv4().replace(/-/g, '');
    const result = await query(
      `INSERT INTO child_profiles (parent_id, name, photo_url, pairing_token, indicator_style, update_interval_s)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user!.id, name, photo_url || null, pairing_token, indicator_style, update_interval_s]
    );
    res.status(201).json({ child: result[0] });
  } catch (err) {
    console.error('Create child error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', requireAuth, requireRole('parent', 'guardian'), validateBody(updateChildSchema), async (req: Request, res: Response) => {
  try {
    const existing = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [req.params.id, req.user!.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Child not found' });

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(req.body)) {
      if (val !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    const result = await query(
      `UPDATE child_profiles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    res.json({ child: result[0] });
  } catch (err) {
    console.error('Update child error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', requireAuth, requireRole('parent', 'guardian'), async (req: Request, res: Response) => {
  try {
    const result = await query('DELETE FROM child_profiles WHERE id = $1 AND parent_id = $2 RETURNING id', [req.params.id, req.user!.id]);
    if (result.length === 0) return res.status(404).json({ error: 'Child not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete child error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/pair', requireAuth, requireRole('parent', 'guardian'), async (req: Request, res: Response) => {
  try {
    const existing = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [req.params.id, req.user!.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Child not found' });

    const pairing_token = uuidv4().replace(/-/g, '');
    await query('UPDATE child_profiles SET pairing_token = $1 WHERE id = $2', [pairing_token, req.params.id]);
    res.json({ pairing_token });
  } catch (err) {
    console.error('Pair error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Child pairs using token (public endpoint, rate-limited)
router.post('/pair', validateBody(pairSchema), async (req: Request, res: Response) => {
  try {
    const { token, child_user_name } = req.body;
    const result = await query('SELECT id, name FROM child_profiles WHERE pairing_token = $1', [token]);
    if (result.length === 0) return res.status(404).json({ error: 'Invalid pairing token' });
    const child = result[0];
    // Rotate token after use
    const newToken = uuidv4().replace(/-/g, '');
    await query('UPDATE child_profiles SET pairing_token = $1 WHERE id = $2', [newToken, child.id]);
    res.json({ child_id: child.id, child_name: child_user_name || child.name });
  } catch (err) {
    console.error('Pair child error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
