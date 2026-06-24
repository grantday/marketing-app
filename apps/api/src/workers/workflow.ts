import { Worker, type Job } from 'bullmq';
import { pollDueEnrollments, processEnrollmentStep } from '../services/workflow/engine.js';
import { pollCrmStageChanges } from '../services/crm/poller.js';
import { connection, workflowQueue, crmSyncQueue } from '../lib/workflow/queue.js';

export { workflowQueue, crmSyncQueue };

export interface WorkflowJobData {
  enrollmentId: string;
}

export function startWorkflowWorker(): Worker {
  const worker = new Worker(
    'workflow-steps',
    async (job: Job) => {
      if (job.name === 'poll') {
        await pollDueEnrollments();
        return;
      }
      const data = job.data as WorkflowJobData;
      if (data?.enrollmentId) {
        await processEnrollmentStep(data.enrollmentId);
      }
    },
    { connection, concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    console.error(`Workflow job ${job?.id} failed:`, err.message);
  });

  return worker;
}

export function startCrmSyncWorker(): Worker {
  const worker = new Worker(
    'crm-sync',
    async () => {
      await pollCrmStageChanges();
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (_job, err) => {
    console.error('CRM sync failed:', err.message);
  });

  return worker;
}

export async function scheduleWorkflowPoller(): Promise<void> {
  await workflowQueue.add(
    'poll',
    {},
    {
      repeat: { every: 60000 },
      jobId: 'workflow-enrollment-poller',
    },
  );
}

export async function scheduleCrmPoller(): Promise<void> {
  await crmSyncQueue.add(
    'poll',
    {},
    {
      repeat: { every: 5 * 60000 },
      jobId: 'crm-stage-poller',
    },
  );
}
