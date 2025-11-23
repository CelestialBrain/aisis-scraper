import fs from 'fs';
import path from 'path';

/**
 * Baseline Manager for tracking scrape record counts across runs
 * 
 * Stores historical data in logs/baselines/ directory and provides
 * regression detection to alert when record counts drop significantly.
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
   */
  saveBaseline(term, data) {
    const baselinePath = this.getBaselinePath(term);
    
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
      baselineDir: this.baselineDir
    };
  }
}
