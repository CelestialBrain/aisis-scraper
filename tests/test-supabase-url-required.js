/**
 * Test that SupabaseManager throws an error when SUPABASE_URL is not provided
 */

console.log('═══════════════════════════════════════════════════════');
console.log('🧪 Testing SUPABASE_URL Requirement');
console.log('═══════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

// Clear SUPABASE_URL environment variable to ensure it's not set
const originalSupabaseUrl = process.env.SUPABASE_URL;
delete process.env.SUPABASE_URL;

// Test 1: Constructor throws error when no URL is provided
console.log('Test 1: Constructor throws error when no URL is provided');
try {
  // Dynamic import to ensure fresh module load
  const { SupabaseManager } = await import('../src/supabase.js');
  
  try {
    new SupabaseManager('fake-token');
    console.log('❌ FAIL: Expected error was not thrown');
    failed++;
  } catch (error) {
    if (error.message === 'SUPABASE_URL is required. Please set it in your environment variables.') {
      console.log('✅ PASS: Correct error thrown when SUPABASE_URL is missing');
      passed++;
    } else {
      console.log(`❌ FAIL: Wrong error message: "${error.message}"`);
      failed++;
    }
  }
} catch (importError) {
  console.log(`❌ FAIL: Failed to import module: ${importError.message}`);
  failed++;
}

// Test 2: Constructor works when URL is provided as argument
console.log('\nTest 2: Constructor works when URL is provided as argument');
try {
  const { SupabaseManager } = await import('../src/supabase.js');
  
  try {
    const manager = new SupabaseManager('fake-token', 'https://test.supabase.co');
    if (manager.url === 'https://test.supabase.co/functions/v1/github-data-ingest') {
      console.log('✅ PASS: Constructor accepts URL as argument');
      passed++;
    } else {
      console.log(`❌ FAIL: URL was not set correctly. Got: ${manager.url}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: Constructor threw error when URL was provided: ${error.message}`);
    failed++;
  }
} catch (importError) {
  console.log(`❌ FAIL: Failed to import module: ${importError.message}`);
  failed++;
}

// Test 3: Constructor works when SUPABASE_URL env var is set
console.log('\nTest 3: Constructor works when SUPABASE_URL env var is set');
process.env.SUPABASE_URL = 'https://env-test.supabase.co';
try {
  const { SupabaseManager } = await import('../src/supabase.js');
  
  try {
    const manager = new SupabaseManager('fake-token');
    if (manager.url === 'https://env-test.supabase.co/functions/v1/github-data-ingest') {
      console.log('✅ PASS: Constructor uses SUPABASE_URL environment variable');
      passed++;
    } else {
      console.log(`❌ FAIL: URL was not set correctly from env. Got: ${manager.url}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: Constructor threw error when env var was set: ${error.message}`);
    failed++;
  }
} catch (importError) {
  console.log(`❌ FAIL: Failed to import module: ${importError.message}`);
  failed++;
}

// Test 4: Argument takes precedence over environment variable
console.log('\nTest 4: Argument takes precedence over environment variable');
process.env.SUPABASE_URL = 'https://env-test.supabase.co';
try {
  const { SupabaseManager } = await import('../src/supabase.js');
  
  try {
    const manager = new SupabaseManager('fake-token', 'https://arg-test.supabase.co');
    if (manager.url === 'https://arg-test.supabase.co/functions/v1/github-data-ingest') {
      console.log('✅ PASS: Argument takes precedence over environment variable');
      passed++;
    } else {
      console.log(`❌ FAIL: Argument did not take precedence. Got: ${manager.url}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ FAIL: Constructor threw error: ${error.message}`);
    failed++;
  }
} catch (importError) {
  console.log(`❌ FAIL: Failed to import module: ${importError.message}`);
  failed++;
}

// Restore original environment variable
if (originalSupabaseUrl !== undefined) {
  process.env.SUPABASE_URL = originalSupabaseUrl;
} else {
  delete process.env.SUPABASE_URL;
}

// Summary
console.log('\n═══════════════════════════════════════════════════════');
console.log('📊 Test Results:');
console.log(`   Total: ${passed + failed}`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log('═══════════════════════════════════════════════════════');

if (failed === 0) {
  console.log('\n✅ All tests passed!');
  process.exit(0);
} else {
  console.log(`\n❌ ${failed} test(s) failed!`);
  process.exit(1);
}
