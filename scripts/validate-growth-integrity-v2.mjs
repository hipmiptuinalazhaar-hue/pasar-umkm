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
requireContract(adminGrowth.includes("event_name='order_completed'"), 'admin growth query retains the canonical completed-order event name');
requireContract(securityEntry.includes('rejectClientAuthoritativeGrowthEvent'), 'security entry owns the client/server analytics boundary');
requireContract(securityEntry.includes('url.pathname !== "/api/growth/events"'), 'growth event boundary is scoped to the canonical endpoint');
requireContract(securityEntry.includes('String(body.event_name || "").trim() !== "order_completed"'), 'completed-order client assertions are rejected by the boundary');
requireContract(securityEntry.includes('code: "SERVER_AUTHORITATIVE_EVENT"'), 'forged completed-order analytics fail with a stable code');
requireContract(securityEntry.includes('client_order_completed_growth_event_allowed: false'), 'security policy exports the server-authoritative invariant');
requireContract(securityEntry.indexOf('rejectClientAuthoritativeGrowthEvent(request)') < securityEntry.indexOf('seoWorker.fetch(request, env, ctx)'), 'forged event is rejected before application routing or database writes');
requireContract(adminGrowth.includes('checkout_to_completed_7d_pct:null') && adminGrowth.includes('checkout_to_completed_30d_pct:null'), 'admin dashboard does not fabricate a completed-order conversion percentage');
requireContract(adminGrowth.includes('traffic_conversion_available:false'), 'admin methodology declares completed-order conversion unavailable until trusted instrumentation exists');
requireContract(adminGrowth.includes('order_completion_source:"server_authoritative_pending"'), 'admin methodology exposes the pending server-authoritative source state');

console.log(`\nGrowth integrity V2 contract: PASS (${checks.length} checks)`);
