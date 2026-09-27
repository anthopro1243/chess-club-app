/*
 * rulesQuiz.js — the tournament rules and etiquette quiz (F041).
 *
 * Pure data and scoring. Every question explains its answer and names the
 * rule behind it, because a first tournament is lost to a phone in a pocket
 * or a touched piece far more often than to an opening.
 *
 * Rule numbers are from the US Chess Official Rules of Chess, 7th edition,
 * and the US Chess National Scholastic Regulations 2025–26 (research source
 * s53). Where something is etiquette rather than a numbered rule, the
 * explanation says so. Local events can differ; the page tells players that
 * the tournament director's announcements on the day win over this quiz.
 *
 * Options are written so the right answer is not always in the same place,
 * and the order is fixed, so a player retaking the quiz cannot pass by
 * remembering "it's always B" but can learn from a stable sheet.
 */

/** 80% or better marks a player "rules ready" (research F041 acceptance). */
export const RULES_PASS_MARK = 0.8;

export const RULES_QUESTIONS = [
  {
    id: 'touch-move',
    prompt: 'It is your move. You pick up your knight, then see that it would be taken. What must you do?',
    options: [
      'Put it back and move something else.',
      'Move that knight, as long as it has a legal move.',
      'Move any piece, as long as you apologise.',
      'Nothing yet: touch-move only counts once you let go.',
    ],
    answer: 1,
    explanation:
      'Touch-move: on your turn, if you deliberately touch one of your own pieces you must move it if it has a legal move. So think first, then touch.',
    rule: 'US Chess Rule 10B (touch-move)',
  },
  {
    id: 'adjust',
    prompt: 'A piece is standing off-centre on its square and you want to straighten it. What do you do?',
    options: [
      'Straighten it quickly while your opponent is not looking.',
      'Wait until after the game.',
      'On your own turn, say "I adjust" first, then straighten it.',
      'Ask your opponent to straighten it for you.',
    ],
    answer: 2,
    explanation:
      'You may adjust a piece only on your own move, and only after saying "I adjust" (or "j\'adoube") before you touch it. Touch it first and touch-move applies.',
    rule: 'US Chess Rule 10 (touch-move: adjusting pieces)',
  },
  {
    id: 'illegal-move',
    prompt: 'Your opponent makes an illegal move and presses the clock. What happens in a US Chess tournament?',
    options: [
      'Your opponent loses the game on the spot.',
      'Nothing: once the clock is pressed, the move stands.',
      'You sort it out between you and carry on.',
      'Pause the clock and get the TD before you make your next move: the move is corrected and you normally get 2 minutes added to your clock.',
    ],
    answer: 3,
    explanation:
      'An illegal move completed by pressing the clock is corrected, and the standard penalty is 2 minutes added to the other player\'s clock. Claim it before you complete your own next move, or the penalty no longer applies.',
    rule: 'US Chess Rule 11D, with the standard penalty in Rule 1C2a (illegal moves)',
  },
  {
    id: 'scorekeeping-time-pressure',
    prompt: 'You are playing G/30 d5 and your clock drops under 5 minutes. Must you keep writing down the moves?',
    options: [
      'No: with a delay under 30 seconds, you may stop keeping score.',
      'Yes, every move to the end of the game.',
      'No: you can stop as soon as you are losing.',
      'Only if your opponent agrees.',
    ],
    answer: 0,
    explanation:
      'Under 5 minutes, in a time control whose delay or increment is less than 30 seconds, you may stop keeping score. With 30 seconds or more per move you must keep score to the end. Above 5 minutes you write every move.',
    rule: 'US Chess Rule 15 (recording the game: time pressure, 15B and 15C)',
  },
  {
    id: 'phones',
    prompt: 'Where should your phone be while you are playing a round?',
    options: [
      'In your pocket, on silent.',
      'Switched off and in your bag (or wherever the TD says, switched off).',
      'On the table, so you can check the time.',
      'Anywhere, as long as you do not look at it.',
    ],
    answer: 1,
    explanation:
      'Scholastic rules require electronic devices to be switched off and bagged (or placed where the TD directs, switched off) and never used during a game. A phone that rings or is used can cost you the game.',
    rule: 'US Chess National Scholastic Regulations 2025–26 (electronic devices)',
  },
  {
    id: 'notation-device',
    prompt: 'Can you record your moves in an app on your phone instead of on the scoresheet?',
    options: [
      'Yes, if it is in airplane mode.',
      'Yes, for the first 10 moves only.',
      'Only if your coach says it is fine.',
      'No: use the tournament\'s official paper scoresheet.',
    ],
    answer: 3,
    explanation:
      'Players use the official scoresheets the event provides. This app is for before and after games; it never comes to the board.',
    rule: 'US Chess National Scholastic Regulations 2025–26 (scoresheets and devices)',
  },
  {
    id: 'coach-advice',
    prompt: 'In the middle of your game you look over at your coach, who nods at you. Is that allowed?',
    options: [
      'Yes: a nod is not talking.',
      'Yes, if it is about the clock and not the moves.',
      'No: nobody may advise you during your game, and you must not ask.',
      'Only between moves.',
    ],
    answer: 2,
    explanation:
      'During play you may not ask for or use advice from anyone: coaches, parents or teammates. Signals count too. Talk to your coach after the game.',
    rule: 'US Chess Rule 20E (no advice during play)',
  },
  {
    id: 'after-your-game',
    prompt: 'Your game is over but your teammate is still playing. What do you do?',
    options: [
      'Leave the playing area quietly and talk about games only outside the hall.',
      'Stand next to their board to cheer them on.',
      'Go over your game with your opponent next to the other boards.',
      'Tell your teammate how you won.',
    ],
    answer: 0,
    explanation:
      'Players still in their games must not be distracted, and nobody may advise them. Analyse and celebrate outside the playing hall.',
    rule: 'US Chess Rule 20 (conduct of players), and tournament etiquette',
  },
  {
    id: 'handshake',
    prompt: 'What is the right way to start and finish a game?',
    options: [
      'Just start the clock and play.',
      'Shake hands before the game and again after it, whatever the result.',
      'Shake hands only if you win.',
      'Shake hands only if your opponent offers first.',
    ],
    answer: 1,
    explanation:
      'A handshake before and after every game is expected at scholastic events. Then record the result on both scoresheets and report it the way the TD announced.',
    rule: 'Sportsmanship and etiquette (not a numbered rule)',
  },
  {
    id: 'draw-offer',
    prompt: 'How do you offer a draw properly?',
    options: [
      'Press your clock, then offer while your opponent thinks.',
      'Offer first, then decide on your move.',
      'Make your move on the board, offer the draw, then press your clock.',
      'Write "draw?" on your opponent\'s scoresheet.',
    ],
    answer: 2,
    explanation:
      'Offer a draw after making your move and before pressing your clock. Offering on your opponent\'s time disturbs them and can be penalised.',
    rule: 'US Chess Rule 14B (draw offers)',
  },
  {
    id: 'draw-decline',
    prompt: 'Your opponent offers you a draw. How can you turn it down?',
    options: [
      'Say "no", or just make your move.',
      'You must call the TD.',
      'Ignore it: the offer stays open all game.',
      'You cannot: once offered, the game is drawn.',
    ],
    answer: 0,
    explanation:
      'You may reject a draw offer out loud or by deliberately touching a piece to make your move. Do not keep the offer "in your pocket" for later.',
    rule: 'US Chess Rule 14B (draw offers)',
  },
  {
    id: 'triple-occurrence',
    prompt: 'The same position is about to appear for the third time, with you to move. How do you claim a draw?',
    options: [
      'Play the move, then tell your opponent it is a draw.',
      'Nothing to do: the game is drawn automatically.',
      'Offer a handshake.',
      'Write your intended move on your scoresheet without playing it, pause the clock and call the TD.',
    ],
    answer: 3,
    explanation:
      'Claim before you make the move that repeats (write it down, do not play it), or right after your opponent\'s move repeats it. Your scoresheet is your evidence, which is one more reason to keep it neat.',
    rule: 'US Chess Rule 14C (triple occurrence of position)',
  },
  {
    id: 'call-the-td',
    prompt: 'Your clock stops working, or your opponent keeps talking to you. What do you do?',
    options: [
      'Argue it out with your opponent.',
      'Fix the clock yourself.',
      'Pause the clock and raise your hand for the TD.',
      'Ask a parent to sort it out.',
    ],
    answer: 2,
    explanation:
      'You may stop both clocks to get a tournament director, and doing so does not complete your move. Never settle a dispute between yourselves.',
    rule: 'US Chess rules on claims and the director (stopping the clocks to summon the TD)',
  },
];

/**
 * Score a set of answers, `{ [questionId]: optionIndex }`.
 * Unanswered questions and out-of-range choices count as wrong; answers to
 * questions that do not exist are ignored.
 */
export function scoreRulesQuiz(answers, questions = RULES_QUESTIONS) {
  const total = questions.length;
  let correct = 0;
  const review = questions.map((q) => {
    const chosen = answers?.[q.id];
    const valid = Number.isInteger(chosen) && chosen >= 0 && chosen < q.options.length;
    const right = valid && chosen === q.answer;
    if (right) correct += 1;
    return { id: q.id, chosen: valid ? chosen : null, correct: right };
  });
  const accuracy = total ? correct / total : 0;
  return { correct, total, accuracy, passed: total > 0 && accuracy >= RULES_PASS_MARK, review };
}

/** The smallest number of right answers that passes. */
export function rulesPassScore(total = RULES_QUESTIONS.length) {
  return Math.ceil(total * RULES_PASS_MARK - 1e-9);
}
