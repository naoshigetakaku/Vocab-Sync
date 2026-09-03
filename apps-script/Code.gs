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

/**
 * Bumped whenever this file gains a feature the front end depends on. The app
 * compares it against its own expectation and says so when the deployment is
 * behind — silently writing rows without a column the user asked for is the
 * worst possible failure mode.
 *
 *   1  original schema
 *   2  colour column
 *   3  folder column and the Folders sheet
 */
var BACKEND_VERSION = 3;

var SHEET_NAME = 'Words';
var FOLDER_SHEET_NAME = 'Folders';

/** Where every word already in the sheet lands when folders arrive. */
var LEGACY_FOLDER = 'TOPS2026';

/**
 * Column order. New fields go on the END of this list — inserting one in the
 * middle would shift every existing row's data into the wrong column.
 */
var HEADERS = ['id', 'word', 'pos', 'definition', 'note', 'createdAt', 'updatedAt', 'color', 'folder'];

var FOLDER_HEADERS = ['id', 'name', 'createdAt'];

var MAX_FOLDER_NAME_LENGTH = 60;

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
        return json_({
          ok: true,
          version: BACKEND_VERSION,
          words: listWords_(),
          folders: listFolders_()
        });
      case 'createFolder':
        return json_({ ok: true, version: BACKEND_VERSION, folder: createFolder_(request.name) });
      case 'renameFolder':
        return json_({ ok: true, version: BACKEND_VERSION, folder: renameFolder_(request.id, request.name) });
      case 'deleteFolder':
        return json_({ ok: true, version: BACKEND_VERSION, id: deleteFolder_(request.id) });
      case 'create':
        return json_({ ok: true, version: BACKEND_VERSION, word: createWord_(request.word) });
      case 'update':
        return json_({ ok: true, version: BACKEND_VERSION, word: updateWord_(request.word) });
      case 'delete':
        return json_({ ok: true, version: BACKEND_VERSION, id: deleteWord_(request.id) });
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
 * Returns the column map AND the width to read and write with. The width is
 * derived from the map rather than from getLastColumn(), which can still
 * report the old value for a column this same execution just created — that
 * lag silently dropped the colour off the end of every row.
 *
 * @return {{map: Object, width: number}}
 */
function ensureHeaders_(sheet) {
  var read = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, read).getValues()[0];

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
    var needed = start + missing.length - 1;
    if (needed > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), needed - sheet.getMaxColumns());
    }

    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
    sheet.getRange(1, start, sheet.getMaxRows(), missing.length).setNumberFormat('@');

    for (var m = 0; m < missing.length; m++) {
      map[missing[m]] = header.length + m;
    }
    // Make the new column real before anything measures the sheet again.
    SpreadsheetApp.flush();
  }

  var width = 0;
  for (var key in map) {
    if (map[key] + 1 > width) width = map[key] + 1;
  }

  return { map: map, width: width };
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
    // Blank means the word is unsorted; the app shows those together.
    folder: read('folder'),
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
  var folder = String(input.folder || '').trim();

  if (!word) fail_('BAD_REQUEST', 'Word is required.');
  if (word.length > MAX_WORD_LENGTH) fail_('BAD_REQUEST', 'Word is too long.');
  if (PARTS_OF_SPEECH.indexOf(pos) === -1) fail_('BAD_REQUEST', 'Unknown part of speech.');
  if (definition.length > MAX_TEXT_LENGTH) fail_('BAD_REQUEST', 'Definition is too long.');
  if (note.length > MAX_TEXT_LENGTH) fail_('BAD_REQUEST', 'Note is too long.');
  if (WORD_COLORS.indexOf(color) === -1) fail_('BAD_REQUEST', 'Unknown colour.');
  if (folder.length > MAX_FOLDER_NAME_LENGTH) fail_('BAD_REQUEST', 'Folder name is too long.');

  return {
    word: word, pos: pos, definition: definition, note: note,
    color: color, folder: folder
  };
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
  var schema = ensureHeaders_(sheet);
  var map = schema.map;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, schema.width).getValues();
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
    var schema = ensureHeaders_(sheet);
    var now = new Date().toISOString();

    var record = {
      id: Utilities.getUuid(),
      word: fields.word,
      pos: fields.pos,
      definition: fields.definition,
      note: fields.note,
      color: fields.color,
      folder: fields.folder,
      createdAt: now,
      updatedAt: now
    };

    sheet.appendRow(wordToRow_(record, schema.map, schema.width));
    return record;
  });
}

function updateWord_(input) {
  if (!input || !input.id) fail_('BAD_REQUEST', 'Missing id.');
  var fields = validate_(input);
  var id = String(input.id);

  return withLock_(function () {
    var sheet = getSheet_();
    var schema = ensureHeaders_(sheet);
    var width = schema.width;

    var row = findRow_(sheet, schema.map, id);
    if (row === -1) fail_('NOT_FOUND', 'No row with that id.');

    var existing = rowToWord_(sheet.getRange(row, 1, 1, width).getValues()[0], schema.map);

    var record = {
      id: id,
      word: fields.word,
      pos: fields.pos,
      definition: fields.definition,
      note: fields.note,
      color: fields.color,
      folder: fields.folder,
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    sheet.getRange(row, 1, 1, width).setValues([wordToRow_(record, schema.map, width)]);
    return record;
  });
}

function deleteWord_(id) {
  if (!id) fail_('BAD_REQUEST', 'Missing id.');
  var target = String(id);

  return withLock_(function () {
    var sheet = getSheet_();
    var schema = ensureHeaders_(sheet);

    var row = findRow_(sheet, schema.map, target);
    if (row === -1) fail_('NOT_FOUND', 'No row with that id.');

    sheet.deleteRow(row);
    return target;
  });
}

/* --- Folders -------------------------------------------------------------- */

function getFolderSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(FOLDER_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(FOLDER_SHEET_NAME);
    sheet.getRange(1, 1, 1, FOLDER_HEADERS.length).setValues([FOLDER_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, sheet.getMaxRows(), FOLDER_HEADERS.length).setNumberFormat('@');
  }

  return sheet;
}

/** Oldest first, so the app can show folders in the order they were made. */
function listFolders_() {
  var sheet = getFolderSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, FOLDER_HEADERS.length).getValues();
  var folders = [];

  for (var i = 0; i < values.length; i++) {
    if (!values[i][0]) continue;
    folders.push({
      id: toText_(values[i][0]),
      name: toText_(values[i][1]),
      createdAt: toText_(values[i][2])
    });
  }
  return folders;
}

function findFolderRow_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

function validFolderName_(input) {
  var name = String(input || '').trim();
  if (!name) fail_('BAD_REQUEST', 'Folder name is required.');
  if (name.length > MAX_FOLDER_NAME_LENGTH) fail_('BAD_REQUEST', 'Folder name is too long.');
  return name;
}

/** Names are the link between a word and its folder, so they must be unique. */
function folderNameTaken_(folders, name, exceptId) {
  var target = name.toLowerCase();
  for (var i = 0; i < folders.length; i++) {
    if (folders[i].id === exceptId) continue;
    if (folders[i].name.toLowerCase() === target) return true;
  }
  return false;
}

function createFolder_(input) {
  var name = validFolderName_(input);

  return withLock_(function () {
    var sheet = getFolderSheet_();
    if (folderNameTaken_(listFolders_(), name, null)) {
      fail_('DUPLICATE', 'A folder with that name already exists.');
    }

    var record = { id: Utilities.getUuid(), name: name, createdAt: new Date().toISOString() };
    sheet.appendRow([escapeCell_(record.id), escapeCell_(record.name), escapeCell_(record.createdAt)]);
    return record;
  });
}

function renameFolder_(id, input) {
  if (!id) fail_('BAD_REQUEST', 'Missing folder id.');
  var name = validFolderName_(input);
  var target = String(id);

  return withLock_(function () {
    var sheet = getFolderSheet_();
    var folders = listFolders_();

    var current = null;
    for (var i = 0; i < folders.length; i++) {
      if (folders[i].id === target) current = folders[i];
    }
    if (!current) fail_('NOT_FOUND', 'No folder with that id.');

    if (folderNameTaken_(folders, name, target)) {
      fail_('DUPLICATE', 'A folder with that name already exists.');
    }

    var row = findFolderRow_(sheet, target);
    sheet.getRange(row, 2).setValue(escapeCell_(name));

    // Words point at the folder by name, so they all have to follow.
    if (current.name !== name) relabelWords_(current.name, name);

    return { id: target, name: name, createdAt: current.createdAt };
  });
}

function deleteFolder_(id) {
  if (!id) fail_('BAD_REQUEST', 'Missing folder id.');
  var target = String(id);

  return withLock_(function () {
    var sheet = getFolderSheet_();
    var folders = listFolders_();

    var current = null;
    for (var i = 0; i < folders.length; i++) {
      if (folders[i].id === target) current = folders[i];
    }
    if (!current) fail_('NOT_FOUND', 'No folder with that id.');

    // The words survive; they just stop belonging anywhere.
    relabelWords_(current.name, '');

    sheet.deleteRow(findFolderRow_(sheet, target));
    return target;
  });
}

/** Rewrites the folder column for every word currently in `from`. */
function relabelWords_(from, to) {
  var sheet = getSheet_();
  var schema = ensureHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var column = schema.map.folder + 1;
  var range = sheet.getRange(2, column, lastRow - 1, 1);
  var values = range.getValues();

  var touched = 0;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === from) {
      values[i][0] = to;
      touched += 1;
    }
  }

  if (touched) range.setValues(values);
  return touched;
}

/**
 * Puts every word that has no folder into LEGACY_FOLDER, and makes sure that
 * folder exists. Safe to run repeatedly: it only ever fills blanks.
 */
function adoptUnfiledWords_() {
  var sheet = getSheet_();
  var schema = ensureHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var idColumn = schema.map.id + 1;
  var folderColumn = schema.map.folder + 1;

  var ids = sheet.getRange(2, idColumn, lastRow - 1, 1).getValues();
  var range = sheet.getRange(2, folderColumn, lastRow - 1, 1);
  var values = range.getValues();

  var touched = 0;
  for (var i = 0; i < values.length; i++) {
    if (!ids[i][0]) continue;
    if (String(values[i][0]).trim() === '') {
      values[i][0] = LEGACY_FOLDER;
      touched += 1;
    }
  }

  if (!touched) return 0;

  range.setValues(values);

  if (!folderNameTaken_(listFolders_(), LEGACY_FOLDER, null)) {
    getFolderSheet_().appendRow([
      Utilities.getUuid(), LEGACY_FOLDER, new Date().toISOString()
    ]);
  }

  return touched;
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
  var schema = ensureHeaders_(sheet);
  var after = schema.width;

  Logger.log('Backend version %s.', BACKEND_VERSION);
  Logger.log('Sheet "%s": %s data row(s).', SHEET_NAME, Math.max(0, sheet.getLastRow() - 1));
  Logger.log('Columns: %s', HEADERS.join(', '));

  if (after > before) {
    Logger.log('Added %s new column(s). Existing rows were not modified.', after - before);
  } else {
    Logger.log('No new columns needed.');
  }

  getFolderSheet_();
  var adopted = adoptUnfiledWords_();
  if (adopted) {
    Logger.log('Moved %s word(s) with no folder into "%s".', adopted, LEGACY_FOLDER);
  } else {
    Logger.log('Every word already belongs to a folder.');
  }
  Logger.log('Folders: %s', listFolders_().map(function (f) { return f.name; }).join(', ') || '(none)');

  if (PASSPHRASE === 'change-me-to-something-long-and-random') {
    Logger.log('WARNING: PASSPHRASE is still the default. Change it before deploying.');
  }

  Logger.log('Remember: saving this file is not deploying it. Deploy > Manage '
    + 'deployments > edit the existing entry > Version: New version.');
}
