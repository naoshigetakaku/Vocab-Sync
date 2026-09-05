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

/**
 * Word colours. The key is what gets stored, never the hex, so the same word
 * picks up the right shade in light and dark.
 */
export const WORD_COLORS = [
  { value: 'default', label: 'Default' },
  { value: 'red', label: 'Red' },
  { value: 'orange', label: 'Orange' },
  { value: 'amber', label: 'Amber' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'lime', label: 'Lime' },
  { value: 'green', label: 'Green' },
  { value: 'teal', label: 'Teal' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'blue', label: 'Blue' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'violet', label: 'Violet' },
  { value: 'purple', label: 'Purple' },
  { value: 'magenta', label: 'Magenta' },
  { value: 'pink', label: 'Pink' },
  { value: 'grey', label: 'Grey' },
];

export const DEFAULT_COLOR = 'default';

/** Pronunciation clips for a word, searched across real videos. */
export const YOUGLISH_BASE = 'https://youglish.com/pronounce/';
export const YOUGLISH_LANGUAGE = 'english';

export const STORAGE_KEYS = {
  credentials: 'vocabsync.credentials.v1',
  words: 'vocabsync.words.v1',
  outbox: 'vocabsync.outbox.v1',
  installHint: 'vocabsync.install-hint.v1',
  sort: 'vocabsync.sort.v1',
  folders: 'vocabsync.folders.v1',
};

/**
 * The Code.gs version this build needs. Anything lower means the deployment
 * predates a feature the app is already using — colours, for instance, get
 * written nowhere.
 */
export const REQUIRED_BACKEND_VERSION = 5;

/** Shown for words whose folder is blank or names a folder that is gone. */
export const UNSORTED_LABEL = 'Unsorted';

/**
 * Where a swiped word goes. An ordinary folder, so it shows up on the grid and
 * a word can be pulled back out of it the same way anything else is moved.
 */
export const ARCHIVE_FOLDER = 'Archive';

export const MAX_FOLDER_NAME_LENGTH = 60;

/** Apps Script cold starts can take a couple of seconds; allow for that. */
export const REQUEST_TIMEOUT_MS = 20000;
