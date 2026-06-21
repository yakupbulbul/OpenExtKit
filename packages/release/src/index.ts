import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getTarget, type BrowserTarget, type OpenExtProject } from "@openextkit/core";
import { createManifestReport, generateManifest, inspectPermissions } from "@openextkit/manifest";

export type PublishCheckStatus = "passed" | "warning" | "failed";

export type PublishCheck = {
  name: string;
  status: PublishCheckStatus;
  message: string;
  target?: BrowserTarget;
};

export type PublishCheckResult = {
  status: PublishCheckStatus;
  checks: PublishCheck[];
};

export type StoreMetadataResult = {
  storeDir: string;
  files: string[];
};

export type ReleaseReport = {
  project: {
    name: string;
    version: string;
    description?: string;
  };
  generatedAt: string;
  publishCheck: PublishCheckResult;
  manifestReport: ReturnType<typeof createManifestReport>;
  storeMetadata: StoreMetadataResult;
  files: {
    json: string;
    markdown: string;
  };
};

export async function runPublishCheck(project: OpenExtProject): Promise<PublishCheckResult> {
  const checks: PublishCheck[] = [];

  checks.push(check(Boolean(project.config.version), "version.present", "Project version is present."));
  checks.push(check(Boolean(project.config.description), "description.present", "Project description is present.", "Add description to openext.config before store submission."));
  checks.push(await checkRootFile(project, "README.md", "readme.exists", "README exists."));
  checks.push(await checkRootFile(project, "LICENSE", "license.exists", "License file exists."));

  for (const target of project.enabledTargets) {
    const manifest = generateManifest(project, target);
    const permissions = inspectPermissions(project, target);
    const capabilities = getTarget(target);

    checks.push(check(Boolean(manifest.version), "manifest.version", "Manifest version is present.", "Manifest version is missing.", target));
    checks.push(check(Boolean(manifest.icons), "manifest.icons", "Manifest icons are configured.", "Icons are not configured; stores usually require icon assets.", target, "warning"));
    checks.push(await checkPackage(project, target));
    checks.push(await checkReport(project, "manifest-report.json", "report.manifest", target));
    checks.push(await checkReport(project, "permissions-report.json", "report.permissions", target));
    checks.push(await checkReport(project, "test-report.json", "report.tests", target, "warning"));

    if (permissions.permissions.length > 0 || permissions.hostPermissions.length > 0) {
      checks.push(check(true, "permissions.explained", "Permissions are available for store metadata.", undefined, target));
    }

    if (permissions.findings.some((finding) => finding.code === "host.broad")) {
      checks.push({
        name: "privacy.warning",
        status: "warning",
        message: "Broad host permissions require a clear privacy explanation.",
        target
      });
    }

    if (capabilities.experimental) {
      checks.push({
        name: "target.experimental",
        status: "warning",
        message: `${capabilities.displayName} is experimental; verify store-specific requirements manually.`,
        target
      });
    }
  }

  return {
    status: summarizeStatus(checks),
    checks
  };
}

export async function generateStoreMetadata(project: OpenExtProject): Promise<StoreMetadataResult> {
  const files: string[] = [];
  const storeDir = join(project.rootDir, "dist", "store");

  for (const target of project.enabledTargets) {
    const capabilities = getTarget(target);
    const targetDir = join(storeDir, target);

    if (target === "safari" || capabilities.experimental) {
      files.push(await writeText(join(targetDir, "README-SAFARI.md"), safariMetadata(project, capabilities.displayName)));
      continue;
    }

    files.push(await writeText(join(targetDir, "description.md"), descriptionMetadata(project, capabilities.displayName)));
    files.push(await writeText(join(targetDir, "permissions.md"), permissionsMetadata(project, target)));
    files.push(await writeText(join(targetDir, "changelog.md"), changelogMetadata(project)));
  }

  return {
    storeDir,
    files
  };
}

export async function createReleaseReport(project: OpenExtProject): Promise<ReleaseReport> {
  const storeMetadata = await generateStoreMetadata(project);
  const publishCheck = await runPublishCheck(project);
  const manifestReport = createManifestReport(project);
  const reportsDir = join(project.rootDir, "dist", "reports");
  const report: ReleaseReport = {
    project: {
      name: project.config.name,
      version: project.config.version,
      description: project.config.description
    },
    generatedAt: new Date().toISOString(),
    publishCheck,
    manifestReport,
    storeMetadata,
    files: {
      json: join(reportsDir, "release-report.json"),
      markdown: join(reportsDir, "release-report.md")
    }
  };

  await writeJson(report.files.json, report);
  await writeText(report.files.markdown, releaseReportMarkdown(report));
  return report;
}

async function checkPackage(project: OpenExtProject, target: BrowserTarget): Promise<PublishCheck> {
  const capabilities = getTarget(target);
  const path =
    capabilities.packageFormat === "zip"
      ? join(project.rootDir, "dist", "packages", `${slugify(project.config.name)}-${target}.zip`)
      : join(project.rootDir, "dist", target, "README-SAFARI.md");

  return check(await exists(path), "package.exists", `Package output exists for ${target}.`, `Package output is missing for ${target}. Run openext package ${target}.`, target);
}

async function checkReport(project: OpenExtProject, fileName: string, name: string, target: BrowserTarget, missingStatus: PublishCheckStatus = "failed"): Promise<PublishCheck> {
  const path = join(project.rootDir, "dist", "reports", fileName);
  return check(await exists(path), name, `${fileName} exists.`, `${fileName} is missing.`, target, missingStatus);
}

async function checkRootFile(project: OpenExtProject, fileName: string, name: string, okMessage: string): Promise<PublishCheck> {
  return check(await exists(join(project.rootDir, fileName)), name, okMessage, `${fileName} is missing.`);
}

function check(condition: boolean, name: string, okMessage: string, failMessage = okMessage, target?: BrowserTarget, missingStatus: PublishCheckStatus = "failed"): PublishCheck {
  return {
    name,
    status: condition ? "passed" : missingStatus,
    message: condition ? okMessage : failMessage,
    target
  };
}

function summarizeStatus(checks: PublishCheck[]): PublishCheckStatus {
  if (checks.some((check) => check.status === "failed")) {
    return "failed";
  }

  if (checks.some((check) => check.status === "warning")) {
    return "warning";
  }

  return "passed";
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function writeJson(path: string, value: unknown): Promise<string> {
  return writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(path: string, content: string): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return path;
}

function descriptionMetadata(project: OpenExtProject, displayName: string): string {
  return `# ${project.config.name} for ${displayName}\n\n${project.config.description ?? "Add a store-ready extension description before publishing."}\n`;
}

function permissionsMetadata(project: OpenExtProject, target: BrowserTarget): string {
  const permissions = inspectPermissions(project, target);
  const lines = [
    `# Permissions for ${target}`,
    "",
    `Required permissions: ${permissions.permissions.join(", ") || "none"}`,
    `Optional permissions: ${permissions.optionalPermissions.join(", ") || "none"}`,
    `Host permissions: ${permissions.hostPermissions.join(", ") || "none"}`,
    ""
  ];

  for (const finding of permissions.findings) {
    lines.push(`- ${finding.level.toUpperCase()}: ${finding.message}`);
  }

  return `${lines.join("\n")}\n`;
}

function changelogMetadata(project: OpenExtProject): string {
  return `# Changelog\n\n## ${project.config.version}\n\n- Initial OpenExtKit package candidate.\n`;
}

function safariMetadata(project: OpenExtProject, displayName: string): string {
  return `# ${displayName} Store Notes\n\n${project.config.name} has experimental ${displayName} output. Verify macOS, Xcode, and store-specific requirements manually.\n`;
}

function releaseReportMarkdown(report: ReleaseReport): string {
  const checks = report.publishCheck.checks
    .map((check) => `- ${check.status.toUpperCase()} ${check.target ? `[${check.target}] ` : ""}${check.name}: ${check.message}`)
    .join("\n");

  return `# Release Report\n\nProject: ${report.project.name}\nVersion: ${report.project.version}\nStatus: ${report.publishCheck.status}\nGenerated: ${report.generatedAt}\n\n## Checks\n\n${checks}\n`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
