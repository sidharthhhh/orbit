import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  logWebsiteUsage, logAppUsage, checkScreenTimeRules,
  getWebsiteStats, getAppStats, getDailyScreenTime,
  getCategoryBreakdown, getHourlyPattern, getCurrentUsage,
  getUsageTrends, getTopAppsToday, getTopWebsitesToday, getUsageSummary
} from '../services/monitoring.js';
import { getSocketIO } from '../socket/index.js';

const router = Router();

// ============================================================
// WEBSITE MONITORING INGESTION (from tracker/native app)
// ============================================================
const websiteSchema = z.object({
  child_id: z.number().int(),
  session_id: z.string().uuid().optional(),
  domain: z.string().min(1).max(255),
  title: z.string().max(255).optional(),
  duration_seconds: z.number().int().min(0).optional(),
});

router.post('/website', rateLimit({ windowMs: 60_000, max: 60, name: 'monitor-website' }), validateBody(websiteSchema), async (req: Request, res: Response) => {
  try {
    const { child_id, session_id, domain, title, duration_seconds } = req.body;
    const result = await logWebsiteUsage(child_id, session_id || null, domain, title, duration_seconds);
    if (!result) return res.status(404).json({ error: 'Child not found or website monitoring not enabled' });

    const io = getSocketIO();
    if (io) io.to(`child_${child_id}`).emit('monitoring:website', { usage: result });

    res.status(201).json({ usage: result });
  } catch (err) {
    console.error('Website monitoring error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// APP MONITORING INGESTION (from native app)
// ============================================================
const appSchema = z.object({
  child_id: z.number().int(),
  session_id: z.string().uuid().optional(),
  app_name: z.string().min(1).max(100),
  app_package: z.string().max(255).optional(),
  category: z.string().max(30).optional(),
  duration_seconds: z.number().int().min(0).optional(),
  is_foreground: z.boolean().optional(),
});

router.post('/app', rateLimit({ windowMs: 60_000, max: 60, name: 'monitor-app' }), validateBody(appSchema), async (req: Request, res: Response) => {
  try {
    const { child_id, session_id, app_name, app_package, category, duration_seconds, is_foreground } = req.body;
    const result = await logAppUsage(child_id, session_id || null, app_name, app_package, category, duration_seconds, is_foreground);
    if (!result) return res.status(404).json({ error: 'Child not found or app monitoring not enabled' });

    // Check screen time rules
    checkScreenTimeRules(child_id, app_name, category).catch(() => {});

    const io = getSocketIO();
    if (io) io.to(`child_${child_id}`).emit('monitoring:app', { usage: result });

    res.status(201).json({ usage: result });
  } catch (err) {
    console.error('App monitoring error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// PARENT DASHBOARD QUERIES
// ============================================================
router.get('/websites/:childId', requireAuth, async (req: Request, res: Response) => {
  try {
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [req.params.childId, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const days = Math.min(parseInt(req.query.days as string) || 7, 30);
    const stats = await getWebsiteStats(child[0].id, days);
    res.json({ websites: stats });
  } catch (err) {
    console.error('Get websites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/apps/:childId', requireAuth, async (req: Request, res: Response) => {
  try {
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [req.params.childId, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const days = Math.min(parseInt(req.query.days as string) || 7, 30);
    const stats = await getAppStats(child[0].id, days);
    res.json({ apps: stats });
  } catch (err) {
    console.error('Get apps error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/screentime/:childId', requireAuth, async (req: Request, res: Response) => {
  try {
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [req.params.childId, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const days = Math.min(parseInt(req.query.days as string) || 7, 30);
    const daily = await getDailyScreenTime(child[0].id, days);
    res.json({ daily });
  } catch (err) {
    console.error('Get screen time error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// ADVANCED ANALYTICS
// ============================================================
router.get('/categories/:childId', requireAuth, async (req: Request, res: Response) => {
  try {
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [req.params.childId, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const days = Math.min(parseInt(req.query.days as string) || 7, 30);
    const categories = await getCategoryBreakdown(child[0].id, days);
    res.json({ categories });
  } catch (err) {
    console.error('Get categories error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/hourly/:childId', requireAuth, async (req: Request, res: Response) => {
  try {
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [req.params.childId, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const days = Math.min(parseInt(req.query.days as string) || 7, 30);
    const hourly = await getHourlyPattern(child[0].id, days);
    res.json(hourly);
  } catch (err) {
    console.error('Get hourly error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/current/:childId', requireAuth, async (req: Request, res: Response) => {
  try {
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [req.params.childId, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const current = await getCurrentUsage(child[0].id);
    res.json({ current });
  } catch (err) {
    console.error('Get current error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/trends/:childId', requireAuth, async (req: Request, res: Response) => {
  try {
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [req.params.childId, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const days = Math.min(parseInt(req.query.days as string) || 14, 30);
    const trends = await getUsageTrends(child[0].id, days);
    res.json(trends);
  } catch (err) {
    console.error('Get trends error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/today/:childId', requireAuth, async (req: Request, res: Response) => {
  try {
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [req.params.childId, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const [topApps, topWebsites, summary] = await Promise.all([
      getTopAppsToday(child[0].id),
      getTopWebsitesToday(child[0].id),
      getUsageSummary(child[0].id),
    ]);
    res.json({ top_apps: topApps, top_websites: topWebsites, summary });
  } catch (err) {
    console.error('Get today error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// CONTENT FLAGS
// ============================================================
router.get('/flags/:childId', requireAuth, async (req: Request, res: Response) => {
  try {
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [req.params.childId, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const unresolvedOnly = req.query.unresolved === 'true';
    let sql = `SELECT * FROM content_flags WHERE child_id = $1`;
    const params: unknown[] = [child[0].id];
    if (unresolvedOnly) { sql += ` AND resolved = false`; }
    sql += ` ORDER BY created_at DESC LIMIT 100`;
    const result = await query(sql, params);
    res.json({ flags: result });
  } catch (err) {
    console.error('Get content flags error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/flags/:id/resolve', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `UPDATE content_flags SET resolved = true, resolved_by = $1 WHERE id = $2 RETURNING *`,
      [req.user!.display_name, req.params.id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Flag not found' });
    res.json({ flag: result[0] });
  } catch (err) {
    console.error('Resolve flag error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// SCREEN TIME RULES
// ============================================================
const screenTimeRuleSchema = z.object({
  child_id: z.number().int(),
  rule_type: z.enum(['daily_limit', 'category_limit', 'app_limit', 'bedtime', 'homework_time']),
  target: z.string().max(100).optional(),
  limit_minutes: z.number().int().min(1).optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  active_days: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
});

router.post('/screen-time-rules', requireAuth, validateBody(screenTimeRuleSchema), async (req: Request, res: Response) => {
  try {
    const { child_id, rule_type, target, limit_minutes, start_time, end_time, active_days } = req.body;
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [child_id, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });

    const result = await query(
      `INSERT INTO screen_time_rules (child_id, rule_type, target, limit_minutes, start_time, end_time, active_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [child_id, rule_type, target || null, limit_minutes || null, start_time || null, end_time || null, active_days]
    );

    res.status(201).json({ rule: result[0] });
  } catch (err) {
    console.error('Create screen time rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/screen-time-rules/:childId', requireAuth, async (req: Request, res: Response) => {
  try {
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [req.params.childId, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const result = await query(`SELECT * FROM screen_time_rules WHERE child_id = $1 AND is_active = true`, [child[0].id]);
    res.json({ rules: result });
  } catch (err) {
    console.error('Get screen time rules error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/screen-time-rules/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `DELETE FROM screen_time_rules str USING child_profiles cp WHERE str.child_id = cp.id AND str.id = $1 AND cp.parent_id = $2 RETURNING str.id`,
      [req.params.id, req.user!.id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete screen time rule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// BLOCKED APPS/SITES
// ============================================================
const blockedSchema = z.object({
  child_id: z.number().int(),
  item_type: z.enum(['app', 'website']),
  item_value: z.string().min(1).max(255),
  reason: z.string().max(255).optional(),
});

router.post('/blocked', requireAuth, validateBody(blockedSchema), async (req: Request, res: Response) => {
  try {
    const { child_id, item_type, item_value, reason } = req.body;
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [child_id, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });

    const result = await query(
      `INSERT INTO blocked_items (child_id, item_type, item_value, reason) VALUES ($1, $2, $3, $4) RETURNING *`,
      [child_id, item_type, item_value, reason || null]
    );
    res.status(201).json({ blocked: result[0] });
  } catch (err) {
    console.error('Block item error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/blocked/:childId', requireAuth, async (req: Request, res: Response) => {
  try {
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [req.params.childId, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const result = await query(`SELECT * FROM blocked_items WHERE child_id = $1 AND is_active = true`, [child[0].id]);
    res.json({ blocked: result });
  } catch (err) {
    console.error('Get blocked items error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/blocked/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `DELETE FROM blocked_items bi USING child_profiles cp WHERE bi.child_id = cp.id AND bi.id = $1 AND cp.parent_id = $2 RETURNING bi.id`,
      [req.params.id, req.user!.id]
    );
    if (result.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Unblock item error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// MONITORING CONSENT
// ============================================================
const monitoringConsentSchema = z.object({
  child_id: z.number().int(),
  consent_type: z.enum(['website_monitoring', 'app_monitoring', 'screen_time', 'content_safety']),
  granted: z.boolean(),
});

router.post('/consent', rateLimit({ windowMs: 60_000, max: 10, name: 'monitor-consent' }), validateBody(monitoringConsentSchema), async (req: Request, res: Response) => {
  try {
    const { child_id, consent_type, granted } = req.body;

    await query(
      `INSERT INTO monitoring_consent (child_id, consent_type, granted, granted_at, actor)
       VALUES ($1, $2, $3, ${granted ? 'NOW()' : 'NULL'}, 'child')`,
      [child_id, consent_type, granted]
    );

    const fieldMap: Record<string, string> = {
      website_monitoring: 'website_monitoring',
      app_monitoring: 'app_monitoring',
      screen_time: 'screen_time_enabled',
      content_safety: 'content_safety_enabled',
    };

    const field = fieldMap[consent_type];
    if (field) {
      await query(`UPDATE child_profiles SET ${field} = $1 WHERE id = $2`, [granted, child_id]);
    }

    if (granted) {
      await query(`UPDATE child_profiles SET monitoring_enabled = true WHERE id = $1`, [child_id]);
    }

    await query(
      `INSERT INTO consent_log (child_id, event, actor, metadata) VALUES ($1, $2, 'child', $3)`,
      [child_id, `monitoring_${consent_type}_${granted ? 'granted' : 'revoked'}`, JSON.stringify({ consent_type, granted })]
    );

    const io = getSocketIO();
    if (io) io.to(`child_${child_id}`).emit('monitoring:consent', { consent_type, granted });

    res.json({ ok: true, granted });
  } catch (err) {
    console.error('Monitoring consent error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/consent/:childId', requireAuth, async (req: Request, res: Response) => {
  try {
    const child = await query('SELECT id FROM child_profiles WHERE id = $1 AND parent_id = $2', [req.params.childId, req.user!.id]);
    if (child.length === 0) return res.status(404).json({ error: 'Child not found' });
    const result = await query(
      `SELECT DISTINCT ON (consent_type) consent_type, granted, granted_at, revoked_at FROM monitoring_consent
       WHERE child_id = $1 ORDER BY consent_type, created_at DESC`,
      [child[0].id]
    );
    res.json({ consents: result });
  } catch (err) {
    console.error('Get monitoring consent error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
