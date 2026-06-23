import type {
  BrowserTarget,
  OpenExtConfig,
  OpenExtContentScript,
  OpenExtProject
} from "@openextkit/core";
import { getTarget } from "@openextkit/core";

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
  advisor: PermissionAdvice[];
};

export type PermissionAdvice = {
  permission: string;
  risk: "low" | "medium" | "high";
  reason: string;
  targetSupport: string;
  lowerRiskAlternative?: string;
  storeReviewGuidance: string;
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

  if (getTarget(target).supportsBrowserSpecificSettings) {
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

  const capabilities = getTarget(target);

  if (capabilities.experimental) {
    warnings.push(
      `${capabilities.displayName} manifest output is experimental and may require target-specific tooling.`
    );
  }

  if (capabilities.supportsBrowserSpecificSettings && !manifest.browser_specific_settings?.gecko) {
    warnings.push(`${capabilities.displayName} extensions may require browser_specific_settings.gecko metadata.`);
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
  const advisor: PermissionAdvice[] = [];

  for (const permission of permissions.required) {
    advisor.push(adviceForPermission(permission, target));
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
    advisor.push(adviceForHostPermission(hostPermission, target));
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
    findings,
    advisor
  };
}

function adviceForPermission(permission: string, target: BrowserTarget): PermissionAdvice {
  if (permission === "tabs") {
    return {
      permission,
      risk: "medium",
      reason: "Tabs can expose browsing metadata such as URLs and titles.",
      targetSupport: `${target} supports this permission when declared in the manifest.`,
      lowerRiskAlternative: "Use activeTab when access is only needed after a user gesture.",
      storeReviewGuidance: "Explain why tab metadata is required and where it is used."
    };
  }

  if (permission === "scripting") {
    return {
      permission,
      risk: "high",
      reason: "Scripting can execute code in pages and increases review scrutiny.",
      targetSupport: `${target} supports scripting in Manifest V3 where available.`,
      lowerRiskAlternative: "Prefer static content scripts with narrow match patterns.",
      storeReviewGuidance: "Document the exact scripts injected and the user action that triggers them."
    };
  }

  return {
    permission,
    risk: "low",
    reason: "No elevated OpenExtKit risk rule matched this permission.",
    targetSupport: `${target} manifest generation includes this permission as configured.`,
    storeReviewGuidance: "Keep the store explanation aligned with the feature that uses this permission."
  };
}

function adviceForHostPermission(permission: string, target: BrowserTarget): PermissionAdvice {
  const broad = isBroadHostPattern(permission);
  return {
    permission,
    risk: broad ? "high" : "medium",
    reason: broad ? "Broad host access can read or modify many sites." : "Host access allows the extension to interact with matching pages.",
    targetSupport: `${target} validates this as a host permission pattern when it matches browser syntax.`,
    lowerRiskAlternative: broad ? "Use exact HTTPS origins or optional host permissions where possible." : "Use the narrowest URL pattern that covers the feature.",
    storeReviewGuidance: broad ? "Provide a clear, user-facing reason for broad host access." : "Explain what page data is accessed on the matched hosts."
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
