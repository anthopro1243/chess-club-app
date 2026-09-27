/*
 * parentSheet.js — the one page parents get before a tournament (research
 * F112) and the packing and conduct list that goes with it (F119).
 *
 * Pure: the Prep page's "Parents" tab feeds it the event and the handful of
 * details only the coach knows (check-in time, meeting point, pick-up), and
 * gets back the sheet as sections for the screen and the printer, plus a
 * plain-text version to paste into an email or a Remind message.
 *
 * Nothing on the sheet names a student. It goes to every family and is often
 * forwarded, and Dallas ISD guidance is not to publish a student's name
 * without a media release (see privacy.js).
 *
 * A detail the coach has not filled in prints as "To be confirmed" rather
 * than a guess, and `missing` lists them so the coach sees what is left
 * before sending.
 */

import { formatDate, resolveDeadlines, isIsoDate } from './officialEvents.js';

export const TBC = 'To be confirmed';

/** The details the coach fills in. `essential` ones are listed as missing when blank. */
export const SHEET_FIELDS = [
  { key: 'checkIn', label: 'Check-in time and place', essential: true, max: 160, placeholder: 'e.g. 7:30 am, main entrance' },
  { key: 'firstRound', label: 'First round starts', essential: true, max: 80, placeholder: 'e.g. 8:30 am' },
  { key: 'schedule', label: 'Rounds and expected finish', essential: false, max: 300, placeholder: 'e.g. 5 rounds, G/30 d5; done by about 3:30 pm' },
  { key: 'meetingPoint', label: 'Where the team meets', essential: true, max: 160, placeholder: 'e.g. the school bus loop at 6:45 am' },
  { key: 'pickUp', label: 'Pick-up time and place', essential: true, max: 160, placeholder: 'e.g. 4:00 pm back at school' },
  { key: 'coachContact', label: 'How to reach the coach on the day', essential: true, max: 160, placeholder: 'e.g. text the club Remind group' },
  { key: 'extra', label: 'Anything else', essential: false, max: 600, placeholder: '' },
];

const DEFAULT_MEALS = 'Breakfast and lunch are provided by the district. A water bottle and a snack are still a good idea.';
const SPECTATORS = 'Families are welcome at the venue but not in the playing hall. Please wait in the area the organisers set aside.';
const RESULTS =
  'The coach posts results in the club app after the event. Names and photos are shared publicly only for students with a media release on file.';

/**
 * What to bring, and why. The "why" is for the player: a phone that buzzes
 * can lose a game on the spot under tournament rules.
 */
export const PACKING_LIST = [
  { item: 'Two pens', why: 'You write down every move; pencils smudge and pens run out.' },
  { item: 'A water bottle', why: 'Rounds are long and the hall is warm.' },
  { item: 'A snack', why: 'Something quick between rounds keeps your focus up.' },
  { item: 'A warm layer', why: 'Big halls can be cold in the morning.' },
  { item: 'Phone switched OFF, in your bag', why: 'A phone that rings or is seen during a game can cost you the game.' },
  { item: 'Your signed transport form, if you ride the bus', why: 'No form, no seat on the bus.' },
];

export const CONDUCT_LIST = [
  'Arrive early; late players lose time on their clock.',
  'Shake hands before and after the game.',
  'Touch a piece, move that piece. Say "I adjust" before straightening one.',
  'Write down every move, yours and your opponent’s.',
  'Stay quiet in the hall, and never talk about a game that is still going.',
  'Something wrong? Stop the clock and raise your hand for the tournament director.',
  'After the game, both players report the result together.',
];

function clean(fields = {}) {
  const out = {};
  for (const f of SHEET_FIELDS) {
    const v = typeof fields[f.key] === 'string' ? fields[f.key].trim() : '';
    out[f.key] = v.slice(0, f.max);
  }
  return out;
}

/**
 * Build the sheet.
 *
 * @param {object} event   an official event ({ name, date, venue, ... })
 * @param {object} fields  the coach's details, keyed by SHEET_FIELDS keys
 * @returns {{ title, subtitle, sections: {heading, lines}[], missing: string[] } | null}
 *          null when there is no event with a real date.
 */
export function buildParentSheet(event, fields = {}) {
  if (!event || !isIsoDate(event.date)) return null;
  const f = clean(fields);
  const or = (value) => value || TBC;

  const deadlines = resolveDeadlines(event).map(
    (d) => `${d.label}: ${formatDate(d.date, { withYear: false })}${d.key === 'transport' ? ' (only for students riding district transport)' : ''}`,
  );

  const sections = [
    {
      heading: 'When and where',
      lines: [
        `Date: ${formatDate(event.date, { withYear: true })}`,
        `Venue: ${or(event.venue)}`,
        `Check-in: ${or(f.checkIn)}`,
        `First round: ${or(f.firstRound)}`,
        ...(f.schedule ? [`Schedule: ${f.schedule}`] : []),
      ],
    },
    {
      heading: 'Getting there and back',
      lines: [`Team meets: ${or(f.meetingPoint)}`, `Pick-up: ${or(f.pickUp)}`, ...deadlines],
    },
    { heading: 'Food', lines: [DEFAULT_MEALS] },
    { heading: 'During the games', lines: [SPECTATORS] },
    { heading: 'What to bring', lines: PACKING_LIST.map((p) => p.item) },
    { heading: 'Results', lines: [RESULTS] },
    { heading: 'On the day', lines: [`Reach the coach: ${or(f.coachContact)}`, ...(f.extra ? [f.extra] : [])] },
  ];

  return {
    title: event.name || 'Tournament',
    subtitle: 'Information for families',
    sections,
    missing: SHEET_FIELDS.filter((s) => s.essential && !f[s.key]).map((s) => s.label),
  };
}

/** The sheet as plain text, for an email or a Remind message. */
export function sheetAsText(sheet) {
  if (!sheet) return '';
  const parts = [`${sheet.title}: ${sheet.subtitle}`];
  for (const s of sheet.sections) {
    parts.push('', s.heading.toUpperCase(), ...s.lines.map((l) => `- ${l}`));
  }
  return parts.join('\n');
}
