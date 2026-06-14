import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'parent' | 'guardian'>('parent');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (isRegister) await register({ email, password, role, display_name: displayName });
      else await login(email, password);
    } catch (err: any) { setError(err.message || 'Authentication failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="glass-panel p-8 w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <span className="text-white text-2xl font-bold">S</span>
          </div>
          <h1 className="text-2xl font-bold text-white">SafeTrack</h1>
          <p className="text-white/40 text-sm mt-1">Keep your family safe</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">Your Name</label>
                <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                  className="input-field w-full" placeholder="Display name" required />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">I am a</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setRole('parent')}
                    className={`p-3 rounded-xl border-2 transition-all text-left ${
                      role === 'parent' ? 'border-blue-500 bg-blue-500/10' : 'border-white/[0.08] bg-white/[0.03]'
                    }`}>
                    <div className="text-lg mb-1">👨‍👩‍👧</div>
                    <div className={`text-sm font-medium ${role === 'parent' ? 'text-blue-400' : 'text-white/50'}`}>Parent</div>
                    <div className="text-xs text-white/20 mt-0.5">Full control & monitoring</div>
                  </button>
                  <button type="button" onClick={() => setRole('guardian')}
                    className={`p-3 rounded-xl border-2 transition-all text-left ${
                      role === 'guardian' ? 'border-purple-500 bg-purple-500/10' : 'border-white/[0.08] bg-white/[0.03]'
                    }`}>
                    <div className="text-lg mb-1">🛡️</div>
                    <div className={`text-sm font-medium ${role === 'guardian' ? 'text-purple-400' : 'text-white/50'}`}>Guardian</div>
                    <div className="text-xs text-white/20 mt-0.5">Grandparent, babysitter, etc.</div>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="input-field w-full" placeholder="you@example.com" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="input-field w-full" placeholder="••••••••" required minLength={8} />
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-sm">
              {error}
            </motion.div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full relative">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Please wait...
              </span>
            ) : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-white/30 text-sm mt-6">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button onClick={() => { setIsRegister(!isRegister); setError(''); }} className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
            {isRegister ? 'Sign In' : 'Register'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
