import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  User as UserIcon,
  Camera,
  Phone,
  Save,
  CheckCircle,
  Shield,
  ShieldCheck,
  ShieldOff,
  AlertTriangle,
  RefreshCw,
  AtSign,
  XCircle,
  Loader,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { User } from 'firebase/auth';
import type { TotpSecret } from 'firebase/auth';
import { useAuth } from '../hooks/useAuth';
import {
  firebaseAuth,
  db,
  multiFactor,
  TotpMultiFactorGenerator,
  sendEmailVerification,
} from '../Firebase';
import GradientBackground from '../components/GradientBackground/GradientBackground';
import { useUserRole } from '../hooks/useUserRole';
import {
  isValidUsernameFormat,
  checkUsernameAvailable,
  claimUsername,
} from '../utils/usernameValidator';

const ROLE_BADGE: Record<string, { label: string; classes: string }> = {
  admin:     { label: 'Admin',     classes: 'bg-red-500/15 border-red-500/40 text-red-400' },
  moderator: { label: 'Moderator', classes: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400' },
  vendor:    { label: 'Vendor',    classes: 'bg-blue-500/15 border-blue-500/40 text-blue-400' },
  user:      { label: 'Member',    classes: 'bg-white/5 border-white/10 text-gray-400' },
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type TwoFAStep = 'idle' | 'generating' | 'scan' | 'enrolling' | 'enrolled';

interface ProfileForm {
  displayName: string;
  photoURL: string;
  phoneNumber: string;
}

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { role } = useUserRole(user?.uid);

  const [form, setForm] = useState<ProfileForm>({
    displayName: '',
    photoURL: '',
    phoneNumber: '',
  });
  const [nameStatus, setNameStatus] = useState<SaveStatus>('idle');
  const [avatarStatus, setAvatarStatus] = useState<SaveStatus>('idle');
  const [phoneStatus, setPhoneStatus] = useState<SaveStatus>('idle');
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Username state
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSaveStatus, setUsernameSaveStatus] = useState<SaveStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    setForm(prev => ({
      ...prev,
      displayName: user.displayName ?? '',
      photoURL: user.photoURL ?? '',
    }));
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        const un = (data.username as string) ?? '';
        setForm(prev => ({ ...prev, phoneNumber: data.phoneNumber ?? '' }));
        setCurrentUsername(un || null);
        setUsernameInput(un);
      }
    });
  }, [user]);

  useEffect(() => {
    const raw = usernameInput.trim();
    if (!raw || raw === currentUsername) { setUsernameStatus('idle'); return; }
    if (!isValidUsernameFormat(raw)) { setUsernameStatus('invalid'); return; }
    setUsernameStatus('checking');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const available = await checkUsernameAvailable(raw);
      setUsernameStatus(available ? 'available' : 'taken');
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [usernameInput, currentUsername]);

  const withStatus = async (
    setter: React.Dispatch<React.SetStateAction<SaveStatus>>,
    fn: () => Promise<void>
  ) => {
    setter('saving');
    setGlobalError(null);
    try {
      await fn();
      setter('saved');
      setTimeout(() => setter('idle'), 2500);
    } catch (err: any) {
      setGlobalError(err.message || 'Save failed');
      setter('error');
      setTimeout(() => setter('idle'), 3000);
    }
  };

  const saveDisplayName = () =>
    withStatus(setNameStatus, async () => {
      if (!user) return;
      await firebaseAuth.updateUserProfile(user, form.displayName.trim(), user.photoURL ?? undefined);
    });

  const saveAvatar = () =>
    withStatus(setAvatarStatus, async () => {
      if (!user) return;
      await firebaseAuth.updateUserProfile(user, user.displayName ?? '', form.photoURL.trim() || undefined);
    });

  const savePhone = () =>
    withStatus(setPhoneStatus, async () => {
      if (!user) return;
      await setDoc(doc(db, 'users', user.uid), { phoneNumber: form.phoneNumber.trim() }, { merge: true });
    });

  const saveUsername = async () => {
    if (!user) return;
    const raw = usernameInput.trim();
    setUsernameError(null);
    if (!raw) { setUsernameError('Username cannot be empty.'); return; }
    if (!isValidUsernameFormat(raw)) { setUsernameError('Invalid username format.'); return; }
    if (usernameStatus === 'taken') { setUsernameError('That username is already taken.'); return; }
    if (usernameStatus === 'checking') { setUsernameError('Still checking availability, please wait.'); return; }
    if (raw === currentUsername) return;

    const available = await checkUsernameAvailable(raw);
    if (!available) { setUsernameError('That username was just taken. Try another.'); setUsernameStatus('taken'); return; }

    withStatus(setUsernameSaveStatus, async () => {
      await claimUsername(raw, currentUsername, user.uid);
      setCurrentUsername(raw);
      setUsernameStatus('idle');
    });
  };

  if (loading || !user) return null;

  return (
    <>
      <GradientBackground />
      <main className="relative z-10 pt-28 pb-16 px-4 md:px-6 max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Profile Settings</h1>
          <p className="text-gray-400 mt-1">Manage your account details and preferences.</p>
        </div>

        {globalError && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {globalError}
          </div>
        )}

        {/* Avatar Preview + card */}
        <div className="glass-panel rounded-bento border border-white/10 p-6 mb-4 flex items-center gap-5">
          <div className="relative shrink-0">
            <div className="size-20 rounded-full bg-gradient-to-tr from-primary to-accent-purple p-[2px]">
              {form.photoURL ? (
                <img
                  src={form.photoURL}
                  alt={form.displayName || 'Avatar'}
                  className="w-full h-full rounded-full object-cover bg-bg-dark"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full bg-bg-dark rounded-full flex items-center justify-center">
                  <UserIcon size={32} className="text-gray-400" />
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <p className="font-bold text-white text-lg leading-tight">{user.displayName || 'No name set'}</p>
              {(() => {
                const badge = ROLE_BADGE[role] ?? ROLE_BADGE.user;
                return (
                  <span className={`px-2 py-0.5 text-xs font-mono border rounded-full ${badge.classes}`}>
                    {badge.label}
                  </span>
                );
              })()}
            </div>
            {currentUsername && (
              <p className="text-sm text-primary font-mono">@{currentUsername}</p>
            )}
            <p className="text-sm text-gray-400 font-mono">{user.email}</p>
            <p className="text-xs text-gray-600 mt-1">
              UID: <span className="font-mono">{user.uid.slice(0, 12)}…</span>
            </p>
          </div>
        </div>

        {/* Display Name */}
        <SettingsCard
          icon={<UserIcon size={18} className="text-primary" />}
          title="Display Name"
          description="This is how other users will see you across the platform."
        >
          <div className="flex gap-3">
            <input
              type="text"
              value={form.displayName}
              onChange={e => setForm(prev => ({ ...prev, displayName: e.target.value }))}
              placeholder="Your display name"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:border-primary focus:bg-white/10 focus:outline-none transition-all text-sm"
            />
            <SaveButton status={nameStatus} onClick={saveDisplayName} disabled={!form.displayName.trim()} />
          </div>
        </SettingsCard>

        {/* Avatar URL */}
        <SettingsCard
          icon={<Camera size={18} className="text-accent-purple" />}
          title="Avatar URL"
          description="Paste a direct image URL to set your profile picture."
        >
          <div className="flex gap-3">
            <input
              type="url"
              value={form.photoURL}
              onChange={e => setForm(prev => ({ ...prev, photoURL: e.target.value }))}
              placeholder="https://example.com/avatar.png"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:border-primary focus:bg-white/10 focus:outline-none transition-all text-sm font-mono"
            />
            <SaveButton status={avatarStatus} onClick={saveAvatar} />
          </div>
        </SettingsCard>

        {/* Phone Number */}
        <SettingsCard
          icon={<Phone size={18} className="text-primary" />}
          title="Contact Phone"
          description="Used for marketplace seller contact. Visible only to buyers."
        >
          <div className="flex gap-3">
            <input
              type="tel"
              value={form.phoneNumber}
              onChange={e => setForm(prev => ({ ...prev, phoneNumber: e.target.value }))}
              placeholder="+92 300 1234567"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:border-primary focus:bg-white/10 focus:outline-none transition-all text-sm font-mono"
            />
            <SaveButton status={phoneStatus} onClick={savePhone} />
          </div>
        </SettingsCard>

        {/* Username */}
        <SettingsCard
          icon={<AtSign size={18} className="text-primary" />}
          title="Username"
          description="Your unique @handle on NeuroBuilds. Used for DMs and mentions."
        >
          <div className="space-y-2">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-mono">@</span>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9.]/g, ''))}
                  placeholder="your.handle"
                  autoComplete="off"
                  className={`w-full bg-white/5 border rounded-lg pl-8 pr-10 py-2.5 text-white placeholder-gray-600 focus:bg-white/10 focus:outline-none transition-all text-sm font-mono ${
                    usernameStatus === 'available' ? 'border-green-500/60 focus:border-green-400' :
                    usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red-500/60 focus:border-red-400' :
                    'border-white/10 focus:border-primary'
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus === 'checking' && <Loader size={14} className="animate-spin text-gray-400" />}
                  {usernameStatus === 'available' && <CheckCircle size={14} className="text-green-400" />}
                  {(usernameStatus === 'taken' || usernameStatus === 'invalid') && <XCircle size={14} className="text-red-400" />}
                </div>
              </div>
              <SaveButton
                status={usernameSaveStatus}
                onClick={saveUsername}
                disabled={
                  !usernameInput.trim() ||
                  usernameInput.trim() === currentUsername ||
                  usernameStatus === 'taken' ||
                  usernameStatus === 'invalid' ||
                  usernameStatus === 'checking'
                }
              />
            </div>
            {usernameStatus === 'available' && (
              <p className="text-xs text-green-400">@{usernameInput} is available</p>
            )}
            {usernameStatus === 'taken' && (
              <p className="text-xs text-red-400">That username is already taken</p>
            )}
            {usernameStatus === 'invalid' && (
              <p className="text-xs text-red-400">3–20 chars: lowercase letters, numbers, dots. No leading/trailing/double dots.</p>
            )}
            {usernameError && <p className="text-xs text-red-400">{usernameError}</p>}
          </div>
        </SettingsCard>

        {/* Two-Factor Authentication */}
        <TwoFactorSection user={user} />
      </main>
    </>
  );
}

// ─── Two-Factor Authentication Section ───────────────────────────────────────

interface TwoFactorSectionProps {
  user: User;
}

function TwoFactorSection({ user }: TwoFactorSectionProps) {
  const isEnrolled = multiFactor(user).enrolledFactors.length > 0;

  const [step, setStep] = useState<TwoFAStep>(isEnrolled ? 'enrolled' : 'idle');
  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);

  // Keep step in sync if the user just enrolled/unenrolled from another tab
  useEffect(() => {
    setStep(multiFactor(user).enrolledFactors.length > 0 ? 'enrolled' : 'idle');
  }, [user]);

  const clearError = () => setLocalError(null);

  const handleSendVerificationEmail = async () => {
    clearError();
    setLocalLoading(true);
    try {
      await sendEmailVerification(user);
      setVerificationEmailSent(true);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to send verification email.');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleStartSetup = async () => {
    clearError();
    setLocalLoading(true);
    setStep('generating');
    try {
      const session = await multiFactor(user).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      setTotpSecret(secret);
      setStep('scan');
    } catch (err: any) {
      setLocalError(err.message || 'Failed to generate TOTP secret.');
      setStep('idle');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleEnroll = async () => {
    if (!totpSecret) return;
    if (verifyCode.length !== 6) {
      setLocalError('Enter the full 6-digit code from your authenticator app.');
      return;
    }
    clearError();
    setLocalLoading(true);
    setStep('enrolling');
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(totpSecret, verifyCode);
      await multiFactor(user).enroll(assertion, 'Primary Authenticator');
      setVerifyCode('');
      setTotpSecret(null);
      setStep('enrolled');
    } catch (err: any) {
      setLocalError(err.message || 'Invalid code. Please try again.');
      setStep('scan');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleUnenroll = async () => {
    clearError();
    setLocalLoading(true);
    try {
      const factor = multiFactor(user).enrolledFactors[0];
      await multiFactor(user).unenroll(factor);
      setStep('idle');
    } catch (err: any) {
      setLocalError(err.message || 'Failed to disable 2FA.');
    } finally {
      setLocalLoading(false);
    }
  };

  const qrUrl = totpSecret && user.email
    ? totpSecret.generateQrCodeUrl(user.email, 'NeuroBuilds')
    : null;

  const secretKey = totpSecret?.secretKey ?? '';

  return (
    <div className="glass-panel rounded-bento border border-white/10 p-6 mb-4">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-1">
        <Shield size={18} className="text-accent-purple" />
        <h2 className="font-bold text-white text-sm">Two-Factor Authentication</h2>
      </div>
      <p className="text-xs text-gray-500 mb-5">
        Add an extra layer of security using an authenticator app (Google Authenticator, Authy, etc.).
      </p>

      {localError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0" />
          {localError}
        </div>
      )}

      {/* ── Enrolled state ── */}
      {step === 'enrolled' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-green-500/10 border border-green-500/30 shadow-[0_0_12px_rgba(34,197,94,0.15)]">
            <ShieldCheck size={18} className="text-green-400 shrink-0" />
            <span className="text-green-400 font-bold text-sm">2FA Account Secured</span>
          </div>
          <button
            type="button"
            onClick={handleUnenroll}
            disabled={localLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ShieldOff size={15} />
            {localLoading ? 'Disabling…' : 'Disable 2FA'}
          </button>
        </div>
      )}

      {/* ── Idle state (not enrolled) ── */}
      {step === 'idle' && (
        <>
          {/* Email verification gate */}
          {!user.emailVerified && (
            <div className="mb-5 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                <span className="text-amber-400 font-bold text-sm">Email not verified</span>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                You must verify your email address before enabling 2FA.
              </p>
              {verificationEmailSent ? (
                <p className="text-xs text-green-400">
                  Verification email sent. Check your inbox, then refresh this page.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleSendVerificationEmail}
                  disabled={localLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-bold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={13} className={localLoading ? 'animate-spin' : ''} />
                  Send Verification Email
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleStartSetup}
            disabled={!user.emailVerified || localLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent-purple/10 hover:bg-accent-purple/20 border border-accent-purple/30 text-accent-purple font-bold text-sm transition-all shadow-[0_0_10px_rgba(191,0,255,0.1)] hover:shadow-[0_0_16px_rgba(191,0,255,0.25)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Shield size={15} />
            Set Up Authenticator App
          </button>
        </>
      )}

      {/* ── Generating spinner ── */}
      {step === 'generating' && (
        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <RefreshCw size={16} className="animate-spin text-accent-purple" />
          Generating secure secret…
        </div>
      )}

      {/* ── Scan / Verify step ── */}
      {step === 'scan' && qrUrl && (
        <div className="space-y-5">
          <p className="text-xs text-gray-400">
            Scan the QR code with your authenticator app, then enter the 6-digit code to confirm.
          </p>

          {/* QR code */}
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="p-3 bg-white rounded-xl shrink-0">
              <QRCodeSVG value={qrUrl} size={160} level="M" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-1 font-mono uppercase tracking-widest">Manual entry key</p>
                <p className="font-mono text-xs text-primary break-all bg-white/5 border border-white/10 rounded-lg px-3 py-2 leading-relaxed select-all">
                  {secretKey}
                </p>
              </div>
              <p className="text-xs text-gray-600">
                If you cannot scan the code, add the key manually in your authenticator app using the issuer <span className="text-gray-400">NeuroBuilds</span>.
              </p>
            </div>
          </div>

          {/* Code entry */}
          <div>
            <label className="block text-xs text-gray-400 font-bold mb-2 font-mono uppercase tracking-widest">
              Verification Code
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyCode}
                onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-40 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-700 text-center font-mono text-lg tracking-[0.4em] focus:border-accent-purple focus:bg-white/10 focus:outline-none focus:shadow-[0_0_10px_rgba(191,0,255,0.2)] transition-all"
              />
              <button
                type="button"
                onClick={handleEnroll}
                disabled={localLoading || verifyCode.length !== 6}
                className="px-5 py-2.5 rounded-lg bg-accent-purple/20 hover:bg-accent-purple/30 border border-accent-purple/40 text-accent-purple font-bold text-sm transition-all shadow-[0_0_10px_rgba(191,0,255,0.15)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {localLoading ? 'Verifying…' : 'Verify & Enable'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('idle'); setTotpSecret(null); setVerifyCode(''); clearError(); }}
                className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 text-sm transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Enrolling spinner ── */}
      {step === 'enrolling' && (
        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <RefreshCw size={16} className="animate-spin text-accent-purple" />
          Enrolling authenticator…
        </div>
      )}
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

interface SettingsCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}

function SettingsCard({ icon, title, description, children }: SettingsCardProps) {
  return (
    <div className="glass-panel rounded-bento border border-white/10 p-6 mb-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h2 className="font-bold text-white text-sm">{title}</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">{description}</p>
      {children}
    </div>
  );
}

interface SaveButtonProps {
  status: SaveStatus;
  onClick: () => void;
  disabled?: boolean;
}

function SaveButton({ status, onClick, disabled }: SaveButtonProps) {
  const isSaved = status === 'saved';
  const isSaving = status === 'saving';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isSaving}
      className={`shrink-0 px-4 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${
        isSaved
          ? 'bg-green-500/20 border border-green-500/30 text-green-400'
          : 'bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary disabled:opacity-40 disabled:cursor-not-allowed'
      }`}
    >
      {isSaved ? (
        <><CheckCircle size={15} /> Saved</>
      ) : isSaving ? (
        <><Save size={15} className="animate-pulse" /> Saving…</>
      ) : (
        <><Save size={15} /> Save</>
      )}
    </button>
  );
}
