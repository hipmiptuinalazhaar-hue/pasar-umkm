import fs from 'node:fs';

const securityEntry = fs.readFileSync('src/security-worker-entry.js', 'utf8');
const launchGrowth = fs.readFileSync('src/launch-growth-api.js', 'utf8');
const adminGrowth = fs.readFileSync('src/admin-growth-api.js', 'utf8');

const checks = [];
function requireContract(condition, message) {
  if (!condition) throw new Error(`GROWTH INTEGRITY FAIL: ${message}`);
  checks.push(message);
  console.log(`GROWTH INTEGRITY PASS: ${message}`);
}

requireContract(launchGrowth.includes('"order_completed"'), 'P7 event taxonomy still recognizes completed-order analytics');
requireContract(adminGrowth.includes("event_name='order_completed'"), 'admin growth metrics consume completed-order analytics');
requireContract(securityEntry.includes('rejectClientAuthoritativeGrowthEvent'), 'security entry owns the client/server analytics boundary');
requireContract(securityEntry.includes('url.pathname !== "/api/growth/events"'), 'growth event boundary is scoped to the canonical endpoint');
requireContract(securityEntry.includes('String(body.event_name || "").trim() !== "order_completed"'), 'only completed-order client assertions are rejected by this boundary');
requireContract(securityEntry.includes('code: "SERVER_AUTHORITATIVE_EVENT"'), 'forged completed-order analytics fail with a stable code');
requireContract(securityEntry.includes('client_order_completed_growth_event_allowed: false'), 'security policy exports the server-authoritative invariant');
requireContract(securityEntry.indexOf('rejectClientAuthoritativeGrowthEvent(request)') < securityEntry.indexOf('seoWorker.fetch(request, env, ctx)'), 'forged event is rejected before application routing or database writes');

console.log(`\nGrowth integrity V2 contract: PASS (${checks.length} checks)`);
