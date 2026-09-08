/*
 * exportWorkbook.js — export everything the club has recorded as a real
 * .xlsx workbook, with a tab per kind of record, mirroring the structure of
 * the original chess_club_player_database workbook so the two stay legible
 * side by side.
 *
 * The app is the system of record now; this is the snapshot you hand to
 * someone, print, or keep for the season. Written client-side — no server
 * round trip, nothing leaves the browser except the file you save.
 *
 * Note on the dependency: SheetJS is used here to *write* only. The known
 * advisories against it concern parsing untrusted spreadsheets, which this
 * app never does.
 */

import { RUBRIC_CATEGORIES } from './roster.js';
import { GAME_MODE_LABEL } from './gamesStore.js';

const date = (iso) => (iso ? String(iso).slice(0, 10) : '');
const round = (n) => (typeof n === 'number' ? Math.round(n) : '');

function playerMasterSheet(players) {
  return players.map((p) => ({
    'Player ID': p.playerId,
    Name: p.name,
    Grade: p.grade,
    Joined: date(p.joined),
    'Board / Role': p.boardRole,
    Track: p.commitment,
    'Club Rating': round(p.clubRating?.rating),
    'Rating Deviation': round(p.clubRating?.rd),
    'Rated Events': p.clubRating?.count ?? 0,
    Provisional: (p.clubRating?.count ?? 0) < 10 ? 'Yes' : 'No',
    'Puzzles Solved': p.puzzleStats?.solvedIds?.length ?? 0,
    'Last Practiced': date(p.puzzleStats?.lastPlayed),
    USCF: p.ratings?.uscf ?? '',
    'Chess.com Username': p.connections?.chesscom?.username ?? '',
    'Chess.com Rapid': p.ratings?.chesscomRapid ?? '',
    'Chess.com Blitz': p.ratings?.chesscomBlitz ?? '',
    'Chess.com Bullet': p.ratings?.chesscomBullet ?? '',
    'Chess.com Puzzles': p.ratings?.chesscomPuzzles ?? '',
    'Lichess Username': p.connections?.lichess?.username ?? '',
    'Lichess Rapid': p.ratings?.lichessRapid ?? '',
    'Lichess Blitz': p.ratings?.lichessBlitz ?? '',
    'Lichess Bullet': p.ratings?.lichessBullet ?? '',
    'Lichess Puzzles': p.ratings?.lichessPuzzles ?? '',
    Style: p.style,
    'Preferred Openings': (p.preferredOpenings || []).join(', '),
    Goal: p.goal,
    'Training Focus': p.trainingFocus,
    'Coach Notes': p.coachNotes,
    'Has Account': p.userId ? 'Yes' : 'No',
  }));
}

function skillAssessmentSheet(players) {
  const rows = [];
  for (const p of players) {
    // Every logged assessment, plus the current rubric as the latest row if
    // it was never explicitly logged (older records, or coach edits).
    const logged = p.assessments || [];
    for (const a of logged) {
      const row = { 'Player ID': p.playerId, Name: p.name, Date: date(a.at) };
      for (const c of RUBRIC_CATEGORIES) row[c.label] = a.rubric?.[c.key] ?? '';
      row.Notes = a.notes || '';
      rows.push(row);
    }
    if (!logged.length && p.rubric && Object.keys(p.rubric).length) {
      const row = { 'Player ID': p.playerId, Name: p.name, Date: date(p.joined) };
      for (const c of RUBRIC_CATEGORIES) row[c.label] = p.rubric?.[c.key] ?? '';
      row.Notes = '(current rubric — not logged as a dated assessment)';
      rows.push(row);
    }
  }
  return rows;
}

function ratingsLogSheet(players) {
  const rows = [];
  for (const p of players) {
    for (const h of p.ratingHistory || []) {
      rows.push({
        'Player ID': p.playerId,
        Name: p.name,
        Date: date(h.at),
        Time: h.at ? String(h.at).slice(11, 16) : '',
        Source: h.source || '',
        Detail: h.detail || '',
        Score: h.score === 1 ? 'Win' : h.score === 0 ? 'Loss' : h.score === 0.5 ? 'Draw' : '',
        'Opponent Rating': round(h.opponentRating),
        'Rating After': round(h.rating),
        Change: typeof h.change === 'number' ? Math.round(h.change) : '',
      });
    }
  }
  return rows.sort((a, b) => `${a.Date}${a.Time}`.localeCompare(`${b.Date}${b.Time}`));
}

function gamesSheet(games) {
  return games.map((g) => ({
    Date: date(g.playedAt),
    White: g.whiteName,
    Black: g.blackName,
    Result: g.result,
    'Ended By': g.reason,
    Moves: g.moveCount,
    Type: GAME_MODE_LABEL[g.mode] || g.mode,
    'Computer Elo': g.computerElo ?? '',
    PGN: g.pgn,
  }));
}

function attendanceSheet(players) {
  const dates = [...new Set(players.flatMap((p) => (p.attendance || []).map((a) => a.date)))].sort();
  return players.map((p) => {
    const row = { 'Player ID': p.playerId, Name: p.name };
    let present = 0;
    for (const d of dates) {
      const mark = (p.attendance || []).find((a) => a.date === d);
      row[d] = mark ? (mark.present ? 'P' : 'A') : '';
      if (mark?.present) present += 1;
    }
    row['Sessions Attended'] = present;
    row['Sessions Held'] = dates.length;
    return row;
  });
}

function clubSummarySheet(players, games) {
  const rated = players.filter((p) => (p.clubRating?.count ?? 0) > 0);
  const avg = (list, pick) =>
    list.length ? Math.round(list.reduce((s, x) => s + pick(x), 0) / list.length) : '';
  const rubricAverages = RUBRIC_CATEGORIES.map((c) => ({
    Metric: `Avg rubric — ${c.label}`,
    Value: players.length
      ? (players.reduce((s, p) => s + (p.rubric?.[c.key] || 0), 0) / players.length).toFixed(1)
      : '',
  }));

  return [
    { Metric: 'Exported', Value: new Date().toLocaleString() },
    { Metric: 'Players on roster', Value: players.length },
    { Metric: 'Players with an account', Value: players.filter((p) => p.userId).length },
    { Metric: 'Players with a rated result', Value: rated.length },
    { Metric: 'Average club rating (rated players)', Value: avg(rated, (p) => p.clubRating.rating) },
    { Metric: 'Competitive track', Value: players.filter((p) => p.commitment === 'Competitive').length },
    { Metric: 'Total puzzles solved', Value: players.reduce((s, p) => s + (p.puzzleStats?.solvedIds?.length || 0), 0) },
    { Metric: 'Games archived', Value: games.length },
    { Metric: 'Club games (person vs person)', Value: games.filter((g) => g.mode === 'human').length },
    { Metric: 'Games vs computer', Value: games.filter((g) => g.mode === 'computer').length },
    { Metric: 'Imported from Chess.com', Value: games.filter((g) => g.mode === 'chesscom').length },
    { Metric: 'Imported from Lichess', Value: games.filter((g) => g.mode === 'lichess').length },
    ...rubricAverages,
  ];
}

function addSheet(XLSX, book, name, rows, fallbackHeaders) {
  const sheet = rows.length
    ? XLSX.utils.json_to_sheet(rows)
    : XLSX.utils.aoa_to_sheet([fallbackHeaders || ['No records yet']]);
  // Rough auto-width so the file is readable without manual resizing.
  const headers = rows.length ? Object.keys(rows[0]) : fallbackHeaders || ['No records yet'];
  sheet['!cols'] = headers.map((h) => {
    const longest = rows.reduce((max, r) => Math.max(max, String(r[h] ?? '').length), h.length);
    return { wch: Math.min(Math.max(longest + 2, 10), 60) };
  });
  XLSX.utils.book_append_sheet(book, sheet, name);
}

/**
 * Build and download the workbook. Returns the filename written.
 *
 * The spreadsheet library is imported on demand — it's over half a
 * megabyte, and only the coach ever exports, so nobody else should pay to
 * download it.
 */
export async function exportWorkbook(players, games) {
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();

  addSheet(XLSX, book, 'Club Summary', clubSummarySheet(players, games), ['Metric', 'Value']);
  addSheet(XLSX, book, 'Player Master', playerMasterSheet(players), ['Player ID', 'Name']);
  addSheet(XLSX, book, 'Skill Assessments', skillAssessmentSheet(players), ['Player ID', 'Name', 'Date']);
  addSheet(XLSX, book, 'Ratings Log', ratingsLogSheet(players), ['Player ID', 'Name', 'Date']);
  addSheet(XLSX, book, 'Games', gamesSheet(games), ['Date', 'White', 'Black', 'Result']);
  addSheet(XLSX, book, 'Attendance', attendanceSheet(players), ['Player ID', 'Name']);

  const filename = `chess-club-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(book, filename);
  return filename;
}
