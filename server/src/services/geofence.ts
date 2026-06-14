import { query } from '../db/connection.js';
import { getSocketIO } from '../socket/index.js';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Debounce map: fenceId -> last alert time
const fenceDebounce = new Map<string, number>();
const DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

export async function evaluateGeofences(childId: number, sessionId: string, lat: number, lng: number) {
  try {
    const fences = await query('SELECT * FROM geofences WHERE child_id = $1', [childId]);
    if (fences.length === 0) return;

    for (const fence of fences) {
      const distance = haversineDistance(lat, lng, fence.latitude, fence.longitude);
      const isInside = distance <= fence.radius_m;
      const debounceKey = `${fence.id}_${isInside ? 'enter' : 'exit'}`;
      const lastAlert = fenceDebounce.get(debounceKey) || 0;

      if (Date.now() - lastAlert < DEBOUNCE_MS) continue;

      // Check previous state from recent alerts
      const recentAlert = await query(
        `SELECT alert_type FROM alerts WHERE child_id = $1 AND session_id = $2 AND alert_type LIKE $3 ORDER BY created_at DESC LIMIT 1`,
        [childId, sessionId, `%geofence%`]
      );

      let shouldAlert = false;
      let alertType = '';
      let message = '';

      if (recentAlert.length === 0) {
        // First alert for this session
        if (!isInside && !fence.is_safe) {
          shouldAlert = true;
          alertType = 'geofence_exit';
          message = `Child left ${fence.name} zone`;
        } else if (isInside && fence.is_safe) {
          // No alert needed for entering safe zone initially
        }
      } else {
        const lastType = recentAlert[0].alert_type;
        if (isInside && lastType === 'geofence_exit') {
          alertType = 'geofence_enter';
          message = `Child entered ${fence.name} zone`;
          shouldAlert = true;
        } else if (!isInside && lastType === 'geofence_enter') {
          alertType = 'geofence_exit';
          message = `Child left ${fence.name} zone`;
          shouldAlert = true;
        }
      }

      if (shouldAlert) {
        const severity = fence.is_safe && alertType === 'geofence_exit' ? 'high' : 'medium';
        const result = await query(
          `INSERT INTO alerts (session_id, child_id, alert_type, message, severity) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [sessionId, childId, alertType, message, severity]
        );

        fenceDebounce.set(debounceKey, Date.now());

        const io = getSocketIO();
        if (io) {
          io.to(`child_${childId}`).emit('alert:new', { alert: result[0] });
        }
      }
    }
  } catch (err) {
    console.error('Geofence evaluation error:', err);
  }
}
