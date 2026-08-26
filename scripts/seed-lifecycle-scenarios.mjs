import mongoose from '/Users/emeraldbarias/Git/fridge-planner/node_modules/mongoose/index.js';

const BASE = 'http://localhost:3001/api/v1';
const ADMIN = { 'x-user-id': 'maintainer', 'x-user-roles': 'admin', 'content-type': 'application/json' };

await mongoose.connect('mongodb://localhost:27017/fridge-planner');
const records = mongoose.connection.collection('feedbackrecords');
const items = mongoose.connection.collection('pipelineitems');

// Flush first, every time. Walking the scenarios CONSUMES them — B2 dismisses the item B1
// needs at `new`, C1 renames the item C2 looks for — so a seeder that appends leaves the
// second run failing on its own leftovers rather than on anything real.
await records.deleteMany({});
await items.deleteMany({});
console.log('  flushed feedback records and lifecycle items');

/** A complete record + its lifecycle item at `new`, exactly as FR-FL-001 would enqueue it. */
async function seed({ id, user, title, type, area, problem, given, when, then }) {
  const now = new Date();
  const rec = await records.insertOne({
    userId: user, status: 'complete', type, title, affectedArea: area,
    problemStatement: problem,
    acceptanceCriteria: [{ given, when, then }],
    expectedBehavior: then,
    actualBehavior: problem,
    transcript: [
      { role: 'user', content: problem, at: now },
      { role: 'agent', content: 'Thanks — I have what I need.', at: now },
    ],
    createdAt: now, updatedAt: now,
  });
  const it = await items.insertOne({
    userId: user, feedbackRecordId: String(rec.insertedId),
    sourceTitle: title, sourceType: type, sourceAffectedArea: area,
    stage: 'new', transitions: [], clauses: [], artifacts: [],
    createdAt: now, updatedAt: now,
  });
  return { scenario: id, id: String(it.insertedId), title, user };
}

/** `in-progress` advances only when a PR exists (FR-FL-067) — the one conditional edge. */
async function attachPr(id, n) {
  return act(id, {
    action: 'attach-artifact',
    artifact: { type: 'pull-request', ref: `https://github.com/emtabiraobarias/fridge-planner/pull/${n}` },
  });
}

async function act(id, body) {
  const res = await fetch(`${BASE}/admin/lifecycle/${id}`, {
    method: 'PATCH', headers: ADMIN, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${body.action} on ${id} → ${res.status} ${await res.text()}`);
  return res.json();
}

const SPECS = [
  ['S1', 'priya',  'Expiry badge says "expiring soon" for something already expired', 'bug', 'inventory',
   'A carton of milk with yesterday\'s date shows the amber "expiring soon" badge instead of the red expired one.',
   'an item whose expiry date is in the past', 'I open the Kitchen', 'it is shown as expired, not expiring soon'],
  ['S2', 'priya',  'Same expired-badge problem, reported twice', 'bug', 'inventory',
   'Milk that went off yesterday still shows as expiring soon rather than expired.',
   'an expired item', 'I look at the Kitchen', 'the badge reads expired'],
  ['S3', 'omar',   'Please add a dark mode', 'improvement', 'other',
   'Using the app at night is uncomfortably bright.',
   'the app at night', 'I open any screen', 'a dark theme is available'],
  ['S4', 'omar',   'Tapping the logo does nothing', 'bug', 'other',
   'The logo in the corner looks tappable but nothing happens.',
   'the header logo', 'I tap it', 'either it navigates home or it does not look tappable'],
  ['S5', 'lena',   'Grocery list keeps a row after I buy the item', 'bug', 'grocery',
   'I tick an item off, refresh, and the row is still there unticked.',
   'a purchased grocery row', 'I refresh the list', 'the row stays purchased'],
  ['S6', 'lena',   'Weekly plan drops the last meal on Sunday', 'bug', 'meal-plan',
   'Anything I plan for Sunday dinner disappears when the week rolls over.',
   'a meal planned for Sunday', 'the week rolls over', 'the meal is still there'],
  ['S7', 'tomas',  'Recommendations ignore what is about to expire', 'bug', 'recommendations',
   'I have spinach going off tomorrow and none of the six suggestions use it.',
   'an ingredient expiring tomorrow', 'I ask for recommendations', 'at least one suggestion uses it'],
  ['S8', 'tomas',  'Search misses accented characters', 'bug', 'inventory',
   'Searching "jalapeno" does not find the item I saved as "jalapeño".',
   'an item with an accent in its name', 'I search without the accent', 'the item is found'],
  ['S9', 'nadia',  'Quantity resets to 1 when I change the unit', 'bug', 'inventory',
   'Editing an item and switching from grams to kilograms silently resets the quantity.',
   'an item being edited', 'I change its unit', 'the quantity I typed is kept'],
  ['S10','nadia',  'No way to undo a completed shop', 'improvement', 'grocery',
   'If I hit checkout by accident the whole list is marked bought with no undo.',
   'a completed shop', 'I realise it was a mistake', 'I can reverse it'],
  ['S11','gus',    'Signed out unexpectedly mid-edit', 'bug', 'auth',
   'I lost a half-typed item when the session expired without warning.',
   'an expiring session', 'I am part-way through editing', 'I am warned before losing the edit'],
];

const seeded = [];
for (const [id, user, title, type, area, problem, given, when, then] of SPECS) {
  seeded.push(await seed({ id, user, title, type, area, problem, given, when, then }));
}
const by = (s) => seeded.find((x) => x.scenario === s);

// Walk each item to the stage where YOUR action is the next one.
await act(by('S2').id, { action: 'merge', targetId: by('S1').id });   // S2 → merged into S1
await act(by('S4').id, { action: 'dismiss', reason: 'no-action-required' });
await act(by('S5').id, { action: 'accept' });                          // → accepted
await act(by('S6').id, { action: 'accept' });
await act(by('S6').id, { action: 'advance' });                         // → briefed
await act(by('S7').id, { action: 'accept' });
await act(by('S7').id, { action: 'advance' });
await act(by('S7').id, { action: 'set-rank', rank: 1 });
await act(by('S8').id, { action: 'accept' });
await act(by('S8').id, { action: 'advance' });
await act(by('S8').id, { action: 'advance' });                         // → in-spec
await act(by('S8').id, {
  action: 'attach-artifact',
  artifact: { type: 'draft-spec', ref: 'specs/013-accented-search/spec.md' },
});
await act(by('S9').id, { action: 'accept' });
for (const a of ['advance', 'advance', 'approve-spec']) await act(by('S9').id, { action: a }); // → in-progress
await act(by('S10').id, { action: 'accept' });
for (const a of ['advance', 'advance', 'approve-spec']) await act(by('S10').id, { action: a });
await attachPr(by('S10').id, 101);
await act(by('S10').id, { action: 'advance' });                        // → in-review
await act(by('S11').id, { action: 'accept' });
for (const a of ['advance', 'advance', 'approve-spec']) await act(by('S11').id, { action: a });
await attachPr(by('S11').id, 102);
for (const a of ['advance', 'approve-release']) await act(by('S11').id, { action: a }); // → shipped

const final = await (await fetch(`${BASE}/admin/lifecycle`, { headers: ADMIN })).json();
const stageOf = Object.fromEntries(final.items.map((i) => [i._id, i.stage]));
console.log('\n  scenario  stage         reporter   title');
console.log('  ' + '-'.repeat(88));
for (const s of seeded) {
  console.log(`  ${s.scenario.padEnd(9)} ${(stageOf[s.id] ?? '?').padEnd(13)} ${s.user.padEnd(10)} ${s.title.slice(0, 46)}`);
}
await mongoose.disconnect();
