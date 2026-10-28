import { JOB_TYPES, STAGES } from '../domain/stages.js';
import { currentDay, isCalendarDay } from '../domain/calendar.js';
import { RequestProblem } from './responses.js';

export const cleanWords = text => text.trim().replace(/\s+/g, ' ');
export const comparisonKey = text => cleanWords(text).toLocaleLowerCase('en-US');

export function checkBody(body, permitted) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestProblem(400, 'Send a JSON object.');
  const unexpected = Object.keys(body).filter(key => !permitted.includes(key));
  if (unexpected.length) throw new RequestProblem(400, `These fields cannot be set: ${unexpected.join(', ')}.`);
}

export function readApplication(body, creating = true) {
  const fields = ['companyName', 'jobRole', 'jobType', 'expectedSalary', 'notes'];
  checkBody(body, creating ? [...fields, 'appliedDate'] : fields);
  const errors = {};
  const result = {};
  for (const [key, label] of [['companyName', 'Company name'], ['jobRole', 'Job role']]) {
    if (typeof body[key] !== 'string' || !cleanWords(body[key]) || cleanWords(body[key]).length > 120) {
      errors[key] = `${label} is required and must be at most 120 characters.`;
    } else result[key] = cleanWords(body[key]);
  }
  if (result.companyName && (result.companyName.match(/[a-z]/gi) || []).length < 3) {
    errors.companyName = 'Use a company name containing at least three letters for the application ID.';
  }
  if (!JOB_TYPES.includes(body.jobType)) errors.jobType = 'Choose Full-time, Internship, or Contract.';
  else result.jobType = body.jobType;

  const salary = body.expectedSalary;
  if (salary === undefined || salary === null || salary === '') result.expectedSalary = null;
  else if (!['number', 'string'].includes(typeof salary) || String(salary).trim() === '' || !/^\d+(\.\d{1,2})?$/.test(String(salary)) || !Number.isFinite(Number(salary)) || Number(salary) > 1000000000000) {
    errors.expectedSalary = 'Expected salary must be a non-negative amount with at most two decimal places.';
  } else result.expectedSalary = Number(salary);

  if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 3000)) errors.notes = 'Notes must be text with at most 3,000 characters.';
  else result.notes = body.notes?.trim() || '';

  if (creating) {
    if (!isCalendarDay(body.appliedDate)) errors.appliedDate = 'Choose a valid applied date.';
    else if (body.appliedDate > currentDay()) errors.appliedDate = 'Applied Date cannot be a future date.';
    else if (body.appliedDate < '1900-01-01') errors.appliedDate = 'Applied Date must be on or after 1 January 1900.';
    else result.appliedDate = body.appliedDate;
  }
  if (Object.keys(errors).length) throw new RequestProblem(400, 'Please correct the application details.', { errors });
  return { ...result, companyKey: comparisonKey(result.companyName), roleKey: comparisonKey(result.jobRole) };
}

export function readFilters(query) {
  const permitted = ['company', 'status', 'page', 'limit'];
  if (Object.keys(query).some(key => !permitted.includes(key))) throw new RequestProblem(400, 'Unrecognized query parameter.');
  if (query.company !== undefined && (typeof query.company !== 'string' || query.company.length > 120)) throw new RequestProblem(400, 'Company search must be text of at most 120 characters.');
  if (query.status !== undefined && !STAGES.includes(query.status)) throw new RequestProblem(400, 'Choose a supported status.');
  const number = (key, fallback, maximum) => {
    const value = query[key] === undefined ? fallback : Number(query[key]);
    if (query[key] !== undefined && (typeof query[key] !== 'string' || !/^\d+$/.test(query[key]))) throw new RequestProblem(400, `${key} must be a positive integer.`);
    if (!Number.isInteger(value) || value < 1 || value > maximum) throw new RequestProblem(400, `${key} is outside the supported range.`);
    return value;
  };
  return { company: query.company?.trim() || '', status: query.status, page: number('page', 1, 10000), limit: number('limit', 9, 50) };
}
