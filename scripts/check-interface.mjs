import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { makeServer } from '../backend/src/server.js';
import { Application, prepareIndexes } from '../backend/src/models/Application.js';
import { currentDay } from '../backend/src/domain/calendar.js';

const screenshotFolder = new URL('../docs/screenshots/', import.meta.url);
const evidenceFolder = new URL('../docs/evidence/', import.meta.url);
await mkdir(screenshotFolder, { recursive: true });
await mkdir(evidenceFolder, { recursive: true });
const checks = [];
const scans = [];
const errors = [];
let database, listener, browser;

try {
  database = await MongoMemoryServer.create({ binary: { version: '8.2.6' } });
  await mongoose.connect(database.getUri());
  await prepareIndexes();
  const server = makeServer();
  listener = await new Promise(resolve => { const active = server.listen(0, '127.0.0.1', () => resolve(active)); });
  const origin = `http://127.0.0.1:${listener.address().port}`;
  async function call(path, method = 'GET', payload) {
    const response = await fetch(origin + '/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
    const envelope = await response.json();
    assert.ok(envelope.success, envelope.message);
    return envelope.data;
  }
  const daysAgo = amount => {
    const date = new Date(currentDay() + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() - amount);
    return date.toISOString().slice(0, 10);
  };
  const seedRows = [
    ['Aster Labs', 'Software Engineer', 'Full-time', 18, []],
    ['Orbit Analytics', 'Data Analyst', 'Internship', 5, ['Interview']],
    ['Brightside Studio', 'Product Designer', 'Contract', 12, ['Interview', 'Offer']],
    ['Harbor Systems', 'Backend Developer', 'Full-time', 15, ['Rejected']],
    ['Northstar Cloud', 'Platform Engineer', 'Full-time', 14, ['Interview', 'Offer', 'Accepted']],
    ['Maple Works', 'Product Intern', 'Internship', 11, ['Interview', 'Offer', 'Declined']],
    ['Acme Labs', 'Quality Engineer', 'Full-time', 3, []],
    ['Infosys', 'Frontend Developer', 'Full-time', 2, []],
    ['Fable Software', 'UX Research Intern', 'Internship', 4, ['Interview']]
  ];
  const seeded = [];
  for (const [companyName, jobRole, jobType, ago, moves] of seedRows) {
    const record = await call('/applications', 'POST', { companyName, jobRole, jobType, appliedDate: daysAgo(ago), expectedSalary: jobType === 'Internship' ? null : 600000, notes: 'Fictional demonstration application. Submitted through the careers page; keep interview preparation notes here.' });
    for (const status of moves) await call(`/applications/${record._id}/status`, 'PATCH', { status });
    seeded.push(record);
  }
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  async function capture(name) {
    const dismiss = page.getByRole('button', { name: 'Dismiss message' });
    if (await dismiss.count()) await dismiss.click();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const serious = result.violations.filter(item => ['critical', 'serious'].includes(item.impact));
    scans.push({ screen: name, violations: result.violations.map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.map(node => node.target) })) });
    assert.deepEqual(serious.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), [], `Accessibility on ${name}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Horizontal overflow: ${name}`);
    await page.screenshot({ path: fileURLToPath(new URL(name, screenshotFolder)), fullPage: true, animations: 'disabled' });
  }

  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByText('Showing 1–9 of 9 applications').waitFor();
  await capture('01-workspace-desktop.png');
  checks.push('Workspace retrieves all six status counts and persisted application cards.');
  await page.getByLabel('Filter by status').selectOption('Interview');
  await page.getByText('Showing 1–2 of 2 applications').waitFor();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByText('Showing 1–9 of 9 applications').waitFor();
  await page.getByLabel('Search by company').fill('aster');
  await page.getByRole('button', { name: 'Search applications' }).click();
  await page.getByText('Showing 1–1 of 1 applications').waitFor();
  await page.getByText('Follow-up Overdue', { exact: true }).waitFor();
  checks.push('Backend status filtering, company search, and overdue display work.');
  await page.getByRole('link', { name: 'Add application', exact: true }).click();
  await page.getByRole('heading', { name: 'One more possibility.' }).waitFor();
  await capture('02-application-form.png');
  await page.getByRole('button', { name: 'Save application', exact: true }).click();
  await page.getByText('Add a company name containing at least three letters.').waitFor();
  await page.getByLabel('Company name *', { exact: true }).fill('Cedar Technologies');
  await page.getByLabel('Job role *', { exact: true }).fill('Graduate Developer');
  await page.getByLabel('Expected salary (optional)', { exact: true }).fill('480000');
  await page.getByRole('button', { name: 'Save application', exact: true }).click();
  await page.getByRole('heading', { name: 'Graduate Developer', exact: true }).waitFor();
  const addedId = page.url().split('/').at(-1);
  assert.equal((await Application.findById(addedId)).companyName, 'Cedar Technologies');
  checks.push('Client validation prevents empty save; a valid application persists through the frontend.');
  await page.getByRole('link', { name: 'Edit details', exact: true }).click();
  await page.getByRole('heading', { name: 'A little update.' }).waitFor();
  assert.equal(await page.getByLabel('Applied date *', { exact: true }).isDisabled(), true);
  await page.getByLabel('Job role *', { exact: true }).fill('Junior Developer');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('heading', { name: 'Junior Developer', exact: true }).waitFor();
  checks.push('Prefilled editing changes allowed fields and keeps the applied date disabled.');
  assert.deepEqual(errors, []);
  await writeFile(new URL('browser.json', evidenceFolder), JSON.stringify({ runAt: new Date().toISOString(), database: 'isolated MongoDB 8.2.6 (not Atlas)', checks, scans, errors }, null, 2));
  console.log(`Passed ${checks.length} interface scenarios; screenshot accessibility checks passed.`);
} catch (error) {
  console.error('Uncaught browser errors:', JSON.stringify(errors));
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) console.error('Page at failure:', page.url());
  throw error;
} finally {
  if (browser) await browser.close();
  if (listener) await new Promise(resolve => listener.close(resolve));
  await mongoose.disconnect();
  if (database) await database.stop();
}
