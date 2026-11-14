import { useEffect, useState } from 'react';

/**
 * "On this page" links for a long page: one button per section heading inside
 * `containerRef`. They are buttons, not links, because the URL hash belongs
 * to the router. Sections that render nothing get no button.
 */
export default function JumpNav({ containerRef, label = 'On this page' }) {
  const [titles, setTitles] = useState([]);

  // Sections come and go with the data, so watch the page for headings.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const read = () => {
      const found = [...container.querySelectorAll('section.panel h2')].map((h) => h.textContent);
      setTitles((prev) => (prev.join('\n') === found.join('\n') ? prev : found));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [containerRef]);

  if (titles.length < 3) return null;

  const jumpTo = (index) => {
    const heading = containerRef.current?.querySelectorAll('section.panel h2')[index];
    if (!heading) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading.closest('section').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  };

  return (
    <nav className="jump-nav" aria-label={label}>
      {titles.map((title, i) => (
        <button key={title} type="button" className="jump-link" onClick={() => jumpTo(i)}>
          {title}
        </button>
      ))}
    </nav>
  );
}
