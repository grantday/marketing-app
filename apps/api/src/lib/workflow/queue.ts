import { Queue } from 'bullmq';

function getRedisConnection() {
  const url = process.env.REDIS_URL || 'redis://localhost:6380';
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: Number(parsed.port) || 6379,
    maxRetriesPerRequest: null as null,
  };
}

export const connection = getRedisConnection();
export const workflowQueue = new Queue('workflow-steps', { connection });
export const crmSyncQueue = new Queue('crm-sync', { connection });
