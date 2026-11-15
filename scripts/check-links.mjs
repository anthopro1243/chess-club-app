/*
 * check-links.mjs — confirms every outside link in src/data/resources.js
 * still works. Run it with:  node scripts/check-links.mjs
 *
 * YouTube links are checked through oEmbed (the title and channel must match
 * what is stored). Lichess and Chess.com pages must load, and a Lichess theme
 * must stay on its own address (a made-up theme is sent to the general page).
 * It needs internet access, so it is not part of `npm test`.
 */
import { allLinks } from '../src/data/resources.js';

const { videos, lichess, other } = allLinks();
let bad = 0;
const report = (ok, text) => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok     ' : 'PROBLEM'}  ${text}`);
};

for (const v of videos) {
  const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(v.url)}&format=json`);
  if (!res.ok) { report(false, `${v.url} (HTTP ${res.status})`); continue; }
  const data = await res.json();
  report(data.title === v.title && data.author_name === v.channel, `${v.url}  ${data.title} · ${data.author_name}`);
}
for (const l of [...lichess, ...other]) {
  const res = await fetch(l.url, { redirect: 'follow' });
  const same = new URL(res.url).pathname.replace(/\/$/, '') === new URL(l.url).pathname.replace(/\/$/, '');
  report(res.ok && same, `${l.url} (HTTP ${res.status}${same ? '' : `, sent to ${res.url}`})`);
}
console.log(bad ? `\n${bad} problem(s).` : '\nAll links fine.');
process.exitCode = bad ? 1 : 0;
