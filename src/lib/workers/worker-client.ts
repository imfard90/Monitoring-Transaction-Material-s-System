import { actionLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';

export type WorkerJob =
    | {
          id: string;
          type: 'scrape:out-lensa';
          perpage?: number;
          triggeredBy?: string;
          createdAt: number;
      }
    | {
          id: string;
          type: 'scrape:wo-lensa';
          perpage?: number;
          fullLoop?: boolean;
          triggeredBy?: string;
          createdAt: number;
      }
    | {
          id: string;
          type: 'scrape:bulk-stock';
          warehouseId?: number;
          triggeredBy?: string;
          createdAt: number;
      }
    | {
          id: string;
          type: 'sync:sheets';
          context?: string;
          triggeredBy?: string;
          createdAt: number;
      };

export const WORKER_QUEUE_KEY = 'worker:jobs:queue';
export const WORKER_HEARTBEAT_KEY = 'worker:heartbeat';
export const WORKER_HEARTBEAT_TTL_SECONDS = 15;

/**
 * Checks whether the standalone background worker is online.
 */
export async function isWorkerActive(): Promise<boolean> {
    try {
        const ping = await redis.get(WORKER_HEARTBEAT_KEY);
        return ping !== null;
    } catch (err) {
        actionLogger.warn('[WORKER-CLIENT] Failed to check worker heartbeat', {
            error: err instanceof Error ? err.message : String(err),
        });
        return false;
    }
}

/**
 * Dispatches a background job to the standalone worker queue.
 */
export async function dispatchWorkerJob(job: WorkerJob): Promise<boolean> {
    try {
        await redis.lpush(WORKER_QUEUE_KEY, JSON.stringify(job));
        actionLogger.info(
            `[WORKER-CLIENT] Job ${job.id} (${job.type}) queued for background worker.`
        );
        return true;
    } catch (err) {
        actionLogger.error(
            `[WORKER-CLIENT] Failed to dispatch job ${job.id} (${job.type})`,
            err instanceof Error ? err : new Error(String(err))
        );
        return false;
    }
}
