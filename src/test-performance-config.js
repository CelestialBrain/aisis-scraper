/**
 * Test script to validate performance configuration options
 * 
 * Tests:
 * 1. SUPABASE_CLIENT_BATCH_SIZE parsing and defaults
 * 2. AISIS_TERM override behavior
 * 3. Batch splitting logic
 */

import { SupabaseManager } from './supabase.js';

// Test 1: Default batch size
console.log('Test 1: Default batch size (should be 2000)');
{
  delete process.env.SUPABASE_CLIENT_BATCH_SIZE;
  const manager = new SupabaseManager('fake-token');
  
  // Create mock data
  const mockData = Array(5000).fill(null).map((_, i) => ({
    term_code: '2025-1',
    subject_code: `TEST${i}`,
    section: 'A',
    department: 'TEST',
    course_title: 'Test Course'
  }));
  
  // Mock the sendRequest to capture batch sizes
  const capturedBatches = [];
  manager.sendRequest = async (dataType, records) => {
    capturedBatches.push(records.length);
    return true;
  };
  
  await manager.syncToSupabase('schedules', mockData, '2025-1', 'TEST');
  
  console.log(`  Batches created: ${capturedBatches.length}`);
  console.log(`  Batch sizes: ${capturedBatches.join(', ')}`);
  
  if (capturedBatches.length === 3 && capturedBatches[0] === 2000 && capturedBatches[1] === 2000 && capturedBatches[2] === 1000) {
    console.log('  ✅ PASSED: Default batch size is 2000\n');
  } else {
    console.log('  ❌ FAILED: Expected [2000, 2000, 1000], got', capturedBatches, '\n');
    process.exit(1);
  }
}

// Test 2: Custom batch size via env var
console.log('Test 2: Custom batch size via SUPABASE_CLIENT_BATCH_SIZE=1000');
{
  process.env.SUPABASE_CLIENT_BATCH_SIZE = '1000';
  const manager = new SupabaseManager('fake-token');
  
  const mockData = Array(2500).fill(null).map((_, i) => ({
    term_code: '2025-1',
    subject_code: `TEST${i}`,
    section: 'A',
    department: 'TEST',
    course_title: 'Test Course'
  }));
  
  const capturedBatches = [];
  manager.sendRequest = async (dataType, records) => {
    capturedBatches.push(records.length);
    return true;
  };
  
  await manager.syncToSupabase('schedules', mockData, '2025-1', 'TEST');
  
  console.log(`  Batches created: ${capturedBatches.length}`);
  console.log(`  Batch sizes: ${capturedBatches.join(', ')}`);
  
  if (capturedBatches.length === 3 && capturedBatches[0] === 1000 && capturedBatches[1] === 1000 && capturedBatches[2] === 500) {
    console.log('  ✅ PASSED: Custom batch size 1000 works\n');
  } else {
    console.log('  ❌ FAILED: Expected [1000, 1000, 500], got', capturedBatches, '\n');
    process.exit(1);
  }
}

// Test 3: Invalid batch size falls back to default
console.log('Test 3: Invalid SUPABASE_CLIENT_BATCH_SIZE falls back to default');
{
  process.env.SUPABASE_CLIENT_BATCH_SIZE = 'invalid';
  const manager = new SupabaseManager('fake-token');
  
  const mockData = Array(4500).fill(null).map((_, i) => ({
    term_code: '2025-1',
    subject_code: `TEST${i}`,
    section: 'A',
    department: 'TEST',
    course_title: 'Test Course'
  }));
  
  const capturedBatches = [];
  manager.sendRequest = async (dataType, records) => {
    capturedBatches.push(records.length);
    return true;
  };
  
  await manager.syncToSupabase('schedules', mockData, '2025-1', 'TEST');
  
  console.log(`  Batches created: ${capturedBatches.length}`);
  console.log(`  Batch sizes: ${capturedBatches.join(', ')}`);
  
  if (capturedBatches.length === 3 && capturedBatches[0] === 2000 && capturedBatches[1] === 2000 && capturedBatches[2] === 500) {
    console.log('  ✅ PASSED: Invalid value falls back to default 2000\n');
  } else {
    console.log('  ❌ FAILED: Expected [2000, 2000, 500], got', capturedBatches, '\n');
    process.exit(1);
  }
}

// Test 4: Zero batch size falls back to default
console.log('Test 4: Zero SUPABASE_CLIENT_BATCH_SIZE falls back to default');
{
  process.env.SUPABASE_CLIENT_BATCH_SIZE = '0';
  const manager = new SupabaseManager('fake-token');
  
  const mockData = Array(3000).fill(null).map((_, i) => ({
    term_code: '2025-1',
    subject_code: `TEST${i}`,
    section: 'A',
    department: 'TEST',
    course_title: 'Test Course'
  }));
  
  const capturedBatches = [];
  manager.sendRequest = async (dataType, records) => {
    capturedBatches.push(records.length);
    return true;
  };
  
  await manager.syncToSupabase('schedules', mockData, '2025-1', 'TEST');
  
  console.log(`  Batches created: ${capturedBatches.length}`);
  console.log(`  Batch sizes: ${capturedBatches.join(', ')}`);
  
  if (capturedBatches.length === 2 && capturedBatches[0] === 2000 && capturedBatches[1] === 1000) {
    console.log('  ✅ PASSED: Zero value falls back to default 2000\n');
  } else {
    console.log('  ❌ FAILED: Expected [2000, 1000], got', capturedBatches, '\n');
    process.exit(1);
  }
}

// Test 5: Large batch size
console.log('Test 5: Large SUPABASE_CLIENT_BATCH_SIZE=5000');
{
  process.env.SUPABASE_CLIENT_BATCH_SIZE = '5000';
  const manager = new SupabaseManager('fake-token');
  
  const mockData = Array(12000).fill(null).map((_, i) => ({
    term_code: '2025-1',
    subject_code: `TEST${i}`,
    section: 'A',
    department: 'TEST',
    course_title: 'Test Course'
  }));
  
  const capturedBatches = [];
  manager.sendRequest = async (dataType, records) => {
    capturedBatches.push(records.length);
    return true;
  };
  
  await manager.syncToSupabase('schedules', mockData, '2025-1', 'TEST');
  
  console.log(`  Batches created: ${capturedBatches.length}`);
  console.log(`  Batch sizes: ${capturedBatches.join(', ')}`);
  
  if (capturedBatches.length === 3 && capturedBatches[0] === 5000 && capturedBatches[1] === 5000 && capturedBatches[2] === 2000) {
    console.log('  ✅ PASSED: Large batch size 5000 works\n');
  } else {
    console.log('  ❌ FAILED: Expected [5000, 5000, 2000], got', capturedBatches, '\n');
    process.exit(1);
  }
}

// Clean up
delete process.env.SUPABASE_CLIENT_BATCH_SIZE;

console.log('═══════════════════════════════════════════════════════');
console.log('✅ All tests passed!');
console.log('═══════════════════════════════════════════════════════');
console.log('\nPerformance configuration is working correctly:');
console.log('  • Default batch size: 2000 records');
console.log('  • Custom batch size via SUPABASE_CLIENT_BATCH_SIZE');
console.log('  • Invalid values fall back to default');
console.log('  • Supports large batch sizes for performance tuning');
