// Edge Function: github-data-ingest
// Receives scraped data from the AISIS scraper and syncs it to the database
// Implements batched upsert logic to prevent 504 timeouts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Constants
// DB batch size - configurable via environment variable for performance tuning
// Default: 100 records per DB transaction
// Range: 50-500 (enforced for safety)
// Larger batches = faster but more risk of timeout, smaller = slower but more reliable
const DEFAULT_BATCH_SIZE = 100;
const MIN_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 500;

// Sample size for logging invalid records
const SAMPLE_INVALID_RECORDS_COUNT = 3;

// Common header/placeholder values that should not be treated as course records
const HEADER_MARKERS = {
  SUBJECT_CODE: ['SUBJECT CODE', 'SUBJ CODE', 'CODE'],
  SECTION: ['SECTION', 'SEC'],
  COURSE_TITLE: ['COURSE TITLE', 'TITLE', 'COURSE'],
  UNITS: ['UNITS', 'U'],
  TIME: ['TIME', 'SCHEDULE'],
  ROOM: ['ROOM', 'RM'],
  INSTRUCTOR: ['INSTRUCTOR', 'FACULTY']
};

// Parse batch size from environment with bounds checking
function getBatchSize(): number {
  const envValue = Deno.env.get('GITHUB_INGEST_DB_BATCH_SIZE');
  if (!envValue) {
    return DEFAULT_BATCH_SIZE;
  }
  
  const parsed = parseInt(envValue, 10);
  if (isNaN(parsed)) {
    console.warn(`Invalid GITHUB_INGEST_DB_BATCH_SIZE: "${envValue}", using default ${DEFAULT_BATCH_SIZE}`);
    return DEFAULT_BATCH_SIZE;
  }
  
  // Clamp to valid range
  if (parsed < MIN_BATCH_SIZE) {
    console.warn(`GITHUB_INGEST_DB_BATCH_SIZE ${parsed} below minimum ${MIN_BATCH_SIZE}, using minimum`);
    return MIN_BATCH_SIZE;
  }
  
  if (parsed > MAX_BATCH_SIZE) {
    console.warn(`GITHUB_INGEST_DB_BATCH_SIZE ${parsed} above maximum ${MAX_BATCH_SIZE}, using maximum`);
    return MAX_BATCH_SIZE;
  }
  
  console.log(`Using custom DB batch size: ${parsed}`);
  return parsed;
}

const BATCH_SIZE = getBatchSize();
const ONCONFLICT_SCHEDULES = 'term_code,subject_code,section,department'; // Matches DB unique constraint

// Interfaces
interface ScheduleRecord {
  term_code: string;
  subject_code: string;
  section: string;
  department: string;
  course_title?: string;
  units?: number;
  time_pattern?: string;
  start_time?: string;
  end_time?: string;
  days_of_week?: string;
  room?: string;
  instructor?: string;
  language?: string;
  level?: string;
  remarks?: string;
  max_capacity?: number;
  delivery_mode?: string | null;
}

interface CurriculumRecord {
  degree_code: string;
  program_label?: string;
  program_title?: string;
  year_level?: number;
  semester?: number;
  course_code: string;
  course_title?: string;
  course_description?: string;
  units?: number;
  prerequisites?: string;
  category?: string;
}

interface CurriculumVersionPayload {
  program_code: string;
  version_label: string;
  version_year?: number;
  version_sem?: number;
  version_seq?: number;
  track_name?: string;
  is_active?: boolean;
  requirement_groups?: RequirementGroup[];
}

interface RequirementGroup {
  group_name: string;
  year_level?: number;
  semester?: number;
  min_units?: number;
  rules?: RequirementRule[];
}

interface RequirementRule {
  course_code: string;
  course_title?: string;
  tag_pattern?: string;
  category?: string;
}

interface IngestPayload {
  data_type: 'schedules' | 'curriculum' | 'curriculum_version';
  records: ScheduleRecord[] | CurriculumRecord[] | CurriculumVersionPayload[];
  metadata?: {
    term_code?: string;
    department?: string;
    record_count?: number;
    replace_existing?: boolean;
  };
}

interface BatchResult {
  inserted: number;
  errors: string[];
  filtered_headers: number;
  filtered_invalid: number;
}

// Helper: Add delay between batches to avoid rate limits
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Check if a schedule record appears to be a header or placeholder row
function isHeaderLikeRecord(record: ScheduleRecord): boolean {
  if (!record) return true;
  
  const subjectCode = (record.subject_code || '').toUpperCase().trim();
  const courseTitle = (record.course_title || '').toUpperCase().trim();
  const section = (record.section || '').toUpperCase().trim();
  
  // Check for header marker values
  if (HEADER_MARKERS.SUBJECT_CODE.some(marker => subjectCode === marker)) return true;
  if (HEADER_MARKERS.SECTION.some(marker => section === marker)) return true;
  if (HEADER_MARKERS.COURSE_TITLE.some(marker => courseTitle === marker)) return true;
  
  // Check for obviously invalid patterns
  if (subjectCode === '' && courseTitle === '') return true;
  
  return false;
}

// Helper: Validate schedule record has required fields
function validateScheduleRecord(record: ScheduleRecord): boolean {
  return !!(
    record.term_code &&
    record.subject_code &&
    record.section &&
    record.department &&
    record.term_code.trim() !== '' &&
    record.subject_code.trim() !== '' &&
    record.section.trim() !== '' &&
    record.department.trim() !== ''
  );
}

// Helper: Batch upsert schedules with proper error handling
async function upsertSchedulesInBatches(
  supabase: any,
  schedules: ScheduleRecord[],
  metadata: any,
  batchSize: number = BATCH_SIZE
): Promise<BatchResult> {
  const result: BatchResult = {
    inserted: 0,
    errors: [],
    filtered_headers: 0,
    filtered_invalid: 0
  };

  // Filter out header/placeholder records first
  const headerSamples: ScheduleRecord[] = [];
  const nonHeaderSchedules = schedules.filter(record => {
    if (isHeaderLikeRecord(record)) {
      result.filtered_headers++;
      if (headerSamples.length < SAMPLE_INVALID_RECORDS_COUNT) {
        headerSamples.push(record);
      }
      return false;
    }
    return true;
  });

  if (result.filtered_headers > 0) {
    console.log(`Filtered ${result.filtered_headers} header/placeholder record(s)`);
    if (headerSamples.length > 0) {
      console.log(`Sample header records:`, JSON.stringify(headerSamples.slice(0, SAMPLE_INVALID_RECORDS_COUNT)));
    }
  }

  // Filter out invalid records (missing required fields)
  const invalidSamples: ScheduleRecord[] = [];
  const validSchedules = nonHeaderSchedules.filter(record => {
    if (!validateScheduleRecord(record)) {
      result.filtered_invalid++;
      if (invalidSamples.length < SAMPLE_INVALID_RECORDS_COUNT) {
        invalidSamples.push(record);
      }
      return false;
    }
    return true;
  });
  
  if (result.filtered_invalid > 0) {
    console.log(`Filtered ${result.filtered_invalid} invalid record(s) (missing required fields)`);
    if (invalidSamples.length > 0) {
      console.log(`Sample invalid records:`, JSON.stringify(invalidSamples.slice(0, SAMPLE_INVALID_RECORDS_COUNT)));
    }
  }

  // Optional: Delete existing records for this term/department if replace_existing is true
  if (metadata?.replace_existing && metadata?.term_code && metadata?.department) {
    console.log(`Replacing existing records for term=${metadata.term_code}, department=${metadata.department}`);
    try {
      // First, count how many records will be deleted for telemetry
      // Build count query - handle department='ALL' specially to count all departments
      let countQuery = supabase
        .from('aisis_schedules')
        .select('*', { count: 'exact', head: true })
        .eq('term_code', metadata.term_code);
      
      // Only filter by department if it's not 'ALL' (which means all departments)
      if (metadata.department !== 'ALL') {
        countQuery = countQuery.eq('department', metadata.department);
      }
      
      const { count: countToDelete, error: countError } = await countQuery;
      
      if (countError) {
        console.warn(`Warning: Could not count existing records before delete: ${countError.message}`);
      } else if (countToDelete !== null) {
        console.log(`Found ${countToDelete} existing records to delete`);
        
        // Log warning for large deletions with department='ALL'
        const LARGE_DELETION_THRESHOLD = 1000;
        if (countToDelete > LARGE_DELETION_THRESHOLD && metadata.department === 'ALL') {
          console.warn('⚠️ LARGE SCHEDULE DELETION DETECTED', {
            term_code: metadata.term_code,
            department: metadata.department,
            deleted_count: countToDelete,
            threshold: LARGE_DELETION_THRESHOLD,
            message: `Deleting ${countToDelete} schedules for entire term - ensure this is intentional`
          });
        }
      }
      
      // Build delete query - handle department='ALL' specially to delete all departments
      let deleteQuery = supabase
        .from('aisis_schedules')
        .delete()
        .eq('term_code', metadata.term_code);
      
      // Only filter by department if it's not 'ALL' (which means all departments)
      if (metadata.department !== 'ALL') {
        deleteQuery = deleteQuery.eq('department', metadata.department);
      }
      
      const { error: deleteError } = await deleteQuery;
      
      if (deleteError) {
        console.error(`Failed to delete existing records: ${deleteError.message}`);
        result.errors.push(`Delete failed: ${deleteError.message}`);
      } else {
        console.log(`Deleted existing records for term=${metadata.term_code}, department=${metadata.department}`);
        
        // Log deletion telemetry in response if count was available
        if (countToDelete !== null && countToDelete > 0) {
          console.log(`Deletion completed: ${countToDelete} records removed`);
        }
      }
    } catch (err) {
      console.error(`Exception during delete: ${err.message}`);
      result.errors.push(`Delete exception: ${err.message}`);
    }
  }

  // Process in batches
  for (let i = 0; i < validSchedules.length; i += batchSize) {
    const batch = validSchedules.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(validSchedules.length / batchSize);

    console.log(`Processing batch ${batchIndex}/${totalBatches} (${batch.length} records)...`);

    try {
      const { error, count } = await supabase
        .from('aisis_schedules')
        .upsert(batch, {
          onConflict: ONCONFLICT_SCHEDULES,
          count: 'exact'
        });

      if (error) {
        const errorMsg = `Batch ${batchIndex} failed: ${error.message}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      } else {
        const insertedCount = count ?? batch.length;
        result.inserted += insertedCount;
        console.log(`Batch ${batchIndex} completed: ${insertedCount} records upserted`);
      }
    } catch (err) {
      const errorMsg = `Batch ${batchIndex} exception: ${err.message}`;
      console.error(errorMsg);
      result.errors.push(errorMsg);
    }

    // Small delay between batches to avoid overwhelming the database
    if (i + batchSize < validSchedules.length) {
      await delay(100);
    }
  }

  return result;
}

// Helper: Upsert curriculum records
async function upsertCurriculum(
  supabase: any,
  curriculum: CurriculumRecord[]
): Promise<BatchResult> {
  const result: BatchResult = {
    inserted: 0,
    errors: [],
    filtered_headers: 0,
    filtered_invalid: 0
  };

  // Curriculum typically has fewer records, but we still batch for consistency
  const batchSize = 500;

  for (let i = 0; i < curriculum.length; i += batchSize) {
    const batch = curriculum.slice(i, i + batchSize);

    try {
      const { error, count } = await supabase
        .from('aisis_curriculum')
        .upsert(batch, {
          onConflict: 'degree_code,course_code',
          count: 'exact'
        });

      if (error) {
        const errorMsg = `Curriculum batch failed: ${error.message}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      } else {
        result.inserted += count ?? batch.length;
      }
    } catch (err) {
      const errorMsg = `Curriculum batch exception: ${err.message}`;
      console.error(errorMsg);
      result.errors.push(errorMsg);
    }
  }

  return result;
}

// Helper: Upsert curriculum versions with requirement groups and rules
async function upsertCurriculumVersions(
  supabase: any,
  versions: CurriculumVersionPayload[],
  metadata: any
): Promise<BatchResult> {
  const result: BatchResult = {
    inserted: 0,
    errors: [],
    filtered_headers: 0,
    filtered_invalid: 0
  };

  console.log(`Processing ${versions.length} curriculum version(s)...`);

  for (const versionPayload of versions) {
    try {
      const {
        program_code,
        version_label,
        version_year,
        version_sem,
        version_seq,
        track_name,
        is_active,
        requirement_groups
      } = versionPayload;

      // Log the key fields being used for curriculum version lookup
      console.log(`Processing curriculum version: program_code=${program_code}, version_label=${version_label}, track=${track_name || 'null'}`);

      // Step 1: Lookup program_id from programs table
      const { data: programData, error: programLookupError } = await supabase
        .from('programs')
        .select('id')
        .eq('code', program_code)
        .single();

      if (programLookupError || !programData) {
        const errorMsg = `Program lookup failed for code=${program_code}: ${programLookupError?.message || 'not found'}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
        continue;
      }

      const program_id = programData.id;
      console.log(`  Found program_id=${program_id} for program_code=${program_code}`);

      // Step 2: Lookup track_id if track_name is provided
      let track_id: number | null = null;
      if (track_name) {
        const { data: trackData, error: trackLookupError } = await supabase
          .from('tracks')
          .select('id')
          .eq('program_id', program_id)
          .eq('name', track_name)
          .single();

        if (trackLookupError || !trackData) {
          const errorMsg = `Track lookup failed for program_id=${program_id}, track_name=${track_name}: ${trackLookupError?.message || 'not found'}`;
          console.error(errorMsg);
          result.errors.push(errorMsg);
          continue;
        }

        track_id = trackData.id;
        console.log(`  Found track_id=${track_id} for track_name=${track_name}`);
      }

      // Step 3: Handle replace_existing logic
      if (metadata?.replace_existing) {
        // Lookup existing curriculum version using the same key columns as uq_curriculum_version
        // Constraint is likely on: program_id, version_label, and track_id (if present)
        let existingVersionQuery = supabase
          .from('curriculum_versions')
          .select('id')
          .eq('program_id', program_id)
          .eq('version_label', version_label);

        if (track_id !== null) {
          existingVersionQuery = existingVersionQuery.eq('track_id', track_id);
        } else {
          existingVersionQuery = existingVersionQuery.is('track_id', null);
        }

        const { data: existingVersionData, error: existingVersionError } = await existingVersionQuery.single();

        if (existingVersionData && !existingVersionError) {
          const existing_cv_id = existingVersionData.id;
          console.log(`  Found existing curriculum version id=${existing_cv_id}, deleting cascading records...`);

          // Delete requirement_rules for all requirement_groups in this curriculum version
          const { data: groupsData, error: groupsError } = await supabase
            .from('requirement_groups')
            .select('id')
            .eq('curriculum_version_id', existing_cv_id);

          if (groupsData && groupsData.length > 0) {
            const groupIds = groupsData.map((g: any) => g.id);
            console.log(`  Deleting requirement_rules for ${groupIds.length} requirement_group(s)...`);

            const { error: deleteRulesError } = await supabase
              .from('requirement_rules')
              .delete()
              .in('requirement_group_id', groupIds);

            if (deleteRulesError) {
              console.error(`  Failed to delete requirement_rules: ${deleteRulesError.message}`);
            } else {
              console.log(`  Deleted requirement_rules for requirement_groups`);
            }
          }

          // Delete requirement_groups for this curriculum version
          console.log(`  Deleting requirement_groups for curriculum_version_id=${existing_cv_id}...`);
          const { error: deleteGroupsError } = await supabase
            .from('requirement_groups')
            .delete()
            .eq('curriculum_version_id', existing_cv_id);

          if (deleteGroupsError) {
            console.error(`  Failed to delete requirement_groups: ${deleteGroupsError.message}`);
          } else {
            console.log(`  Deleted requirement_groups`);
          }

          // Delete the curriculum version itself using exact matching key fields
          console.log(`  Deleting curriculum version with program_id=${program_id}, version_label=${version_label}, track_id=${track_id}...`);
          let deleteVersionQuery = supabase
            .from('curriculum_versions')
            .delete()
            .eq('program_id', program_id)
            .eq('version_label', version_label);

          if (track_id !== null) {
            deleteVersionQuery = deleteVersionQuery.eq('track_id', track_id);
          } else {
            deleteVersionQuery = deleteVersionQuery.is('track_id', null);
          }

          const { error: deleteVersionError } = await deleteVersionQuery;

          if (deleteVersionError) {
            const errorMsg = `Failed to delete curriculum version: ${deleteVersionError.message}`;
            console.error(`  ${errorMsg}`);
            result.errors.push(errorMsg);
            continue;
          } else {
            console.log(`  Deleted existing curriculum version`);
          }
        } else if (existingVersionError && existingVersionError.code !== 'PGRST116') {
          // PGRST116 = no rows returned (not an error, just doesn't exist)
          console.warn(`  Lookup existing version returned error: ${existingVersionError.message}`);
        } else {
          console.log(`  No existing curriculum version found to delete`);
        }
      }

      // Step 4: Insert new curriculum version
      console.log(`  Inserting new curriculum version...`);
      const newVersion: any = {
        program_id,
        version_label,
        is_active: is_active ?? true
      };

      if (version_year !== undefined) newVersion.version_year = version_year;
      if (version_sem !== undefined) newVersion.version_sem = version_sem;
      if (version_seq !== undefined) newVersion.version_seq = version_seq;
      if (track_id !== null) newVersion.track_id = track_id;

      const { data: insertedVersion, error: insertVersionError } = await supabase
        .from('curriculum_versions')
        .insert(newVersion)
        .select('id')
        .single();

      if (insertVersionError || !insertedVersion) {
        const errorMsg = `Failed to create curriculum version: ${insertVersionError?.message || 'unknown error'}`;
        console.error(`  ${errorMsg}`);
        result.errors.push(errorMsg);
        continue;
      }

      const curriculum_version_id = insertedVersion.id;
      console.log(`  Created curriculum version id=${curriculum_version_id}`);

      // Step 5: Insert requirement groups and rules
      if (requirement_groups && requirement_groups.length > 0) {
        console.log(`  Inserting ${requirement_groups.length} requirement group(s)...`);

        for (const group of requirement_groups) {
          const newGroup: any = {
            curriculum_version_id,
            group_name: group.group_name
          };

          if (group.year_level !== undefined) newGroup.year_level = group.year_level;
          if (group.semester !== undefined) newGroup.semester = group.semester;
          if (group.min_units !== undefined) newGroup.min_units = group.min_units;

          const { data: insertedGroup, error: insertGroupError } = await supabase
            .from('requirement_groups')
            .insert(newGroup)
            .select('id')
            .single();

          if (insertGroupError || !insertedGroup) {
            const errorMsg = `Failed to create requirement group '${group.group_name}': ${insertGroupError?.message || 'unknown error'}`;
            console.error(`    ${errorMsg}`);
            result.errors.push(errorMsg);
            continue;
          }

          const requirement_group_id = insertedGroup.id;
          console.log(`    Created requirement group id=${requirement_group_id} (${group.group_name})`);

          // Insert requirement rules for this group
          if (group.rules && group.rules.length > 0) {
            console.log(`    Inserting ${group.rules.length} requirement rule(s)...`);

            for (const rule of group.rules) {
              const newRule: any = {
                requirement_group_id,
                rule_type: 'by_course', // Must be one of: by_course, by_tag, by_prefix, by_pattern (per DB constraint)
                course_code: rule.course_code,
                tag_pattern: rule.tag_pattern?.trim() || null, // Ensure null when empty string
                description: rule.course_title ? `${rule.course_code}: ${rule.course_title}` : rule.course_code
              };

              if (rule.category) newRule.category = rule.category;

              const { error: insertRuleError } = await supabase
                .from('requirement_rules')
                .insert(newRule);

              if (insertRuleError) {
                const errorMsg = `Failed to create requirement rule for course ${rule.course_code}: ${insertRuleError.message}`;
                console.error(`      ${errorMsg}`);
                result.errors.push(errorMsg);
              } else {
                console.log(`      Created rule: ${rule.course_code}`);
              }
            }
          }
        }
      }

      result.inserted++;
      console.log(`  ✅ Successfully processed curriculum version`);

    } catch (err: any) {
      const errorMsg = `Exception processing curriculum version: ${err.message}`;
      console.error(errorMsg);
      result.errors.push(errorMsg);
    }
  }

  return result;
}

// Main handler
serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role for full access
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Parse request body
    const payload: IngestPayload = await req.json();
    const { data_type, records, metadata } = payload;

    console.log(`Received ${data_type} data: ${records.length} records`);
    if (metadata) {
      console.log(`Metadata:`, metadata);
    }

    let result: BatchResult;

    // Route to appropriate handler based on data type
    if (data_type === 'schedules') {
      result = await upsertSchedulesInBatches(
        supabaseClient,
        records as ScheduleRecord[],
        metadata
      );

      console.log(`Schedules sync completed: ${result.inserted}/${records.length} inserted, ${result.filtered_headers} headers filtered, ${result.filtered_invalid} invalid filtered`);
      
      if (result.errors.length > 0) {
        console.error(`Encountered ${result.errors.length} errors during sync`);
      }

      return new Response(
        JSON.stringify({
          success: result.errors.length === 0,
          inserted: result.inserted,
          total: records.length,
          filtered_headers: result.filtered_headers,
          filtered_invalid: result.filtered_invalid,
          errors: result.errors,
          partial_success: result.inserted > 0 && result.errors.length > 0
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: result.errors.length === 0 ? 200 : (result.inserted > 0 ? 207 : 500)
        }
      );

    } else if (data_type === 'curriculum') {
      result = await upsertCurriculum(
        supabaseClient,
        records as CurriculumRecord[]
      );

      console.log(`Curriculum sync completed: ${result.inserted}/${records.length} inserted`);

      return new Response(
        JSON.stringify({
          success: result.errors.length === 0,
          inserted: result.inserted,
          total: records.length,
          errors: result.errors
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: result.errors.length === 0 ? 200 : 500
        }
      );

    } else if (data_type === 'curriculum_version') {
      result = await upsertCurriculumVersions(
        supabaseClient,
        records as CurriculumVersionPayload[],
        metadata
      );

      console.log(`Curriculum version sync completed: ${result.inserted}/${records.length} versions processed`);

      return new Response(
        JSON.stringify({
          success: result.errors.length === 0,
          inserted: result.inserted,
          total: records.length,
          errors: result.errors
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: result.errors.length === 0 ? 200 : 500
        }
      );

    } else {
      throw new Error(`Unknown data_type: ${data_type}`);
    }

  } catch (error) {
    console.error('Error in github-data-ingest:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
