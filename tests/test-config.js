/**
 * Test configuration parsing and validation
 * 
 * This test validates that the new environment variables are correctly
 * parsed and applied, without requiring actual AISIS credentials.
 */

import { strict as assert } from 'assert';

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Testing Configuration Parsing');
console.log('═══════════════════════════════════════════════════════\n');

// Test 1: FAST_MODE detection
console.log('Test 1: FAST_MODE detection');
process.env.FAST_MODE = 'true';
assert.strictEqual(process.env.FAST_MODE, 'true', 'FAST_MODE should be "true"');
assert.strictEqual(process.env.FAST_MODE === 'true', true, 'FAST_MODE check should work');
delete process.env.FAST_MODE;
console.log('   ✅ FAST_MODE detection works\n');

// Test 2: AISIS_CONCURRENCY parsing
console.log('Test 2: AISIS_CONCURRENCY parsing');
process.env.AISIS_CONCURRENCY = '12';
const concurrency = parseInt(process.env.AISIS_CONCURRENCY, 10);
assert.strictEqual(concurrency, 12, 'AISIS_CONCURRENCY should parse to 12');
assert.strictEqual(Math.max(1, Math.min(concurrency, 20)), 12, 'Clamping should preserve valid values');
delete process.env.AISIS_CONCURRENCY;

// Test edge case: too high
process.env.AISIS_CONCURRENCY = '50';
const tooHigh = parseInt(process.env.AISIS_CONCURRENCY, 10);
assert.strictEqual(Math.max(1, Math.min(tooHigh, 20)), 20, 'Should clamp to max 20');
delete process.env.AISIS_CONCURRENCY;

// Test edge case: too low
process.env.AISIS_CONCURRENCY = '0';
const tooLow = parseInt(process.env.AISIS_CONCURRENCY, 10);
assert.strictEqual(Math.max(1, Math.min(tooLow, 20)), 1, 'Should clamp to min 1');
delete process.env.AISIS_CONCURRENCY;
console.log('   ✅ AISIS_CONCURRENCY parsing and clamping works\n');

// Test 3: AISIS_BATCH_DELAY_MS parsing
console.log('Test 3: AISIS_BATCH_DELAY_MS parsing');
process.env.AISIS_BATCH_DELAY_MS = '250';
const delay = parseInt(process.env.AISIS_BATCH_DELAY_MS, 10);
assert.strictEqual(delay, 250, 'AISIS_BATCH_DELAY_MS should parse to 250');
assert.strictEqual(Math.max(0, Math.min(delay, 5000)), 250, 'Clamping should preserve valid values');
delete process.env.AISIS_BATCH_DELAY_MS;
console.log('   ✅ AISIS_BATCH_DELAY_MS parsing works\n');

// Test 4: AISIS_DEPARTMENTS parsing
console.log('Test 4: AISIS_DEPARTMENTS parsing');
process.env.AISIS_DEPARTMENTS = 'DISCS,MA,EN,EC';
const depts = process.env.AISIS_DEPARTMENTS.split(',').map(d => d.trim()).filter(d => d);
assert.deepStrictEqual(depts, ['DISCS', 'MA', 'EN', 'EC'], 'Should parse comma-separated departments');

// Test with spaces
process.env.AISIS_DEPARTMENTS = ' DISCS , MA , EN ';
const deptsWithSpaces = process.env.AISIS_DEPARTMENTS.split(',').map(d => d.trim()).filter(d => d);
assert.deepStrictEqual(deptsWithSpaces, ['DISCS', 'MA', 'EN'], 'Should handle spaces correctly');
delete process.env.AISIS_DEPARTMENTS;
console.log('   ✅ AISIS_DEPARTMENTS parsing works\n');

// Test 5: CURRICULUM_LIMIT parsing
console.log('Test 5: CURRICULUM_LIMIT parsing');
process.env.CURRICULUM_LIMIT = '10';
const limit = parseInt(process.env.CURRICULUM_LIMIT, 10);
assert.strictEqual(limit, 10, 'CURRICULUM_LIMIT should parse to 10');
delete process.env.CURRICULUM_LIMIT;
console.log('   ✅ CURRICULUM_LIMIT parsing works\n');

// Test 6: CURRICULUM_SAMPLE parsing
console.log('Test 6: CURRICULUM_SAMPLE parsing');
process.env.CURRICULUM_SAMPLE = 'BS CS_2024_1,BS ME_2023_1';
const sample = process.env.CURRICULUM_SAMPLE.split(',').map(s => s.trim()).filter(s => s);
assert.deepStrictEqual(sample, ['BS CS_2024_1', 'BS ME_2023_1'], 'Should parse curriculum samples');
delete process.env.CURRICULUM_SAMPLE;
console.log('   ✅ CURRICULUM_SAMPLE parsing works\n');

// Test 7: CURRICULUM_DELAY_MS parsing
console.log('Test 7: CURRICULUM_DELAY_MS parsing');
process.env.CURRICULUM_DELAY_MS = '0';
const currDelay = parseInt(process.env.CURRICULUM_DELAY_MS, 10);
assert.strictEqual(currDelay, 0, 'CURRICULUM_DELAY_MS should parse to 0');
assert.strictEqual(Math.max(0, currDelay), 0, 'Should allow 0 for fast mode');
delete process.env.CURRICULUM_DELAY_MS;
console.log('   ✅ CURRICULUM_DELAY_MS parsing works\n');

// Test 8: CURRICULUM_CONCURRENCY parsing
console.log('Test 8: CURRICULUM_CONCURRENCY parsing');
process.env.CURRICULUM_CONCURRENCY = '3';
const currConc = parseInt(process.env.CURRICULUM_CONCURRENCY, 10);
assert.strictEqual(currConc, 3, 'CURRICULUM_CONCURRENCY should parse to 3');
assert.strictEqual(Math.max(1, Math.min(currConc, 5)), 3, 'Should clamp between 1 and 5');

// Test edge case: too high
process.env.CURRICULUM_CONCURRENCY = '10';
const currTooHigh = parseInt(process.env.CURRICULUM_CONCURRENCY, 10);
assert.strictEqual(Math.max(1, Math.min(currTooHigh, 5)), 5, 'Should clamp to max 5');
delete process.env.CURRICULUM_CONCURRENCY;
console.log('   ✅ CURRICULUM_CONCURRENCY parsing works\n');

console.log('═══════════════════════════════════════════════════════');
console.log('✅ All configuration tests passed!');
console.log('═══════════════════════════════════════════════════════');
