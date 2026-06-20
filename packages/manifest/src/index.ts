import type {
  BrowserTarget,
  OpenExtConfig,
  OpenExtContentScript,
  OpenExtProject
} from "@openextkit/core";

export type ExtensionManifest = {
  manifest_version: 3;
  name: string;
  version: string;
  description?: string;
  permissions?: string[];
  optional_permissions?: string[];
  host_permissions?: string[];
  background?: {
    service_worker: string;
    type?: "module";
  };
  action?: {
    default_popup?: string;
  };
  options_ui?: {
    page: string;
    open_in_tab: boolean;
  };
  content_scripts?: ManifestContentScript[];
  icons?: Record<string, string>;
  web_accessible_resources?: Array<{
    resources: string[];
    matches: string[];
  }>;
  browser_specific_settings?: {
    gecko?: Record<string, string>;
  };
};

export type ManifestContentScript = {
  matches: string[];
  js: string[];
  css?: string[];
};

export type PermissionFinding = {
  level: "warning" | "error";
  code: string;
  message: string;
  value?: string;
};

export type PermissionAudit = {
  target: BrowserTarget;
  permissions: string[];
  optionalPermissions: string[];
  hostPermissions: string[];
  findings: PermissionFinding[];
};

export type ManifestValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type TargetManifestReport = {
  target: BrowserTarget;
  manifest: ExtensionManifest;
  validation: ManifestValidationResult;
  permissions: PermissionAudit;
  warnings: string[];
};

export type ManifestReport = {
  targets: TargetManifestReport[];
};

export class OpenExtManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenExtManifestError";
  }
}

export function generateManifest(project: OpenExtProject, target: BrowserTarget): ExtensionManifest {
  assertTargetEnabled(project, target);

  const { config } = project;
  const manifest: ExtensionManifest = {
    manifest_version: 3,
    name: config.name,
    version: config.version
  };

  if (config.description) {
    manifest.description = config.description;
  }

  if (config.permissions.required.length > 0) {
    manifest.permissions = [...config.permissions.required];
  }

  if (config.permissions.optional.length > 0) {
    manifest.optional_permissions = [...config.permissions.optional];
  }

  if (config.permissions.host.length > 0) {
    manifest.host_permissions = [...config.permissions.host];
  }

  if (config.entrypoints.background) {
    manifest.background = {
      service_worker: config.entrypoints.background,
      type: "module"
    };
  }

  if (config.entrypoints.popup) {
    manifest.action = {
      default_popup: config.entrypoints.popup
    };
  }

  if (config.entrypoints.options) {
    manifest.options_ui = {
      page: config.entrypoints.options,
      open_in_tab: true
    };
  }

  if (config.entrypoints.contentScripts.length > 0) {
    manifest.content_scripts = config.entrypoints.contentScripts.map(toManifestContentScript);
  }

  if (target === "firefox") {
    manifest.browser_specific_settings = {
      gecko: {}
    };
  }

  return manifest;
}

export function generateAllManifests(
  project: OpenExtProject
): Partial<Record<BrowserTarget, ExtensionManifest>> {
  return Object.fromEntries(
    project.enabledTargets.map((target) => [target, generateManifest(project, target)])
  );
}

export function validateManifest(
  manifest: ExtensionManifest,
  target: BrowserTarget
): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (manifest.manifest_version !== 3) {
    errors.push("Only Manifest V3 is supported.");
  }

  if (!manifest.name) {
    errors.push("Manifest name is required.");
  }

  if (!manifest.version) {
    errors.push("Manifest version is required.");
  }

  for (const hostPermission of manifest.host_permissions ?? []) {
    if (!isValidHostPattern(hostPermission)) {
      errors.push(`Invalid host permission pattern: ${hostPermission}`);
    }
  }

  if (target === "safari") {
    warnings.push(
      "Safari manifest output is experimental and may require conversion through Xcode tooling."
    );
  }

  if (target === "firefox" && !manifest.browser_specific_settings?.gecko) {
    warnings.push("Firefox extensions may require browser_specific_settings.gecko metadata.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function createManifestReport(project: OpenExtProject): ManifestReport {
  return {
    targets: project.enabledTargets.map((target) => {
      const manifest = generateManifest(project, target);
      const validation = validateManifest(manifest, target);
      const permissions = inspectPermissions(project, target);

      return {
        target,
        manifest,
        validation,
        permissions,
        warnings: [...validation.warnings, ...permissions.findings.map((finding) => finding.message)]
      };
    })
  };
}

export function inspectPermissions(project: OpenExtProject, target: BrowserTarget): PermissionAudit {
  assertTargetEnabled(project, target);

  const { permissions } = project.config;
  const findings: PermissionFinding[] = [];

  for (const permission of permissions.required) {
    if (permission === "tabs") {
      findings.push({
        level: "warning",
        code: "permission.tabs",
        message: "The tabs permission can expose sensitive browsing metadata.",
        value: permission
      });
    }

    if (permission === "scripting") {
      findings.push({
        level: "warning",
        code: "permission.scripting",
        message: "The scripting permission can execute code in pages and should be narrowly scoped.",
        value: permission
      });
    }
  }

  for (const hostPermission of permissions.host) {
    if (!isValidHostPattern(hostPermission)) {
      findings.push({
        level: "error",
        code: "host.invalid",
        message: `Invalid host permission pattern: ${hostPermission}`,
        value: hostPermission
      });
      continue;
    }

    if (isBroadHostPattern(hostPermission)) {
      findings.push({
        level: "warning",
        code: "host.broad",
        message: `Broad host permission requires careful review: ${hostPermission}`,
        value: hostPermission
      });
    }
  }

  return {
    target,
    permissions: [...permissions.required],
    optionalPermissions: [...permissions.optional],
    hostPermissions: [...permissions.host],
    findings
  };
}

function assertTargetEnabled(project: OpenExtProject, target: BrowserTarget): void {
  if (!project.enabledTargets.includes(target)) {
    throw new OpenExtManifestError(`Target "${target}" is not enabled for this project.`);
  }
}

function toManifestContentScript(contentScript: OpenExtContentScript): ManifestContentScript {
  return {
    matches: [...contentScript.matches],
    js: [...contentScript.js],
    ...(contentScript.css.length > 0 ? { css: [...contentScript.css] } : {})
  };
}

function isValidHostPattern(pattern: string): boolean {
  if (pattern === "<all_urls>") {
    return true;
  }

  return /^(https?|\*):\/\/(\*|\*\.[^/*]+|[^/*]+)\/.*$/.test(pattern);
}

function isBroadHostPattern(pattern: string): boolean {
  return (
    pattern === "<all_urls>" ||
    pattern === "*://*/*" ||
    pattern.startsWith("*://*.") ||
    pattern.endsWith("/*")
  );
}
