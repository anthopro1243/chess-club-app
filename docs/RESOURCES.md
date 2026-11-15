# Outside links the app sends people to

The app diagnoses and then links out. Every address it hands out is in
`src/data/resources.js`. Each one below was fetched on **2026-11-15** (re-run any time with `node scripts/check-links.mjs`, which checks every link in `resources.js` and needs internet):
YouTube links through `https://www.youtube.com/oembed?url=<link>&format=json`
(the title and channel are exactly what that returned), Lichess and Chess.com
links by opening them and checking they load their own page.

To swap a video, follow the comment at the top of `src/data/resources.js`,
then update this list.

## How a video is chosen

For a player's weakness and rating (under 1000, 1000–1400, 1400+): the video for that weakness
and band, else the video for that weakness at any rating, else the general video for their band.

## General (any weakness, by rating band)

| Band | Video | Channel |
|---|---|---|
| under 1000 | [Chess Fundamentals](https://www.youtube.com/playlist?list=PLl9uuRYQ-6MBwqkmwT42l1fI7Z0bYuwwO) | John Bartholomew |
| 1000–1400 | [Climbing the Rating Ladder](https://www.youtube.com/playlist?list=PLl9uuRYQ-6MCBnhtCk_bTZsD8GxeWP6BV) | John Bartholomew |
| 1400+ | [SpeedRun](https://www.youtube.com/playlist?list=PLT1F2nOxLHOcmi_qi1BbY6axf5xLFEcit) | Daniel Naroditsky |

## By coaching category

| Category | Band | Video | Channel |
|---|---|---|---|
| Opening knowledge | under 1000 | [Must-Know Opening Principles - Central Control](https://www.youtube.com/watch?v=gpsZAim-mYc) | Chessfactor |
| Opening knowledge | any other | [The Golden Opening and Endgame Rules](https://www.youtube.com/watch?v=9ptbztQBxRA) | Chessfactor |
| Tactical vision | any | [Most common Chess Tactics every Player needs to know](https://www.youtube.com/watch?v=IKDkxv6PWf8) | Chessfactor |
| Positional understanding | 1400+ | [Understanding Pawn Levers - Strategic Planning](https://www.youtube.com/watch?v=oEO6LhFx0p8) | Chessfactor |
| Positional understanding | any other | [Everything you need to know about Piece Mobilization](https://www.youtube.com/watch?v=XPpwG8gGqco) | Chessfactor |
| Endgame technique | under 1000 | [Important Endgame Principles and Techniques for Beginners](https://www.youtube.com/watch?v=PzmTEz2hlak) | Chessfactor |
| Endgame technique | 1000–1400 | [Learn the Lucena Position (The Shield) - Beginner to Chess Master #19](https://www.youtube.com/watch?v=V1QXsV9SKlk) | ChessNetwork |
| Endgame technique | 1400+ | [My 10 tips to quickly improve your rook endgames](https://www.youtube.com/watch?v=813QD5vW5-4) | BlitzStream |
| Board vision | any | [Useful Tips to avoid Blunders](https://www.youtube.com/watch?v=AYy2A6HIcU0) | Chessfactor |
| Time management | any | [How To Manage Time In Your Chess Games (197)](https://www.youtube.com/watch?v=grF4uU7gRbY) | NM Robert Ramirez |
| Psychological resilience | any | [How I Deal with Losing in Chess](https://www.youtube.com/watch?v=JgQFSgzAyIE) | GM Noel Studer |
| Notation | any | [How to Write Chess Moves - Notate a Game](https://www.youtube.com/watch?v=itftX-QZ5Ms) | Chess House |

## By tactic

| Tactic | Video | Channel |
|---|---|---|
| Fork | [The Fork \| Chess Tactics \| ChessKid](https://www.youtube.com/watch?v=mgAbXPBeVEI) | ChessKid |
| Pin | [The Pin \| Chess Tactics \| ChessKid](https://www.youtube.com/watch?v=sjpKC9SMvKs) | ChessKid |
| Skewer | [The Skewer \| Chess Tactics \| ChessKid](https://www.youtube.com/watch?v=2KlDixnZMhM) | ChessKid |
| Discovered attack | [Creating multiple Threats with the Discovered Attack](https://www.youtube.com/watch?v=nMADfn1scbI) | Chessfactor |
| Back-rank mate | [Incredible Back Rank Combinations](https://www.youtube.com/watch?v=spMQR31h0-0) | Chessfactor |
| Hanging piece | [How to visualize and exploit Poorly Protected Pieces](https://www.youtube.com/watch?v=hKZTX8ccOyc) | Chessfactor |

## Lichess themed puzzles (`https://lichess.org/training/<theme>`)

Each loads its own page (checked 2026-11-15; an unknown theme name is redirected to the general
page, so staying on the same address means the theme exists):
fork, pin, skewer, discoveredAttack, doubleCheck, deflection, attraction, hangingPiece,
trappedPiece, capturingDefender, quietMove, sacrifice, mateIn1, mateIn2, mateIn3, backRankMate,
smotheredMate, opening, middlegame, endgame, pawnEndgame, rookEndgame.

- [Mixed puzzles on Lichess](https://lichess.org/training), used when no tactic applies.
- [Puzzles on Chess.com](https://www.chess.com/puzzles), the one general Chess.com link (themed
  Chess.com puzzles are limited on free accounts, so there are none).

## Not found yet

No good school-suitable video was found, so these slots are empty and fall back to the general
video: **time management**, **psychological resilience** (handling losses and tilt) and
**notation** (keeping a scoresheet). Also no video yet for tactics other than the six above, or for
positional understanding between 1000 and 1400 specifically (it uses the any-rating video).

## What the app shows, and how the list was checked (2026-11-15)

The app shows a short name for each video (the `short` field in `resources.js`)
with the channel and running time; the full title above stays here and in the data.

- **Empty slots filled:** time management, handling losses and tilt, and notation each
  now have one video. Every slot has a video; nothing is left empty.
- **Chessfactor:** 12 of the 18 original videos were from this one channel. Each was opened:
  all are full 6–25 minute lessons by titled coaches (IMs and GMs), free, and listed in Lichess's
  own curated video library. Their description only points to the channel's free website and a
  donation link, so none is a promo or a paywalled teaser. The 10 that remain are kept where no clearly
  better-known equivalent exists.
- **Replaced:** fork, pin and skewer now use ChessKid's three short lessons by FM Mike Klein
  (5–7 minutes each, 600,000+ views each), made for young players. The pin lesson by
  ChessNetwork (37 minutes) and the Chessfactor fork and skewer lessons were dropped.
- **Not checked by watching:** the videos were checked from their titles, descriptions, length,
  channel and view counts, not watched end to end. A coach should skim the three new
  ones (time management, losses, notation) once before sharing them.
