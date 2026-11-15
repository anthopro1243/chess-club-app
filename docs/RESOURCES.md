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
| under 1000 | [Want to be 1000 in chess?](https://www.youtube.com/watch?v=mjZKRoNuAvY) | GothamChess |
| 1000–1400 | [CHESS STEPS #3 (1000-1400)](https://www.youtube.com/watch?v=ghJRGPXsjfk) | GothamChess |
| 1400+ | [Intermediate Chess Masterclass: 1300 to 2000 Elo](https://www.youtube.com/watch?v=F1gM7N-WXdU) | GothamChess |

## By coaching category

| Category | Band | Video | Channel |
|---|---|---|---|
| Opening knowledge | under 1000 | [Basic Chess Openings Explained](https://www.youtube.com/watch?v=8IlJ3v8I4Z8) | GothamChess |
| Opening knowledge | any | [How To Learn & Study Chess Openings](https://www.youtube.com/watch?v=6IegDENuxU4) | GothamChess |
| Tactical vision | any | [How To Calculate In Chess](https://www.youtube.com/watch?v=9Ga9dP3bvN8) | GothamChess |
| Positional understanding | 1400+ | [How To Evaluate ANY Chess Position](https://www.youtube.com/watch?v=3su1RGtmfcw) | GothamChess |
| Positional understanding | any | [Chess Tips: How To Make a Plan](https://www.youtube.com/watch?v=u8MKyE9Qt8I) | GothamChess |
| Endgame technique | under 1000 | [EASY CHESS ENDGAMES: King & Pawns](https://www.youtube.com/watch?v=mCsc24k-Q8M) | GothamChess |
| Endgame technique | 1000–1400 | [EASY CHESS ENDGAMES: Rook & Pawn](https://www.youtube.com/watch?v=JMZJ9P2Hnq0) | GothamChess |
| Endgame technique | 1400+ | [Play Chess Endgames Like Magnus Carlsen](https://www.youtube.com/watch?v=IvxhIozo_zo) | GothamChess |
| Time management | any | [Time Management In Chess](https://www.youtube.com/watch?v=d_K8Xe3obMM) | GothamChess |
| Board vision | any | [The SECRET To Stop Blundering Your Pieces In Chess](https://www.youtube.com/watch?v=7vt5Lt5VUH4) | Anna Cramling |
| Psychological resilience | any | [How To Improve Your Chess Psychology](https://www.youtube.com/watch?v=mIZSNGPdxo8) | GothamChess |
| Notation | any | [Learn Chess Notation - The Language of Chess! How to Read & Write Chess Moves! Basics for Beginners](https://www.youtube.com/watch?v=b6PR885Rgb8) | Chess Talk |

## By tactic

| Tactic | Video | Channel |
|---|---|---|
| Fork | [The Chess Tactics Guide For Beginners!  Learn the 3 most common chess tactics: forks, pins, skewers!](https://www.youtube.com/watch?v=MbMslp2WcI0) | Chess Vibes |
| Pin | [The Chess Tactics Guide For Beginners!  Learn the 3 most common chess tactics: forks, pins, skewers!](https://www.youtube.com/watch?v=MbMslp2WcI0) | Chess Vibes |
| Skewer | [Why The Skewer Chess Tactic Is More Important Than You Thought](https://www.youtube.com/watch?v=Vre4tVytoxA) | Chess Vibes |
| Discovered attack | [Discovered Attack Chess Tactic - Concepts, Principles and Examples](https://www.youtube.com/watch?v=XTNplr3nwck) | Chess Vibes |
| Back-rank mate | [6 Checkmate Patterns YOU MUST KNOW](https://www.youtube.com/watch?v=iBZLU1FXhcI) | GothamChess |
| Hanging piece | [The SECRET To Stop Blundering Your Pieces In Chess](https://www.youtube.com/watch?v=7vt5Lt5VUH4) | Anna Cramling |

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

## What the app shows, and how the list was chosen (2026-11-15)

The app shows a short name for each video (the `short` field in `resources.js`)
with the channel and running time; the full title above stays here and in the data.

The owner asked for the videos people actually watch, so GothamChess is the main
source and similar creators fill the gaps. Dry lecture-style videos were replaced.

- **GothamChess (14 slots):** the three general band videos, opening knowledge (both),
  tactical vision, positional understanding (both), endgames (all three bands), time
  management, psychology and back-rank mate (his "6 Checkmate Patterns").
- **Other creators (7 slots):** Anna Cramling for board vision and hanging pieces (a method for not
  blundering pieces); Chess Vibes (Nelson Lopez) for fork, pin (one beginner lesson on forks,
  pins and skewers), skewer and discovered attack; Chess Talk for notation, because GothamChess
  has no notation lesson.
- **Empty:** none. GothamChess has no dedicated fork, pin, skewer or discovered-attack lesson, which is
  why Chess Vibes covers them.
- **Removed:** every Chessfactor video, ChessKid's fork, pin and skewer, ChessNetwork's Lucena video,
  BlitzStream's rook endgame tips and John Bartholomew's and Daniel Naroditsky's playlists.
- **Not checked by watching:** each video was checked from its title, description and chapter list,
  length, channel and view counts, not watched end to end. GothamChess videos are long (up to an hour for the
  Chess Steps), and the tone is casual; a coach should skim any they plan to put on a projector.
