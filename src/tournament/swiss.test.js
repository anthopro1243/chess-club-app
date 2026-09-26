import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pairSwissRound,
  auditPairings,
  colourDue,
  allocateColours,
  colourBalance,
  playerStates,
  isActive,
} from './swiss.js';

// -- helpers ---------------------------------------------------------------

/** P1..Pn, rated 1600 down in steps of 100 (or `step`). */
const field = (n, step = 100) =>
  Array.from({ length: n }, (_, i) => ({ playerId: `P${i + 1}`, name: `P${i + 1}`, rating: 1600 - i * step }));

const num = (id) => Number(String(id).slice(1));
const show = (rows) =>
  rows.map((r) => (r.byeType ? `bye:${r.white}` : `${r.board}:${r.white}-${r.black}`)).join(' ');

/** Deterministic PRNG so every simulated event is the same event on every run. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Result by rating expectation, 10% draws. */
function decide(row, ratingOf, rand) {
  const expected = 1 / (1 + 10 ** ((ratingOf(row.black) - ratingOf(row.white)) / 400));
  const x = rand();
  return x < 0.1 ? '1/2-1/2' : x < 0.1 + 0.9 * expected ? '1-0' : '0-1';
}

/**
 * Play a whole event: pair, invent results, repeat. `extra(round, rows)` may
 * return rows to add before a round is paired (requested byes).
 */
function playEvent({ entrants, rounds, seed = 1, options = {}, extra = () => [] }) {
  const rand = prng(seed);
  const rating = new Map(entrants.map((e) => [e.playerId, e.rating ?? 0]));
  let rows = [];
  const warnings = [];
  const perRound = [];
  for (let round = 1; round <= rounds; round += 1) {
    rows = [...rows, ...extra(round, rows)];
    const res = pairSwissRound({ entrants, rows, round, options });
    if (!res.ok) return { rows, warnings, perRound, stopped: res };
    warnings.push(...res.warnings);
    perRound.push(res);
    rows = [
      ...rows,
      ...res.rows.map((row) => (row.byeType ? row : { ...row, result: decide(row, (id) => rating.get(id), rand) })),
    ];
  }
  return { rows, warnings, perRound, stopped: null };
}

/** Every active, non-requesting entrant appears exactly once per round. */
function assertEveryoneOncePerRound(entrants, rows, rounds) {
  for (let round = 1; round <= rounds; round += 1) {
    const inRound = rows.filter((r) => r.round === round);
    const seen = inRound.flatMap((r) => [r.white, r.black]).filter(Boolean);
    assert.equal(new Set(seen).size, seen.length, `round ${round}: someone is paired twice`);
    const expected = entrants.filter((e) => isActive(e, round)).map((e) => e.playerId).sort();
    assert.deepEqual([...seen].sort(), expected, `round ${round}: the active field is not exactly covered`);
  }
}

// -- colour rules ----------------------------------------------------------

test('colourDue: equalise first, then alternate; three in a row is absolute', () => {
  assert.deepEqual(colourDue([]), { want: null, strength: 0 });
  assert.deepEqual(colourDue(['w']), { want: 'b', strength: 2 });
  assert.deepEqual(colourDue(['w', 'b']), { want: 'w', strength: 1 });
  assert.deepEqual(colourDue(['b', 'w', 'w']), { want: 'b', strength: 3 });
  assert.deepEqual(colourDue(['w', 'w', 'b', 'b']), { want: 'w', strength: 3 });
  assert.deepEqual(colourDue(['w', 'b', 'w', 'w']), { want: 'b', strength: 3 });
});

test('allocateColours: the stronger claim wins, then history, then rank', () => {
  const s = (id, colours, rounds) => ({
    playerId: id,
    colours,
    colourByRound: new Map(colours.map((c, i) => [rounds?.[i] ?? i + 1, c])),
  });
  const rank = (x) => num(x.playerId);
  // P2 needs Black absolutely (WW), P1 only for equalisation.
  let a = allocateColours(s('P1', ['w']), s('P2', ['w', 'w']), rank);
  assert.equal(a.black.playerId, 'P2');
  assert.equal(a.penalty, 2);
  // Same claim; they differed in round 1 (P1 had Black): alternate from there.
  a = allocateColours(s('P1', ['b', 'w', 'w', 'b', 'w']), s('P2', ['w', 'b', 'w', 'b', 'w']), rank);
  assert.equal(a.white.playerId, 'P2');
  // Identical histories: the higher-ranked player gets the colour they are due.
  a = allocateColours(s('P1', ['w']), s('P2', ['w']), rank);
  assert.equal(a.black.playerId, 'P1');
  // Compatible claims cost nothing.
  a = allocateColours(s('P1', ['w']), s('P2', ['b']), rank);
  assert.deepEqual([a.white.playerId, a.black.playerId, a.penalty], ['P2', 'P1', 0]);
  // No history on either side: left to the board number.
  a = allocateColours(s('P1', []), s('P2', []), rank);
  assert.equal(a.white, null);
});

// -- round 1 and the basic shape ---------------------------------------------

test('round 1 of 8: top half against bottom half, colours alternate down the boards', () => {
  const res = pairSwissRound({ entrants: field(8), rows: [], round: 1 });
  assert.equal(res.ok, true);
  assert.equal(show(res.rows), '1:P1-P5 2:P6-P2 3:P3-P7 4:P8-P4');
  assert.equal(res.bye, null);
  assert.deepEqual(res.warnings, []);
});

test('round 1: initialColour black gives the top seed Black on board 1', () => {
  const res = pairSwissRound({ entrants: field(4), rows: [], round: 1, options: { initialColour: 'b' } });
  assert.equal(show(res.rows), '1:P3-P1 2:P2-P4');
});

test('round 1 of 7: the lowest seed gets the full-point bye', () => {
  const res = pairSwissRound({ entrants: field(7), rows: [], round: 1 });
  assert.equal(res.bye, 'P7');
  assert.equal(show(res.rows), '1:P1-P4 2:P5-P2 3:P3-P6 bye:P7');
  assert.deepEqual(res.rows.at(-1), { round: 1, board: null, white: 'P7', black: null, result: null, byeType: 'full' });
});

test('score groups pair inside themselves, and a 200-point transposition fixes colours', () => {
  const entrants = field(8);
  const r1 = pairSwissRound({ entrants, rows: [], round: 1 });
  // Every higher seed wins.
  const rows = r1.rows.map((r) => ({ ...r, result: num(r.white) < num(r.black) ? '1-0' : '0-1' }));
  const r2 = pairSwissRound({ entrants, rows, round: 2 });
  // Natural pairing is 1–3 / 2–4 and 5–7 / 6–8, but 1 and 3 both had White
  // (and 5 and 7 both had Black). Swapping the bottom half's two players,
  // 100 points apart, gives everyone their due colour.
  assert.equal(show(r2.rows), '1:P4-P1 2:P2-P3 3:P5-P8 4:P7-P6');
  for (const id of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']) {
    assert.equal(colourBalance([...rows, ...r2.rows.map((r) => ({ ...r, result: '1/2-1/2' }))], id), 0);
  }
});

test('colour never buys a bigger jump than the rulebook allows', () => {
  // Same as above but 400 points between neighbours: too far to transpose,
  // so the natural top-half/bottom-half pairing stands and colours give way.
  const entrants = field(8, 400);
  const r1 = pairSwissRound({ entrants, rows: [], round: 1 });
  const rows = r1.rows.map((r) => ({ ...r, result: num(r.white) < num(r.black) ? '1-0' : '0-1' }));
  const r2 = pairSwissRound({ entrants, rows, round: 2 });
  const pairs = r2.rows.map((r) => [r.white, r.black].sort((a, b) => num(a) - num(b)).join('-'));
  assert.deepEqual(pairs, ['P1-P3', 'P2-P4', 'P5-P7', 'P6-P8']);
});

test('an odd score group drops a player, who meets the highest-ranked opponent they have not played', () => {
  const entrants = field(6);
  const r1 = pairSwissRound({ entrants, rows: [], round: 1 });
  assert.equal(show(r1.rows), '1:P1-P4 2:P5-P2 3:P3-P6');
  // Upset on board 3: P6 beats P3. Leaders: P1, P2, P6.
  const rows = r1.rows.map((r) => ({ ...r, result: r.board === 3 ? '0-1' : num(r.white) < num(r.black) ? '1-0' : '0-1' }));
  const r2 = pairSwissRound({ entrants, rows, round: 2 });
  // P1–P2 pair in the top group; P6 drops. P3 is a rematch, so P4 is next —
  // but P4 and P6 both need White, and P5 (100 points below P4) needs Black.
  assert.equal(show(r2.rows), '1:P2-P1 2:P6-P5 3:P4-P3');
});

test('round 2 bye goes to the lowest-rated player in the lowest group who has not had one', () => {
  const entrants = field(7);
  const r1 = pairSwissRound({ entrants, rows: [], round: 1 });
  const rows = r1.rows.map((r) => (r.byeType ? r : { ...r, result: '1-0' }));
  const r2 = pairSwissRound({ entrants, rows, round: 2 });
  // Losers of round 1: P4, P2, P6 — P6 is the lowest rated of them. P7 had
  // the round-1 bye and now sits in the 1-point group.
  assert.equal(r2.bye, 'P6');
  assert.equal(show(r2.rows), '1:P7-P1 2:P5-P3 3:P2-P4 bye:P6');
});

test('a forfeit win counts as a point without playing: that player is passed over for the bye', () => {
  const entrants = field(5);
  const g = (round, board, white, black, result) => ({ round, board, white, black, result, byeType: null });
  const b = (round, white) => ({ round, board: null, white, black: null, result: null, byeType: 'full' });
  const rows = [
    g(1, 1, 'P1', 'P2', '1-0'),
    g(1, 2, 'P5', 'P4', '1F-0F'),
    b(1, 'P3'),
    g(2, 1, 'P1', 'P3', '1-0'),
    g(2, 2, 'P5', 'P2', '0-1'),
    b(2, 'P4'),
  ];
  // Lowest group (1 point): P2, P3, P4, P5. From the bottom: P5 won by
  // forfeit, P4 and P3 had byes — so the bye passes up to P2.
  const r3 = pairSwissRound({ entrants, rows, round: 3 });
  assert.equal(r3.ok, true);
  assert.equal(r3.bye, 'P2');
  assert.deepEqual(r3.warnings, []);
  // And the forfeited game still counts as a meeting: no P4–P5 "rematch".
  assert.ok(!r3.rows.some((r) => [r.white, r.black].sort().join() === 'P4,P5'));
});

// -- overrides: requested byes, withdrawals, late entries ---------------------

test('a requested half-point bye leaves the player out and the rest pair around them', () => {
  const entrants = field(8);
  const rows = [{ round: 1, board: null, white: 'P3', black: null, result: null, byeType: 'half' }];
  const res = pairSwissRound({ entrants, rows, round: 1 });
  assert.equal(res.ok, true);
  assert.deepEqual(res.requested, ['P3']);
  assert.ok(!res.rows.some((r) => r.white === 'P3' || r.black === 'P3'));
  // 7 left → the lowest seed takes the full-point bye.
  assert.equal(res.bye, 'P8');
  assert.equal(res.rows.filter((r) => !r.byeType).length, 3);
});

test('a withdrawn player is not paired from their withdrawal round on', () => {
  const entrants = field(6).map((e) => (e.playerId === 'P2' ? { ...e, withdrawnFromRound: 2 } : e));
  const { rows, stopped } = playEvent({ entrants, rounds: 3 });
  assert.equal(stopped, null);
  assert.ok(rows.some((r) => r.round === 1 && (r.white === 'P2' || r.black === 'P2')));
  assert.ok(!rows.some((r) => r.round >= 2 && (r.white === 'P2' || r.black === 'P2')));
  assertEveryoneOncePerRound(entrants, rows, 3);
});

test('a late entry joins at their round on zero points', () => {
  const entrants = [...field(6), { playerId: 'P7', name: 'P7', rating: 1700, lateEntryRound: 2 }];
  const { rows, stopped, perRound } = playEvent({ entrants, rounds: 3 });
  assert.equal(stopped, null);
  assert.ok(!rows.some((r) => r.round === 1 && (r.white === 'P7' || r.black === 'P7')));
  assert.ok(rows.some((r) => r.round === 2 && (r.white === 'P7' || r.black === 'P7')));
  // Round 2 has 7 players, so somebody gets a bye; round 1 had 6 and nobody did.
  assert.equal(perRound[0].bye, null);
  assert.notEqual(perRound[1].bye, null);
  assertEveryoneOncePerRound(entrants, rows, 3);
  const states = playerStates(entrants, rows.filter((r) => r.round === 1), 2);
  assert.equal(states.get('P7').score, 0);
});

// -- whole events: the invariants -------------------------------------------

const SIZES = [
  { n: 4, rounds: 3 },
  { n: 7, rounds: 5 },
  { n: 9, rounds: 5 },
  { n: 15, rounds: 5 },
  { n: 30, rounds: 6 },
];

for (const { n, rounds } of SIZES) {
  test(`${n} players, ${rounds} rounds, 12 simulated events: no rematches, colours within limits, byes shared`, () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const entrants = field(n, Math.round(1000 / n));
      const { rows, warnings, stopped } = playEvent({ entrants, rounds, seed });
      assert.equal(stopped, null, `seed ${seed}: ${stopped?.message}`);
      assertEveryoneOncePerRound(entrants, rows, rounds);
      const issues = auditPairings(rows);
      // A rematch or a double booking is never acceptable. Colour and bye
      // exceptions are allowed only when the engine said why.
      assert.deepEqual(issues.filter((i) => i.type === 'rematch' || i.type === 'double-booked'), []);
      if (!warnings.length) assert.deepEqual(issues, [], `seed ${seed}`);
      for (const e of entrants) assert.ok(Math.abs(colourBalance(rows, e.playerId)) <= 2);
      const byes = rows.filter((r) => r.byeType === 'full');
      assert.equal(byes.length, n % 2 ? rounds : 0);
    }
  });
}

test('colours stay within ±1 for the great majority, and the 200/80 windows are what does it', () => {
  // A regression guard, measured over fixed simulated events: the share of
  // player-rounds sitting at ±2 with the rulebook windows (about 5% today)
  // must stay under 8%, and must beat pairing with no colour adjustment.
  const measure = (options) => {
    let atTwo = 0;
    let total = 0;
    for (const n of [9, 15, 30]) {
      for (let seed = 1; seed <= 10; seed += 1) {
        const entrants = field(n, Math.round(1000 / n));
        const { rows } = playEvent({ entrants, rounds: 5, seed, options });
        for (let round = 1; round <= 5; round += 1) {
          const upTo = rows.filter((r) => r.round <= round);
          for (const e of entrants) {
            total += 1;
            if (Math.abs(colourBalance(upTo, e.playerId)) >= 2) atTwo += 1;
          }
        }
      }
    }
    return atTwo / total;
  };
  const rulebook = measure({});
  const none = measure({ transpositionLimit: 0, interchangeLimit: 0 });
  assert.ok(rulebook < 0.08, `share at ±2 was ${rulebook}`);
  assert.ok(rulebook < none, `windows ${rulebook} vs none ${none}`);
});

test('30 players pair in well under a second per round', () => {
  const entrants = field(30, 33);
  const started = Date.now();
  const { stopped } = playEvent({ entrants, rounds: 7, seed: 5 });
  assert.equal(stopped, null);
  assert.ok(Date.now() - started < 3000);
});

test('the same input always gives the same pairing', () => {
  const a = playEvent({ entrants: field(15), rounds: 4, seed: 9 });
  const b = playEvent({ entrants: field(15), rounds: 4, seed: 9 });
  assert.deepEqual(a.rows, b.rows);
});

test('7 players: nobody gets a second bye while someone else could take it', () => {
  for (let seed = 1; seed <= 12; seed += 1) {
    const { rows, warnings } = playEvent({ entrants: field(7), rounds: 5, seed });
    const counts = new Map();
    for (const r of rows.filter((x) => x.byeType === 'full')) counts.set(r.white, (counts.get(r.white) || 0) + 1);
    if (!warnings.some((w) => w.includes('another full-point bye'))) {
      assert.ok([...counts.values()].every((c) => c === 1), `seed ${seed}`);
    }
  }
});

test('15 players with a half-point bye, a withdrawal and a late entry run 4 clean rounds', () => {
  const entrants = [
    ...field(15).map((e) => (e.playerId === 'P9' ? { ...e, withdrawnFromRound: 3 } : e)),
    { playerId: 'P16', name: 'Late', rating: 1250, lateEntryRound: 2 },
  ];
  const extra = (round) =>
    round === 2 ? [{ round: 2, board: null, white: 'P4', black: null, result: null, byeType: 'half' }] : [];
  const { rows, stopped } = playEvent({ entrants, rounds: 4, seed: 3, extra });
  assert.equal(stopped, null);
  assertEveryoneOncePerRound(entrants, rows, 4);
  assert.deepEqual(auditPairings(rows).filter((i) => i.type === 'rematch'), []);
  assert.ok(rows.some((r) => r.round === 2 && r.byeType === 'half' && r.white === 'P4'));
});

// -- impossible, and refusing bad input -------------------------------------

test('4 players after 3 rounds have all met: round 4 is impossible, never a rematch', () => {
  const { rows, stopped } = playEvent({ entrants: field(4), rounds: 4, seed: 2 });
  assert.ok(stopped);
  assert.equal(stopped.ok, false);
  assert.equal(stopped.error, 'impossible');
  assert.match(stopped.message, /rematch/);
  assert.equal(rows.filter((r) => r.round === 4).length, 0);
});

test('3 players: three rounds with a bye each, then impossible', () => {
  const { rows, stopped, perRound } = playEvent({ entrants: field(3), rounds: 4, seed: 1 });
  assert.equal(stopped.error, 'impossible');
  assert.deepEqual(perRound.map((r) => r.bye).sort(), ['P1', 'P2', 'P3']);
  assert.equal(rows.filter((r) => !r.byeType).length, 3);
});

test('refuses: bad round numbers', () => {
  for (const round of [0, -1, 1.5, '1', undefined]) {
    assert.equal(pairSwissRound({ entrants: field(4), rows: [], round }).error, 'bad-round');
  }
  // Skipping ahead.
  assert.equal(pairSwissRound({ entrants: field(4), rows: [], round: 2 }).error, 'bad-round');
});

test('refuses: a round that is already paired', () => {
  const r1 = pairSwissRound({ entrants: field(4), rows: [], round: 1 });
  const rows = r1.rows.map((r) => ({ ...r, result: '1-0' }));
  assert.equal(pairSwissRound({ entrants: field(4), rows, round: 1 }).error, 'already-paired');
});

test('refuses: pairing on top of unfinished boards', () => {
  const r1 = pairSwissRound({ entrants: field(4), rows: [], round: 1 });
  const rows = [{ ...r1.rows[0], result: '1-0' }, r1.rows[1]];
  const res = pairSwissRound({ entrants: field(4), rows, round: 2 });
  assert.equal(res.error, 'previous-round-unfinished');
  assert.match(res.message, /1 board /);
});

test('refuses: fewer than two players to pair', () => {
  assert.equal(pairSwissRound({ entrants: field(1), rows: [], round: 1 }).error, 'too-few-players');
  assert.equal(pairSwissRound({ entrants: [], rows: [], round: 1 }).error, 'too-few-players');
  const allOut = field(3).map((e) => ({ ...e, withdrawnFromRound: 1 }));
  assert.equal(pairSwissRound({ entrants: allOut, rows: [], round: 1 }).error, 'too-few-players');
});

test('refuses: duplicate entrants, entrants without ids, strangers in the rows', () => {
  assert.equal(pairSwissRound({ entrants: [...field(3), field(1)[0]], rows: [], round: 1 }).error, 'duplicate-entrant');
  assert.equal(pairSwissRound({ entrants: [{ name: 'x' }], rows: [], round: 1 }).error, 'bad-entrant');
  const rows = [{ round: 1, board: 1, white: 'P1', black: 'ZZ', result: '1-0', byeType: null }];
  assert.equal(pairSwissRound({ entrants: field(4), rows, round: 2 }).error, 'unknown-player');
});

test('with everyone having met, a rematch is refused even when colours would be perfect', () => {
  const entrants = field(4);
  const rows = [
    { round: 1, board: 1, white: 'P1', black: 'P2', result: '1-0', byeType: null },
    { round: 1, board: 2, white: 'P3', black: 'P4', result: '1-0', byeType: null },
    { round: 2, board: 1, white: 'P3', black: 'P1', result: '1-0', byeType: null },
    { round: 2, board: 2, white: 'P2', black: 'P4', result: '1-0', byeType: null },
    { round: 3, board: 1, white: 'P1', black: 'P4', result: '1-0', byeType: null },
    { round: 3, board: 2, white: 'P2', black: 'P3', result: '1-0', byeType: null },
  ];
  const res = pairSwissRound({ entrants, rows, round: 4 });
  assert.equal(res.ok, false);
  assert.equal(res.rows, undefined);
});

// -- the audit --------------------------------------------------------------

test('auditPairings flags rematches, double bookings, three in a row, imbalance and second byes', () => {
  const g = (round, board, white, black) => ({ round, board, white, black, result: '1-0', byeType: null });
  const rows = [
    g(1, 1, 'A', 'B'),
    g(2, 1, 'A', 'C'),
    g(3, 1, 'A', 'D'),
    g(3, 2, 'B', 'A'),
    g(4, 1, 'B', 'A'),
    { round: 1, board: null, white: 'E', black: null, result: null, byeType: 'full' },
    { round: 2, board: null, white: 'E', black: null, result: null, byeType: 'full' },
  ];
  const types = auditPairings(rows).map((i) => i.type);
  assert.ok(types.includes('rematch'));
  assert.ok(types.includes('double-booked'));
  assert.ok(types.includes('three-in-a-row'));
  assert.ok(types.includes('second-bye'));
  const imbalance = [g(1, 1, 'X', 'Y'), g(2, 1, 'X', 'Z'), g(3, 1, 'Y', 'W'), g(4, 1, 'X', 'V'), g(5, 1, 'X', 'U')];
  // X has White in every game it plays, so its difference passes +2.
  assert.ok(auditPairings(imbalance).some((i) => i.type === 'colour-imbalance' && i.players[0] === 'X'));
  assert.deepEqual(auditPairings([]), []);
});

test('isActive: withdrawal and late entry boundaries', () => {
  assert.equal(isActive({ withdrawnFromRound: 3 }, 2), true);
  assert.equal(isActive({ withdrawnFromRound: 3 }, 3), false);
  assert.equal(isActive({ lateEntryRound: 2 }, 1), false);
  assert.equal(isActive({ lateEntryRound: 2 }, 2), true);
  assert.equal(isActive(null, 1), false);
});
