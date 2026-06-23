import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { isAbsolute, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import { z } from "zod";

export const openExtKitCoreVersion = "0.0.0";

export const browserTargets = ["chrome", "firefox", "edge", "opera", "safari"] as const;
export const extensionFrameworks = ["vanilla", "react", "svelte", "vue"] as const;
export const configFileNames = [
  "openext.config.ts",
  "openext.config.mts",
  "openext.config.cts",
  "openext.config.js",
  "openext.config.mjs",
  "openext.config.cjs"
] as const;

export type BrowserTarget = (typeof browserTargets)[number];
export type ExtensionFramework = (typeof extensionFrameworks)[number];

export type PackageFormat = "zip" | "directory";

export interface TargetCapabilities {
  name: string;
  displayName: string;
  manifestVersions: number[];
  supportsManifestV3: boolean;
  supportsServiceWorkerBackground: boolean;
  supportsBackgroundScripts: boolean;
  supportsDeclarativeNetRequest: boolean;
  supportsSidePanel: boolean;
  supportsAction: boolean;
  supportsBrowserSpecificSettings: boolean;
  supportsExtensionLoadingInTests: boolean;
  packageFormat: PackageFormat;
  experimental: boolean;
}

export interface BrowserTargetDefinition extends TargetCapabilities {}

export class TargetRegistry {
  readonly #targets = new Map<string, TargetCapabilities>();

  constructor(targets: TargetCapabilities[] = []) {
    for (const target of targets) {
      this.registerTarget(target);
    }
  }

  registerTarget(target: TargetCapabilities): TargetCapabilities {
    this.#targets.set(target.name, { ...target, manifestVersions: [...target.manifestVersions] });
    return this.getTarget(target.name);
  }

  getTarget(name: string): TargetCapabilities {
    const target = this.#targets.get(name);

    if (!target) {
      throw new OpenExtConfigError(`Unknown browser target "${name}".`);
    }

    return { ...target, manifestVersions: [...target.manifestVersions] };
  }

  listTargets(): TargetCapabilities[] {
    return [...this.#targets.values()].map((target) => ({
      ...target,
      manifestVersions: [...target.manifestVersions]
    }));
  }
}

export type OpenExtTargetConfig = {
  manifest: 3;
  experimental?: boolean;
};

export type OpenExtPermissions = {
  required: string[];
  optional: string[];
  host: string[];
};

export type OpenExtContentScript = {
  matches: string[];
  js: string[];
  css: string[];
};

export type OpenExtEntrypoints = {
  background?: string;
  popup?: string;
  options?: string;
  contentScripts: OpenExtContentScript[];
};

export type OpenExtSubmissionTargetConfig = {
  listingId?: string;
  addonId?: string;
  productId?: string;
  privacyPolicyUrl?: string;
  supportUrl?: string;
  homepageUrl?: string;
};

export type OpenExtSubmissionConfig = Partial<Record<BrowserTarget, OpenExtSubmissionTargetConfig>>;

export type OpenExtConfig = {
  name: string;
  version: string;
  description?: string;
  framework: ExtensionFramework;
  targets: Partial<Record<BrowserTarget, OpenExtTargetConfig>>;
  permissions: OpenExtPermissions;
  entrypoints: OpenExtEntrypoints;
  submission: OpenExtSubmissionConfig;
};

export type OpenExtProject = {
  rootDir: string;
  configPath: string;
  config: OpenExtConfig;
  enabledTargets: BrowserTarget[];
  warnings: string[];
};

export type CompatibilityFixSuggestion = {
  target: BrowserTarget;
  code: string;
  message: string;
  suggestedChange: string;
  fileHint: string;
};

export type CompatibilityFixReport = {
  target: BrowserTarget;
  suggestions: CompatibilityFixSuggestion[];
  dryRun: true;
};

export class OpenExtConfigError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "OpenExtConfigError";
    this.issues = issues;
  }
}

const builtInTargets: TargetCapabilities[] = [
  {
    name: "chrome",
    displayName: "Chrome",
    manifestVersions: [3],
    supportsManifestV3: true,
    supportsServiceWorkerBackground: true,
    supportsBackgroundScripts: false,
    supportsDeclarativeNetRequest: true,
    supportsSidePanel: true,
    supportsAction: true,
    supportsBrowserSpecificSettings: false,
    supportsExtensionLoadingInTests: true,
    packageFormat: "zip",
    experimental: false
  },
  {
    name: "firefox",
    displayName: "Firefox",
    manifestVersions: [3],
    supportsManifestV3: true,
    supportsServiceWorkerBackground: true,
    supportsBackgroundScripts: false,
    supportsDeclarativeNetRequest: false,
    supportsSidePanel: false,
    supportsAction: true,
    supportsBrowserSpecificSettings: true,
    supportsExtensionLoadingInTests: false,
    packageFormat: "zip",
    experimental: false
  },
  {
    name: "edge",
    displayName: "Edge",
    manifestVersions: [3],
    supportsManifestV3: true,
    supportsServiceWorkerBackground: true,
    supportsBackgroundScripts: false,
    supportsDeclarativeNetRequest: true,
    supportsSidePanel: true,
    supportsAction: true,
    supportsBrowserSpecificSettings: false,
    supportsExtensionLoadingInTests: true,
    packageFormat: "zip",
    experimental: false
  },
  {
    name: "opera",
    displayName: "Opera",
    manifestVersions: [3],
    supportsManifestV3: true,
    supportsServiceWorkerBackground: true,
    supportsBackgroundScripts: false,
    supportsDeclarativeNetRequest: true,
    supportsSidePanel: true,
    supportsAction: true,
    supportsBrowserSpecificSettings: false,
    supportsExtensionLoadingInTests: true,
    packageFormat: "zip",
    experimental: false
  },
  {
    name: "safari",
    displayName: "Safari",
    manifestVersions: [3],
    supportsManifestV3: true,
    supportsServiceWorkerBackground: true,
    supportsBackgroundScripts: false,
    supportsDeclarativeNetRequest: false,
    supportsSidePanel: false,
    supportsAction: true,
    supportsBrowserSpecificSettings: false,
    supportsExtensionLoadingInTests: false,
    packageFormat: "directory",
    experimental: true
  }
];

const defaultTargetRegistry = new TargetRegistry(builtInTargets);

export function registerTarget(target: TargetCapabilities): TargetCapabilities {
  return defaultTargetRegistry.registerTarget(target);
}

export function getTarget(name: string): TargetCapabilities {
  return defaultTargetRegistry.getTarget(name);
}

export function listTargets(): TargetCapabilities[] {
  return defaultTargetRegistry.listTargets();
}

export function suggestCompatibilityFixes(project: OpenExtProject, target: BrowserTarget): CompatibilityFixReport {
  const capabilities = getTarget(target);
  const suggestions: CompatibilityFixSuggestion[] = [];

  if (!project.enabledTargets.includes(target)) {
    suggestions.push({
      target,
      code: "target.disabled",
      message: `${target} is not enabled in openext.config.`,
      suggestedChange: `Add ${target}: {} to the targets object.`,
      fileHint: project.configPath
    });
  }

  if (!capabilities.supportsDeclarativeNetRequest && project.config.permissions.required.includes("declarativeNetRequest")) {
    suggestions.push({
      target,
      code: "permission.dnr.unsupported",
      message: `${capabilities.displayName} does not support declarativeNetRequest in the current target profile.`,
      suggestedChange: "Move DNR-specific behavior behind a Chromium-targeted code path or remove the permission for this target.",
      fileHint: project.configPath
    });
  }

  if (!capabilities.supportsSidePanel && project.config.permissions.required.includes("sidePanel")) {
    suggestions.push({
      target,
      code: "permission.sidePanel.unsupported",
      message: `${capabilities.displayName} does not support the sidePanel API.`,
      suggestedChange: "Use popup/options UI for this target or gate sidePanel usage by browser target.",
      fileHint: project.configPath
    });
  }

  for (const host of project.config.permissions.host) {
    if (host === "<all_urls>" || host === "*://*/*" || host.startsWith("*://*.") || host.endsWith("/*")) {
      suggestions.push({
        target,
        code: "host.broad",
        message: `Broad host permission ${host} may create store review friction.`,
        suggestedChange: "Replace broad host access with exact HTTPS origins or optional host permissions.",
        fileHint: project.configPath
      });
    }
  }

  if (target === "firefox" && project.config.entrypoints.background?.endsWith(".ts")) {
    suggestions.push({
      target,
      code: "background.source",
      message: "Firefox package output should reference built JavaScript, not TypeScript source, after build.",
      suggestedChange: "Run openext build firefox and inspect dist/firefox/manifest.json before store submission.",
      fileHint: "dist/firefox/manifest.json"
    });
  }

  return {
    target,
    suggestions,
    dryRun: true
  };
}

const stringListSchema = z.array(z.string().min(1)).default([]);

const permissionsSchema = z
  .object({
    required: stringListSchema,
    optional: stringListSchema,
    host: stringListSchema
  })
  .strict()
  .default({
    required: [],
    optional: [],
    host: []
  });

const contentScriptSchema = z
  .object({
    matches: z.array(z.string().min(1)).min(1, "content script matches cannot be empty"),
    js: z.array(z.string().min(1)).min(1, "content script js cannot be empty"),
    css: stringListSchema
  })
  .strict();

const entrypointsSchema = z
  .object({
    background: z.string().min(1).optional(),
    popup: z.string().min(1).optional(),
    options: z.string().min(1).optional(),
    contentScripts: z.array(contentScriptSchema).default([])
  })
  .strict()
  .default({
    contentScripts: []
  });

const targetConfigSchema = z
  .object({
    manifest: z.literal(3).default(3),
    experimental: z.boolean().optional()
  })
  .strict();

const targetsSchema = z
  .object({
    chrome: targetConfigSchema.optional(),
    firefox: targetConfigSchema.optional(),
    edge: targetConfigSchema.optional(),
    opera: targetConfigSchema.optional(),
    safari: targetConfigSchema.optional()
  })
  .strict()
  .refine((targets) => Object.values(targets).some(Boolean), {
    message: "At least one browser target must be enabled"
  });

const submissionTargetSchema = z
  .object({
    listingId: z.string().min(1).optional(),
    addonId: z.string().min(1).optional(),
    productId: z.string().min(1).optional(),
    privacyPolicyUrl: z.string().url().optional(),
    supportUrl: z.string().url().optional(),
    homepageUrl: z.string().url().optional()
  })
  .strict();

const submissionSchema = z
  .object({
    chrome: submissionTargetSchema.optional(),
    firefox: submissionTargetSchema.optional(),
    edge: submissionTargetSchema.optional(),
    opera: submissionTargetSchema.optional(),
    safari: submissionTargetSchema.optional()
  })
  .strict()
  .default({});

const openExtConfigSchema = z
  .object({
    name: z.string().min(1, "name is required"),
    version: z.string().min(1, "version is required"),
    description: z.string().min(1).optional(),
    framework: z.enum(extensionFrameworks).default("vanilla"),
    targets: targetsSchema,
    permissions: permissionsSchema,
    entrypoints: entrypointsSchema,
    submission: submissionSchema
  })
  .strict();

type RawOpenExtConfig = z.input<typeof openExtConfigSchema>;

export function defineOpenExtConfig(config: RawOpenExtConfig): RawOpenExtConfig {
  return config;
}

export function validateOpenExtConfig(config: unknown): OpenExtConfig {
  const result = openExtConfigSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    });

    throw new OpenExtConfigError(
      `Invalid OpenExtKit config:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
      issues
    );
  }

  return normalizeConfig(result.data);
}

export async function loadOpenExtConfig(cwd: string = process.cwd()): Promise<OpenExtConfig> {
  const configPath = await findConfigPath(cwd);
  const loaded = await importConfigFile(configPath);
  return validateOpenExtConfig(readDefaultExport(loaded, configPath));
}

export async function resolveOpenExtProject(cwd: string = process.cwd()): Promise<OpenExtProject> {
  const rootDir = resolve(cwd);
  const configPath = await findConfigPath(rootDir);
  const config = await loadOpenExtConfig(rootDir);
  const enabledTargets = getEnabledTargets(config);
  const warnings = getConfigWarnings(config);

  return {
    rootDir,
    configPath,
    config,
    enabledTargets,
    warnings
  };
}

export function getEnabledTargets(config: OpenExtConfig): BrowserTarget[] {
  return browserTargets.filter((target) => Boolean(config.targets[target]));
}

export function getConfigWarnings(config: OpenExtConfig): string[] {
  const warnings: string[] = [];

  for (const target of getEnabledTargets(config)) {
    const capabilities = getTarget(target);

    if (capabilities.experimental || config.targets[target]?.experimental) {
      warnings.push(
        `${capabilities.displayName} support is experimental and may require target-specific packaging steps.`
      );
    }
  }

  if (!hasAnyEntrypoint(config.entrypoints)) {
    warnings.push(
      "No extension entrypoints are configured. Add at least one background, popup, options, or content script entrypoint before building."
    );
  }

  return warnings;
}

async function findConfigPath(cwd: string): Promise<string> {
  const rootDir = resolve(cwd);

  for (const fileName of configFileNames) {
    const candidate = resolve(rootDir, fileName);

    if (existsSync(candidate)) {
      await access(candidate);
      return candidate;
    }
  }

  throw new OpenExtConfigError(
    `No OpenExtKit config found in ${rootDir}. Expected one of: ${configFileNames.join(", ")}`
  );
}

async function importConfigFile(configPath: string): Promise<unknown> {
  const url = pathToFileURL(configPath).href;

  if (/\.[cm]?ts$/.test(configPath)) {
    return tsImport(url, import.meta.url);
  }

  return import(url);
}

function readDefaultExport(loaded: unknown, configPath: string): unknown {
  let current = loaded;

  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current === "object" && current !== null && "default" in current) {
      current = (current as { default: unknown }).default;
      continue;
    }

    return current;
  }

  throw new OpenExtConfigError(
    `Config file ${configPath} default export could not be resolved to a config object.`
  );
}

function normalizeConfig(config: z.output<typeof openExtConfigSchema>): OpenExtConfig {
  return {
    name: config.name,
    version: config.version,
    description: config.description,
    framework: config.framework,
    targets: normalizeTargets(config.targets),
    permissions: normalizePermissions(config.permissions),
    entrypoints: normalizeEntrypoints(config.entrypoints),
    submission: normalizeSubmission(config.submission)
  };
}

function normalizeTargets(
  targets: z.output<typeof targetsSchema>
): Partial<Record<BrowserTarget, OpenExtTargetConfig>> {
  const normalizedTargets: Partial<Record<BrowserTarget, OpenExtTargetConfig>> = {};

  for (const target of browserTargets) {
    const targetConfig = targets[target];

    if (!targetConfig) {
      continue;
    }

    normalizedTargets[target] = {
      manifest: targetConfig.manifest,
      experimental: getTarget(target).experimental ? true : targetConfig.experimental
    };
  }

  return normalizedTargets;
}

function normalizePermissions(permissions: z.output<typeof permissionsSchema>): OpenExtPermissions {
  return {
    required: uniqueSorted(permissions.required),
    optional: uniqueSorted(permissions.optional),
    host: uniqueSorted(permissions.host)
  };
}

function normalizeEntrypoints(entrypoints: z.output<typeof entrypointsSchema>): OpenExtEntrypoints {
  return {
    background: normalizeConfigPath(entrypoints.background),
    popup: normalizeConfigPath(entrypoints.popup),
    options: normalizeConfigPath(entrypoints.options),
    contentScripts: entrypoints.contentScripts.map((script) => ({
      matches: [...script.matches],
      js: script.js.map(normalizeConfigPathValue),
      css: script.css.map(normalizeConfigPathValue)
    }))
  };
}

function normalizeSubmission(submission: z.output<typeof submissionSchema>): OpenExtSubmissionConfig {
  const normalized: OpenExtSubmissionConfig = {};
  for (const target of browserTargets) {
    if (submission[target]) {
      normalized[target] = { ...submission[target] };
    }
  }
  return normalized;
}

function normalizeConfigPath(value: string | undefined): string | undefined {
  return value ? normalizeConfigPathValue(value) : undefined;
}

function normalizeConfigPathValue(value: string): string {
  return isAbsolute(value) ? normalize(value) : normalize(value).replaceAll("\\", "/");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function hasAnyEntrypoint(entrypoints: OpenExtEntrypoints): boolean {
  return Boolean(
    entrypoints.background ||
      entrypoints.popup ||
      entrypoints.options ||
      entrypoints.contentScripts.length > 0
  );
}
