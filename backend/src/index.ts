import cluster from 'cluster';
import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { markSchedulerArmed, startSmartSchedulers } from './jobs/scheduler';
import { resolveCommunicationsUrl } from './services/nmsClient';

function logListenBanner() {
  const role = cluster.isWorker ? `worker ${process.pid}` : `pid ${process.pid}`;
  console.log(`LMS API listening on http://localhost:${env.port} (${role})`);
  console.log(`Allowing CORS from ${env.clientUrl}`);
  console.log(
    env.nms.baseUrl
      ? `[nms] dispatch → ${resolveCommunicationsUrl(env.nms.baseUrl)}`
      : '[nms] NMS_BASE_URL unset; P0 emails will be skipped',
  );
}

async function startHttp() {
  await prisma.$connect();
  const app = createApp();
  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.maxConnections = env.maxConnectionsPerWorker;
  await new Promise<void>((resolve, reject) => {
    server.listen({ port: env.port, host: '0.0.0.0', backlog: 4096 }, () => {
      logListenBanner();
      resolve();
    });
    server.on('error', reject);
  });
}

function startSchedulers() {
  if (env.nodeEnv === 'test') return;
  startSmartSchedulers();
  markSchedulerArmed();
}

async function main() {
  const workers = env.webConcurrency;
  if (cluster.isPrimary && workers > 1) {
    console.log(`[cluster] primary ${process.pid} forking ${workers} workers`);
    for (let i = 0; i < workers; i += 1) cluster.fork();
    cluster.on('exit', (worker, code, signal) => {
      console.error(`[cluster] worker ${worker.process.pid} exited (${signal || code}); restarting`);
      cluster.fork();
    });
    startSchedulers();
    return;
  }

  await startHttp();
  if (workers <= 1) startSchedulers();
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
