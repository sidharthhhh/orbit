import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { ChildProfile, Geofence } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import MapView from './map/MapView';
import SidePanel from './SidePanel';
import ChildrenRail from './children/ChildrenRail';
import GeofenceModal from './map/GeofenceModal';
import { FiLogOut, FiBell, FiSettings, FiMapPin, FiX } from 'react-icons/fi';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { joinChild, socket } = useSocket();
  const queryClient = useQueryClient();
  const [selectedChild, setSelectedChild] = useState<ChildProfile | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showGeofenceModal, setShowGeofenceModal] = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawCenter, setDrawCenter] = useState<[number, number] | null>(null);

  const { data: childrenData, isLoading } = useQuery({
    queryKey: ['children'],
    queryFn: () => api.getChildren(),
    refetchInterval: 10_000,
  });

  const children: ChildProfile[] = childrenData?.children || [];

  useEffect(() => {
    if (children.length > 0 && !selectedChild) setSelectedChild(children[0]);
  }, [children, selectedChild]);

  useEffect(() => {
    if (selectedChild) joinChild(selectedChild.id);
  }, [selectedChild, joinChild]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['children'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    };
    socket.on('location:update', refresh);
    socket.on('alert:new', refresh);
    socket.on('session:paused', refresh);
    socket.on('session:stopped', refresh);
    return () => { socket.off('location:update', refresh); socket.off('alert:new', refresh); };
  }, [socket, queryClient]);

  const { data: alertsData } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.getAlerts(),
    refetchInterval: 8_000,
  });

  const { data: geofencesData } = useQuery({
    queryKey: ['geofences', selectedChild?.id],
    queryFn: () => api.getGeofences(selectedChild!.id),
    enabled: !!selectedChild,
  });

  const unresolvedAlerts = (alertsData?.alerts || []).filter((a: any) => !a.resolved);
  const geofences: Geofence[] = geofencesData?.geofences || [];

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (drawingMode) {
      setDrawCenter([lat, lng]);
      setShowGeofenceModal(true);
      setDrawingMode(false);
    }
  }, [drawingMode]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-900">
      <header className="h-14 bg-slate-800/90 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-4 z-30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="text-white text-sm font-bold">S</span>
          </div>
          <h1 className="text-base font-bold text-white tracking-tight">SafeTrack</h1>
          <span className="text-white/20 text-sm">·</span>
          <span className="text-white/40 text-sm">{user?.display_name}</span>
        </div>
        <div className="flex items-center gap-1">
          {selectedChild && (
            <button onClick={() => setDrawingMode(!drawingMode)}
              className={`p-2 rounded-lg transition-all ${drawingMode ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-white/[0.06] text-white/40'}`}
              title="Draw geofence">
              <FiMapPin className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setShowAlerts(!showAlerts)}
            className="relative p-2 hover:bg-white/[0.06] rounded-lg transition-colors">
            <FiBell className="w-4 h-4 text-white/40" />
            {unresolvedAlerts.length > 0 && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {unresolvedAlerts.length}
              </motion.span>
            )}
          </button>
          <button onClick={logout} className="p-2 hover:bg-white/[0.06] rounded-lg transition-colors">
            <FiLogOut className="w-4 h-4 text-white/40" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <ChildrenRail children={children} selectedChild={selectedChild} onSelect={setSelectedChild} />

        <div className="flex-1 relative">
          <MapView selectedChild={selectedChild} geofences={geofences} onMapClick={handleMapClick} drawingMode={drawingMode} />
        </div>

        <AnimatePresence mode="wait">
          {selectedChild && (
            <motion.div key={selectedChild.id}
              initial={{ x: 320, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-80 border-l border-white/[0.06] bg-slate-800/60 backdrop-blur-xl overflow-hidden flex-shrink-0">
              <SidePanel child={selectedChild} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAlerts && (
            <motion.div initial={{ x: 400, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-96 border-l border-white/[0.06] bg-slate-800/80 backdrop-blur-xl overflow-y-auto flex-shrink-0">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-base">Alerts</h2>
                  <button onClick={() => setShowAlerts(false)} className="p-1 hover:bg-white/10 rounded"><FiX className="w-4 h-4" /></button>
                </div>
                {unresolvedAlerts.length === 0 ? (
                  <p className="text-white/30 text-sm text-center py-12">No unresolved alerts</p>
                ) : (
                  <div className="space-y-2">
                    {unresolvedAlerts.map((alert: any) => (
                      <motion.div key={alert.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                        className={`p-3 rounded-lg border ${
                          alert.severity === 'critical' ? 'bg-red-500/15 border-red-500/30' :
                          alert.severity === 'high' ? 'bg-orange-500/15 border-orange-500/30' :
                          'bg-yellow-500/15 border-yellow-500/30'
                        }`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">{alert.message}</div>
                            <div className="text-xs text-white/30 mt-1">{alert.child_name} · {new Date(alert.created_at).toLocaleString()}</div>
                          </div>
                          <button onClick={() => api.resolveAlert(alert.id, user?.display_name || 'Parent').then(() => queryClient.invalidateQueries({ queryKey: ['alerts'] }))}
                            className="text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded transition-colors">Resolve</button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showGeofenceModal && selectedChild && (
        <GeofenceModal childId={selectedChild.id} center={drawCenter} onClose={() => { setShowGeofenceModal(false); setDrawCenter(null); setDrawingMode(false); }} />
      )}
    </div>
  );
}
