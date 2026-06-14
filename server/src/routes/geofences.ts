import { Router, Request, Response } from 'express';
import { query } from '../db/connection.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createGeofenceSchema, updateGeofenceSchema } from '../utils/schemas.js';

const router = Router();

/**
 * @swagger
 * /geofences:
 *   get:
 *     summary: Get all geofences for a specific child
 *     tags: [Geofences]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: child_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of geofences
 *       404:
 *         description: Child not found
 */
router.get('/', requireAuth, requireRole('parent', 'guardian'), async (req: Request, res: Response) => {
  try {
    const childId = req.query.child_id;
    if (!childId) return res.status(400).json({ error: 'child_id required' });
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [childId, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const result = await query('SELECT * FROM geofences WHERE child_id = $1 ORDER BY created_at DESC', [childId]);
    res.json({ geofences: result });
  } catch (err) {
    console.error('Get geofences error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /geofences:
 *   post:
 *     summary: Create a new geofence
 *     tags: [Geofences]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - child_id
 *               - name
 *               - latitude
 *               - longitude
 *               - radius_m
 *               - is_safe
 *             properties:
 *               child_id:
 *                 type: integer
 *               name:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               radius_m:
 *                 type: number
 *               is_safe:
 *                 type: boolean
 *               schedule_json:
 *                 type: object
 *     responses:
 *       201:
 *         description: Geofence created
 *       404:
 *         description: Child not found
 */
router.post('/', requireAuth, requireRole('parent', 'guardian'), validateBody(createGeofenceSchema), async (req: Request, res: Response) => {
  try {
    const { child_id, name, latitude, longitude, radius_m, is_safe, schedule_json } = req.body;
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [child_id, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const result = await query(
      `INSERT INTO geofences (parent_id, child_id, name, latitude, longitude, radius_m, is_safe, schedule_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user!.id, child_id, name, latitude, longitude, radius_m, is_safe, schedule_json ? JSON.stringify(schedule_json) : null]
    );
    res.status(201).json({ geofence: result[0] });
  } catch (err) {
    console.error('Create geofence error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /geofences/{id}:
 *   put:
 *     summary: Update an existing geofence
 *     tags: [Geofences]
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
 *             properties:
 *               name:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               radius_m:
 *                 type: number
 *               is_safe:
 *                 type: boolean
 *               schedule_json:
 *                 type: object
 *     responses:
 *       200:
 *         description: Geofence updated
 *       404:
 *         description: Geofence not found
 */
router.put('/:id', requireAuth, requireRole('parent', 'guardian'), validateBody(updateGeofenceSchema), async (req: Request, res: Response) => {
  try {
    const existing = await query('SELECT id FROM geofences WHERE id = $1 AND parent_id = $2', [req.params.id, req.user!.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Geofence not found' });
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(req.body)) {
      if (val !== undefined) {
        const dbVal = key === 'schedule_json' ? JSON.stringify(val) : val;
        fields.push(`${key} = $${idx}`);
        values.push(dbVal);
        idx++;
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    const result = await query(`UPDATE geofences SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    res.json({ geofence: result[0] });
  } catch (err) {
    console.error('Update geofence error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /geofences/{id}:
 *   delete:
 *     summary: Delete a geofence
 *     tags: [Geofences]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Geofence deleted successfully
 *       404:
 *         description: Geofence not found
 */
router.delete('/:id', requireAuth, requireRole('parent', 'guardian'), async (req: Request, res: Response) => {
  try {
    const result = await query('DELETE FROM geofences WHERE id = $1 AND parent_id = $2 RETURNING id', [req.params.id, req.user!.id]);
    if (result.length === 0) return res.status(404).json({ error: 'Geofence not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete geofence error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
