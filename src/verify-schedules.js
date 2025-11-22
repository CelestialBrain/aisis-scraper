import { AISISScraper } from './scraper.js';
import { createClient } from '@supabase/supabase-js';
import { DEPARTMENTS } from './constants.js';
import fs from 'fs';
import 'dotenv/config';

/**
 * Verification script to ensure all AISIS schedules are captured in Supabase
 * 
 * Usage:
 *   node src/verify-schedules.js [term] [department]
 *   
 * Examples:
 *   node src/verify-schedules.js 2025-1          # Verify all departments for term
 *   node src/verify-schedules.js 2025-1 ENGG     # Verify only ENGG department
 *   node src/verify-schedules.js                 # Auto-detect term, verify all
 */

class ScheduleVerifier {
  constructor() {
    this.scraper = null;
    this.supabase = null;
  }

  async init() {
    const { 
      AISIS_USERNAME, 
      AISIS_PASSWORD,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    } = process.env;

    if (!AISIS_USERNAME || !AISIS_PASSWORD) {
      throw new Error('Missing AISIS credentials');
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase credentials');
    }

    this.scraper = new AISISScraper(AISIS_USERNAME, AISIS_PASSWORD);
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    await this.scraper.init();
    await this.scraper.login();
  }

  /**
   * Verify schedules for a single department
   */
  async verifyDepartment(term, department) {
    console.log(`\n🔍 Verifying ${department} for term ${term}...`);

    // Step 1: Scrape from AISIS
    console.log(`   📥 Scraping ${department} from AISIS...`);
    const scrapedCourses = await this.scraper._scrapeDepartment(term, department);
    
    // Create set of unique identifiers for scraped courses
    const scrapedKeys = new Set(
      scrapedCourses.map(c => `${c.subjectCode}|${c.section}`)
    );

    console.log(`   ✅ Found ${scrapedCourses.length} courses in AISIS`);

    // Step 2: Query Supabase
    console.log(`   🗄️  Querying Supabase for ${department}, term ${term}...`);
    const { data: dbCourses, error } = await this.supabase
      .from('aisis_schedules')
      .select('subject_code, section, course_title')
      .eq('term_code', term)
      .eq('department', department);

    if (error) {
      throw new Error(`Supabase query failed: ${error.message}`);
    }

    // Create set of unique identifiers for DB courses
    const dbKeys = new Set(
      dbCourses.map(c => `${c.subject_code}|${c.section}`)
    );

    console.log(`   ✅ Found ${dbCourses.length} courses in Supabase`);

    // Step 3: Compare
    const missingInDb = [...scrapedKeys].filter(key => !dbKeys.has(key));
    const extraInDb = [...dbKeys].filter(key => !scrapedKeys.has(key));

    const result = {
      department,
      term,
      aisis_count: scrapedCourses.length,
      db_count: dbCourses.length,
      match: missingInDb.length === 0 && extraInDb.length === 0,
      missing_in_db: missingInDb.map(key => {
        const [subject, section] = key.split('|');
        const course = scrapedCourses.find(c => c.subjectCode === subject && c.section === section);
        return {
          subject_code: subject,
          section: section,
          title: course?.title || 'Unknown'
        };
      }),
      extra_in_db: extraInDb.map(key => {
        const [subject, section] = key.split('|');
        const course = dbCourses.find(c => c.subject_code === subject && c.section === section);
        return {
          subject_code: subject,
          section: section,
          title: course?.course_title || 'Unknown'
        };
      })
    };

    // Print results
    if (result.match) {
      console.log(`   ✅ MATCH: All ${scrapedCourses.length} courses are in sync`);
    } else {
      if (missingInDb.length > 0) {
        console.log(`   ❌ MISMATCH: ${missingInDb.length} courses in AISIS but NOT in DB:`);
        result.missing_in_db.slice(0, 5).forEach(c => {
          console.log(`      - ${c.subject_code} ${c.section}: ${c.title}`);
        });
        if (missingInDb.length > 5) {
          console.log(`      ... and ${missingInDb.length - 5} more`);
        }
      }
      
      if (extraInDb.length > 0) {
        console.log(`   ⚠️  ${extraInDb.length} courses in DB but NOT in current AISIS:`);
        result.extra_in_db.slice(0, 5).forEach(c => {
          console.log(`      - ${c.subject_code} ${c.section}: ${c.title}`);
        });
        if (extraInDb.length > 5) {
          console.log(`      ... and ${extraInDb.length - 5} more`);
        }
      }
    }

    return result;
  }

  /**
   * Verify all departments for a term
   */
  async verifyTerm(term) {
    const departments = DEPARTMENTS;

    console.log(`\n🔍 Verifying all ${departments.length} departments for term ${term}...`);

    const results = [];
    let matchCount = 0;
    let mismatchCount = 0;

    for (const dept of departments) {
      try {
        const result = await this.verifyDepartment(term, dept);
        results.push(result);
        
        if (result.match) {
          matchCount++;
        } else {
          mismatchCount++;
        }

        // Small delay between departments
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`   ❌ Error verifying ${dept}: ${error.message}`);
        results.push({
          department: dept,
          term,
          error: error.message,
          match: false
        });
        mismatchCount++;
      }
    }

    // Summary
    const summary = {
      term,
      timestamp: new Date().toISOString(),
      total_departments: departments.length,
      matched: matchCount,
      mismatched: mismatchCount,
      total_aisis_courses: results.reduce((sum, r) => sum + (r.aisis_count || 0), 0),
      total_db_courses: results.reduce((sum, r) => sum + (r.db_count || 0), 0),
      departments: results
    };

    // Save report
    if (!fs.existsSync('logs')) fs.mkdirSync('logs');
    const reportPath = `logs/verification-${term}-${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));

    // Print summary
    console.log(`\n📊 Verification Summary for ${term}:`);
    console.log(`   Total departments: ${summary.total_departments}`);
    console.log(`   ✅ Matched: ${summary.matched}`);
    console.log(`   ❌ Mismatched: ${summary.mismatched}`);
    console.log(`   📚 Total AISIS courses: ${summary.total_aisis_courses}`);
    console.log(`   🗄️  Total DB courses: ${summary.total_db_courses}`);
    console.log(`\n📄 Full report saved to: ${reportPath}`);

    // Generate markdown report
    const mdPath = reportPath.replace('.json', '.md');
    this.generateMarkdownReport(summary, mdPath);
    console.log(`📄 Markdown report saved to: ${mdPath}`);

    return summary;
  }

  /**
   * Generate human-readable markdown report
   */
  generateMarkdownReport(summary, path) {
    const lines = [];
    
    lines.push(`# AISIS Schedule Verification Report`);
    lines.push(`**Term:** ${summary.term}  `);
    lines.push(`**Date:** ${new Date(summary.timestamp).toLocaleString()}  `);
    lines.push(``);
    
    lines.push(`## Summary`);
    lines.push(`- Total departments: ${summary.total_departments}`);
    lines.push(`- ✅ Matched: ${summary.matched}`);
    lines.push(`- ❌ Mismatched: ${summary.mismatched}`);
    lines.push(`- Total AISIS courses: ${summary.total_aisis_courses}`);
    lines.push(`- Total DB courses: ${summary.total_db_courses}`);
    lines.push(``);

    // Mismatches
    const mismatched = summary.departments.filter(d => !d.match);
    if (mismatched.length > 0) {
      lines.push(`## Mismatched Departments (${mismatched.length})`);
      lines.push(``);
      
      for (const dept of mismatched) {
        lines.push(`### ${dept.department}`);
        
        if (dept.error) {
          lines.push(`**Error:** ${dept.error}`);
        } else {
          lines.push(`- AISIS: ${dept.aisis_count} courses`);
          lines.push(`- DB: ${dept.db_count} courses`);
          
          if (dept.missing_in_db && dept.missing_in_db.length > 0) {
            lines.push(``);
            lines.push(`**Missing in DB (${dept.missing_in_db.length}):**`);
            dept.missing_in_db.forEach(c => {
              lines.push(`- ${c.subject_code} ${c.section}: ${c.title}`);
            });
          }
          
          if (dept.extra_in_db && dept.extra_in_db.length > 0) {
            lines.push(``);
            lines.push(`**Extra in DB (${dept.extra_in_db.length}):**`);
            dept.extra_in_db.forEach(c => {
              lines.push(`- ${c.subject_code} ${c.section}: ${c.title}`);
            });
          }
        }
        
        lines.push(``);
      }
    }

    // All matched
    const matched = summary.departments.filter(d => d.match);
    if (matched.length > 0) {
      lines.push(`## Matched Departments (${matched.length})`);
      lines.push(``);
      matched.forEach(d => {
        lines.push(`- ✅ ${d.department}: ${d.aisis_count} courses`);
      });
    }

    fs.writeFileSync(path, lines.join('\n'));
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const term = args[0] || null;
  const department = args[1] || null;

  console.log('═══════════════════════════════════════════════════════');
  console.log('🔍 AISIS Schedule Verification Tool');
  console.log('═══════════════════════════════════════════════════════\n');

  const verifier = new ScheduleVerifier();
  
  try {
    await verifier.init();

    // Determine term
    let usedTerm = term;
    if (!usedTerm) {
      console.log('🔍 Auto-detecting current term from AISIS...');
      usedTerm = await verifier.scraper._detectCurrentTerm();
      console.log(`   ✅ Detected term: ${usedTerm}`);
    }

    // Verify
    if (department) {
      await verifier.verifyDepartment(usedTerm, department);
    } else {
      await verifier.verifyTerm(usedTerm);
    }

    console.log('\n✅ Verification complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
