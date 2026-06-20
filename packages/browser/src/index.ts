export type BrowserName = "chrome" | "firefox" | "edge" | "safari" | "unknown";

export type BrowserInfo = {
  name: BrowserName;
  userAgent: string;
  apiNamespace: "browser" | "chrome" | "none";
};

export type RuntimeMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void
) => unknown;

export type TabsQuery = Record<string, unknown>;
export type TabCreateProperties = Record<string, unknown>;

type ExtensionApi = Record<string, unknown>;

type ExtensionGlobal = typeof globalThis & {
  browser?: ExtensionApi;
  chrome?: ExtensionApi;
};

type ApiNamespace = {
  api: ExtensionApi;
  name: "browser" | "chrome";
};

export class OpenExtBrowserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenExtBrowserError";
  }
}

export const ext = {
  storage: {
    local: {
      get: (keys?: string | string[] | Record<string, unknown> | null): Promise<unknown> =>
        invokeExtensionApi(["storage", "local", "get"], [keys]),
      set: (items: Record<string, unknown>): Promise<void> =>
        invokeExtensionApi(["storage", "local", "set"], [items]) as Promise<void>,
      remove: (keys: string | string[]): Promise<void> =>
        invokeExtensionApi(["storage", "local", "remove"], [keys]) as Promise<void>
    }
  },
  runtime: {
    sendMessage: (message: unknown): Promise<unknown> =>
      invokeExtensionApi(["runtime", "sendMessage"], [message]),
    onMessage: (listener: RuntimeMessageListener): (() => void) =>
      addExtensionListener(["runtime", "onMessage"], listener)
  },
  tabs: {
    query: (queryInfo: TabsQuery): Promise<unknown[]> =>
      invokeExtensionApi(["tabs", "query"], [queryInfo]) as Promise<unknown[]>,
    getActive: async (): Promise<unknown | undefined> => {
      const tabs = (await ext.tabs.query({ active: true, currentWindow: true })) as unknown[];
      return tabs[0];
    },
    create: (createProperties: TabCreateProperties): Promise<unknown> =>
      invokeExtensionApi(["tabs", "create"], [createProperties])
  }
};

export function getBrowserInfo(): BrowserInfo {
  const userAgent = getUserAgent();
  const apiNamespace = getOptionalApiNamespace()?.name ?? "none";
  const lowerUserAgent = userAgent.toLowerCase();

  if (lowerUserAgent.includes("edg/")) {
    return { name: "edge", userAgent, apiNamespace };
  }

  if (lowerUserAgent.includes("firefox/")) {
    return { name: "firefox", userAgent, apiNamespace };
  }

  if (lowerUserAgent.includes("safari/") && !lowerUserAgent.includes("chrome/")) {
    return { name: "safari", userAgent, apiNamespace };
  }

  if (lowerUserAgent.includes("chrome/") || apiNamespace === "chrome") {
    return { name: "chrome", userAgent, apiNamespace };
  }

  return { name: "unknown", userAgent, apiNamespace };
}

export function isChrome(): boolean {
  return getBrowserInfo().name === "chrome";
}

export function isFirefox(): boolean {
  return getBrowserInfo().name === "firefox";
}

export function isEdge(): boolean {
  return getBrowserInfo().name === "edge";
}

export function isSafari(): boolean {
  return getBrowserInfo().name === "safari";
}

async function invokeExtensionApi(path: string[], args: unknown[]): Promise<unknown> {
  const namespace = getRequiredApiNamespace();
  const { owner, method } = getMethod(namespace.api, path);

  if (namespace.name === "browser") {
    const result = method.apply(owner, args);
    return isPromiseLike(result) ? result : Promise.resolve(result);
  }

  return new Promise((resolve, reject) => {
    const callback = (result: unknown) => {
      const lastError = getChromeLastError(namespace.api);

      if (lastError) {
        reject(new OpenExtBrowserError(lastError));
        return;
      }

      resolve(result);
    };

    try {
      const result = method.apply(owner, [...args, callback]);

      if (isPromiseLike(result)) {
        result.then(resolve, reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function addExtensionListener(path: string[], listener: RuntimeMessageListener): () => void {
  const namespace = getRequiredApiNamespace();
  const eventApi = getProperty(namespace.api, path);

  if (!isRecord(eventApi) || typeof eventApi.addListener !== "function") {
    throw new OpenExtBrowserError(`Missing extension API: ${path.join(".")}.addListener`);
  }

  eventApi.addListener(listener);

  return () => {
    if (typeof eventApi.removeListener === "function") {
      eventApi.removeListener(listener);
    }
  };
}

function getRequiredApiNamespace(): ApiNamespace {
  const namespace = getOptionalApiNamespace();

  if (!namespace) {
    throw new OpenExtBrowserError(
      "No browser extension API found. Expected globalThis.browser or globalThis.chrome."
    );
  }

  return namespace;
}

function getOptionalApiNamespace(): ApiNamespace | undefined {
  const extensionGlobal = globalThis as ExtensionGlobal;

  if (extensionGlobal.browser) {
    return {
      api: extensionGlobal.browser,
      name: "browser"
    };
  }

  if (extensionGlobal.chrome) {
    return {
      api: extensionGlobal.chrome,
      name: "chrome"
    };
  }

  return undefined;
}

function getMethod(api: ExtensionApi, path: string[]): { owner: ExtensionApi; method: Function } {
  const methodName = path.at(-1);

  if (!methodName) {
    throw new OpenExtBrowserError("Extension API path cannot be empty.");
  }

  const ownerPath = path.slice(0, -1);
  const owner = getProperty(api, ownerPath);

  if (!isRecord(owner) || typeof owner[methodName] !== "function") {
    throw new OpenExtBrowserError(`Missing extension API: ${path.join(".")}`);
  }

  return {
    owner,
    method: owner[methodName] as Function
  };
}

function getProperty(api: ExtensionApi, path: string[]): unknown {
  let current: unknown = api;

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      throw new OpenExtBrowserError(`Missing extension API: ${path.join(".")}`);
    }

    current = current[segment];
  }

  return current;
}

function getChromeLastError(api: ExtensionApi): string | undefined {
  const runtime = isRecord(api.runtime) ? api.runtime : undefined;
  const lastError = isRecord(runtime?.lastError) ? runtime.lastError : undefined;
  const message = lastError?.message;

  return typeof message === "string" && message.length > 0 ? message : undefined;
}

function getUserAgent(): string {
  const navigatorValue = (globalThis as { navigator?: { userAgent?: string } }).navigator;
  return navigatorValue?.userAgent ?? "";
}

function isRecord(value: unknown): value is ExtensionApi {
  return typeof value === "object" && value !== null;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && typeof value.then === "function";
}
