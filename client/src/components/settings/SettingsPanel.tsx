import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api';
import { ChildProfile, TrustedContact } from '../../types';
import { FiPlus, FiTrash2, FiUsers, FiMapPin, FiPhone, FiShield } from 'react-icons/fi';

interface Props { child: ChildProfile }

export default function SettingsPanel({ child }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'contacts' | 'geofences'>('contacts');
  const [showAddContact, setShowAddContact] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [rel, setRel] = useState('');

  const { data: contactsData } = useQuery({ queryKey: ['contacts', child.id], queryFn: () => api.getContacts(child.id) });
  const { data: geoData } = useQuery({ queryKey: ['geofences', child.id], queryFn: () => api.getGeofences(child.id) });

  const delContact = useMutation({ mutationFn: (id: number) => api.deleteContact(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts', child.id] }) });
  const delGeo = useMutation({ mutationFn: (id: number) => api.deleteGeofence(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['geofences', child.id] }) });
  const addContact = useMutation({
    mutationFn: () => api.createContact({ child_id: child.id, name, phone, relationship: rel, priority: 1, notify_on: { sos: true, geofence: true, low_battery: true, offline: true, no_arrival: false } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts', child.id] }); setShowAddContact(false); setName(''); setPhone(''); setRel(''); },
  });

  const contacts: TrustedContact[] = contactsData?.contacts || [];
  const geos = geoData?.geofences || [];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-white/[0.03] rounded-lg p-0.5">
        {(['contacts', 'geofences'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
              tab === t ? 'bg-white/[0.1] text-white' : 'text-white/40 hover:text-white/60'
            }`}>
            {t === 'contacts' ? <><FiUsers className="inline w-3 h-3 mr-1" />Contacts</> : <><FiMapPin className="inline w-3 h-3 mr-1" />Geofences</>}
          </button>
        ))}
      </div>

      {tab === 'contacts' && (
        <div className="space-y-2">
          <button onClick={() => setShowAddContact(!showAddContact)} className="btn-ghost w-full text-xs flex items-center justify-center gap-1.5">
            <FiPlus className="w-3 h-3" /> Add Contact
          </button>
          <AnimatePresence>
            {showAddContact && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="glass-card p-3 space-y-2">
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field w-full text-xs" placeholder="Name" />
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="input-field w-full text-xs" placeholder="Phone" />
                <input type="text" value={rel} onChange={e => setRel(e.target.value)} className="input-field w-full text-xs" placeholder="Relationship" />
                <div className="flex gap-2">
                  <button onClick={() => addContact.mutate()} className="btn-primary flex-1 text-xs py-2">Save</button>
                  <button onClick={() => setShowAddContact(false)} className="btn-ghost flex-1 text-xs py-2">Cancel</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {contacts.map(c => (
            <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="glass-card p-2.5 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-white/30">{c.relationship} {c.phone && `· ${c.phone}`}</div>
              </div>
              <button onClick={() => delContact.mutate(c.id)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors">
                <FiTrash2 className="w-3 h-3" />
              </button>
            </motion.div>
          ))}
          {contacts.length === 0 && <p className="text-white/20 text-xs text-center py-3">No contacts yet</p>}
        </div>
      )}

      {tab === 'geofences' && (
        <div className="space-y-2">
          {geos.map((g: any) => (
            <motion.div key={g.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="glass-card p-2.5 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {g.name}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${g.is_safe ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {g.is_safe ? 'Safe' : 'Unsafe'}
                  </span>
                </div>
                <div className="text-xs text-white/30">{g.radius_m}m radius</div>
              </div>
              <button onClick={() => delGeo.mutate(g.id)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors">
                <FiTrash2 className="w-3 h-3" />
              </button>
            </motion.div>
          ))}
          {geos.length === 0 && <p className="text-white/20 text-xs text-center py-3">No geofences yet</p>}
        </div>
      )}
    </div>
  );
}
