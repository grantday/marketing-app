import { Worker } from 'bullmq';
import { connection } from '../lib/workflow/queue.js';
import { checkSlaBreaches } from '../services/sla/index.js';
import { purgeExpiredMessages } from '../services/retention/index.js';
import { pickAbTestWinner } from '../services/campaigns/abTest.js';
import { Queue } from 'bullmq';

export const enterpriseQueue = new Queue('enterprise-jobs', { connection });

export function startEnterpriseWorker(): Worker {
  const worker = new Worker(
    'enterprise-jobs',
    async (job) => {
      if (job.name === 'sla-check') await checkSlaBreaches();
      if (job.name === 'retention-purge') await purgeExpiredMessages();
      if (job.name === 'ab-winner' && job.data?.campaignId) {
        await pickAbTestWinner(job.data.campaignId as string);
      }
    },
    { connection, concurrency: 1 },
  );
  worker.on('failed', (_j, err) => console.error('Enterprise job failed:', err.message));
  return worker;
}

export async function scheduleEnterpriseJobs(): Promise<void> {
  await enterpriseQueue.add('sla-check', {}, { repeat: { every: 5 * 60_000 }, jobId: 'sla-check' });
  await enterpriseQueue.add('retention-purge', {}, { repeat: { pattern: '0 3 * * *' }, jobId: 'retention-daily' });
}

export async function enqueueAbWinnerCheck(campaignId: string, delayMs = 3600000): Promise<void> {
  await enterpriseQueue.add('ab-winner', { campaignId }, { delay: delayMs, jobId: `ab-${campaignId}` });
}
