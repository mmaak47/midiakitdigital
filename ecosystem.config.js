module.exports = {
  apps: [{
    name: 'intermidia-midiakit',
    script: 'server.js',
    cwd: '/home/mmak/midiakit/backend',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    max_memory_restart: '300M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
