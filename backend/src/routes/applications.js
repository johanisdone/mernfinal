import { Router } from 'express';
import * as actions from '../controllers/applications.js';
import { wrap, validId } from '../middleware/responses.js';

export const applicationRoutes = Router();
applicationRoutes.get('/options', actions.options);
applicationRoutes.get('/stats', wrap(actions.totals));
applicationRoutes.route('/').get(wrap(actions.browse)).post(wrap(actions.add));
applicationRoutes.get('/:id', validId, wrap(actions.show));
