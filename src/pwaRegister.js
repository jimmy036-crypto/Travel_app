import { registerSW } from 'virtual:pwa-register';

export function registerAppServiceWorker(options) {
  return registerSW(options);
}
