import { env } from '../config/env';
import { runFeeRemindersAllTenants, runParentDigestsAllTenants } from '../services/smartJobs';
import { runTrackedJob } from '../services/jobRuns';

/** Lightweight in-process scheduler (no extra dependency). */
export function startSmartSchedulers() {
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;

  const runFees = () => {
    runTrackedJob('fee_reminders', () => runFeeRemindersAllTenants())
      .then((r) => console.log('[cron] fee reminders', JSON.stringify(r)))
      .catch((err) => console.error('[cron] fee reminders failed', err));
  };

  const runDigests = () => {
    runTrackedJob('parent_digests', () => runParentDigestsAllTenants())
      .then((r) => console.log('[cron] parent digests', JSON.stringify(r)))
      .catch((err) => console.error('[cron] parent digests failed', err));
  };

  setTimeout(runFees, 60_000);
  setInterval(runFees, dayMs);

  setTimeout(runDigests, 120_000);
  setInterval(runDigests, 7 * dayMs);

  console.log(
    `[cron] Smart schedulers armed (fee reminders: last week of month daily check; parent digest weekly). Manual: POST /api/cron/* with X-Cron-Secret`
  );
  void env.cronSecret;
}

export let schedulerArmed = false;

export function markSchedulerArmed() {
  schedulerArmed = true;
}
