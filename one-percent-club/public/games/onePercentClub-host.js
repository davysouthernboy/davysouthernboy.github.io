// Host-side big-screen rendering for The 1% Club.
(function() {
  let timerInterval = null;

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') el.className = attrs[k];
        else if (k === 'onclick') el.onclick = attrs[k];
        else if (k === 'disabled' && attrs[k]) el.disabled = true;
        else if (k === 'style') el.setAttribute('style', attrs[k]);
        else el.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (const c of children) {
        if (c == null) continue;
        if (typeof c === 'string' || typeof c === 'number') el.appendChild(document.createTextNode(String(c)));
        else el.appendChild(c);
      }
    }
    return el;
  }

  function letter(i) { return String.fromCharCode(65 + i); }
  function fmtMoney(n) { return '$' + (n || 0).toLocaleString(); }
  function formatLevel(lvl) { return lvl === 1 ? '1%' : lvl + '%'; }

  function renderHeader(state) {
    const idx = state.questionIdx >= 0 ? state.questionIdx + 1 : 0;
    return h('div', { class: 'game-header' }, [
      h('div', { class: 'brand-mini' }, ['The 1% Club']),
      h('div', { class: 'game-stats' }, [
        h('div', { class: 'stat' }, [
          h('div', { class: 'v' }, [fmtMoney(state.pot)]),
          h('div', { class: 'l' }, ['Pot']),
        ]),
        h('div', { class: 'stat' }, [
          h('div', { class: 'v' }, [String(state.aliveCount || 0)]),
          h('div', { class: 'l' }, ['Alive']),
        ]),
        h('div', { class: 'stat' }, [
          h('div', { class: 'v' }, [`${idx}/${state.totalQuestions}`]),
          h('div', { class: 'l' }, ['Question']),
        ]),
      ]),
    ]);
  }

  function renderQuestionStage(state, hostAction) {
    const q = state.question;
    const revealed = state.questionState === 'revealed';

    if (!q) {
      // Between questions
      return h('div', { class: 'question-stage fade-in' }, [
        h('div', { class: 'level-marker' }, ['Ready']),
        h('div', { class: 'big-question' }, ['Click "Next Question" to begin.']),
      ]);
    }

    // Answer counts for stats bar
    const counts = [0, 0, 0, 0];
    let answered = 0;
    for (const p of state.players || []) {
      if (p.status === 'alive' && p.currentAnswer !== null && p.currentAnswer !== undefined && p.currentAnswer !== -1) {
        if (p.currentAnswer >= 0 && p.currentAnswer < 4) {
          counts[p.currentAnswer]++;
          answered++;
        }
      }
    }

    const choiceEls = q.choices.map((text, i) => {
      const classes = ['big-choice'];
      if (revealed && i === q.answerIndex) classes.push('correct');
      return h('div', { class: classes.join(' ') }, [
        h('span', { class: 'big-letter' }, [letter(i)]),
        h('span', {}, [text]),
      ]);
    });

    const stats = h('div', { class: 'answer-stats' },
      counts.map((c, i) => {
        const pct = answered > 0 ? (c / answered) * 100 : 0;
        const color = revealed && i === q.answerIndex ? 'var(--green)' : 'var(--accent)';
        return h('div', {
          class: 'seg',
          style: `flex-basis: ${pct}%; background: ${color};`,
        });
      })
    );

    // Timer
    let timerText = '';
    let timerClass = 'timer-ring';
    if (state.questionStartedAt && state.questionState === 'asking') {
      const elapsed = Date.now() - state.questionStartedAt;
      const remaining = Math.max(0, Math.ceil((state.questionTimeMs - elapsed) / 1000));
      timerText = remaining + 's';
      if (remaining <= 5) timerClass += ' urgent';
    } else if (state.questionState === 'locked') {
      timerText = 'LOCKED';
    } else if (state.questionState === 'revealed') {
      timerText = '✓';
    }

    return h('div', { class: 'question-stage fade-in' }, [
      h('div', { class: timerClass }, [timerText]),
      h('div', { class: 'level-marker' }, [`Question ${state.questionIdx + 1} · ${formatLevel(q.level)}`]),
      h('div', { class: 'big-question' }, [q.question]),
      h('div', { class: 'big-choices' }, choiceEls),
      stats,
      h('div', { style: 'margin-top: 1rem; font-family: JetBrains Mono, monospace; font-size: 0.75rem; color: var(--ink-dim); letter-spacing: 0.15em; text-transform: uppercase;' },
        [`${answered}/${state.aliveCount} answered`]),
    ]);
  }

  function renderControls(state, hostAction) {
    const controls = [];
    const qs = state.questionState;
    const phase = state.phase;
    const finalPhase = state.finalPhase;

    if (phase === 'playing') {
      if (finalPhase === 'choosing') {
        const pending = state.finalistCount - (state.finalAttempters.length + state.walkawayTakers.length);
        controls.push(h('div', {
          style: 'font-family: JetBrains Mono, monospace; color: var(--ink-dim); padding: 1rem; letter-spacing: 0.15em; text-transform: uppercase; font-size: 0.8rem;'
        }, [`Waiting for ${pending} finalist${pending === 1 ? '' : 's'} to choose…`]));
      } else if (finalPhase === 'final' && qs !== 'revealed') {
        controls.push(h('button', { class: 'ctrl primary', onclick: () => hostAction('LOCK_ANSWERS') }, ['Lock Answers']));
        controls.push(h('button', { class: 'ctrl primary', onclick: () => hostAction('REVEAL_ANSWER') }, ['Reveal Final']));
      } else if (qs === 'idle') {
        // Offer walkaway before the 10% question (idx 8)
        const nextIdx = state.questionIdx + 1;
        if (nextIdx === 8 && !state.walkawayOffered) {
          controls.push(h('button', { class: 'ctrl', onclick: () => hostAction('OFFER_WALKAWAY') }, ['Offer Walkaway ($1k)']));
        }
        let label = 'Next Question →';
        if (nextIdx === state.totalQuestions - 1) label = 'To Final Choice →';
        else if (state.questionIdx === -1) label = 'Start First Question →';
        controls.push(h('button', { class: 'ctrl primary', onclick: () => hostAction('NEXT_QUESTION') }, [label]));
      } else if (qs === 'asking') {
        controls.push(h('button', { class: 'ctrl', onclick: () => hostAction('LOCK_ANSWERS') }, ['Lock Answers']));
      } else if (qs === 'locked') {
        controls.push(h('button', { class: 'ctrl primary', onclick: () => hostAction('REVEAL_ANSWER') }, ['Reveal Answer']));
      } else if (qs === 'revealed') {
        if (state.questionIdx >= state.totalQuestions - 1) {
          controls.push(h('button', { class: 'ctrl primary', onclick: () => hostAction('END_GAME') }, ['End Game']));
        } else if (state.questionIdx === state.totalQuestions - 2) {
          // Just revealed the 5% question — next click triggers the final-choice phase
          controls.push(h('button', { class: 'ctrl primary', onclick: () => hostAction('NEXT_QUESTION') }, ['To Final Choice →']));
        } else {
          controls.push(h('button', { class: 'ctrl primary', onclick: () => hostAction('NEXT_QUESTION') }, ['Next Question →']));
        }
      }
      controls.push(h('button', { class: 'ctrl danger', onclick: () => {
        if (confirm('Reset the game back to lobby?')) hostAction('RESET_GAME');
      } }, ['Reset']));
    } else if (phase === 'ended') {
      controls.push(h('button', { class: 'ctrl primary', onclick: () => hostAction('RESET_GAME') }, ['Play Again']));
    }

    return h('div', { class: 'controls' }, controls);
  }

  function renderFinalChoices(state) {
    if (state.finalPhase !== 'choosing') return null;
    const finalists = (state.players || []).filter(p => p.status === 'finalist' || state.finalAttempters.includes(p.id) || state.walkawayTakers.includes(p.id));
    const rows = finalists.map(p => {
      let label = 'Deciding…';
      let cls = 'pc pending';
      if (state.finalAttempters.includes(p.id)) { label = 'Going for 1%'; cls = 'pc going'; }
      else if (state.walkawayTakers.includes(p.id)) { label = 'Taking split'; cls = 'pc walking'; }
      return h('div', { class: cls }, [
        h('span', {}, [p.name]),
        h('span', {}, [label]),
      ]);
    });
    return h('div', { class: 'question-stage fade-in' }, [
      h('div', { class: 'level-marker' }, ['Final Choice']),
      h('div', { class: 'big-question' }, [
        `${state.finalistCount} finalist${state.finalistCount === 1 ? '' : 's'} · Pot ${fmtMoney(state.pot)}`
      ]),
      h('div', { class: 'final-choice-list' }, rows),
    ]);
  }

  function renderWinners(state) {
    const winners = state.winners || [];
    const sorted = [...winners].sort((a, b) => b.amount - a.amount);
    return h('div', { class: 'winners-stage fade-in' }, [
      h('h2', {}, ['Winners']),
      ...sorted.map(w => h('div', { class: 'winner-row' }, [
        h('div', { class: 'wname' }, [w.name]),
        h('div', { class: 'wamt' }, [fmtMoney(w.amount)]),
      ])),
      sorted.length === 0 ? h('div', { style: 'color: var(--ink-dim); font-family: JetBrains Mono, monospace; letter-spacing: 0.1em;' }, ['No winners this round.']) : null,
    ]);
  }

  window.renderOnePercentClubHost = function(state, root, hostAction) {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

    root.innerHTML = '';
    root.appendChild(renderHeader(state));

    if (state.phase === 'ended') {
      root.appendChild(renderWinners(state));
    } else if (state.finalPhase === 'choosing') {
      root.appendChild(renderFinalChoices(state));
    } else {
      root.appendChild(renderQuestionStage(state, hostAction));
    }

    root.appendChild(renderControls(state, hostAction));

    // Live timer
    if (state.questionState === 'asking' && state.questionStartedAt) {
      timerInterval = setInterval(() => {
        const ring = root.querySelector('.timer-ring');
        if (!ring) { clearInterval(timerInterval); return; }
        const elapsed = Date.now() - state.questionStartedAt;
        const remaining = Math.max(0, Math.ceil((state.questionTimeMs - elapsed) / 1000));
        ring.textContent = remaining + 's';
        if (remaining <= 5) ring.classList.add('urgent');
        if (remaining <= 0) clearInterval(timerInterval);
      }, 250);
    }
  };
})();
