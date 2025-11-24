# CURRICULUM SCRAPING PERFORMANCE - Balanced Defaults

## Current Status (v3.3+)

The curriculum scraper now uses **balanced defaults** that provide good performance while maintaining safety:
- **1000ms delay** between requests (was 2000ms ultra-conservative)
- **Concurrency 2** for parallel scraping (was 1 sequential)
- **Combined: ~4x speedup** over previous ultra-conservative defaults
- **Safety maintained**: All requests validated via `_scrapeDegreeWithValidation`

## Performance Comparison

| Configuration | Time for 459 Programs | Notes |
|---------------|----------------------|-------|
| Ultra-conservative (concurrency=1, delay=2000ms) | ~35-40 minutes | Maximum safety, very slow |
| **Balanced default (concurrency=2, delay=1000ms)** | **~10-15 minutes** | **Good performance + safety (CURRENT)** |
| Fast mode (concurrency=2, delay=500ms) | ~6-8 minutes | Faster, still validated |
| Aggressive (concurrency=4, delay=0ms) | ~3-5 minutes | Fastest, higher risk |

## What Changed (v3.3)

### New Defaults (Automatic - No Action Required!)

```javascript
// PREVIOUS ultra-conservative defaults (slow)
CURRICULUM_DELAY_MS: 2000ms
CURRICULUM_CONCURRENCY: 1 (sequential)

// NEW balanced defaults (faster but still safe)
CURRICULUM_DELAY_MS: 1000ms
CURRICULUM_CONCURRENCY: 2 (parallel)
```

### Expected Performance

| Programs | Old Time (conservative) | New Time (balanced) | Speedup |
|----------|------------------------|---------------------|---------|
| 50 | ~3 minutes | ~1 minute | 3x |
| 100 | ~6 minutes | ~2 minutes | 3x |
| 459 | ~35-40 minutes | ~10-15 minutes | ~4x |

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

### For Faster Scraping (FAST_MODE)

Use FAST_MODE for quicker scraping while maintaining validation:

```bash
# Fast mode: 500ms delay, concurrency 2
FAST_MODE=true npm run curriculum
```

### For Maximum Speed (Higher Risk)

For local development or one-time scrapes where speed is critical:

```bash
# Aggressive: no delay, higher concurrency
FAST_MODE=true CURRICULUM_CONCURRENCY=4 npm run curriculum

# Or custom settings
CURRICULUM_DELAY_MS=0 CURRICULUM_CONCURRENCY=3 npm run curriculum
```

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
   📊 CURRICULUM_CONCURRENCY: 2 (default - parallel scraping with validation)

   ⚡ Using concurrent scraping with concurrency 2
      ℹ️  All requests validated via _scrapeDegreeWithValidation to prevent session bleed
   
   📖 Processing 459 curriculum versions...
   
   [Progress updates every 30 seconds with ETA]
   
   📊 Curriculum Scraping Summary:
      Total available: 459
      Requested: 459
      Successful: 459
      Failed: 0
      Total time: ~10-15 minutes  # ← Key improvement over 35-40 minutes!
```

## Rollback (if needed)

If you need to revert to ultra-conservative settings:

```bash
# In your .env file or GitHub Actions secrets:
CURRICULUM_DELAY_MS=2000
CURRICULUM_CONCURRENCY=1
```

## Questions?

- **Is this safe?** Yes, 1000ms delay with concurrency 2 is well-tested, and all requests are validated via `_scrapeDegreeWithValidation`
- **Will it break anything?** No, all tests pass and it's backward compatible
- **Can I go faster?** Yes, use FAST_MODE or custom env vars (at your own risk)
- **Can I go slower?** Yes, set CURRICULUM_DELAY_MS=2000 and CURRICULUM_CONCURRENCY=1 for ultra-safe mode
- **What about session bleed?** All requests are validated to prevent contaminated data, even with concurrency enabled

## Summary

🎉 **Curriculum scraping is now ~4x faster with balanced defaults!**

- Old ultra-conservative: ~35-40 minutes for 459 programs
- New balanced default: ~10-15 minutes for 459 programs
- Action required: None (automatic improvement)
- Backward compatible: Yes (can adjust via env vars)
- Safety maintained: Yes (all validation features active)
