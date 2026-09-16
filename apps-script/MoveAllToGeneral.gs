/**
 * MoveAllToGeneral.gs — a one-off tidy-up. Run it once, then delete this file.
 *
 * Puts every word into a single folder called GENERAL and removes every other
 * folder from the Folders sheet. No word is deleted, and nothing else about a
 * word changes: the label, the quiz schedule, the colour and the note are all
 * left exactly as they are.
 *
 * How to run it
 *   1. Paste this file into the same Apps Script project as Code.gs — it uses
 *      the helpers there, so Code.gs must already be the current version.
 *   2. Pick moveAllToGeneral in the function list and press Run.
 *   3. Read the log. Nothing is written until the counts look right to you:
 *      run moveAllToGeneralDryRun() first if you would rather see them.
 *
 * Afterwards the app catches up on its own the next time it syncs. If it was
 * showing a folder that no longer exists it falls back to GENERAL.
 */

var GENERAL_FOLDER = 'GENERAL';

/** Counts what would change, and writes nothing. */
function moveAllToGeneralDryRun() {
  var sheet = getSheet_();
  var schema = ensureHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  var words = lastRow < 2 ? 0 : lastRow - 1;

  var moving = 0;
  if (words) {
    var values = sheet.getRange(2, schema.map.folder + 1, words, 1).getValues();
    var ids = sheet.getRange(2, schema.map.id + 1, words, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (!ids[i][0]) continue;
      if (String(values[i][0]).trim() !== GENERAL_FOLDER) moving += 1;
    }
  }

  var names = listFolders_().map(function (folder) { return folder.name; });
  Logger.log('Words in the sheet: %s', words);
  Logger.log('Words that would move into "%s": %s', GENERAL_FOLDER, moving);
  Logger.log('Folders now: %s', names.join(', ') || '(none)');
  Logger.log('Folders that would be deleted: %s',
    names.filter(function (name) { return name !== GENERAL_FOLDER; }).join(', ') || '(none)');
  Logger.log('Nothing was written. Run moveAllToGeneral() to apply it.');
}

/** Does it. */
function moveAllToGeneral() {
  var sheet = getSheet_();
  var schema = ensureHeaders_(sheet);
  var lastRow = sheet.getLastRow();

  // 1. Make sure the folder exists, so the words point at something real.
  var folders = listFolders_();
  if (!folderNameTaken_(folders, GENERAL_FOLDER, null)) {
    createFolder_(GENERAL_FOLDER);
    Logger.log('Created folder "%s".', GENERAL_FOLDER);
  }

  // 2. Every word, whatever folder it was in — including none at all.
  var moved = 0;
  if (lastRow >= 2) {
    var rows = lastRow - 1;
    var ids = sheet.getRange(2, schema.map.id + 1, rows, 1).getValues();
    var range = sheet.getRange(2, schema.map.folder + 1, rows, 1);
    var values = range.getValues();

    for (var i = 0; i < values.length; i++) {
      if (!ids[i][0]) continue; // blank row
      if (String(values[i][0]).trim() === GENERAL_FOLDER) continue;
      values[i][0] = GENERAL_FOLDER;
      moved += 1;
    }

    if (moved) range.setValues(values);
    // Make the move real before the folder rows go, so a failure halfway
    // cannot leave words pointing at a folder that has just been deleted.
    SpreadsheetApp.flush();
  }
  Logger.log('Moved %s word(s) into "%s".', moved, GENERAL_FOLDER);

  // 3. Every other folder row. Bottom-up, so the row numbers below the one
  //    being deleted do not shift under the loop.
  var folderSheet = getFolderSheet_();
  var remaining = listFolders_();
  var doomed = remaining.filter(function (folder) { return folder.name !== GENERAL_FOLDER; });

  for (var d = doomed.length - 1; d >= 0; d--) {
    var row = findFolderRow_(folderSheet, doomed[d].id);
    if (row !== -1) folderSheet.deleteRow(row);
  }
  Logger.log('Deleted %s folder(s): %s', doomed.length,
    doomed.map(function (folder) { return folder.name; }).join(', ') || '(none)');

  Logger.log('Folders left: %s',
    listFolders_().map(function (folder) { return folder.name; }).join(', '));
  Logger.log('Done. The app picks this up on its next sync.');
}
