/*
 * paletteSearch.js — what the quick search (CommandPalette.jsx) shows for a
 * query. Pure, so the ranking can be tested without a browser.
 *
 * An item is { id, kind, label, detail?, keywords?, href? }. Kinds are
 * 'page', 'action', 'player' and 'game'.
 */

const fold = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const KIND_ORDER = { page: 0, action: 1, player: 2, game: 3 };

/** How well one item matches the folded query words; 0 means not at all. */
function scoreOf(item, words) {
  const label = fold(item.label);
  const rest = fold(`${item.detail ?? ''} ${item.keywords ?? ''}`);
  let score = 0;
  for (const word of words) {
    if (label.startsWith(word)) score += 100;
    else if (label.split(/[\s-]+/).some((part) => part.startsWith(word))) score += 60;
    else if (label.includes(word)) score += 30;
    else if (rest.includes(word)) score += 10;
    else return 0; // every word has to be somewhere
  }
  return score;
}

/**
 * The items to list for a query, best first. With nothing typed, the pages
 * and actions are listed as a menu; players and games appear once you type.
 */
export function searchPalette(items, query, limit = 8) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return items.filter((item) => item.kind === 'page' || item.kind === 'action');
  return items
    .map((item, index) => ({ item, index, score: scoreOf(item, words) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) => b.score - a.score || KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind] || a.index - b.index,
    )
    .slice(0, limit)
    .map((entry) => entry.item);
}
