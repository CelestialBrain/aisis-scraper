import fetch from 'node-fetch'; // Falls back to native fetch in Node 18+ if not installed

export class SupabaseManager {
  constructor(syncKey) {
    this.syncKey = syncKey;
    this.url = 'https://npnringvuiystpxbntvj.supabase.co/functions/v1/github-sync';
  }

  /**
   * Sync data to Supabase via github-sync Edge Function
   */
  async syncToSupabase(dataType, data, termCode = null, department = null) {
    console.log(`   ☁️ Syncing ${data.length} ${dataType} records for ${department || 'all'}...`);

    const payload = {
      type: dataType,
      data: data
    };

    // Add context fields for schedules
    if (dataType === 'schedules') {
      payload.term_code = termCode;
      payload.department = department;
    }

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.syncKey
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`   ✅ Successfully synced ${result.processed || 0} ${dataType}`);
        return true;
      } else {
        const text = await response.text();
        console.error(`   ❌ Error syncing ${dataType}: ${response.status} - ${text}`);
        return false;
      }
    } catch (error) {
      console.error(`   ❌ Exception syncing ${dataType}:`, error.message);
      return false;
    }
  }

  /**
   * Helper: Parse time pattern like "TH 7:00-10:00" to extract start/end times
   */
  parseTimePattern(timePattern) {
    if (!timePattern) return { start: null, end: null, days: null };
    
    try {
      // Extract time range (e.g., "7:00-10:00" from "TH 7:00-10:00")
      const timeMatch = timePattern.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
      if (!timeMatch) return { start: null, end: null, days: null };
      
      const [_, startTime, endTime] = timeMatch;
      
      // Convert to HH:MM:SS format
      const formatTime = (time) => {
        const [hours, minutes] = time.split(':');
        return `${hours.padStart(2, '0')}:${minutes}:00`;
      };
      
      // Extract day codes
      // Mapping: M=1, T=2, W=3, TH=4, F=5, S=6, SU=0
      const dayPattern = timePattern.split(' ')[0].toUpperCase();
      const days = [];
      
      if (dayPattern.includes('TH')) days.push(4);
      else if (dayPattern.includes('T')) days.push(2);
      
      if (dayPattern.includes('M')) days.push(1);
      if (dayPattern.includes('W')) days.push(3);
      if (dayPattern.includes('F')) days.push(5);
      if (dayPattern.includes('S') && !dayPattern.includes('U')) days.push(6);
      if (dayPattern.includes('SU')) days.push(0);

      return {
        start: formatTime(startTime),
        end: formatTime(endTime),
        days: days.length > 0 ? days : null
      };
    } catch (error) {
      console.warn(`Failed to parse time pattern: ${timePattern}`, error);
      return { start: null, end: null, days: null };
    }
  }

  /**
   * Transform AISIS Schedule data to Lovable/Supabase format
   */
  transformScheduleData(scheduleItems) {
    return scheduleItems.map(item => {
      const parsedTime = this.parseTimePattern(item.time);
      
      return {
        subject_code: item.subjectCode,
        section: item.section,
        course_title: item.title,
        units: parseFloat(item.units) || 0,
        time_pattern: item.time,
        room: item.room,
        instructor: item.instructor,
        department: item.department,
        language: item.language,
        level: item.level,
        remarks: item.remarks,
        max_capacity: item.maxSlots,
        
        // Fixed fields using the parser (Critical Fix):
        start_time: parsedTime.start || '00:00:00', 
        end_time: parsedTime.end || '23:59:59',     
        days_of_week: parsedTime.days,
        delivery_mode: null
      };
    });
  }
}
