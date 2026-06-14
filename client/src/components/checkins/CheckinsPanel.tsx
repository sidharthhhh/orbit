import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api } from '../../lib/api';
import { ChildProfile } from '../../types';
import { FiCheckSquare, FiSend, FiClock, FiAlertCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';

interface Props {
  child: ChildProfile;
}

export default function CheckinsPanel({ child }: Props) {
  const qc = useQueryClient();

  const { data: checkinsData, isLoading } = useQuery({
    queryKey: ['checkins', child.id],
    queryFn: () => api.getCheckins(child.id),
    refetchInterval: 5000,
  });

  const requestCheckin = useMutation({
    mutationFn: () => api.requestCheckin({ child_id: child.id, session_id: child.is_tracking ? 'active' : '' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checkins', child.id] });
      toast.success('Check-in requested');
    },
    onError: (e: any) => toast.error(e.message)
  });

  const checkins = checkinsData?.checkins || [];

  return (
    <div className="space-y-3">
      <button onClick={() => requestCheckin.mutate()} disabled={requestCheckin.isPending || !child.is_tracking} className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-2.5">
        <FiSend className="w-4 h-4" /> Request Check-In
      </button>

      {!child.is_tracking && (
        <div className="text-xs text-orange-400 text-center bg-orange-500/10 p-2 rounded border border-orange-500/20">
          Tracking must be active to request check-ins.
        </div>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto mt-4">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">History</h3>
        {isLoading ? (
          <div className="text-center py-4"><div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 mx-auto" /></div>
        ) : checkins.length === 0 ? (
          <p className="text-white/20 text-xs text-center py-3">No check-ins yet</p>
        ) : (
          checkins.map((ci: any) => (
            <motion.div key={ci.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className={`p-3 rounded-lg border ${
                ci.status === 'ok' ? 'bg-green-500/10 border-green-500/30' :
                ci.status === 'help_needed' ? 'bg-red-500/10 border-red-500/30' :
                'bg-yellow-500/10 border-yellow-500/30'
              }`}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 p-1.5 rounded-full ${
                  ci.status === 'ok' ? 'bg-green-500/20 text-green-400' :
                  ci.status === 'help_needed' ? 'bg-red-500/20 text-red-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {ci.status === 'ok' ? <FiCheckSquare className="w-3.5 h-3.5" /> :
                   ci.status === 'help_needed' ? <FiAlertCircle className="w-3.5 h-3.5" /> :
                   <FiClock className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      {ci.status === 'ok' ? "I'm OK" : ci.status === 'help_needed' ? 'Needs Help' : 'Pending Response'}
                    </div>
                    <div className="text-xs text-white/30">{new Date(ci.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                  </div>
                  {ci.message && (
                    <div className="mt-1.5 text-xs text-white/70 bg-black/20 p-2 rounded-md border border-white/5 italic">
                      "{ci.message}"
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
