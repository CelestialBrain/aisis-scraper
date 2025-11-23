-- Migration: Add unique constraint to curriculum_versions
-- Created: 2025-01-23
-- Purpose: Add UNIQUE constraint on (program_id, version_year, version_sem, version_seq)
--          to support idempotent upserts in the curriculum ingestion edge function
--
-- This migration implements Option A from the requirements:
-- - Add unique constraint on (program_id, version_year, version_sem, version_seq)
-- - Does NOT include track_id (that would be Option B)
-- - Does NOT change the existing primary key or foreign keys

-- ============================================================================
-- STEP 1: Check for potential duplicate records
-- ============================================================================
-- Before adding the constraint, we need to ensure no existing data violates it.
-- This query identifies any duplicates that would prevent the constraint from being added.
--
-- Run this query manually BEFORE applying this migration in production:
--
-- SELECT 
--   program_id, 
--   version_year, 
--   version_sem, 
--   version_seq,
--   COUNT(*) as duplicate_count,
--   ARRAY_AGG(id) as duplicate_ids
-- FROM curriculum_versions
-- WHERE version_year IS NOT NULL 
--   AND version_sem IS NOT NULL 
--   AND version_seq IS NOT NULL
-- GROUP BY program_id, version_year, version_sem, version_seq
-- HAVING COUNT(*) > 1
-- ORDER BY duplicate_count DESC;
--
-- If duplicates are found:
-- 1. Review the duplicate records (use the duplicate_ids)
-- 2. Decide which record to keep (usually the most recent or complete one)
-- 3. Delete or merge the duplicate records manually
-- 4. Re-run the check query to confirm no duplicates remain
-- 5. Then proceed with this migration
--
-- Example cleanup query (adjust WHERE clause as needed):
-- DELETE FROM curriculum_versions 
-- WHERE id = <specific_duplicate_id_to_remove>;

-- ============================================================================
-- STEP 2: Add the unique constraint
-- ============================================================================
-- This constraint ensures that each combination of:
-- (program_id, version_year, version_sem, version_seq)
-- can only exist once in the table.
--
-- This allows the edge function to use:
-- .upsert(..., { onConflict: 'program_id,version_year,version_sem,version_seq' })
--
-- Note: This constraint will fail if there are existing duplicates in the table.
-- Ensure STEP 1 cleanup is complete before running this.

ALTER TABLE curriculum_versions
ADD CONSTRAINT curriculum_versions_program_version_unique
UNIQUE (program_id, version_year, version_sem, version_seq);

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After applying this migration, verify the constraint exists:
--
-- SELECT constraint_name, constraint_type 
-- FROM information_schema.table_constraints 
-- WHERE table_name = 'curriculum_versions' 
--   AND constraint_name = 'curriculum_versions_program_version_unique';
--
-- Expected result: One row with constraint_type = 'UNIQUE'

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- If you need to remove this constraint:
--
-- ALTER TABLE curriculum_versions
-- DROP CONSTRAINT curriculum_versions_program_version_unique;
