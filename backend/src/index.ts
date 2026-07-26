import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';

async function main() {
  await prisma.$connect();
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`LMS API listening on http://localhost:${env.port}`);
    console.log(`Allowing CORS from ${env.clientUrl}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
