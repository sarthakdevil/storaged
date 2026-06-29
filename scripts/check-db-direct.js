const fs = require('fs');
const net = require('net');

try {
  const env = fs.readFileSync('apps/backend/.env', 'utf8');
  const m = env.match(/DIRECT_URL\s*=\s*"([^"]+)"/);
  if (!m) {
    console.error('DIRECT_URL not found in apps/backend/.env');
    process.exit(2);
  }

  const urlStr = m[1];
  const url = new URL(urlStr);
  const host = url.hostname;
  const port = url.port ? parseInt(url.port, 10) : 5432;

  console.log(`Checking TCP connectivity to ${host}:${port} ...`);

  const socket = net.createConnection({ host, port }, () => {
    console.log('OK: TCP connection established');
    socket.end();
    process.exit(0);
  });

  socket.on('error', (err) => {
    console.error('ERROR:', err.message);
    process.exit(3);
  });

  socket.setTimeout(5000, () => {
    console.error('ERROR: connection timed out');
    socket.destroy();
    process.exit(4);
  });
} catch (err) {
  console.error('ERROR reading env or parsing URL:', err.message);
  process.exit(1);
}
