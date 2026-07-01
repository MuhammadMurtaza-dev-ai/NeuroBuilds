import React, { useState, useEffect, useRef } from 'react';
import { Mail, Lock, Eye, EyeOff, X, AtSign, CheckCircle, XCircle, Loader } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { firebaseAuth, auth, db } from '../../Firebase';
import { isValidUsernameFormat, checkUsernameAvailable, claimUsername } from '../../utils/usernameValidator';

type AuthMode = 'login' | 'register';
type View = 'form' | 'reset' | 'resetSent';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
  onSubmit?: (data: { email: string; password: string; name?: string }) => void;
}

const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
  onSubmit,
}) => {
  const { register, login, googleSignIn, loading, error } = useAuth();
  const [formMode, setFormMode] = useState<AuthMode>(initialMode);
  const [view, setView] = useState<View>('form');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    username: '',
  });

  // Username availability
  type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (formMode !== 'register') return;
    const raw = formData.username.trim();
    if (!raw) { setUsernameStatus('idle'); return; }
    if (!isValidUsernameFormat(raw)) { setUsernameStatus('invalid'); return; }
    setUsernameStatus('checking');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const available = await checkUsernameAvailable(raw);
      setUsernameStatus(available ? 'available' : 'taken');
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [formData.username, formMode]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) { setLocalError('Please enter your email address'); return; }
    setLocalError(null);
    setResetLoading(true);
    try {
      await firebaseAuth.sendPasswordReset(resetEmail);
      setView('resetSent');
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setResetLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setView('form');
    setFormMode('login');
    setLocalError(null);
    setResetEmail('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    try {
      if (formMode === 'register') {
        if (!formData.name || !formData.email || !formData.password || !formData.username.trim()) {
          setLocalError('Please fill in all fields');
          return;
        }
        if (!isValidUsernameFormat(formData.username.trim())) {
          setLocalError('Username must be 3–20 lowercase characters (letters, numbers, dots). No leading/trailing/double dots.');
          return;
        }
        if (usernameStatus === 'taken') {
          setLocalError('That username is already taken. Please choose another.');
          return;
        }
        if (usernameStatus === 'checking') {
          setLocalError('Still checking username availability, please wait a moment.');
          return;
        }
        await register(formData.email, formData.password, formData.name);
        const uid = auth.currentUser?.uid;
        if (uid) {
          claimUsername(formData.username.trim(), null, uid).catch(() => {});
          setDoc(doc(db, 'users', uid), { displayName: formData.name }, { merge: true }).catch(() => {});
        }
      } else {
        if (!formData.email || !formData.password) {
          setLocalError('Please fill in all fields');
          return;
        }
        await login(formData.email, formData.password);
      }

      onSubmit?.(formData);
      onClose();
      setFormData({ name: '', email: '', password: '', username: '' });
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Authentication failed');
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    try {
      await googleSignIn();
      const u = auth.currentUser;
      if (u) {
        setDoc(doc(db, 'users', u.uid), {
          displayName: u.displayName ?? '',
          ...(u.photoURL ? { photoURL: u.photoURL } : {}),
        }, { merge: true }).catch(() => {});
      }
      onClose();
      setFormData({ name: '', email: '', password: '', username: '' });
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Google sign-in failed');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div className="relative z-10 w-full max-w-md bg-bg-dark rounded-bento border border-white/10 shadow-2xl shadow-black/50 overflow-hidden">
        {/* Background glows */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-accent-purple/10 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[60%] bg-primary/5 blur-[100px] rounded-full pointer-events-none"></div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 z-20 p-2 hover:bg-white/10 rounded-lg transition-colors"
          aria-label="Close"
        >
          <X size={24} className="text-gray-400" />
        </button>

        {/* Content */}
        <div className="relative z-10 p-8 md:p-10">

          {/* ── Reset Password View ── */}
          {view === 'reset' && (
            <>
              <button
                onClick={handleBackToLogin}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-6 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                Back to login
              </button>
              <h2 className="text-3xl font-bold text-white mb-2">Reset Password</h2>
              <p className="text-gray-400 mb-6">
                Enter your account email and we'll send you a reset link.
              </p>
              {localError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {localError}
                </div>
              )}
              <form onSubmit={handleResetPassword} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-gray-300 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-3.5 text-gray-500" size={20} />
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-12 pr-4 py-3 text-white placeholder-gray-600 focus:border-primary focus:bg-white/10 focus:outline-none transition-all"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full px-6 py-3 bg-primary hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed text-bg-dark font-bold rounded-pill transition-all shadow-[0_0_15px_rgba(13,242,242,0.4)]"
                >
                  {resetLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            </>
          )}

          {/* ── Reset Sent Confirmation ── */}
          {view === 'resetSent' && (
            <>
              <div className="flex flex-col items-center text-center py-4">
                <div className="size-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-primary text-[32px]">mark_email_read</span>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Check Your Inbox</h2>
                <p className="text-gray-400 mb-1">
                  A password reset link has been sent to
                </p>
                <p className="text-primary font-mono text-sm mb-6 break-all">{resetEmail}</p>
                <p className="text-gray-500 text-xs mb-8">
                  Didn't get it? Check your spam folder or try again.
                </p>
                <button
                  onClick={handleBackToLogin}
                  className="w-full px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-pill transition-all"
                >
                  Back to Login
                </button>
              </div>
            </>
          )}

          {/* ── Auth Form View ── */}
          {view === 'form' && <>
          {/* Mode Tabs */}
          <div className="flex gap-1 bg-black/20 rounded-pill p-1 mt-8 mb-8">
            <button
              onClick={() => setFormMode('login')}
              className={`flex-1 py-2 px-4 rounded-full font-bold text-sm transition-all ${
                formMode === 'login'
                  ? 'bg-primary/20 text-primary'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setFormMode('register')}
              className={`flex-1 py-2 px-4 rounded-full font-bold text-sm transition-all ${
                formMode === 'register'
                  ? 'bg-primary/20 text-primary'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Register
            </button>
          </div>

          {/* Title */}
          <h2 className="text-3xl font-bold text-white mb-2">
            {formMode === 'login' ? 'Welcome Back' : 'Join NeuroBuilds'}
          </h2>
          <p className="text-gray-400 mb-6">
            {formMode === 'login'
              ? 'Sign in to access your builds and community'
              : 'Create an account to start building'}
          </p>

          {/* Error Message */}
          {(localError || error) && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {localError || error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name Field (Register Only) */}
            {formMode === 'register' && (
              <div>
                <label className="block text-sm font-bold text-gray-300 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="John Doe"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:border-primary focus:bg-white/10 focus:outline-none transition-all"
                />
              </div>
            )}

            {/* Username Field (Register Only) */}
            {formMode === 'register' && (
              <div>
                <label className="block text-sm font-bold text-gray-300 mb-2">
                  Username
                </label>
                <div className="relative">
                  <AtSign className="absolute left-4 top-3.5 text-gray-500" size={20} />
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    placeholder="your.handle"
                    autoComplete="off"
                    className={`w-full bg-white/5 border rounded-lg pl-12 pr-10 py-3 text-white placeholder-gray-600 focus:bg-white/10 focus:outline-none transition-all ${
                      usernameStatus === 'available' ? 'border-green-500/60 focus:border-green-400' :
                      usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red-500/60 focus:border-red-400' :
                      'border-white/10 focus:border-primary'
                    }`}
                  />
                  <div className="absolute right-4 top-3.5">
                    {usernameStatus === 'checking' && <Loader size={16} className="animate-spin text-gray-400" />}
                    {usernameStatus === 'available' && <CheckCircle size={16} className="text-green-400" />}
                    {(usernameStatus === 'taken' || usernameStatus === 'invalid') && <XCircle size={16} className="text-red-400" />}
                  </div>
                </div>
                {usernameStatus === 'available' && (
                  <p className="text-xs text-green-400 mt-1">@{formData.username} is available</p>
                )}
                {usernameStatus === 'taken' && (
                  <p className="text-xs text-red-400 mt-1">That username is taken</p>
                )}
                {usernameStatus === 'invalid' && (
                  <p className="text-xs text-red-400 mt-1">3–20 chars: lowercase letters, numbers, dots only. No leading/trailing/double dots.</p>
                )}
              </div>
            )}

            {/* Email Field */}
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-3.5 text-gray-500" size={20} />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="you@example.com"
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-12 pr-4 py-3 text-white placeholder-gray-600 focus:border-primary focus:bg-white/10 focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-3.5 text-gray-500" size={20} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-12 pr-12 py-3 text-white placeholder-gray-600 focus:border-primary focus:bg-white/10 focus:outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-3.5 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Remember Me / Forgot Password */}
            {formMode === 'login' && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 bg-white/5 border border-white/10 rounded cursor-pointer accent-primary"
                  />
                  <span className="text-gray-400">Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={() => { setView('reset'); setLocalError(null); }}
                  className="text-primary hover:text-cyan-300 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 px-6 py-3 bg-primary hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed text-bg-dark font-bold rounded-pill transition-all shadow-[0_0_15px_rgba(13,242,242,0.4)] flex items-center justify-center gap-2 group"
            >
              {loading ? 'Loading...' : (formMode === 'login' ? 'Sign In' : 'Create Account')}
              {!loading && (
                <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              )}
            </button>
          </form>

          {/* OAuth Buttons */}
          <div className="mt-8 pt-8 border-t border-white/5">
            <p className="text-center text-sm text-gray-400 mb-4">Or continue with</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="px-4 py-3 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 rounded-lg text-white font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">mail</span>
                Google
              </button>
              <button className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-bold text-sm transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[20px]">code</span>
                GitHub
              </button>
            </div>
          </div>

          {/* Footer Link */}
          <p className="text-center text-sm text-gray-400 mt-8">
            {formMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => setFormMode(formMode === 'login' ? 'register' : 'login')}
              className="text-primary hover:text-cyan-300 font-bold transition-colors"
            >
              {formMode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
          </>}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
