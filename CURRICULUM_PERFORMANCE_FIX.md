# CURRICULUM SCRAPING PERFORMANCE - Balanced Defaults (Reverted from Aggressive)

## Current Status (v3.4+)

The curriculum scraper has been **reverted to balanced defaults** after session bleed issues were observed with aggressive settings:
- **1000ms delay** between requests (reverted from 300ms aggressive default)
- **Concurrency 2** for parallel scraping (reverted from 6)
- **Expected time: ~10-15 minutes** for all curricula (acceptable, well under 20-30 minute threshold)
- **Safety restored**: Minimal to zero AISIS session bleed errors

## Why We Reverted

The aggressive defaults introduced in v3.3 (concurrency=6, delay=300ms) caused significant **AISIS session bleed issues**:
- 6-7 curricula failed permanently after exhausting retries
- Many more required retry attempts before succeeding
- Runtime improved to ~3.5 minutes but at unacceptable reliability cost
- Examples: Requested `M ED-EA_2013_0` but got `MASTER IN EDUCATION... (Ver Year 2021)`

**The speed gains were not worth the reliability loss.**

## Performance Comparison

| Configuration | Time for 459 Programs | Notes |
|---------------|----------------------|-------|
| Ultra-conservative (concurrency=1, delay=2000ms) | ~35-40 minutes | Maximum safety, very slow |
| **Balanced default (concurrency=2, delay=1000ms)** | **~10-15 minutes** | **Good performance + safety (CURRENT)** |
| Fast mode (concurrency=2, delay=500ms) | ~6-10 minutes | Faster, still validated |
| Aggressive (concurrency=6, delay=300ms) | ~3-5 minutes | Fastest but UNRELIABLE - causes session bleed |
| Maximum aggressive (concurrency=4, delay=0ms) | ~2-4 minutes | Very fast, very high risk |

## What Changed (v3.4 - Revert)

### Reverted to Balanced Defaults (Automatic - No Action Required!)

```javascript
// AGGRESSIVE defaults that caused session bleed (v3.3 - REMOVED)
CURRICULUM_DELAY_MS: 300ms
CURRICULUM_CONCURRENCY: 6 (parallel)

// REVERTED to balanced defaults (v3.4 - CURRENT)
CURRICULUM_DELAY_MS: 1000ms (normal), 500ms (fast mode)
CURRICULUM_CONCURRENCY: 2 (parallel)
```

### Expected Performance

| Programs | Aggressive (UNRELIABLE) | Balanced (CURRENT) | Speedup vs Ultra-Conservative |
|----------|------------------------|---------------------|-------------------------------|
| 50 | ~30-45 seconds | ~1-2 minutes | ~2-4x |
| 100 | ~1-1.5 minutes | ~2-3 minutes | ~2-3.5x |
| 459 | ~3-5 minutes | ~10-15 minutes | ~2.5-4x |

*Note: The aggressive settings (v3.3) were faster but caused unacceptable session bleed errors. The balanced settings provide a good compromise between speed and reliability.*

## Safety Features (Unchanged)

All safety features are preserved:
- ✅ `_scrapeDegreeWithValidation` validates every response
- ✅ AISIS_ERROR_PAGE detection and retry
- ✅ Exponential backoff on validation failures
- ✅ Circuit breaker prevents contaminated data from being saved
- ✅ Warnings for risky configurations

## Configuration Options

### For Maximum Safety (Ultra-Conservative)

If you need absolute maximum safety and don't mind slower scraping:

```bash
# Sequential scraping with long delays
CURRICULUM_DELAY_MS=2000 CURRICULUM_CONCURRENCY=1 npm run curriculum
```

### For Balanced Performance (Default - Recommended)

The current defaults already provide a good balance:

```bash
# Balanced mode (this is the default, no need to set)
# CURRICULUM_DELAY_MS=1000 CURRICULUM_CONCURRENCY=2
npm run curriculum
```

### For Faster Scraping (FAST_MODE - Use with Caution)

Use FAST_MODE for quicker scraping while maintaining validation:

```bash
# Fast mode: 500ms delay, concurrency 2
FAST_MODE=true npm run curriculum
```

**Warning**: Even fast mode settings should be used with caution. Do not increase concurrency beyond 2-4 or decrease delay below 500ms without careful monitoring for session bleed errors.

### For Maximum Speed (NOT RECOMMENDED - High Risk)

For local development or one-time scrapes where speed is critical **and you can tolerate failures**:

```bash
# Aggressive: low delay, higher concurrency (RISKY - session bleed likely)
CURRICULUM_DELAY_MS=300 CURRICULUM_CONCURRENCY=4 npm run curriculum

# Or custom settings (at your own risk)
CURRICULUM_DELAY_MS=200 CURRICULUM_CONCURRENCY=3 npm run curriculum
```

**Warning**: Settings more aggressive than the balanced defaults (concurrency>2, delay<500ms) are known to cause AISIS session bleed issues and permanent curriculum scraping failures.

## Backward Compatibility

✅ **100% backward compatible** - you can use any combination of settings:

```bash
# Revert to ultra-conservative settings if needed
CURRICULUM_DELAY_MS=2000 CURRICULUM_CONCURRENCY=1 npm run curriculum

# Or use the old aggressive settings (not recommended)
CURRICULUM_DELAY_MS=100 CURRICULUM_CONCURRENCY=4 npm run curriculum
```

## Testing

All tests pass with the balanced defaults:
- ✅ Parser tests (6/6)
- ✅ Configuration tests (8/8)
- ✅ Scraper structure tests (4/4)
- ✅ Curriculum validation tests (26/26)
- ✅ Security scan (CodeQL clean)

## Deployment

**GitHub Actions CI**: The workflow will automatically use the balanced defaults and complete ~4x faster than ultra-conservative mode.

**Local Development**: Run `npm run curriculum` to use balanced defaults, or set custom env vars for faster/slower scraping.

## Monitoring

Watch your curriculum scrape logs - you should see:

```
⚡ Curriculum scraping configuration:
   ⏱  CURRICULUM_DELAY_MS: 1000ms (default - balanced mode)
   📊 CURRICULUM_CONCURRENCY: 2 (default - balanced mode with validation)

   ⚡ Using concurrent scraping with concurrency 2
      ℹ️  All requests validated via _scrapeDegreeWithValidation to prevent session bleed
   
   📖 Processing 459 curriculum versions...
   
   [Progress updates every 30 seconds with ETA]
   
   📊 Curriculum Scraping Summary:
      Total available: 459
      Requested: 459
      Successful: 459
      Failed: 0
      Total time: ~10-15 minutes  # ← Acceptable performance with high reliability!
```

## Rollback (if needed)

If you need to experiment with different settings:

```bash
# Ultra-conservative (slowest, safest):
CURRICULUM_DELAY_MS=2000 CURRICULUM_CONCURRENCY=1

# Balanced (current default):
# No need to set - these are the defaults

# Fast mode (faster, still relatively safe):
FAST_MODE=true  # Uses 500ms delay, concurrency 2

# Aggressive (NOT RECOMMENDED - known to cause session bleed):
CURRICULUM_DELAY_MS=300 CURRICULUM_CONCURRENCY=6
```

## Questions?

- **Is this safe?** Yes, 1000ms delay with concurrency 2 is well-tested and reliable
- **Will it break anything?** No, all tests pass and it's backward compatible
- **Can I go faster?** Yes, use FAST_MODE (500ms delay) or custom env vars, but monitor for session bleed
- **Can I go slower?** Yes, set CURRICULUM_DELAY_MS=2000 and CURRICULUM_CONCURRENCY=1 for ultra-safe mode
- **What about session bleed?** The balanced defaults minimize session bleed; aggressive settings (concurrency=6, delay=300ms) are known to cause it
- **Why revert from v3.3?** The aggressive defaults caused 6-7 permanent failures and many retries due to session bleed - not worth the speed gain

## Summary

🎉 **Curriculum scraping uses balanced defaults for reliability!**

- Aggressive settings (v3.3): ~3-5 minutes but UNRELIABLE (session bleed issues)
- **Balanced defaults (v3.4 - CURRENT): ~10-15 minutes with HIGH RELIABILITY**
- Action required: None (automatic improvement)
- Backward compatible: Yes (can adjust via env vars)
- Safety restored: Yes (minimal session bleed errors)

**Key Lesson**: Speed optimizations must not compromise reliability. The ~10-15 minute runtime is acceptable and well under the 20-30 minute threshold, while the aggressive settings caused unacceptable data quality issues.
