import { query } from '../db/connection.js';
import { getSocketIO } from '../socket/index.js';

const DOMAIN_CATEGORIES: Record<string, string> = {
  'facebook.com': 'social_media', 'instagram.com': 'social_media', 'tiktok.com': 'social_media',
  'twitter.com': 'social_media', 'x.com': 'social_media', 'snapchat.com': 'social_media',
  'reddit.com': 'social_media', 'pinterest.com': 'social_media', 'tumblr.com': 'social_media',
  'linkedin.com': 'social_media', 'threads.net': 'social_media',
  'whatsapp.com': 'messaging', 'telegram.org': 'messaging', 'discord.com': 'messaging',
  'signal.org': 'messaging', 'slack.com': 'messaging', 'messenger.com': 'messaging',
  'youtube.com': 'video', 'netflix.com': 'video', 'twitch.tv': 'video', 'vimeo.com': 'video',
  'disneyplus.com': 'video', 'hbomax.com': 'video', 'primevideo.com': 'video', 'hotstar.com': 'video',
  'roblox.com': 'games', 'minecraft.net': 'games', 'epicgames.com': 'games',
  'store.steampowered.com': 'games', 'chess.com': 'games', 'lichess.org': 'games',
  'khanacademy.org': 'education', 'coursera.org': 'education', 'duolingo.com': 'education',
  'wikipedia.org': 'education', 'scholar.google.com': 'education', 'byjus.com': 'education',
  'google.com': 'search', 'bing.com': 'search', 'duckduckgo.com': 'search',
  'amazon.com': 'shopping', 'ebay.com': 'shopping', 'flipkart.com': 'shopping',
  'spotify.com': 'music', 'music.apple.com': 'music', 'soundcloud.com': 'music',
};

const SUSPICIOUS_KEYWORDS = [
  'suicide', 'self-harm', 'kill myself', 'want to die', 'cutting',
  'drugs', 'buy drugs', 'cocaine', 'heroin', 'pills',
  'gun', 'weapon', 'bomb', 'kill', 'shoot',
  'nude', 'naked', 'porn', 'xxx', 'explicit',
  'meet stranger', 'send photo', 'dont tell', 'secret friend',
];

export function categorizeDomain(domain: string): string {
  const clean = domain.toLowerCase().replace(/^www\./, '');
  for (const [key, cat] of Object.entries(DOMAIN_CATEGORIES)) {
    if (clean === key || clean.endsWith('.' + key)) return cat;
  }
  return 'other';
}

export async function logWebsiteUsage(childId: number, sessionId: string | null, domain: string, title?: string, duration?: number) {
  const child = await query(`SELECT website_monitoring FROM child_profiles WHERE id = $1 AND website_monitoring = true`, [childId]);
  if (child.length === 0) return null;

  const category = categorizeDomain(domain);
  const cleanDomain = domain.toLowerCase().replace(/^www\./, '').split('/')[0];

  const result = await query(
    `INSERT INTO website_usage (child_id, session_id, domain, title, category, duration_seconds)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [childId, sessionId, cleanDomain, title || null, category, duration || 0]
  );

  if (category === 'adult_flag') await createContentFlag(childId, sessionId, 'adult_content', 'website', cleanDomain, 'high');
  if (title) checkSuspiciousContent(childId, sessionId, title, 'website', cleanDomain);

  const io = getSocketIO();
  if (io) io.to(`child_${childId}`).emit('monitoring:website', { usage: result[0] });

  return result[0];
}

export async function logAppUsage(childId: number, sessionId: string | null, appName: string, appPackage?: string, category?: string, duration?: number, isForeground?: boolean) {
  const child = await query(`SELECT app_monitoring FROM child_profiles WHERE id = $1 AND app_monitoring = true`, [childId]);
  if (child.length === 0) return null;

  const result = await query(
    `INSERT INTO app_usage (child_id, session_id, app_name, app_package, category, duration_seconds, is_foreground)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [childId, sessionId, appName, appPackage || null, category || 'other', duration || 0, isForeground ?? true]
  );

  checkScreenTimeRules(childId, appName, category).catch(() => {});

  const io = getSocketIO();
  if (io) io.to(`child_${childId}`).emit('monitoring:app', { usage: result[0] });

  return result[0];
}

export async function checkScreenTimeRules(childId: number, appName?: string, category?: string) {
  const rules = await query(`SELECT * FROM screen_time_rules WHERE child_id = $1 AND is_active = true`, [childId]);
  const now = new Date();
  const currentDay = now.getDay();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  for (const rule of rules) {
    if (!rule.active_days.includes(currentDay)) continue;

    if (rule.rule_type === 'bedtime' && rule.start_time && rule.end_time) {
      if (currentTime >= rule.start_time && currentTime <= rule.end_time) {
        await query(`INSERT INTO screen_time_violations (child_id, rule_id, violation_type, details) VALUES ($1, $2, 'bedtime_violation', $3)`, [childId, rule.id, JSON.stringify({ time: currentTime })]);
        await createContentFlag(childId, null, 'excessive_usage', 'usage_pattern', `Bedtime violation at ${currentTime}`, 'medium');
      }
    }

    if (rule.rule_type === 'daily_limit' && rule.limit_minutes) {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const usage = await query(`SELECT COALESCE(SUM(duration_seconds), 0) as total FROM app_usage WHERE child_id = $1 AND used_at >= $2`, [childId, todayStart]);
      const webUsage = await query(`SELECT COALESCE(SUM(duration_seconds), 0) as total FROM website_usage WHERE child_id = $1 AND visited_at >= $2`, [childId, todayStart]);
      const totalMin = ((usage[0]?.total || 0) + (webUsage[0]?.total || 0)) / 60;
      if (totalMin > rule.limit_minutes) {
        await query(`INSERT INTO screen_time_violations (child_id, rule_id, violation_type, details) VALUES ($1, $2, 'limit_exceeded', $3)`, [childId, rule.id, JSON.stringify({ used_minutes: Math.round(totalMin), limit_minutes: rule.limit_minutes })]);
      }
    }

    if (rule.rule_type === 'app_limit' && rule.target && rule.limit_minutes && appName === rule.target) {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const usage = await query(`SELECT COALESCE(SUM(duration_seconds), 0) as total FROM app_usage WHERE child_id = $1 AND app_name = $2 AND used_at >= $3`, [childId, rule.target, todayStart]);
      if ((usage[0]?.total || 0) / 60 > rule.limit_minutes) {
        await query(`INSERT INTO screen_time_violations (child_id, rule_id, violation_type, details) VALUES ($1, $2, 'limit_exceeded', $3)`, [childId, rule.id, JSON.stringify({ app: rule.target })]);
      }
    }
  }
}

async function checkSuspiciousContent(childId: number, sessionId: string | null, text: string, source: string, sourceDetail: string) {
  const lower = text.toLowerCase();
  for (const kw of SUSPICIOUS_KEYWORDS) {
    if (lower.includes(kw)) {
      const severity = ['suicide', 'self-harm', 'kill myself', 'want to die'].includes(kw) ? 'critical' :
                       ['nude', 'naked', 'porn', 'xxx'].includes(kw) ? 'high' : 'medium';
      await createContentFlag(childId, sessionId, 'harmful_keyword', source as any, `${sourceDetail}: "${kw}"`, severity);
      return;
    }
  }
}

async function createContentFlag(childId: number, sessionId: string | null, flagType: string, source: string, sourceDetail: string, severity: string) {
  const recent = await query(`SELECT id FROM content_flags WHERE child_id = $1 AND flag_type = $2 AND source_detail = $3 AND created_at > NOW() - INTERVAL '1 hour'`, [childId, flagType, sourceDetail]);
  if (recent.length > 0) return;

  const result = await query(
    `INSERT INTO content_flags (child_id, session_id, flag_type, source, source_detail, severity) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [childId, sessionId, flagType, source, sourceDetail, severity]
  );

  if (severity === 'critical' || severity === 'high') {
    const alert = await query(`INSERT INTO alerts (session_id, child_id, alert_type, message, severity) VALUES ($1, $2, 'content_flag', $3, $4) RETURNING *`, [sessionId, childId, `Content safety: ${flagType} — ${sourceDetail}`, severity]);
    const io = getSocketIO();
    if (io) io.to(`child_${childId}`).emit('alert:new', { alert: alert[0] });
  }
}

// ============================================================
// ANALYTICS QUERIES
// ============================================================

export async function getWebsiteStats(childId: number, days: number = 7) {
  const since = new Date(Date.now() - days * 86400000);
  return query(
    `SELECT domain, category, COUNT(*) as visits, SUM(duration_seconds) as total_seconds,
     MAX(visited_at) as last_visit, MIN(visited_at) as first_visit
     FROM website_usage WHERE child_id = $1 AND visited_at >= $2
     GROUP BY domain, category ORDER BY total_seconds DESC LIMIT 50`,
    [childId, since]
  );
}

export async function getAppStats(childId: number, days: number = 7) {
  const since = new Date(Date.now() - days * 86400000);
  return query(
    `SELECT app_name, category, COUNT(*) as sessions, SUM(duration_seconds) as total_seconds,
     MAX(used_at) as last_used, MIN(used_at) as first_used
     FROM app_usage WHERE child_id = $1 AND used_at >= $2
     GROUP BY app_name, category ORDER BY total_seconds DESC LIMIT 50`,
    [childId, since]
  );
}

export async function getDailyScreenTime(childId: number, days: number = 7) {
  const since = new Date(Date.now() - days * 86400000);
  const appData = await query(`SELECT DATE(used_at) as day, SUM(duration_seconds) as seconds FROM app_usage WHERE child_id = $1 AND used_at >= $2 GROUP BY DATE(used_at)`, [childId, since]);
  const webData = await query(`SELECT DATE(visited_at) as day, SUM(duration_seconds) as seconds FROM website_usage WHERE child_id = $1 AND visited_at >= $2 GROUP BY DATE(visited_at)`, [childId, since]);

  const merged: Record<string, number> = {};
  for (const row of appData) merged[row.day] = (merged[row.day] || 0) + (row.seconds || 0);
  for (const row of webData) merged[row.day] = (merged[row.day] || 0) + (row.seconds || 0);

  return Object.entries(merged).map(([day, seconds]) => ({ day, minutes: Math.round(seconds / 60), hours: +(seconds / 3600).toFixed(1) })).sort((a, b) => a.day.localeCompare(b.day));
}

export async function getCategoryBreakdown(childId: number, days: number = 7) {
  const since = new Date(Date.now() - days * 86400000);
  const appCats = await query(
    `SELECT category, SUM(duration_seconds) as total_seconds, COUNT(*) as count FROM app_usage
     WHERE child_id = $1 AND used_at >= $2 GROUP BY category`, [childId, since]
  );
  const webCats = await query(
    `SELECT category, SUM(duration_seconds) as total_seconds, COUNT(*) as count FROM website_usage
     WHERE child_id = $1 AND visited_at >= $2 GROUP BY category`, [childId, since]
  );

  const merged: Record<string, { seconds: number; count: number }> = {};
  for (const row of appCats) {
    merged[row.category] = { seconds: (merged[row.category]?.seconds || 0) + (row.total_seconds || 0), count: (merged[row.category]?.count || 0) + row.count };
  }
  for (const row of webCats) {
    merged[row.category] = { seconds: (merged[row.category]?.seconds || 0) + (row.total_seconds || 0), count: (merged[row.category]?.count || 0) + row.count };
  }

  const total = Object.values(merged).reduce((s, v) => s + v.seconds, 0);
  return Object.entries(merged)
    .map(([category, data]) => ({ category, seconds: data.seconds, minutes: Math.round(data.seconds / 60), count: data.count, percentage: total > 0 ? +((data.seconds / total) * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.seconds - a.seconds);
}

export async function getHourlyPattern(childId: number, days: number = 7) {
  const since = new Date(Date.now() - days * 86400000);
  const appHourly = await query(
    `SELECT EXTRACT(HOUR FROM used_at) as hour, SUM(duration_seconds) as seconds FROM app_usage
     WHERE child_id = $1 AND used_at >= $2 GROUP BY EXTRACT(HOUR FROM used_at)`, [childId, since]
  );
  const webHourly = await query(
    `SELECT EXTRACT(HOUR FROM visited_at) as hour, SUM(duration_seconds) as seconds FROM website_usage
     WHERE child_id = $1 AND visited_at >= $2 GROUP BY EXTRACT(HOUR FROM visited_at)`, [childId, since]
  );

  const hourly: Record<number, number> = {};
  for (let h = 0; h < 24; h++) hourly[h] = 0;
  for (const row of appHourly) hourly[row.hour] = (hourly[row.hour] || 0) + (row.seconds || 0);
  for (const row of webHourly) hourly[row.hour] = (hourly[row.hour] || 0) + (row.seconds || 0);

  const entries = Object.entries(hourly).map(([h, s]) => ({ hour: parseInt(h), minutes: Math.round(s / 60) }));
  const peak = entries.reduce((max, e) => e.minutes > max.minutes ? e : max, entries[0]);

  return { hourly: entries, peak_hour: peak.hour, peak_minutes: peak.minutes };
}

export async function getCurrentUsage(childId: number) {
  const recentApp = await query(
    `SELECT app_name, category, used_at, duration_seconds FROM app_usage
     WHERE child_id = $1 AND used_at > NOW() - INTERVAL '5 minutes'
     ORDER BY used_at DESC LIMIT 1`, [childId]
  );
  const recentWeb = await query(
    `SELECT domain, category, title, visited_at, duration_seconds FROM website_usage
     WHERE child_id = $1 AND visited_at > NOW() - INTERVAL '5 minutes'
     ORDER BY visited_at DESC LIMIT 1`, [childId]
  );

  let current = null;
  if (recentApp.length > 0 && recentWeb.length > 0) {
    current = new Date(recentApp[0].used_at) > new Date(recentWeb[0].visited_at)
      ? { type: 'app', name: recentApp[0].app_name, category: recentApp[0].category, since: recentApp[0].used_at }
      : { type: 'website', name: recentWeb[0].domain, category: recentWeb[0].category, title: recentWeb[0].title, since: recentWeb[0].visited_at };
  } else if (recentApp.length > 0) {
    current = { type: 'app', name: recentApp[0].app_name, category: recentApp[0].category, since: recentApp[0].used_at };
  } else if (recentWeb.length > 0) {
    current = { type: 'website', name: recentWeb[0].domain, category: recentWeb[0].category, title: recentWeb[0].title, since: recentWeb[0].visited_at };
  }

  return current;
}

export async function getUsageTrends(childId: number, days: number = 14) {
  const since = new Date(Date.now() - days * 86400000);
  const daily = await getDailyScreenTime(childId, days);

  if (daily.length < 2) return { trend: 'insufficient_data', daily, avg_minutes: 0, change_pct: 0 };

  const avg = daily.reduce((s, d) => s + d.minutes, 0) / daily.length;
  const recent3 = daily.slice(-3).reduce((s, d) => s + d.minutes, 0) / Math.min(3, daily.length);
  const older3 = daily.slice(0, 3).reduce((s, d) => s + d.minutes, 0) / Math.min(3, daily.length);

  const changePct = older3 > 0 ? +(((recent3 - older3) / older3) * 100).toFixed(1) : 0;
  const trend = changePct > 20 ? 'increasing' : changePct < -20 ? 'decreasing' : 'stable';

  return { trend, daily, avg_minutes: Math.round(avg), change_pct: changePct };
}

export async function getTopAppsToday(childId: number) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return query(
    `SELECT app_name, category, SUM(duration_seconds) as total_seconds, COUNT(*) as opens
     FROM app_usage WHERE child_id = $1 AND used_at >= $2
     GROUP BY app_name, category ORDER BY total_seconds DESC LIMIT 10`,
    [childId, todayStart]
  );
}

export async function getTopWebsitesToday(childId: number) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return query(
    `SELECT domain, category, SUM(duration_seconds) as total_seconds, COUNT(*) as visits
     FROM website_usage WHERE child_id = $1 AND visited_at >= $2
     GROUP BY domain, category ORDER BY total_seconds DESC LIMIT 10`,
    [childId, todayStart]
  );
}

export async function getUsageSummary(childId: number) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const appTotal = await query(`SELECT COALESCE(SUM(duration_seconds), 0) as total FROM app_usage WHERE child_id = $1 AND used_at >= $2`, [childId, todayStart]);
  const webTotal = await query(`SELECT COALESCE(SUM(duration_seconds), 0) as total FROM website_usage WHERE child_id = $1 AND visited_at >= $2`, [childId, todayStart]);
  const appCount = await query(`SELECT COUNT(DISTINCT app_name) as count FROM app_usage WHERE child_id = $1 AND used_at >= $2`, [childId, todayStart]);
  const webCount = await query(`SELECT COUNT(DISTINCT domain) as count FROM website_usage WHERE child_id = $1 AND visited_at >= $2`, [childId, todayStart]);

  const totalSeconds = (appTotal[0]?.total || 0) + (webTotal[0]?.total || 0);

  return {
    today_total_minutes: Math.round(totalSeconds / 60),
    today_total_hours: +(totalSeconds / 3600).toFixed(1),
    today_app_minutes: Math.round((appTotal[0]?.total || 0) / 60),
    today_web_minutes: Math.round((webTotal[0]?.total || 0) / 60),
    unique_apps_today: appCount[0]?.count || 0,
    unique_sites_today: webCount[0]?.count || 0,
  };
}
