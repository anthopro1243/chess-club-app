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
            Sign in at the top right. New here? Create an account and the coach will let you in,
            or use your invite code.
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
            The coach hasn&rsquo;t approved your account yet. If you have an invite code, enter it
            from the account menu at the top right.
          </p>
        </>
      )}
    </section>
  );
}
