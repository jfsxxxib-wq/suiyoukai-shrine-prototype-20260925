const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./shrine-core.js');

const roster = count => Array.from({ length: count }, (_, i) => core.person(`参加者${i + 1}`));

test('点数はマイナスを受け付け、段級も保持する', () => {
  assert.equal(core.strength('point', '-10').score, -10);
  assert.equal(core.strength('point', '100').score, 100);
  assert.equal(core.strength('dan', '3').score, 1300);
  assert.equal(core.strength('kyu', '5').score, 800);
  assert.throws(() => core.strength('dan', '-1'));
});

test('16人組を作り、組番号を大会対戦へ渡せる', () => {
  const groups = core.makeGroups(roster(32), 16);
  assert.deepEqual(groups.map(group => group.length), [16, 16]);
  const entries = core.entriesFromGroups(groups);
  assert.match(entries[0].label, /^1番/);
  assert.match(entries[1].label, /^2番/);
  const session = core.startMatch(entries, 'tournament');
  assert.equal(session.rounds[0].pairs.length, 1);
});

test('トーナメントは待機と勝者を次の回戦へ進める', () => {
  let session = core.startMatch(core.entriesFromRoster(roster(3)), 'tournament');
  assert.equal(session.rounds[0].bye !== null, true);
  session.rounds[0].pairs[0].result = 'a';
  session = core.nextRound(session);
  assert.equal(session.rounds[1].pairs.length, 1);
  session.rounds[1].pairs[0].result = 'b';
  session = core.nextRound(session);
  assert.equal(session.complete, true);
  assert.equal(session.winnerId, session.rounds[1].pairs[0].b);
});

test('スイス方式は可能なら再対戦を避け、点数を付ける', () => {
  let session = core.startMatch(core.entriesFromRoster(roster(4)), 'swiss');
  const first = session.rounds[0].pairs.map(pair => [pair.a, pair.b].sort().join('|'));
  session.rounds[0].pairs.forEach(pair => { pair.result = 'draw'; });
  session = core.nextRound(session);
  assert(session.entries.every(entry => entry.score === 0.5));
  const second = session.rounds[1].pairs.map(pair => [pair.a, pair.b].sort().join('|'));
  assert(second.every(pair => !first.includes(pair)));
});

test('結果は最新5件、転送の形式と件数を検証する', () => {
  let results = [];
  for (let i = 0; i < 7; i++) results = core.saveResult(results, { kind: 'group', title: `結果${i}`, lines: [`${i}`] });
  assert.equal(results.length, 5);
  assert.equal(results[0].title, '結果6');
  const people = roster(2);
  const imported = core.importData(core.exportData(people, results));
  assert.equal(imported.roster.length, 2);
  assert.equal(imported.results.length, 5);
  assert.throws(() => core.importData('{"format":"wrong"}'));
  assert.throws(() => core.importData(core.exportData([...people, people[0]], results)));
});
