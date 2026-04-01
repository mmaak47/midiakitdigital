module.exports = {
  apps: [{
    name: 'intermidia-midiakit',
    script: 'server.js',
    cwd: '/home/mmak/midiakit/backend',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3002,
      FRONTEND_ORIGINS: 'http://REDACTED_VPS_IP,http://midiakit.redeintermidia.com,https://midiakit.redeintermidia.com,http://www.midiakit.redeintermidia.com,https://www.midiakit.redeintermidia.com,http://localhost:5173,http://127.0.0.1:5173',
      PDF_ALLOWED_HOSTS: 'localhost,127.0.0.1,REDACTED_VPS_IP,midiakit.redeintermidia.com,www.midiakit.redeintermidia.com'
    },
    max_memory_restart: '300M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
