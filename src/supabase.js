const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

export class SupabaseManager {
  constructor(ingestToken) {
    this.ingestToken = ingestToken;
    this.url = 'https://npnringvuiystpxbntvj.supabase.co/functions/v1/github-data-ingest';
  }

  async syncToSupabase(dataType, data, termCode = null, department = null) {
    console.log(`   ☁️ Supabase: Syncing ${data.length} ${dataType} records...`);

    const payload = {
      data_type: dataType,
      records: data,
      metadata: {
        term_code: termCode,
        department: department
      }
    };

    if (dataType === 'schedules') {
      payload.metadata.term_code = termCode;
      payload.metadata.department = department;
    }

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.ingestToken}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log(`   ✅ Supabase: Success`);
        return true;
      } else {
        const text = await response.text();
        console.error(`   ❌ Supabase Error: ${response.status} - ${text}`);
        return false;
      }
    } catch (error) {
      console.error(`   ❌ Supabase Exception:`, error.message);
      return false;
    }
  }

  safeInt(val) {
    if (!val || val === '') return 0;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  safeFloat(val) {
    if (!val || val === '') return 0.0;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0.0 : parsed;
  }

  parseTimePattern(timePattern) {
    if (!timePattern) return { start: null, end: null, days: null };
    try {
      const timeMatch = timePattern.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
      if (!timeMatch) return { start: null, end: null, days: null };
      
      const [_, startTime, endTime] = timeMatch;
      const formatTime = (time) => {
        const [hours, minutes] = time.split(':');
        return `${hours.padStart(2, '0')}:${minutes}:00`;
      };
      
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
      return { start: null, end: null, days: null };
    }
  }

  transformScheduleData(scheduleItems) {
    return scheduleItems.map(item => {
      const parsedTime = this.parseTimePattern(item.time_pattern);
      
      return {
        subject_code: item.subjectCode,
        section: item.section,
        course_title: item.title, 
        units: this.safeFloat(item.units),
        time_pattern: item.time,
        room: item.room,
        instructor: item.instructor,
        department: item.department,
        language: item.language,
        level: item.level,
        remarks: item.remarks,
        max_capacity: this.safeInt(item.maxSlots),
        
        start_time: parsedTime.start || '00:00:00', 
        end_time: parsedTime.end || '23:59:59',     
        days_of_week: parsedTime.days ? JSON.stringify(parsedTime.days) : '[]', 
        delivery_mode: null
      };
    });
  }
}
