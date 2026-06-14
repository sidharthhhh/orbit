import { ChildProfile } from '../../types';
import { motion } from 'framer-motion';
import { FiPlus } from 'react-icons/fi';
import { useState } from 'react';
import AddChildModal from './AddChildModal';

interface Props {
  children: ChildProfile[];
  selectedChild: ChildProfile | null;
  onSelect: (child: ChildProfile) => void;
}

export default function ChildrenRail({ children, selectedChild, onSelect }: Props) {
  const [showAdd, setShowAdd] = useState(false);

  const openAdd = () => {
    setShowAdd(true);
  };

  return (
    <>
      <div className="w-16 bg-slate-800/80 border-r border-white/[0.06] flex flex-col items-center py-3 gap-2 overflow-y-auto flex-shrink-0">
        {children.map((child, i) => {
          const isSelected = selectedChild?.id === child.id;
          const isTracking = child.is_tracking;
          return (
            <motion.button key={child.id}
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
              onClick={() => onSelect(child)}
              className={`relative w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 ${
                isSelected
                  ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25 ring-2 ring-blue-400/50 ring-offset-2 ring-offset-slate-800'
                  : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.12] hover:text-white/70'
              }`}
              title={child.name}>
              {child.photo_url ? (
                <img src={child.photo_url} alt={child.name} className="w-11 h-11 rounded-full object-cover" />
              ) : (
                child.name.charAt(0).toUpperCase()
              )}
              {isTracking && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-slate-800">
                  <span className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-40" />
                </motion.span>
              )}
            </motion.button>
          );
        })}
        <button
          onClick={openAdd}
          className="w-11 h-11 rounded-full bg-blue-500/20 hover:bg-blue-500/40 flex items-center justify-center text-blue-400 hover:text-blue-300 transition-all cursor-pointer"
          title="Add Child">
          <FiPlus className="w-5 h-5" />
        </button>
      </div>
      {showAdd && (
        <AddChildModal onClose={() => setShowAdd(false)} />
      )}
    </>
  );
}
