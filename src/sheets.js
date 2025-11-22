import { google } from 'googleapis';

export class GoogleSheetsManager {
  constructor(serviceAccountBase64) {
    // Decode the Base64 credentials back to JSON
    const credentials = JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf-8'));
    
    this.auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  /**
   * Syncs an array of objects to a specific sheet tab
   */
  async syncData(spreadsheetId, sheetName, data) {
    if (!data || data.length === 0) {
      console.log(`   ⚠️ Sheets: No data to sync for [${sheetName}]`);
      return;
    }

    console.log(`   📊 Sheets: Syncing ${data.length} rows to [${sheetName}]...`);

    // 1. Extract Headers from the first object
    const headers = Object.keys(data[0]);
    
    // 2. Format Rows (Convert objects/arrays to strings)
    const rows = data.map(obj => headers.map(header => {
      const val = obj[header];
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val;
    }));

    // 3. Prepare Payload (Headers + Data)
    const values = [headers, ...rows];

    try {
      // Clear existing data first
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: sheetName,
      });

      // Write new data
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED', // Lets Sheets auto-format numbers
        resource: { values },
      });

      console.log(`   ✅ Sheets: Successfully updated [${sheetName}]`);
    } catch (error) {
      console.error(`   ❌ Sheets Error [${sheetName}]:`, error.message);
      if (error.message.includes('Unable to parse range')) {
        console.warn(`      👉 Tip: Make sure a tab named "${sheetName}" exists in your Google Sheet.`);
      }
    }
  }
}
