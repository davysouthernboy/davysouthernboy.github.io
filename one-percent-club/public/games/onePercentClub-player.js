// Player-side rendering for The 1% Club.
// Receives state, renders appropriate UI into #main.
(function() {
  let timerInterval = null;

function h(tag, attrs, children) {
  const el = document.createElement(tag);

  if (attrs) {
    for (const k in attrs) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'onclick') el.onclick = attrs[k];
      else if (k === 'disabled') {
        if (attrs[k]) el.disabled = true;
      }
      else el.setAttribute(k, attrs[k]);
    }
  }

  if (children) {
    for (const c of children) {
      if (c == null) continue;
      if (typeof c === 'string') el.appendChild(document.createTextNode(c));
      else el.appendChild(c);
    }
  }

  return el;
}
  function letter(i) { return String.fromCharCode(65 + i); }

  function formatLevel(lvl) {
    if (lvl === 1) return '1%';
    return lvl + '%';
  }

  function renderLobby(state, me) {
    return h('div', { class: 'status fade-in' }, [
      h('div', { class: 'headline' }, [
        h('span', { class: 'pulse' }),
        'You\u2019re in'
      ]),
      h('div', { class: 'sub' }, [`Waiting for ${state.playerCount} player${state.playerCount === 1 ? '' : 's'}… the host will start the game soon.`]),
    ]);
  }

  function renderEliminated(state, me) {
    return h('div', { class: 'main', style: 'padding:0; gap:1rem;' }, [
      h('div', { class: 'spectator-banner fade-in' }, ['You were eliminated · Watching from the sidelines']),
      renderQuestion(state, me, true),
    ]);
  }

  function renderWalked(state, me) {
    return h('div', { class: 'status fade-in' }, [
      h('div', { class: 'headline' }, [`$${(me.money || 0).toLocaleString()}`]),
      h('div', { class: 'sub' }, ['You walked away with your stake. Nice call.']),
    ]);
  }

  function renderQuestion(state, me, isSpectator) {
    const q = state.question;
    if (!q) return h('div', { class: 'status' }, [
      h('div', { class: 'headline' }, ['Get ready']),
      h('div', { class: 'sub' }, ['Next question coming up'])
    ]);

    const alreadyAnswered = me.currentAnswer !== null && me.currentAnswer !== undefined && me.currentAnswer !== -1;
    const usedPass = me.usedPassThisQ;
    const locked = state.questionState === 'locked' || state.questionState === 'revealed';
    const revealed = state.questionState === 'revealed';

    // Choices
    const choiceEls = q.choices.map((text, i) => {
      const classes = ['choice'];
      if (me.currentAnswer === i) classes.push('selected');
      if (revealed) {
        if (i === q.correctAnswer) classes.push('correct');
        else if (me.currentAnswer === i) classes.push('wrong');
      }
      const onclick = (!isSpectator && !locked && !usedPass && !alreadyAnswered)
        ? () => window.sendPlayerAction('SUBMIT_ANSWER', { choiceIndex: i })
        : null;
      return h('button', {
        class: classes.join(' '),
        disabled: isSpectator || locked || usedPass,
        ...(onclick ? { onclick } : {}),
      }, [
        h('span', { class: 'letter' }, [letter(i)]),
        h('span', { class: 'choice-text' }, [text]),
      ]);
    });

    // Timer
    let timerText = '';
    if (state.questionStartedAt && state.questionState === 'asking') {
      const elapsed = Date.now() - state.questionStartedAt;
      const remaining = Math.max(0, Math.ceil((state.questionTimeMs - elapsed) / 1000));
      timerText = `${remaining}s`;
    } else if (state.questionState === 'locked') {
      timerText = 'LOCKED';
    } else if (state.questionState === 'revealed') {
      timerText = me.answeredCorrectly === true ? 'CORRECT' : me.usedPassThisQ ? 'PASSED' : 'WRONG';
    }

    const card = h('div', { class: 'qcard fade-in' }, [
      h('div', { class: 'qhead' }, [
        h('div', { class: 'level-pill' }, [`Question · ${formatLevel(q.level)}`]),
        h('div', { class: 'timer' + (state.questionState === 'asking' && timerText && parseInt(timerText) <= 5 ? ' urgent' : '') }, [timerText]),
      ]),
      h('div', { class: 'qtext' }, [q.question]),
      h('div', { class: 'choices' }, choiceEls),
      usedPass ? h('div', { class: 'locked-msg' }, ['Pass used · waiting for others']) : null,
    ]);

    // Action buttons (walkaway / pass)
    const actionEls = [];
    if (!isSpectator && !locked) {
      if (me.hasPass && !usedPass) {
        actionEls.push(h('button', {
          class: 'btn pass',
          onclick: () => {
            if (confirm('Use your pass? Your $1,000 goes to the pot and you\u2019ll skip this question.')) {
              window.sendPlayerAction('USE_PASS');
            }
          }
        }, ['Use Pass']));
      }
      if (state.walkawayOffered && me.hasPass) {
        actionEls.push(h('button', {
          class: 'btn walk',
          onclick: () => {
            if (confirm('Walk away with $1,000?')) {
              window.sendPlayerAction('WALK_AWAY');
            }
          }
        }, ['Walk Away · $1,000']));
      }
    }

    const info = h('div', { class: 'info-strip' }, [
      h('div', { class: 'cell' }, [
        h('div', { class: 'val' }, ['$' + (state.pot || 0).toLocaleString()]),
        h('div', { class: 'lbl' }, ['Pot']),
      ]),
      h('div', { class: 'cell' }, [
        h('div', { class: 'val' }, [String(state.aliveCount || 0)]),
        h('div', { class: 'lbl' }, ['Alive']),
      ]),
      h('div', { class: 'cell' }, [
        h('div', { class: 'val' }, [me.hasPass ? '1' : '0']),
        h('div', { class: 'lbl' }, ['Passes']),
      ]),
    ]);

    const container = h('div', { class: 'main', style: 'padding:0; gap:1rem;' }, [
      info,
      card,
      actionEls.length ? h('div', { class: 'actions' }, actionEls) : null,
    ]);
    return container;
  }

  function renderFinalChoosing(state, me) {
    const alreadyChose = me.hasAttemptedFinal || me.hasWalkedFinal;
    return h('div', { class: 'main', style: 'padding:0; gap:1rem;' }, [
      h('div', { class: 'status fade-in' }, [
        h('div', { class: 'headline' }, ['The Final']),
        h('div', { class: 'sub' }, [
          `Pot: $${state.pot.toLocaleString()} · ${state.finalistCount} finalist${state.finalistCount === 1 ? '' : 's'}`
        ]),
        h('div', { class: 'sub', style: 'margin-top:1.25rem; line-height:1.8;' }, [
          'Take $10,000 split with anyone else who walks, or attempt the 1% question for a share of the pot.'
        ]),
      ]),
      alreadyChose
        ? h('div', { class: 'locked-msg' }, [me.hasAttemptedFinal ? 'Going for it · waiting for others' : 'Taking the split · waiting for others'])
        : h('div', { class: 'actions' }, [
          h('button', {
            class: 'btn walk',
            onclick: () => window.sendPlayerAction('WALK_AWAY')
          }, ['Take $10k Split']),
          h('button', {
            class: 'btn go',
            onclick: () => window.sendPlayerAction('ATTEMPT_FINAL')
          }, ['Go for 1%']),
        ]),
    ]);
  }

  function renderFinalQuestion(state, me) {
    if (!me.hasAttemptedFinal) {
      return h('div', { class: 'status fade-in' }, [
        h('div', { class: 'headline' }, ['Watching']),
        h('div', { class: 'sub' }, ['The finalists are attempting the 1% question…']),
      ]);
    }
    // Same question UI but only the final question
    return renderQuestion(state, me, false);
  }

  function renderGameOver(state, me) {
    const won = me.status === 'winner' || (me.money > 0 && me.status !== 'eliminated');
    return h('div', { class: 'main', style: 'padding:0; gap:1rem;' }, [
      won
        ? h('div', { class: 'winner-banner fade-in' }, [
          h('div', { class: 'amt' }, ['$' + (me.money || 0).toLocaleString()]),
          h('div', { class: 'lbl' }, ['You won']),
        ])
        : h('div', { class: 'status fade-in' }, [
          h('div', { class: 'headline' }, ['Game Over']),
          h('div', { class: 'sub' }, ['Thanks for playing.']),
        ]),
    ]);
  }

  window.renderOnePercentClub = function(state, root) {
    // Clear previous timer
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

    const me = state.me || {};
    let content;

    if (state.phase === 'ended') {
      content = renderGameOver(state, me);
    } else if (state.phase === 'lobby') {
      content = renderLobby(state, me);
    } else if (state.finalPhase === 'choosing') {
      content = renderFinalChoosing(state, me);
    } else if (state.finalPhase === 'final') {
      content = renderFinalQuestion(state, me);
    } else if (me.status === 'eliminated') {
      content = renderEliminated(state, me);
    } else if (me.status === 'walked') {
      content = renderWalked(state, me);
    } else {
      content = renderQuestion(state, me, false);
    }

    root.innerHTML = '';
    // If content is a .main wrapper, unwrap its children into root
    if (content.classList.contains('main')) {
      while (content.firstChild) root.appendChild(content.firstChild);
    } else {
      root.appendChild(content);
    }

    // Live timer refresh during asking state
    if (state.questionState === 'asking' && state.questionStartedAt) {
      timerInterval = setInterval(() => {
        const timerEl = root.querySelector('.timer');
        if (!timerEl) { clearInterval(timerInterval); return; }
        const elapsed = Date.now() - state.questionStartedAt;
        const remaining = Math.max(0, Math.ceil((state.questionTimeMs - elapsed) / 1000));
        timerEl.textContent = remaining + 's';
        if (remaining <= 5) timerEl.classList.add('urgent');
        if (remaining <= 0) { clearInterval(timerInterval); }
      }, 250);
    }
  };
})();
