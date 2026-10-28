export class RequestProblem extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
export const wrap = task => (req, res, next) => Promise.resolve(task(req, res, next)).catch(next);
export const answer = (res, code, message, data) => res.status(code).json({ success: true, message, data });

export function handleProblem(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.code === 11000) {
    return res.status(409).json({ success: false, message: 'An active application already exists for this company and role.', data: null });
  }
  let code = error instanceof RequestProblem ? error.code : error.status;
  if (error.name === 'ValidationError' || error.name === 'CastError') code = 400;
  if (!Number.isInteger(code) || code < 400 || code > 599) code = 500;
  const message = code >= 500 ? 'We could not complete that operation. Please try again.' : error.message;
  if (code >= 500) console.error('Request failed:', error.name, error.message);
  res.status(code).json({ success: false, message, data: error instanceof RequestProblem ? error.details : null });
}

export function validId(req, res, next) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return next(new RequestProblem(400, 'The application ID in this address is not valid.'));
  next();
}
