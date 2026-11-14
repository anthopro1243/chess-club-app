import { href } from '../app/routes.js';

/*
 * Link — a real link to a page of the app. Use it for anything that changes
 * the page, and a <button> for actions on the page: a link is announced as a
 * link, can be opened in a new tab or copied, and says which page is current.
 */
export default function Link({ to, params = null, current = false, className = '', children, ...rest }) {
  return (
    <a href={href(to, params)} className={className} aria-current={current ? 'page' : undefined} {...rest}>
      {children}
    </a>
  );
}
