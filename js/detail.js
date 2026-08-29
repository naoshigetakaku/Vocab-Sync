/**
 * detail.js — the dialog that shows every field of one word.
 */

import { getWord, deleteWord, isPending } from './store.js';
import { openDialog, closeDialog, wireDismiss } from './dialog.js';
import { toast } from './toast.js';

const dialog = document.getElementById('detail-dialog');
const posElement = document.getElementById('detail-pos');
const wordElement = document.getElementById('detail-word');
const definitionBlock = document.getElementById('detail-definition-block');
const definitionElement = document.getElementById('detail-definition');
const noteBlock = document.getElementById('detail-note-block');
const noteElement = document.getElementById('detail-note');
const deleteButton = document.getElementById('detail-delete');
const editButton = document.getElementById('detail-edit');

let currentId = null;
let deleteArmed = false;
let onEdit = () => {};

function disarmDelete() {
  deleteArmed = false;
  deleteButton.textContent = 'Delete';
  deleteButton.classList.remove('button--armed');
}

function fill(word) {
  posElement.textContent = word.pos || '';
  posElement.hidden = !word.pos;
  wordElement.textContent = word.word;

  definitionElement.textContent = word.definition || '';
  definitionBlock.hidden = !word.definition;

  noteElement.textContent = word.note || '';
  noteBlock.hidden = !word.note;
}

export function openDetail(id) {
  const word = getWord(id);
  if (!word) return;

  currentId = id;
  disarmDelete();
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
    disarmDelete();
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

    // First tap arms, second tap commits.
    if (!deleteArmed) {
      deleteArmed = true;
      deleteButton.textContent = 'Confirm delete';
      deleteButton.classList.add('button--armed');
      setTimeout(disarmDelete, 4000);
      return;
    }

    const id = currentId;
    closeDetail();
    try {
      await deleteWord(id);
      toast('Deleted.');
    } catch (error) {
      toast(error.message);
    }
  });
}
