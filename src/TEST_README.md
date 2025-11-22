# AISIS Scraper Tests

This directory contains test scripts for validating the AISIS scraper functionality.

## Running Tests

### Performance Configuration Tests

Tests the configurable batch size feature for Supabase sync:

```bash
node src/test-performance-config.js
```

**What it tests:**
- Default batch size (2000 records)
- Custom batch size via `SUPABASE_CLIENT_BATCH_SIZE` environment variable
- Fallback behavior for invalid values
- Large batch sizes (5000+)

### Term Override Tests

Tests the term override functionality:

```bash
node src/test-term-override.js
```

**What it tests:**
- `AISIS_TERM` environment variable override
- `APPLICABLE_PERIOD` legacy support
- Precedence when both variables are set
- Default behavior (auto-detect) when no override is set

### Batching Logic Tests

Tests the existing batching logic (from v3.1):

```bash
node src/test-batching.js
```

### Integration Tests

Tests end-to-end integration (requires credentials):

```bash
node src/test-integration.js
```

**Note:** This requires valid AISIS credentials and Supabase configuration in `.env` file.

## Test Output

All tests provide clear output:
- ✅ **PASSED**: Test succeeded
- ❌ **FAILED**: Test failed with details

Tests exit with code 0 on success, non-zero on failure.

## Adding New Tests

When adding new features, create corresponding test files:

1. Name the file `test-<feature>.js`
2. Include clear test descriptions
3. Use console.log for progress
4. Exit with non-zero code on failure
5. Document the test in this README

## CI Integration

These tests can be integrated into GitHub Actions workflows:

```yaml
- name: Run tests
  run: |
    node src/test-performance-config.js
    node src/test-term-override.js
```
