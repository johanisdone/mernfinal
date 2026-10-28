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
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
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

  async function offeredOptions() {
    return page.locator('#next-status option:not([disabled])').allTextContents();
  }
  assert.deepEqual(await offeredOptions(), ['Interview', 'Rejected']);
  await page.getByLabel('Next status', { exact: true }).selectOption('Interview');
  await page.getByRole('button', { name: 'Update status', exact: true }).click();
  await page.getByText('2 events', { exact: true }).waitFor();
  assert.deepEqual(await offeredOptions(), ['Offer', 'Rejected']);
  const applicationId = (await Application.findById(addedId)).applicationId;
  assert.equal(await page.getByRole('button', { name: `Delete ${applicationId}`, exact: true }).isDisabled(), true);
  await page.getByLabel('Next status', { exact: true }).selectOption('Offer');
  await page.getByRole('button', { name: 'Update status', exact: true }).click();
  await page.getByText('3 events', { exact: true }).waitFor();
  assert.deepEqual(await offeredOptions(), ['Accepted', 'Declined']);
  assert.equal(await page.getByRole('button', { name: `Delete ${applicationId}`, exact: true }).isDisabled(), true);
  await capture('03-stage-timeline.png');
  checks.push('Only valid next statuses are offered; status changes persist with a visible timeline and disabled deletion in Interview/Offer.');
  await page.getByLabel('Next status', { exact: true }).selectOption('Accepted');
  await page.getByRole('button', { name: 'Update status', exact: true }).click();
  await page.getByText('Final status · no further changes', { exact: true }).waitFor();
  assert.equal(await page.locator('#next-status').count(), 0);
  assert.deepEqual((await Application.findById(addedId)).statusHistory.map(event => event.status), ['Applied', 'Interview', 'Offer', 'Accepted']);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: `Delete ${applicationId}`, exact: true }).click();
  assert.ok(await Application.findById(addedId));
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: `Delete ${applicationId}`, exact: true }).click();
  await page.getByText('Showing 1–9 of 9 applications').waitFor();
  assert.equal(await Application.findById(addedId), null);
  checks.push('Final status locks further changes; deletion asks for confirmation and honours both cancellation and approval.');

  await page.getByRole('link', { name: 'Add application', exact: true }).click();
  await page.getByLabel('Company name *', { exact: true }).fill('INFOSYS');
  await page.getByLabel('Job role *', { exact: true }).fill('frontend developer');
  await page.getByLabel('Applied date *', { exact: true }).fill(daysAgo(-2));
  await page.getByRole('button', { name: 'Save application', exact: true }).click();
  await page.getByText('Choose a valid date that is not in the future.').waitFor();
  await page.getByLabel('Applied date *', { exact: true }).fill(currentDay());
  await page.getByRole('button', { name: 'Save application', exact: true }).click();
  await page.getByText('You already have an active application for this company and role. Finish it before adding another.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Company name *', { exact: true }).inputValue(), 'INFOSYS');
  checks.push('Frontend rejects future dates and displays a backend 409 duplicate message without clearing the form.');

  for (let i = 0; i < 3; i++) await call('/applications', 'POST', { companyName: `Extra Company ${i}`, jobRole: 'Test pagination role', jobType: 'Contract', appliedDate: currentDay() });
  await page.getByRole('link', { name: 'NextStep home', exact: true }).click();
  await page.getByText('Showing 1–9 of 12 applications').waitFor();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await page.getByText('Showing 10–12 of 12 applications').waitFor();
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await page.getByText('Showing 1–9 of 12 applications').waitFor();
  await page.getByLabel('Search by company').fill('no-matching-company');
  await page.getByRole('button', { name: 'Search applications' }).click();
  await page.getByRole('heading', { name: 'No matches this time.' }).waitFor();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByText('Showing 1–9 of 12 applications').waitFor();
  checks.push('Pagination loads both pages; no-match search shows a helpful empty state.');

  const listOnly = url => url.pathname === '/api/applications';
  await page.route(listOnly, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Temporary test interruption. Please retry.', data: null }) }));
  await page.reload();
  await page.getByRole('heading', { name: 'A small detour.' }).waitFor();
  await page.unroute(listOnly);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByText('Showing 1–9 of 12 applications').waitFor();
  checks.push('A simulated API failure shows a retry control and retry recovers persisted results.');

  await page.setViewportSize({ width: 390, height: 844 });
  await capture('04-workspace-mobile.png');
  await page.goto(`${origin}/applications/${seeded[2]._id}`);
  await page.getByRole('heading', { name: 'Product Designer', exact: true }).waitFor();
  await capture('05-details-mobile.png');
  await page.reload();
  await page.getByRole('heading', { name: 'Product Designer', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Edit details', exact: true }).click();
  await page.getByRole('heading', { name: 'A little update.' }).waitFor();
  await capture('06-edit-mobile.png');
  checks.push('Dashboard, timeline, and form pass 390px layout/accessibility checks; detail deep-link refresh works.');

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
