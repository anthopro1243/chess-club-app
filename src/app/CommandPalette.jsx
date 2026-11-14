import { useId, useMemo, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Icon from '../ui/Icon.jsx';
import Avatar from '../ui/Avatar.jsx';
import { usePlayers } from '../features/roster/rosterStore.js';
import { useGames } from '../features/games/gamesStore.js';
import { shortGameDate } from '../analysis/playerHome.js';
import { visibleRoutes, href } from './routes.js';
import { goTo } from './useRoute.js';
import { searchPalette } from './paletteSearch.js';

const KIND_LABEL = { page: 'Page', action: 'Action', player: 'Player', game: 'Game' };

/*
 * CommandPalette — quick search across pages, players and games (Ctrl K, or
 * "/"). A dialog with one text box that owns a list: arrows move, Enter
 * opens, Escape closes, and focus never leaves the box.
 */
export default function CommandPalette({ account, theme, onToggleTheme, onClose }) {
  const players = usePlayers();
  const games = useGames();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  const items = useMemo(
    () => [
      ...visibleRoutes(account).map((route) => ({
        id: `page:${route.id}`,
        kind: 'page',
        icon: route.icon,
        label: route.label,
        detail: route.summary,
        href: href(route.id),
      })),
      {
        id: 'action:theme',
        kind: 'action',
        icon: theme === 'dark' ? 'sun' : 'moon',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        keywords: 'dark light theme appearance colours',
        run: onToggleTheme,
      },
      ...players.map((player) => ({
        id: `player:${player.playerId}`,
        kind: 'player',
        label: player.name,
        detail: [player.playerId, player.ratings?.uscf != null ? `USCF ${player.ratings.uscf}` : null]
          .filter(Boolean)
          .join(' · '),
        href: href('roster', { player: player.playerId }),
      })),
      ...games.map((game) => ({
        id: `game:${game.id}`,
        kind: 'game',
        icon: 'games',
        label: `${game.whiteName} vs ${game.blackName}`,
        detail: [shortGameDate(game.playedAt), game.result === '1/2-1/2' ? '½-½' : game.result, game.event]
          .filter(Boolean)
          .join(' · '),
        href: href('games', { game: game.id }),
      })),
    ],
    [account, theme, onToggleTheme, players, games],
  );

  const results = useMemo(() => searchPalette(items, query), [items, query]);
  const current = Math.min(active, Math.max(0, results.length - 1));

  const run = (item) => {
    if (!item) return;
    onClose();
    if (item.run) item.run();
    else goTo(item.href);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!results.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = (current + step + results.length) % results.length;
      setActive(next);
      document.getElementById(`${listId}-${next}`)?.scrollIntoView?.({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(results[current]);
    }
  };

  return (
    <Modal label="Search" onClose={onClose} className="palette">
      <div className="palette-box">
        <Icon name="search" size={18} />
        <input
          type="text"
          role="combobox"
          className="palette-input"
          aria-label="Search pages, players and games"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results.length ? `${listId}-${current}` : undefined}
          placeholder="Search pages, players and games"
          autoComplete="off"
          spellCheck="false"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <kbd className="kbd">Esc</kbd>
      </div>

      <ul className="palette-list" id={listId} role="listbox" aria-label="Results">
        {results.map((item, index) => (
          // The text box owns the keyboard (aria-activedescendant); a click is the mouse's way in.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <li
            key={item.id}
            id={`${listId}-${index}`}
            role="option"
            tabIndex={-1}
            aria-selected={index === current}
            className={`palette-item ${index === current ? 'active' : ''}`}
            onMouseMove={() => setActive(index)}
            onClick={() => run(item)}
          >
            {item.kind === 'player' ? (
              <Avatar name={item.label} size="sm" />
            ) : (
              <span className="palette-icon">
                <Icon name={item.icon} size={16} />
              </span>
            )}
            <span className="palette-text">
              <span className="palette-label">{item.label}</span>
              {item.detail && <span className="palette-detail">{item.detail}</span>}
            </span>
            <span className="palette-kind">{KIND_LABEL[item.kind]}</span>
          </li>
        ))}
      </ul>

      <p className="palette-status" role="status">
        {results.length === 0 ? `Nothing matches “${query.trim()}”.` : ''}
      </p>

      <p className="palette-hint" aria-hidden="true">
        <kbd className="kbd">↑</kbd>
        <kbd className="kbd">↓</kbd> to move
        <kbd className="kbd">Enter</kbd> to open
      </p>
    </Modal>
  );
}
