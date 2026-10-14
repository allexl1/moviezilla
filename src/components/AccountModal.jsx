import { useState, useEffect } from 'react';
import { X, LogOut, RefreshCw, Lock } from 'lucide-react';
import {
  useAccount,
  sendCode,
  signInWithGoogle,
  signOut,
  saveDisplayName,
  syncNow,
  lastSyncedAt,
  uploadAvatar,
  deleteMyData,
} from '../services/account';
import { storage } from '../services/storage';
import Modal from './ui/Modal';
import Input from './ui/Input';
import SegmentedControl from './ui/SegmentedControl';
import HoldButton from './ui/HoldButton';

// Google "G" (inline SVG, brand asset by necessity — no lucide glyph
// exists for it; keep it multicolor per Google's brand rules).
function GoogleMark() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.9-2.1-6.8-5l-.1.1-3.7 2.9v.1C3.3 21.5 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8-.1.1C.5 8.6 0 10.2 0 12s.5 3.4 1.4 4.9l3.8-2.5z" />
      <path fill="#EA4335" d="M12 4.6c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.3 2.5 1.4 6.1l3.8 2.9c.9-2.8 3.6-4.4 6.8-4.4z" />
    </svg>
  );
}

function syncLabelFor(ts) {
  if (!ts) return 'Never synced';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 20) return 'Synced just now';
  if (s < 60) return `Synced ${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `Synced ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Synced ${h}h ago`;
  return `Synced ${new Date(ts).toLocaleDateString()}`;
}

// Display-name editor, keyed per user so the draft initializes without
// a syncing effect.
function NameEditor({ initial }) {
  const [draft, setDraft] = useState(initial || '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMsg('');
    try {
      await saveDisplayName(draft);
      setMsg('Saved. This name shows in rooms, chat and playlists.');
    } catch (err) {
      setMsg(err.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your name"
            aria-label="Display name"
            maxLength={24}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
        </div>
        <button onClick={save} disabled={busy} className="cine-control-btn px-4 h-10 flex-shrink-0 disabled:opacity-50">
          {busy ? '…' : 'Save'}
        </button>
      </div>
      {msg && <p className="text-[11px] text-white/50">{msg}</p>}
    </div>
  );
}

function AccountBody() {
  const { user, ready, displayName } = useAccount();
  // Passwordless = one flow for both tabs (account is created on first
  // login). The tabs only switch the framing copy — Clerk pattern.
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncLabel, setSyncLabel] = useState(() => syncLabelFor(lastSyncedAt()));
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dangerError, setDangerError] = useState('');

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Live "last synced" label (initializer paints first; listener +
  // interval refresh — no synchronous setState in the effect body).
  useEffect(() => {
    const update = () => setSyncLabel(syncLabelFor(lastSyncedAt()));
    window.addEventListener('mz:account-sync', update);
    const t = setInterval(update, 30000);
    return () => {
      window.removeEventListener('mz:account-sync', update);
      clearInterval(t);
    };
  }, []);

  const send = async (isResend = false) => {
    if (busy || (isResend && cooldown > 0)) return;
    setBusy(true);
    setError('');
    try {
      await sendCode(email);
      setStep('sent');
      setCooldown(30);
    } catch (err) {
      setError(err.message || 'Could not send the link.');
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await signInWithGoogle();
      // Full-page redirect to Google from here; SIGNED_IN + merge
      // happen on the return landing (handleAuthRedirect on app start).
    } catch (err) {
      setError(err.message || 'Could not start Google sign-in.');
      setBusy(false);
    }
  };

  if (!ready) return null;

  if (!user) {
    const signup = mode === 'signup';
    return (
      <div className="space-y-5">
        {/* Brand + headline: centered auth-card convention */}
        <div className="flex flex-col items-center text-center space-y-2.5 pt-1">
          <div className="cine-logo-tile" aria-hidden="true">
            MZ
          </div>
          <h3 className="text-xl font-extrabold text-white tracking-tight">
            {signup ? 'Create your account' : 'Welcome back'}
          </h3>
          <p className="text-[13px] text-white/55 leading-relaxed max-w-[280px]">
            {signup
              ? 'One email, no password. Your library follows you everywhere.'
              : 'Log in to pick up your watchlist and resume points.'}
          </p>
        </div>

        <div className="flex justify-center">
          <SegmentedControl
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError('');
            }}
            options={[
              { value: 'login', label: 'Log in' },
              { value: 'signup', label: 'Sign up' },
            ]}
          />
        </div>

        {step === 'email' ? (
          <div className="space-y-3">
            <button
              onClick={google}
              disabled={busy}
              className="cine-btn cine-btn-white h-12 px-6 text-[15px] w-full disabled:opacity-50 inline-flex items-center justify-center gap-2.5"
            >
              <GoogleMark /> Continue with Google
            </button>
            <div className="flex items-center gap-3 text-[11px] text-white/35" aria-hidden="true">
              <span className="flex-1 h-px bg-white/10" />
              <span>or email link</span>
              <span className="flex-1 h-px bg-white/10" />
            </div>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              aria-label="Email address"
              inputMode="email"
              autoComplete="email"
              onKeyDown={(e) => {
                if (e.key === 'Enter') send(false);
              }}
            />
            <button
              onClick={() => send(false)}
              disabled={busy}
              className="cine-control-btn h-12 px-6 text-[15px] w-full disabled:opacity-50"
            >
              {busy ? 'Sending…' : signup ? 'Create account' : 'Log in'}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-white/40">
              <Lock className="w-3 h-3" /> No password. We email you a sign-in link.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-[13px] text-white/60">
              Tap the link we sent to <span className="font-bold text-white/90">{email || 'your inbox'}</span> to finish signing in on this device.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => send(true)}
                disabled={busy || cooldown > 0}
                className="text-[12px] font-semibold text-white/60 hover:text-white transition cursor-pointer disabled:opacity-40"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend link'}
              </button>
              <span className="w-1 h-1 rounded-full bg-white/20" aria-hidden="true" />
              <button
                onClick={() => {
                  setStep('email');
                  setError('');
                }}
                className="text-[12px] font-semibold text-white/40 hover:text-white transition cursor-pointer"
              >
                Different email
              </button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-center text-xs font-semibold text-red-400/90">
            {error}
          </p>
        )}
      </div>
    );
  }

  const initial = (displayName || user.email || '?').slice(0, 1).toUpperCase();
  const avatarUrl = user.user_metadata?.avatar_url || '';

  const onAvatarFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || uploading) return;
    setUploading(true);
    setAvatarError('');
    try {
      await uploadAvatar(f);
      // USER_UPDATED flips the photo via useAccount.
    } catch (err) {
      setAvatarError(err.message || 'Could not upload.');
    } finally {
      setUploading(false);
    }
  };

  const onDeleteData = async () => {
    if (deleting) return;
    setDeleting(true);
    setDangerError('');
    try {
      await deleteMyData();
      // signOut flips to the logged-out view via useAccount.
    } catch (err) {
      setDangerError(err.message || 'Could not delete.');
    } finally {
      setDeleting(false);
    }
  };

  const wlCount = storage.getWatchlist().length;
  const histCount = storage.getWatchHistory().length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="cursor-pointer flex-shrink-0 cine-has-tip focus-within:outline-2 focus-within:outline-white/60 focus-within:rounded-full" aria-label="Change avatar">
          <input type="file" accept="image/*" className="sr-only" onChange={onAvatarFile} disabled={uploading} />
          <span className="relative block w-10 h-10">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <span
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black"
                style={{
                  background: 'color-mix(in srgb, var(--cine-accent) 18%, transparent)',
                  color: 'var(--cine-accent)',
                  border: '1px solid color-mix(in srgb, var(--cine-accent) 40%, transparent)',
                }}
              >
                {initial}
              </span>
            )}
            {uploading && (
              <span className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center" aria-hidden="true">
                <span className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
              </span>
            )}
          </span>
          <span className="cine-tip" aria-hidden="true">Change avatar</span>
        </label>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{displayName || 'Your account'}</p>
          <p className="text-[11px] text-white/50 truncate">{user.email}</p>
        </div>
      </div>
      {avatarError && (
        <p role="alert" className="text-[11px] font-semibold text-red-400/90">{avatarError}</p>
      )}
      <NameEditor key={user.id} initial={displayName} />
      <div className="flex items-center justify-between gap-3 mat-row p-3">
        <p className="text-[11px] text-white/55">
          {syncLabel} • {wlCount} saved • {histCount} in history. Watchlist, watched and resume sync across devices.
        </p>
        <button
          onClick={async () => {
            if (syncing) return;
            setSyncing(true);
            try {
              await syncNow();
            } catch {
              // errors surface as a stale label; next auto-flush retries.
            } finally {
              setSyncing(false);
            }
          }}
          className="cine-pill cine-pill--sm flex-shrink-0"
          aria-label="Pull, converge and push now"
        >
          <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
      <button
        onClick={() => signOut().catch(() => {})}
        className="cine-control-btn w-full h-11 text-sm"
      >
        <LogOut className="w-4 h-4" /> Sign out
      </button>
      <div className="rounded-2xl border border-red-500/25 p-3 space-y-2">
        <p className="text-xs font-bold text-red-400">Danger zone</p>
        {!showDelete ? (
          <button
            onClick={() => {
              setShowDelete(true);
              setDangerError('');
            }}
            className="cine-btn-danger cine-btn-danger rounded-full px-4 h-10 text-xs font-bold"
          >
            Delete my data
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-white/60">
              Wipes your watchlist and history here and on the server, then signs out. Cannot be undone.
            </p>
            {dangerError && (
              <p role="alert" className="text-[11px] font-semibold text-red-400/90">{dangerError}</p>
            )}
            <div className="flex items-center gap-2">
              <HoldButton
                onConfirm={onDeleteData}
                className="cine-btn-danger cine-btn-danger rounded-full px-4 h-10 text-xs font-bold"
                aria-label="Hold to delete all my data"
              >
                {deleting ? 'Deleting…' : 'Hold to delete'}
              </HoldButton>
              <button
                onClick={() => {
                  setShowDelete(false);
                  setDangerError('');
                }}
                className="text-[12px] font-semibold text-white/50 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AccountModal({ isOpen, onClose }) {
  // Logged-out body carries its own branding (logo + headline), so the
  // modal header only shows for the signed-in view.
  const { user } = useAccount();
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-sm"
      align="center"
      showCloseButton={false}
      panelClassName="p-6 sm:p-8"
      label="Account"
    >
      {user ? (
        <div className="flex items-center justify-between pb-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Account</h2>
            <p className="text-xs text-white/45 mt-0.5">Library sync across devices</p>
          </div>
          <button onClick={onClose} className="cine-icon-btn"  aria-label="Close account">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button onClick={onClose} className="cine-icon-btn"  aria-label="Close account">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <AccountBody />
    </Modal>
  );
}
