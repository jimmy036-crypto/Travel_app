import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyTicketOrderNumber } from './ticketClipboard.js';

describe('copyTicketOrderNumber', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('uses the Clipboard API with only the trimmed order number', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(copyTicketOrderNumber('  ABC-123  ', {
      navigator: { clipboard: { writeText } },
      document,
    })).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('ABC-123');
  });

  it('uses and removes a textarea fallback', async () => {
    const execCommand = vi.fn(() => true);

    await expect(copyTicketOrderNumber('ORDER-9', {
      navigator: {},
      document: { ...document, body: document.body, createElement: document.createElement.bind(document), execCommand },
    })).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).not.toBeInTheDocument();
  });

  it('rejects when neither clipboard path can copy', async () => {
    const execCommand = vi.fn(() => false);

    await expect(copyTicketOrderNumber('ORDER-FAIL', {
      navigator: {},
      document: { ...document, body: document.body, createElement: document.createElement.bind(document), execCommand },
    })).rejects.toThrow('Clipboard copy failed.');

    expect(document.querySelector('textarea')).not.toBeInTheDocument();
  });
});
