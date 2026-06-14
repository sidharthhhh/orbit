import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api } from '../../lib/api';
import { FiX, FiUser, FiClock, FiEye } from 'react-icons/fi';
import { createPortal } from 'react-dom';

interface Props { onClose: () => void }

export default function AddChildModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [style, setStyle] = useState<'banner_map' | 'badge'>('banner_map');
  const [interval, setInterval] = useState(10);

  const mut = useMutation({
    mutationFn: () => api.createChild({ name, indicator_style: style, update_interval_s: interval }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['children'] }); onClose(); },
  });

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="glass-panel p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <FiUser className="w-4 h-4 text-purple-400" />
            </div>
            Add Child
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"><FiX className="w-4 h-4" /></button>
        </div>

        <form onSubmit={e => { e.preventDefault(); if (name.trim()) mut.mutate(); }} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">Child's Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field w-full" placeholder="Enter name" required />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Indicator Style</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setStyle('banner_map')}
                className={`p-3 rounded-xl border-2 transition-all text-left ${style === 'banner_map' ? 'border-blue-500 bg-blue-500/10' : 'border-white/[0.08] bg-white/[0.03]'}`}>
                <FiEye className={`w-4 h-4 mb-1.5 ${style === 'banner_map' ? 'text-blue-400' : 'text-white/30'}`} />
                <div className={`text-sm font-medium ${style === 'banner_map' ? 'text-blue-400' : 'text-white/40'}`}>Banner + Map</div>
                <div className="text-xs text-white/20 mt-0.5">Top banner with mini-map</div>
              </button>
              <button type="button" onClick={() => setStyle('badge')}
                className={`p-3 rounded-xl border-2 transition-all text-left ${style === 'badge' ? 'border-blue-500 bg-blue-500/10' : 'border-white/[0.08] bg-white/[0.03]'}`}>
                <div className={`w-4 h-4 rounded-full mb-1.5 ${style === 'badge' ? 'bg-blue-400' : 'bg-white/20'}`} />
                <div className={`text-sm font-medium ${style === 'badge' ? 'text-blue-400' : 'text-white/40'}`}>Badge</div>
                <div className="text-xs text-white/20 mt-0.5">Corner badge with pulse</div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
              <FiClock className="w-3 h-3" /> Update Interval: {interval}s
            </label>
            <input type="range" min={5} max={60} value={interval} onChange={e => setInterval(parseInt(e.target.value))}
              className="w-full accent-blue-500" />
            <div className="flex justify-between text-xs text-white/20 mt-1"><span>5s</span><span>60s</span></div>
          </div>

          <button type="submit" disabled={mut.isPending} className="btn-primary w-full">
            {mut.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...
              </span>
            ) : 'Add Child'}
          </button>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}
