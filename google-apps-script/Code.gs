const SHEET_NAME = 'Leads';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);

    ensureHeaderRow(sheet);

    sheet.appendRow([
      new Date(),
      payload.lead_kind || 'inquiry',
      payload.name || '',
      payload.phone || '',
      payload.type || '',
      payload.time || '',
      payload.message || '',
      payload.utm_source || '',
      payload.utm_medium || '',
      payload.utm_campaign || '',
      payload.utm_content || '',
      payload.utm_term || '',
      payload.landing_path || '',
      payload.submittedAt || '',
      payload.ip || '',
      payload.userAgent || ''
    ]);

    return createJsonResponse({
      ok: true,
      message: 'Lead saved to Google Sheets'
    });
  } catch (error) {
    return createJsonResponse({
      ok: false,
      message: error.message
    });
  }
}

function doGet() {
  return createJsonResponse({
    ok: true,
    message: 'Google Apps Script lead endpoint is running.'
  });
}

function ensureHeaderRow(sheet) {
  if (sheet.getLastRow() > 0) {
    return;
  }

  sheet.appendRow([
    'created_at',
    'lead_kind',
    'name',
    'phone',
    'type',
    'time',
    'message',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'landing_path',
    'submitted_at_client',
    'ip',
    'user_agent'
  ]);
}

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
