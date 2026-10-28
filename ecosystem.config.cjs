module.exports = {
    apps: [
        {
            name: 'mtms-web',
            script: 'node_modules/next/dist/bin/next',
            args: 'start',
            instances: 4, // Bisa diubah ke 'max' untuk memanfaatkan multi-core CPU di server
            exec_mode: 'cluster',
            autorestart: true,
            watch: false,
            max_memory_restart: '2G',
            env: {
                NODE_ENV: 'development',
                PORT: 8000,
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 8000,
                RUN_EMBEDDED_CRON: 'false', // Nonaktifkan embedded cron di web server Next.js
            },
        },
        {
            name: 'mtms-worker',
            script: 'node_modules/tsx/dist/cli.mjs',
            args: 'src/workers/scraper-worker.ts',
            instances: 1, // Dedicated worker wajib 1 instance (fork)
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            max_memory_restart: '4G', // Headroom RAM untuk Chromium Playwright
            kill_timeout: 30000, // Waktu toleransi 30s untuk graceful shutdown
            env: {
                NODE_ENV: 'development',
                WORKER_ROLE: 'scraper-cron',
            },
            env_production: {
                NODE_ENV: 'production',
                WORKER_ROLE: 'scraper-cron',
            },
        },
    ],
};
