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
