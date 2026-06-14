import { query } from '../db/connection.js';
import { getSocketIO } from '../socket/index.js';

export async function checkBatteryGuardian(childId: number, sessionId: string, batteryLevel: number) {
  if (batteryLevel >= 30) return;

  const activeTrips = await query(
    `SELECT * FROM trips WHERE child_id = $1 AND status = 'active' AND expected_arrival IS NOT NULL`,
    [childId]
  );

  for (const trip of activeTrips) {
    const arrivalTime = new Date(trip.expected_arrival).getTime();
    const now = Date.now();
    const minutesToArrival = (arrivalTime - now) / 60000;

    if (minutesToArrival > 0 && minutesToArrival < 60) {
      const drainRate = (100 - batteryLevel) / Math.max(minutesToArrival, 1);
      const minutesUntilDead = batteryLevel / Math.max(drainRate, 0.1);

      if (minutesUntilDead < minutesToArrival + 10) {
        const recentAlert = await query(
          `SELECT id FROM alerts WHERE child_id = $1 AND alert_type = 'battery_risk' AND created_at > NOW() - INTERVAL '30 minutes'`,
          [childId]
        );

        if (recentAlert.length === 0) {
          const alert = await query(
            `INSERT INTO alerts (session_id, child_id, alert_type, message, severity)
             VALUES ($1, $2, 'battery_risk', $3, 'high') RETURNING *`,
            [sessionId, childId, `Battery ${batteryLevel}% — may die before arrival at ${trip.destination_name || 'destination'}`]
          );

          const io = getSocketIO();
          if (io) io.to(`child_${childId}`).emit('alert:new', { alert: alert[0] });
        }
      }
    }
  }
}

export async function checkSignalStrength(childId: number, sessionId: string, networkType: string | null, isOnline: boolean) {
  if (networkType === '2g' || networkType === '3g') {
    const recentAlert = await query(
      `SELECT id FROM alerts WHERE child_id = $1 AND alert_type = 'poor_signal' AND created_at > NOW() - INTERVAL '15 minutes'`,
      [childId]
    );

    if (recentAlert.length === 0) {
      const alert = await query(
        `INSERT INTO alerts (session_id, child_id, alert_type, message, severity)
         VALUES ($1, $2, 'poor_signal', $3, 'low') RETURNING *`,
        [sessionId, childId, `Entering area with poor coverage (${networkType})`]
      );

      const io = getSocketIO();
      if (io) io.to(`child_${childId}`).emit('alert:new', { alert: alert[0] });
    }
  }

  if (!isOnline) {
    const recentOffline = await query(
      `SELECT id FROM alerts WHERE child_id = $1 AND alert_type = 'offline' AND created_at > NOW() - INTERVAL '5 minutes'`,
      [childId]
    );

    if (recentOffline.length === 0) {
      const alert = await query(
        `INSERT INTO alerts (session_id, child_id, alert_type, message, severity)
         VALUES ($1, $2, 'offline', 'Child device is offline', 'high') RETURNING *`,
        [sessionId, childId]
      );

      const io = getSocketIO();
      if (io) io.to(`child_${childId}`).emit('alert:new', { alert: alert[0] });
    }
  }
}
