import fs from 'fs';
import path from 'path';

/**
 * Baseline Manager for tracking scrape record counts across runs
 * 
 * Stores historical data in logs/baselines/ directory and provides
 * regression detection to alert when record counts drop significantly.
 * 
 * Configuration environment variables:
 * - BASELINE_DROP_THRESHOLD: Percentage threshold for regression alerts (default: 5.0)
 * - BASELINE_WARN_ONLY: If 'false', fail job on regression; otherwise warn (default: true)
 * - REQUIRE_BASELINES: If 'true', fail job if no baseline exists for a term (default: false)
 */
export class BaselineManager {
  // Default configuration constants
  static DEFAULT_DROP_THRESHOLD = 5.0;  // 5% drop threshold
  static MIN_THRESHOLD = 0.0;
  static MAX_THRESHOLD = 100.0;
  
  constructor(baselineDir = 'logs/baselines') {
    this.baselineDir = baselineDir;
    this.ensureBaselineDir();
    
    // Configuration with validation
    const rawThreshold = parseFloat(process.env.BASELINE_DROP_THRESHOLD || BaselineManager.DEFAULT_DROP_THRESHOLD.toString());
    
    // Validate threshold is within reasonable bounds (0-100%)
    if (isNaN(rawThreshold) || rawThreshold < BaselineManager.MIN_THRESHOLD || rawThreshold > BaselineManager.MAX_THRESHOLD) {
      console.warn(`   ⚠️ Invalid BASELINE_DROP_THRESHOLD: ${process.env.BASELINE_DROP_THRESHOLD}`);
      console.warn(`   Using default: ${BaselineManager.DEFAULT_DROP_THRESHOLD}%`);
      this.dropThresholdPercent = BaselineManager.DEFAULT_DROP_THRESHOLD;
    } else {
      this.dropThresholdPercent = rawThreshold;
    }
    
    this.warnOnly = process.env.BASELINE_WARN_ONLY !== 'false'; // Default to warn-only mode
    
    // REQUIRE_BASELINES: If true, fail when no baseline exists (prevents data loss from race conditions)
    // This should be enabled for production workflows after the first successful run
    this.requireBaselines = process.env.REQUIRE_BASELINES === 'true';
  }

  /**
   * Ensure baseline directory exists
   */
  ensureBaselineDir() {
    if (!fs.existsSync(this.baselineDir)) {
      fs.mkdirSync(this.baselineDir, { recursive: true });
    }
  }

  /**
   * Check if baselines directory has any baseline files
   * @returns {boolean} True if at least one baseline file exists
   */
  hasAnyBaselines() {
    try {
      const files = fs.readdirSync(this.baselineDir);
      return files.some(f => f.startsWith('baseline-') && f.endsWith('.json'));
    } catch (e) {
      return false;
    }
  }

  /**
   * Validate that baselines exist when REQUIRE_BASELINES is enabled.
   * Call this before starting any data ingestion to fail fast.
   * 
   * Behavior depends on BASELINE_WARN_ONLY setting:
   * - If warnOnly is true (default): emit warning and continue in bootstrap mode
   * - If warnOnly is false: throw error (strict mode)
   * 
   * @throws {Error} If REQUIRE_BASELINES is true, BASELINE_WARN_ONLY is false, and no baselines exist
   */
  validateBaselinesExist() {
    if (this.requireBaselines && !this.hasAnyBaselines()) {
      const message = `Baselines artifact 'baselines' missing.\n` +
        `The REQUIRE_BASELINES environment variable is set to 'true', but no baseline files were found.\n` +
        `This typically means the baselines artifact failed to download from previous runs.\n` +
        `Without baselines, we cannot detect data regressions and may risk data loss.`;
      
      if (this.warnOnly) {
        // Bootstrap mode: warn but continue
        console.warn(`\n⚠️ WARNING: ${message}`);
        console.warn(`   Proceeding in bootstrap mode (BASELINE_WARN_ONLY=true).`);
        console.warn(`   New baselines will be created and uploaded for future regression detection.`);
        console.warn(`   To enable strict mode, set BASELINE_WARN_ONLY=false.\n`);
        return;
      } else {
        // Strict mode: throw error
        const errorMessage = `FATAL: ${message}\n\n` +
          `Solutions:\n` +
          `1. Check if the 'baselines' artifact exists from previous workflow runs\n` +
          `2. Manually download and restore baselines from a known good run\n` +
          `3. Set REQUIRE_BASELINES=false to allow first-time runs (not recommended for production)`;
        
        console.error(`\n❌ ${errorMessage}`);
        throw new Error(errorMessage);
      }
    }
    
    if (this.requireBaselines) {
      console.log(`   ✅ Baselines validation passed: baseline files exist`);
    }
  }

  /**
   * Get baseline file path for a term
   */
  getBaselinePath(term) {
    return path.join(this.baselineDir, `baseline-${term}.json`);
  }

  /**
   * Load previous baseline for a term, if it exists
   * @param {string} term - Term code (e.g., '2025-1')
   * @returns {object|null} Previous baseline data or null
   */
  loadBaseline(term) {
    const baselinePath = this.getBaselinePath(term);
    
    if (!fs.existsSync(baselinePath)) {
      return null;
    }

    try {
      const data = fs.readFileSync(baselinePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.warn(`   ⚠️ Failed to load baseline for ${term}: ${error.message}`);
      return null;
    }
  }

  /**
   * Save new baseline for a term
   * @param {string} term - Term code
   * @param {object} data - Baseline data to save
   *   - totalRecords: number
   *   - departmentCounts: object (optional)
   *   - subjectPrefixCounts: object (optional, per-department subject prefix breakdown)
   */
  saveBaseline(term, data) {
    const baselinePath = this.getBaselinePath(term);
    
    // Optionally track subject prefix counts if TRACK_SUBJECT_PREFIXES is enabled
    const trackSubjectPrefixes = process.env.TRACK_SUBJECT_PREFIXES === 'true';
    
    if (trackSubjectPrefixes && data.subjectPrefixCounts) {
      console.log(`   📊 Saving subject prefix tracking for ${term}`);
    }
    
    try {
      fs.writeFileSync(baselinePath, JSON.stringify(data, null, 2));
      console.log(`   💾 Saved new baseline for ${term} to ${baselinePath}`);
    } catch (error) {
      console.error(`   ❌ Failed to save baseline for ${term}: ${error.message}`);
    }
  }

  /**
   * Compare current run with previous baseline
   * @param {string} term - Term code
   * @param {number} currentTotal - Current total record count
   * @param {object} currentDeptCounts - Per-department counts
   * @returns {object} Comparison results with regression detection
   */
  compareWithBaseline(term, currentTotal, currentDeptCounts = {}) {
    const previous = this.loadBaseline(term);
    
    if (!previous) {
      console.log(`\n📊 Baseline Comparison:`);
      console.log(`   No previous baseline found for term ${term}`);
      console.log(`   This is the first run or baseline file was not saved.`);
      console.log(`   Current total: ${currentTotal} records`);
      
      return {
        hasPrevious: false,
        currentTotal,
        previousTotal: null,
        percentChange: null,
        isRegression: false,
        message: 'No previous baseline for comparison'
      };
    }

    const previousTotal = previous.totalRecords;
    const diff = currentTotal - previousTotal;
    const percentChange = previousTotal > 0 
      ? ((diff / previousTotal) * 100).toFixed(2)
      : 0;
    
    const isSignificantDrop = diff < 0 && Math.abs(parseFloat(percentChange)) > this.dropThresholdPercent;

    console.log(`\n📊 Baseline Comparison:`);
    console.log(`   Term: ${term}`);
    console.log(`   Previous run: ${previous.timestamp}`);
    console.log(`   Previous total: ${previousTotal} records`);
    console.log(`   Current total: ${currentTotal} records`);
    console.log(`   Change: ${diff >= 0 ? '+' : ''}${diff} records (${percentChange >= 0 ? '+' : ''}${percentChange}%)`);
    
    if (isSignificantDrop) {
      console.log(`   ⚠️ WARNING: Record count dropped by ${Math.abs(diff)} records (${Math.abs(percentChange)}%)`);
      console.log(`   This exceeds the configured threshold of ${this.dropThresholdPercent}%`);
      
      // Show per-department comparison if available
      if (previous.departmentCounts && currentDeptCounts) {
        this.compareDepartmentCounts(previous.departmentCounts, currentDeptCounts);
      }
    } else if (diff < 0) {
      console.log(`   ℹ️  Record count decreased slightly (${Math.abs(percentChange)}%) - within threshold`);
    } else if (diff > 0) {
      console.log(`   ✅ Record count increased`);
    } else {
      console.log(`   ✅ Record count unchanged`);
    }

    return {
      hasPrevious: true,
      currentTotal,
      previousTotal,
      diff,
      percentChange: parseFloat(percentChange),
      isRegression: isSignificantDrop,
      threshold: this.dropThresholdPercent,
      warnOnly: this.warnOnly,
      previousTimestamp: previous.timestamp,
      message: isSignificantDrop 
        ? `Significant drop detected: ${Math.abs(diff)} records (${Math.abs(percentChange)}%)`
        : 'No significant regression detected'
    };
  }

  /**
   * Compare department counts between runs
   * @param {object} previousDepts - Previous department counts
   * @param {object} currentDepts - Current department counts
   */
  compareDepartmentCounts(previousDepts, currentDepts) {
    console.log(`\n   📋 Per-Department Changes:`);
    
    const allDepts = new Set([
      ...Object.keys(previousDepts),
      ...Object.keys(currentDepts)
    ]);

    const changes = [];
    
    for (const dept of allDepts) {
      const prev = previousDepts[dept] || 0;
      const curr = currentDepts[dept] || 0;
      const diff = curr - prev;
      
      if (diff !== 0) {
        changes.push({ dept, prev, curr, diff });
      }
    }

    // Sort by absolute diff descending
    changes.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    // Show top 10 changes
    const topChanges = changes.slice(0, 10);
    for (const { dept, prev, curr, diff } of topChanges) {
      const symbol = diff > 0 ? '+' : '';
      console.log(`      ${dept.padEnd(15)}: ${curr.toString().padStart(4)} (${symbol}${diff.toString().padStart(4)} from ${prev})`);
    }

    if (changes.length > 10) {
      console.log(`      ... and ${changes.length - 10} more departments with changes`);
    }
  }

  /**
   * Record current run as new baseline
   * @param {string} term - Term code
   * @param {number} totalRecords - Total record count
   * @param {object} departmentCounts - Per-department counts
   * @param {object} metadata - Additional metadata
   */
  recordBaseline(term, totalRecords, departmentCounts = {}, metadata = {}) {
    const baseline = {
      term,
      timestamp: new Date().toISOString(),
      totalRecords,
      departmentCounts,
      metadata: {
        ...metadata,
        githubRun: process.env.GITHUB_RUN_ID || null,
        githubSha: process.env.GITHUB_SHA || null
      }
    };

    this.saveBaseline(term, baseline);
    
    return baseline;
  }

  /**
   * Check if regression should cause job failure
   * @param {object} comparisonResult - Result from compareWithBaseline
   * @returns {boolean} True if job should fail
   */
  shouldFailJob(comparisonResult) {
    if (!comparisonResult.isRegression) {
      return false;
    }

    if (this.warnOnly) {
      console.log(`\n   ℹ️  BASELINE_WARN_ONLY is true - not failing job`);
      return false;
    }

    console.log(`\n   ⚠️ BASELINE_WARN_ONLY is false - job will fail due to regression`);
    return true;
  }

  /**
   * Get configuration summary
   */
  getConfigSummary() {
    return {
      dropThresholdPercent: this.dropThresholdPercent,
      warnOnly: this.warnOnly,
      requireBaselines: this.requireBaselines,
      baselineDir: this.baselineDir
    };
  }

  /**
   * Compare subject prefix counts between current and previous runs
   * Warns when specific subject prefixes (like PEPC) drop to zero for critical departments
   * 
   * @param {string} term - Term code
   * @param {object} currentCounts - Current per-department subject prefix counts
   *   Format: { 'PE': { 'PEPC': 152, 'NSTP': 79 }, ... }
   * @param {object} previousCounts - Previous per-department subject prefix counts (optional)
   *   If not provided, will attempt to load from baseline
   * @returns {object} Comparison result with warnings
   */
  compareSubjectPrefixes(term, currentCounts, previousCounts = null) {
    // Only run if TRACK_SUBJECT_PREFIXES is enabled
    const trackSubjectPrefixes = process.env.TRACK_SUBJECT_PREFIXES === 'true';
    if (!trackSubjectPrefixes) {
      return { enabled: false };
    }
    
    // If previousCounts not provided, try to load from baseline
    if (!previousCounts) {
      const baseline = this.loadBaseline(term);
      if (baseline && baseline.subjectPrefixCounts) {
        previousCounts = baseline.subjectPrefixCounts;
      }
    }
    
    if (!previousCounts) {
      console.log(`\n📊 Subject Prefix Tracking: No previous data for comparison`);
      return { enabled: true, hasPrevious: false };
    }
    
    console.log(`\n📊 Subject Prefix Comparison:`);
    
    const warnings = [];
    const criticalDepts = ['PE', 'NSTP']; // Departments where missing subjects are critical
    
    // Check for subjects that dropped to zero
    for (const dept of criticalDepts) {
      const currentDeptPrefixes = currentCounts[dept] || {};
      const previousDeptPrefixes = previousCounts[dept] || {};
      
      // Find prefixes that existed before but are now at zero
      for (const [prefix, prevCount] of Object.entries(previousDeptPrefixes)) {
        const currCount = currentDeptPrefixes[prefix] || 0;
        
        if (prevCount > 0 && currCount === 0) {
          const warning = `${dept}: ${prefix} dropped to zero (was ${prevCount})`;
          warnings.push(warning);
          console.log(`   ⚠️ ${warning}`);
        } else if (prevCount > 0 && currCount < prevCount) {
          const percentDrop = ((prevCount - currCount) / prevCount * 100).toFixed(1);
          console.log(`   ℹ️  ${dept}: ${prefix} decreased from ${prevCount} to ${currCount} (-${percentDrop}%)`);
        }
      }
    }
    
    if (warnings.length === 0) {
      console.log(`   ✅ No critical subject prefix regressions detected`);
    }
    
    return {
      enabled: true,
      hasPrevious: true,
      warnings,
      hasWarnings: warnings.length > 0
    };
  }

  /**
   * Get per-department baseline file path for a term
   * @param {string} term - Term code (e.g., '2025-1')
   * @returns {string} File path
   */
  getDepartmentBaselinePath(term) {
    return path.join(this.baselineDir, `baseline-${term}-departments.json`);
  }

  /**
   * Load per-department baseline for a term, if it exists
   * @param {string} term - Term code
   * @returns {object|null} Per-department baseline data or null
   */
  loadDepartmentBaseline(term) {
    const baselinePath = this.getDepartmentBaselinePath(term);
    
    if (!fs.existsSync(baselinePath)) {
      return null;
    }

    try {
      const data = fs.readFileSync(baselinePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.warn(`   ⚠️ Failed to load department baseline for ${term}: ${error.message}`);
      return null;
    }
  }

  /**
   * Save per-department baseline for a term
   * @param {string} term - Term code
   * @param {object} departmentData - Map from deptCode to { row_count, prefix_breakdown }
   *   Example: { 'MA': { row_count: 305, prefix_breakdown: { 'MATH': 305 } }, ... }
   */
  saveDepartmentBaseline(term, departmentData) {
    const baselinePath = this.getDepartmentBaselinePath(term);
    
    const baseline = {
      term,
      timestamp: new Date().toISOString(),
      departments: departmentData,
      metadata: {
        githubRun: process.env.GITHUB_RUN_ID || null,
        githubSha: process.env.GITHUB_SHA || null
      }
    };
    
    try {
      fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
      console.log(`   💾 Saved per-department baseline for ${term} to ${baselinePath}`);
    } catch (error) {
      console.error(`   ❌ Failed to save department baseline for ${term}: ${error.message}`);
    }
  }

  /**
   * Compare current per-department data with baseline
   * Detects significant drops in department row counts or missing critical subject prefixes
   * 
   * @param {string} term - Term code
   * @param {object} currentDeptData - Current per-department data
   *   Format: { 'MA': { row_count: 305, prefix_breakdown: { 'MATH': 305 } }, ... }
   * @returns {object} Comparison results with regression flags
   */
  compareWithDepartmentBaseline(term, currentDeptData) {
    const previous = this.loadDepartmentBaseline(term);
    
    if (!previous) {
      console.log(`\n📊 Per-Department Baseline Comparison:`);
      console.log(`   No previous per-department baseline found for term ${term}`);
      console.log(`   This is the first run or baseline file was not saved.`);
      
      return {
        hasPrevious: false,
        regressions: [],
        warnings: [],
        hasCriticalRegressions: false,
        message: 'No previous per-department baseline for comparison'
      };
    }

    // Get configured drop threshold (fraction, 0.0-1.0)
    const dropThreshold = parseFloat(process.env.BASELINE_DEPT_DROP_THRESHOLD || '0.5');
    
    console.log(`\n📊 Per-Department Baseline Comparison:`);
    console.log(`   Term: ${term}`);
    console.log(`   Previous run: ${previous.timestamp}`);
    console.log(`   Drop threshold: ${(dropThreshold * 100).toFixed(0)}%`);
    
    const regressions = [];
    const warnings = [];
    const previousDepts = previous.departments || {};
    
    // Critical departments that should trigger failures on regression
    const criticalDepts = ['MA', 'PE', 'NSTP (ADAST)', 'NSTP (OSCI)'];
    
    // Check each department in current data
    for (const [deptCode, currentData] of Object.entries(currentDeptData)) {
      const prevData = previousDepts[deptCode];
      
      if (!prevData) {
        // New department appeared - this is fine
        console.log(`   ℹ️  [${deptCode}] New department: ${currentData.row_count} rows`);
        continue;
      }
      
      const prevCount = prevData.row_count || 0;
      const currCount = currentData.row_count || 0;
      const diff = currCount - prevCount;
      const dropFraction = prevCount > 0 ? Math.abs(diff) / prevCount : 0;
      
      // Check for significant drop
      if (diff < 0 && dropFraction > dropThreshold) {
        const percentDrop = (dropFraction * 100).toFixed(1);
        const isCritical = criticalDepts.includes(deptCode);
        
        const regression = {
          department: deptCode,
          previousCount: prevCount,
          currentCount: currCount,
          diff,
          percentDrop,
          isCritical,
          reason: `Row count dropped by ${percentDrop}% (${prevCount} → ${currCount})`
        };
        
        regressions.push(regression);
        
        if (isCritical) {
          console.error(`   ❌ [${deptCode}] CRITICAL REGRESSION: ${regression.reason}`);
        } else {
          console.warn(`   ⚠️  [${deptCode}] Regression: ${regression.reason}`);
        }
        
        // Check prefix breakdown for additional insights
        if (currentData.prefix_breakdown && prevData.prefix_breakdown) {
          const currPrefixes = Object.keys(currentData.prefix_breakdown);
          const prevPrefixes = Object.keys(prevData.prefix_breakdown);
          const missingPrefixes = prevPrefixes.filter(p => !currPrefixes.includes(p));
          
          if (missingPrefixes.length > 0) {
            console.warn(`      Missing subject prefixes: ${missingPrefixes.join(', ')}`);
            regression.missingPrefixes = missingPrefixes;
          }
        }
      } else if (diff < 0) {
        // Small drop - log as info
        const percentDrop = (dropFraction * 100).toFixed(1);
        console.log(`   ℹ️  [${deptCode}] Small drop: ${percentDrop}% (${prevCount} → ${currCount})`);
      } else if (diff > 0) {
        console.log(`   ✅ [${deptCode}] Increase: +${diff} rows (${prevCount} → ${currCount})`);
      }
    }
    
    // Check for departments that disappeared entirely
    for (const [deptCode, prevData] of Object.entries(previousDepts)) {
      if (!currentDeptData[deptCode]) {
        const warning = {
          department: deptCode,
          previousCount: prevData.row_count || 0,
          currentCount: 0,
          reason: 'Department disappeared entirely'
        };
        warnings.push(warning);
        console.warn(`   ⚠️  [${deptCode}] WARNING: ${warning.reason} (had ${warning.previousCount} rows)`);
      }
    }
    
    // Summary
    if (regressions.length > 0) {
      console.log(`\n   ⚠️  Found ${regressions.length} department regression(s)`);
      const criticalCount = regressions.filter(r => r.isCritical).length;
      if (criticalCount > 0) {
        console.error(`      ${criticalCount} critical department(s) affected: ${regressions.filter(r => r.isCritical).map(r => r.department).join(', ')}`);
      }
    } else {
      console.log(`\n   ✅ No significant per-department regressions detected`);
    }
    
    return {
      hasPrevious: true,
      previousTimestamp: previous.timestamp,
      regressions,
      warnings,
      threshold: dropThreshold,
      hasCriticalRegressions: regressions.some(r => r.isCritical),
      message: regressions.length > 0 
        ? `Found ${regressions.length} department regression(s)`
        : 'No significant regressions'
    };
  }

  /**
   * Build per-department baseline data from scrape results
   * @param {Array} departmentsArray - Array of { department, courses } objects
   * @returns {object} Per-department data suitable for saveDepartmentBaseline
   */
  buildDepartmentBaselineData(departmentsArray) {
    const result = {};
    
    for (const { department, courses } of departmentsArray) {
      // Count courses by subject prefix
      const prefixBreakdown = {};
      for (const course of courses) {
        const prefix = course.subjectCode ? course.subjectCode.split(/[\s.\/]/)[0] : 'UNKNOWN';
        prefixBreakdown[prefix] = (prefixBreakdown[prefix] || 0) + 1;
      }
      
      result[department] = {
        row_count: courses.length,
        prefix_breakdown: prefixBreakdown
      };
    }
    
    return result;
  }
}
