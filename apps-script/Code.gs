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
 *
 * Upgrading an existing sheet: the "color" column was added after the first
 * release. Running setup() appends the missing header without touching any
 * existing row; words saved before the upgrade simply read back with no
 * colour, which is the default.
 */

/**
 * CHANGE THIS — in the Apps Script editor, never in the repository copy.
 * It is the only thing standing between the sheet and the web.
 */
var PASSPHRASE = 'change-me-to-something-long-and-random';

var SHEET_NAME = 'Words';

/**
 * Column order. New fields go on the END of this list — inserting one in the
 * middle would shift every existing row's data into the wrong column.
 */
var HEADERS = ['id', 'word', 'pos', 'definition', 'note', 'createdAt', 'updatedAt', 'color'];

var PARTS_OF_SPEECH = ['Verb', 'Adj', 'Adv', 'Noun', 'Idiom', 'Expression'];
var WORD_COLORS = ['default', 'blue', 'green', 'orange', 'red', 'grey', 'purple'];

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
 * Reads the header row and appends any column this version expects but the
 * sheet does not have yet. Existing columns keep their position, so data
 * written by an older version stays readable.
 *
 * @return {Object} map of field name to zero-based column index
 */
function ensureHeaders_(sheet) {
  var width = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0];

  var map = {};
  for (var i = 0; i < header.length; i++) {
    var name = String(header[i]).trim();
    if (name) map[name] = i;
  }

  var missing = [];
  for (var h = 0; h < HEADERS.length; h++) {
    if (!(HEADERS[h] in map)) missing.push(HEADERS[h]);
  }

  if (missing.length) {
    var start = header.length + 1;
    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
    sheet.getRange(1, start, sheet.getMaxRows(), missing.length).setNumberFormat('@');
    for (var m = 0; m < missing.length; m++) {
      map[missing[m]] = header.length + m;
    }
  }

  return map;
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

function findRow_(sheet, map, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var column = map.id + 1;
  var ids = sheet.getRange(2, column, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

function rowToWord_(row, map) {
  var read = function (field) {
    var index = map[field];
    return index === undefined ? '' : toText_(row[index]);
  };

  var colour = read('color');

  return {
    id: read('id'),
    word: read('word'),
    pos: read('pos'),
    definition: read('definition'),
    note: read('note'),
    // Rows written before the colour column existed come back blank.
    color: WORD_COLORS.indexOf(colour) === -1 ? 'default' : colour,
    createdAt: read('createdAt'),
    updatedAt: read('updatedAt')
  };
}

/** Builds a full-width row so no neighbouring column is overwritten. */
function wordToRow_(word, map, width) {
  var row = [];
  for (var i = 0; i < width; i++) row.push('');

  for (var h = 0; h < HEADERS.length; h++) {
    var field = HEADERS[h];
    var index = map[field];
    if (index !== undefined && index < width) {
      row[index] = escapeCell_(word[field]);
    }
  }
  return row;
}

/* --- Validation ----------------------------------------------------------- */

function validate_(input) {
  if (!input || typeof input !== 'object') fail_('BAD_REQUEST', 'Missing word payload.');

  var word = String(input.word || '').trim();
  var pos = String(input.pos || '').trim();
  var definition = String(input.definition || '').trim();
  var note = String(input.note || '').trim();
  var color = String(input.color || 'default').trim();

  if (!word) fail_('BAD_REQUEST', 'Word is required.');
  if (word.length > MAX_WORD_LENGTH) fail_('BAD_REQUEST', 'Word is too long.');
  if (PARTS_OF_SPEECH.indexOf(pos) === -1) fail_('BAD_REQUEST', 'Unknown part of speech.');
  if (definition.length > MAX_TEXT_LENGTH) fail_('BAD_REQUEST', 'Definition is too long.');
  if (note.length > MAX_TEXT_LENGTH) fail_('BAD_REQUEST', 'Note is too long.');
  if (WORD_COLORS.indexOf(color) === -1) fail_('BAD_REQUEST', 'Unknown colour.');

  return { word: word, pos: pos, definition: definition, note: note, color: color };
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
  var map = ensureHeaders_(sheet);

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var width = sheet.getLastColumn();
  var values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  var words = [];

  for (var i = 0; i < values.length; i++) {
    if (!values[i][map.id]) continue; // blank row
    words.push(rowToWord_(values[i], map));
  }
  return words;
}

function createWord_(input) {
  var fields = validate_(input);

  return withLock_(function () {
    var sheet = getSheet_();
    var map = ensureHeaders_(sheet);
    var width = sheet.getLastColumn();
    var now = new Date().toISOString();

    var record = {
      id: Utilities.getUuid(),
      word: fields.word,
      pos: fields.pos,
      definition: fields.definition,
      note: fields.note,
      color: fields.color,
      createdAt: now,
      updatedAt: now
    };

    sheet.appendRow(wordToRow_(record, map, width));
    return record;
  });
}

function updateWord_(input) {
  if (!input || !input.id) fail_('BAD_REQUEST', 'Missing id.');
  var fields = validate_(input);
  var id = String(input.id);

  return withLock_(function () {
    var sheet = getSheet_();
    var map = ensureHeaders_(sheet);
    var width = sheet.getLastColumn();

    var row = findRow_(sheet, map, id);
    if (row === -1) fail_('NOT_FOUND', 'No row with that id.');

    var existing = rowToWord_(sheet.getRange(row, 1, 1, width).getValues()[0], map);

    var record = {
      id: id,
      word: fields.word,
      pos: fields.pos,
      definition: fields.definition,
      note: fields.note,
      color: fields.color,
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    sheet.getRange(row, 1, 1, width).setValues([wordToRow_(record, map, width)]);
    return record;
  });
}

function deleteWord_(id) {
  if (!id) fail_('BAD_REQUEST', 'Missing id.');
  var target = String(id);

  return withLock_(function () {
    var sheet = getSheet_();
    var map = ensureHeaders_(sheet);

    var row = findRow_(sheet, map, target);
    if (row === -1) fail_('NOT_FOUND', 'No row with that id.');

    sheet.deleteRow(row);
    return target;
  });
}

/* --- One-time setup ------------------------------------------------------- */

/**
 * Run this once from the editor after pasting or updating this file.
 *
 * It creates the sheet if needed, adds any column this version expects,
 * and triggers the authorization prompt, so the first real request is not the
 * one that has to deal with it.
 */
function setup() {
  var sheet = getSheet_();
  var before = sheet.getLastColumn();
  var map = ensureHeaders_(sheet);
  var after = sheet.getLastColumn();

  Logger.log('Sheet "%s": %s data row(s).', SHEET_NAME, Math.max(0, sheet.getLastRow() - 1));
  Logger.log('Columns: %s', HEADERS.join(', '));

  if (after > before) {
    Logger.log('Added %s new column(s). Existing rows were not modified.', after - before);
  } else {
    Logger.log('No migration needed.');
  }

  if (PASSPHRASE === 'change-me-to-something-long-and-random') {
    Logger.log('WARNING: PASSPHRASE is still the default. Change it before deploying.');
  }
}
