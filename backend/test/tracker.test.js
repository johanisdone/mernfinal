import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { makeServer } from '../src/server.js';
import { Application, CompanyCounter, prepareIndexes } from '../src/models/Application.js';
import { currentDay, followUpFor } from '../src/domain/calendar.js';

let database;
const app = makeServer();
const sample = () => ({ companyName: 'Infosys', jobRole: 'Frontend Developer', jobType: 'Full-time', appliedDate: currentDay(), expectedSalary: 600000, notes: 'Applied through the careers page.' });
before(async () => {
  database = await MongoMemoryServer.create({ binary: { version: '8.2.6' } });
  await mongoose.connect(database.getUri());
  await prepareIndexes();
});
beforeEach(async () => { await Promise.all([Application.deleteMany({}), CompanyCounter.deleteMany({})]); });
after(async () => { await mongoose.disconnect(); if (database) await database.stop(); });

test('Creation generates immutable identity, initial history, and seven-day follow-up', async () => {
  const result = await request(app).post('/api/applications').send(sample()).expect(201);
  const item = result.body.data;
  assert.deepEqual(Object.keys(result.body).sort(), ['data', 'message', 'success']);
  assert.equal(item.applicationId, 'JA-INF-001');
  assert.equal(item.status, 'Applied');
  assert.equal(item.followUpDate, followUpFor(currentDay()));
  assert.equal(item.statusHistory.length, 1);
  assert.equal(item.statusHistory[0].status, 'Applied');
  assert.equal(item.isOverdue, false);
  assert.deepEqual(item.nextStatuses, ['Interview', 'Rejected']);
  assert.equal(item.companyKey, undefined);
  assert.equal(await Application.countDocuments(), 1);
});

test('Case-insensitive active duplicates return 409 and concurrent duplicate insertions stay unique', async () => {
  await request(app).post('/api/applications').send(sample()).expect(201);
  await request(app).post('/api/applications').send({ ...sample(), companyName: '  INFOSYS  ', jobRole: ' frontend   developer ' }).expect(409);
  const results = await Promise.all(Array.from({ length: 4 }, () => request(app).post('/api/applications').send({ ...sample(), jobRole: 'Backend Developer' })));
  assert.equal(results.filter(result => result.status === 201).length, 1);
  assert.equal(results.filter(result => result.status === 409).length, 3);
  assert.equal(await Application.countDocuments(), 2);
});

test('Company counters increase, stay separate, and avoid shared-prefix collisions', async () => {
  const create = async values => (await request(app).post('/api/applications').send({ ...sample(), ...values }).expect(201)).body.data;
  const first = await create({});
  const next = await create({ companyName: 'INFOSYS', jobRole: 'QA Engineer' });
  const other = await create({ companyName: 'Acme Labs' });
  const samePrefix = await create({ companyName: 'Infotech' });
  assert.equal(first.applicationId, 'JA-INF-001');
  assert.equal(next.applicationId, 'JA-INF-002');
  assert.equal(other.applicationId, 'JA-ACM-001');
  assert.equal(samePrefix.applicationId, 'JA-INF-003');
});

test('Future and impossible dates, negative salary, invalid job types, and client-generated fields are rejected', async () => {
  for (const changes of [
    { appliedDate: followUpFor(currentDay()) }, { appliedDate: '2026-02-30' },
    { expectedSalary: -1 }, { jobType: 'Freelance' }, { applicationId: 'JA-ANY-001' },
    { status: 'Accepted' }, { isActive: false }, { followUpDate: '2026-01-01' },
    { companyName: { $ne: '' } }, { expectedSalary: true }
  ]) {
    const response = await request(app).post('/api/applications').send({ ...sample(), ...changes }).expect(400);
    assert.equal(response.body.success, false);
    assert.equal(typeof response.body.message, 'string');
  }
  assert.equal(await Application.countDocuments(), 0);
});

test('Company search and status filters combine, include literal regex text, and return counts for zero statuses', async () => {
  await request(app).post('/api/applications').send(sample()).expect(201);
  await request(app).post('/api/applications').send({ ...sample(), companyName: 'Acme Labs' }).expect(201);
  const list = await request(app).get('/api/applications?company=info&status=Applied').expect(200);
  assert.equal(list.body.data.items.length, 1);
  assert.equal((await request(app).get('/api/applications?company=%5B.*')).body.data.items.length, 0);
  const stats = (await request(app).get('/api/applications/stats').expect(200)).body.data;
  assert.equal(stats.counts.Applied, 2);
  assert.equal(stats.counts.Accepted, 0);
  assert.equal(Object.keys(stats.counts).length, 6);
  await request(app).get('/api/applications?limit=51').expect(400);
  await request(app).get('/api/applications?company[$ne]=x').expect(400);
});

test('Overdue is calculated from dates and calendar arithmetic crosses month and leap-day boundaries', async () => {
  assert.equal(followUpFor('2024-02-24'), '2024-03-02');
  assert.equal(followUpFor('2026-12-29'), '2027-01-05');
  const result = await request(app).post('/api/applications').send({ ...sample(), appliedDate: '2020-01-01' }).expect(201);
  assert.equal(result.body.data.isOverdue, true);
  const detail = await request(app).get('/api/applications/' + result.body.data._id).expect(200);
  assert.equal(detail.body.data.isOverdue, true);
});

const created = async values => (await request(app).post('/api/applications').send({ ...sample(), ...values }).expect(201)).body.data;
const move = (id, status, code = 200) => request(app).patch(`/api/applications/${id}/status`).send({ status }).expect(code);

test('Every permitted workflow branch appends timestamped history; all final stages remain locked', async () => {
  const routes = [
    ['Rejected'], ['Interview', 'Rejected'], ['Interview', 'Offer', 'Accepted'], ['Interview', 'Offer', 'Declined']
  ];
  for (let index = 0; index < routes.length; index++) {
    const item = await created({ jobRole: 'Workflow role ' + index });
    let last;
    for (const stage of routes[index]) last = (await move(item._id, stage)).body.data;
    assert.deepEqual(last.statusHistory.map(event => event.status), ['Applied', ...routes[index]]);
    assert.ok(last.statusHistory.every(event => Number.isFinite(Date.parse(event.changedAt))));
    assert.deepEqual(last.nextStatuses, []);
    await move(item._id, 'Applied', 400);
    await move(item._id, 'Interview', 400);
  }
});

test('Skipped, reverse, repeated, and client-forged status changes are rejected without changing history', async () => {
  const item = await created();
  for (const invalid of ['Applied', 'Offer', 'Accepted', 'Declined']) await move(item._id, invalid, 400);
  await request(app).patch(`/api/applications/${item._id}/status`).send({ status: 'Interview', changedAt: '2000-01-01' }).expect(400);
  await move(item._id, 'Interview');
  await move(item._id, 'Applied', 400);
  await move(item._id, 'Interview', 400);
  await move(item._id, 'Offer');
  await move(item._id, 'Rejected', 400);
  const stored = await Application.findById(item._id);
  assert.deepEqual(stored.statusHistory.map(event => event.status), ['Applied', 'Interview', 'Offer']);
});

test('Deletion is forbidden in Interview/Offer and allowed in Applied and every final stage', async () => {
  const direct = await created();
  await request(app).delete(`/api/applications/${direct._id}`).expect(200);
  for (const [index, ending] of ['Rejected', 'Accepted', 'Declined'].entries()) {
    const item = await created({ jobRole: `Delete role ${index}` });
    if (ending === 'Rejected') await move(item._id, ending);
    else {
      await move(item._id, 'Interview');
      await request(app).delete(`/api/applications/${item._id}`).expect(400);
      await move(item._id, 'Offer');
      await request(app).delete(`/api/applications/${item._id}`).expect(400);
      await move(item._id, ending);
    }
    await request(app).delete(`/api/applications/${item._id}`).expect(200);
  }
  assert.equal(await Application.countDocuments(), 0);
});

test('Editing changes permitted values but cannot alter applied date, issued ID, status, or history', async () => {
  const item = await created();
  const result = (await request(app).patch(`/api/applications/${item._id}`).send({ companyName: 'Acme Labs', jobRole: 'Junior Engineer', jobType: 'Contract', notes: 'Changed contact.', expectedSalary: null }).expect(200)).body.data;
  assert.equal(result.companyName, 'Acme Labs');
  assert.equal(result.applicationId, item.applicationId);
  assert.equal(result.appliedDate, item.appliedDate);
  assert.equal(result.followUpDate, item.followUpDate);
  assert.equal(result.expectedSalary, null);
  assert.equal(result.statusHistory.length, 1);
  for (const changes of [{ appliedDate: '2000-01-01' }, { applicationId: 'JA-FAK-900' }, { status: 'Accepted' }, { statusHistory: [] }, { followUpDate: '2000-01-01' }]) {
    await request(app).patch(`/api/applications/${item._id}`).send(changes).expect(400);
  }
});

test('Active duplicate edits fail; finalizing a record permits a fresh application with a higher sequence', async () => {
  const first = await created();
  const second = await created({ jobRole: 'Backend Engineer' });
  await request(app).patch(`/api/applications/${second._id}`).send({ jobRole: 'FRONTEND DEVELOPER' }).expect(409);
  await move(first._id, 'Rejected');
  const fresh = await created();
  assert.ok(Number(fresh.applicationId.slice(-3)) > Number(first.applicationId.slice(-3)));
  assert.equal(fresh.status, 'Applied');
  await request(app).patch(`/api/applications/${first._id}`).send({ notes: 'Final records remain editable.' }).expect(200);
});

test('Past applications lose overdue status after leaving Applied; follow-up day itself is not overdue', async () => {
  const old = await created({ appliedDate: '2020-01-01' });
  assert.equal((await move(old._id, 'Interview')).body.data.isOverdue, false);
  const sevenDaysAgo = new Date(currentDay() + 'T00:00:00Z');
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const dueToday = await created({ jobRole: 'Due today role', appliedDate: sevenDaysAgo.toISOString().slice(0, 10) });
  assert.equal(dueToday.followUpDate, currentDay());
  assert.equal(dueToday.isOverdue, false);
});

test('Concurrent status changes preserve a valid timeline without lost or duplicate events', async () => {
  const item = await created();
  const results = await Promise.all([
    request(app).patch(`/api/applications/${item._id}/status`).send({ status: 'Interview' }),
    request(app).patch(`/api/applications/${item._id}/status`).send({ status: 'Rejected' })
  ]);
  const stored = await Application.findById(item._id);
  assert.ok(results.some(result => result.status === 200));
  // If the second operation reads after the first, Interview -> Rejected is valid.
  assert.equal(stored.statusHistory.length, 1 + results.filter(result => result.status === 200).length);
  assert.notEqual(stored.statusHistory[0].status, stored.statusHistory[1].status);
});

test('Missing IDs, malformed JSON, and exhausted company numbers use consistent error envelopes', async () => {
  await request(app).get('/api/applications/not-valid').expect(400);
  const missing = new mongoose.Types.ObjectId();
  for (const method of ['get', 'patch', 'delete']) {
    let operation = request(app)[method](`/api/applications/${missing}`);
    if (method === 'patch') operation = operation.send({ notes: 'Missing record.' });
    const result = await operation.expect(404);
    assert.equal(result.body.success, false);
    assert.equal(result.body.data, null);
  }
  await CompanyCounter.create({ _id: 'infosys', value: 999 });
  const exhausted = await request(app).post('/api/applications').send(sample()).expect(409);
  assert.match(exhausted.body.message, /exhausted/);
  const malformed = await request(app).post('/api/applications').set('Content-Type', 'application/json').send('{').expect(400);
  assert.deepEqual(Object.keys(malformed.body).sort(), ['data', 'message', 'success']);
});
