import { Application, CompanyCounter } from '../models/Application.js';
import { FLOW, DELETABLE_STAGES } from '../domain/stages.js';
import { currentDay, followUpFor } from '../domain/calendar.js';
import { RequestProblem } from '../middleware/responses.js';

export function forClient(record) {
  const value = record.toObject ? record.toObject() : { ...record };
  const { companyKey, roleKey, isActive, __v, ...publicFields } = value;
  return {
    ...publicFields,
    isOverdue: value.status === 'Applied' && currentDay() > value.followUpDate,
    nextStatuses: [...FLOW[value.status]],
    canDelete: DELETABLE_STAGES.includes(value.status)
  };
}

export async function findApplication(id) {
  const item = await Application.findById(id);
  if (!item) throw new RequestProblem(404, 'This application could not be found.');
  return item;
}

export async function ensureNoActiveDuplicate(input, excludingId) {
  const filter = { companyKey: input.companyKey, roleKey: input.roleKey, isActive: true };
  if (excludingId) filter._id = { $ne: excludingId };
  if (await Application.exists(filter)) throw new RequestProblem(409, 'You already have an active application for this company and role. Finish it before adding another.');
}

async function nextNumber(companyKey) {
  try {
    const counter = await CompanyCounter.findOneAndUpdate(
      { _id: companyKey, value: { $lt: 999 } },
      { $inc: { value: 1 } },
      { upsert: true, new: true, runValidators: true }
    );
    return counter.value;
  } catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await CompanyCounter.findById(companyKey);
    if (existing?.value >= 999) throw new RequestProblem(409, 'The three-digit application sequence for this company has been exhausted.');
    // An overlapping first allocation may have inserted the company counter.
    return nextNumber(companyKey);
  }
}

export async function insertApplication(input) {
  await ensureNoActiveDuplicate(input);
  const prefix = input.companyName.match(/[a-z]/gi).slice(0, 3).join('').toUpperCase();
  for (let attempt = 0; attempt < 999; attempt++) {
    const sequence = await nextNumber(input.companyKey);
    const applicationId = `JA-${prefix}-${String(sequence).padStart(3, '0')}`;
    try {
      return await Application.create({
        ...input, applicationId, status: 'Applied', isActive: true,
        followUpDate: followUpFor(input.appliedDate),
        statusHistory: [{ status: 'Applied', changedAt: new Date() }]
      });
    } catch (error) {
      if (error.code === 11000 && (error.keyPattern?.applicationId || error.keyValue?.applicationId)) continue;
      throw error;
    }
  }
  throw new RequestProblem(409, 'No application number is available for this company prefix.');
}
