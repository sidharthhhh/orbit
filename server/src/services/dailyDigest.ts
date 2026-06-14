import { query } from '../db/connection.js';
import { getSocketIO } from '../socket/index.js';

export async function generateDailyDigests() {
  try {
    const children = await query(`SELECT id FROM child_profiles`);

    for (const child of children) {
      const today = new Date().toISOString().split('T')[0];

      const existing = await query(
        `SELECT id FROM daily_digests WHERE child_id = $1 AND digest_date = $2`,
        [child.id, today]
      );
      if (existing.length > 0) continue;

      const locations = await query(
        `SELECT ll.latitude, ll.longitude, ll.recorded_at, ll.battery_level
         FROM live_locations ll
         JOIN tracking_sessions ts ON ll.session_id = ts.session_id
         WHERE ts.child_id = $1 AND ll.recorded_at::date = $2
         ORDER BY ll.recorded_at`,
        [child.id, today]
      );

      if (locations.length === 0) continue;

      const alerts = await query(
        `SELECT alert_type, message, severity, created_at
         FROM alerts WHERE child_id = $1 AND created_at::date = $2
         ORDER BY created_at`,
        [child.id, today]
      );

      const geofenceEvents = await query(
        `SELECT a.alert_type, a.message, a.created_at
         FROM alerts a WHERE a.child_id = $1 AND a.created_at::date = $2
         AND a.alert_type IN ('geofence_enter', 'geofence_exit')
         ORDER BY a.created_at`,
        [child.id, today]
      );

      const summary = {
        date: today,
        total_updates: locations.length,
        first_seen: locations[0]?.recorded_at,
        last_seen: locations[locations.length - 1]?.recorded_at,
        battery_range: {
          min: Math.min(...locations.map((l: any) => l.battery_level || 100)),
          max: Math.max(...locations.map((l: any) => l.battery_level || 0)),
        },
        geofence_events: geofenceEvents.map((e: any) => ({
          type: e.alert_type,
          message: e.message,
          time: e.created_at,
        })),
        alert_count: alerts.length,
        alerts: alerts.map((a: any) => ({
          type: a.alert_type,
          message: a.message,
          severity: a.severity,
          time: a.created_at,
        })),
      };

      await query(
        `INSERT INTO daily_digests (child_id, digest_date, summary_json) VALUES ($1, $2, $3)`,
        [child.id, today, JSON.stringify(summary)]
      );

      const io = getSocketIO();
      if (io) {
        io.to(`child_${child.id}`).emit('digest:ready', { child_id: child.id, date: today, summary });
      }
    }
  } catch (err) {
    console.error('Daily digest error:', err);
  }
}

export async function requestConsentReconfirmation(childId: number, sessionId: string) {
  const session = await query(
    `SELECT * FROM tracking_sessions WHERE session_id = $1 AND is_active = true`,
    [sessionId]
  );

  if (session.length === 0) return;

  const lastCheck = session[0].last_consent_check;
  const intervalMin = session[0].consent_check_interval_min || 60;

  if (lastCheck) {
    const elapsed = (Date.now() - new Date(lastCheck).getTime()) / 60000;
    if (elapsed < intervalMin) return;
  }

  await query(
    `UPDATE tracking_sessions SET last_consent_check = NOW() WHERE session_id = $1`,
    [sessionId]
  );

  const io = getSocketIO();
  if (io) {
    io.to(`child_${childId}`).emit('consent:reconfirm', {
      session_id: sessionId,
      message: 'Still OK to share your location?',
      timeout_s: 120,
    });
  }

  await query(
    `INSERT INTO consent_log (child_id, session_id, event, actor, metadata)
     VALUES ($1, $2, 'reconfirmation_requested', 'system', $3)`,
    [childId, sessionId, JSON.stringify({ interval_min: intervalMin })]
  );
}
