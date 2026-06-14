import { Router, Request, Response } from 'express';
import { query } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createTripSchema } from '../utils/schemas.js';
import { getSocketIO } from '../socket/index.js';

const router = Router();

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.post('/', requireAuth, validateBody(createTripSchema), async (req: Request, res: Response) => {
  try {
    const { child_id, session_id, destination_lat, destination_lng, destination_name, expected_arrival } = req.body;
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [child_id, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });

    // Get current location to calculate distance
    const locResult = await query(
      `SELECT latitude, longitude FROM live_locations WHERE session_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [session_id]
    );

    let distance_m = 0;
    let eta_minutes = 0;
    if (locResult.length > 0) {
      distance_m = haversineDistance(locResult[0].latitude, locResult[0].longitude, destination_lat, destination_lng);
      eta_minutes = Math.round(distance_m / 500); // ~30km/h estimate
    }

    const result = await query(
      `INSERT INTO trips (child_id, session_id, destination_lat, destination_lng, destination_name, expected_arrival, distance_m, eta_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [child_id, session_id, destination_lat, destination_lng, destination_name || null, expected_arrival || null, distance_m, eta_minutes]
    );

    res.status(201).json({ trip: result[0] });
  } catch (err) {
    console.error('Create trip error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/arrive', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `UPDATE trips SET status = 'arrived' WHERE id = $1 AND status = 'active' RETURNING *`,
      [req.params.id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Trip not found or not active' });
    res.json({ trip: result[0] });
  } catch (err) {
    console.error('Arrive trip error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `UPDATE trips SET status = 'cancelled' WHERE id = $1 AND status = 'active' RETURNING *`,
      [req.params.id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Trip not found or not active' });
    res.json({ trip: result[0] });
  } catch (err) {
    console.error('Cancel trip error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const childId = req.query.child_id;
    if (!childId) return res.status(400).json({ error: 'child_id required' });
    const result = await query(
      `SELECT t.* FROM trips t JOIN child_profiles cp ON t.child_id = cp.id WHERE t.child_id = $1 AND cp.parent_id = $2 ORDER BY t.created_at DESC LIMIT 50`,
      [childId, req.user!.id]
    );
    res.json({ trips: result });
  } catch (err) {
    console.error('Get trips error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
