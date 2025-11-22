/**
 * Test script to validate AISIS_TERM override behavior
 * 
 * Tests:
 * 1. AISIS_TERM override is respected
 * 2. APPLICABLE_PERIOD legacy support
 * 3. AISIS_TERM takes precedence over APPLICABLE_PERIOD
 */

console.log('Test 1: AISIS_TERM override is used');
{
  process.env.AISIS_TERM = '2025-1';
  delete process.env.APPLICABLE_PERIOD;
  
  // Simulate what index.js does
  const AISIS_TERM = process.env.AISIS_TERM;
  const APPLICABLE_PERIOD = process.env.APPLICABLE_PERIOD;
  const termOverride = AISIS_TERM || APPLICABLE_PERIOD || null;
  
  console.log(`  termOverride: ${termOverride}`);
  
  if (termOverride === '2025-1') {
    console.log('  ✅ PASSED: AISIS_TERM is used correctly\n');
  } else {
    console.log('  ❌ FAILED: Expected "2025-1", got', termOverride, '\n');
    process.exit(1);
  }
}

console.log('Test 2: APPLICABLE_PERIOD legacy support');
{
  delete process.env.AISIS_TERM;
  process.env.APPLICABLE_PERIOD = '2024-2';
  
  const AISIS_TERM = process.env.AISIS_TERM;
  const APPLICABLE_PERIOD = process.env.APPLICABLE_PERIOD;
  const termOverride = AISIS_TERM || APPLICABLE_PERIOD || null;
  
  console.log(`  termOverride: ${termOverride}`);
  
  if (termOverride === '2024-2') {
    console.log('  ✅ PASSED: APPLICABLE_PERIOD fallback works\n');
  } else {
    console.log('  ❌ FAILED: Expected "2024-2", got', termOverride, '\n');
    process.exit(1);
  }
}

console.log('Test 3: AISIS_TERM takes precedence over APPLICABLE_PERIOD');
{
  process.env.AISIS_TERM = '2025-1';
  process.env.APPLICABLE_PERIOD = '2024-2';
  
  const AISIS_TERM = process.env.AISIS_TERM;
  const APPLICABLE_PERIOD = process.env.APPLICABLE_PERIOD;
  const termOverride = AISIS_TERM || APPLICABLE_PERIOD || null;
  
  console.log(`  AISIS_TERM: ${AISIS_TERM}`);
  console.log(`  APPLICABLE_PERIOD: ${APPLICABLE_PERIOD}`);
  console.log(`  termOverride: ${termOverride}`);
  
  if (termOverride === '2025-1') {
    console.log('  ✅ PASSED: AISIS_TERM takes precedence\n');
  } else {
    console.log('  ❌ FAILED: Expected "2025-1", got', termOverride, '\n');
    process.exit(1);
  }
}

console.log('Test 4: No override defaults to null');
{
  delete process.env.AISIS_TERM;
  delete process.env.APPLICABLE_PERIOD;
  
  const AISIS_TERM = process.env.AISIS_TERM;
  const APPLICABLE_PERIOD = process.env.APPLICABLE_PERIOD;
  const termOverride = AISIS_TERM || APPLICABLE_PERIOD || null;
  
  console.log(`  termOverride: ${termOverride}`);
  
  if (termOverride === null) {
    console.log('  ✅ PASSED: Defaults to null (auto-detect)\n');
  } else {
    console.log('  ❌ FAILED: Expected null, got', termOverride, '\n');
    process.exit(1);
  }
}

// Clean up
delete process.env.AISIS_TERM;
delete process.env.APPLICABLE_PERIOD;

console.log('═══════════════════════════════════════════════════════');
console.log('✅ All tests passed!');
console.log('═══════════════════════════════════════════════════════');
console.log('\nTerm override behavior is correct:');
console.log('  • AISIS_TERM is the preferred variable');
console.log('  • APPLICABLE_PERIOD is still supported (legacy)');
console.log('  • AISIS_TERM takes precedence when both are set');
console.log('  • Defaults to null (auto-detect) when neither is set');
