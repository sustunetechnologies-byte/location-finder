const assert = require('assert');
const {
  formatIndianPhoneNumber,
  isIndianMobileNumber,
  getWhatsAppNumber
} = require('./phone_helpers');

console.log('=== TEST: Offline Phone & WhatsApp Helpers ===\n');

const testCases = [
  {
    input: "080 2345 6789",
    expectedDisplay: "+91 80 2345 6789",
    isMobile: false,
    expectedWa: null
  },
  {
    input: "099459 82625",
    expectedDisplay: "+91 99459 82625",
    isMobile: true,
    expectedWa: "919945982625"
  },
  {
    input: "80882 37972",
    expectedDisplay: "+91 80882 37972",
    isMobile: true,
    expectedWa: "918088237972"
  },
  {
    input: "+91 98450 12345",
    expectedDisplay: "+91 98450 12345",
    isMobile: true,
    expectedWa: "919845012345"
  },
  {
    input: "0821 2345678",
    expectedDisplay: "+91 821 2345678",
    isMobile: false,
    expectedWa: null
  },
  {
    input: "12345678",
    expectedDisplay: "+91 12345678",
    isMobile: false,
    expectedWa: null
  },
  {
    input: "",
    expectedDisplay: "Not available",
    isMobile: false,
    expectedWa: null
  }
];

let passed = 0;
for (const tc of testCases) {
  const display = formatIndianPhoneNumber(tc.input);
  const mobile = isIndianMobileNumber(tc.input);
  const wa = getWhatsAppNumber(null, tc.input);

  console.log(`Input: "${tc.input}"`);
  console.log(`  -> Display: "${display}" (expected: "${tc.expectedDisplay}")`);
  console.log(`  -> isMobile: ${mobile} (expected: ${tc.isMobile})`);
  console.log(`  -> WhatsApp: ${wa} (expected: ${tc.expectedWa})`);

  // Assert no invented digits (e.g. no "80" added to "12345678")
  if (tc.input === "12345678") {
    assert(!display.includes("80"), "Must NOT invent 80 for 12345678!");
  }
  assert.strictEqual(display, tc.expectedDisplay, `Display mismatch for ${tc.input}`);
  assert.strictEqual(mobile, tc.isMobile, `isMobile mismatch for ${tc.input}`);
  assert.strictEqual(wa, tc.expectedWa, `WhatsApp mismatch for ${tc.input}`);
  passed++;
  console.log('  ✓ Passed\n');
}

// Test intern manual override in WhatsApp field
const internWa = getWhatsAppNumber("8088237972", null);
assert.strictEqual(internWa, "918088237972", "Intern 10-digit input starting with 80 must be accepted for WhatsApp!");
console.log('✓ Intern WhatsApp manual override test passed');

console.log(`\nALL ${passed} PHONE TEST CASES PASSED!`);
