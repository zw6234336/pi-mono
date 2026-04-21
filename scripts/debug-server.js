// Updated debug-server with optional ticket creation
const http = require('http');
const { execFileSync } = require('child_process');
const { spawnSync } = require('child_process');

const PORT = 3000;

function createTicketIfRequested(desc, output) {
  const shouldCreate = process.env.CREATE_TICKET === '1'; // env flag for safety
  if (!shouldCreate) return;
  const payload = JSON.stringify({
    description: desc,
    details: output
  });
  // Use the submit-ticket script
  try {
    const result = execFileSync('node', [
      __dirname + '/submit-ticket.js'
    ], { input: payload, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
    console.log('Ticket submission result:', result);
  } catch (e) {
    console.error('Ticket submission failed:', e.message);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/debug')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let desc = '';
      try { desc = JSON.parse(body).description || ''; } catch (_) {}
      if (!desc) {
        res.writeHead(400, {'Content-Type':'text/plain'});
        return res.end('Missing description');
      }
      let output = '';
      try {
        output = execFileSync('node', [
          __dirname + '/issue-debugger.js', desc
        ], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
        // Optionally create ticket if env flag is set
        createTicketIfRequested(desc, output);
        res.writeHead(200, {'Content-Type':'text/plain'});
        res.end(output);
      } catch (e) {
        res.writeHead(500, {'Content-Type':'text/plain'});
        res.end('Error executing debugger: ' + e.message);
      }
    });
  } else {
    res.writeHead(404, {'Content-Type':'text/plain'});
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Debug server listening on http://localhost:${PORT}`);
});
