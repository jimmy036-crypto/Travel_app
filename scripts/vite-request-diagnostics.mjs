import { createWriteStream, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const TRUNCATION_RESERVE_BYTES = 128;
const MAX_BUFFER_BYTES = 1024 * 1024;

function enabled({ command, mode }) {
  return command === 'serve' && mode === 'emulator'
    && process.env.TRAVEL_E2E_REQUEST_DIAGNOSTICS === 'true'
    && process.env.VITE_USE_FIREBASE_EMULATOR === 'true'
    && process.env.VITE_FIREBASE_PROJECT_ID === 'demo-travel-e2e';
}

// Only local code/module paths, never arbitrary routes, filesystem paths,
// query strings, fragments, credentials, request/response headers or bodies.
export function diagnosticModulePath(rawUrl = '') {
  const pathname = rawUrl.split(/[?#]/u, 1)[0];
  if (pathname.length > 240 || !/^\/[A-Za-z0-9_@./-]+$/u.test(pathname)
    || pathname.split('/').some((part) => part === '.' || part === '..')) return null;
  if (pathname === '/@vite/client' || pathname === '/@react-refresh') return pathname;
  if (/^\/src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:jsx?|tsx?|css)$/u.test(pathname)
    || /^\/node_modules\/\.vite\/deps\/@?[A-Za-z0-9_][A-Za-z0-9_.-]*\.js$/u.test(pathname)) return pathname;
  return null;
}

export function viteRequestDiagnostics() {
  return {
    name: 'travel-e2e-request-diagnostics',
    apply: (_config, environment) => enabled(environment),
    configureServer(server) {
      if (!enabled(server.config)
        || server.config.server.host !== '127.0.0.1'
        || server.config.server.port !== 4174
        || server.config.server.strictPort !== true
        || !server.httpServer) return;

      let output;
      try {
        // Playwright clears output before starting web servers. This non-hidden
        // directory is already included in the existing always-upload artifact.
        const directory = resolve(server.config.root, 'test-results/vite-request-diagnostics');
        mkdirSync(directory, { recursive: true });
        output = createWriteStream(resolve(directory, `vite-${Date.now()}-${process.pid}.jsonl`), { flags: 'wx' });
      } catch {
        console.warn('[e2e-request-diagnostics] unavailable');
        return;
      }

      let recording = true;
      let bytes = 0;
      let requestId = 0;
      output.on('error', () => {
        recording = false;
        // Raw errors can contain filesystem paths; do not log them.
        console.warn('[e2e-request-diagnostics] unavailable');
      });
      const record = (entry) => {
        if (!recording) return;
        const line = `${JSON.stringify(entry)}\n`;
        const size = Buffer.byteLength(line);
        // Stop observing rather than waiting for disk/drain and changing the
        // application's request timing. Mark any loss of diagnostic coverage.
        if (bytes + size > MAX_FILE_BYTES - TRUNCATION_RESERVE_BYTES || output.writableLength > MAX_BUFFER_BYTES) {
          recording = false;
          output.end(`${JSON.stringify({ event: 'truncated', time: Date.now() })}\n`);
          console.warn('[e2e-request-diagnostics] truncated');
          return;
        }
        bytes += size;
        output.write(line);
      };

      record({ event: 'server-start', time: Date.now() });
      server.httpServer.once('close', () => {
        if (!recording) return;
        record({ event: 'server-close', time: Date.now() });
        if (recording) output.end();
        recording = false;
      });

      // Installed before Vite's cached-transform/transform middlewares. No
      // route interception, warmup, new requests or response modification.
      server.middlewares.use((request, response, next) => {
        const pathname = diagnosticModulePath(request.url);
        if (recording && pathname) {
          const id = ++requestId;
          const start = performance.now();
          record({ event: 'request-start', id, pathname, time: Date.now() });
          const complete = (event) => {
            response.off('finish', onFinish);
            response.off('close', onClose);
            record({
              event, id, pathname, time: Date.now(),
              durationMs: Math.round((performance.now() - start) * 1000) / 1000,
              // A default 200 before headers is not a completed response.
              status: response.headersSent ? response.statusCode : null,
            });
          };
          const onFinish = () => complete('response-finish');
          const onClose = () => complete('response-close');
          response.once('finish', onFinish);
          response.once('close', onClose);
        }
        next();
      });
    },
  };
}
