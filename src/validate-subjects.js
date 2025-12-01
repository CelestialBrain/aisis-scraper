import fs from 'fs';
import path from 'path';
import { getSubjectPrefix } from './constants.js';

/**
 * Validation script for post-scrape subject analysis
 * 
 * Reads data/courses.json if it exists and computes:
 * - Per-department course counts
 * - Per-department subject prefix breakdown
 * - Identifies potential issues (e.g., missing subject families)
 * 
 * Usage:
 *   node src/validate-subjects.js
 *   node src/validate-subjects.js data/custom-courses.json
 */

/**
 * Compute per-department subject prefix breakdown
 * @param {Array} courses - Array of course objects
 * @returns {object} Nested object: { dept: { prefix: count } }
 */
function computeSubjectPrefixBreakdown(courses) {
  const breakdown = {};
  
  for (const course of courses) {
    const dept = course.department;
    const prefix = getSubjectPrefix(course.subjectCode);
    
    if (!breakdown[dept]) {
      breakdown[dept] = {};
    }
    
    breakdown[dept][prefix] = (breakdown[dept][prefix] || 0) + 1;
  }
  
  return breakdown;
}

/**
 * Main validation function
 */
async function validateSubjects() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 Subject Validation Analysis');
  console.log('═══════════════════════════════════════════════════════\n');

  // Get courses file path from args or use default
  const coursesPath = process.argv[2] || 'data/courses.json';
  
  if (!fs.existsSync(coursesPath)) {
    console.error(`❌ Courses file not found: ${coursesPath}`);
    console.error('   Run the scraper first to generate courses data.\n');
    process.exit(1);
  }
  
  console.log(`📄 Reading courses from: ${coursesPath}\n`);
  
  // Load courses
  let courses;
  try {
    const data = fs.readFileSync(coursesPath, 'utf-8');
    courses = JSON.parse(data);
  } catch (error) {
    console.error(`❌ Failed to read courses file: ${error.message}\n`);
    process.exit(1);
  }
  
  console.log(`📚 Total courses loaded: ${courses.length}\n`);
  
  // Compute per-department counts
  const deptCounts = {};
  for (const course of courses) {
    const dept = course.department;
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  }
  
  // Compute subject prefix breakdown
  const subjectBreakdown = computeSubjectPrefixBreakdown(courses);
  
  // Display results
  console.log('📊 Per-Department Summary:');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const departments = Object.keys(deptCounts).sort();
  
  for (const dept of departments) {
    const totalCourses = deptCounts[dept];
    const prefixes = subjectBreakdown[dept] || {};
    
    // Format prefix breakdown
    const prefixList = Object.entries(prefixes)
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .map(([prefix, count]) => `${prefix}=${count}`)
      .join(', ');
    
    console.log(`${dept.padEnd(6)} (${String(totalCourses).padStart(3)} courses): ${prefixList}`);
  }
  
  console.log('\n═══════════════════════════════════════════════════════');
  
  // Check for potential issues in critical departments
  console.log('\n🔍 Critical Department Analysis:\n');
  
  const criticalDepts = {
    'PE': ['PEPC', 'PHYED', 'NSTP'],
    'NSTP': ['NSTP', 'CWTS', 'ROTC']
  };
  
  let issuesFound = false;
  
  for (const [dept, expectedPrefixes] of Object.entries(criticalDepts)) {
    if (!subjectBreakdown[dept]) {
      console.log(`⚠️  ${dept}: No courses found`);
      issuesFound = true;
      continue;
    }
    
    const actualPrefixes = Object.keys(subjectBreakdown[dept]);
    
    for (const expectedPrefix of expectedPrefixes) {
      const count = subjectBreakdown[dept][expectedPrefix] || 0;
      
      if (count === 0) {
        console.log(`⚠️  ${dept}: ${expectedPrefix} courses missing (count = 0)`);
        issuesFound = true;
      }
    }
  }
  
  if (!issuesFound) {
    console.log('✅ No critical issues detected in subject distribution\n');
  } else {
    console.log('\n⚠️  Issues detected - review subject distribution above\n');
  }
  
  console.log('═══════════════════════════════════════════════════════\n');
}

// Run validation
validateSubjects().catch(error => {
  console.error('💥 Validation failed:', error);
  process.exit(1);
});
