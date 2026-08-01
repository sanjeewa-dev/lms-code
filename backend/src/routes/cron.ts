import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { env } from '../config/env';
import { unauthorized } from '../utils/httpError';
import { runFeeRemindersAllTenants, runParentDigestsAllTenants } from '../services/smartJobs';
import { runTrackedJob } from '../services/jobRuns';
import { timingSafeEqualString } from '../utils/cryptoTokens';

const router = Router();

function requireCronSecret(req: { headers: Record<string, unknown> }) {
  const header = req.headers['x-cron-secret'];
  const provided = typeof header === 'string' ? header : null;
  if (!provided || !timingSafeEqualString(provided, env.cronSecret)) {
    throw unauthorized('Invalid cron secret');
  }
}

router.post(
  '/fee-reminders',
  asyncHandler(async (req, res) => {
    requireCronSecret(req);
    const results = await runTrackedJob('fee_reminders', () => runFeeRemindersAllTenants());
    res.json({ ok: true, results });
  })
);

router.post(
  '/parent-digests',
  asyncHandler(async (req, res) => {
    requireCronSecret(req);
    const results = await runTrackedJob('parent_digests', () => runParentDigestsAllTenants());
    res.json({ ok: true, results });
  })
);

export default router;
