import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createJournalConflict, readJournalDraft, removeJournalDraft, resolveJournalConflict, writeJournalDraft } from './journalDraftStore.js';

const identity = { uid: 'alice', kind: 'memory', recordId: 'trip-a' };
beforeEach(() => localStorage.clear());

describe('journal drafts', () => {
  it('restores the original base and isolates account and record identities', () => {
    expect(writeJournalDraft({ ...identity, baseRevision: 4, baseValue: { note: 'old' }, value: { note: 'mine' } }).ok).toBe(true);
    expect(readJournalDraft(identity).draft).toMatchObject({ baseRevision: 4, baseValue: { note: 'old' }, value: { note: 'mine' } });
    expect(readJournalDraft({ ...identity, uid: 'bob' }).draft).toBeNull();
    expect(readJournalDraft({ ...identity, recordId: 'trip-b' }).draft).toBeNull();
    expect(removeJournalDraft(identity).ok).toBe(true);
    expect(readJournalDraft(identity).draft).toBeNull();
  });
  it('reports storage failure instead of claiming a draft was saved', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    expect(writeJournalDraft({ ...identity, baseRevision: 0, baseValue: {}, value: { note: 'keep me' } })).toMatchObject({ ok: false, error: expect.any(String) });
  });
  it('reports malformed stored drafts without deleting the evidence', () => {
    writeJournalDraft({ ...identity, baseRevision: 1, baseValue: {}, value: { note: 'mine' } });
    localStorage.setItem(localStorage.key(0), '{bad');
    expect(readJournalDraft(identity)).toMatchObject({ ok: false, draft: null });
    expect(localStorage.length).toBe(1);
  });
});

describe('three-way merge', () => {
  it('combines independently edited nested fields and keeps remote additions', () => {
    const base = { note: 'old', visits: { a: { city: '京都', note: 'old' } } };
    const local = { ...base, note: 'mine' };
    const remote = { note: 'old', visits: { a: { city: '京都', note: 'theirs' }, b: { name: 'new' } } };
    const conflict = createJournalConflict({ baseValue: base, localValue: local, value: remote, revision: 8 });
    expect(conflict.conflicts).toEqual([]);
    expect(resolveJournalConflict(conflict, {})).toEqual({ note: 'mine', visits: { a: { city: '京都', note: 'theirs' }, b: { name: 'new' } } });
  });
  it('requires a choice for competing edits and for delete-versus-edit', () => {
    const conflict = createJournalConflict({ baseValue: { note: 'old', visits: { a: { note: 'old' } } }, localValue: { note: 'mine', visits: {} }, value: { note: 'theirs', visits: { a: { note: 'new' } } }, revision: 3 });
    expect(conflict.conflicts.map((field) => field.path)).toEqual(['/note', '/visits/a']);
    expect(() => resolveJournalConflict(conflict, { '/note': 'local' })).toThrow();
    expect(resolveJournalConflict(conflict, { '/note': 'local', '/visits/a': 'remote' })).toEqual({ note: 'mine', visits: { a: { note: 'new' } } });
  });
});
