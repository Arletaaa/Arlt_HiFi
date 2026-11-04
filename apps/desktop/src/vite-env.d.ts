/// <reference types="vite/client" />

import type { ArltHifiDesktopApi } from "@arlt-hifi/shared";

declare global {
  interface Window {
    readonly arltHifiDesktop?: ArltHifiDesktopApi;
  }
}
