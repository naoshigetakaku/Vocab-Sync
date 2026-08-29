/**
 * form.js — the add / edit sheet.
 *
 * Field order is fixed by design: word, part of speech, definition, note.
 */

import { PARTS_OF_SPEECH } from './config.js';
import { createWord, updateWord } from './store.js';
import { openDialog, closeDialog, wireDismiss } from './dialog.js';
import { toast } from './toast.js';

const dialog = document.getElementById('form-dialog');
const form = document.getElementById('word-form');
const titleElement = document.getElementById('form-title');
const wordField = document.getElementById('field-word');
const posField = document.getElementById('field-pos');
const definitionField = document.getElementById('field-definition');
const noteField = document.getElementById('field-note');
const errorElement = document.getElementById('form-error');
const submitButton = document.getElementById('form-submit');
const cancelButton = document.getElementById('form-cancel');

let editingId = null;
let busy = false;
let afterSave = () => {};

function buildOptions() {
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose…';
  placeholder.disabled = true;
  posField.appendChild(placeholder);

  PARTS_OF_SPEECH.forEach((pos) => {
    const option = document.createElement('option');
    option.value = pos;
    option.textContent = pos;
    posField.appendChild(option);
  });
}

function showError(message) {
  errorElement.textContent = message;
  errorElement.hidden = false;
  form.classList.remove('is-invalid');
  // Restart the shake animation on a repeated failure.
  void form.offsetWidth;
  form.classList.add('is-invalid');
}

function clearError() {
  errorElement.hidden = true;
  errorElement.textContent = '';
  form.classList.remove('is-invalid');
  wordField.removeAttribute('aria-invalid');
  posField.removeAttribute('aria-invalid');
}

function setBusy(value) {
  busy = value;
  submitButton.disabled = value;
  cancelButton.disabled = value;
  submitButton.textContent = value ? 'Saving…' : 'Save';
}

export function openCreateForm() {
  editingId = null;
  titleElement.textContent = 'New word';
  form.reset();
  posField.value = '';
  clearError();
  setBusy(false);
  openDialog(dialog);
  // Opening the keyboard while the sheet animates fights the transition on iOS.
  setTimeout(() => wordField.focus(), 320);
}

export function openEditForm(word) {
  editingId = word.id;
  titleElement.textContent = 'Edit word';
  wordField.value = word.word || '';
  posField.value = PARTS_OF_SPEECH.includes(word.pos) ? word.pos : '';
  definitionField.value = word.definition || '';
  noteField.value = word.note || '';
  clearError();
  setBusy(false);
  openDialog(dialog);
}

function readFields() {
  return {
    word: wordField.value.trim(),
    pos: posField.value,
    definition: definitionField.value.trim(),
    note: noteField.value.trim(),
  };
}

function validate(fields) {
  if (!fields.word) {
    wordField.setAttribute('aria-invalid', 'true');
    wordField.focus();
    return 'Enter a word.';
  }
  if (!fields.pos) {
    posField.setAttribute('aria-invalid', 'true');
    posField.focus();
    return 'Choose a part of speech.';
  }
  return null;
}

export function initForm(handlers) {
  afterSave = handlers.afterSave || (() => {});
  buildOptions();

  wireDismiss(dialog, () => {
    editingId = null;
  });

  cancelButton.addEventListener('click', () => {
    if (busy) return;
    closeDialog(dialog);
    editingId = null;
  });

  [wordField, posField].forEach((field) => {
    field.addEventListener('input', clearError);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;

    const fields = readFields();
    const problem = validate(fields);
    if (problem) {
      showError(problem);
      return;
    }

    setBusy(true);
    try {
      const saved = editingId
        ? await updateWord(Object.assign({ id: editingId }, fields))
        : await createWord(fields);

      closeDialog(dialog);
      editingId = null;
      afterSave(saved);
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  });
}
