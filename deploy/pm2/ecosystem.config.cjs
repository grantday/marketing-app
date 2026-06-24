module.exports = {
  apps: [
    {
      name: 'reach-api',
      cwd: './apps/api',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '512M',
      error_file: './logs/reach-api-error.log',
      out_file: './logs/reach-api-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
