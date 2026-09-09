/**
 * AccessGate — what the app shows to someone who is not in the club.
 *
 * The database already refuses these people: every policy added in
 * migration 0005 requires an approved account. This is the matching thing
 * in the interface, so that a stranger who finds the URL sees a closed door
 * rather than an empty coach dashboard.
 *
 * Only used when a backend is configured. Running with no backend at all is
 * somebody's own browser with their own data in it, and there is nobody to
 * keep it from.
 */
export default function AccessGate({ signedIn, status }) {
  return (
    <section className="panel access-gate">
      {!signedIn ? (
        <>
          <h2>Club members only</h2>
          <p>
            Sign in with the button at the top right. If you are new, create an account and a
            coach will let you in, or use an invite code if you were given one.
          </p>
        </>
      ) : status === 'suspended' ? (
        <>
          <h2>This account is suspended</h2>
          <p>Ask a coach to reinstate it.</p>
        </>
      ) : (
        <>
          <h2>Waiting for a coach</h2>
          <p>
            Your account exists but has not been approved yet. A coach can approve it, or you can
            enter an invite code from the account menu at the top right.
          </p>
        </>
      )}
    </section>
  );
}
