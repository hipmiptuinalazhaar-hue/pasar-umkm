import fs from 'node:fs';

const worker = fs.readFileSync('src/worker-entry.js', 'utf8');
const functionality = fs.readFileSync('src/functionality-api.js', 'utf8');
const mediaBridge = fs.readFileSync('src/media-social-api.js', 'utf8');

const checks = [];
function requireContract(condition, message) {
  if (!condition) throw new Error(`ROUTE OWNERSHIP FAIL: ${message}`);
  checks.push(message);
  console.log(`ROUTE OWNERSHIP PASS: ${message}`);
}

const checkoutPreferences = worker.indexOf('handleCheckoutCommercePreferenceApi(request, env)');
const fulfillment = worker.indexOf('handleCommerceFulfillmentApi(request, env)');
const orders = worker.indexOf('handleOrdersApiV2(request, env)');
const functionalityOwner = worker.indexOf('handleFunctionalityApi(request, env)');
const media = worker.indexOf('handleMediaSocialApi(request, env)');

requireContract(checkoutPreferences >= 0, 'checkout preference/V2 boundary is mounted');
requireContract(fulfillment > checkoutPreferences, 'fulfillment executes after checkout preference/V2 boundary');
requireContract(orders > fulfillment, 'Orders V2 executes after fulfillment boundary');
requireContract(functionalityOwner > orders, 'legacy functionality handler cannot shadow Orders V2');
requireContract(media >= 0, 'media-social canonical bridge is mounted');
requireContract(functionality.includes('/api/commerce/checkout'), 'legacy checkout duplicate remains explicitly detected by the guard');
requireContract(functionality.includes('/api/commerce/orders'), 'legacy orders duplicate remains explicitly detected by the guard');
requireContract(mediaBridge.indexOf('handleReelsV4SecureCreateApi(request, env)') < mediaBridge.indexOf('handleReelsCommerceV4Api(request, env)'), 'secure Reels create boundary owns create routes before general V4');
requireContract(mediaBridge.indexOf('handleReelsAdvancedV4Api(request, env)') < mediaBridge.lastIndexOf('handleReelsCommerceV4Api(request, env)'), 'advanced Reels routes are checked before general V4 routes');
requireContract(mediaBridge.includes('SERVER_AUTHORITATIVE_EVENT'), 'client transaction events are blocked at media boundary');

console.log(`\nCanonical route ownership contract: PASS (${checks.length} checks)`);
