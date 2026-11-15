import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BANDS, CATEGORY_VIDEOS, GENERAL_VIDEOS, THEME_VIDEOS, LICHESS_THEMES, MENU_THEMES,
  allLinks, bandForRating, generalVideo, lichessForTheme, videoForCategory,
} from './resources.js';
import { CATEGORY_KEYS } from '../analysis/scoring.js';
import { PUZZLE_THEME_BY_TRAINING_THEME } from '../analysis/presentation.js';

const isYouTube = (url) => /^https:\/\/www\.youtube\.com\/(watch\?v=[\w-]{11}|playlist\?list=[\w-]+)$/.test(url);

test('every video has a title, a channel and a YouTube address', () => {
  const { videos } = allLinks();
  assert.ok(videos.length >= 15);
  for (const v of videos) {
    assert.ok(v.title && v.channel, `title and channel: ${v.url}`);
    assert.ok(isYouTube(v.url), `YouTube address: ${v.url}`);
    if (v.minutes != null) assert.ok(v.minutes > 0);
  }
});

test('no address is used twice for different slots with different titles', () => {
  const byUrl = new Map();
  for (const v of allLinks().videos) {
    if (byUrl.has(v.url)) assert.equal(byUrl.get(v.url).title, v.title);
    byUrl.set(v.url, v);
  }
});

test('every coaching category has an entry, and a video for every band (its own or the fallback)', () => {
  for (const key of CATEGORY_KEYS) {
    assert.ok(key in CATEGORY_VIDEOS, `category slot: ${key}`);
    for (const band of BANDS) {
      const v = videoForCategory(key, { under1000: 800, '1000-1400': 1200, '1400+': 1600 }[band]);
      assert.ok(v && isYouTube(v.url), `${key} at ${band}`);
    }
  }
  assert.deepEqual(Object.keys(GENERAL_VIDEOS).sort(), [...BANDS].sort());
});

test('only known categories, bands and themes appear as keys', () => {
  for (const [key, slot] of Object.entries(CATEGORY_VIDEOS)) {
    assert.ok(CATEGORY_KEYS.includes(key), key);
    for (const band of Object.keys(slot)) assert.ok(band === 'default' || BANDS.includes(band), `${key}.${band}`);
  }
  for (const theme of Object.keys(THEME_VIDEOS)) assert.ok(theme in LICHESS_THEMES, theme);
});

test('every Lichess link is lichess.org/training/<its own key>', () => {
  for (const [key, entry] of Object.entries(LICHESS_THEMES)) {
    assert.equal(entry.url, `https://lichess.org/training/${key}`);
    assert.ok(entry.label);
  }
  assert.deepEqual(MENU_THEMES, Object.keys(LICHESS_THEMES));
  assert.equal(lichessForTheme('fork').url, 'https://lichess.org/training/fork');
  assert.equal(lichessForTheme('nonsense'), null);
});

test('every theme the plan can name has a Lichess link', () => {
  for (const [label, key] of Object.entries(PUZZLE_THEME_BY_TRAINING_THEME)) {
    assert.ok(key in LICHESS_THEMES, `${label} -> ${key}`);
  }
});

test('rating bands', () => {
  assert.equal(bandForRating(null), 'under1000');
  assert.equal(bandForRating(999), 'under1000');
  assert.equal(bandForRating(1000), '1000-1400');
  assert.equal(bandForRating(1399), '1000-1400');
  assert.equal(bandForRating(1400), '1400+');
  assert.equal(generalVideo(null), GENERAL_VIDEOS.under1000);
});
