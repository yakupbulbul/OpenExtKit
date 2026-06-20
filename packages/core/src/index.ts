import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { isAbsolute, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import { z } from "zod";

export const openExtKitCoreVersion = "0.0.0";

export const browserTargets = ["chrome", "firefox", "edge", "safari"] as const;
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

export type OpenExtConfig = {
  name: string;
  version: string;
  description?: string;
  framework: ExtensionFramework;
  targets: Partial<Record<BrowserTarget, OpenExtTargetConfig>>;
  permissions: OpenExtPermissions;
  entrypoints: OpenExtEntrypoints;
};

export type OpenExtProject = {
  rootDir: string;
  configPath: string;
  config: OpenExtConfig;
  enabledTargets: BrowserTarget[];
  warnings: string[];
};

export class OpenExtConfigError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "OpenExtConfigError";
    this.issues = issues;
  }
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
    safari: targetConfigSchema.optional()
  })
  .strict()
  .refine((targets) => Object.values(targets).some(Boolean), {
    message: "At least one browser target must be enabled"
  });

const openExtConfigSchema = z
  .object({
    name: z.string().min(1, "name is required"),
    version: z.string().min(1, "version is required"),
    description: z.string().min(1).optional(),
    framework: z.enum(extensionFrameworks).default("vanilla"),
    targets: targetsSchema,
    permissions: permissionsSchema,
    entrypoints: entrypointsSchema
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

  if (config.targets.safari?.experimental) {
    warnings.push(
      "Safari support is experimental and may require macOS and Xcode-specific packaging steps."
    );
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
    entrypoints: normalizeEntrypoints(config.entrypoints)
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
      experimental: target === "safari" ? true : targetConfig.experimental
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
