import { useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../lib/api';
import { CheckIn } from '../../types';

interface Props {
  checkin: CheckIn;
  onRespond: () => void;
}

export default function CheckinPrompt({ checkin, onRespond }: Props) {
  const [responding, setResponding] = useState(false);

  const respond = async (status: 'ok' | 'help') => {
    setResponding(true);
    try {
      await api.respondCheckin({
        checkin_id: checkin.id,
        status,
      });
      onRespond();
    } catch (err) {
      console.error('Checkin response error:', err);
    } finally {
      setResponding(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-4 left-4 right-4 bg-white rounded-xl shadow-2xl p-6 z-50 max-w-md mx-auto"
    >
      <h3 className="text-lg font-bold text-gray-800 mb-2">
        Your parent wants to know if you're okay! 🤗
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        Tap a button to let them know:
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => respond('ok')}
          disabled={responding}
          className="flex-1 bg-green-500 hover:bg-green-600 text-white py-3 px-4 rounded-lg font-semibold transition-colors"
        >
          I'm OK! 👍
        </button>
        <button
          onClick={() => respond('help')}
          disabled={responding}
          className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 px-4 rounded-lg font-semibold transition-colors"
        >
          I Need Help! 🆘
        </button>
      </div>
    </motion.div>
  );
}
