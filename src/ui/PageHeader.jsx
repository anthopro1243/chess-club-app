import { createContext, useContext, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from './Link.jsx';
import Icon from './Icon.jsx';

/*
 * PageHeader — the visible top of every page: where you are, a line about
 * it, and the page's main actions.
 *
 * The shell (App.jsx) renders it, so every page gets one and the <h1> that
 * takes focus on navigation is always there. A page adds to it from inside:
 *
 *   <PageActions>…buttons…</PageActions>     its main actions, beside the title
 *   usePageMeta({ title, summary, crumbs })  a detail view names itself and
 *                                            says what it is inside of
 */
const PageChromeContext = createContext(null);

export const PageChromeProvider = PageChromeContext.Provider;

/** Renders its children in the page header's action area. */
export function PageActions({ children }) {
  const chrome = useContext(PageChromeContext);
  return chrome?.actionsNode ? createPortal(children, chrome.actionsNode) : null;
}

/**
 * Overrides the header for as long as the calling component is mounted.
 * `crumbs` is the path above this view: [{ label, to, params }].
 * Pass null to leave the route's own title in place.
 */
export function usePageMeta(meta) {
  const setMeta = useContext(PageChromeContext)?.setMeta;
  const key = meta ? JSON.stringify(meta) : '';
  useLayoutEffect(() => {
    if (!setMeta) return undefined;
    setMeta(key ? JSON.parse(key) : null);
    return () => setMeta(null);
  }, [setMeta, key]);
}

export default function PageHeader({ title, summary, crumbs = null, headingRef, actionsRef }) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {crumbs?.length > 0 && (
          <nav className="crumbs" aria-label="Breadcrumb">
            <ol>
              {crumbs.map((crumb, index) => (
                <li key={crumb.label}>
                  <Link to={crumb.to} params={crumb.params || null} className="crumb-link">
                    {index === 0 && <Icon name="arrow-left" size={15} />}
                    {crumb.label}
                  </Link>
                  <Icon name="chevron-right" size={13} className="crumb-sep" />
                </li>
              ))}
              <li className="crumb-current" aria-current="page">
                {title}
              </li>
            </ol>
          </nav>
        )}
        <h1 className="page-title" ref={headingRef} tabIndex={-1}>
          {title}
        </h1>
        {summary && <p className="page-summary">{summary}</p>}
      </div>
      <div className="page-actions" ref={actionsRef} />
    </header>
  );
}
