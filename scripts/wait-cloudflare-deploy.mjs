import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DEFAULT_REPOSITORY = 'hipmiptuinalazhaar-hue/pasar-umkm';
const token = process.env.GITHUB_TOKEN?.trim() || '';
const repository = (process.env.RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY).trim();
const explicitSha = (process.env.CLOUDFLARE_SHA || process.env.RELEASE_SHA || process.env.GITHUB_SHA || '').trim();
const prefix = process.env.CLOUDFLARE_CHECK_PREFIX?.trim() || 'Workers Builds:';
const timeoutMs = Number(process.env.CLOUDFLARE_WAIT_TIMEOUT_MS || 420000);
const pollMs = Number(process.env.CLOUDFLARE_WAIT_POLL_MS || 5000);

function localHeadSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const sha = explicitSha || localHeadSha();

if (!repository || !repository.includes('/')) throw new Error('RELEASE_REPOSITORY/GITHUB_REPOSITORY owner/repo is required.');
if (!/^[0-9a-f]{40}$/i.test(sha || '')) throw new Error('Release SHA must be a full commit SHA. Set CLOUDFLARE_SHA/RELEASE_SHA or run inside the git checkout.');
if (!Number.isFinite(timeoutMs) || timeoutMs < 30000) throw new Error('CLOUDFLARE_WAIT_TIMEOUT_MS must be >= 30000.');
if (!Number.isFinite(pollMs) || pollMs < 1000) throw new Error('CLOUDFLARE_WAIT_POLL_MS must be >= 1000.');

const endpoint = `https://api.github.com/repos/${repository}/commits/${sha}/check-runs?per_page=100`;
const terminalFailure = new Set(['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale']);
const startedAt = Date.now();
let seen = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractPreviewUrl(summary = '') {
  const alias = summary.match(/Preview Alias URL:\s*(https:\/\/[^\s)]+)/i);
  if (alias) return alias[1];
  const preview = summary.match(/Preview URL:\s*(https:\/\/[^\s)]+)/i);
  return preview?.[1] || '';
}

function writeOutputs(check) {
  if (!process.env.GITHUB_OUTPUT) return;
  const previewUrl = extractPreviewUrl(check?.output?.summary || '');
  appendFileSync(process.env.GITHUB_OUTPUT, `cloudflare_sha=${sha}\n`, 'utf8');
  appendFileSync(process.env.GITHUB_OUTPUT, `cloudflare_check_id=${check.id}\n`, 'utf8');
  appendFileSync(process.env.GITHUB_OUTPUT, `cloudflare_details_url=${check.details_url || ''}\n`, 'utf8');
  appendFileSync(process.env.GITHUB_OUTPUT, `preview_url=${previewUrl}\n`, 'utf8');
}

async function getChecks() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'pasar-umkm-release-verifier'
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(endpoint, { headers });
  if (!response.ok) {
    const body = await response.text();
    const hint = response.status === 403 && !token
      ? ' GitHub may have rate-limited anonymous API access; set GITHUB_TOKEN and retry.'
      : '';
    throw new Error(`GitHub check-runs API returned ${response.status}: ${body.slice(0, 300)}${hint}`);
  }

  const body = await response.json();
  return Array.isArray(body.check_runs) ? body.check_runs : [];
}

while (Date.now() - startedAt < timeoutMs) {
  const checks = await getChecks();
  const cloudflareChecks = checks
    .filter(check => check?.name?.startsWith(prefix))
    .filter(check => check?.app?.slug === 'cloudflare-workers-and-pages')
    .filter(check => /^[0-9a-f]{40}$/i.test(String(check?.head_sha || '')))
    .filter(check => String(check.head_sha).toLowerCase() === sha.toLowerCase())
    .sort((a, b) => new Date(b.completed_at || b.started_at || 0) - new Date(a.completed_at || a.started_at || 0));

  if (cloudflareChecks.length > 0) {
    seen = true;
    const check = cloudflareChecks[0];
    const label = `${check.name} status=${check.status} conclusion=${check.conclusion || 'pending'}`;

    if (check.status === 'completed' && check.conclusion === 'success') {
      writeOutputs(check);
      const previewUrl = extractPreviewUrl(check?.output?.summary || '');
      console.log(`Cloudflare deploy attested for exact SHA ${sha} :: ${label}${previewUrl ? ` :: preview=${previewUrl}` : ''}`);
      process.exit(0);
    }

    if (check.status === 'completed' && terminalFailure.has(check.conclusion)) {
      throw new Error(`Cloudflare deployment failed for exact SHA ${sha} :: ${label}`);
    }

    console.log(`Waiting for exact Cloudflare deploy ${sha.slice(0, 12)} :: ${label}`);
  } else {
    console.log(`Waiting for Cloudflare check-run for exact SHA ${sha.slice(0, 12)}...`);
  }

  await sleep(pollMs);
}

throw new Error(
  seen
    ? `Timed out waiting for successful Cloudflare deployment of ${sha}.`
    : `No Cloudflare deployment check appeared for ${sha} before timeout.`
);
