// OpenAI-compatible fake of the Groq chat endpoint. Records every prompt it receives so the
// harness can assert what reached "the cloud". Scripted: fill email with the token, save, finish.
import { createServer } from 'node:http';
import { appendFileSync, writeFileSync } from 'node:fs';
const log = process.argv[2] || 'cloud-received.jsonl';
writeFileSync(log, '');
createServer((req, res) => {
  let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
    appendFileSync(log, body + '\n');
    const prompt = JSON.parse(body || '{}').messages?.map((m) => m.content).join('\n') || '';
    const hist = prompt.split('RECENT ACTION HISTORY:')[1] || '';
    const did = (a) => new RegExp(`'action': '${a}'`).test(hist);
    const emailTok = (prompt.match(/USER TASK:[^\n]*?(EMAIL#\d+)/) || [null, 'EMAIL#1'])[1];
    let plan;
    if (did('click')) plan = { action: 'finish', target_selector: null, coordinates: { x: 0, y: 0 }, value: null, reasoning_token: 'profile saved' };
    else if (did('type')) plan = { action: 'click', target_selector: '#save', coordinates: { x: 0, y: 0 }, value: null, reasoning_token: 'submit the form' };
    else plan = { action: 'type', target_selector: '#email', coordinates: { x: 0, y: 0 }, value: emailTok, reasoning_token: 'fill contact email' };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'x', model: JSON.parse(body).model, choices: [{ message: { role: 'assistant', content: JSON.stringify(plan) } }] }));
  });
}).listen(Number(process.argv[3] || 8799), '127.0.0.1');
