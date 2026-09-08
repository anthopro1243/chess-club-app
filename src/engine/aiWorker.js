/*
 * aiWorker.js — runs ai.js off the main thread so a "Hard" search never
 * freezes the board or the rest of the UI while it thinks.
 */

import { chooseMove } from './ai.js';

self.onmessage = (event) => {
  const { requestId, fen, difficulty } = event.data;
  const move = chooseMove(fen, { difficulty });
  self.postMessage({ requestId, move });
};
