import { Application } from '../models/Application.js';
import { insertApplication, forClient, findApplication } from '../services/applicationStore.js';
import { readApplication, readFilters } from '../middleware/applicationInput.js';
import { answer } from '../middleware/responses.js';
import { currentDay } from '../domain/calendar.js';
import { STAGES, JOB_TYPES } from '../domain/stages.js';

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
