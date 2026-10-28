module.exports = {
  apps: [{
    name: 'co-study',
    cwd: '/opt/halastudy',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    kill_timeout: 20000,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: '127.0.0.1',
      TRUST_PROXY: '1'
    }
  }]
};
