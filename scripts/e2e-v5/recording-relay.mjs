// Recording relay for a real cloud run: the Warden posts to this loopback server (GROQ_BASE_URL),
// which appends every request body to a log and forwards it unchanged to the real upstream.
// The log is what actually left the machine. The Authorization header is forwarded, never logged.
//   node scripts/e2e-v5/recording-relay.mjs /tmp/cloud-received.jsonl 8799 https://api.groq.com/openai/v1
import { createServer } from 'node:http';
import { appendFileSync, writeFileSync } from 'node:fs';
const [log = 'cloud-received.jsonl', port = '8799', upstream = 'https://api.groq.com/openai/v1'] = process.argv.slice(2);
writeFileSync(log, '');
createServer((req, res) => {
  let body = ''; req.on('data', (c) => { body += c; }); req.on('end', async () => {
    appendFileSync(log, body + '\n');
    const t0 = Date.now();
    try {
      const up = await fetch(upstream + req.url, {
        method: req.method,
        headers: { 'content-type': 'application/json', authorization: req.headers.authorization || '' },
        body: req.method === 'GET' ? undefined : body,
      });
      const text = await up.text();
      appendFileSync(`${log}.timing`, JSON.stringify({ status: up.status, ms: Date.now() - t0 }) + '\n');
      res.writeHead(up.status, { 'content-type': 'application/json' });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  });
}).listen(Number(port), '127.0.0.1');
