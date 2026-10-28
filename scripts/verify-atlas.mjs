// A targeted real-Atlas/browser check. Only its own uniquely named fixture is cleaned up.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { chromium } from 'playwright';
import { makeServer } from '../backend/src/server.js';
import { Application, CompanyCounter, prepareIndexes } from '../backend/src/models/Application.js';
import { currentDay } from '../backend/src/domain/calendar.js';

dotenv.config({ path: fileURLToPath(new URL('../backend/.env', import.meta.url)) });
let address;
try { address = new URL(process.env.MONGODB_URI || ''); } catch { /* handled without printing credentials */ }
if (!address || address.protocol !== 'mongodb+srv:' || address.pathname !== '/mernfinal_exam') {
  console.error('Atlas verification needs an exam-only mongodb+srv URI for /mernfinal_exam in backend/.env. No connection attempted.');
  process.exit(1);
}
if (!existsSync(new URL('../frontend/dist/index.html', import.meta.url))) {
  console.error('Run npm run build before verifying the Atlas-connected frontend.');
  process.exit(1);
}

const code = [...randomBytes(5)].map(value => String.fromCharCode(65 + value % 26)).join('');
const company = `${code} Verification ${Date.now()}`;
const role = 'Temporary integration check';
const checks = [];
let listener, browser, createdId;
const referenceDate = new Date(currentDay() + 'T00:00:00Z');
referenceDate.setUTCDate(referenceDate.getUTCDate() - 10);
const appliedDate = referenceDate.toISOString().slice(0, 10);

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 12000 });
  await prepareIndexes();
  const server = makeServer();
  listener = await new Promise(resolve => { const active = server.listen(0, '127.0.0.1', () => resolve(active)); });
  const origin = `http://127.0.0.1:${listener.address().port}`;
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'New application', exact: true }).click();
  await page.getByLabel('Company name *', { exact: true }).fill(company);
  await page.getByLabel('Job role *', { exact: true }).fill(role);
  await page.getByLabel('Applied date *', { exact: true }).fill(appliedDate);
  await page.getByLabel('Notes (optional)', { exact: true }).fill('Temporary automated exam integration fixture; removed after verification.');
  await page.getByRole('button', { name: 'Save application', exact: true }).click();
  await page.getByRole('heading', { name: role, exact: true }).waitFor();
  createdId = page.url().split('/').at(-1);
  const stored = await Application.findById(createdId);
  assert.equal(stored.companyName, company);
  assert.equal(stored.appliedDate, appliedDate);
  await page.getByText('Follow-up Overdue', { exact: true }).waitFor();
  checks.push('Frontend create persisted to MongoDB Atlas, with backend ID, Applied status, history, and overdue date.');

  await page.getByRole('link', { name: 'Edit details', exact: true }).click();
  assert.equal(await page.getByLabel('Applied date *', { exact: true }).isDisabled(), true);
  await page.getByLabel('Job role *', { exact: true }).fill(role + ' updated');
  await page.getByLabel('Expected salary (optional)', { exact: true }).fill('450000');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('heading', { name: role + ' updated', exact: true }).waitFor();
  const edited = await Application.findById(createdId);
  assert.equal(edited.jobRole, role + ' updated');
  assert.equal(edited.applicationId, stored.applicationId);
  assert.equal(edited.appliedDate, appliedDate);
  checks.push('Prefilled frontend edit persisted to Atlas without changing issued ID or applied date.');

  await page.getByRole('link', { name: 'New application', exact: true }).click();
  await page.getByLabel('Company name *', { exact: true }).fill(company.toUpperCase());
  await page.getByLabel('Job role *', { exact: true }).fill((role + ' updated').toUpperCase());
  await page.getByRole('button', { name: 'Save application', exact: true }).click();
  await page.getByText('You already have an active application for this company and role. Finish it before adding another.', { exact: true }).waitFor();
  assert.equal(await Application.countDocuments({ companyKey: company.toLowerCase(), isActive: true }), 1);
  checks.push('Atlas-backed duplicate rule returned a visible form error for differently cased values.');

  await page.goto(`${origin}/applications/${createdId}`, { waitUntil: 'networkidle' });
  await page.getByLabel('Next status', { exact: true }).selectOption('Interview');
  await page.getByRole('button', { name: 'Update status', exact: true }).click();
  await page.getByText('2 events', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: `Delete ${stored.applicationId}`, exact: true }).isDisabled(), true);
  const blocked = await fetch(`${origin}/api/applications/${createdId}`, { method: 'DELETE' });
  assert.equal(blocked.status, 400);
  await page.getByLabel('Next status', { exact: true }).selectOption('Offer');
  await page.getByRole('button', { name: 'Update status', exact: true }).click();
  await page.getByText('3 events', { exact: true }).waitFor();
  assert.equal((await Application.findById(createdId)).status, 'Offer');
  checks.push('Frontend stage updates and timeline persisted to Atlas; deletion during Interview was rejected.');

  await page.getByLabel('Next status', { exact: true }).selectOption('Declined');
  await page.getByRole('button', { name: 'Update status', exact: true }).click();
  await page.getByText('Final status · no further changes', { exact: true }).waitFor();
  assert.deepEqual((await Application.findById(createdId)).statusHistory.map(event => event.status), ['Applied', 'Interview', 'Offer', 'Declined']);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: `Delete ${stored.applicationId}`, exact: true }).click();
  await page.getByRole('heading', { name: 'Your applications', exact: false }).waitFor();
  assert.equal(await Application.findById(createdId), null);
  checks.push('A final status locked the workflow; confirmed frontend deletion removed the Atlas record.');
  assert.deepEqual(pageErrors, []);

  const folder = new URL('../docs/evidence/', import.meta.url);
  await mkdir(folder, { recursive: true });
  await writeFile(new URL('atlas.json', folder), JSON.stringify({ verified: true, runAt: new Date().toISOString(), database: 'MongoDB Atlas / mernfinal_exam', checks, pageErrors, fixtureCleanup: 'Only the uniquely named verification fixture and counter were removed.' }, null, 2));
  console.log(`Atlas verification passed: ${checks.length} frontend/backend/database scenarios. Credentials were not printed.`);
} catch (error) {
  console.error('Atlas verification did not pass:', error.name);
  if (/ServerSelection/.test(error.name)) console.error('Check the Atlas network access list: allow the current development IP, confirm the cluster hostname, and ensure the cluster is running.');
  else if (error.code === 18) console.error('Check the exam database username/password and URI encoding.');
  else console.error('Check the local browser/server behaviour and the exam database permissions.');
  process.exitCode = 1;
} finally {
  if (mongoose.connection.readyState === 1) {
    await Application.deleteMany({ companyKey: company.toLowerCase() });
    await CompanyCounter.deleteOne({ _id: company.toLowerCase() });
  }
  if (browser) await browser.close();
  if (listener) await new Promise(resolve => listener.close(resolve));
  await mongoose.disconnect();
}
