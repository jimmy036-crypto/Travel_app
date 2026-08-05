import { describe, expect, it } from 'vitest';

import { buildPrintPreviewToolbar } from './itineraryPrintPreview.js';

describe('buildPrintPreviewToolbar', () => {
  it('escapes the return URL and keeps close-first navigation fallback', () => {
    const html = buildPrintPreviewToolbar('https://travel.test/trip?a="x"&b=<unsafe>');

    expect(html).toContain('href="https://travel.test/trip?a=&quot;x&quot;&amp;b=&lt;unsafe&gt;"');
    expect(html).toContain('window.close()');
    expect(html).toContain('if (!window.closed) window.location.assign(returnHref)');
    expect(html).toContain('完成或取消列印後');
    expect(html).not.toContain('window.print()</script>');
  });
});
