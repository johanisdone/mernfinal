import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';

export function makeServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5174' }));
  app.use(express.json({ limit: '24kb' }));
  app.get('/api/health', (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ success: ready, message: ready ? 'Database connected.' : 'Database unavailable.', data: { ready } });
  });
  app.use((req, res) => res.status(404).json({ success: false, message: 'Endpoint not found.', data: null }));
  return app;
}
