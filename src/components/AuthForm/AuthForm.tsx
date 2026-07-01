import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Link } from 'react-router-dom';

type AuthMode = 'login' | 'register';

interface AuthFormProps {
  mode?: AuthMode;
  onSubmit?: (data: { email: string; password: string; name?: string }) => void;
  onModeChange?: (mode: AuthMode) => void;
}

const AuthForm: React.FC<AuthFormProps> = ({
  mode = 'login',
  onSubmit,
  onModeChange,
}) => {
  const [formMode, setFormMode] = useState<AuthMode>(mode);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });

  const handleModeChange = (newMode: AuthMode) => {
    setFormMode(newMode);
    onModeChange?.(newMode);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.(formData);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="min-h-screen bg-bg-dark flex items-center justify-center px-4 pt-32 pb-20 relative overflow-hidden">
      {/* Background glows */}
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-accent-purple/10 blur-[120px] rounded-full pointer-events-none z-0"></div>
      <div className="fixed bottom-[-20%] right-[-10%] w-[40%] h-[60%] bg-primary/5 blur-[100px] rounded-full pointer-events-none z-0"></div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-2 mb-12 hover:opacity-80 transition-opacity">
          <span className="material-symbols-outlined text-primary text-3xl">terminal</span>
          <span className="font-bold text-2xl text-white">NEURO BUILDS</span>
        </Link>

        {/* Form Card */}
        <div className="glass-panel rounded-bento p-8 md:p-10">
          {/* Mode Tabs */}
          <div className="flex gap-1 bg-black/20 rounded-pill p-1 mb-8">
            <button
              onClick={() => handleModeChange('login')}
              className={`flex-1 py-2 px-4 rounded-full font-bold text-sm transition-all ${
                formMode === 'login'
                  ? 'bg-primary/20 text-primary'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => handleModeChange('register')}
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
          <p className="text-gray-400 mb-8">
            {formMode === 'login'
              ? 'Sign in to access your builds and community'
              : 'Create an account to start building'}
          </p>

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
                <a href="/forgot-password" className="text-primary hover:text-cyan-300 transition-colors">
                  Forgot password?
                </a>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full mt-6 px-6 py-3 bg-primary hover:bg-cyan-300 text-bg-dark font-bold rounded-pill transition-all shadow-[0_0_15px_rgba(13,242,242,0.4)] flex items-center justify-center gap-2 group"
            >
              {formMode === 'login' ? 'Sign In' : 'Create Account'}
              <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </button>
          </form>

          {/* OAuth Buttons */}
          <div className="mt-8 pt-8 border-t border-white/5">
            <p className="text-center text-sm text-gray-400 mb-4">Or continue with</p>
            <div className="grid grid-cols-2 gap-3">
              <button className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-bold text-sm transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[20px]">
                  {/* Google icon - using mail as placeholder */}
                  mail
                </span>
                Google
              </button>
              <button className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-bold text-sm transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[20px]">
                  {/* GitHub icon - using code as placeholder */}
                  code
                </span>
                GitHub
              </button>
            </div>
          </div>

          {/* Footer Link */}
          <p className="text-center text-sm text-gray-400 mt-8">
            {formMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => handleModeChange(formMode === 'login' ? 'register' : 'login')}
              className="text-primary hover:text-cyan-300 font-bold transition-colors"
            >
              {formMode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>

        {/* Footer Links */}
        <div className="mt-8 text-center space-y-2">
          <p className="text-xs text-gray-500">
            By continuing, you agree to our{' '}
            <a href="/terms" className="text-primary hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthForm;
