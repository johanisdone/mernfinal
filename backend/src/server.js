import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import { applicationRoutes } from './routes/applications.js';
import { handleProblem } from './middleware/responses.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function makeServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5174' }));
  app.use(express.json({ limit: '24kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/api/health', (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ success: ready, message: ready ? 'Database connected.' : 'Database unavailable.', data: { ready } });
  });
  app.use('/api/applications', applicationRoutes);
  app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Endpoint not found.', data: null }));
  const builtFrontend = fileURLToPath(new URL('../../frontend/dist', import.meta.url));
  if (existsSync(path.join(builtFrontend, 'index.html'))) {
    app.use(express.static(builtFrontend));
    app.get('*', (req, res, next) => path.extname(req.path) ? next() : res.sendFile(path.join(builtFrontend, 'index.html')));
  }
  app.use((req, res) => res.status(404).json({ success: false, message: 'Page not found.', data: null }));
  app.use(handleProblem);
  return app;
}
