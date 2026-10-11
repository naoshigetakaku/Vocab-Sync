/**
 * MoveFoldersOut.gs — a one-off job.
 *
 * Takes whole folders out of this spreadsheet and puts them in another one:
 * the chemistry, maths and geometry words, which are a different kind of
 * study from the rest and are about to lose the folders that kept them apart.
 *
 * It copies first and deletes second, and it will not delete anything until
 * it has read the copy back and found every single row there. A move that
 * fails half way leaves you with two copies, which is a nuisance. A move that
 * deletes before it checks leaves you with none.
 *
 * How to run it:
 *
 *   1. previewFolderMove() — changes nothing. Says which folders it found,
 *      how many words are in each, and where they would go.
 *   2. moveFoldersOut() — does it, and logs the new spreadsheet's address.
 *
 * Leave MOVE_TARGET_ID blank and it makes a new spreadsheet for them. Put an
 * id there and it adds to that one instead, which is what you want the second
 * time you run it.
 */

/** The folders to take out, by the names they actually have. */
var MOVE_FOLDERS = ['A Level Chem', 'A Level Math', 'Geometry & Trig'];

/** Blank makes a new spreadsheet; an id adds to that one. */
var MOVE_TARGET_ID = '';

/** What a newly made one is called. */
var MOVE_TARGET_NAME = 'VocabSync — Academic';

/**
 * The folders named above, as they exist here.
 *
 * Matched by name, case-insensitively, and nothing else. A name that is not
 * there is reported rather than guessed at — this job deletes rows, and
 * guessing which ones is how you lose the wrong folder.
 */
function moveTargets_() {
  var folders = listFolders_();
  var found = [];
  var missing = [];

  for (var i = 0; i < MOVE_FOLDERS.length; i++) {
    var wanted = MOVE_FOLDERS[i].toLowerCase();
    var match = null;
    for (var f = 0; f < folders.length; f++) {
      if (folders[f].name.toLowerCase() === wanted) match = folders[f];
    }
    if (match) found.push(match);
    else missing.push(MOVE_FOLDERS[i]);
  }

  if (missing.length) {
    var all = [];
    for (var a = 0; a < folders.length; a++) all.push('"' + folders[a].name + '"');
    Logger.log('Not found: %s.', missing.join(', '));
    Logger.log('The sheet has: %s.', all.length ? all.join(', ') : '(no folders)');
    Logger.log('Fix MOVE_FOLDERS so the names match exactly, then run again.');
  }

  return { found: found, missing: missing };
}

/** Every row belonging to the folders being moved. */
function movePlan_() {
  var targets = moveTargets_();
  if (targets.missing.length) return null;
  if (!targets.found.length) {
    Logger.log('Nothing to move.');
    return null;
  }

  var names = {};
  for (var t = 0; t < targets.found.length; t++) {
    names[targets.found[t].name.toLowerCase()] = targets.found[t].name;
  }

  var sheet = getSheet_();
  var schema = ensureHeaders_(sheet);
  var map = schema.map;

  var lastRow = sheet.getLastRow();
  var rows = [];

  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, schema.width).getValues();
    for (var i = 0; i < values.length; i++) {
      if (!values[i][map.id]) continue;
      var word = rowToWord_(values[i], map);
      var key = String(word.folder || '').toLowerCase();
      if (!names[key]) continue;
      rows.push({ row: i + 2, word: word, values: values[i].slice(), folder: names[key] });
    }
  }

  return { folders: targets.found, schema: schema, rows: rows };
}

/** Writes the plan to the log and changes nothing. */
function previewFolderMove() {
  var plan = movePlan_();
  if (!plan) return;

  var counts = {};
  for (var i = 0; i < plan.rows.length; i++) {
    counts[plan.rows[i].folder] = (counts[plan.rows[i].folder] || 0) + 1;
  }

  Logger.log('Moving out of this spreadsheet:');
  for (var f = 0; f < plan.folders.length; f++) {
    var name = plan.folders[f].name;
    Logger.log('  "%s" — %s word(s)', name, counts[name] || 0);
  }

  Logger.log('Total: %s word(s) and %s folder(s).', plan.rows.length, plan.folders.length);
  Logger.log('Destination: %s', MOVE_TARGET_ID
    ? 'the spreadsheet with id ' + MOVE_TARGET_ID
    : 'a new spreadsheet called "' + MOVE_TARGET_NAME + '"');
  Logger.log('');
  Logger.log('Nothing has been changed. The copy is read back and checked row by');
  Logger.log('row before anything here is deleted; run moveFoldersOut() to do it.');
}

/** The destination's Words and Folders sheets, made if they are not there. */
function moveDestination_() {
  var book = MOVE_TARGET_ID
    ? SpreadsheetApp.openById(MOVE_TARGET_ID)
    : SpreadsheetApp.create(MOVE_TARGET_NAME);

  var words = book.getSheetByName(SHEET_NAME);
  if (!words) {
    words = book.insertSheet(SHEET_NAME);
    words.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    words.setFrozenRows(1);
    words.getRange(1, 1, words.getMaxRows(), HEADERS.length).setNumberFormat('@');
  }

  var folders = book.getSheetByName(FOLDER_SHEET_NAME);
  if (!folders) {
    folders = book.insertSheet(FOLDER_SHEET_NAME);
    folders.getRange(1, 1, 1, FOLDER_HEADERS.length).setValues([FOLDER_HEADERS]);
    folders.setFrozenRows(1);
    folders.getRange(1, 1, folders.getMaxRows(), FOLDER_HEADERS.length).setNumberFormat('@');
  }

  return { book: book, words: words, folders: folders };
}

/** Does it: copy, read the copy back, and only then delete. */
function moveFoldersOut() {
  var plan = movePlan_();
  if (!plan) return;
  if (!plan.rows.length) {
    Logger.log('Those folders hold no words. Nothing moved.');
    return;
  }

  var to = moveDestination_();
  Logger.log('Destination: %s', to.book.getUrl());

  // The destination may be an older schema, or brand new. Either way its own
  // header row decides where each field lands — the columns are matched by
  // name, never by position.
  var theirs = ensureHeaders_sheet_(to.words);

  // What is already there, so a second run after a half-finished one adds
  // the rest rather than a second copy of everything.
  var already = moveExistingIds_(to.words, theirs);
  var outgoing = [];
  var skipped = 0;

  for (var i = 0; i < plan.rows.length; i++) {
    var word = plan.rows[i].word;
    if (already[word.id]) { skipped += 1; continue; }
    var line = [];
    for (var c = 0; c < theirs.width; c++) line.push('');
    for (var h = 0; h < HEADERS.length; h++) {
      var field = HEADERS[h];
      var at = theirs.map[field];
      if (at !== undefined && at < theirs.width) line[at] = escapeCell_(word[field]);
    }
    outgoing.push(line);
  }

  if (skipped) Logger.log('%s word(s) were already there and were not copied again.', skipped);

  if (outgoing.length) {
    to.words.getRange(to.words.getLastRow() + 1, 1, outgoing.length, theirs.width)
      .setValues(outgoing);
  }

  // The folder rows too, so the words still have somewhere to belong there.
  var haveFolders = {};
  var theirFolders = to.folders.getLastRow() >= 2
    ? to.folders.getRange(2, 1, to.folders.getLastRow() - 1, FOLDER_HEADERS.length).getValues()
    : [];
  for (var e = 0; e < theirFolders.length; e++) {
    haveFolders[String(theirFolders[e][1] || '').toLowerCase()] = true;
  }

  var folderRows = [];
  for (var f = 0; f < plan.folders.length; f++) {
    if (haveFolders[plan.folders[f].name.toLowerCase()]) continue;
    folderRows.push([plan.folders[f].id, plan.folders[f].name,
      plan.folders[f].createdAt || new Date().toISOString(), '']);
  }
  if (folderRows.length) {
    to.folders.getRange(to.folders.getLastRow() + 1, 1, folderRows.length, FOLDER_HEADERS.length)
      .setValues(folderRows);
  }

  SpreadsheetApp.flush();

  // Read it back. Every id has to be there before a single row goes.
  var landed = moveExistingIds_(to.words, theirs);

  var absent = [];
  for (var v = 0; v < plan.rows.length; v++) {
    if (!landed[plan.rows[v].word.id]) absent.push(plan.rows[v].word.word);
  }

  if (absent.length) {
    Logger.log('%s word(s) did not arrive: %s', absent.length, absent.slice(0, 10).join(', '));
    Logger.log('NOTHING has been deleted here. The copy is incomplete; sort that');
    Logger.log('out first, then run this again — the words already there are');
    Logger.log('matched by id, so a second run will not duplicate them.');
    return;
  }

  Logger.log('All %s word(s) checked and present at the destination.', plan.rows.length);

  withLock_(function () {
    var sheet = getSheet_();
    var rows = [];
    for (var d = 0; d < plan.rows.length; d++) rows.push(plan.rows[d].row);
    // Bottom first, so deleting one never shifts the next one's number.
    rows.sort(function (a, b) { return b - a; });
    for (var k = 0; k < rows.length; k++) sheet.deleteRow(rows[k]);

    var folderSheet = getFolderSheet_();
    for (var g = 0; g < plan.folders.length; g++) {
      var at = findFolderRow_(folderSheet, plan.folders[g].id);
      if (at !== -1) folderSheet.deleteRow(at);
    }

    Logger.log('Deleted %s word(s) and %s folder(s) from this spreadsheet.',
      rows.length, plan.folders.length);
    Logger.log('Done. Put this in MOVE_TARGET_ID to add more to the same place:');
    Logger.log('  %s', to.book.getId());
    return null;
  });
}

/** The ids a destination sheet already holds. */
function moveExistingIds_(sheet, schema) {
  var ids = {};
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return ids;

  var values = sheet.getRange(2, 1, lastRow - 1, schema.width).getValues();
  for (var i = 0; i < values.length; i++) {
    var id = String(values[i][schema.map.id] || '');
    if (id) ids[id] = true;
  }
  return ids;
}

/**
 * ensureHeaders_ for a sheet in another spreadsheet.
 *
 * The one in Code.gs reaches for this spreadsheet's Words sheet by itself;
 * this takes whichever sheet it is handed. Same rule either way: a column
 * this version expects and the sheet lacks is appended, never inserted.
 */
function ensureHeaders_sheet_(sheet) {
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
    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
    for (var m = 0; m < missing.length; m++) map[missing[m]] = header.length + m;
    SpreadsheetApp.flush();
  }

  var width = 0;
  for (var key in map) {
    if (map[key] + 1 > width) width = map[key] + 1;
  }
  return { map: map, width: width };
}
