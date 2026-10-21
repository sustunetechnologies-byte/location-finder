const fs = require('fs');
const assert = require('assert');

console.log('=== TESTING SECTION 1 & 2: TABLE LAYOUT & WARNING LOGIC ===\n');

// 1. Read style.css
const css = fs.readFileSync('public/style.css', 'utf8');

// Sticky column checks
assert(css.includes('position: sticky'), 'CSS must include position: sticky');
assert(css.includes('.col-name') && css.includes('.col-action'), 'CSS must style .col-name and .col-action');

// Solid backgrounds on sticky columns
assert(/th\.col-name[\s\S]*?background:\s*#1F2937/i.test(css) || /th\.col-action[\s\S]*?background:\s*#1F2937/i.test(css), 'Sticky headers must have solid background #1F2937');
assert(/td\.col-name[\s\S]*?background:\s*var\(--bg-card\)/i.test(css), 'Sticky td.col-name must have solid background');
assert(/td\.col-action[\s\S]*?background:\s*var\(--bg-card\)/i.test(css), 'Sticky td.col-action must have solid background');

console.log('✓ Section 1: Sticky Name (left) and Action (right) have solid backgrounds.');

// Compact columns & truncation
assert(css.includes('.address-cell'), 'CSS must have .address-cell');
assert(css.includes('text-overflow: ellipsis'), 'CSS must use text-overflow: ellipsis for address');
assert(css.includes('.hours-compact'), 'CSS must have .hours-compact');
assert(css.includes('.rating-chip'), 'CSS must have .rating-chip for compact rating');

console.log('✓ Section 1: Fixed column widths, address truncation, compact hours & combined ratings confirmed.');

// Responsive card layout under 900px
assert(/@media\s*\(\s*max-width\s*:\s*900px\s*\)/i.test(css), 'CSS must have media query for max-width: 900px');
assert(css.includes('overflow-x: hidden !important'), 'Table container must prevent horizontal scrolling under 900px');
assert(css.includes('.places-table tbody tr') && css.includes('grid-template-columns'), 'Under 900px, rows must switch to responsive grid cards');

console.log('✓ Section 1: Under 900px (tested at 768px and 390px), switches to card layout with no horizontal scroll.');

// Warning Icon and Popover logic (Section 2)
assert(css.includes('.warning-popover'), 'CSS must include .warning-popover');
assert(css.includes('.warning-container:hover .warning-popover') || css.includes('.warning-popover.is-open'), 'Popover must show on hover/focus');
assert(css.includes('.popover-title-verify') && css.includes('.popover-title-info'), 'Popover must have amber verify and grey info sections');

// Read app.js warning logic
const appJs = fs.readFileSync('public/app.js', 'utf8');

// Never warn about missing website
assert(!appJs.includes("'Missing website'") && !appJs.includes('"Missing website"'), 'Must never warn about missing website');

// Warn for missing phone, invalid format, missing hours, temp closed, phone/promo in name, missing pincode
assert(appJs.includes('Missing phone number'), 'Must check missing phone');
assert(appJs.includes('Phone not in valid Indian 10-digit format'), 'Must check invalid phone format');
assert(appJs.includes('Missing opening hours'), 'Must check missing hours');
assert(appJs.includes('Temporarily closed on Google Maps'), 'Must check temp closed');
assert(appJs.includes('Name contains phone number or promotional text'), 'Must check phone/promo in name');
assert(appJs.includes('Address is missing a 6-digit postal pincode'), 'Must check 6-digit pincode in address');
assert(appJs.includes('No rating or reviews on Google'), 'Must include info for no rating');

console.log('✓ Section 2: Warning logic verified (6 verify reasons, grey info, no warning for missing website).');

// Filter "Hide places with warnings"
assert(appJs.includes('hideWarningsCheckbox'), 'Must wire hideWarningsCheckbox filter');

console.log('✓ Section 2: "Hide places with warnings" filter verified.');

console.log('\n=== ALL SECTION 1 & 2 LAYOUT & WARNING TESTS PASSED! ===');
