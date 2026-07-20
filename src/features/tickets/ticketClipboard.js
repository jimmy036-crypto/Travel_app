const trimText = (value) => String(value ?? '').trim();

export async function copyTicketOrderNumber(orderNumber, environment = {}) {
  const value = trimText(orderNumber);
  if (!value) throw new Error('Order number is required.');

  const navigatorObject = environment.navigator ?? globalThis.navigator;
  const documentObject = environment.document ?? globalThis.document;

  if (typeof navigatorObject?.clipboard?.writeText === 'function') {
    await navigatorObject.clipboard.writeText(value);
    return true;
  }

  if (!documentObject?.body || typeof documentObject.createElement !== 'function') {
    throw new Error('Clipboard is unavailable.');
  }

  const textarea = documentObject.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  documentObject.body.appendChild(textarea);

  try {
    textarea.select();
    textarea.setSelectionRange?.(0, textarea.value.length);
    if (typeof documentObject.execCommand !== 'function' || !documentObject.execCommand('copy')) {
      throw new Error('Clipboard copy failed.');
    }
    return true;
  } finally {
    textarea.remove();
  }
}
