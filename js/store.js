/**
 * store.js — word state, offline cache and the outbox.
 *
 * The spreadsheet is the source of truth. Everything here is a cache in front
 * of it, plus a queue of changes that have not reached it yet.
 */

import { api, ApiError, isRetryable } from './api.js';
import { STORAGE_KEYS } from './config.js';
import { readJson, writeJson } from './storage.js';

let words = readJson(STORAGE_KEYS.words, []);
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

/** Push anything queued, then pull the authoritative list. */
export async function refresh() {
  await flushOutbox();
  const remote = await api.list();
  mergeRemote(remote);
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

/** Drop every cached word — used when the credentials are replaced. */
export function reset() {
  words = [];
  outbox = [];
  commit();
}
