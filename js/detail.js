/**
 * detail.js — the dialog that shows every field of one word.
 */

import { getWord, deleteWord, isPending } from './store.js';
import { DEFAULT_COLOR, YOUGLISH_BASE, YOUGLISH_LANGUAGE } from './config.js';
import { openDialog, closeDialog, wireDismiss } from './dialog.js';
import { askConfirm } from './confirm.js';
import { toast } from './toast.js';

const dialog = document.getElementById('detail-dialog');
const posElement = document.getElementById('detail-pos');
const wordElement = document.getElementById('detail-word');
const definitionBlock = document.getElementById('detail-definition-block');
const definitionElement = document.getElementById('detail-definition');
const noteBlock = document.getElementById('detail-note-block');
const noteElement = document.getElementById('detail-note');
const youglishLink = document.getElementById('detail-youglish');
const deleteButton = document.getElementById('detail-delete');
const editButton = document.getElementById('detail-edit');

let currentId = null;
let onEdit = () => {};

function fill(word) {
  posElement.textContent = word.pos || '';
  posElement.hidden = !word.pos;

  wordElement.textContent = word.word;
  wordElement.dataset.color = word.color || DEFAULT_COLOR;

  // Opens the web page; on iOS the YouGlish app may claim the link itself,
  // which is up to the OS rather than anything this page can force.
  youglishLink.href = YOUGLISH_BASE + encodeURIComponent(word.word) + '/' + YOUGLISH_LANGUAGE;
  youglishLink.setAttribute('aria-label', 'Hear “' + word.word + '” on YouGlish');

  definitionElement.textContent = word.definition || '';
  definitionBlock.hidden = !word.definition;

  noteElement.textContent = word.note || '';
  noteBlock.hidden = !word.note;
}

export function openDetail(id) {
  const word = getWord(id);
  if (!word) return;

  currentId = id;
  fill(word);
  openDialog(dialog);
}

export function closeDetail() {
  closeDialog(dialog);
  currentId = null;
}

/** Refresh the open dialog after an edit lands. */
export function syncDetail() {
  if (!currentId || !dialog.open) return;
  const word = getWord(currentId);
  if (word) fill(word);
  else closeDetail();
}

export function initDetail(handlers) {
  onEdit = handlers.onEdit;

  wireDismiss(dialog, () => {
    currentId = null;
  });

  editButton.addEventListener('click', () => {
    if (!currentId) return;
    if (isPending(currentId)) {
      toast('Still syncing — try again in a moment.');
      return;
    }
    const word = getWord(currentId);
    closeDetail();
    // Let the sheet finish closing before the form takes its place.
    setTimeout(() => onEdit(word), 180);
  });

  deleteButton.addEventListener('click', async () => {
    if (!currentId) return;

    if (isPending(currentId)) {
      toast('Still syncing — try again in a moment.');
      return;
    }

    const word = getWord(currentId);
    if (!word) return;

    const confirmed = await askConfirm({
      title: 'Delete this word?',
      text: '“' + word.word + '” will be removed from the sheet. This cannot be undone.',
      accept: 'Delete',
    });
    if (!confirmed) return;

    const id = word.id;
    closeDetail();
    try {
      await deleteWord(id);
      toast('Deleted.');
    } catch (error) {
      toast(error.message);
    }
  });
}
