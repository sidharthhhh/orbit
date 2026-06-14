import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { ChildProfile, LiveLocation, ConsentLogEntry } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  FiPlay, FiSquare, FiAlertTriangle, FiClock, FiWifi, FiBattery,
  FiMapPin, FiSend, FiEye, FiGlobe, FiAlertCircle, FiUsers, FiChevronRight, FiX, FiSmartphone
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import SettingsPanel from './settings/SettingsPanel';
import MonitoringPanel from './monitoring/MonitoringPanel';
import TripsPanel from './trips/TripsPanel';
import CheckinsPanel from './checkins/CheckinsPanel';

interface Props {
  child: ChildProfile;
}

export default function SidePanel({ child }: Props) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const [showConsent, setShowConsent] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMonitoring, setShowMonitoring] = useState(false);
  const [showTrips, setShowTrips] = useState(false);
  const [showCheckins, setShowCheckins] = useState(false);
  const [lastSeen, setLastSeen] = useState<string>('Never');

  const { data: locationData } = useQuery({
    queryKey: ['location', child.id],
    queryFn: () => api.getLatestLocation(child.id),
    refetchInterval: 3000,
  });

  const { data: consentData } = useQuery({
    queryKey: ['consent', child.id],
    queryFn: () => api.getConsentLog(child.id),
    enabled: showConsent,
  });

  const { data: alertsData } = useQuery({
    queryKey: ['alerts', child.id],
    queryFn: () => api.getAlerts(child.id),
    refetchInterval: 8000,
  });

  const location: LiveLocation | null = locationData?.location || null;
  const isIP = locationData?.is_ip_location || location?.location_source === 'ip';
  const unresolvedAlerts = (alertsData?.alerts || []).filter((a: any) => !a.resolved);

  useEffect(() => {
    if (!location?.recorded_at) return;
    const update = () => {
      const s = Math.floor((Date.now() - new Date(location.recorded_at).getTime()) / 1000);
      if (s < 10) setLastSeen('Just now');
      else if (s < 60) setLastSeen(`${s}s ago`);
      else if (s < 3600) setLastSeen(`${Math.floor(s / 60)}m ago`);
      else setLastSeen(`${Math.floor(s / 3600)}h ago`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [location?.recorded_at]);

  useEffect(() => {
    if (!socket) return;
    const handlers = [
      'location:update', 'session:paused', 'session:resumed',
      'session:stopped', 'alert:new', 'checkin:requested', 'checkin:responded'
    ];
    handlers.forEach(e => socket.on(e, () => {
      queryClient.invalidateQueries({ queryKey: ['location', child.id] });
      queryClient.invalidateQueries({ queryKey: ['alerts', child.id] });
      queryClient.invalidateQueries({ queryKey: ['children'] });
    }));
    return () => { handlers.forEach(e => socket.off(e)); };
  }, [socket, child.id, queryClient]);

  const startMut = useMutation({
    mutationFn: () => api.startSession({ child_id: child.id, started_by: 'parent' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['children'] }); toast.success('Tracking started'); },
    onError: (e: any) => toast.error(e.message),
  });

  const pauseMut = useMutation({
    mutationFn: (sessionId: string) => api.pauseSession({ session_id: sessionId, paused_by: 'parent' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['children'] }); toast.success('Paused'); },
    onError: (e: any) => toast.error(e.message),
  });

  const resumeMut = useMutation({
    mutationFn: (sessionId: string) => api.resumeSession(sessionId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['children'] }); toast.success('Resumed'); },
    onError: (e: any) => toast.error(e.message),
  });

  const stopMut = useMutation({
    mutationFn: (sessionId: string) => api.stopSession(sessionId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['children'] }); toast.success('Stopped'); },
    onError: (e: any) => toast.error(e.message),
  });

  const checkinMut = useMutation({
    mutationFn: () => api.requestCheckin({ child_id: child.id, session_id: location?.session_id || '' }),
    onSuccess: () => toast.success('Check-in requested'),
    onError: (e: any) => toast.error(e.message),
  });

  const resolveMut = useMutation({
    mutationFn: (id: number) => api.resolveAlert(id, user?.display_name || 'Parent'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts', child.id] }),
  });

  const batColor = (l: number | null) => !l ? 'text-white/30' : l > 50 ? 'text-green-400' : l > 20 ? 'text-orange-400' : 'text-red-400';
  const batBg = (l: number | null) => !l ? 'bg-white/10' : l > 50 ? 'bg-green-500/20' : l > 20 ? 'bg-orange-500/20' : 'bg-red-500/20';
  const sevColor = (s: string) => s === 'critical' ? 'bg-red-500/20 border-red-500/40 text-red-400' : s === 'high' ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' : s === 'medium' ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400' : 'bg-blue-500/20 border-blue-500/40 text-blue-400';
  const sevIcon = (t: string) => t === 'sos' ? '🚨' : t === 'low_battery' ? '🪫' : t === 'offline' ? '📡' : t === 'geofence_exit' ? '🚪' : t === 'geofence_enter' ? '🏠' : '⚠️';

  const sessionId = location?.session_id || '';
  const isPaused = false;

  return (
    <div className="p-4 space-y-4 h-full overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
          {child.photo_url ? <img src={child.photo_url} alt={child.name} className="w-12 h-12 rounded-full object-cover" /> : child.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-lg">{child.name}</h2>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${child.is_tracking ? 'bg-green-400 animate-pulse' : 'bg-white/20'}`} />
            <span className="text-xs text-white/50">{child.is_tracking ? 'Live tracking' : 'Offline'}</span>
          </div>
        </div>
        <button onClick={() => { setShowCheckins(!showCheckins); setShowTrips(false); setShowMonitoring(false); setShowSettings(false); }} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Check-ins">
          <FiSend className={`w-4 h-4 ${showCheckins ? 'text-blue-400' : 'text-white/50'}`} />
        </button>
        <button onClick={() => { setShowTrips(!showTrips); setShowCheckins(false); setShowMonitoring(false); setShowSettings(false); }} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Trips">
          <FiMapPin className={`w-4 h-4 ${showTrips ? 'text-blue-400' : 'text-white/50'}`} />
        </button>
        <button onClick={() => { setShowMonitoring(!showMonitoring); setShowTrips(false); setShowCheckins(false); setShowSettings(false); }} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Monitoring">
          <FiSmartphone className={`w-4 h-4 ${showMonitoring ? 'text-blue-400' : 'text-white/50'}`} />
        </button>
        <button onClick={() => { setShowSettings(!showSettings); setShowTrips(false); setShowCheckins(false); setShowMonitoring(false); }} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Settings">
          <FiUsers className={`w-4 h-4 ${showSettings ? 'text-blue-400' : 'text-white/50'}`} />
        </button>
      </motion.div>

      <AnimatePresence mode="wait">
        {showTrips && (
          <motion.div key="trips" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="glass-card p-3">
            <TripsPanel child={child} />
          </motion.div>
        )}
        {showCheckins && (
          <motion.div key="checkins" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="glass-card p-3">
            <CheckinsPanel child={child} />
          </motion.div>
        )}
        {showMonitoring && (
          <motion.div key="monitoring" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="glass-card p-3">
            <MonitoringPanel child={child} />
          </motion.div>
        )}
        {showSettings && (
          <motion.div key="settings" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <SettingsPanel child={child} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex gap-2">
        {child.is_tracking ? (
          <>
            <button onClick={() => sessionId && pauseMut.mutate(sessionId)} disabled={pauseMut.isPending} className="btn-ghost flex-1 flex items-center justify-center gap-2 text-sm">
              <FiAlertTriangle className="w-4 h-4" /> Pause
            </button>
            <button onClick={() => sessionId && stopMut.mutate(sessionId)} disabled={stopMut.isPending} className="btn-danger flex-1 flex items-center justify-center gap-2 text-sm">
              <FiSquare className="w-4 h-4" /> Stop
            </button>
            <button onClick={() => checkinMut.mutate()} className="btn-ghost flex-1 flex items-center justify-center gap-2 text-sm">
              <FiSend className="w-4 h-4" /> Ping
            </button>
          </>
        ) : (
          <button onClick={() => startMut.mutate()} disabled={startMut.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <FiPlay className="w-4 h-4" /> Start Tracking
          </button>
        )}
      </motion.div>

      <AnimatePresence>
        {isIP && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-orange-500/15 border border-orange-500/30 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <FiGlobe className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs font-semibold text-orange-400">IP-Based Location</div>
                <div className="text-xs text-white/50 mt-0.5">
                  {location?.ip_city && location?.ip_country ? `${location.ip_city}, ${location.ip_country}` : 'Approximate location'}
                  {' · '}~5km accuracy
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {unresolvedAlerts.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
            {unresolvedAlerts.slice(0, 3).map((alert: any, i: number) => (
              <motion.div key={alert.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                className={`p-2.5 rounded-lg border ${sevColor(alert.severity)} flex items-start justify-between gap-2`}>
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-sm flex-shrink-0">{sevIcon(alert.alert_type)}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{alert.message}</div>
                    <div className="text-xs opacity-50 mt-0.5">{new Date(alert.created_at).toLocaleTimeString()}</div>
                  </div>
                </div>
                <button onClick={() => resolveMut.mutate(alert.id)} className="p-1 hover:bg-white/10 rounded flex-shrink-0">
                  <FiX className="w-3 h-3" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {location && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Live Status</h3>
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
              location.location_source === 'ip' ? 'bg-orange-500/20 text-orange-400' :
              location.location_source === 'gps' ? 'bg-green-500/20 text-green-400' :
              'bg-blue-500/20 text-blue-400'
            }`}>
              <FiGlobe className="w-3 h-3" />
              {location.location_source === 'ip' ? 'IP' : location.location_source === 'gps' ? 'GPS' : 'Net'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className={`rounded-lg p-2.5 ${batBg(location.battery_level)}`}>
              <div className="flex items-center gap-1.5">
                <FiBattery className={`w-3.5 h-3.5 ${batColor(location.battery_level)}`} />
                <span className="text-xs text-white/50">Battery</span>
              </div>
              <div className="text-lg font-bold mt-1">{location.battery_level ?? '—'}%</div>
              <div className="text-xs text-white/30">{location.battery_charging ? '⚡ Charging' : 'Not charging'}</div>
            </div>

            <div className={`rounded-lg p-2.5 ${location.is_online ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              <div className="flex items-center gap-1.5">
                <FiWifi className={`w-3.5 h-3.5 ${location.is_online ? 'text-green-400' : 'text-red-400'}`} />
                <span className="text-xs text-white/50">Network</span>
              </div>
              <div className="text-lg font-bold mt-1">{location.network_type || '—'}</div>
              <div className="text-xs text-white/30">{location.is_online ? 'Online' : 'Offline'}</div>
            </div>

            <div className="rounded-lg p-2.5 bg-white/5">
              <div className="flex items-center gap-1.5">
                <FiMapPin className={`w-3.5 h-3.5 ${isIP ? 'text-orange-400' : 'text-blue-400'}`} />
                <span className="text-xs text-white/50">Accuracy</span>
              </div>
              <div className="text-lg font-bold mt-1">{location.accuracy_m ? `±${Math.round(location.accuracy_m)}${isIP ? 'km' : 'm'}` : '—'}</div>
              <div className="text-xs text-white/30">{isIP ? 'Approximate' : 'Precise'}</div>
            </div>

            <div className="rounded-lg p-2.5 bg-white/5">
              <div className="flex items-center gap-1.5">
                <FiClock className="w-3.5 h-3.5 text-white/40" />
                <span className="text-xs text-white/50">Last Seen</span>
              </div>
              <div className="text-lg font-bold mt-1">{lastSeen}</div>
              <div className="text-xs text-white/30">{location.timezone?.split('/')?.pop()?.replace(/_/g, ' ') || '—'}</div>
            </div>
          </div>

          {location.screen_width && (
            <div className="text-xs text-white/20 text-center pt-1">
              Screen: {location.screen_width}×{location.screen_height}
            </div>
          )}
        </motion.div>
      )}

      <div className="space-y-2">
        <button onClick={() => setShowConsent(!showConsent)} className="btn-ghost w-full flex items-center justify-between text-sm">
          <span className="flex items-center gap-2"><FiEye className="w-4 h-4" /> Consent History</span>
          <FiChevronRight className={`w-4 h-4 transition-transform ${showConsent ? 'rotate-90' : ''}`} />
        </button>

        <AnimatePresence>
          {showConsent && consentData?.consent_log && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="glass-card p-3 space-y-1.5 max-h-48 overflow-y-auto">
              {consentData.consent_log.slice(0, 20).map((e: ConsentLogEntry) => (
                <div key={e.id} className="flex items-start gap-2 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                    e.event === 'opt_in' ? 'bg-green-400' : e.event === 'stop' ? 'bg-red-400' :
                    e.event === 'pause' ? 'bg-orange-400' : e.event === 'ip_geolocation_used' ? 'bg-orange-400' : 'bg-blue-400'
                  }`} />
                  <div>
                    <span className="text-white/70">{e.event.replace(/_/g, ' ')}</span>
                    <span className="text-white/30"> · {e.actor}</span>
                    <div className="text-white/20">{new Date(e.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="glass-card p-3">
        <div className="text-xs text-white/30 mb-1">Pairing Token</div>
        <code className="text-xs text-white/50 break-all font-mono">{child.pairing_token}</code>
      </div>
    </div>
  );
}
