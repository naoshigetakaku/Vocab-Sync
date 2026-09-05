/**
 * store.js — word state, offline cache and the outbox.
 *
 * The spreadsheet is the source of truth. Everything here is a cache in front
 * of it, plus a queue of changes that have not reached it yet.
 */

import { api, ApiError, isRetryable } from './api.js';
import { STORAGE_KEYS, ARCHIVE_FOLDER } from './config.js';
import { readJson, writeJson } from './storage.js';

let words = readJson(STORAGE_KEYS.words, []);
let folders = readJson(STORAGE_KEYS.folders, []);
let outbox = readJson(STORAGE_KEYS.outbox, []);

const listeners = new Set();

/* --- Subscriptions -------------------------------------------------------- */

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  const snapshot = getWords();
  listeners.forEach((listener) => listener(snapshot));
}

/* --- Reads ---------------------------------------------------------------- */

/** Unordered copy; the view applies whichever sort the user picked. */
export function getWords() {
  return words.slice();
}

/** Creation order, so a folder keeps the same place on the grid for good. */
export function getFolders() {
  return folders.slice().sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

export function getFolder(id) {
  return folders.find((folder) => folder.id === id) || null;
}

export function findFolderByName(name) {
  return folders.find((folder) => folder.name === name) || null;
}

/**
 * Words in one folder. Passing null gathers the unsorted ones: no folder at
 * all, or a folder that has since been deleted.
 */
export function getWordsInFolder(name) {
  if (name === null) {
    const known = new Set(folders.map((folder) => folder.name));
    return words.filter((word) => !word.folder || !known.has(word.folder));
  }
  return words.filter((word) => word.folder === name);
}

export function countUnsorted() {
  return getWordsInFolder(null).length;
}

export function getWord(id) {
  return words.find((word) => word.id === id) || null;
}

export function isPending(id) {
  const word = getWord(id);
  return Boolean(word && word.pending);
}

/* --- Persistence ---------------------------------------------------------- */

function persist() {
  writeJson(STORAGE_KEYS.words, words);
  writeJson(STORAGE_KEYS.folders, folders);
  writeJson(STORAGE_KEYS.outbox, outbox);
}

function commit() {
  persist();
  emit();
}

function localId() {
  return 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/* --- Outbox --------------------------------------------------------------- */

function enqueue(entry) {
  outbox = outbox.concat([entry]);
}

function dequeue(entry) {
  outbox = outbox.filter((item) => item !== entry);
}

/**
 * Replay queued changes in order. Stops at the first retryable failure so the
 * queue keeps its ordering; entries the server rejects outright are dropped,
 * because retrying them forever would wedge the queue.
 */
async function flushOutbox() {
  const failures = [];

  for (const entry of outbox.slice()) {
    try {
      if (entry.op === 'create') {
        const saved = await api.create(entry.fields);
        replaceLocal(entry.localId, Object.assign({}, saved, { pending: false }));
      } else if (entry.op === 'update') {
        const saved = await api.update(entry.fields);
        replaceLocal(saved.id, Object.assign({}, saved, { pending: false }));
      } else if (entry.op === 'delete') {
        await api.remove(entry.id);
      }
      dequeue(entry);
    } catch (error) {
      if (isRetryable(error)) {
        persist();
        throw error;
      }
      dequeue(entry);
      failures.push(error);
    }
  }

  persist();
  if (failures.length) throw failures[0];
}

export function pendingCount() {
  return outbox.length;
}

/* --- Local mutation helpers ----------------------------------------------- */

function replaceLocal(id, next) {
  let found = false;
  words = words.map((word) => {
    if (word.id !== id) return word;
    found = true;
    return next;
  });
  if (!found && next) words = [next].concat(words);
}

function removeLocal(id) {
  words = words.filter((word) => word.id !== id);
}

/**
 * Remote list wins, but anything still queued locally is layered back on top so
 * an unsynced word does not vanish from the screen after a refresh.
 */
function mergeRemote(remote) {
  const queuedCreates = outbox
    .filter((entry) => entry.op === 'create')
    .map((entry) => words.find((word) => word.id === entry.localId))
    .filter(Boolean);

  const deletedIds = new Set(outbox.filter((entry) => entry.op === 'delete').map((entry) => entry.id));
  const editedById = new Map(
    outbox.filter((entry) => entry.op === 'update').map((entry) => [entry.fields.id, entry.fields])
  );

  const reconciled = remote
    .filter((word) => !deletedIds.has(word.id))
    .map((word) => {
      const edit = editedById.get(word.id);
      return edit ? Object.assign({}, word, edit, { pending: true }) : Object.assign({}, word, { pending: false });
    });

  words = queuedCreates.concat(reconciled);
}

/* --- Public actions ------------------------------------------------------- */

/** Push anything queued, then pull the authoritative snapshot. */
export async function refresh() {
  await flushOutbox();
  const snapshot = await api.list();
  folders = snapshot.folders;
  mergeRemote(snapshot.words);
  commit();
}

/* --- Folders --------------------------------------------------------------
   No outbox here. A folder change is rare and deliberate, and replaying one
   offline against a name another device may have taken in the meantime is a
   conflict worth refusing rather than guessing at. */

export async function createFolder(name) {
  const saved = await api.createFolder(name);
  folders = folders.concat([saved]);
  commit();
  return saved;
}

export async function renameFolder(id, name) {
  const previous = getFolder(id);
  const saved = await api.renameFolder(id, name);

  folders = folders.map((folder) => (folder.id === id ? saved : folder));
  // Words point at the folder by name, so they follow the rename locally too.
  if (previous && previous.name !== saved.name) {
    words = words.map((word) =>
      (word.folder === previous.name ? Object.assign({}, word, { folder: saved.name }) : word));
  }
  commit();
  return saved;
}

/**
 * Move a word into the archive, creating that folder the first time.
 *
 * Nothing is deleted: the word keeps every field and simply changes folder,
 * so it can be moved back from the edit sheet like any other.
 */
export async function archiveWord(id) {
  const word = getWord(id);
  if (!word) return null;
  if (word.folder === ARCHIVE_FOLDER) return word;

  if (!findFolderByName(ARCHIVE_FOLDER)) await createFolder(ARCHIVE_FOLDER);

  return updateWord({
    id: word.id,
    word: word.word,
    pos: word.pos,
    definition: word.definition,
    note: word.note,
    color: word.color,
    folder: ARCHIVE_FOLDER,
  });
}

/** Pass an empty string to clear the photo. */
export async function setFolderPhoto(id, photo) {
  const saved = await api.setFolderPhoto(id, photo);
  folders = folders.map((folder) => (folder.id === id ? saved : folder));
  commit();
  return saved;
}

export async function deleteFolder(id) {
  const previous = getFolder(id);
  await api.removeFolder(id);

  folders = folders.filter((folder) => folder.id !== id);
  // The words survive as unsorted.
  if (previous) {
    words = words.map((word) =>
      (word.folder === previous.name ? Object.assign({}, word, { folder: '' }) : word));
  }
  commit();
}

export async function createWord(fields) {
  const now = new Date().toISOString();
  const draft = Object.assign({}, fields, {
    id: localId(),
    createdAt: now,
    updatedAt: now,
    pending: true,
  });

  words = [draft].concat(words);
  commit();

  try {
    const saved = await api.create(fields);
    replaceLocal(draft.id, Object.assign({}, saved, { pending: false }));
    commit();
    return saved;
  } catch (error) {
    if (isRetryable(error)) {
      enqueue({ op: 'create', localId: draft.id, fields });
      commit();
      return draft;
    }
    // A rejected write must not leave a phantom row behind.
    removeLocal(draft.id);
    commit();
    throw error;
  }
}

export async function updateWord(fields) {
  const previous = getWord(fields.id);
  if (!previous) throw new ApiError('NOT_FOUND', 'That word no longer exists.');

  const optimistic = Object.assign({}, previous, fields, {
    updatedAt: new Date().toISOString(),
    pending: true,
  });
  replaceLocal(fields.id, optimistic);
  commit();

  try {
    const saved = await api.update(fields);
    replaceLocal(fields.id, Object.assign({}, saved, { pending: false }));
    commit();
    return saved;
  } catch (error) {
    if (isRetryable(error)) {
      enqueue({ op: 'update', fields });
      commit();
      return optimistic;
    }
    replaceLocal(fields.id, previous);
    commit();
    throw error;
  }
}

export async function deleteWord(id) {
  const previous = getWord(id);
  if (!previous) return;

  removeLocal(id);
  commit();

  try {
    await api.remove(id);
  } catch (error) {
    if (isRetryable(error)) {
      enqueue({ op: 'delete', id });
      commit();
      return;
    }
    words = [previous].concat(words);
    commit();
    throw error;
  }
}

/** Drop every cached record — used when the credentials are replaced. */
export function reset() {
  words = [];
  folders = [];
  outbox = [];
  commit();
}
