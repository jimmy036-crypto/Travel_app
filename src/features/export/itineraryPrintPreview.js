const escapeAttribute = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const buildPrintPreviewToolbar = (returnUrl) => `
  <div class="no-print" role="toolbar" aria-label="完整行程預覽工具">
    <a id="return-trip" href="${escapeAttribute(returnUrl)}">返回旅程</a>
    <div class="preview-heading">
      <strong>預覽完整行程</strong>
      <span>完成或取消列印後，可使用「返回旅程」回到原行程。</span>
    </div>
    <button type="button" onclick="window.print()">列印／另存 PDF</button>
  </div>
  <script>
    (function () {
      var returnTrip = document.getElementById('return-trip');
      returnTrip.addEventListener('click', function (event) {
        event.preventDefault();
        var returnHref = returnTrip.href;
        window.close();
        window.setTimeout(function () {
          if (!window.closed) window.location.assign(returnHref);
        }, 150);
      });
    }());
  </script>`;
