#!/usr/bin/env node
/*
 * import-puzzles.mjs — build src/data/puzzles.json from Lichess's official
 * open puzzle database (database.lichess.org/lichess_db_puzzle.csv.zst,
 * CC0-licensed). We only need a slice of it, not the full multi-GB dump, so
 * this fetches the first CHUNK_BYTES compressed bytes via an HTTP Range
 * request — several hundred thousand puzzles' worth once decompressed.
 *
 * Every candidate is replayed through our own rules engine before being
 * accepted: the CSV's "setup" move, then every move of the solution line.
 * Anything that doesn't replay legally is dropped. The tactic itself is
 * Lichess's own community-rated, engine-generated data — this step only
 * verifies our own move parsing didn't mangle it.
 *
 * Usage: node scripts/import-puzzles.mjs
 * Writes: src/data/puzzles.json
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import path from 'node:path';
import zlib from 'node:zlib';
import { Chess } from '../src/engine/chess.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, '../src/data/puzzles.json');

const DUMP_URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const CHUNK_BYTES = 12 * 1024 * 1024;

const THEMES = [
  'mateIn1',
  'mateIn2',
  'mateIn3',
  'fork',
  'pin',
  'skewer',
  'discoveredAttack',
  'doubleCheck',
  'backRankMate',
  'smotheredMate',
  'hangingPiece',
  'trappedPiece',
  'sacrifice',
  'deflection',
  'attraction',
  'clearance',
  'interference',
  'xRayAttack',
  'zugzwang',
  'quietMove',
  'endgame',
  'opening',
  'middlegame',
];
const PER_THEME = 14;
const GENERAL_COUNT = 80;
const RATING_BANDS = [
  [0, 1100],
  [1100, 1400],
  [1400, 1700],
  [1700, 2000],
  [2000, 2400],
  [2400, 9999],
];

const THEME_HINTS = {
  mateIn1: 'There is a forced checkmate in one move.',
  mateIn2: 'Find the forcing sequence that mates in two.',
  mateIn3: 'A longer forced mate — calculate every check and capture.',
  fork: 'One piece can attack two targets at once.',
  pin: 'A piece is pinned and cannot safely move.',
  skewer: 'Attack a valuable piece so a weaker one falls behind it.',
  discoveredAttack: 'Moving one piece uncovers an attack from another.',
  doubleCheck: 'A move that checks with two pieces at once is very strong here.',
  backRankMate: 'The back rank is weak — look at the king’s escape squares.',
  smotheredMate: 'The king is boxed in by its own pieces.',
  hangingPiece: 'Something is undefended.',
  trappedPiece: 'A piece has nowhere safe to go.',
  sacrifice: 'Giving up material opens something bigger.',
  deflection: 'Pull a defender away from the square it is guarding.',
  attraction: 'Drag the king or a piece onto a bad square.',
  clearance: 'Clear a square or line for another piece to use.',
  interference: 'Block the line between an enemy piece and what it defends.',
  xRayAttack: 'An attack passes through a piece to hit what is behind it.',
  zugzwang: 'Any move the opponent makes weakens their position.',
  quietMove: 'The winning move is not a check or a capture.',
  endgame: 'Technique matters as much as tactics here.',
  opening: 'A tactic straight out of the opening.',
  middlegame: 'Calculate carefully — the position is still complex.',
};

function hintFor(themes) {
  for (const t of themes) if (THEME_HINTS[t]) return THEME_HINTS[t];
  return 'Look for the most forcing move.';
}

function titleFor(themes) {
  const label = themes.find((t) => THEME_HINTS[t]) || themes[0] || 'Tactic';
  return label
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\b(In|Vs)\b/g, (w) => w.toLowerCase());
}

function decompressTruncated(buffer) {
  return new Promise((resolve) => {
    const chunks = [];
    const decoder = zlib.createZstdDecompress();
    decoder.on('data', (c) => chunks.push(c));
    const finish = () => resolve(Buffer.concat(chunks));
    decoder.on('error', finish); // expected once we run out of our truncated input
    decoder.on('end', finish);
    Readable.from(buffer).pipe(decoder);
  });
}

async function fetchRows() {
  console.log(`Fetching ${(CHUNK_BYTES / 1024 / 1024).toFixed(0)}MB slice of the puzzle dump…`);
  const res = await fetch(DUMP_URL, { headers: { Range: `bytes=0-${CHUNK_BYTES - 1}` } });
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status} fetching puzzle dump`);
  const buf = Buffer.from(await res.arrayBuffer());

  // Lichess's dump is prefixed with a zstd "skippable frame" (magic
  // 0x184D2A50-0x184D2A5F) before the real compressed stream begins.
  const isSkippable = buf.readUInt32LE(0) >= 0x184d2a50 && buf.readUInt32LE(0) <= 0x184d2a5f;
  const skip = isSkippable ? 8 + buf.readUInt32LE(4) : 0;

  const text = (await decompressTruncated(buf.subarray(skip))).toString('utf8');
  const lines = text.split('\n');
  lines.pop(); // last line is very likely truncated mid-row — drop it
  const header = lines.shift();
  console.log(`Decompressed ${lines.length} rows. Header: ${header}`);
  return lines;
}

/** Parse one CSV row into a lightweight candidate (no engine work yet). */
function parseRow(line) {
  const fields = line.split(',');
  if (fields.length < 8) return null;
  const [id, fen, movesStr, ratingStr, , , , themesStr] = fields;
  const rating = Number(ratingStr);
  const ucis = movesStr.split(' ').filter(Boolean);
  if (!id || !fen || !Number.isFinite(rating) || ucis.length < 2) return null;
  return { id, fen, ucis, rating, themes: themesStr ? themesStr.split(' ').filter(Boolean) : [] };
}

/**
 * Replay a candidate through our own engine. The CSV's first move is the
 * "setup" move (played automatically, not part of what the trainee solves);
 * everything after it is the solution line, starting with the trainee.
 */
function verify(candidate) {
  const chess = new Chess(candidate.fen);
  const [setup, ...rest] = candidate.ucis;
  const asMove = (uci) => ({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  });

  if (!chess.move(asMove(setup))) return null;
  const startFen = chess.fen();

  const solution = [];
  for (const uci of rest) {
    const move = asMove(uci);
    if (!chess.move(move)) return null;
    solution.push(move);
  }

  return {
    id: candidate.id,
    fen: startFen,
    rating: candidate.rating,
    themes: candidate.themes,
    name: titleFor(candidate.themes),
    hint: hintFor(candidate.themes),
    solution,
  };
}

/** Spread `rows` across rating bands so a bucket isn't all one difficulty. */
function stratifiedSample(rows, count) {
  const perBand = Math.ceil(count / RATING_BANDS.length);
  const picked = [];
  for (const [lo, hi] of RATING_BANDS) {
    const inBand = rows.filter((r) => r.rating >= lo && r.rating < hi);
    for (let i = inBand.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [inBand[i], inBand[j]] = [inBand[j], inBand[i]];
    }
    picked.push(...inBand.slice(0, perBand));
  }
  return picked;
}

async function main() {
  const rows = (await fetchRows()).map(parseRow).filter(Boolean);
  console.log(`Parsed ${rows.length} usable rows.`);

  const used = new Set();
  const puzzles = [];

  const acceptFrom = (candidates, limit) => {
    let accepted = 0;
    for (const candidate of candidates) {
      if (accepted >= limit) break;
      if (used.has(candidate.id)) continue;
      const record = verify(candidate);
      if (!record) continue;
      used.add(candidate.id);
      puzzles.push(record);
      accepted += 1;
    }
    return accepted;
  };

  for (const theme of THEMES) {
    const matching = rows.filter((r) => r.themes.includes(theme));
    const sample = stratifiedSample(matching, PER_THEME * 3); // oversample; verify() rejects some
    const kept = acceptFrom(sample, PER_THEME);
    console.log(`${theme}: ${kept}/${PER_THEME} (from ${matching.length} candidates)`);
  }

  const general = stratifiedSample(rows, GENERAL_COUNT * 2);
  const keptGeneral = acceptFrom(general, GENERAL_COUNT);
  console.log(`general mix: ${keptGeneral}/${GENERAL_COUNT}`);

  puzzles.sort((a, b) => a.rating - b.rating);
  await writeFile(OUT_FILE, JSON.stringify(puzzles, null, 2) + '\n');
  console.log(`\nWrote ${puzzles.length} puzzles to ${OUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
