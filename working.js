(() => {
  'use strict';
  const core = window.ShrineCore;
  const storageKey = 'suiyoukai-shrine-working-preview-v1';
  const $ = id => document.getElementById(id);
  const make = (tag, text, className = '') => {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  let state = { roster: [], results: [], groups: [], current: null, mode: 'match' };
  let pendingImport = null;

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const stored = JSON.parse(raw);
      const checked = core.importData(core.exportData(stored.roster || [], stored.results || []));
      state = { ...state, ...checked, mode: stored.mode === 'group' ? 'group' : 'match' };
    }
  } catch { /* Invalid local preview data leaves a safe empty screen. */ }
  function restoreWidget(snapshot) {
    const saved = snapshot?.privateContent;
    if (!saved || !Array.isArray(saved.roster) || !Array.isArray(saved.results)) return;
    try {
      const checked = core.importData(core.exportData(saved.roster, saved.results));
      state = { ...state, ...checked, mode: saved.mode === 'group' ? 'group' : 'match', groups: [], current: null };
    } catch { /* Invalid saved widget state is ignored. */ }
  }
  restoreWidget(window.openai?.widgetState);

  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify({ roster: state.roster, results: state.results, mode: state.mode })); }
    catch { notice('この端末への保存に失敗しました。転送用コピーで控えてください。', true); }
    if (typeof window.openai?.setWidgetState === 'function') {
      const privateContent = { roster: state.roster, results: state.results, mode: state.mode };
      if (JSON.stringify(privateContent).length < 15000) {
        window.openai.setWidgetState({ modelContent: null, privateContent }).catch(() => {});
      }
    }
  }
  function notice(message, error = false) {
    const box = $('notice');
    box.textContent = message;
    box.classList.toggle('error', error);
    box.hidden = false;
  }
  function doAction(action) {
    try { action(); } catch (error) { notice(error.message || '操作を確認してください。', true); }
  }
  function resetCurrent() {
    if (state.current && !window.confirm('現在の未保存の結果を消して、参加者を変更しますか？')) return false;
    state.current = null;
    state.groups = [];
    return true;
  }
  function labelForStrength(strength) {
    if (!strength?.type) return '';
    return `${strength.value}${{ point: '点', dan: '段', kyu: '級' }[strength.type]}`;
  }
  function updateStrengthChoices() {
    const type = $('strength-type').value;
    const select = $('strength-value');
    select.replaceChildren();
    select.disabled = !type;
    select.add(new Option(type ? '数値を選んでください' : '先に棋力の種類を選んでください', ''));
    const limits = { point: [-10, 30], dan: [1, 9], kyu: [1, 30] };
    if (!limits[type]) return;
    const [minimum, maximum] = limits[type];
    for (let number = minimum; number <= maximum; number += 1) {
      select.add(new Option(String(number), String(number)));
    }
  }
  function renderRoster() {
    $('roster-count').textContent = `${state.roster.length}人`;
    const list = $('roster-list'); list.replaceChildren();
    if (!state.roster.length) { list.append(make('p', 'まだ参加者はいません。', 'empty')); return; }
    state.roster.forEach((person, index) => {
      const row = make('div', '', 'person');
      const info = make('div', '');
      info.append(make('strong', `${index + 1}. ${person.name}`));
      const traits = [person.gender === 'female' ? '女' : person.gender === 'male' ? '男' : '', labelForStrength(person.strength)].filter(Boolean);
      if (traits.length) info.append(make('small', traits.join('・')));
      const remove = make('button', '外す'); remove.type = 'button'; remove.dataset.removePerson = person.id;
      row.append(info, remove); list.append(row);
    });
  }
  function renderSaved() {
    const list = $('saved-results'); list.replaceChildren();
    if (!state.results.length) { list.append(make('p', 'まだ保存した結果はありません。', 'empty')); return; }
    for (const result of state.results) {
      const row = make('div', '', 'saved');
      const head = make('div', '', 'savedhead');
      const info = make('div', '');
      info.append(make('strong', result.title));
      const date = new Date(result.date);
      info.append(make('small', Number.isNaN(date.valueOf()) ? '' : date.toLocaleString('ja-JP')));
      const copy = make('button', 'コピー'); copy.type = 'button'; copy.dataset.copySaved = result.id;
      head.append(info, copy); row.append(head);
      const details = make('details', ''); details.append(make('summary', '内容を見る'));
      details.append(make('p', result.lines.join('\n'), 'result-list'));
      row.append(details); list.append(row);
    }
  }
  function matchLines(session) {
    const byId = new Map(session.entries.map(entry => [entry.id, entry]));
    const lines = [];
    session.rounds.forEach((round, index) => {
      lines.push(`第${index + 1}回戦`);
      round.pairs.forEach(pair => {
        const outcome = pair.result === 'a' ? ` → ${byId.get(pair.a).label}の勝ち` : pair.result === 'b' ? ` → ${byId.get(pair.b).label}の勝ち` : pair.result === 'draw' ? ' → 引き分け' : '';
        lines.push(`${byId.get(pair.a).label} 対 ${byId.get(pair.b).label}${outcome}`);
      });
      if (round.bye) lines.push(`待機：${byId.get(round.bye).label}`);
    });
    if (session.complete) lines.push(`優勝：${byId.get(session.winnerId).label}`);
    if (session.method === 'swiss') {
      lines.push('成績');
      [...session.entries].sort((a, b) => b.score - a.score).forEach(e => lines.push(`${e.label} ${e.score}点`));
    }
    return lines;
  }
  function currentResult() {
    if (!state.current) return null;
    if (state.current.kind === 'group') {
      return { kind: 'group', title: `ペア・団体（${state.current.groups.length}組）`, lines: state.current.groups.map((group, index) => `${index + 1}番　${group.map(p => p.name).join('・')}`) };
    }
    const session = state.current.session;
    return { kind: session.method, title: session.method === 'tournament' ? 'トーナメント' : 'スイス方式', lines: matchLines(session) };
  }
  function renderCurrent() {
    const box = $('current-result'); box.replaceChildren();
    const output = currentResult();
    $('copy-result').disabled = !output;
    $('save-result').disabled = !output;
    $('result-kind').textContent = output?.title || '';
    $('use-groups').hidden = state.current?.kind !== 'group';
    if (!output) { box.append(make('p', 'まだ結果はありません。', 'empty')); return; }
    if (state.current.kind === 'group') {
      state.current.groups.forEach((group, index) => box.append(make('p', `${index + 1}番　${group.map(p => p.name).join('・')}`, 'group-line')));
      return;
    }
    const session = state.current.session;
    const byId = new Map(session.entries.map(e => [e.id, e]));
    session.rounds.forEach((round, index) => {
      box.append(make('h3', `第${index + 1}回戦`));
      round.pairs.forEach((pair, pairIndex) => {
        const row = make('div', '', 'pair');
        row.append(make('strong', `${byId.get(pair.a).label}　対　${byId.get(pair.b).label}`));
        if (index === session.rounds.length - 1 && !session.complete) {
          const label = make('label', '結果');
          const select = make('select', ''); select.dataset.pairIndex = String(pairIndex);
          [['', '結果を選択'], ['a', `${byId.get(pair.a).label}の勝ち`], ['b', `${byId.get(pair.b).label}の勝ち`], ...(session.method === 'swiss' ? [['draw', '引き分け']] : [])]
            .forEach(([value, name]) => { const option = new Option(name, value); select.add(option); });
          select.value = pair.result; label.append(select); row.append(label);
        } else {
          const win = pair.result === 'a' ? byId.get(pair.a).label : pair.result === 'b' ? byId.get(pair.b).label : pair.result === 'draw' ? '引き分け' : '未選択';
          row.append(make('small', `結果：${win}`));
        }
        box.append(row);
      });
      if (round.bye) box.append(make('p', `待機：${byId.get(round.bye).label}`));
    });
    if (session.complete) box.append(make('h3', `優勝：${byId.get(session.winnerId).label}`));
    else {
      const next = make('button', session.method === 'swiss' ? '結果を確定して次の回戦' : '勝者で次の回戦', 'primary');
      next.id = 'next-round'; next.type = 'button'; box.append(next);
    }
    if (session.method === 'swiss' && session.rounds.length > 1) {
      box.append(make('h3', '現在の成績'));
      [...session.entries].sort((a, b) => b.score - a.score).forEach(e => box.append(make('p', `${e.label}　${e.score}点`)));
    }
  }
  function render() {
    document.querySelectorAll('[data-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.tab === state.mode)));
    $('match-panel').hidden = state.mode !== 'match'; $('group-panel').hidden = state.mode !== 'group';
    renderRoster(); renderSaved(); renderCurrent();
  }
  async function copyText(text, fallback) {
    fallback.value = text;
    try { await navigator.clipboard.writeText(text); notice('コピーしました。'); }
    catch { fallback.focus(); fallback.select(); notice('転送文欄に表示しました。選択した文字を端末の操作でコピーしてください。'); }
  }

  for (let count = 2; count <= 16; count++) $('group-size').add(new Option(`${count}人`, String(count)));
  $('group-size').value = '2';
  $('strength-type').addEventListener('change', updateStrengthChoices);
  updateStrengthChoices();
  document.querySelectorAll('[data-tab]').forEach(tab => tab.addEventListener('click', () => { state.mode = tab.dataset.tab; persist(); render(); }));
  $('bulk-add').addEventListener('click', () => doAction(() => {
    const next = core.addPeople(state.roster, $('bulk').value);
    if (next.length === state.roster.length) throw Error('名前を入力してください。');
    if (!resetCurrent()) return;
    state.roster = next; $('bulk').value = ''; persist(); render(); notice(`${next.length}人の名簿になりました。`);
  }));
  $('add-one').addEventListener('click', () => doAction(() => {
    const next = core.person($('person-name').value, $('person-gender').value, $('strength-type').value, $('strength-value').value);
    if (state.roster.some(p => p.name === next.name)) throw Error('同じ名前が名簿にあります。');
    if (state.roster.length >= 256) throw Error('名簿は256人までです。');
    if (!resetCurrent()) return;
    state.roster.push(next); $('person-name').value = ''; $('strength-value').value = ''; persist(); render(); notice('参加者を追加しました。');
  }));
  $('roster-list').addEventListener('click', event => doAction(() => {
    const id = event.target.dataset.removePerson;
    if (!id || !resetCurrent()) return;
    state.roster = state.roster.filter(p => p.id !== id); persist(); render(); notice('参加者を名簿から外しました。');
  }));
  $('clear-roster').addEventListener('click', () => doAction(() => {
    if (!state.roster.length) return;
    if (!window.confirm('この端末の名簿を空にしますか？保存した結果は残ります。')) return;
    if (!resetCurrent()) return;
    state.roster = []; persist(); render(); notice('名簿を空にしました。');
  }));
  $('make-groups').addEventListener('click', () => doAction(() => {
    const groups = core.makeGroups(state.roster, $('group-size').value, {
      fixedText: $('fixed-groups').value, mixedGender: $('mixed-gender').checked,
      closeStrength: $('close-strength').checked, balancedStrength: $('balanced-strength').checked,
    });
    if (state.current && !window.confirm('現在の未保存の結果を置き換えますか？')) return;
    state.groups = groups; state.current = { kind: 'group', groups }; render(); notice(`${groups.length}組を作りました。`);
  }));
  $('use-groups').addEventListener('click', () => {
    state.mode = 'match'; $('match-source').value = 'groups'; persist(); render();
    notice('組番号を大会対戦の出場者に選びました。「対戦を作る」を押してください。');
  });
  $('make-match').addEventListener('click', () => doAction(() => {
    const source = $('match-source').value;
    const entries = source === 'groups' ? core.entriesFromGroups(state.groups) : core.entriesFromRoster(state.roster);
    const session = core.startMatch(entries, $('match-method').value);
    if (state.current && !window.confirm('現在の未保存の結果を置き換えますか？')) return;
    state.current = { kind: 'match', session }; render(); notice('第1回戦を作りました。');
  }));
  $('current-result').addEventListener('change', event => {
    if (event.target.dataset.pairIndex === undefined || state.current?.kind !== 'match') return;
    const pairs = state.current.session.rounds.at(-1).pairs;
    pairs[Number(event.target.dataset.pairIndex)].result = event.target.value;
  });
  $('current-result').addEventListener('click', event => doAction(() => {
    if (event.target.id !== 'next-round') return;
    state.current.session = core.nextRound(state.current.session);
    render(); notice(state.current.session.complete ? '優勝が決まりました。' : '次の回戦を作りました。');
  }));
  $('copy-result').addEventListener('click', () => doAction(() => {
    const output = currentResult(); if (!output) return;
    void copyText([output.title, ...output.lines].join('\n'), $('transfer-text'));
  }));
  $('save-result').addEventListener('click', () => doAction(() => {
    const output = currentResult(); if (!output) return;
    state.results = core.saveResult(state.results, output); persist(); render(); notice('結果を保存しました。最新5件を残します。');
  }));
  $('saved-results').addEventListener('click', event => {
    const result = state.results.find(r => r.id === event.target.dataset.copySaved);
    if (result) void copyText([result.title, ...result.lines].join('\n'), $('transfer-text'));
  });
  $('export-data').addEventListener('click', () => doAction(() => {
    void copyText(core.exportData(state.roster, state.results), $('transfer-text'));
  }));
  $('import-data').addEventListener('click', () => doAction(() => {
    const source = $('transfer-text').value;
    const data = core.importData(source);
    pendingImport = { source, data };
    const summary = $('import-preview'); summary.replaceChildren(); summary.hidden = false;
    summary.append(make('strong', `取り込み内容：名簿 ${data.roster.length}人、結果 ${data.results.length}件`));
    if (data.roster.length) summary.append(make('p', `参加者：${data.roster.map(p => p.name).join('、')}`));
    if (data.results.length) summary.append(make('p', `結果：${data.results.map(r => r.title).join('、')}`));
    summary.append(make('p', '取り込むと、この端末の名簿と保存した結果を置き換えます。', 'warning'));
    $('confirm-import').hidden = false;
  }));
  $('transfer-text').addEventListener('input', () => { pendingImport = null; $('import-preview').hidden = true; $('confirm-import').hidden = true; });
  $('confirm-import').addEventListener('click', () => doAction(() => {
    if (!pendingImport || $('transfer-text').value !== pendingImport.source) throw Error('転送文が変わりました。もう一度内容を確認してください。');
    if (!window.confirm(`この端末の名簿${state.roster.length}人・保存した結果${state.results.length}件を、確認した内容で置き換えますか？`)) return;
    state.roster = pendingImport.data.roster; state.results = pendingImport.data.results;
    state.groups = []; state.current = null; pendingImport = null;
    $('import-preview').hidden = true; $('confirm-import').hidden = true;
    persist(); render(); notice('名簿と結果を取り込みました。');
  }));
  window.addEventListener('openai:set_globals', event => {
    restoreWidget(event.detail?.globals?.widgetState);
    render();
  });
  render();
})();
