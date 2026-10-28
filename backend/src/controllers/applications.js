import { Application } from '../models/Application.js';
import { insertApplication, forClient, findApplication, ensureNoActiveDuplicate } from '../services/applicationStore.js';
import { readApplication, readFilters, checkBody } from '../middleware/applicationInput.js';
import { answer, RequestProblem } from '../middleware/responses.js';
import { currentDay } from '../domain/calendar.js';
import { STAGES, JOB_TYPES, FLOW, DELETABLE_STAGES, isActiveStage } from '../domain/stages.js';

export async function add(req, res) {
  const record = await insertApplication(readApplication(req.body));
  answer(res, 201, 'Application added to your journal.', forClient(record));
}

export async function browse(req, res) {
  const { company, status, page, limit } = readFilters(req.query);
  const filter = {};
  if (status) filter.status = status;
  if (company) filter.companyName = { $regex: company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const [items, total] = await Promise.all([
    Application.find(filter).select('-statusHistory').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Application.countDocuments(filter)
  ]);
  answer(res, 200, 'Applications retrieved.', { items: items.map(forClient), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function totals(req, res) {
  const [grouped, overdue] = await Promise.all([
    Application.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Application.countDocuments({ status: 'Applied', followUpDate: { $lt: currentDay() } })
  ]);
  const counts = Object.fromEntries(STAGES.map(stage => [stage, 0]));
  grouped.forEach(row => { counts[row._id] = row.count; });
  answer(res, 200, 'Journal totals retrieved.', { counts, total: grouped.reduce((sum, row) => sum + row.count, 0), overdue });
}

export async function show(req, res) {
  answer(res, 200, 'Application retrieved.', forClient(await findApplication(req.params.id)));
}

export function options(req, res) {
  answer(res, 200, 'Form options retrieved.', { jobTypes: JOB_TYPES, statuses: STAGES, today: currentDay(), timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata' });
}

export async function edit(req, res) {
  const permitted = ['companyName', 'jobRole', 'jobType', 'expectedSalary', 'notes'];
  checkBody(req.body, permitted);
  if (!Object.keys(req.body).length) throw new RequestProblem(400, 'Supply at least one editable field.');
  const original = await findApplication(req.params.id);
  const currentValues = Object.fromEntries(permitted.map(key => [key, original[key]]));
  const changes = readApplication({ ...currentValues, ...req.body }, false);
  if (original.isActive) await ensureNoActiveDuplicate(changes, original._id);
  const updated = await Application.findOneAndUpdate(
    { _id: original._id, __v: original.__v },
    { $set: changes, $inc: { __v: 1 } },
    { new: true, runValidators: true }
  );
  if (!updated) throw new RequestProblem(409, 'This application changed while you were editing. Refresh and try again.');
  answer(res, 200, 'Application details updated.', forClient(updated));
}

export async function changeStatus(req, res) {
  checkBody(req.body, ['status']);
  if (!STAGES.includes(req.body.status)) throw new RequestProblem(400, 'Choose a supported next status.');
  const original = await findApplication(req.params.id);
  const permitted = FLOW[original.status];
  if (!permitted.length) throw new RequestProblem(400, `${original.status} is a final status and cannot be changed.`);
  if (!permitted.includes(req.body.status)) {
    throw new RequestProblem(400, `Cannot move from ${original.status} to ${req.body.status}. Choose ${permitted.join(' or ')}.`);
  }
  const updated = await Application.findOneAndUpdate(
    { _id: original._id, status: original.status, __v: original.__v },
    { $set: { status: req.body.status, isActive: isActiveStage(req.body.status) }, $push: { statusHistory: { status: req.body.status, changedAt: new Date() } }, $inc: { __v: 1 } },
    { new: true, runValidators: true }
  );
  if (!updated) throw new RequestProblem(409, 'Another update changed this application. Refresh before choosing its next stage.');
  answer(res, 200, `Application moved to ${updated.status}.`, forClient(updated));
}

export async function remove(req, res) {
  const original = await findApplication(req.params.id);
  if (!DELETABLE_STAGES.includes(original.status)) throw new RequestProblem(400, `Applications in ${original.status} cannot be deleted. Finish that stage first.`);
  const result = await Application.deleteOne({ _id: original._id, __v: original.__v, status: { $in: DELETABLE_STAGES } });
  if (!result.deletedCount) throw new RequestProblem(409, 'This application changed before deletion. Refresh and try again.');
  answer(res, 200, 'Application removed from your journal.', { id: original._id.toString(), applicationId: original.applicationId });
}
