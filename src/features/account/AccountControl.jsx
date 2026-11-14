import { useEffect, useId, useRef, useState } from 'react';
import { useCloudStatus, useMyProfile } from '../roster/rosterStore.js';
import ConnectionsModal from './ConnectionsModal.jsx';
import { useAccount } from './accountStore.js';
import { useMyAccountLink } from './accountLinkStore.js';
import SignInForm from './SignInForm.jsx';
import SignUpForm from './SignUpForm.jsx';
import ForgotPasswordForm from './ForgotPasswordForm.jsx';
import AwaitingApproval from './AwaitingApproval.jsx';
import ClaimProfileForm from './ClaimProfileForm.jsx';
import AccountSummary from './AccountSummary.jsx';

/**
 * AccountControl — the sign-in / account button in the top bar.
 *
 * Renders nothing when no backend is configured (accounts are inherently a
 * shared-backend feature). Otherwise walks through: signed out (sign in /
 * create account / forgot password, one at a time), signed in with no
 * player row yet (claim one), and signed in with a profile (name, rating,
 * change password, sign out).
 */
export default function AccountControl() {
  const cloud = useCloudStatus();
  const profile = useMyProfile();
  const account = useAccount();
  const link = useMyAccountLink();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'
  const [showConnections, setShowConnections] = useState(false);
  const popoverId = useId();
  const buttonRef = useRef(null);
  const boxRef = useRef(null);

  const close = () => {
    setOpen(false);
    setMode('signin');
  };

  // Escape closes the menu and returns focus to its button; so does a click
  // anywhere outside it.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      close();
      buttonRef.current?.focus();
    };
    const onPointer = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  if (!cloud.configured) return null;

  return (
    <div className="account-control" ref={boxRef}>
      <button
        type="button"
        ref={buttonRef}
        className="account-button"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="account-name">{cloud.signedIn ? profile?.name || cloud.email : 'Sign in'}</span>
      </button>

      {open && (
        <div className="account-popover" id={popoverId}>
          {!cloud.signedIn && mode === 'signin' && (
            <SignInForm onDone={close} onSwitch={setMode} />
          )}
          {!cloud.signedIn && mode === 'signup' && (
            <SignUpForm onDone={close} onSwitch={setMode} />
          )}
          {!cloud.signedIn && mode === 'forgot' && (
            <ForgotPasswordForm onSwitch={setMode} />
          )}
          {cloud.signedIn && !account.loading && !account.isApproved && <AwaitingApproval />}
          {/* With migration 0025 the "Who are you?" step on the page makes the
              roster row (and matches the coach's import); offering "Join the
              roster" here too would make a second row for the same student. */}
          {cloud.signedIn && account.isApproved && !profile && link.available && (
            <p className="hint-text">Answer &ldquo;Who are you?&rdquo; on the page to join the roster.</p>
          )}
          {cloud.signedIn && account.isApproved && !profile && !link.available && (
            <ClaimProfileForm onDone={close} />
          )}
          {cloud.signedIn && account.isApproved && profile && (
            <AccountSummary
              cloud={cloud}
              profile={profile}
              studentId={link.studentId}
              onClose={close}
              onOpenConnections={() => {
                close();
                setShowConnections(true);
              }}
            />
          )}
        </div>
      )}

      {showConnections && <ConnectionsModal onClose={() => setShowConnections(false)} />}
    </div>
  );
}
