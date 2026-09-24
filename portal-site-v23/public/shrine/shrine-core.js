(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ShrineCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_RESULTS = 5;
  const MAX_PEOPLE = 256;
  const cleanName = value => String(value ?? '').trim().replace(/\s+/g, ' ');
  const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function strength(type, raw) {
    const value = String(raw ?? '').trim().replace(/－/g, '-');
    if (!type) {
      if (value) throw Error('棋力の種類を選んでください。');
      return { type: '', value: '', score: null };
    }
    if (!value) throw Error('棋力の数値を入力してください。');
    if (type === 'point') {
      if (!/^-?\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) {
        throw Error('点数は数値で入力してください。マイナスも使えます。');
      }
      return { type, value: String(Number(value)), score: Number(value) };
    }
    if (!/^[1-9]\d*$/.test(value)) throw Error('段・級は1以上の整数で入力してください。');
    const n = Number(value);
    if (type === 'dan' && n <= 9) return { type, value: String(n), score: 1000 + n * 100 };
    if (type === 'kyu' && n <= 30) return { type, value: String(n), score: 1000 - n * 40 };
    throw Error(type === 'dan' ? '段は1～9で入力してください。' : '級は1～30で入力してください。');
  }

  function person(name, gender = '', type = '', value = '') {
    name = cleanName(name);
    if (!name || name.length > 80) throw Error('名前は1～80文字で入力してください。');
    if (!['', 'female', 'male'].includes(gender)) throw Error('性別の値を確認してください。');
    return { id: uid(), name, gender, strength: strength(type, value) };
  }

  function addPeople(roster, names) {
    const existing = new Set(roster.map(p => p.name));
    const result = [...roster];
    for (const line of String(names).split(/\r?\n/)) {
      const name = cleanName(line);
      if (!name) continue;
      if (existing.has(name)) throw Error(`「${name}」は名簿にあります。`);
      result.push(person(name));
      existing.add(name);
      if (result.length > MAX_PEOPLE) throw Error('名簿は256人までです。');
    }
    return result;
  }

  function entry(label, id) { return { id, label, score: 0, opponents: [] }; }
  function entriesFromRoster(roster) {
    if (roster.length < 2) throw Error('参加者を2人以上登録してください。');
    return roster.map((p, i) => entry(`${i + 1}番 ${p.name}`, p.id));
  }
  function entriesFromGroups(groups) {
    if (groups.length < 2) throw Error('大会対戦には2組以上必要です。');
    return groups.map((g, i) => entry(`${i + 1}番 ${g.map(p => p.name).join('・')}`, `group-${i + 1}`));
  }

  function parseFixedGroups(text, roster, maxSize) {
    const byName = new Map(roster.map(p => [p.name, p]));
    const seen = new Set();
    return String(text || '').split(/\r?\n/).map(line => line.split(/[、,，・/／]+/).map(cleanName).filter(Boolean))
      .filter(group => group.length).map(group => {
        if (group.length < 2 || group.length > maxSize) throw Error('決まっている組は2人以上、指定した人数以下にしてください。');
        return group.map(name => {
          const p = byName.get(name);
          if (!p) throw Error(`「${name}」は名簿にありません。`);
          if (seen.has(p.id)) throw Error(`「${name}」が複数の組に入っています。`);
          seen.add(p.id);
          return p;
        });
      });
  }

  function makeGroups(roster, maxSize, options = {}) {
    maxSize = Number(maxSize);
    if (!Number.isInteger(maxSize) || maxSize < 2 || maxSize > 16) throw Error('1組の人数は2～16人にしてください。');
    if (roster.length < 2) throw Error('参加者を2人以上登録してください。');
    const fixed = parseFixedGroups(options.fixedText, roster, maxSize);
    const used = new Set(fixed.flat().map(p => p.id));
    let free = roster.filter(p => !used.has(p.id));
    if (options.closeStrength) free = [...free].sort((a, b) => (a.strength.score ?? 0) - (b.strength.score ?? 0));
    if (options.mixedGender && !options.closeStrength) {
      const women = free.filter(p => p.gender === 'female');
      const men = free.filter(p => p.gender === 'male');
      const unknown = free.filter(p => !p.gender);
      free = [];
      while (women.length || men.length) {
        if (women.length) free.push(women.shift());
        if (men.length) free.push(men.shift());
      }
      free.push(...unknown);
    }
    const groupCount = Math.ceil(free.length / maxSize);
    if (free.length === 1) throw Error('1人だけ余ります。決まっている組か人数を調整してください。');
    if (groupCount && Math.floor(free.length / groupCount) < 2) throw Error('1人組ができます。人数を調整してください。');
    const generated = Array.from({ length: groupCount }, () => []);
    if (options.balancedStrength && groupCount > 1) {
      free = [...free].sort((a, b) => (b.strength.score ?? 0) - (a.strength.score ?? 0));
      free.forEach((p, i) => {
        const row = Math.floor(i / groupCount);
        const column = i % groupCount;
        generated[row % 2 ? groupCount - 1 - column : column].push(p);
      });
    } else {
      free.forEach((p, i) => generated[i % groupCount].push(p));
    }
    return [...fixed, ...generated];
  }

  function pairAdjacent(entries) {
    const pairs = [];
    for (let i = 0; i < entries.length - 1; i += 2) pairs.push({ a: entries[i].id, b: entries[i + 1].id, result: '' });
    return { pairs, bye: entries.length % 2 ? entries.at(-1).id : null };
  }

  function swissRound(entries, rounds) {
    const sorted = [...entries].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'ja'));
    let bye = null;
    if (sorted.length % 2) {
      const candidate = [...sorted].reverse().find(e => !rounds.some(r => r.bye === e.id)) || sorted.at(-1);
      bye = candidate.id;
      sorted.splice(sorted.indexOf(candidate), 1);
    }
    const pairs = [];
    while (sorted.length) {
      const a = sorted.shift();
      let index = sorted.findIndex(b => !a.opponents.includes(b.id));
      if (index < 0) index = 0;
      const b = sorted.splice(index, 1)[0];
      pairs.push({ a: a.id, b: b.id, result: '' });
    }
    return { pairs, bye };
  }

  function startMatch(entries, method) {
    if (entries.length < 2) throw Error('対戦には2人または2組以上必要です。');
    if (!['tournament', 'swiss'].includes(method)) throw Error('対戦方式を選んでください。');
    const all = entries.map(e => ({ ...e, opponents: [] }));
    return { method, entries: all, rounds: [method === 'tournament' ? pairAdjacent(all) : swissRound(all, [])], complete: false };
  }

  function nextRound(session) {
    if (session.complete) throw Error('対戦は終了しています。');
    const latest = session.rounds.at(-1);
    if (latest.pairs.some(p => !p.result)) throw Error('すべての対戦結果を選んでください。');
    const entries = session.entries.map(e => ({ ...e, opponents: [...e.opponents] }));
    const byId = new Map(entries.map(e => [e.id, e]));
    const winners = [];
    for (const pair of latest.pairs) {
      const a = byId.get(pair.a), b = byId.get(pair.b);
      if (!a || !b || !['a', 'b', 'draw'].includes(pair.result)) throw Error('対戦結果を確認してください。');
      a.opponents.push(b.id); b.opponents.push(a.id);
      if (pair.result === 'draw') {
        if (session.method === 'tournament') throw Error('トーナメントでは勝者を選んでください。');
        a.score += 0.5; b.score += 0.5;
      } else {
        const winner = pair.result === 'a' ? a : b;
        winner.score += 1;
        winners.push(winner);
      }
    }
    if (latest.bye) {
      const waiting = byId.get(latest.bye);
      waiting.score += 1;
      winners.push(waiting);
    }
    if (session.method === 'tournament') {
      if (winners.length === 1) return { ...session, entries, complete: true, winnerId: winners[0].id };
      return { ...session, entries, rounds: [...session.rounds, pairAdjacent(winners)] };
    }
    return { ...session, entries, rounds: [...session.rounds, swissRound(entries, session.rounds)] };
  }

  function saveResult(results, result) {
    if (!result || !['tournament', 'swiss', 'group'].includes(result.kind) || !Array.isArray(result.lines)) throw Error('保存する結果を確認してください。');
    return [{ id: uid(), date: new Date().toISOString(), kind: result.kind, title: result.title, lines: result.lines.map(String) }, ...results].slice(0, MAX_RESULTS);
  }

  function exportData(roster, results) {
    return JSON.stringify({ format: 'suiyoukai-shrine-transfer', version: 1, roster, results: results.slice(0, MAX_RESULTS) }, null, 2);
  }
  function importData(text) {
    if (typeof text !== 'string' || text.length > 2000000) throw Error('転送文が長すぎます。');
    let data;
    try { data = JSON.parse(text); } catch { throw Error('転送文を読み取れません。'); }
    if (!data || data.format !== 'suiyoukai-shrine-transfer' || data.version !== 1 || !Array.isArray(data.roster) || !Array.isArray(data.results)) throw Error('組み合わせ神社の転送文ではありません。');
    if (data.roster.length > MAX_PEOPLE || data.results.length > MAX_RESULTS) throw Error('名簿または結果の件数が多すぎます。');
    const names = new Set();
    const personIds = new Set();
    const roster = data.roster.map(p => {
      if (typeof p?.id !== 'string' || p.id.length > 120) throw Error('名簿の形式が違います。');
      if (personIds.has(p.id)) throw Error('名簿に同じ識別子があります。');
      const checked = person(p.name, p.gender, p.strength?.type, p.strength?.value);
      if (names.has(checked.name)) throw Error('名簿に同じ名前があります。');
      personIds.add(p.id);
      names.add(checked.name);
      return { ...checked, id: p.id };
    });
    const resultIds = new Set();
    const results = data.results.map(r => {
      if (typeof r?.id !== 'string' || typeof r.date !== 'string' || !['tournament', 'swiss', 'group'].includes(r.kind) || typeof r.title !== 'string' || r.title.length > 120 || !Array.isArray(r.lines) || r.lines.length > MAX_PEOPLE || !r.lines.every(line => typeof line === 'string' && line.length <= 300)) throw Error('結果の形式が違います。');
      if (resultIds.has(r.id)) throw Error('同じ結果が重複しています。');
      resultIds.add(r.id);
      return { id: r.id, date: r.date, kind: r.kind, title: r.title, lines: r.lines };
    });
    return { roster, results };
  }

  const transferHeading = '組み合わせ神社の転送文です。';
  const transferGuide = 'この文章をすべてコピーして、別の端末の転送欄に貼り付けてください。';

  function readableLine(line) {
    let prose = line;
    if (/^第\d+回戦$/.test(line)) prose = `${line}です。`;
    else if (line === '成績') prose = '成績は次のとおりです。';
    else if (line.startsWith('待機：')) prose = `${line.slice(3)}は待機でした。`;
    else if (line.startsWith('優勝：')) prose = `優勝は${line.slice(3)}です。`;
    else if (/^\d+番　/.test(line)) {
      const divider = line.indexOf('　');
      prose = `${line.slice(0, divider)}の組は${line.slice(divider + 1).replace(/・/g, 'と')}です。`;
    } else if (line.includes(' 対 ')) {
      const [pair, outcome = ''] = line.split(' → ');
      const divider = pair.indexOf(' 対 ');
      if (divider > 0) {
        const first = pair.slice(0, divider);
        const second = pair.slice(divider + 3);
        const ending = outcome === '引き分け' ? '引き分けでした。'
          : outcome.endsWith('の勝ち') ? `${outcome.slice(0, -3)}が勝ちました。`
            : '対局しました。';
        prose = `${first}と${second}が対局し、${ending}`;
      }
    } else if (/^.+ -?\d+(?:\.\d+)?点$/.test(line)) {
      const divider = line.lastIndexOf(' ');
      prose = `${line.slice(0, divider)}は${line.slice(divider + 1)}です。`;
    }
    return prose.length <= 300 ? prose : line;
  }

  function readableResult(result) {
    return [`${result.title}の結果です。`, ...result.lines.map(readableLine)].join('\n');
  }

  function escapeTransferField(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n')
      .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  }

  function unescapeTransferField(value) {
    if (/\\(?!\\|n|r|u2028|u2029|u3002)/.test(value)) throw Error('転送文の文字を確認してください。');
    return value.replace(/\\(u2028|u2029|u3002|n|r|\\)/g, (_, token) => ({
      n: '\n', r: '\r', u2028: '\u2028', u2029: '\u2029', u3002: '。', '\\': '\\',
    })[token]);
  }

  function exportReadableData(roster, results) {
    const checked = importData(exportData(roster, results));
    const lines = [
      transferHeading,
      `参加者は${checked.roster.length}人、保存した結果は${checked.results.length}件あります。`,
      transferGuide,
      '', '参加者',
    ];
    for (const [index, p] of checked.roster.entries()) {
      const gender = p.gender === 'female' ? '。性別は女性です' : p.gender === 'male' ? '。性別は男性です' : '';
      const strength = p.strength.type ? `${String(p.strength.value).replace('-', '－')}${{ point: '点', dan: '段', kyu: '級' }[p.strength.type]}` : '登録されていません';
      const name = escapeTransferField(p.name).replace(/。/g, '\\u3002');
      lines.push(`${index + 1}人目：${name}${gender}。棋力は${strength}${p.strength.type ? 'です。' : '。'}`);
    }
    if (!checked.roster.length) lines.push('参加者はまだいません。');
    lines.push('', '保存した結果');
    for (const [index, result] of checked.results.entries()) {
      const date = new Date(result.date);
      if (Number.isNaN(date.valueOf())) throw Error('結果の保存日時を確認してください。');
      const parts = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }).formatToParts(date);
      const value = type => Number(parts.find(part => part.type === type)?.value);
      const when = `${value('year')}年${value('month')}月${value('day')}日${value('hour')}時${value('minute')}分${value('second')}秒`;
      lines.push(`${index + 1}件目は、${when}に保存した${escapeTransferField(result.title)}の結果です。`);
      const standardTitle = result.kind === 'tournament' ? 'トーナメント' : result.kind === 'swiss' ? 'スイス方式' : /^ペア・団体（\d+組）$/.test(result.title) ? result.title : '';
      if (result.title !== standardTitle) lines.push(`種類は${{ tournament: 'トーナメント', swiss: 'スイス方式', group: 'ペア・団体' }[result.kind]}です。`);
      for (const item of result.lines) lines.push(`・${escapeTransferField(readableLine(item))}`);
      lines.push('');
    }
    if (!checked.results.length) lines.push('保存した結果はまだありません。');
    return lines.join('\n').trimEnd();
  }

  function importTransferText(text) {
    if (typeof text !== 'string' || text.length > 2000000) throw Error('転送文が長すぎます。');
    if (text.trimStart().startsWith('{')) return importData(text);
    const lines = text.replace(/\r\n?/g, '\n').trim().split('\n');
    if (lines.shift() !== transferHeading) throw Error('組み合わせ神社の転送文ではありません。');
    const count = /^参加者は(\d+)人、保存した結果は(\d+)件あります。$/.exec(lines.shift() || '');
    if (!count || Number(count[1]) > MAX_PEOPLE || Number(count[2]) > MAX_RESULTS || lines.shift() !== transferGuide || lines.shift() !== '' || lines.shift() !== '参加者') {
      throw Error('転送文の内容を確認してください。');
    }
    const roster = [];
    for (let i = 0; i < Number(count[1]); i++) {
      const row = lines.shift() || '';
      const prefix = `${i + 1}人目：`;
      const divider = row.lastIndexOf('。棋力は');
      const ending = row.endsWith('登録されていません。') ? '。' : 'です。';
      if (!row.startsWith(prefix) || divider < prefix.length || !row.endsWith(ending)) throw Error('参加者の転送文を確認してください。');
      let nameAndGender = row.slice(prefix.length, divider);
      const strengthLabel = row.slice(divider + 4, -ending.length);
      let gender = '';
      const genderMatch = /^(.*)。性別は(女性|男性)です$/.exec(nameAndGender);
      if (genderMatch) {
        nameAndGender = genderMatch[1];
        gender = genderMatch[2] === '女性' ? 'female' : 'male';
      }
      let type = '';
      let strengthValue = '';
      if (strengthLabel !== '登録されていません') {
        const match = /^([－-]?\d+(?:\.\d+)?)(点|段|級)$/.exec(strengthLabel);
        if (!match) throw Error('参加者の棋力を確認してください。');
        strengthValue = match[1].replace('－', '-');
        type = { '点': 'point', '段': 'dan', '級': 'kyu' }[match[2]];
      }
      roster.push(person(unescapeTransferField(nameAndGender), gender, type, strengthValue));
    }
    if (!roster.length && lines.shift() !== '参加者はまだいません。') throw Error('参加者の転送文を確認してください。');
    if (lines.shift() !== '' || lines.shift() !== '保存した結果') throw Error('結果の転送文を確認してください。');
    const results = [];
    for (let i = 0; i < Number(count[2]); i++) {
      const row = lines.shift() || '';
      const match = new RegExp(`^${i + 1}件目は、(\\d{4})年(\\d{1,2})月(\\d{1,2})日(\\d{1,2})時(\\d{1,2})分(\\d{1,2})秒に保存した(.+)の結果です。$`).exec(row);
      if (!match) throw Error('結果の日時を確認してください。');
      const [, year, month, day, hour, minute, second, encodedTitle] = match;
      const title = unescapeTransferField(encodedTitle);
      let kind = title === 'トーナメント' ? 'tournament' : title === 'スイス方式' ? 'swiss' : /^ペア・団体（\d+組）$/.test(title) ? 'group' : '';
      if (lines[0]?.startsWith('種類は')) {
        const label = /^種類は(トーナメント|スイス方式|ペア・団体)です。$/.exec(lines.shift());
        if (!label) throw Error('結果の種類を確認してください。');
        kind = { 'トーナメント': 'tournament', 'スイス方式': 'swiss', 'ペア・団体': 'group' }[label[1]];
      }
      if (!kind) throw Error('結果の種類を確認してください。');
      const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 9, Number(minute), Number(second));
      if (!Number.isFinite(timestamp) || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31 || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) throw Error('結果の日時を確認してください。');
      const dateValue = new Date(timestamp);
      const dateParts = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }).formatToParts(dateValue);
      for (const [type, expected] of [['year', year], ['month', month], ['day', day], ['hour', hour], ['minute', minute], ['second', second]]) {
        if (Number(dateParts.find(part => part.type === type)?.value) !== Number(expected)) throw Error('結果の日時を確認してください。');
      }
      const date = dateValue.toISOString();
      const resultLines = [];
      while (lines.length && lines[0] !== '') {
        const line = lines.shift();
        if (!line.startsWith('・')) throw Error('対局結果の転送文を確認してください。');
        resultLines.push(unescapeTransferField(line.slice(1)));
      }
      if (resultLines.length > MAX_PEOPLE) throw Error('対局結果の件数が多すぎます。');
      results.push({ id: uid(), date, kind, title, lines: resultLines });
      if (lines[0] === '') lines.shift();
    }
    if (!results.length && lines.shift() !== '保存した結果はまだありません。') throw Error('結果の転送文を確認してください。');
    if (lines.some(line => line !== '')) throw Error('転送文の末尾を確認してください。');
    const names = new Set(roster.map(p => p.name));
    if (names.size !== roster.length) throw Error('名簿に同じ名前があります。');
    return importData(exportData(roster, results));
  }

  return { strength, person, addPeople, entriesFromRoster, entriesFromGroups, makeGroups, startMatch, nextRound, saveResult, exportData, importData, readableResult, exportReadableData, importTransferText };
});
