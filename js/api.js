/**
 * api.js — transport layer to the Apps Script Web App.
 */

import { getCredentials } from './auth.js';
import { REQUEST_TIMEOUT_MS } from './config.js';

export class ApiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code;
  }
}

const MESSAGES = {
  NOT_CONFIGURED: 'Not connected yet.',
  NETWORK: 'Could not reach the server.',
  TIMEOUT: 'The server took too long to answer.',
  UNAUTHORIZED: 'Wrong passphrase.',
  NOT_FOUND: 'That word no longer exists.',
  BAD_REQUEST: 'The server rejected the request.',
  BUSY: 'Another change is in flight. Try again.',
};

function describe(code, detail) {
  if (MESSAGES[code]) return MESSAGES[code];
  // The backend sends a `detail` string for anything it could not classify.
  // Passing it through is what makes a version mismatch diagnosable instead
  // of showing the same blank "something went wrong" every time.
  return detail ? 'Server: ' + detail : 'Something went wrong on the server.';
}

/** True for failures that are worth retrying later rather than surfacing. */
export function isRetryable(error) {
  return error instanceof ApiError && (error.code === 'NETWORK' || error.code === 'TIMEOUT');
}

async function call(action, payload) {
  const credentials = getCredentials();
  if (!credentials) throw new ApiError('NOT_CONFIGURED', describe('NOT_CONFIGURED'));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(credentials.url, {
      method: 'POST',
      // text/plain keeps this a CORS "simple request". Apps Script cannot answer
      // the OPTIONS preflight that application/json would trigger, so the
      // Content-Type must stay in the simple set and the body is parsed by hand.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, passphrase: credentials.passphrase }, payload)),
      // Apps Script answers with a redirect to googleusercontent.com.
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (error) {
    const code = error && error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
    throw new ApiError(code, describe(code));
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ApiError('HTTP_' + response.status, 'Server returned ' + response.status + '.');
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    // Usually means the deployment URL points at a login page rather than /exec.
    throw new ApiError('BAD_RESPONSE', 'Unexpected response — check the Web App URL and its access setting.');
  }

  if (!data || data.ok !== true) {
    const code = (data && data.error) || 'SERVER';
    throw new ApiError(code, describe(code, data && data.detail));
  }
  return data;
}

export const api = {
  list: () => call('list', {}).then((data) => data.words || []),
  create: (fields) => call('create', { word: fields }).then((data) => data.word),
  update: (fields) => call('update', { word: fields }).then((data) => data.word),
  remove: (id) => call('delete', { id }).then(() => true),
};
