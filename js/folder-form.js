/**
 * folder-form.js — the sheet that names a folder, for both create and rename.
 */

import { MAX_FOLDER_NAME_LENGTH } from './config.js';
import { createFolder, renameFolder } from './store.js';
import { openDialog, closeDialog, wireDismiss } from './dialog.js';

const dialog = document.getElementById('folder-dialog');
const form = document.getElementById('folder-form');
const titleElement = document.getElementById('folder-form-title');
const nameField = document.getElementById('field-folder-name');
const errorElement = document.getElementById('folder-error');
const submitButton = document.getElementById('folder-submit');
const cancelButton = document.getElementById('folder-cancel');

let editingId = null;
let busy = false;
let afterSave = () => {};

function showError(message) {
  errorElement.textContent = message;
  errorElement.hidden = false;
  form.classList.remove('is-invalid');
  void form.offsetWidth;
  form.classList.add('is-invalid');
}

function clearError() {
  errorElement.hidden = true;
  errorElement.textContent = '';
  form.classList.remove('is-invalid');
  nameField.removeAttribute('aria-invalid');
}

function setBusy(value) {
  busy = value;
  submitButton.disabled = value;
  cancelButton.disabled = value;
  submitButton.textContent = value ? 'Saving…' : (editingId ? 'Rename' : 'Create');
}

export function openCreateFolder() {
  editingId = null;
  titleElement.textContent = 'New folder';
  form.reset();
  clearError();
  setBusy(false);
  openDialog(dialog);
  setTimeout(() => nameField.focus(), 320);
}

export function openRenameFolder(folder) {
  editingId = folder.id;
  titleElement.textContent = 'Rename folder';
  nameField.value = folder.name;
  clearError();
  setBusy(false);
  openDialog(dialog);
}

export function initFolderForm(handlers) {
  afterSave = handlers.afterSave || (() => {});

  wireDismiss(dialog, () => {
    editingId = null;
  });

  cancelButton.addEventListener('click', () => {
    if (busy) return;
    closeDialog(dialog);
    editingId = null;
  });

  nameField.addEventListener('input', clearError);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;

    const name = nameField.value.trim();
    if (!name) {
      nameField.setAttribute('aria-invalid', 'true');
      showError('Enter a name.');
      return;
    }
    if (name.length > MAX_FOLDER_NAME_LENGTH) {
      nameField.setAttribute('aria-invalid', 'true');
      showError('That name is too long.');
      return;
    }

    setBusy(true);
    try {
      const saved = editingId
        ? await renameFolder(editingId, name)
        : await createFolder(name);

      closeDialog(dialog);
      const wasRename = Boolean(editingId);
      editingId = null;
      afterSave(saved, wasRename);
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  });
}
