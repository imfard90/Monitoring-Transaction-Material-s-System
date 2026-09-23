module.exports = {
  apps: [
    {
      name: 'mtms-app',           // Nama aplikasi di dalam PM2
      script: 'npm',
      args: 'start',
      instances: 1,               // Jumlah instance (bisa diubah ke 'max' untuk memanfaatkan semua core CPU)
      exec_mode: 'fork',          // Mode eksekusi ('fork' atau 'cluster')
      autorestart: true,          // Restart otomatis jika aplikasi crash
      watch: false,               // Jangan watch perubahan file di production
      max_memory_restart: '1G',   // Restart jika penggunaan RAM melebihi 1 GB
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,               // Port yang akan digunakan oleh aplikasi Next.js
      }
    }
  ]
};
