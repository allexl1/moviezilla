import { useState, useEffect, useRef } from 'react';
import { X, LogOut, RefreshCw, Lock } from 'lucide-react';
import {
  useAccount,
  sendCode,
  verifyCode,
  signOut,
  saveDisplayName,
  syncNow,
  lastSyncedAt,
} from '../services/account';
import Modal from './ui/Modal';
import Input from './ui/Input';
import SegmentedControl from './ui/SegmentedControl';

// Segmented 6-digit code boxes (auth-convention pattern): one box per
// digit, numeric keyboard, SMS/email autofill on the first box, paste
// fills all, backspace walks back. Never type="number" (spinners, "e").
function OtpBoxes({ code, onCode, disabled }) {
  const refs = useRef([]);
  const chars = (code + '      ').slice(0, 6).split('');
  const focus = (i) => {
    try {
      const el = refs.current[Math.max(0, Math.min(5, i))];
      el?.focus();
      el?.select();
    } catch {
      // ignore
    }
  };
  return (
    <div className="flex items-center gap-1.5 sm:gap-2" role="group" aria-label="6-digit sign-in code">
      {chars.map((ch, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={ch === ' ' ? '' : ch}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1} of 6`}
          onChange={(e) => {
            const hit = (e.target.value.match(/[0-9]/g) || []).pop() || ' ';
            const next = [...chars];
            next[i] = hit;
            onCode(next.join(''));
            if (hit !== ' ' && i < 5) setTimeout(() => focus(i + 1), 0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && chars[i] === ' ') focus(i - 1);
          }}
          onPaste={(e) => {
            e.preventDefault();
            const t = ((e.clipboardData?.getData('text') || '').match(/[0-9]/g) || []).join('').slice(0, 6);
            if (t) {
              onCode((t + '      ').slice(0, 6));
              focus(Math.min(t.length, 5));
            }
          }}
          onFocus={(e) => e.target.select()}
          className="w-10 h-12 sm:w-11 sm:h-[52px] text-center text-lg font-black text-white rounded-xl bg-white/[0.06] border border-white/15 focus:border-white/60 focus:outline-none transition disabled:opacity-50"
        />
      ))}
    </div>
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
      setMsg('Saved — this name shows in rooms, chat and playlists.');
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
  const [code, setCode] = useState('      ');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncLabel, setSyncLabel] = useState(() => syncLabelFor(lastSyncedAt()));

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
      setStep('code');
      setCode('      ');
      setCooldown(30);
    } catch (err) {
      setError(err.message || 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const token = code.replace(/\s/g, '');
    if (token.length !== 6 || busy) return;
    setBusy(true);
    setError('');
    try {
      await verifyCode(email, token);
      // SIGNED_IN flips the section to the signed-in view via useAccount.
    } catch (err) {
      setError(err.message || 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  };

  // Gentle auto-submit shortly after the 6th digit (explicit Verify stays
  // for reviewers — instant submit hides typos).
  useEffect(() => {
    if (step !== 'code' || busy) return;
    if (code.replace(/\s/g, '').length !== 6) return;
    const t = setTimeout(() => {
      verify();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step, busy]);

  if (!ready) return null;

  if (!user) {
    const signup = mode === 'signup';
    return (
      <div className="space-y-5">
        {/* Brand + headline: centered auth-card convention */}
        <div className="flex flex-col items-center text-center space-y-2.5 pt-1">
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-2xl flex items-center justify-center text-white font-black text-xl shadow-2xl">
            MZ
          </div>
          <h3 className="text-xl font-extrabold text-white tracking-tight">
            {signup ? 'Create your account' : 'Welcome back'}
          </h3>
          <p className="text-[13px] text-white/55 leading-relaxed max-w-[280px]">
            {signup
              ? 'One email, no password — your library follows you everywhere.'
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
              className="cine-btn cine-btn-primary cine-btn-shimmer h-12 px-6 text-[15px] w-full disabled:opacity-50"
            >
              {busy ? 'Sending…' : signup ? 'Create account' : 'Log in'}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-white/40">
              <Lock className="w-3 h-3" /> No password — tap the link in the email to sign in instantly.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-[13px] text-white/60">
              <span className="font-bold text-white/90">Tap the link</span> in the email to sign in
              {` — or enter the 6-digit code below if yours shows one, for `}
              <span className="font-bold text-white/90">{email || 'your inbox'}</span>
            </p>
            <div className="flex justify-center">
              <OtpBoxes code={code} onCode={setCode} disabled={busy} />
            </div>
            <button
              onClick={verify}
              disabled={busy}
              className="cine-btn cine-btn-primary cine-btn-shimmer h-12 px-6 text-[15px] w-full disabled:opacity-50"
            >
              {busy ? 'Verifying…' : signup ? 'Create account' : 'Log in'}
            </button>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => send(true)}
                disabled={busy || cooldown > 0}
                className="text-[12px] font-semibold text-white/60 hover:text-white transition cursor-pointer disabled:opacity-40"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
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
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
          style={{
            background: 'color-mix(in srgb, var(--cine-accent) 18%, transparent)',
            color: 'var(--cine-accent)',
            border: '1px solid color-mix(in srgb, var(--cine-accent) 40%, transparent)',
          }}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{displayName || 'Your account'}</p>
          <p className="text-[11px] text-white/50 truncate">{user.email}</p>
        </div>
        <button
          onClick={() => signOut().catch(() => {})}
          className="text-[12px] font-semibold text-white/50 hover:text-red-400 transition cursor-pointer flex items-center gap-1 flex-shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>
      <NameEditor key={user.id} initial={displayName} />
      <div className="flex items-center justify-between gap-3 mat-row p-3">
        <p className="text-[11px] text-white/55">
          {syncLabel} — watchlist, watched & resume sync across devices.
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
          title="Pull, converge and push now"
        >
          <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
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
          <button onClick={onClose} className="cine-icon-btn" title="Close" aria-label="Close account">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button onClick={onClose} className="cine-icon-btn" title="Close" aria-label="Close account">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <AccountBody />
    </Modal>
  );
}
