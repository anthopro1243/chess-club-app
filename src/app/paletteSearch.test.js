import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPalette } from './paletteSearch.js';

const ITEMS = [
  { id: 'page:games', kind: 'page', label: 'Games' },
  { id: 'page:roster', kind: 'page', label: 'Roster', keywords: 'players members' },
  { id: 'action:theme', kind: 'action', label: 'Switch to light theme' },
  { id: 'player:1', kind: 'player', label: 'Maya Okafor', detail: 'CC-002 · USCF 1642' },
  { id: 'player:2', kind: 'player', label: 'Sofía Castellanos', detail: 'CC-006' },
  { id: 'game:1', kind: 'game', label: 'Maya Okafor vs Daniel Reyes', detail: 'Nov 3 · 1-0' },
];

const ids = (query, limit) => searchPalette(ITEMS, query, limit).map((item) => item.id);

test('nothing typed: the pages and actions, as a menu', () => {
  assert.deepEqual(ids(''), ['page:games', 'page:roster', 'action:theme']);
  assert.deepEqual(ids('   '), ['page:games', 'page:roster', 'action:theme']);
});

test('a name finds the player before the games they played', () => {
  assert.deepEqual(ids('maya'), ['player:1', 'game:1']);
});

test('a later word of a name, an accent, and an id all match', () => {
  assert.deepEqual(ids('reyes'), ['game:1']);
  assert.deepEqual(ids('sofia'), ['player:2']);
  assert.deepEqual(ids('cc-006'), ['player:2']);
});

test('every word must match; keywords count', () => {
  assert.deepEqual(ids('maya reyes'), ['game:1']);
  assert.deepEqual(ids('maya zzz'), []);
  assert.deepEqual(ids('members'), ['page:roster']);
});

test('a page beats a player on the same score, and the limit holds', () => {
  const items = [
    { id: 'player:g', kind: 'player', label: 'Gabe' },
    { id: 'page:games', kind: 'page', label: 'Games' },
  ];
  assert.deepEqual(searchPalette(items, 'ga').map((i) => i.id), ['page:games', 'player:g']);
  assert.equal(searchPalette(items, 'ga', 1).length, 1);
});
