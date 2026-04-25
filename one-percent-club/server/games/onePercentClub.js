const BaseGame = require('./baseGame');
const { pickQuestionsForGame } = require('./questions');

/**
 * The 1% Club game implementation.
 *
 * Rules (adapted for digital play):
 *  - Up to 140+ players, each given $1,000 stake
 *  - 11 questions at difficulty levels 90, 80, 70, 60, 50, 40, 30, 20, 10, 5, 1
 *  - Wrong answer or timeout = eliminated, $1000 goes to pot
 *  - Before question 5 (50% level), each remaining player gets ONE pass
 *    Using a pass: skip the question but sacrifice your $1000 to the pot
 *  - Before question 9 (10% level), players who haven't used their pass can walk away
 *    with their $1000
 *  - Players who answer the 5% question correctly (or pass it) reach the final
 *  - Final: split $10k equally OR attempt 1% question for pot share
 */
class OnePercentClubGame extends BaseGame {
  static get gameType() { return 'onePercentClub'; }
  static get displayName() { return 'The 1% Club'; }
  static get maxPlayers() { return 200; }

  constructor(room) {
    super(room);
    this.questions = pickQuestionsForGame();
    this.currentQuestionIdx = -1;
    this.questionState = 'idle'; // 'idle' | 'asking' | 'locked' | 'revealed'
    this.pot = 0;
    this.STAKE = 1000;
    this.WALKAWAY_SHARE = 10000;
    this.MAX_PRIZE = 100000;
    this.QUESTION_TIME_MS = 30000;
    this.questionStartedAt = null;
    this.walkawayOffered = false; // true during the offer window
    this.passOfferedAt = -1; // index where passes were introduced
    this.finalPhase = null; // null | 'choosing' | 'final' | 'finished'
    this.finalists = new Set(); // playerIds who reached final
    this.finalAttempters = new Set();
    this.finalWinners = new Set();
    this.walkawayTakers = new Set();   // those who took the final $10k split
    this.earlyWalkers = new Set();     // those who walked away pre-q9 with their $1k
    this.winners = []; // [{ playerId, name, amount }]
    this.stats = {}; // per-question stats for host
  }

  onPlayerJoin(player) {
    if (this.phase !== 'lobby') {
      // Late joiners become spectators
      player.state = {
        status: 'spectator',
        money: 0,
        hasPass: false,
        eliminated: true,
      };
      return;
    }
    player.state = {
      status: 'alive', // 'alive' | 'eliminated' | 'walked' | 'finalist' | 'spectator'
      money: this.STAKE,
      hasPass: true,
      eliminated: false,
      currentAnswer: null,
      usedPassThisQ: false,
      answeredCorrectly: null,
      elimRound: null,
    };
  }

  onPlayerLeave(player) {
    // Player disconnected - mark but don't eliminate (they can reconnect)
    // If game is in final and they're a finalist who hadn't decided, treat as walkaway
    if (player.state && player.state.status === 'alive' && this.phase === 'playing') {
      player.disconnected = true;
    }
  }

  onPlayerReconnect(player) {
    player.disconnected = false;
    this.sendStateToPlayer(player);
  }

  onStart() {
    if (this.room.players.size < 1) return;
    super.onStart();
    this.currentQuestionIdx = -1;
    this.pot = 0;
    this.broadcastEvent('game_started', {});
    this.broadcastState();
  }

  onHostAction(action, data) {
    switch (action) {
      case 'NEXT_QUESTION':
        this.advanceQuestion();
        break;
      case 'LOCK_ANSWERS':
        this.lockAnswers();
        break;
      case 'REVEAL_ANSWER':
        this.revealAnswer();
        break;
      case 'OFFER_WALKAWAY':
        this.offerWalkaway();
        break;
      case 'RESET_GAME':
        this.resetGame();
        break;
      case 'END_GAME':
        this.endGame();
        break;
    }
  }

  onPlayerAction(player, action, data) {
    if (!player.state) return;
    if (this.phase !== 'playing') return;

    switch (action) {
      case 'SUBMIT_ANSWER':
        this.handleAnswer(player, data.choiceIndex);
        break;
      case 'USE_PASS':
        this.handleUsePass(player);
        break;
      case 'WALK_AWAY':
        if (this.finalPhase === 'choosing') this.handleWalkawayFinal(player);
        else this.handleWalkaway(player);
        break;
      case 'ATTEMPT_FINAL':
        this.handleAttemptFinal(player);
        break;
    }
  }

  advanceQuestion() {
    // Check if next question is the final (1%) - if so, enter choice phase instead
    const nextIdx = this.currentQuestionIdx + 1;
    const FINAL_IDX = this.questions.length - 1; // index of the 1% question

    if (nextIdx === FINAL_IDX && this.finalPhase === null) {
      // Enter final-choice phase: walk with $10k split, or attempt the 1%
      this.enterFinalChoice();
      return;
    }

    // Past the 1% question? Game is over.
    if (nextIdx > FINAL_IDX) {
      this.endGame();
      return;
    }

    this.currentQuestionIdx = nextIdx;

    const q = this.questions[this.currentQuestionIdx];
    this.questionState = 'asking';
    this.questionStartedAt = Date.now();
    this.walkawayOffered = false;

    // Reset per-question player state
    for (const player of this.room.players.values()) {
      if (player.state && player.state.status === 'alive') {
        player.state.currentAnswer = null;
        player.state.usedPassThisQ = false;
        player.state.answeredCorrectly = null;
      }
    }

    this.broadcastEvent('new_question', { level: q.level, idx: this.currentQuestionIdx });
    this.broadcastState();

    // Auto-lock after time expires (host can also lock manually)
    this._lockTimeout = setTimeout(() => {
      if (this.questionState === 'asking') this.lockAnswers();
    }, this.QUESTION_TIME_MS);
  }

  offerWalkaway() {
    // Only valid before q9 (idx 8, the 10% question)
    this.walkawayOffered = true;
    this.broadcastEvent('walkaway_offered', {});
    this.broadcastState();
  }

  handleWalkaway(player) {
    if (!this.walkawayOffered) return;
    if (player.state.status !== 'alive') return;
    if (!player.state.hasPass) return; // per show rules: only those who haven't used pass can walk

    player.state.status = 'walked';
    player.state.eliminated = true;
    this.winners.push({
      playerId: player.id,
      name: player.name,
      amount: this.STAKE,
      reason: 'walked_away',
    });
    this.earlyWalkers.add(player.id);
    this.broadcastState();
  }

  handleAnswer(player, choiceIndex) {
    if (this.questionState !== 'asking') return;
    // During normal play: only 'alive' players answer.
    // During the final question: only finalists who chose to attempt may answer.
    if (this.finalPhase === 'final') {
      if (!this.finalAttempters.has(player.id)) return;
    } else {
      if (player.state.status !== 'alive') return;
    }
    player.state.currentAnswer = choiceIndex;
    this.broadcastState(); // so host sees count tick up
  }

  handleUsePass(player) {
    if (this.questionState !== 'asking') return;
    if (player.state.status !== 'alive') return;
    if (!player.state.hasPass) return;
    if (this.currentQuestionIdx === this.questions.length - 1) return; // can't pass final

    player.state.hasPass = false;
    player.state.usedPassThisQ = true;
    // Their $1000 goes to pot
    this.pot += player.state.money;
    player.state.money = 0;
    this.broadcastState();
  }

  lockAnswers() {
    if (this.questionState !== 'asking') return;
    clearTimeout(this._lockTimeout);
    this.questionState = 'locked';

    if (this.finalPhase === 'final') {
      for (const id of this.finalAttempters) {
        const p = this.room.players.get(id);
        if (p && p.state && p.state.currentAnswer === null) {
          p.state.currentAnswer = -1;
        }
      }
    } else {
      for (const player of this.room.players.values()) {
        if (player.state && player.state.status === 'alive') {
          if (!player.state.usedPassThisQ && player.state.currentAnswer === null) {
            player.state.currentAnswer = -1;
          }
        }
      }
    }
    this.broadcastState();
  }

  enterFinalChoice() {
    // Anyone still alive becomes a finalist with the choice to walk or attempt
    this.finalPhase = 'choosing';
    this.questionState = 'idle';

    for (const player of this.room.players.values()) {
      if (player.state && player.state.status === 'alive') {
        player.state.status = 'finalist';
        this.finalists.add(player.id);
      }
    }

    if (this.finalists.size === 0) {
      // Nobody made it - end game
      this.endGame();
      return;
    }

    this.broadcastEvent('final_reached', { finalistCount: this.finalists.size });
    this.broadcastState();
  }

  handleAttemptFinal(player) {
    if (this.finalPhase !== 'choosing') return;
    if (!this.finalists.has(player.id)) return;
    this.finalAttempters.add(player.id);
    this.broadcastState();
    this.checkFinalReady();
  }

  handleWalkawayFinal(player) {
    // Share of $10k among walkers
    if (this.finalPhase !== 'choosing') return;
    if (!this.finalists.has(player.id)) return;
    this.walkawayTakers.add(player.id);
    this.broadcastState();
    this.checkFinalReady();
  }

  checkFinalReady() {
    // When all finalists have chosen, show the final question
    const decided = this.finalAttempters.size + this.walkawayTakers.size;
    const pending = this.finalists.size - decided;
    if (pending === 0) {
      this.resolveWalkawayShares();

      // If nobody is attempting, end the game now
      if (this.finalAttempters.size === 0) {
        this.endGame();
        return;
      }

      // Show the final question to attempters
      this.finalPhase = 'final';
      this.currentQuestionIdx = this.questions.length - 1;
      this.questionState = 'asking';
      this.questionStartedAt = Date.now();

      // Reset answer state for finalists who are attempting
      for (const id of this.finalAttempters) {
        const p = this.room.players.get(id);
        if (p && p.state) {
          p.state.currentAnswer = null;
          p.state.answeredCorrectly = null;
        }
      }

      this.broadcastEvent('final_question_shown', {});
      this.broadcastState();

      this._lockTimeout = setTimeout(() => {
        if (this.questionState === 'asking') this.lockAnswers();
      }, this.QUESTION_TIME_MS);
    }
  }

  resolveWalkawayShares() {
    const walkers = [...this.walkawayTakers].filter(id => this.finalists.has(id));
    if (walkers.length > 0) {
      const share = Math.floor(this.WALKAWAY_SHARE / walkers.length);
      for (const id of walkers) {
        const player = this.room.players.get(id);
        if (!player) continue;
        player.state.money = share;
        player.state.status = 'walked';
        this.winners.push({ playerId: id, name: player.name, amount: share, reason: 'walked_final' });
      }
    }
  }

  revealFinal() {
    // Called via host clicking REVEAL_ANSWER during finalPhase === 'final'
    const q = this.questions[this.questions.length - 1];
    const correctIdx = q.answerIndex;
    const correctFinalists = [];
    for (const id of this.finalAttempters) {
      const player = this.room.players.get(id);
      if (!player) continue;
      if (player.state.currentAnswer === correctIdx) {
        correctFinalists.push(player);
      } else {
        player.state.status = 'eliminated';
        player.state.money = 0;
      }
    }

    if (correctFinalists.length > 0) {
      const share = Math.floor(this.pot / correctFinalists.length);
      for (const p of correctFinalists) {
        p.state.money = share;
        p.state.status = 'winner';
        this.finalWinners.add(p.id);
        this.winners.push({ playerId: p.id, name: p.name, amount: share, reason: 'won_final' });
      }
      this.pot = 0;
    }

    this.finalPhase = 'finished';
    this.phase = 'ended';
    this.broadcastEvent('final_resolved', { winners: correctFinalists.length });
    this.broadcastState();
  }

  // Override revealAnswer to handle final phase
  revealAnswer() {
    if (this.finalPhase === 'final') {
      this.revealFinal();
      return;
    }
    // Normal reveal logic
    if (this.questionState === 'asking') this.lockAnswers();
    if (this.questionState !== 'locked') return;

    const q = this.questions[this.currentQuestionIdx];
    const correctIdx = q.answerIndex;
    let eliminated = 0;
    let correct = 0;
    let passed = 0;

    for (const player of this.room.players.values()) {
      if (!player.state || player.state.status !== 'alive') continue;

      if (player.state.usedPassThisQ) {
        passed++;
        player.state.answeredCorrectly = null;
        continue;
      }

      if (player.state.currentAnswer === correctIdx) {
        player.state.answeredCorrectly = true;
        correct++;
      } else {
        player.state.answeredCorrectly = false;
        player.state.status = 'eliminated';
        player.state.eliminated = true;
        player.state.elimRound = this.currentQuestionIdx;
        this.pot += player.state.money;
        player.state.money = 0;
        eliminated++;
      }
    }

    this.questionState = 'revealed';
    this.stats[this.currentQuestionIdx] = { correct, eliminated, passed, level: q.level };
    this.broadcastEvent('answer_revealed', { correct: correctIdx, eliminated, correctCount: correct });
    this.broadcastState();

    if (this.countAlive() === 0 && this.finalists.size === 0) {
      // Edge case: everyone eliminated pre-final
      this.endGame();
    }
  }

  countAlive() {
    let n = 0;
    for (const p of this.room.players.values()) {
      if (p.state && p.state.status === 'alive') n++;
    }
    return n;
  }

  endGame() {
    this.phase = 'ended';
    this.broadcastEvent('game_ended', { winners: this.winners });
    this.broadcastState();
  }

  resetGame() {
    this.questions = pickQuestionsForGame();
    this.currentQuestionIdx = -1;
    this.questionState = 'idle';
    this.pot = 0;
    this.phase = 'lobby';
    this.finalPhase = null;
    this.finalists.clear();
    this.finalAttempters.clear();
    this.finalWinners.clear();
    this.walkawayTakers.clear();
    this.earlyWalkers.clear();
    this.winners = [];
    this.stats = {};
    this.walkawayOffered = false;
    clearTimeout(this._lockTimeout);

    for (const player of this.room.players.values()) {
      player.state = {
        status: 'alive',
        money: this.STAKE,
        hasPass: true,
        eliminated: false,
        currentAnswer: null,
        usedPassThisQ: false,
        answeredCorrectly: null,
        elimRound: null,
      };
    }
    this.broadcastEvent('game_reset', {});
    this.broadcastState();
  }

  getStateForPlayer(player) {
    const q = this.currentQuestionIdx >= 0 && this.currentQuestionIdx < this.questions.length
      ? this.questions[this.currentQuestionIdx]
      : null;

    const publicQuestion = q ? {
      level: q.level,
      question: q.question,
      choices: q.choices,
      idx: this.currentQuestionIdx,
      // answer only sent when revealed
      correctAnswer: this.questionState === 'revealed' || this.finalPhase === 'finished' ? q.answerIndex : null,
    } : null;

    return {
      phase: this.phase,
      questionState: this.questionState,
      finalPhase: this.finalPhase,
      question: publicQuestion,
      pot: this.pot,
      questionStartedAt: this.questionStartedAt,
      questionTimeMs: this.QUESTION_TIME_MS,
      walkawayOffered: this.walkawayOffered,
      playerCount: this.room.players.size,
      aliveCount: this.countAlive(),
      finalistCount: this.finalists.size,
      me: {
        id: player.id,
        name: player.name,
        ...player.state,
        isFinalist: this.finalists.has(player.id),
        hasAttemptedFinal: this.finalAttempters.has(player.id),
        hasWalkedFinal: this.walkawayTakers.has(player.id),
      },
      winners: this.winners,
    };
  }

  getStateForHost() {
    const playerStates = [];
    for (const p of this.room.players.values()) {
      playerStates.push({
        id: p.id,
        name: p.name,
        connected: !p.disconnected,
        ...p.state,
        hasAnswered: p.state && p.state.currentAnswer !== null,
      });
    }

    const q = this.currentQuestionIdx >= 0 && this.currentQuestionIdx < this.questions.length
      ? this.questions[this.currentQuestionIdx]
      : null;

    return {
      phase: this.phase,
      questionState: this.questionState,
      finalPhase: this.finalPhase,
      question: q,
      questionIdx: this.currentQuestionIdx,
      totalQuestions: this.questions.length,
      pot: this.pot,
      questionStartedAt: this.questionStartedAt,
      questionTimeMs: this.QUESTION_TIME_MS,
      walkawayOffered: this.walkawayOffered,
      players: playerStates,
      aliveCount: this.countAlive(),
      finalistCount: this.finalists.size,
      finalAttempters: [...this.finalAttempters],
      walkawayTakers: [...this.walkawayTakers],
      winners: this.winners,
      stats: this.stats,
    };
  }
}

module.exports = OnePercentClubGame;
