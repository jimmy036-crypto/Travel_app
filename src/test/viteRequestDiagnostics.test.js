import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diagnosticModulePath, viteRequestDiagnostics } from '../../scripts/vite-request-diagnostics.mjs';

const files = vi.hoisted(() => ({ mkdirSync: vi.fn(), createWriteStream: vi.fn() }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, ...files, default: { ...actual.default, ...files } };
});

let output;
let server;
const rows = () => output.write.mock.calls.map(([line]) => JSON.parse(line));
const request = (url = '/src/TripDetail.jsx', extra = {}) => {
  const response = Object.assign(new EventEmitter(), { headersSent: false, statusCode: 200 });
  const next = vi.fn();
  server.middlewares.use.mock.calls[0][0]({ url, ...extra }, response, next);
  expect(next).toHaveBeenCalledExactlyOnceWith();
  return response;
};

beforeEach(() => {
  vi.stubEnv('TRAVEL_E2E_REQUEST_DIAGNOSTICS', 'true');
  vi.stubEnv('VITE_USE_FIREBASE_EMULATOR', 'true');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-travel-e2e');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  output = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn(), writableLength: 0 });
  files.createWriteStream.mockReturnValue(output);
  server = {
    config: { command: 'serve', mode: 'emulator', root: resolve('.tmp/vite-diagnostics-unit'), server: { host: '127.0.0.1', port: 4174, strictPort: true } },
    httpServer: new EventEmitter(),
    middlewares: { use: vi.fn() },
  };
});

afterEach(() => vi.unstubAllEnvs());

describe('opt-in Vite request diagnostics', () => {
  it.each([
    ['command', 'build'], ['mode', 'production'],
  ])('does not activate for %s=%s', (key, value) => {
    server.config[key] = value;
    const plugin = viteRequestDiagnostics();
    expect(plugin.apply({}, server.config)).toBe(false);
    plugin.configureServer(server);
    expect(files.mkdirSync).not.toHaveBeenCalled();
    expect(server.middlewares.use).not.toHaveBeenCalled();
  });

  it.each([
    ['TRAVEL_E2E_REQUEST_DIAGNOSTICS', 'false'],
    ['VITE_USE_FIREBASE_EMULATOR', 'false'],
    ['VITE_FIREBASE_PROJECT_ID', 'not-the-demo-project'],
  ])('requires the exact safe %s value before any I/O', (key, value) => {
    vi.stubEnv(key, value);
    const plugin = viteRequestDiagnostics();
    expect(plugin.apply({}, server.config)).toBe(false);
    plugin.configureServer(server);
    expect(files.createWriteStream).not.toHaveBeenCalled();
  });

  it.each([['host', '0.0.0.0'], ['port', 5173], ['strictPort', false]])('requires the local E2E server %s', (key, value) => {
    server.config.server[key] = value;
    viteRequestDiagnostics().configureServer(server);
    expect(files.mkdirSync).not.toHaveBeenCalled();
  });

  it('records one finish, never secrets or a duplicate close, and ends once', () => {
    const plugin = viteRequestDiagnostics();
    expect(plugin.apply({}, server.config)).toBe(true);
    plugin.configureServer(server);
    const response = request('/src/TripDetail.jsx?token=private-query#private-fragment', {
      headers: { authorization: 'private-header' }, body: 'private-body',
    });
    response.headersSent = true;
    response.statusCode = 304;
    response.emit('finish');
    response.emit('close');
    server.httpServer.emit('close');
    server.httpServer.emit('close');
    expect(rows().map(({ event }) => event)).toEqual(['server-start', 'request-start', 'response-finish', 'server-close']);
    expect(rows()[1]).toEqual({ event: 'request-start', id: 1, pathname: '/src/TripDetail.jsx', time: expect.any(Number) });
    expect(rows()[2]).toEqual({ event: 'response-finish', id: 1, pathname: '/src/TripDetail.jsx', time: expect.any(Number), durationMs: expect.any(Number), status: 304 });
    expect(JSON.stringify(rows())).not.toMatch(/private|headers|body|token/u);
    expect(output.end).toHaveBeenCalledOnce();
    expect(response.listenerCount('finish')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
    expect(files.createWriteStream).toHaveBeenCalledWith(expect.stringMatching(/test-results[/\\]vite-request-diagnostics[/\\]vite-\d+-\d+\.jsonl$/u), { flags: 'wx' });
  });

  it('records close before finish with null status, not a fabricated HTTP 200', () => {
    viteRequestDiagnostics().configureServer(server);
    const response = request();
    response.emit('close');
    response.emit('finish');
    expect(rows().map(({ event }) => event)).toEqual(['server-start', 'request-start', 'response-close']);
    expect(rows()[2]).toMatchObject({ status: null });
  });

  it('ignores data/external URLs while passing every request through unchanged', () => {
    viteRequestDiagnostics().configureServer(server);
    request('/?room=private-room');
    request('https://external.test/src/private.js');
    request('/api/private-token');
    expect(rows()).toHaveLength(1);
  });

  it('stops observing on stream failure without blocking requests or logging the error payload', () => {
    viteRequestDiagnostics().configureServer(server);
    output.emit('error', new Error('private-error-path'));
    request();
    expect(rows()).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[e2e-request-diagnostics] unavailable');
  });

  it('marks truncation instead of waiting for disk backpressure or delaying next()', () => {
    viteRequestDiagnostics().configureServer(server);
    output.writableLength = 1024 * 1024 + 1;
    request().emit('finish');
    request();
    server.httpServer.emit('close');
    expect(output.end).toHaveBeenCalledOnce();
    expect(JSON.parse(output.end.mock.calls[0][0])).toEqual({ event: 'truncated', time: expect.any(Number) });
    expect(rows()).toHaveLength(1);
  });

  it('caps total queued file bytes and explicitly records lost coverage', () => {
    viteRequestDiagnostics().configureServer(server);
    const byteLength = Buffer.byteLength;
    vi.spyOn(Buffer, 'byteLength').mockImplementation((value, encoding) => (
      String(value).includes('request-start') ? 64 * 1024 * 1024 : byteLength(value, encoding)
    ));
    request().emit('close');
    expect(rows()).toHaveLength(1);
    expect(output.end).toHaveBeenCalledOnce();
    expect(JSON.parse(output.end.mock.calls[0][0]).event).toBe('truncated');
  });

  it('reports a filesystem setup failure without installing middleware or exposing paths', () => {
    files.mkdirSync.mockImplementationOnce(() => { throw new Error('private-path'); });
    viteRequestDiagnostics().configureServer(server);
    expect(server.middlewares.use).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[e2e-request-diagnostics] unavailable');
  });
});

it.each([
  '/src/components/ItineraryTimelineCard.jsx?import&secret=value',
  '/src/features/map/mapItineraryModel.js',
  '/node_modules/.vite/deps/react-dom_client.js?v=private-hash',
  '/node_modules/.vite/deps/@hello-pangea_dnd.js?v=private-hash',
  '/node_modules/.vite/deps/@vis.gl_react-google-maps.js',
  '/@vite/client', '/@react-refresh',
])('keeps only the module pathname from %s', (url) => {
  expect(diagnosticModulePath(url)).toBe(url.split('?')[0]);
});

it.each([
  '/.env.local', '/src/.env.local', '/@fs/C:/private.js', '/src/../private.js',
  '/src/%70rivate.js', '/src/private\\name.js', '/src/private\nname.js',
  '/src/private.jsx/extra', '//external.test/src/private.js', '/tickets/private.pdf',
  '/src/.private.js',
])('rejects unsafe or non-module paths: %s', (url) => {
  expect(diagnosticModulePath(url)).toBeNull();
});
