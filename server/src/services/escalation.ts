import { query } from '../db/connection.js';
import { getSocketIO } from '../socket/index.js';

export async function checkNoResponseEscalations() {
  try {
    const overdue = await query(
      `SELECT ci.*, ts.is_active, cp.parent_id
       FROM check_ins ci
       JOIN child_profiles cp ON ci.child_id = cp.id
       LEFT JOIN tracking_sessions ts ON ci.session_id = ts.session_id
       WHERE ci.status = 'no_response'
       AND ci.escalation_deadline IS NOT NULL
       AND ci.escalation_deadline < NOW()`
    );

    for (const checkin of overdue) {
      await query(`UPDATE check_ins SET status = 'auto_escalated' WHERE id = $1`, [checkin.id]);

      const alertResult = await query(
        `INSERT INTO alerts (session_id, child_id, alert_type, message, severity, auto_escalated)
         VALUES ($1, $2, 'sos', 'Check-in unanswered — auto-escalated to SOS', 'critical', true) RETURNING *`,
        [checkin.session_id, checkin.child_id]
      );

      await query(
        `INSERT INTO consent_log (child_id, session_id, event, actor, metadata)
         VALUES ($1, $2, 'auto_sos_escalation', 'system', $3)`,
        [checkin.child_id, checkin.session_id, JSON.stringify({ checkin_id: checkin.id, reason: 'no_response_timeout' })]
      );

      const io = getSocketIO();
      if (io) {
        io.to(`child_${checkin.child_id}`).emit('alert:new', { alert: alertResult[0], auto_escalated: true });
      }
    }

    const overdueTrips = await query(
      `SELECT t.*, ts.is_active, cp.parent_id
       FROM trips t
       JOIN child_profiles cp ON t.child_id = cp.id
       LEFT JOIN tracking_sessions ts ON t.session_id = ts.session_id
       WHERE t.status = 'overdue' AND t.auto_sos_fired = false
       AND t.expected_arrival IS NOT NULL
       AND t.expected_arrival < NOW() - INTERVAL '15 minutes'`
    );

    for (const trip of overdueTrips) {
      await query(`UPDATE trips SET auto_sos_fired = true WHERE id = $1`, [trip.id]);

      const alertResult = await query(
        `INSERT INTO alerts (session_id, child_id, alert_type, message, severity, auto_escalated)
         VALUES ($1, $2, 'no_arrival', $3, 'critical', true) RETURNING *`,
        [trip.session_id, trip.child_id, `Overdue: ${trip.destination_name || 'destination'} — expected ${new Date(trip.expected_arrival).toLocaleTimeString()}`]
      );

      const io = getSocketIO();
      if (io) {
        io.to(`child_${trip.child_id}`).emit('alert:new', { alert: alertResult[0], auto_escalated: true });
      }
    }
  } catch (err) {
    console.error('No-response escalation error:', err);
  }
}

export async function checkCrashHeuristic(childId: number, sessionId: string, speedMs: number | null, accuracy: number | null) {
  if (!speedMs || speedMs < 15) return;

  const recent = await query(
    `SELECT speed_ms FROM live_locations
     WHERE session_id = $1 AND speed_ms IS NOT NULL
     AND recorded_at > NOW() - INTERVAL '2 minutes'
     ORDER BY recorded_at DESC LIMIT 5`,
    [sessionId]
  );

  if (recent.length < 3) return;
  const avgSpeed = recent.reduce((s: number, r: any) => s + (r.speed_ms || 0), 0) / recent.length;

  if (avgSpeed > 10 && speedMs < 1) {
    const checkin = await query(
      `INSERT INTO check_ins (session_id, child_id, status, requested_by, escalation_deadline)
       VALUES ($1, $2, 'no_response', 0, NOW() + INTERVAL '3 minutes') RETURNING *`,
      [sessionId, childId]
    );

    const io = getSocketIO();
    if (io) {
      io.to(`child_${childId}`).emit('checkin:requested', {
        checkin: checkin[0],
        reason: 'possible_incident',
        message: 'Possible sudden stop detected. Are you OK?',
      });
    }

    await query(
      `INSERT INTO alerts (session_id, child_id, alert_type, message, severity)
       VALUES ($1, $2, 'possible_incident', 'Possible sudden stop — checking in with child', 'high') RETURNING *`,
      [sessionId, childId]
    );
  }
}
