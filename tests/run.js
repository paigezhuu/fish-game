// `npm test`: boots a throwaway server with a short reconnect window, runs the socket suite, shuts it down.
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3199;
const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: { ...process.env, PORT, RECONNECT_GRACE_MS: '2500', LOBBY_GRACE_MS: '2500' },
  stdio: ['ignore', 'pipe', 'inherit']
});

server.stdout.once('data', () => {
  const test = spawn(process.execPath, [path.join(__dirname, 'server.test.js'), `http://localhost:${PORT}`], { stdio: 'inherit' });
  test.on('exit', (code) => { server.kill(); process.exit(code); });
});
