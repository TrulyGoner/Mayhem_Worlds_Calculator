const extensionApi = globalThis.browser || globalThis.chrome;

export function extensionUrl(path) {
  try {
    return extensionApi?.runtime?.getURL(path) || "";
  } catch {
    return "";
  }
}