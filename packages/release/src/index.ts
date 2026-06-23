import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { getTarget, type BrowserTarget, type OpenExtProject } from "@openextkit/core";
import { createManifestReport, generateManifest, inspectPermissions } from "@openextkit/manifest";

export type PublishCheckStatus = "passed" | "warning" | "failed";

export type PublishCheck = {
  name: string;
  status: PublishCheckStatus;
  message: string;
  target?: BrowserTarget;
};

export type StoreReadinessCategory =
  | "metadata"
  | "assets"
  | "permissionsPrivacy"
  | "package"
  | "tests"
  | "visual";

export type StoreReadinessCategoryScore = {
  category: StoreReadinessCategory;
  score: number;
  maxScore: number;
  status: PublishCheckStatus;
  checks: PublishCheck[];
};

export type StoreReadinessTargetScore = {
  target: BrowserTarget;
  score: number;
  maxScore: number;
  percentage: number;
  status: PublishCheckStatus;
  categories: StoreReadinessCategoryScore[];
};

export type StoreReadinessScore = {
  score: number;
  maxScore: number;
  percentage: number;
  status: PublishCheckStatus;
  targets: StoreReadinessTargetScore[];
};

export type PublishCheckResult = {
  status: PublishCheckStatus;
  checks: PublishCheck[];
  readiness: StoreReadinessScore;
};

export type StoreMetadataResult = {
  storeDir: string;
  files: string[];
};

export type SubmitAssetTarget = {
  target: BrowserTarget;
  directory: string;
  files: string[];
  warnings: string[];
};

export type SubmitAssetsResult = {
  submitDir: string;
  targets: SubmitAssetTarget[];
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
  submitAssets?: SubmitAssetsResult;
  files: {
    json: string;
    markdown: string;
  };
};

export type ExtensionReviewTarget = {
  target: BrowserTarget;
  status: PublishCheckStatus;
  risks: string[];
  recommendedFixes: string[];
  reports: Record<string, string>;
};

export type ExtensionReviewReport = {
  project: {
    name: string;
    version: string;
  };
  generatedAt: string;
  status: PublishCheckStatus;
  summary: string;
  topRisks: string[];
  recommendedNextFixes: string[];
  targets: ExtensionReviewTarget[];
  files: {
    json: string;
  };
};

export type PublishWizardItem = {
  target: BrowserTarget;
  category: string;
  status: PublishCheckStatus;
  action: string;
};

export type PublishWizardReport = {
  project: {
    name: string;
    version: string;
  };
  generatedAt: string;
  status: PublishCheckStatus;
  items: PublishWizardItem[];
  files: {
    json: string;
  };
};

export async function runPublishCheck(project: OpenExtProject): Promise<PublishCheckResult> {
  const checks: PublishCheck[] = [];
  const targetReadiness: StoreReadinessTargetScore[] = [];

  checks.push(check(Boolean(project.config.version), "version.present", "Project version is present."));
  checks.push(check(Boolean(project.config.description), "description.present", "Project description is present.", "Add description to openext.config before store submission."));
  checks.push(await checkRootFile(project, "README.md", "readme.exists", "README exists."));
  checks.push(await checkRootFile(project, "LICENSE", "license.exists", "License file exists."));
  checks.push(await checkAnyRootFile(project, ["PRIVACY.md", "PRIVACY_POLICY.md", "privacy-policy.md"], "privacy.policy", "Privacy policy file exists.", "Add a privacy policy file before store submission.", "warning"));

  for (const target of project.enabledTargets) {
    const manifest = generateManifest(project, target);
    const permissions = inspectPermissions(project, target);
    const capabilities = getTarget(target);
    const targetChecks: PublishCheck[] = [];

    targetChecks.push(check(Boolean(project.config.description), "description.present", "Project description is present.", "Add description to openext.config before store submission.", undefined, "warning"));
    targetChecks.push(await checkStoreMetadata(project, target));
    targetChecks.push(checkSubmissionConfig(project, target));
    targetChecks.push(check(Boolean(manifest.version), "manifest.version", "Manifest version is present.", "Manifest version is missing.", target));
    targetChecks.push(check(Boolean(manifest.icons), "manifest.icons", "Manifest icons are configured.", "Icons are not configured; stores usually require icon assets.", target, "warning"));
    targetChecks.push(await checkVisualScreenshots(project, target));
    targetChecks.push(await checkAnyRootFile(project, ["PRIVACY.md", "PRIVACY_POLICY.md", "privacy-policy.md"], "privacy.policy", "Privacy policy file exists.", "Add a privacy policy file before store submission.", "warning", target));
    targetChecks.push(permissionRiskCheck(permissions, target));
    targetChecks.push(await checkPackage(project, target));
    targetChecks.push(await checkReport(project, "manifest-report.json", "report.manifest", target));
    targetChecks.push(await checkReport(project, "permissions-report.json", "report.permissions", target));
    targetChecks.push(await checkReport(project, "test-report.json", "report.tests", target, "warning"));
    targetChecks.push(await checkVisualReport(project, target));

    checks.push(...targetChecks);

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

    targetReadiness.push(scoreTargetReadiness(target, targetChecks));
  }

  const readiness = scoreStoreReadiness(targetReadiness);

  return {
    status: summarizeStatus(checks),
    checks,
    readiness
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

    files.push(await writeText(join(targetDir, "short-description.md"), shortDescriptionMetadata(project, capabilities.displayName)));
    files.push(await writeText(join(targetDir, "full-description.md"), fullDescriptionMetadata(project, capabilities.displayName)));
    files.push(await writeText(join(targetDir, "permissions-explanation.md"), permissionsMetadata(project, target)));
    files.push(await writeText(join(targetDir, "privacy-answers.md"), privacyAnswersMetadata(project, target)));
    files.push(await writeText(join(targetDir, "changelog.md"), changelogMetadata(project)));
    files.push(await writeText(join(targetDir, "screenshot-checklist.md"), screenshotChecklistMetadata(project, target)));
  }

  return {
    storeDir,
    files
  };
}

export async function generateSubmitAssets(project: OpenExtProject, target: BrowserTarget | "all" = "all"): Promise<SubmitAssetsResult> {
  await generateStoreMetadata(project);
  const publishCheck = await runPublishCheck(project);
  const targets = target === "all" ? project.enabledTargets : [target];
  const submitDir = join(project.rootDir, "dist", "submit");
  const results: SubmitAssetTarget[] = [];

  for (const browserTarget of targets) {
    const directory = join(submitDir, browserTarget);
    const files: string[] = [];
    const warnings: string[] = [];
    await mkdir(directory, { recursive: true });

    const packagePath = getPackagePath(project, browserTarget);
    if (await exists(packagePath)) {
      const copiedPackage = join(directory, basename(packagePath));
      await copyFile(packagePath, copiedPackage);
      files.push(copiedPackage);
    } else {
      warnings.push(`Package output is missing for ${browserTarget}. Run openext package ${browserTarget}.`);
    }

    const storeTargetDir = join(project.rootDir, "dist", "store", browserTarget);
    if (await exists(storeTargetDir, "directory")) {
      for (const entry of await readdir(storeTargetDir)) {
        const source = join(storeTargetDir, entry);
        const destination = join(directory, entry);
        if ((await stat(source)).isFile()) {
          await copyFile(source, destination);
          files.push(destination);
        }
      }
    } else {
      warnings.push(`Store metadata is missing for ${browserTarget}. Run openext store-assets.`);
    }

    const readiness = publishCheck.readiness.targets.find((entry) => entry.target === browserTarget);
    const submissionConfig = project.config.submission[browserTarget] ?? {};
    const configPath = await writeJson(join(directory, "submission-config.json"), {
      target: browserTarget,
      listing: submissionConfig,
      readiness
    });
    const checklistPath = await writeText(join(directory, "submission-checklist.md"), submissionChecklist(project, browserTarget, warnings, readiness?.percentage ?? 0));
    files.push(configPath, checklistPath);
    results.push({ target: browserTarget, directory, files, warnings });
  }

  const result = { submitDir, targets: results };
  await writeJson(join(submitDir, "submission-config.json"), result);
  return result;
}

export async function createReleaseReport(project: OpenExtProject): Promise<ReleaseReport> {
  const storeMetadata = await generateStoreMetadata(project);
  const submitAssets = await generateSubmitAssets(project);
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
    submitAssets,
    files: {
      json: join(reportsDir, "release-report.json"),
      markdown: join(reportsDir, "release-report.md")
    }
  };

  await writeJson(report.files.json, report);
  await writeText(report.files.markdown, releaseReportMarkdown(report));
  return report;
}

export async function createExtensionReview(project: OpenExtProject, target: BrowserTarget | "all" = "all"): Promise<ExtensionReviewReport> {
  const targets = target === "all" ? project.enabledTargets : [target];
  const publishCheck = await runPublishCheck(project);
  const visualReport = await readJson(join(project.rootDir, "dist", "reports", "visual-test-report.json"));
  const regressionReport = await readJson(join(project.rootDir, "dist", "reports", "visual-regression-report.json"));
  const testReport = await readJson(join(project.rootDir, "dist", "reports", "test-report.json"));
  const reviewTargets: ExtensionReviewTarget[] = [];

  for (const browserTarget of targets) {
    const permissions = inspectPermissions(project, browserTarget);
    const readiness = publishCheck.readiness.targets.find((entry) => entry.target === browserTarget);
    const targetChecks = publishCheck.checks.filter((check) => !check.target || check.target === browserTarget);
    const visualTarget = visualReport?.targets?.find((entry: { target: BrowserTarget }) => entry.target === browserTarget);
    const testTarget = testReport?.targets?.find((entry: { target: BrowserTarget }) => entry.target === browserTarget);
    const regressionFailures = regressionReport?.comparisons?.filter((entry: { target: BrowserTarget; status: PublishCheckStatus }) => entry.target === browserTarget && entry.status === "failed") ?? [];
    const risks = [
      ...targetChecks.filter((check) => check.status !== "passed").map((check) => `${check.name}: ${check.message}`),
      ...permissions.findings.map((finding) => `${finding.code}: ${finding.message}`),
      ...(visualTarget?.errors ?? []).map((message: string) => `visual: ${message}`),
      ...(testTarget?.errors ?? []).map((message: string) => `test: ${message}`),
      ...regressionFailures.map((entry: { surface: string; message: string }) => `visual regression ${entry.surface}: ${entry.message}`)
    ];

    reviewTargets.push({
      target: browserTarget,
      status: summarizeStatus(targetChecks),
      risks,
      recommendedFixes: recommendFixes(risks, readiness?.percentage ?? 0),
      reports: existingReportLinks(project, browserTarget)
    });
  }

  const topRisks = reviewTargets.flatMap((entry) => entry.risks).slice(0, 10);
  const recommendedNextFixes = [...new Set(reviewTargets.flatMap((entry) => entry.recommendedFixes))].slice(0, 10);
  const status = summarizeStatus(reviewTargets.map((entry) => ({
    name: entry.target,
    status: entry.status,
    message: entry.risks.join("; ")
  })));
  const report: ExtensionReviewReport = {
    project: {
      name: project.config.name,
      version: project.config.version
    },
    generatedAt: new Date().toISOString(),
    status,
    summary: topRisks.length === 0 ? "No major review risks found." : `${topRisks.length} review risks found across ${reviewTargets.length} target(s).`,
    topRisks,
    recommendedNextFixes,
    targets: reviewTargets,
    files: {
      json: join(project.rootDir, "dist", "reports", "review-report.json")
    }
  };

  await writeJson(report.files.json, report);
  return report;
}

export async function createPublishWizardReport(project: OpenExtProject, target: BrowserTarget | "all" = "all"): Promise<PublishWizardReport> {
  const targets = target === "all" ? project.enabledTargets : [target];
  const publishCheck = await runPublishCheck(project);
  const items: PublishWizardItem[] = [];

  for (const browserTarget of targets) {
    const readiness = publishCheck.readiness.targets.find((entry) => entry.target === browserTarget);
    const checks = publishCheck.checks.filter((check) => check.target === browserTarget || !check.target);
    for (const check of checks.filter((entry) => entry.status !== "passed")) {
      items.push({
        target: browserTarget,
        category: wizardCategory(check.name),
        status: check.status,
        action: wizardAction(check.name, check.message)
      });
    }

    if ((readiness?.percentage ?? 0) < 100) {
      items.push({
        target: browserTarget,
        category: "readiness",
        status: readiness?.status ?? "warning",
        action: `Improve ${browserTarget} store readiness from ${readiness?.percentage ?? 0}% to 100%.`
      });
    }
  }

  const report: PublishWizardReport = {
    project: {
      name: project.config.name,
      version: project.config.version
    },
    generatedAt: new Date().toISOString(),
    status: summarizeStatus(items.map((item) => ({ name: item.category, status: item.status, message: item.action }))),
    items,
    files: {
      json: join(project.rootDir, "dist", "reports", "publish-wizard-report.json")
    }
  };

  await writeJson(report.files.json, report);
  return report;
}

async function checkPackage(project: OpenExtProject, target: BrowserTarget): Promise<PublishCheck> {
  const path = getPackagePath(project, target);
  return check(await exists(path), "package.exists", `Package output exists for ${target}.`, `Package output is missing for ${target}. Run openext package ${target}.`, target);
}

function getPackagePath(project: OpenExtProject, target: BrowserTarget): string {
  const capabilities = getTarget(target);
  return capabilities.packageFormat === "zip"
    ? join(project.rootDir, "dist", "packages", `${slugify(project.config.name)}-${target}.zip`)
    : join(project.rootDir, "dist", target, "README-SAFARI.md");
}

async function checkReport(project: OpenExtProject, fileName: string, name: string, target: BrowserTarget, missingStatus: PublishCheckStatus = "failed"): Promise<PublishCheck> {
  const path = join(project.rootDir, "dist", "reports", fileName);
  return check(await exists(path), name, `${fileName} exists.`, `${fileName} is missing.`, target, missingStatus);
}

async function checkVisualReport(project: OpenExtProject, target: BrowserTarget): Promise<PublishCheck> {
  const path = join(project.rootDir, "dist", "reports", "visual-test-report.json");
  return check(await exists(path), "visual.report", `Visual test report exists for ${target}.`, "visual-test-report.json is missing.", target, "warning");
}

async function checkVisualScreenshots(project: OpenExtProject, target: BrowserTarget): Promise<PublishCheck> {
  const path = join(project.rootDir, "dist", "reports", "visual", target);
  return check(await exists(path, "directory"), "visual.screenshots", `Visual screenshots exist for ${target}.`, `Visual screenshots are missing for ${target}.`, target, "warning");
}

async function checkStoreMetadata(project: OpenExtProject, target: BrowserTarget): Promise<PublishCheck> {
  const path = join(project.rootDir, "dist", "store", target);
  return check(await exists(path, "directory"), "store.metadata", `Store metadata exists for ${target}.`, `Store metadata is missing for ${target}. Run openext store-assets.`, target, "warning");
}

function checkSubmissionConfig(project: OpenExtProject, target: BrowserTarget): PublishCheck {
  const submission = project.config.submission[target];
  if (target === "chrome") {
    return check(Boolean(submission?.listingId), "submission.config", "Chrome listing ID is configured.", "Chrome submission listingId is missing.", target, "warning");
  }
  if (target === "firefox") {
    return check(Boolean(submission?.addonId), "submission.config", "Firefox add-on ID is configured.", "Firefox submission addonId is missing.", target, "warning");
  }
  if (target === "edge" || target === "opera") {
    return check(Boolean(submission?.productId), "submission.config", `${target} product ID is configured.`, `${target} submission productId is missing.`, target, "warning");
  }
  return check(Boolean(submission), "submission.config", "Submission config is present.", "Safari submission config should be reviewed manually.", target, "warning");
}

async function checkRootFile(project: OpenExtProject, fileName: string, name: string, okMessage: string): Promise<PublishCheck> {
  return check(await exists(join(project.rootDir, fileName)), name, okMessage, `${fileName} is missing.`);
}

async function checkAnyRootFile(
  project: OpenExtProject,
  fileNames: string[],
  name: string,
  okMessage: string,
  failMessage: string,
  missingStatus: PublishCheckStatus,
  target?: BrowserTarget
): Promise<PublishCheck> {
  for (const fileName of fileNames) {
    if (await exists(join(project.rootDir, fileName))) {
      return check(true, name, okMessage, failMessage, target, missingStatus);
    }
  }

  return check(false, name, okMessage, failMessage, target, missingStatus);
}

function permissionRiskCheck(permissions: ReturnType<typeof inspectPermissions>, target: BrowserTarget): PublishCheck {
  if (permissions.findings.some((finding) => finding.level === "error")) {
    return {
      name: "permissions.risk",
      status: "failed",
      message: "Permission findings include errors.",
      target
    };
  }

  if (permissions.findings.some((finding) => finding.level === "warning")) {
    return {
      name: "permissions.risk",
      status: "warning",
      message: "Permission findings include warnings that need store copy.",
      target
    };
  }

  return {
    name: "permissions.risk",
    status: "passed",
    message: "Permission risk is low.",
    target
  };
}

function check(condition: boolean, name: string, okMessage: string, failMessage = okMessage, target?: BrowserTarget, missingStatus: PublishCheckStatus = "failed"): PublishCheck {
  return {
    name,
    status: condition ? "passed" : missingStatus,
    message: condition ? okMessage : failMessage,
    target
  };
}

const readinessCategories: Array<{ category: StoreReadinessCategory; checks: string[] }> = [
  { category: "metadata", checks: ["description.present", "store.metadata", "submission.config"] },
  { category: "assets", checks: ["manifest.icons", "visual.screenshots"] },
  { category: "permissionsPrivacy", checks: ["privacy.policy", "permissions.risk"] },
  { category: "package", checks: ["package.exists"] },
  { category: "tests", checks: ["report.tests"] },
  { category: "visual", checks: ["visual.report"] }
];

function scoreTargetReadiness(target: BrowserTarget, checks: PublishCheck[]): StoreReadinessTargetScore {
  const categories = readinessCategories.map(({ category, checks: checkNames }) => {
    const categoryChecks = checks.filter((check) => checkNames.includes(check.name));
    const maxScore = categoryChecks.length * 10;
    const score = categoryChecks.reduce((total, check) => total + scoreCheck(check), 0);

    return {
      category,
      score,
      maxScore,
      status: summarizeStatus(categoryChecks),
      checks: categoryChecks
    };
  });
  const score = categories.reduce((total, category) => total + category.score, 0);
  const maxScore = categories.reduce((total, category) => total + category.maxScore, 0);

  return {
    target,
    score,
    maxScore,
    percentage: percentage(score, maxScore),
    status: summarizeStatus(checks),
    categories
  };
}

function scoreStoreReadiness(targets: StoreReadinessTargetScore[]): StoreReadinessScore {
  const score = targets.reduce((total, target) => total + target.score, 0);
  const maxScore = targets.reduce((total, target) => total + target.maxScore, 0);

  return {
    score,
    maxScore,
    percentage: percentage(score, maxScore),
    status: summarizeStatus(targets.map((target) => ({ name: target.target, status: target.status, message: `${target.percentage}%` }))),
    targets
  };
}

function scoreCheck(check: PublishCheck): number {
  if (check.status === "passed") {
    return 10;
  }

  if (check.status === "warning") {
    return 5;
  }

  return 0;
}

function percentage(score: number, maxScore: number): number {
  if (maxScore === 0) {
    return 100;
  }

  return Math.round((score / maxScore) * 100);
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

async function exists(path: string, kind: "file" | "directory" = "file"): Promise<boolean> {
  try {
    const result = await stat(path);
    return kind === "file" ? result.isFile() : result.isDirectory();
  } catch {
    return false;
  }
}

async function writeJson(path: string, value: unknown): Promise<string> {
  return writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(path: string): Promise<any | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

function recommendFixes(risks: string[], readiness: number): string[] {
  const fixes: string[] = [];
  if (readiness < 100) {
    fixes.push("Raise store readiness by generating missing packages, reports, metadata, screenshots, and privacy files.");
  }
  if (risks.some((risk) => /package\.exists/.test(risk))) {
    fixes.push("Run openext package for the affected target.");
  }
  if (risks.some((risk) => /visual/.test(risk))) {
    fixes.push("Run visual tests and update or compare baselines.");
  }
  if (risks.some((risk) => /permission|host|privacy/.test(risk))) {
    fixes.push("Review permissions, host patterns, and store privacy explanations.");
  }
  if (risks.some((risk) => /test/.test(risk))) {
    fixes.push("Run smoke tests and address failed checks.");
  }
  return fixes.length > 0 ? fixes : ["Keep reports current before publishing."];
}

function existingReportLinks(project: OpenExtProject, target: BrowserTarget): Record<string, string> {
  return {
    manifest: "dist/reports/manifest-report.json",
    permissions: "dist/reports/permissions-report.json",
    tests: "dist/reports/test-report.json",
    visual: "dist/reports/visual-test-report.json",
    regression: "dist/reports/visual-regression-report.json",
    release: "dist/reports/release-report.json",
    package: `dist/packages/${slugify(project.config.name)}-${target}.zip`
  };
}

function wizardCategory(name: string): string {
  if (/description|metadata|store|submission/.test(name)) {
    return "metadata";
  }
  if (/icon|screenshot|visual/.test(name)) {
    return "assets";
  }
  if (/privacy|permission/.test(name)) {
    return "permissions/privacy";
  }
  if (/package/.test(name)) {
    return "package";
  }
  if (/test|report/.test(name)) {
    return "reports";
  }
  return "readiness";
}

function wizardAction(name: string, message: string): string {
  const actions: Record<string, string> = {
    "package.exists": "Run openext package for the target.",
    "visual.screenshots": "Run openext visual for the target and review screenshots.",
    "visual.report": "Run openext visual for the target to generate a visual report.",
    "privacy.policy": "Add a PRIVACY.md or privacy-policy.md file.",
    "store.metadata": "Run openext store-assets.",
    "report.tests": "Run openext test all.",
    "manifest.icons": "Add icon assets to the manifest configuration."
  };
  return actions[name] ?? message;
}

async function writeText(path: string, content: string): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return path;
}

function shortDescriptionMetadata(project: OpenExtProject, displayName: string): string {
  const description = project.config.description ?? `${project.config.name} browser extension for ${displayName}.`;
  return `${description.slice(0, 132)}\n`;
}

function fullDescriptionMetadata(project: OpenExtProject, displayName: string): string {
  return `# ${project.config.name} for ${displayName}\n\n${project.config.description ?? "Add a store-ready extension description before publishing."}\n\n## Key benefits\n\n- Built from one OpenExtKit codebase.\n- Prepared for ${displayName} Manifest V3 distribution.\n- Includes generated permission and release readiness reports.\n`;
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

function privacyAnswersMetadata(project: OpenExtProject, target: BrowserTarget): string {
  const permissions = inspectPermissions(project, target);
  const collectsBroadData = permissions.hostPermissions.some((permission) => permission === "<all_urls>");
  return `# Privacy Answers for ${target}\n\n- Privacy policy: Add or link your published privacy policy before submission.\n- Data collection: Review whether ${project.config.name} collects, transmits, or sells user data.\n- Host access: ${permissions.hostPermissions.join(", ") || "none"}.\n- Broad access review: ${collectsBroadData ? "Broad host access is configured; explain why it is required." : "No broad host access detected."}\n`;
}

function changelogMetadata(project: OpenExtProject): string {
  return `# Changelog\n\n## ${project.config.version}\n\n- Initial OpenExtKit package candidate.\n`;
}

function screenshotChecklistMetadata(project: OpenExtProject, target: BrowserTarget): string {
  const surfaces = [
    project.config.entrypoints.popup ? "Popup" : undefined,
    project.config.entrypoints.options ? "Options page" : undefined,
    project.config.entrypoints.contentScripts.length > 0 ? "Content script in-page UI" : undefined
  ].filter(Boolean);

  return `# Screenshot Checklist for ${target}\n\n- [ ] Store tile/icon screenshot.\n- [ ] Primary extension surface: ${surfaces.join(", ") || "add a popup, options page, or content script surface"}.\n- [ ] Permissions or onboarding screen if applicable.\n- [ ] Visual baseline captured with openext visual ${target} --update.\n`;
}

function submissionChecklist(project: OpenExtProject, target: BrowserTarget, warnings: string[], readiness: number): string {
  const submission = project.config.submission[target] ?? {};
  const warningList = warnings.length > 0 ? warnings.map((warning) => `- [ ] ${warning}`).join("\n") : "- [x] No local submit-asset warnings.";
  return `# ${target} Submission Checklist

Project: ${project.config.name}
Version: ${project.config.version}
Readiness: ${readiness}%

## Listing IDs

- listingId: ${submission.listingId ?? "not configured"}
- addonId: ${submission.addonId ?? "not configured"}
- productId: ${submission.productId ?? "not configured"}
- privacyPolicyUrl: ${submission.privacyPolicyUrl ?? "not configured"}
- supportUrl: ${submission.supportUrl ?? "not configured"}
- homepageUrl: ${submission.homepageUrl ?? "not configured"}

## Before Upload

- [ ] Review the copied package file.
- [ ] Review store metadata markdown files.
- [ ] Confirm permission explanations match the extension behavior.
- [ ] Confirm privacy answers and public URLs are current.

## Local Warnings

${warningList}
`;
}

function safariMetadata(project: OpenExtProject, displayName: string): string {
  return `# ${displayName} Store Notes\n\n${project.config.name} has experimental ${displayName} output. Verify macOS, Xcode, and store-specific requirements manually.\n`;
}

function releaseReportMarkdown(report: ReleaseReport): string {
  const checks = report.publishCheck.checks
    .map((check) => `- ${check.status.toUpperCase()} ${check.target ? `[${check.target}] ` : ""}${check.name}: ${check.message}`)
    .join("\n");
  const readiness = report.publishCheck.readiness.targets
    .map((target) => `- ${target.target}: ${target.percentage}% (${target.score}/${target.maxScore}, ${target.status})`)
    .join("\n");
  const submitAssets = report.submitAssets?.targets
    .map((target) => `- ${target.target}: ${target.directory}${target.warnings.length > 0 ? ` (${target.warnings.length} warning(s))` : ""}`)
    .join("\n") || "No submit assets generated.";

  return `# Release Report\n\nProject: ${report.project.name}\nVersion: ${report.project.version}\nStatus: ${report.publishCheck.status}\nStore readiness: ${report.publishCheck.readiness.percentage}% (${report.publishCheck.readiness.score}/${report.publishCheck.readiness.maxScore})\nGenerated: ${report.generatedAt}\n\n## Store Readiness\n\n${readiness}\n\n## Submit Assets\n\n${submitAssets}\n\n## Checks\n\n${checks}\n`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
