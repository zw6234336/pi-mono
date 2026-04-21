#!/usr/bin/env node
/**
 * Simple ticket submission utility.
 * Reads JSON from STDIN (or a file path passed as first argument) containing:
 *   description, service, status, logs, netstat
 * Sends a POST request to the endpoint defined by env var TICKET_ENDPOINT.
 * Optionally uses env var TICKET_API_TOKEN for Authorization header.
 */
const { execSync } = require('child_process');
const https = require('https');

function getInput() {
  if (process.argv.length > 2) {
    const file = process.argv[2];
    return require('fs').readFileSync(file, 'utf8');
  }
  // read from stdin
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
  });
}

async function main() {
  const raw = await getInput();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    console.error('Invalid JSON input');
    process.exit(1);
  }

  const endpoint = process.env.TICKET_ENDPOINT;
  if (!endpoint) {
    console.error('Environment variable TICKET_ENDPOINT not set');
    process.exit(1);
  }

  const token = process.env.TICKET_API_TOKEN;
  const data = JSON.stringify(payload);

  const url = new URL(endpoint);
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };
  if (token) options.headers['Authorization'] = `Bearer ${token}`;

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('Ticket response status:', res.statusCode);
      console.log('Response body:', body);
    });
  });

  req.on('error', (e) => {
    console.error('Request error:', e.message);
    process.exit(1);
  });

  req.write(data);
  req.end();
}

main();
