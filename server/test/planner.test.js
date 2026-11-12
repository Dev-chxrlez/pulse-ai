import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createPlannerService, validDate, eventFields} from '../src/planner.js';

const tempDir = () => mkdtemp(path.join(tmpdir(), 'pulse-planner-'));

test('validDate accepts only real calendar dates', () => {
  assert.equal(validDate('2026-11-12'), '2026-11-12');
  assert.equal(validDate('2026-02-30'), null);
  assert.equal(validDate('12/11/2026'), null);
  assert.equal(validDate(undefined), null);
});

test('eventFields cleans input and rejects missing title or bad date', () => {
  assert.deepEqual(eventFields({title: '  Post:  reel ', date: '2026-11-14', time: '18:30', category: 'post', notes: 'x'}), {title: 'Post: reel', date: '2026-11-14', time: '18:30', category: 'post', notes: 'x'});
  assert.equal(eventFields({title: 'a', date: '2026-11-14', time: '25:00', category: 'nope'}).category, 'other');
  assert.equal(eventFields({title: 'a', date: '2026-11-14', time: '25:00'}).time, null);
  assert.throws(() => eventFields({title: '', date: '2026-11-14'}), /title/);
  assert.throws(() => eventFields({title: 'a', date: '2026-13-01'}), /date/);
});

test('manual events are added, sorted, updated and removed', async () => {
  const dataDir = await tempDir();
  try {
    const planner = await createPlannerService({dataDir, provider: {}});
    await planner.add({title: 'Later', date: '2026-11-20', category: 'post'});
    const first = await planner.add({title: 'Sooner', date: '2026-11-13', time: '09:00', category: 'brainstorm'});
    assert.deepEqual(planner.events().map(event => event.title), ['Sooner', 'Later']);
    await planner.update(first.id, {done: true, date: '2026-11-25'});
    assert.deepEqual(planner.events().map(event => [event.title, event.done]), [['Later', false], ['Sooner', true]]);
    await planner.remove(first.id);
    assert.equal(planner.events().length, 1);
    await assert.rejects(planner.remove(first.id), /no longer exists/);
  } finally { await rm(dataDir, {recursive: true, force: true}); }
});

test('chat applies valid POL actions, skips invalid ones and keeps history', async () => {
  const dataDir = await tempDir();
  try {
    let seen;
    const provider = {structured: async (_name, _schema, _instructions, input) => {
      seen = input;
      const existing = input.calendar[0];
      return {data: {reply: 'Added your posting days.', actions: [
        {type: 'add', id: null, title: 'Post: latte reel', date: '2026-11-14', time: '18:00', category: 'post', notes: 'Show the pour.'},
        {type: 'add', id: null, title: 'Bad date', date: '2026-02-31', time: null, category: 'post', notes: null},
        {type: 'remove', id: 'made-up', title: null, date: null, time: null, category: null, notes: null},
        ...(existing ? [{type: 'update', id: existing.id, title: null, date: '2026-11-16', time: null, category: null, notes: null}] : []),
      ]}};
    }};
    const planner = await createPlannerService({dataDir, provider, context: () => ({business: {name: 'Kape Kanto'}})});
    const old = await planner.add({title: 'Brainstorm', date: '2026-11-13', category: 'brainstorm'});
    const result = await planner.say('add a posting day this Saturday and move brainstorm to Monday', '2026-11-12');
    assert.equal(seen.todayWeekday, 'Thursday');
    assert.deepEqual(seen.businessContext, {business: {name: 'Kape Kanto'}});
    assert.equal(seen.message, 'add a posting day this Saturday and move brainstorm to Monday');
    assert.deepEqual(result.changes.map(change => change.type), ['add', 'update']);
    assert.equal(planner.events().find(event => event.id === old.id).date, '2026-11-16');
    assert.equal(planner.events().find(event => event.title === 'Post: latte reel').createdBy, 'pol');
    assert.deepEqual(planner.messages().map(message => message.from), ['you', 'pol']);
    assert.equal(planner.messages()[1].changes.length, 2);
    await planner.clearChat();
    assert.equal(planner.messages().length, 0);
  } finally { await rm(dataDir, {recursive: true, force: true}); }
});

test('chat without an AI key explains the setup', async () => {
  const dataDir = await tempDir();
  try {
    const planner = await createPlannerService({dataDir, apiKey: ''});
    await assert.rejects(planner.say('hello', '2026-11-12'), /OpenAI key/);
  } finally { await rm(dataDir, {recursive: true, force: true}); }
});
