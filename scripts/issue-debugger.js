//!/usr/bin/env node
// Simple issue debugger: given a description, attempts to infer a service name and fetch its status and recent logs.
const { execSync } = require('child_process');

function usage() {
  console.error('Usage: node issue-debugger.js <description>');
  process.exit(1);
}

if (process.argv.length < 3) usage();

const description = process.argv.slice(2).join(' ');
console.log('🔍 Description:', description);

// Heuristic: take the first word as service name (you can improve this)
const service = description.split(/\s+/)[0];
console.log('🔎 Assuming service name:', service);

try {
  const status = execSync(`systemctl status ${service} --no-pager 2>&1`).toString();
  console.log('\n=== Service Status ===\n', status);
} catch (e) {
  console.log('\n⚠️ Could not get status for service', service);
}

try {
  const logs = execSync(`journalctl -u ${service} -n 50 --no-pager 2>/dev/null`).toString();
  console.log('\n=== Recent Logs (last 50 entries) ===\n', logs);
} catch (e) {
  console.log('\n⚠️ Could not retrieve logs for service', service);
}

// Optionally, show network listeners for the service name (simple grep)
try {
  const netstat = execSync(`netstat -tunlp 2>/dev/null | grep ${service}`).toString();
  console.log('\n=== Network Listeners Matching Service ===\n', netstat);
} catch (e) {
  console.log('\n⚠️ No network listeners found for', service);
}
