module.exports = {
    apps: [
        {
            name: 'mtms-app', // Nama aplikasi di dalam PM2
            script: 'node_modules/next/dist/bin/next',
            args: 'start',
            instances: 1, // Jumlah instance (bisa diubah ke 'max' untuk memanfaatkan semua core CPU)
            exec_mode: 'cluster', // Mode eksekusi ('fork' atau 'cluster')
            autorestart: true, // Restart otomatis jika aplikasi crash
            watch: false, // Jangan watch perubahan file di production
            max_memory_restart: '8G', // Restart jika penggunaan RAM melebihi 1 GB
            env: {
                NODE_ENV: 'development',
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 8000, // Port yang akan digunakan oleh aplikasi Next.js
            },
        },
    ],
};
