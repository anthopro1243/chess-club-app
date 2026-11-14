/*
 * PageSkeleton — the shape of a page while its code or data is on the way.
 * It says "Loading" to a screen reader; the grey blocks are for the eye.
 */
export default function PageSkeleton() {
  return (
    <div className="skeleton-page" role="status">
      <span className="sr-only">Loading…</span>
      <div className="skeleton-row" aria-hidden="true">
        <span className="skeleton skeleton-tile" />
        <span className="skeleton skeleton-tile" />
        <span className="skeleton skeleton-tile" />
      </div>
      <div className="skeleton skeleton-panel" aria-hidden="true" />
    </div>
  );
}
