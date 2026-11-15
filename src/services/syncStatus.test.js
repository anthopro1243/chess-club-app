import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  reportSyncError,
  reportLoadError,
  reportSyncOk,
  reportIfFailed,
  clearSyncError,
  getSyncError,
} from './syncStatus.js';

beforeEach(() => clearSyncError());

test('a later success of the same thing clears its error', () => {
  reportSyncError('the roster', 'timeout');
  assert.equal(getSyncError().what, 'the roster');
  reportSyncOk('the roster');
  assert.equal(getSyncError(), null);
});

test('a success of a different thing leaves the error alone', () => {
  reportSyncError('the analysis archive', 'timeout');
  reportSyncOk('the roster');
  assert.equal(getSyncError().what, 'the analysis archive');
});

test('reads and writes are told apart', () => {
  reportLoadError('the analysis archive', 'timeout');
  assert.equal(getSyncError().kind, 'load');
  reportSyncError('the roster', 'timeout');
  assert.equal(getSyncError().kind, 'save');
});

test('reportIfFailed clears on success and reports on failure', () => {
  reportIfFailed('that game')({ error: { message: 'nope' } });
  assert.equal(getSyncError().what, 'that game');
  reportIfFailed('that game')({ error: null });
  assert.equal(getSyncError(), null);
});
