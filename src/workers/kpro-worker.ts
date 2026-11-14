import 'dotenv/config';
import cron, { type ScheduledTask } from 'node-cron';
import { reapZombieChromiumProcesses } from '@/lib/kpro/kpro-auth';
import { KPRO_CONFIG } from '@/lib/kpro/kpro-config';
import { executeKproSync } from '@/lib/kpro/kpro-service';
import { kproLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';

kproLogger.info('====================================================');
kproLogger.info('[MTMS-KPRO] Dedicated K-PRO Background Worker Starting');
kproLogger.info(`[MTMS-KPRO] Process ID: ${process.pid}`);
kproLogger.info(`[MTMS-KPRO] Node Environment: ${process.env.NODE_ENV || 'development'}`);
kproLogger.info(`[MTMS-KPRO] Target Witels: ${KPRO_CONFIG.witels.join(', ')}`);
kproLogger.info(`[MTMS-KPRO] Rolling Window: ${KPRO_CONFIG.rollingDays} days`);
kproLogger.info(`[MTMS-KPRO] Cron Schedules (${KPRO_CONFIG.cronSchedules.length} triggers):`);
for (const sched of KPRO_CONFIG.cronSchedules) {
    kproLogger.info(`   - ${sched}`);
}
kproLogger.info('====================================================');

// Bersihkan orphan/zombie chromium jika ada sisa crash sebelumnya
void reapZombieChromiumProcesses();

let isShuttingDown = false;
let isJobRunning = false;

// ----------------------------------------------------
// 1. Heartbeat Management
// ----------------------------------------------------
const sendHeartbeat = async () => {
    try {
        await redis.set(
            KPRO_CONFIG.redisKeys.heartbeat,
            JSON.stringify({
                pid: process.pid,
                timestamp: Date.now(),
                uptime: process.uptime(),
                isJobRunning,
            }),
            'EX',
            KPRO_CONFIG.timeouts.heartbeatTtlSeconds
        );
    } catch (err) {
        kproLogger.warn('[MTMS-KPRO] Heartbeat send failed', {
            error: err instanceof Error ? err.message : String(err),
        });
    }
};

// Kirim heartbeat setiap 20 detik
const heartbeatInterval = setInterval(sendHeartbeat, 20000);
void sendHeartbeat();

// ----------------------------------------------------
// 2. Fungsi Eksekutor Sinkronisasi (dengan Failback & Auto-Retry)
// ----------------------------------------------------
async function triggerSync(triggerType: string, isRetry = false): Promise<void> {
    if (isShuttingDown) {
        kproLogger.warn(`[MTMS-KPRO] Worker is shutting down, skipping trigger: ${triggerType}`);
        return;
    }

    if (isJobRunning) {
        kproLogger.warn(
            `[MTMS-KPRO] A sync job is already locally running, skipping trigger: ${triggerType}`
        );
        return;
    }

    isJobRunning = true;
    try {
        kproLogger.info(
            `[MTMS-KPRO] >>> Triggering K-PRO Sync (${triggerType}${isRetry ? ' [RETRY]' : ''})`
        );
        const result = await executeKproSync();
        if (result.success) {
            kproLogger.info(
                `[MTMS-KPRO] <<< K-PRO Sync completed successfully. Upserted: ${result.totalCompworkUpserted} rows.`
            );
        } else {
            kproLogger.warn(`[MTMS-KPRO] <<< K-PRO Sync ended with status: ${result.error}`);
            // Jangan lakukan auto-retry jika kendala adalah koneksi jaringan/intranet terputus
            if (result.error?.includes('NETWORK_UNREACHABLE')) {
                kproLogger.warn(
                    '[MTMS-KPRO] Kendala jaringan intranet K-PRO terputus. Menunggu jadwal berikutnya tanpa auto-retry (perlu perbaikan VPN/jaringan).'
                );
            } else if (!isRetry && !result.error?.includes('lock') && !isShuttingDown) {
                // Auto retry 1x setelah 60 detik jika gagal dan bukan karena lock / jaringan
                kproLogger.info('[MTMS-KPRO] Scheduling automatic sync retry in 60s...');
                setTimeout(() => {
                    void triggerSync(triggerType, true);
                }, 60000);
            }
        }
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        kproLogger.error(
            '[MTMS-KPRO] <<< Unhandled error during K-PRO sync',
            err instanceof Error ? err : new Error(errorMsg)
        );
        // Jangan auto-retry jika error jaringan intranet
        if (errorMsg.includes('NETWORK_UNREACHABLE') || errorMsg.includes('KproNetworkError')) {
            kproLogger.warn(
                '[MTMS-KPRO] Kendala jaringan intranet K-PRO terputus. Menunggu jadwal berikutnya tanpa auto-retry.'
            );
        } else if (!isRetry && !isShuttingDown) {
            kproLogger.info(
                '[MTMS-KPRO] Scheduling automatic sync retry in 60s after error...'
            );
            setTimeout(() => {
                void triggerSync(triggerType, true);
            }, 60000);
        }
    } finally {
        isJobRunning = false;
    }
}

// ----------------------------------------------------
// 3. Pendaftaran Jadwal Cron
// Sesuai kebutuhan pengguna:
// 00:30, 05:00, 10:00, 13:30, 16:30, 19:30, 22:00
// ----------------------------------------------------
const cronTasks: ScheduledTask[] = [];

for (const scheduleExpression of KPRO_CONFIG.cronSchedules) {
    if (!cron.validate(scheduleExpression)) {
        kproLogger.error(`[MTMS-KPRO] Invalid cron expression: "${scheduleExpression}"`);
        continue;
    }

    const task = cron.schedule(
        scheduleExpression,
        () => {
            void triggerSync(`CRON: ${scheduleExpression}`);
        },
        {
            timezone: 'Asia/Jakarta',
        }
    );

    cronTasks.push(task);
}

kproLogger.info(`[MTMS-KPRO] Registered ${cronTasks.length} active cron tasks.`);

// ----------------------------------------------------
// 4. Initial Run on Startup (Opsional via Flag)
// ----------------------------------------------------
const shouldRunOnStart =
    process.env.RUN_ON_START === 'true' || process.argv.includes('--now');

if (shouldRunOnStart) {
    kproLogger.info('[MTMS-KPRO] RUN_ON_START is active, running initial sync in 3 seconds...');
    setTimeout(() => {
        void triggerSync('STARTUP_IMMEDIATE');
    }, 3000);
}

// ----------------------------------------------------
// 5. Graceful Shutdown
// ----------------------------------------------------
const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    kproLogger.info(`[MTMS-KPRO] Received ${signal}. Initiating graceful shutdown...`);

    clearInterval(heartbeatInterval);

    for (const task of cronTasks) {
        task.stop();
    }

    if (isJobRunning) {
        kproLogger.info('[MTMS-KPRO] Waiting for ongoing sync to finish...');
        let waitCount = 0;
        while (isJobRunning && waitCount < 15) {
            await new Promise((r) => setTimeout(r, 1000));
            waitCount++;
        }
    }

    await redis.del(KPRO_CONFIG.redisKeys.heartbeat).catch(() => {});
    await reapZombieChromiumProcesses();
    kproLogger.info('[MTMS-KPRO] Worker shutdown complete. Goodbye.');
    process.exit(0);
};

process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
process.on('SIGINT', () => void handleShutdown('SIGINT'));
