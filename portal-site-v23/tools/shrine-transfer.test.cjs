const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const corePath = path.join(__dirname, '../public/shrine/shrine-core.js');
vm.runInThisContext(fs.readFileSync(corePath, 'utf8'), { filename: corePath });
const core = globalThis.ShrineCore;

const roster = [
  core.person('参加者A', 'female', 'kyu', '1'),
  core.person('参加者B', 'male', 'point', '-10'),
  core.person('参加者C', '', 'dan', '2'),
];
const results = [
  { id: 't1', date: '2026-09-24T09:30:05.000Z', kind: 'tournament', title: 'トーナメント', lines: ['第1回戦', '1番 参加者A 対 2番 参加者B → 1番 参加者Aの勝ち', '優勝：1番 参加者A'] },
  { id: 's1', date: '2026-09-17T01:00:00.000Z', kind: 'swiss', title: 'スイス方式', lines: ['第1回戦', '1番 参加者A 対 2番 参加者B → 引き分け', '待機：3番 参加者C', '成績', '1番 参加者A 0.5点'] },
  { id: 'g1', date: '2026-09-16T23:00:00.000Z', kind: 'group', title: 'ペア・団体（1組）', lines: ['1番　参加者A・参加者B・参加者C'] },
];

const readable = core.exportReadableData(roster, results);
assert.match(readable, /^組み合わせ神社の転送文です。/);
assert.match(readable, /参加者は3人、保存した結果は3件あります。/);
assert.match(readable, /参加者Aが勝ちました。/);
assert.match(readable, /引き分けでした。/);
assert.match(readable, /待機でした。/);
assert.match(readable, /1番の組は/);
assert.doesNotMatch(readable, /"format"|"roster"|"results"/);

const imported = core.importTransferText(readable);
assert.equal(imported.roster.length, 3);
assert.equal(imported.roster[0].name, '参加者A');
assert.equal(imported.roster[0].gender, 'female');
assert.equal(imported.roster[1].strength.value, '-10');
assert.equal(imported.results.length, 3);
assert.deepEqual(imported.results.map(result => result.kind), ['tournament', 'swiss', 'group']);
assert.match(imported.results[0].lines.join(' '), /勝ちました/);
assert.match(imported.results[1].lines.join(' '), /引き分けでした/);
assert.match(imported.results[2].lines.join(' '), /1番の組は/);
assert.equal(core.importTransferText(core.exportData(roster, results)).roster.length, 3);
assert.equal(core.importTransferText(core.exportReadableData([], [])).roster.length, 0);
const unusual = core.person('参加者。棋力は特別', '', '', '');
const unusualResult = { id: 'custom', date: '2026-09-24T09:30:05.000Z', kind: 'tournament', title: '交流の記録', lines: ['', '備考の前半\n備考の後半', '記号\\nもそのまま'] };
const unusualImported = core.importTransferText(core.exportReadableData([unusual], [unusualResult]));
assert.equal(unusualImported.roster[0].name, unusual.name);
assert.equal(unusualImported.results[0].title, unusualResult.title);
assert.equal(unusualImported.results[0].kind, unusualResult.kind);
assert.deepEqual(unusualImported.results[0].lines, unusualResult.lines);
assert.throws(() => core.importTransferText(readable.replace('参加者は3人', '参加者は4人')));
assert.throws(() => core.importTransferText(readable.replace('2026年9月24日', '2026年2月31日')));
assert.throws(() => core.importTransferText('任意の文章'));

console.log('Japanese shrine transfer: roundtrip, legacy JSON, result types, and invalid text PASS');
