import Icon from './Icon.jsx';

/*
 * EmptyState — what a list shows when there is nothing in it yet: what
 * would be here, and the action that puts something here (as children).
 */
export default function EmptyState({ icon = 'file', title, children = null, actions = null }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <p className="empty-title">{title}</p>
      {children && <p className="empty-text">{children}</p>}
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}
