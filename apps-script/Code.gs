/**
 * VocabSync — Apps Script backend.
 *
 * Setup
 *   1. Open the target spreadsheet, then Extensions > Apps Script.
 *   2. Replace the default Code.gs with this file.
 *   3. Change PASSPHRASE below to something long and random.
 *        Do this IN THE APPS SCRIPT EDITOR ONLY. This file is checked into a
 *        public repository, so the real passphrase must never be written into
 *        the local copy.
 *   4. Run setup() once and approve the permission prompt.
 *   5. Deploy > New deployment > Web app.
 *        Execute as:  Me
 *        Who has access:  Anyone
 *   6. Copy the /exec URL into the app's Connect sheet.
 *
 * Redeploying after a code change: Deploy > Manage deployments > edit the
 * existing entry > Version: New version. That keeps the same URL. Choosing
 * "New deployment" instead mints a different URL and the app stops working.
 *
 * Why the app posts text/plain: Apps Script cannot answer a CORS preflight, so
 * every request has to stay inside the "simple request" set. The body is JSON
 * regardless and is parsed by hand below.
 */

/**
 * CHANGE THIS — in the Apps Script editor, never in the repository copy.
 * It is the only thing standing between the sheet and the web.
 */
var PASSPHRASE = 'change-me-to-something-long-and-random';

var SHEET_NAME = 'Words';
var HEADERS = ['id', 'word', 'pos', 'definition', 'note', 'createdAt', 'updatedAt'];
var PARTS_OF_SPEECH = ['Verb', 'Adj', 'Adv', 'Noun', 'Idiom', 'Expression'];

var MAX_WORD_LENGTH = 200;
var MAX_TEXT_LENGTH = 2000;
var LOCK_TIMEOUT_MS = 20000;

/* --- Entry points --------------------------------------------------------- */

function doGet(e) {
  return handle_(e);
}

function doPost(e) {
  return handle_(e);
}

function handle_(e) {
  try {
    var request = parseRequest_(e);

    if (!constantTimeEquals_(String(request.passphrase || ''), PASSPHRASE)) {
      return json_({ ok: false, error: 'UNAUTHORIZED' });
    }

    switch (request.action) {
      case 'list':
        return json_({ ok: true, words: listWords_() });
      case 'create':
        return json_({ ok: true, word: createWord_(request.word) });
      case 'update':
        return json_({ ok: true, word: updateWord_(request.word) });
      case 'delete':
        return json_({ ok: true, id: deleteWord_(request.id) });
      default:
        return json_({ ok: false, error: 'BAD_REQUEST' });
    }
  } catch (error) {
    return json_({
      ok: false,
      error: (error && error.code) || 'SERVER',
      detail: String((error && error.message) || error)
    });
  }
}

/* --- Request plumbing ----------------------------------------------------- */

function parseRequest_(e) {
  if (e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }
  return (e && e.parameter) || {};
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, message) {
  var error = new Error(message || code);
  error.code = code;
  throw error;
}

/** Compares without an early exit, so a wrong guess takes the same time. */
function constantTimeEquals_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/* --- Sheet access --------------------------------------------------------- */

function getSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    // Plain text everywhere, so Sheets never reinterprets a word or a
    // timestamp as a number or a date.
    sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).setNumberFormat('@');
  }

  return sheet;
}

/**
 * A value starting with "=" would be stored as a formula. The leading
 * apostrophe forces text; Sheets strips it again on read, so the round trip
 * is lossless.
 */
function escapeCell_(value) {
  var text = value === null || value === undefined ? '' : String(value);
  return text.charAt(0) === '=' ? "'" + text : text;
}

function toText_(value) {
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? '' : String(value);
}

function findRow_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

function rowToWord_(row) {
  return {
    id: toText_(row[0]),
    word: toText_(row[1]),
    pos: toText_(row[2]),
    definition: toText_(row[3]),
    note: toText_(row[4]),
    createdAt: toText_(row[5]),
    updatedAt: toText_(row[6])
  };
}

function wordToRow_(word) {
  return HEADERS.map(function (key) {
    return escapeCell_(word[key]);
  });
}

/* --- Validation ----------------------------------------------------------- */

function validate_(input) {
  if (!input || typeof input !== 'object') fail_('BAD_REQUEST', 'Missing word payload.');

  var word = String(input.word || '').trim();
  var pos = String(input.pos || '').trim();
  var definition = String(input.definition || '').trim();
  var note = String(input.note || '').trim();

  if (!word) fail_('BAD_REQUEST', 'Word is required.');
  if (word.length > MAX_WORD_LENGTH) fail_('BAD_REQUEST', 'Word is too long.');
  if (PARTS_OF_SPEECH.indexOf(pos) === -1) fail_('BAD_REQUEST', 'Unknown part of speech.');
  if (definition.length > MAX_TEXT_LENGTH) fail_('BAD_REQUEST', 'Definition is too long.');
  if (note.length > MAX_TEXT_LENGTH) fail_('BAD_REQUEST', 'Note is too long.');

  return { word: word, pos: pos, definition: definition, note: note };
}

/* --- Operations ----------------------------------------------------------- */
/* Writes take a script lock: two devices saving at once would otherwise be
   able to append to the same row or renumber rows under each other. */

function withLock_(operation) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) fail_('BUSY', 'The sheet is busy.');
  try {
    return operation();
  } finally {
    lock.releaseLock();
  }
}

function listWords_() {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var words = [];

  for (var i = 0; i < values.length; i++) {
    if (!values[i][0]) continue; // blank row
    words.push(rowToWord_(values[i]));
  }
  return words;
}

function createWord_(input) {
  var fields = validate_(input);

  return withLock_(function () {
    var sheet = getSheet_();
    var now = new Date().toISOString();

    var record = {
      id: Utilities.getUuid(),
      word: fields.word,
      pos: fields.pos,
      definition: fields.definition,
      note: fields.note,
      createdAt: now,
      updatedAt: now
    };

    sheet.appendRow(wordToRow_(record));
    return record;
  });
}

function updateWord_(input) {
  if (!input || !input.id) fail_('BAD_REQUEST', 'Missing id.');
  var fields = validate_(input);
  var id = String(input.id);

  return withLock_(function () {
    var sheet = getSheet_();
    var row = findRow_(sheet, id);
    if (row === -1) fail_('NOT_FOUND', 'No row with that id.');

    var existing = rowToWord_(sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0]);

    var record = {
      id: id,
      word: fields.word,
      pos: fields.pos,
      definition: fields.definition,
      note: fields.note,
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    sheet.getRange(row, 1, 1, HEADERS.length).setValues([wordToRow_(record)]);
    return record;
  });
}

function deleteWord_(id) {
  if (!id) fail_('BAD_REQUEST', 'Missing id.');
  var target = String(id);

  return withLock_(function () {
    var sheet = getSheet_();
    var row = findRow_(sheet, target);
    if (row === -1) fail_('NOT_FOUND', 'No row with that id.');

    sheet.deleteRow(row);
    return target;
  });
}

/* --- One-time setup ------------------------------------------------------- */

/**
 * Run this once from the editor. It creates the sheet with its header row and
 * triggers the authorization prompt, so the first real request is not the one
 * that has to deal with it.
 */
function setup() {
  var sheet = getSheet_();
  Logger.log('Sheet "%s" ready with %s row(s) of data.', SHEET_NAME, Math.max(0, sheet.getLastRow() - 1));

  if (PASSPHRASE === 'change-me-to-something-long-and-random') {
    Logger.log('WARNING: PASSPHRASE is still the default. Change it before deploying.');
  }
}
