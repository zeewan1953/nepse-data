#!/usr/bin/env node
const { spawnSync } = require('child_process');
const os = require('os');
const isWindows = os.platform() === 'win32';

function log(msg) { console.error(msg); }

// Step 1: Add GROQ_API_KEY env var to Vercel (all environments)
function addEnv() {
  log('Adding GROQ_API_KEY to Vercel...');
  const result = spawnSync('vercel', ['env', 'add', 'GROQ_API_KEY', 'production', '--force'], {
    input: 'n\nAQ.Ab8RN6JukoH8xu1au1Lgj8FX3jM0SX9Swh34IP93fVk5hEassA\n',
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: isWindows,
    timeout: 30000,
  });
  log(result.stdout || '');
  log(result.stderr || '');
  if (result.status !== 0) {
    log('Warning: env add may have failed, continuing...');
  } else {
    log('GROQ_API_KEY added to production.');
  }
}

// Step 2: Deploy to production
function deploy() {
  log('\nDeploying to production...\n');
  const result = spawnSync('vercel', ['--prod', '--yes'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: isWindows,
    timeout: 300000,
  });
  const out = (result.stdout || '') + (result.stderr || '');
  log(out);
  if (result.status !== 0) {
    log('Deployment failed');
    process.exit(1);
  }
  const match = out.match(/https:\/\/[a-zA-Z0-9.-]+\.vercel\.app/);
  if (match) {
    log('\n✅ Deployed: ' + match[0]);
    console.log(JSON.stringify({ status: 'success', url: match[0] }));
  } else {
    console.log(JSON.stringify({ status: 'success' }));
  }
}

addEnv();
deploy();
