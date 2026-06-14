import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api';
import { Alert } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { FiX, FiAlertTriangle, FiCheck, FiBell } from 'react-icons/fi';

interface Props { alerts: Alert[]; onClose: () => void }

export default function AlertsPanel({ alerts, onClose }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const resolveMut = useMutation({
    mutationFn: (id: number) => api.resolveAlert(id, user?.display_name || 'Parent'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const sevColor = (s: string) =>
    s === 'critical' ? 'bg-red-500/15 border-red-500/30 text-red-400' :
    s === 'high' ? 'bg-orange-500/15 border-orange-500/30 text-orange-400' :
    s === 'medium' ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400' :
    'bg-blue-500/15 border-blue-500/30 text-blue-400';

  const sevIcon = (t: string) =>
    t === 'sos' ? '🚨' : t === 'low_battery' ? '🪫' :
    t === 'offline' ? '📡' : t === 'geofence_exit' ? '🚪' :
    t === 'geofence_enter' ? '🏠' : '⚠️';

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-base flex items-center gap-2">
          <FiBell className="text-orange-400" /> Alerts
        </h2>
        <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
          <FiX className="w-4 h-4" />
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🔔</div>
          <p className="text-white/30 text-sm">No unresolved alerts</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {alerts.map((alert, i) => (
              <motion.div key={alert.id}
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }} transition={{ delay: i * 0.03 }}
                className={`p-3 rounded-xl border ${sevColor(alert.severity)}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="text-base flex-shrink-0">{sevIcon(alert.alert_type)}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{alert.message}</div>
                      <div className="text-xs opacity-50 mt-1">
                        {alert.child_name} · {new Date(alert.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => resolveMut.mutate(alert.id)}
                    className="p-1.5 hover:bg-white/10 rounded-lg flex-shrink-0 transition-colors"
                    title="Mark as resolved">
                    <FiCheck className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
