/**
 * ImportFromInbox.gs — bring a pasted block of words into a folder.
 *
 * The companion to tools/glossary-triage.html, and reusable for anything
 * else that can produce four columns. Paste into a sheet rather than baking
 * the words into a script: a list that comes out of a session of triage is
 * different every time, and regenerating a .gs file for each one is a way to
 * get a typo into the sheet.
 *
 * The "Inbox" tab, from cell A1, four columns:
 *
 *     word            pos          definition              note
 *     equilibrium     Noun         平衡 (heikö)             an example
 *
 * A header row is recognised and skipped. The note may be left empty; the
 * other three may not.
 *
 * How to run it:
 *
 *   1. Paste into the Inbox tab (setupInbox() makes it if it is not there).
 *   2. previewInbox() — changes nothing, reports what would be added, what
 *      would be skipped as a duplicate, and what it cannot read.
 *   3. importInbox() — writes the rows in, all in one go.
 *
 * Running it twice adds nothing twice: a word already in the folder is
 * skipped, so a half-finished import can simply be run again.
 */

/** Where the pasted rows are read from, and where the words end up. */
var INBOX_SHEET = 'Inbox';
var INBOX_FOLDER = 'Math Glossary';

var INBOX_HEADERS = ['word', 'pos', 'definition', 'note'];

/** Makes the tab, with its header row, if it is not there yet. */
function setupInbox() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(INBOX_SHEET);

  if (sheet) {
    Logger.log('The "%s" tab is already there.', INBOX_SHEET);
    return sheet;
  }

  sheet = spreadsheet.insertSheet(INBOX_SHEET);
  sheet.getRange(1, 1, 1, INBOX_HEADERS.length).setValues([INBOX_HEADERS]);
  sheet.setFrozenRows(1);
  // Plain text, so a word like "7/8" is not turned into a date.
  sheet.getRange(1, 1, sheet.getMaxRows(), INBOX_HEADERS.length).setNumberFormat('@');
  Logger.log('Made the "%s" tab. Paste under the header row.', INBOX_SHEET);
  return sheet;
}

function inboxFolder_() {
  var folders = listFolders_();
  for (var i = 0; i < folders.length; i++) {
    if (folders[i].name.toLowerCase() === INBOX_FOLDER.toLowerCase()) return folders[i];
  }
  var created = createFolder_(INBOX_FOLDER);
  Logger.log('Created the folder "%s".', INBOX_FOLDER);
  return created;
}

/**
 * Reads the tab into rows, without touching the Words sheet.
 *
 * Returns { folder, add: [...], duplicate: [...], bad: [...] } where each
 * entry carries the sheet row it came from, so the log can point at it.
 */
function planInbox_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(INBOX_SHEET);
  if (!sheet) {
    Logger.log('No "%s" tab. Run setupInbox() and paste into it.', INBOX_SHEET);
    return null;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    Logger.log('The "%s" tab is empty.', INBOX_SHEET);
    return null;
  }

  var values = sheet.getRange(1, 1, lastRow, 4).getValues();
  var folder = inboxFolder_();

  // What is already in that folder, so a second run adds nothing twice.
  var seen = {};
  var existing = listWords_();
  for (var e = 0; e < existing.length; e++) {
    if ((existing[e].folder || '').toLowerCase() === folder.name.toLowerCase()) {
      seen[String(existing[e].word).trim().toLowerCase()] = true;
    }
  }

  var add = [];
  var duplicate = [];
  var bad = [];

  for (var r = 0; r < values.length; r++) {
    var word = String(values[r][0] || '').trim();
    var pos = String(values[r][1] || '').trim();
    var definition = String(values[r][2] || '').trim();
    var note = String(values[r][3] || '').trim();
    var at = r + 1;

    if (!word && !pos && !definition) continue;                 // blank row
    if (r === 0 && word.toLowerCase() === 'word') continue;      // header row

    if (!word) {
      bad.push({ row: at, word: '(blank)', why: 'no word' });
      continue;
    }
    if (PARTS_OF_SPEECH.indexOf(pos) === -1) {
      bad.push({ row: at, word: word, why: 'part of speech "' + pos + '" is not one of '
        + PARTS_OF_SPEECH.join(', ') });
      continue;
    }
    if (!definition) {
      bad.push({ row: at, word: word, why: 'no definition' });
      continue;
    }

    var key = word.toLowerCase();
    if (seen[key]) {
      duplicate.push({ row: at, word: word });
      continue;
    }
    seen[key] = true;
    add.push({ row: at, word: word, pos: pos, definition: definition, note: note });
  }

  return { folder: folder, add: add, duplicate: duplicate, bad: bad };
}

/** Says what would happen, and changes nothing. */
function previewInbox() {
  var plan = planInbox_();
  if (!plan) return;

  Logger.log('Folder: "%s".', plan.folder.name);
  Logger.log('%s to add, %s already there, %s unreadable.',
    plan.add.length, plan.duplicate.length, plan.bad.length);

  if (plan.bad.length) {
    Logger.log('--- Cannot read ---');
    for (var b = 0; b < plan.bad.length; b++) {
      Logger.log('  row %s "%s" — %s', plan.bad[b].row, plan.bad[b].word, plan.bad[b].why);
    }
  }

  if (plan.duplicate.length) {
    Logger.log('--- Already in the folder (will be skipped) ---');
    var names = [];
    for (var d = 0; d < plan.duplicate.length; d++) names.push(plan.duplicate[d].word);
    Logger.log('  %s', names.join(', '));
  }

  Logger.log('--- Would add ---');
  for (var a = 0; a < Math.min(plan.add.length, 40); a++) {
    Logger.log('  %s  [%s]  %s', plan.add[a].word, plan.add[a].pos, plan.add[a].definition);
  }
  if (plan.add.length > 40) Logger.log('  … and %s more', plan.add.length - 40);

  Logger.log('Nothing has been changed. Run importInbox() to apply this.');
}

/** Writes the rows in. Safe to run twice. */
function importInbox() {
  var plan = planInbox_();
  if (!plan) return;

  if (plan.bad.length) {
    Logger.log('%s row(s) cannot be read. Fix them or clear them, then run again.',
      plan.bad.length);
    Logger.log('Run previewInbox() to see which.');
    return;
  }
  if (!plan.add.length) {
    Logger.log('Nothing to add — all %s row(s) are already in "%s".',
      plan.duplicate.length, plan.folder.name);
    return;
  }

  withLock_(function () {
    var sheet = getSheet_();
    var schema = ensureHeaders_(sheet);
    var width = schema.width;
    var now = new Date().toISOString();
    var rows = [];

    for (var i = 0; i < plan.add.length; i++) {
      var entry = plan.add[i];
      // Through the same validation every saved word goes through.
      var fields = validate_({
        word: entry.word, pos: entry.pos, definition: entry.definition,
        note: entry.note, color: 'default', folder: plan.folder.name, status: ''
      });
      rows.push(wordToRow_(buildRecord_(fields, Utilities.getUuid(), now, now),
        schema.map, width));
    }

    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, width).setValues(rows);

    Logger.log('Added %s word(s) to "%s".', rows.length, plan.folder.name);
    if (plan.duplicate.length) {
      Logger.log('Skipped %s already in that folder.', plan.duplicate.length);
    }
    Logger.log('Done. The app picks these up on its next sync.');
    Logger.log('The Inbox tab is left as it is; clear it when you are happy.');
    return null;
  });
}
