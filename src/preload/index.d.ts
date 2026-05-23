import type { ForzaApi } from './index';

declare global {
  interface Window {
    forza: ForzaApi;
  }
}

export {};
