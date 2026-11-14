import path from 'node:path';

export const KPRO_CONFIG = {
    urls: {
        base: process.env.KPRO_URL || 'https://kpro.telkom.co.id',
        login:
            process.env.KPRO_LOGIN ||
            process.env.LOGIN_URL ||
            'https://kpro.telkom.co.id/kpro/public/otp/u/czoxMToiMDYxMTkwX0lNQU0iOw==',
        dashboard:
            process.env.KPRO_DASHBOARD_URL ||
            process.env.DASHBOARD_URL ||
            'https://kpro.telkom.co.id/kpro/provi/index',
        data:
            process.env.KPRO_DATA_URL ||
            process.env.DATA_URL ||
            'https://kpro.telkom.co.id/kpro/newteknisi/excelfulendstate?kolom=TOTAL&in_manja=BUKAN',
        webOtp:
            process.env.KPRO_WEB_OTP_URL ||
            process.env.WEB_OTP_URL ||
            'https://script.google.com/macros/s/AKfycbyDnLE0F8wV6GncSDkEdTDR5Az48OpMXehyjeBrrT28YrbqZlzld1UpWIINZlKKc13i/exec',
        intranetCheck: 'https://kpro.telkom.co.id/kpro/public/login',
    },
    witels: (process.env.KPRO_WITELS
        ? process.env.KPRO_WITELS.split(',')
        : ['SURAMADU', 'JATIM+BARAT', 'JATIM+TIMUR']
    ).map((w) => w.trim()),
    cronSchedules: [
        '30 0 * * *', // 00:30
        '0 5 * * *', // 05:00
        '0 10 * * *', // 10:00
        '30 13 * * *', // 13:30
        '30 16 * * *', // 16:30
        '30 19 * * *', // 19:30
        '0 22 * * *', // 22:00
    ],
    rollingDays: Number(process.env.KPRO_ROLLING_DAYS) || 30,
    batchSize: Number(process.env.KPRO_BATCH_SIZE) || 500,
    tempDir: path.join(process.cwd(), 'temp', 'kpro'),
    redisKeys: {
        cookies: 'kpro:session:cookies',
        lock: 'lock:kpro_sync',
        heartbeat: 'kpro:worker:heartbeat',
    },
    timeouts: {
        intranetCheckMs: 5000,
        defaultMs: 30000,
        downloadMs: 180000, // 3 minutes for large exports
        lockTtlSeconds: 3600, // 1 hour max lock duration
        heartbeatTtlSeconds: 60,
        cookieCacheTtlSeconds: 12 * 3600, // 12 hours
    },
    retry: {
        maxLoginAttempts: 3,
        loginRetryDelayMs: 5000,
        maxDownloadAttempts: 3,
        downloadRetryDelayMs: 3000,
        otpMaxPollAttempts: 5,
        otpPollIntervalMs: 2500,
    },
} as const;
