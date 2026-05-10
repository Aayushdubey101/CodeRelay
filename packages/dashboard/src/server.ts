import express from 'express';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { createLogger } from '@coderelay/core';
import { graphRouter } from './routes/graph.js';
import { memoryRouter } from './routes/memory.js';
import { tasksRouter } from './routes/tasks.js';
import { eventsRouter } from './routes/events.js';

const log = createLogger('@coderelay/dashboard');

export interface DashboardOptions {
  graphDbPath: string;
  ltDbPath: string;
  sessionDbPath: string;
  actionLogPath: string;
  staticDir?: string;
  port?: number;
}

export function createDashboard(opts: DashboardOptions): express.Express {
  const app = express();
  app.use(express.json());

  // Static files — serve built dashboard HTML if present
  const staticDir = opts.staticDir ?? join(import.meta.dirname ?? '', 'static');
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
  }

  // Open databases lazily — don't error if files don't exist yet
  const getGraphDb = (): Database.Database | null => {
    try { return existsSync(opts.graphDbPath) ? new Database(opts.graphDbPath, { readonly: true }) : null; } catch { return null; }
  };
  const getLtDb = (): Database.Database | null => {
    try { return existsSync(opts.ltDbPath) ? new Database(opts.ltDbPath, { readonly: true }) : null; } catch { return null; }
  };
  const getSessionDb = (): Database.Database | null => {
    try { return existsSync(opts.sessionDbPath) ? new Database(opts.sessionDbPath, { readonly: true }) : null; } catch { return null; }
  };

  app.use('/api/graph', (req, res, next) => {
    const db = getGraphDb();
    if (!db) { res.status(503).json({ error: 'Graph DB not found — run coderelay index first' }); return; }
    graphRouter(db)(req, res, next);
  });

  app.use('/api/memory', (req, res, next) => {
    const lt = getLtDb();
    const sess = getSessionDb();
    if (!lt || !sess) { res.status(503).json({ error: 'Memory DBs not found' }); return; }
    memoryRouter(lt, sess)(req, res, next);
  });

  app.use('/api/tasks', tasksRouter(opts.actionLogPath));
  app.use('/events', eventsRouter(opts.actionLogPath));

  return app;
}

export async function startDashboard(opts: DashboardOptions): Promise<void> {
  const port = opts.port ?? 4000;
  const app = createDashboard(opts);
  app.listen(port, () => {
    log.info(`Dashboard running at http://localhost:${port}`);
  });
}
