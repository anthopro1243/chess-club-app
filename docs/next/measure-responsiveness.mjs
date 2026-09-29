import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

// Measures, per action: time from click until the next paint, and any long
// main-thread tasks (>50 ms) the click caused. Uses a production build via
// `vite preview` if PREVIEW=1, else the dev server.
const BASE = process.env.BASE || 'http://localhost:5174/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
// Throttle the CPU like a school Chromebook / mid phone.
const cdp = await p.context().newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

for (let i = 0; i < 30; i++) {
  try { await p.goto(BASE); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
}
await p.evaluate(() => {
  const d = (n) => new Date(Date.now() - n * 864e5).toISOString();
  const P = (id, name, uscf) => ({ playerId: id, name, grade: '11', commitment: 'Competitive', joined: '2026-08-20', preferredOpenings: [], attendance: [], connections: {}, ratings: { uscf }, rubric: {} });
  const players = Array.from({ length: 30 }, (_, i) => P(`CC-${String(i + 10).padStart(3, '0')}`, `Player ${i + 1}`, 600 + i * 33));
  localStorage.setItem('cc-roster-v1', JSON.stringify(players));
  const pgn = '[White "A"]\n[Black "B"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0';
  const games = Array.from({ length: 200 }, (_, i) => ({ id: `g${i}`, whitePlayerId: players[i % 30].playerId, blackPlayerId: players[(i + 1) % 30].playerId, whiteName: players[i % 30].name, blackName: players[(i + 1) % 30].name, result: '1-0', moveCount: 10, playedAt: d(i % 50), pgn, mode: 'human' }));
  localStorage.setItem('cc-games-v1', JSON.stringify(games));
  localStorage.setItem('cc-trainee', 'CC-015');
});
await p.reload();
await p.waitForTimeout(1500);

await p.evaluate(() => {
  window.__long = [];
  new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__long.push(e.duration); }).observe({ type: 'longtask', buffered: false });
});

async function measure(label, act) {
  await p.evaluate(() => { window.__long = []; });
  const t0 = Date.now();
  await act();
  // time to next two animation frames = when the user sees the result
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const paint = Date.now() - t0;
  await p.waitForTimeout(400);
  const long = await p.evaluate(() => window.__long.slice());
  const worst = long.length ? Math.round(Math.max(...long)) : 0;
  console.log(`${label.padEnd(38)} visible after ${String(paint).padStart(5)} ms   longest freeze ${String(worst).padStart(5)} ms${worst > 200 ? '  <-- SLOW' : ''}`);
}

const tab = (name) => () => p.click(`.nav >> text=${name}`);
for (const t of ['Play', 'Training', 'Games', 'My games', 'Roster', 'Coach', 'Club']) await measure(`tab: ${t}`, tab(t));

await p.click('.nav >> text=Games'); await p.waitForTimeout(500);
await measure('Games: open a game', () => p.click('tbody tr >> nth=0'));
await measure('Games: Enter a scoresheet', () => p.click('text=Enter a scoresheet'));
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

await p.click('.nav >> text=Training'); await p.waitForTimeout(500);
await measure('Training: change theme', () => p.selectOption('select:has(option[value="fork"])', 'fork'));
await measure('Training: Endgames', () => p.selectOption('select:has(option[value="endgames"])', 'endgames'));

await p.click('.nav >> text=Roster'); await p.waitForTimeout(500);
await measure('Roster: pick a player', () => p.click('tbody tr >> nth=3'));
await measure('Roster: Report card', () => p.click('text=Report card'));

await p.click('.nav >> text=Play'); await p.waitForTimeout(800);
await measure('Play: click a square', () => p.click('[data-square="e2"], .square >> nth=52'));

await b.close();
