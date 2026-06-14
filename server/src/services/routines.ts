import { query } from '../db/connection.js';
import { getSocketIO } from '../socket/index.js';

export async function learnRoutine(childId: number, lat: number, lng: number, geofenceId: number | null) {
  const hour = new Date().getHours();
  const day = new Date().getDay();

  if (!geofenceId) return;

  const existing = await query(
    `SELECT * FROM routines WHERE child_id = $1 AND geofence_id = $2 AND routine_type = 'commute'`,
    [childId, geofenceId]
  );

  if (existing.length > 0) {
    const r = existing[0];
    const count = r.learned_from_count + 1;
    await query(
      `UPDATE routines SET learned_from_count = $1, expected_arrive_time = $2 WHERE id = $3`,
      [count, `${hour}:${new Date().getMinutes().toString().padStart(2, '0')}`, r.id]
    );
  } else {
    await query(
      `INSERT INTO routines (child_id, routine_type, expected_lat, expected_lng, expected_arrive_time, geofence_id, learned_from_count, child_visible)
       VALUES ($1, 'commute', $2, $3, $4, $5, 1, true)`,
      [childId, lat, lng, `${hour}:${new Date().getMinutes().toString().padStart(2, '0')}`, geofenceId]
    );
  }
}

export async function checkRoutineDeviations(childId: number, sessionId: string, lat: number, lng: number) {
  const now = new Date();
  const currentDay = now.getDay();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const routines = await query(
    `SELECT * FROM routines WHERE child_id = $1 AND is_active = true AND $2 = ANY(active_days) AND learned_from_count >= 3`,
    [childId, currentDay]
  );

  for (const routine of routines) {
    if (!routine.expected_arrive_time) continue;

    const expectedMinutes = timeToMinutes(routine.expected_arrive_time);
    const actualMinutes = timeToMinutes(currentTime);
    const diffMinutes = actualMinutes - expectedMinutes;

    if (diffMinutes > routine.deviation_threshold_min) {
      const recentDeviation = await query(
        `SELECT id FROM routine_deviations
         WHERE routine_id = $1 AND deviation_type = 'late_arrival'
         AND created_at > NOW() - INTERVAL '2 hours'`,
        [routine.id]
      );

      if (recentDeviation.length === 0) {
        await query(
          `INSERT INTO routine_deviations (routine_id, child_id, session_id, deviation_type, expected_time, actual_time, actual_lat, actual_lng, alerted)
           VALUES ($1, $2, $3, 'late_arrival', $4, NOW(), $5, $6, true)`,
          [routine.id, childId, sessionId, routine.expected_arrive_time, lat, lng]
        );

        const alert = await query(
          `INSERT INTO alerts (session_id, child_id, alert_type, message, severity)
           VALUES ($1, $2, 'routine_deviation', $3, 'medium') RETURNING *`,
          [sessionId, childId, `Late: usually at ${routine.name || 'location'} by ${routine.expected_arrive_time}`]
        );

        const io = getSocketIO();
        if (io) io.to(`child_${childId}`).emit('alert:new', { alert: alert[0] });
      }
    }
  }
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
