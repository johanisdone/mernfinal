import { Router } from 'express';
import * as actions from '../controllers/applications.js';
import { wrap, validId } from '../middleware/responses.js';

export const applicationRoutes = Router();
applicationRoutes.get('/options', actions.options);
applicationRoutes.get('/stats', wrap(actions.totals));
applicationRoutes.route('/').get(wrap(actions.browse)).post(wrap(actions.add));
applicationRoutes.route('/:id')
  .get(validId, wrap(actions.show))
  .patch(validId, wrap(actions.edit))
  .delete(validId, wrap(actions.remove));
applicationRoutes.patch('/:id/status', validId, wrap(actions.changeStatus));
