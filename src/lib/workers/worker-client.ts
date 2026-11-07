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
 * Redis key where the worker publishes the state of its singleton Chromium browser.
 *
 * The browser lives in the `mtms-worker` process, not in the `mtms-web` process.
 * The web health endpoint therefore cannot inspect it in-process and must read
 * this snapshot instead. TTL is intentionally short so a dead worker's snapshot
 * expires on its own instead of reporting a stale "healthy" browser.
 */
export const WORKER_BROWSER_KEY = 'worker:lensa:browser';
export const WORKER_BROWSER_TTL_SECONDS = 30;

export interface WorkerBrowserSnapshot {
    /** Chromium OS process id, used for targeted (non-broad) cleanup. */
    pid: number | null;
    /** Number of currently open browser contexts. */
    contexts: number;
    /** Whether the browser process is still alive. */
    connected: boolean;
    /** Epoch ms of the last publish; used to detect a stalled worker. */
    updatedAt: number;
}

/**
 * Reads the worker browser snapshot published by `mtms-worker`.
 *
 * Returns `null` when the worker never launched a browser (idle state) or when
 * the snapshot has expired (worker down). Callers must treat `null` as
 * "no browser running", not as "browser unhealthy".
 */
export async function getWorkerBrowserSnapshot(): Promise<WorkerBrowserSnapshot | null> {
    try {
        const raw = await redis.get(WORKER_BROWSER_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<WorkerBrowserSnapshot>;
        return {
            pid: typeof parsed.pid === 'number' ? parsed.pid : null,
            contexts: typeof parsed.contexts === 'number' ? parsed.contexts : 0,
            connected: parsed.connected === true,
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
        };
    } catch (err) {
        actionLogger.warn('[WORKER-CLIENT] Failed to read worker browser snapshot', {
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

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
