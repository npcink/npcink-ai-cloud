// Test-process guard only: not an OS sandbox or a claim about native browser egress.
const fs = require('node:fs');
const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const ports = new Set(JSON.parse(process.env.NPCINK_ISOLATED_PORTS));
const log = (entry) => fs.appendFileSync(process.env.NPCINK_ISOLATED_NETWORK_LOG,
  `${JSON.stringify({ pid: process.pid, ...entry })}\n`);
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = first && typeof first === 'object' ? first
    : { port: first, host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  if (options.path || options.host !== '127.0.0.1' || !ports.has(Number(options.port))) {
    log({ kind: 'denied-connect' });
    throw new Error('Isolated channel denied Node connection');
  }
  return connect.apply(this, args);
};
tls.connect = () => {
  log({ kind: 'denied-tls' });
  throw new Error('Isolated channel denied TLS');
};
if (process.env.NPCINK_ISOLATED_SERVER_LOG) {
  const emit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (event, ...args) {
    if (event === 'request') {
      const [request, response] = args;
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      const method = request.method;
      const lane = process.env.NPCINK_ISOLATED_CHANNEL;
      // Business POSTs must remain page fixtures. Only original gate probes reach Next.
      const allowedWrite = method === 'POST' && (
        (lane === 'pending-install' && ['/api/health', '/api/setup/not-allowed'].includes(pathname))
        || (lane === 'complete-install' && pathname === '/api/setup/session')
      );
      response.once('finish', () => fs.appendFileSync(process.env.NPCINK_ISOLATED_SERVER_LOG,
        `${JSON.stringify({ method, pathname, status: response.statusCode })}\n`));
      if (!['GET', 'HEAD'].includes(method) && !allowedWrite) {
        log({ kind: 'denied-frontend-write', method, pathname });
        response.writeHead(405).end('Isolated channel rejected unmocked write');
        return true;
      }
    }
    return emit.call(this, event, ...args);
  };
}
