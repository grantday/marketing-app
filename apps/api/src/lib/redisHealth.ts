import { Redis } from 'ioredis';

export async function checkRedis(): Promise<boolean> {
  try {
    const url = process.env.REDIS_URL || 'redis://localhost:6380';
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
