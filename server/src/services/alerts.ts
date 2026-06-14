import { query } from '../db/connection.js';
import { getSocketIO } from '../socket/index.js';

const batteryDebounce = new Map<number, number>();
const BATTERY_DEBOUNCE_MS = 10 * 60 * 1000; // 10 minutes

export async function checkLowBattery(childId: number, sessionId: string, batteryLevel: number) {
  if (batteryLevel >= 20) return;

  const lastAlert = batteryDebounce.get(childId) || 0;
  if (Date.now() - lastAlert < BATTERY_DEBOUNCE_MS) return;

  try {
    const result = await query(
      `INSERT INTO alerts (session_id, child_id, alert_type, message, severity)
       VALUES ($1, $2, 'low_battery', $3, $4) RETURNING *`,
      [sessionId, childId, `Child's battery is at ${batteryLevel}%`, batteryLevel < 10 ? 'critical' : 'high']
    );

    batteryDebounce.set(childId, Date.now());

    const io = getSocketIO();
    if (io) {
      io.to(`child_${childId}`).emit('alert:new', { alert: result[0] });
    }
  } catch (err) {
    console.error('Low battery alert error:', err);
  }
}

export async function createSOSAlert(childId: number, sessionId: string, lat?: number, lng?: number) {
  try {
    const result = await query(
      `INSERT INTO alerts (session_id, child_id, alert_type, message, severity)
       VALUES ($1, $2, 'sos', 'SOS triggered by child', 'critical') RETURNING *`,
      [sessionId, childId]
    );

    const io = getSocketIO();
    if (io) {
      io.to(`child_${childId}`).emit('alert:new', { alert: result[0], sos: true });
    }

    return result[0];
  } catch (err) {
    console.error('SOS alert error:', err);
    throw err;
  }
}
