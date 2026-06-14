import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api';
import { FiX, FiMapPin, FiShield, FiAlertTriangle } from 'react-icons/fi';
import { createPortal } from 'react-dom';

interface Props {
  childId: number;
  center?: [number, number] | null;
  onClose: () => void;
}

export default function GeofenceModal({ childId, center, onClose }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [latitude, setLatitude] = useState(center?.[0]?.toString() || '');
  const [longitude, setLongitude] = useState(center?.[1]?.toString() || '');
  const [radius, setRadius] = useState('500');
  const [isSafe, setIsSafe] = useState(true);
  const [step, setStep] = useState(center ? 2 : 1);

  useEffect(() => {
    if (center) {
      setLatitude(center[0].toString());
      setLongitude(center[1].toString());
      setStep(2);
    }
  }, [center]);

  const createMut = useMutation({
    mutationFn: () => api.createGeofence({
      child_id: childId, name, latitude: parseFloat(latitude), longitude: parseFloat(longitude),
      radius_m: parseInt(radius), is_safe: isSafe,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['geofences', childId] }); onClose(); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && latitude && longitude && radius) createMut.mutate();
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="glass-panel p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <FiMapPin className="w-4 h-4 text-blue-400" />
            </div>
            Add Geofence
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"><FiX className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">Zone Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field w-full"
              placeholder="e.g., School, Home, Park" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">Latitude</label>
              <input type="number" step="any" value={latitude} onChange={e => setLatitude(e.target.value)}
                className="input-field w-full" placeholder="12.9716" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">Longitude</label>
              <input type="number" step="any" value={longitude} onChange={e => setLongitude(e.target.value)}
                className="input-field w-full" placeholder="77.5946" required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">Radius: {radius}m</label>
            <input type="range" min="50" max="5000" step="50" value={radius} onChange={e => setRadius(e.target.value)} className="w-full accent-blue-500" />
            <div className="flex justify-between text-xs text-white/20 mt-1">
              <span>50m</span><span>5km</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setIsSafe(true)}
              className={`p-3 rounded-xl border-2 transition-all ${isSafe ? 'border-green-500 bg-green-500/10' : 'border-white/10 bg-white/5'}`}>
              <FiShield className={`w-5 h-5 mx-auto mb-1 ${isSafe ? 'text-green-400' : 'text-white/30'}`} />
              <div className={`text-sm font-medium ${isSafe ? 'text-green-400' : 'text-white/40'}`}>Safe Zone</div>
              <div className="text-xs text-white/20 mt-0.5">Alert if leaves</div>
            </button>
            <button type="button" onClick={() => setIsSafe(false)}
              className={`p-3 rounded-xl border-2 transition-all ${!isSafe ? 'border-red-500 bg-red-500/10' : 'border-white/10 bg-white/5'}`}>
              <FiAlertTriangle className={`w-5 h-5 mx-auto mb-1 ${!isSafe ? 'text-red-400' : 'text-white/30'}`} />
              <div className={`text-sm font-medium ${!isSafe ? 'text-red-400' : 'text-white/40'}`}>Unsafe Zone</div>
              <div className="text-xs text-white/20 mt-0.5">Alert if enters</div>
            </button>
          </div>

          <button type="submit" disabled={createMut.isPending} className="btn-primary w-full">
            {createMut.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...
              </span>
            ) : 'Create Geofence'}
          </button>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}
