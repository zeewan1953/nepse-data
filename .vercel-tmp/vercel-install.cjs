#!/usr/bin/env node
const { spawnSync } = require('child_process');
const os = require('os');
const isWindows = os.platform() === 'win32';
const ALLOWED_COMMANDS = new Set(['node', 'npm', 'pnpm', 'yarn', 'vercel']);
function log(msg) { console.error(msg); }
function commandExists(cmd) {
  if (!ALLOWED_COMMANDS.has(cmd)) throw new Error(`Command not in whitelist: ${cmd}`);
  try {
    if (isWindows) { const r = spawnSync('where', [cmd], { stdio: 'ignore' }); return r.status === 0; }
    else { const r = spawnSync('sh', ['-c', `command -v "$1"`, '--', cmd], { stdio: 'ignore' }); return r.status === 0; }
  } catch { return false; }
}
function getCommandOutput(cmd, args) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], shell: isWindows });
    return r.status === 0 ? (r.stdout || '').trim() : null;
  } catch { return null; }
}
function main() {
  log('Checking Vercel CLI...');
  if (commandExists('vercel')) {
    const v = getCommandOutput('vercel', ['--version']) || 'unknown';
    log(`Vercel CLI already installed: ${v}`);
    console.log(JSON.stringify({ status: 'already_installed' }));
    return;
  }
  log('Installing Vercel CLI via npm...');
  const r = spawnSync('npm', ['install', '-g', 'vercel'], { stdio: 'inherit', shell: isWindows });
  if (r.status !== 0) { log('Install failed'); process.exit(1); }
  log('Vercel CLI installed successfully!');
  console.log(JSON.stringify({ status: 'success' }));
}
main();
