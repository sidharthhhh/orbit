import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api';
import { ChildProfile } from '../../types';
import {
  FiGlobe, FiSmartphone, FiClock, FiShield, FiAlertTriangle,
  FiEye, FiPlus, FiTrash2, FiCheck, FiTrendingUp, FiTrendingDown,
  FiMinus, FiActivity, FiBarChart2, FiPieChart
} from 'react-icons/fi';

interface Props { child: ChildProfile }

const CATEGORIES: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  social_media: { label: 'Social', color: 'text-pink-400', bg: 'bg-pink-500/15', icon: '📱' },
  messaging: { label: 'Chat', color: 'text-green-400', bg: 'bg-green-500/15', icon: '💬' },
  games: { label: 'Games', color: 'text-purple-400', bg: 'bg-purple-500/15', icon: '🎮' },
  gaming: { label: 'Games', color: 'text-purple-400', bg: 'bg-purple-500/15', icon: '🎮' },
  video: { label: 'Video', color: 'text-red-400', bg: 'bg-red-500/15', icon: '📺' },
  education: { label: 'Edu', color: 'text-blue-400', bg: 'bg-blue-500/15', icon: '📚' },
  search: { label: 'Search', color: 'text-cyan-400', bg: 'bg-cyan-500/15', icon: '🔍' },
  shopping: { label: 'Shop', color: 'text-yellow-400', bg: 'bg-yellow-500/15', icon: '🛒' },
  music: { label: 'Music', color: 'text-indigo-400', bg: 'bg-indigo-500/15', icon: '🎵' },
  adult_flag: { label: 'Adult', color: 'text-red-500', bg: 'bg-red-600/15', icon: '⚠️' },
  other: { label: 'Other', color: 'text-white/40', bg: 'bg-white/5', icon: '🌐' },
};

const formatTime = (s: number) => {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export default function MonitoringPanel({ child }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'apps' | 'websites' | 'patterns' | 'flags' | 'rules'>('overview');
  const [days, setDays] = useState(7);
  const [blockValue, setBlockValue] = useState('');
  const [blockType, setBlockType] = useState<'app' | 'website'>('website');

  const { data: todayData } = useQuery({
    queryKey: ['todayUsage', child.id],
    queryFn: () => api.getTodayUsage(child.id),
    refetchInterval: 15000,
  });

  const { data: currentData } = useQuery({
    queryKey: ['currentUsage', child.id],
    queryFn: () => api.getCurrentUsage(child.id),
    refetchInterval: 10000,
  });

  const { data: trendsData } = useQuery({
    queryKey: ['usageTrends', child.id, days],
    queryFn: () => api.getUsageTrends(child.id, days),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', child.id, days],
    queryFn: () => api.getCategoryBreakdown(child.id, days),
    enabled: tab === 'overview' || tab === 'patterns',
  });

  const { data: hourlyData } = useQuery({
    queryKey: ['hourly', child.id, days],
    queryFn: () => api.getHourlyPattern(child.id, days),
    enabled: tab === 'patterns',
  });

  const { data: appsData } = useQuery({
    queryKey: ['apps', child.id, days],
    queryFn: () => api.getAppUsage(child.id, days),
    enabled: tab === 'apps',
  });

  const { data: websitesData } = useQuery({
    queryKey: ['websites', child.id, days],
    queryFn: () => api.getWebsiteUsage(child.id, days),
    enabled: tab === 'websites',
  });

  const { data: flagsData } = useQuery({
    queryKey: ['contentFlags', child.id],
    queryFn: () => api.getContentFlags(child.id, true),
    enabled: tab === 'flags',
    refetchInterval: 10000,
  });

  const { data: blockedData } = useQuery({
    queryKey: ['blocked', child.id],
    queryFn: () => api.getBlockedItems(child.id),
    enabled: tab === 'rules',
  });

  const resolveFlag = useMutation({
    mutationFn: (id: number) => api.resolveContentFlag(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contentFlags', child.id] }),
  });

  const blockItem = useMutation({
    mutationFn: () => api.blockItem({ child_id: child.id, item_type: blockType, item_value: blockValue }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['blocked', child.id] }); setBlockValue(''); },
  });

  const unblockItem = useMutation({
    mutationFn: (id: number) => api.unblockItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blocked', child.id] }),
  });

  const summary = todayData?.summary;
  const current = currentData?.current;
  const trends = trendsData;
  const categories = categoriesData?.categories || [];
  const hourly = hourlyData?.hourly || [];
  const apps = appsData?.apps || [];
  const websites = websitesData?.websites || [];
  const flags = flagsData?.flags || [];
  const blocked = blockedData?.blocked || [];

  const maxMinutes = Math.max(...hourly.map((h: any) => h.minutes), 1);

  return (
    <div className="space-y-3">
      {/* Current Usage Indicator */}
      <AnimatePresence>
        {current && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs text-green-400 font-medium">Currently using:</span>
            <span className="text-xs text-white/70 truncate flex-1">
              {current.type === 'app' ? current.name : current.title || current.name}
            </span>
            <span className="text-[10px] text-white/30">
              {CATEGORIES[current.category]?.icon || '🌐'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
          <FiEye className="w-3 h-3" /> Screen Time & Usage
        </h3>
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          className="bg-white/[0.06] border border-white/[0.1] rounded-lg px-2 py-1 text-xs text-white/60">
          <option value={1}>Today</option>
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
        </select>
      </div>

      {/* Today Summary Cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-2">
          <div className="glass-card p-2 text-center">
            <div className="text-lg font-bold text-white">{summary.today_total_hours}h</div>
            <div className="text-[10px] text-white/30">Today</div>
          </div>
          <div className="glass-card p-2 text-center">
            <div className="text-lg font-bold text-blue-400">{summary.unique_apps_today}</div>
            <div className="text-[10px] text-white/30">Apps</div>
          </div>
          <div className="glass-card p-2 text-center">
            <div className="text-lg font-bold text-purple-400">{summary.unique_sites_today}</div>
            <div className="text-[10px] text-white/30">Sites</div>
          </div>
        </div>
      )}

      {/* Trend Indicator */}
      {trends && trends.trend !== 'insufficient_data' && (
        <div className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
          trends.trend === 'increasing' ? 'bg-red-500/10 text-red-400' :
          trends.trend === 'decreasing' ? 'bg-green-500/10 text-green-400' :
          'bg-white/5 text-white/40'
        }`}>
          {trends.trend === 'increasing' ? <FiTrendingUp className="w-3.5 h-3.5" /> :
           trends.trend === 'decreasing' ? <FiTrendingDown className="w-3.5 h-3.5" /> :
           <FiMinus className="w-3.5 h-3.5" />}
          <span>Screen time {trends.trend} ({trends.change_pct > 0 ? '+' : ''}{trends.change_pct}%)</span>
          <span className="text-white/20 ml-auto">Avg: {Math.round(trends.avg_minutes / 60 * 10) / 10}h/day</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white/[0.03] rounded-lg p-0.5">
        {([['overview', FiPieChart], ['apps', FiSmartphone], ['websites', FiGlobe], ['patterns', FiBarChart2], ['flags', FiAlertTriangle], ['rules', FiShield]] as const).map(([t, Icon]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-1.5 px-1 rounded-md text-[10px] font-medium transition-all ${
              tab === t ? 'bg-white/[0.1] text-white' : 'text-white/30 hover:text-white/50'
            }`}>
            <Icon className="w-3 h-3 mx-auto" />
          </button>
        ))}
      </div>

      {/* Overview Tab - Category Breakdown */}
      {tab === 'overview' && (
        <div className="space-y-2">
          <div className="text-xs text-white/30 mb-1">Category Breakdown</div>
          {categories.length === 0 ? (
            <p className="text-white/20 text-xs text-center py-4">No data yet</p>
          ) : categories.map((cat: any, i: number) => {
            const meta = CATEGORIES[cat.category] || CATEGORIES.other;
            return (
              <motion.div key={cat.category} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{meta.icon}</span>
                    <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">{formatTime(cat.seconds)}</span>
                    <span className="text-[10px] text-white/20 w-8 text-right">{cat.percentage}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${cat.percentage}%` }}
                    className={`h-full rounded-full ${meta.bg.replace('/15', '')}`}
                    style={{ background: meta.color.replace('text-', '').replace('400', '') }} />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Apps Tab */}
      {tab === 'apps' && (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {apps.length === 0 ? (
            <p className="text-white/20 text-xs text-center py-4">No app data yet</p>
          ) : apps.map((a: any, i: number) => {
            const meta = CATEGORIES[a.category] || CATEGORIES.other;
            const totalAll = apps.reduce((s: number, x: any) => s + x.total_seconds, 0);
            const pct = totalAll > 0 ? ((a.total_seconds / totalAll) * 100).toFixed(0) : 0;
            return (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03]">
                <span className="text-sm">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{a.app_name}</div>
                  <div className="text-[10px] text-white/20">{a.sessions} sessions · {pct}% of total</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-white/50 font-mono font-medium">{formatTime(a.total_seconds)}</div>
                  <div className="text-[10px] text-white/20">last: {a.last_used ? new Date(a.last_used).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Websites Tab */}
      {tab === 'websites' && (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {websites.length === 0 ? (
            <p className="text-white/20 text-xs text-center py-4">No website data yet</p>
          ) : websites.map((w: any, i: number) => {
            const meta = CATEGORIES[w.category] || CATEGORIES.other;
            return (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03]">
                <span className="text-sm">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{w.domain}</div>
                  <div className="text-[10px] text-white/20">{w.visits} visits</div>
                </div>
                <div className={`text-[10px] px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>{meta.label}</div>
                <div className="text-xs text-white/40 font-mono">{formatTime(w.total_seconds)}</div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Patterns Tab */}
      {tab === 'patterns' && (
        <div className="space-y-3">
          <div className="text-xs text-white/30">Hourly Usage Pattern</div>
          <div className="glass-card p-3">
            <div className="flex items-end gap-0.5 h-24">
              {hourly.map((h: any) => (
                <div key={h.hour} className="flex-1 flex flex-col items-center gap-0.5">
                  <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max((h.minutes / maxMinutes) * 100, 2)}%` }}
                    className={`w-full rounded-t ${h.hour === hourlyData?.peak_hour ? 'bg-blue-500' : 'bg-white/20'}`}
                    title={`${h.hour}:00 — ${h.minutes}m`} />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[8px] text-white/20 mt-1">
              <span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>11p</span>
            </div>
            {hourlyData?.peak_hour !== undefined && (
              <div className="text-[10px] text-white/30 mt-2 text-center">
                Peak: {hourlyData.peak_hour}:00 ({hourlyData.peak_minutes}m)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Flags Tab */}
      {tab === 'flags' && (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {flags.length === 0 ? (
            <div className="text-center py-4">
              <FiShield className="w-6 h-6 text-green-400 mx-auto mb-1" />
              <p className="text-white/20 text-xs">No content flags</p>
            </div>
          ) : flags.map((f: any) => (
            <motion.div key={f.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              className={`p-2.5 rounded-lg border ${
                f.severity === 'critical' ? 'bg-red-500/15 border-red-500/30' :
                f.severity === 'high' ? 'bg-orange-500/15 border-orange-500/30' :
                'bg-yellow-500/15 border-yellow-500/30'
              }`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-medium">{f.flag_type.replace(/_/g, ' ')}</div>
                  <div className="text-[10px] text-white/40 mt-0.5">{f.source_detail}</div>
                  <div className="text-[10px] text-white/20 mt-0.5">{new Date(f.created_at).toLocaleString()}</div>
                </div>
                <button onClick={() => resolveFlag.mutate(f.id)} className="p-1 hover:bg-white/10 rounded">
                  <FiCheck className="w-3 h-3 text-green-400" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Rules Tab */}
      {tab === 'rules' && (
        <div className="space-y-3">
          <div className="glass-card p-3 space-y-2">
            <div className="text-xs font-medium text-white/50">Block App / Website</div>
            <div className="flex gap-1.5">
              <select value={blockType} onChange={e => setBlockType(e.target.value as any)}
                className="bg-white/[0.06] border border-white/[0.1] rounded-lg px-2 py-1.5 text-xs">
                <option value="website">Website</option>
                <option value="app">App</option>
              </select>
              <input type="text" value={blockValue} onChange={e => setBlockValue(e.target.value)}
                className="input-field flex-1 text-xs py-1.5" placeholder={blockType === 'website' ? 'example.com' : 'App Name'} />
              <button onClick={() => blockItem.mutate()} disabled={!blockValue} className="btn-primary px-3 py-1.5 text-xs">
                <FiPlus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {blocked.length > 0 && (
            <div className="space-y-1">
              {blocked.map((b: any) => (
                <div key={b.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03]">
                  <span className="text-xs">{b.item_type === 'app' ? '📱' : '🌐'}</span>
                  <span className="text-xs flex-1 truncate">{b.item_value}</span>
                  <button onClick={() => unblockItem.mutate(b.id)} className="p-1 hover:bg-red-500/20 rounded">
                    <FiTrash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
