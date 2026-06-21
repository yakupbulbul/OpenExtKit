import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { getTarget } from "@openextkit/core";
import type { BrowserTarget, OpenExtProject } from "@openextkit/core";
import {
  createManifestReport,
  generateManifest,
  inspectPermissions,
  type ExtensionManifest
} from "@openextkit/manifest";

export type BuildTargetResult = {
  target: BrowserTarget;
  outputDir: string;
  manifestPath: string;
  copiedFiles: string[];
  warnings: string[];
};

export type BuildAllTargetsResult = {
  targets: BuildTargetResult[];
  reportsDir: string;
};

export type PackageTargetResult = BuildTargetResult & {
  packagePath?: string;
};

export type PackageAllTargetsResult = {
  targets: PackageTargetResult[];
  packagesDir: string;
  reportsDir: string;
};

export class OpenExtPackagingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenExtPackagingError";
  }
}

export async function buildTarget(
  project: OpenExtProject,
  target: BrowserTarget
): Promise<BuildTargetResult> {
  assertTargetEnabled(project, target);

  const outputDir = join(project.rootDir, "dist", target);
  const manifest = generateManifest(project, target);
  const copiedFiles = await copyEntrypointFiles(project, outputDir);
  const manifestPath = join(outputDir, "manifest.json");
  const capabilities = getTarget(target);
  const warnings = capabilities.experimental ? safariWarnings(capabilities.displayName) : [];

  await mkdir(outputDir, { recursive: true });
  await writeJson(manifestPath, manifest);

  if (capabilities.packageFormat === "directory") {
    await writeFile(join(outputDir, "README-SAFARI.md"), safariReadme(project.config.name, capabilities.displayName));
  }

  await writeReports(project);

  return {
    target,
    outputDir,
    manifestPath,
    copiedFiles,
    warnings
  };
}

export async function buildAllTargets(project: OpenExtProject): Promise<BuildAllTargetsResult> {
  const targets: BuildTargetResult[] = [];

  for (const target of project.enabledTargets) {
    targets.push(await buildTarget(project, target));
  }

  await writeReports(project);

  return {
    targets,
    reportsDir: reportsDir(project)
  };
}

export async function packageTarget(
  project: OpenExtProject,
  target: BrowserTarget
): Promise<PackageTargetResult> {
  const build = await buildTarget(project, target);

  const capabilities = getTarget(target);

  if (capabilities.packageFormat === "directory") {
    return build;
  }

  const packagesDir = join(project.rootDir, "dist", "packages");
  const packagePath = join(
    packagesDir,
    `${slugify(project.config.name)}-${target}.zip`
  );

  await mkdir(packagesDir, { recursive: true });
  await createZipFromDirectory(build.outputDir, packagePath);

  return {
    ...build,
    packagePath
  };
}

export async function packageAllTargets(project: OpenExtProject): Promise<PackageAllTargetsResult> {
  const targets: PackageTargetResult[] = [];

  for (const target of project.enabledTargets) {
    targets.push(await packageTarget(project, target));
  }

  await writeReports(project);

  return {
    targets,
    packagesDir: join(project.rootDir, "dist", "packages"),
    reportsDir: reportsDir(project)
  };
}

async function copyEntrypointFiles(project: OpenExtProject, outputDir: string): Promise<string[]> {
  const files = collectEntrypointFiles(project);
  const copiedFiles = new Set<string>();

  for (const directory of ["src", "public"]) {
    const directoryPath = resolve(project.rootDir, directory);

    if (await isDirectory(directoryPath)) {
      for (const filePath of await listFiles(directoryPath)) {
        const relativePath = normalizeArchivePath(relative(project.rootDir, filePath));
        const destinationPath = join(outputDir, relativePath);
        await mkdir(dirname(destinationPath), { recursive: true });
        await writeFile(destinationPath, await readFile(filePath));
        copiedFiles.add(destinationPath);
      }
    }
  }

  for (const file of files) {
    const sourcePath = resolve(project.rootDir, file);
    const destinationPath = join(outputDir, normalizeArchivePath(file));

    await assertFileExists(sourcePath, file);
    await mkdir(dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, await readFile(sourcePath));
    copiedFiles.add(destinationPath);
  }

  return [...copiedFiles].sort((a, b) => a.localeCompare(b));
}

function collectEntrypointFiles(project: OpenExtProject): string[] {
  const files = new Set<string>();
  const { entrypoints } = project.config;

  addIfDefined(files, entrypoints.background);
  addIfDefined(files, entrypoints.popup);
  addIfDefined(files, entrypoints.options);

  for (const contentScript of entrypoints.contentScripts) {
    for (const file of contentScript.js) {
      files.add(file);
    }

    for (const file of contentScript.css) {
      files.add(file);
    }
  }

  return [...files];
}

function addIfDefined(files: Set<string>, value: string | undefined): void {
  if (value) {
    files.add(value);
  }
}

async function assertFileExists(path: string, configuredPath: string): Promise<void> {
  try {
    const fileStat = await stat(path);

    if (!fileStat.isFile()) {
      throw new OpenExtPackagingError(`Configured entrypoint is not a file: ${configuredPath}`);
    }
  } catch (error) {
    if (error instanceof OpenExtPackagingError) {
      throw error;
    }

    throw new OpenExtPackagingError(`Configured entrypoint file was not found: ${configuredPath}`);
  }
}

async function writeReports(project: OpenExtProject): Promise<void> {
  const reportDir = reportsDir(project);
  const manifestReport = createManifestReport(project);
  const permissionsReport = Object.fromEntries(
    project.enabledTargets.map((target) => [target, inspectPermissions(project, target)])
  );
  const compatibilityReport = {
    targets: project.enabledTargets.map((target) => ({
      target,
      displayName: getTarget(target).displayName,
      supported: getTarget(target).packageFormat === "zip",
      experimental: getTarget(target).experimental,
      packageFormat: getTarget(target).packageFormat,
      warnings: getTarget(target).experimental ? safariWarnings(getTarget(target).displayName) : []
    }))
  };

  await mkdir(reportDir, { recursive: true });
  await writeJson(join(reportDir, "manifest-report.json"), manifestReport);
  await writeJson(join(reportDir, "permissions-report.json"), permissionsReport);
  await writeJson(join(reportDir, "compatibility-report.json"), compatibilityReport);
}

function reportsDir(project: OpenExtProject): string {
  return join(project.rootDir, "dist", "reports");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function assertTargetEnabled(project: OpenExtProject, target: BrowserTarget): void {
  if (!project.enabledTargets.includes(target)) {
    throw new OpenExtPackagingError(`Target "${target}" is not enabled for this project.`);
  }
}

function safariWarnings(displayName = "Safari"): string[] {
  return [
    `${displayName} output is experimental and may require target-specific conversion or packaging steps.`
  ];
}

function safariReadme(extensionName: string, displayName = "Safari"): string {
  return `# ${displayName} Output

${extensionName} includes experimental ${displayName} output.

${displayName} packaging may require additional target-specific conversion steps. OpenExtKit does not block other browser builds on these requirements.
`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeArchivePath(path: string): string {
  return path.split(sep).join("/");
}

async function createZipFromDirectory(sourceDir: string, zipPath: string): Promise<void> {
  const files = await listFiles(sourceDir);
  const entries: ZipEntry[] = [];

  for (const filePath of files) {
    const archivePath = normalizeArchivePath(relative(sourceDir, filePath));
    entries.push({
      archivePath,
      data: await readFile(filePath)
    });
  }

  await writeFile(zipPath, createStoredZip(entries));
}

type ZipEntry = {
  archivePath: string;
  data: Buffer;
};

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function createStoredZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileName = Buffer.from(entry.archivePath);
    const crc = crc32(entry.data);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, fileName, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, fileName);

    offset += localHeader.length + fileName.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localDirectory = Buffer.concat(localParts);
  const endRecord = Buffer.alloc(22);

  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localDirectory.length, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([localDirectory, centralDirectory, endRecord]);
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
