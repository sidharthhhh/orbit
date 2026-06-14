import { query } from '../db/connection.js';
import { checkNoResponseEscalations } from '../services/escalation.js';
import { generateDailyDigests } from '../services/dailyDigest.js';

export async function cleanupOldData() {
  try {
    await query(`DELETE FROM live_locations WHERE recorded_at < NOW() - INTERVAL '30 days'`);
    await query(`DELETE FROM website_usage WHERE recorded_at < NOW() - INTERVAL '30 days'`);
    await query(`DELETE FROM app_usage WHERE recorded_at < NOW() - INTERVAL '30 days'`);
    await query(`DELETE FROM screen_time_violations WHERE created_at < NOW() - INTERVAL '30 days'`);
    await query(`DELETE FROM content_flags WHERE resolved = true AND created_at < NOW() - INTERVAL '7 days'`);
    console.log('Cleaned up old records');
  } catch (err) { console.error('Cleanup error:', err); }
}

export async function flagOverdueTrips() {
  try {
    const result = await query(
      `UPDATE trips SET status = 'overdue' WHERE status = 'active' AND expected_arrival IS NOT NULL AND expected_arrival < NOW() RETURNING *`
    );
    if (result.length > 0) console.log(`Flagged ${result.length} overdue trips`);
  } catch (err) { console.error('Overdue trips error:', err); }
}

export async function autoCloseIdleSessions() {
  try {
    const result = await query(
      `UPDATE tracking_sessions ts SET is_active = false, ended_at = NOW()
       WHERE ts.is_active = true
       AND NOT EXISTS (SELECT 1 FROM live_locations ll WHERE ll.session_id = ts.session_id AND ll.recorded_at > NOW() - INTERVAL '30 minutes')
       RETURNING ts.session_id`
    );
    if (result.length > 0) console.log(`Auto-closed ${result.length} idle sessions`);
  } catch (err) { console.error('Auto-close sessions error:', err); }
}

export async function cleanupExpiredGroupTrips() {
  try {
    await query(`UPDATE group_trips SET status = 'completed' WHERE status = 'active' AND expires_at < NOW()`);
    await query(`DELETE FROM live_sos_links WHERE expires_at < NOW()`);
    await query(`DELETE FROM pickup_confirmations WHERE expires_at < NOW() AND child_confirmed = false`);
  } catch (err) { console.error('Cleanup expired error:', err); }
}

export async function cleanupExpiredGuardians() {
  try {
    await query(`DELETE FROM guardian_roles WHERE expires_at IS NOT NULL AND expires_at < NOW()`);
  } catch (err) { console.error('Cleanup guardians error:', err); }
}

let jobInterval: NodeJS.Timeout | null = null;

export function startScheduledJobs() {
  cleanupOldData();
  flagOverdueTrips();
  autoCloseIdleSessions();
  checkNoResponseEscalations();
  generateDailyDigests();
  cleanupExpiredGroupTrips();
  cleanupExpiredGuardians();

  jobInterval = setInterval(() => {
    cleanupOldData();
    flagOverdueTrips();
    autoCloseIdleSessions();
    checkNoResponseEscalations();
    cleanupExpiredGroupTrips();
    cleanupExpiredGuardians();
  }, 5 * 60 * 1000);

  setInterval(() => { generateDailyDigests(); }, 60 * 60 * 1000);

  console.log('Scheduled jobs started');
}

export function stopScheduledJobs() {
  if (jobInterval) { clearInterval(jobInterval); jobInterval = null; }
}
