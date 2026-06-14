import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api';
import { ChildProfile } from '../../types';
import { FiMap, FiPlus, FiCheck, FiX, FiNavigation, FiClock } from 'react-icons/fi';
import toast from 'react-hot-toast';

interface Props {
  child: ChildProfile;
}

export default function TripsPanel({ child }: Props) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [destName, setDestName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  const { data: tripsData, isLoading } = useQuery({
    queryKey: ['trips', child.id],
    queryFn: () => api.getTrips(child.id),
    refetchInterval: 10000,
  });

  const createTrip = useMutation({
    mutationFn: () => api.createTrip({
      child_id: child.id,
      session_id: child.is_tracking ? 'active' : '', // The backend will resolve the active session
      destination_name: destName,
      destination_lat: parseFloat(lat),
      destination_lng: parseFloat(lng)
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips', child.id] });
      setShowAdd(false);
      setDestName('');
      setLat('');
      setLng('');
      toast.success('Trip created');
    },
    onError: (e: any) => toast.error(e.message)
  });

  const arriveTrip = useMutation({
    mutationFn: (id: number) => api.arriveTrip(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips', child.id] });
      toast.success('Trip marked as arrived');
    }
  });

  const cancelTrip = useMutation({
    mutationFn: (id: number) => api.cancelTrip(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips', child.id] });
      toast.success('Trip cancelled');
    }
  });

  const trips = tripsData?.trips || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Trip Monitoring</h3>
        <button onClick={() => setShowAdd(!showAdd)} className="p-1 hover:bg-white/10 rounded transition-colors text-white/60 hover:text-white">
          <FiPlus className="w-4 h-4" />
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div key="add-trip" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="glass-card p-3 space-y-2 overflow-hidden">
            <input type="text" value={destName} onChange={e => setDestName(e.target.value)} className="input-field w-full text-xs" placeholder="Destination Name (e.g., School)" />
            <div className="flex gap-2">
              <input type="number" value={lat} onChange={e => setLat(e.target.value)} className="input-field w-full text-xs" placeholder="Latitude" />
              <input type="number" value={lng} onChange={e => setLng(e.target.value)} className="input-field w-full text-xs" placeholder="Longitude" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => createTrip.mutate()} disabled={createTrip.isPending || !destName || !lat || !lng} className="btn-primary flex-1 text-xs py-1.5">Start Trip</button>
              <button onClick={() => setShowAdd(false)} className="btn-ghost flex-1 text-xs py-1.5">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-4"><div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 mx-auto" /></div>
        ) : trips.length === 0 ? (
          <p className="text-white/20 text-xs text-center py-3">No active or past trips</p>
        ) : (
          trips.map((trip: any) => (
            <motion.div key={trip.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className={`p-3 rounded-lg border ${trip.status === 'active' ? 'bg-blue-500/10 border-blue-500/30' : trip.status === 'arrived' ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/10'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <FiMap className={`w-3.5 h-3.5 ${trip.status === 'active' ? 'text-blue-400' : trip.status === 'arrived' ? 'text-green-400' : 'text-white/40'}`} />
                    {trip.destination_name || 'Unknown Destination'}
                  </div>
                  <div className="text-xs text-white/40 mt-1 flex items-center gap-2">
                    <span><FiClock className="inline w-3 h-3 mr-0.5" /> {new Date(trip.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    {trip.status === 'active' && trip.distance_m > 0 && (
                      <span><FiNavigation className="inline w-3 h-3 mr-0.5" /> {(trip.distance_m / 1000).toFixed(1)} km left</span>
                    )}
                  </div>
                  {trip.status !== 'active' && (
                    <div className={`text-[10px] font-semibold uppercase tracking-wider mt-1.5 ${trip.status === 'arrived' ? 'text-green-400' : 'text-white/30'}`}>
                      {trip.status}
                    </div>
                  )}
                </div>

                {trip.status === 'active' && (
                  <div className="flex flex-col gap-1">
                    <button onClick={() => arriveTrip.mutate(trip.id)} disabled={arriveTrip.isPending} className="bg-green-500/20 hover:bg-green-500/30 text-green-400 p-1.5 rounded transition-colors" title="Mark as Arrived">
                      <FiCheck className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => cancelTrip.mutate(trip.id)} disabled={cancelTrip.isPending} className="bg-white/5 hover:bg-white/10 text-white/50 p-1.5 rounded transition-colors" title="Cancel Trip">
                      <FiX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
