import Icon from './Icon.jsx';

/*
 * ExternalLink — a link to another website. It opens in a new tab, says so
 * with an icon, and says so to a screen reader too, so the accessible name
 * reads "Fork puzzles on Lichess, opens in a new tab". Write the visible
 * text so it says where the link goes ("Fork puzzles on Lichess").
 */
export default function ExternalLink({ href, className = '', children }) {
  return (
    <a href={href} className={`ext-link ${className}`.trim()} target="_blank" rel="noopener noreferrer">
      <span>{children}</span>
      <Icon name="external" size={14} className="ext-link-icon" />
      <span className="sr-only">, opens in a new tab</span>
    </a>
  );
}
