/**
 * config.js — constants shared across the app.
 */

/**
 * Leave this empty when the repository is public.
 *
 * With an empty value the deployment URL is asked for on first run and kept in
 * localStorage, so it never appears in the source at all. Filling it in trades
 * that protection for one less field during setup.
 */
export const DEFAULT_API_URL = '';

/** Fixed vocabulary of the part-of-speech selector. */
export const PARTS_OF_SPEECH = ['Verb', 'Adj', 'Adv', 'Noun', 'Idiom', 'Expression'];

export const STORAGE_KEYS = {
  credentials: 'vocabsync.credentials.v1',
  words: 'vocabsync.words.v1',
  outbox: 'vocabsync.outbox.v1',
  installHint: 'vocabsync.install-hint.v1',
  sort: 'vocabsync.sort.v1',
};

/** Apps Script cold starts can take a couple of seconds; allow for that. */
export const REQUEST_TIMEOUT_MS = 20000;
