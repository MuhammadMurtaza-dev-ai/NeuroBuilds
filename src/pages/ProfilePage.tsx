import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  User as UserIcon,
  Camera,
  Phone,
  Save,
  CheckCircle,
  ShieldCheck,
  AlertTriangle,
  AtSign,
  XCircle,
  Loader,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { firebaseAuth, db } from '../Firebase';
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
  const [isVerified, setIsVerified] = useState(false);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync auth profile into form on user change
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
        setIsVerified(data.isVerified === true);
      }
    });
  }, [user]);

  useEffect(() => {
    const raw = usernameInput.trim();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived validation status from input
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
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : 'Save failed');
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
          {isVerified ? (
            <div className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 w-fit shadow-[0_0_10px_rgba(16,185,129,0.1)]">
              <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
              <span className="text-emerald-400 font-mono text-[11px] font-bold tracking-widest">✓ VERIFIED SELLER</span>
            </div>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-mono text-amber-500/60">
              <AlertTriangle size={11} className="shrink-0" />
              UNVERIFIED SELLER ACCOUNT
            </p>
          )}
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
      </main>
    </>
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
