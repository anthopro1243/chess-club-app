# Recalibration report — September 2026

Run against the club's real data after backfilling the analysis queue:
**48 analysed sides for CC-002** (every game he played, both colours where he
appears). Accuracy across those 48 sides: **median 80.8, range 43.4–96.4**.

## Observed percentiles

| Metric | n | p10 | p25 | **p50** | p75 | p90 |
|---|---:|---:|---:|---:|---:|---:|
| `openingWinLoss` | 48 | 1.68 | 2.30 | **3.38** | 4.88 | 6.46 |
| `quietWinLoss` | 23 | 0.32 | 1.50 | **3.57** | 6.39 | 8.54 |
| `endgameWinLoss` | 18 | 0.18 | 1.47 | **2.93** | 4.40 | 5.63 |
| `tacticErrorRate` | 46 | 0.00 | 0.00 | **0.14** | 0.28 | 0.50 |
| `oversightRate` | 48 | 1.43 | 5.00 | **7.69** | 13.64 | 16.67 |
| `timeTroubleRate` | 48 | 0.00 | 0.00 | **0.26** | 0.51 | 0.62 |
| `resilienceDelta` | 33 | −8.68 | −5.66 | **−3.90** | −0.41 | 2.45 |

## What the current anchors give this player

Reading the medians against the shipped anchors:

- `openingWinLoss` 3.38 → about **80**. The anchors were built expecting a
  club median nearer 8; this player is well inside them.
- `oversightRate` 7.69 → about **30**. This is the one that bites: the anchors
  treat 8 oversights per 100 moves as poor, and it is his median.
- `timeTroubleRate` 0.26 → about **57**.
- `resilienceDelta` −3.90 → about **100** (he plays *better* when behind, which
  the curve tops out at).

## Proposed anchors, if you want the club median at 50

These shift each curve so this data sits centred rather than clustered high:

```js
LOSS_ANCHORS          = [[0,100],[1,88],[2,72],[3.4,50],[5,36],[7,24],[11,12],[18,0]]
TACTIC_ERROR_ANCHORS  = [[0,100],[0.05,82],[0.14,50],[0.25,34],[0.4,20],[0.6,8],[1,0]]
OVERSIGHT_ANCHORS     = [[0,100],[1.4,82],[4,64],[7.7,50],[12,32],[16,16],[24,0]]
TIME_TROUBLE_ANCHORS  = [[0,100],[0.05,84],[0.26,50],[0.45,32],[0.62,18],[0.85,0]]
RESILIENCE_ANCHORS    = [[-9,100],[-6,78],[-3.9,50],[-1,34],[2.5,18],[8,0]]
```

## I have NOT applied these, and here is why

The spec says to recalibrate so the **club** median lands at 50. This data is
one player. Centring the scale on him would mean he scores ~50 on everything
by construction, permanently — his improvement would move the scale rather
than his score — and every other member would be measured against one
teenager's habits rather than the club's.

The percentiles above are real and worth keeping. The anchors should be refit
when there are **several** players with analysed games, not before. Applying
them now would make the numbers look calibrated while being less meaningful
than the reasoned defaults they replaced.

When you do apply them, bump `schema_version` on `game_analyses` in the same
change so rows scored under the old anchors stay comparable only to each other.
