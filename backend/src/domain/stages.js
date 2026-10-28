export const FLOW = Object.freeze({
  Applied: ['Interview', 'Rejected'],
  Interview: ['Offer', 'Rejected'],
  Offer: ['Accepted', 'Declined'],
  Rejected: [],
  Accepted: [],
  Declined: []
});
export const STAGES = Object.keys(FLOW);
export const JOB_TYPES = ['Full-time', 'Internship', 'Contract'];
export const CLOSED_STAGES = ['Rejected', 'Accepted', 'Declined'];
export const DELETABLE_STAGES = ['Applied', ...CLOSED_STAGES];
export const isActiveStage = stage => !CLOSED_STAGES.includes(stage);
