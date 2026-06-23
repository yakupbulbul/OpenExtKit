import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const templateNames = [
  "vanilla",
  "react-popup",
  "focus-blocker",
  "content-script",
  "new-tab",
  "ai-sidebar",
  "command-palette",
  "tab-manager",
  "local-productivity-blocker",
  "new-tab-dashboard",
  "context-menu-tool"
] as const;

export type TemplateName = (typeof templateNames)[number];

export type TemplateFile = {
  path: string;
  content: string;
};

export type ExtensionTemplate = {
  name: TemplateName;
  description: string;
  files: TemplateFile[];
};

type CreateTemplateOptions = {
  projectName: string;
};

type WriteTemplateOptions = CreateTemplateOptions & {
  template: TemplateName;
  targetDir: string;
};

export class OpenExtTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenExtTemplateError";
  }
}

export function isTemplateName(value: string): value is TemplateName {
  return templateNames.includes(value as TemplateName);
}

export function getTemplate(name: TemplateName, options: CreateTemplateOptions): ExtensionTemplate {
  switch (name) {
    case "vanilla":
      return createTemplate(name, "Minimal background extension.", options, {
        background: true
      });
    case "react-popup":
      return createTemplate(name, "React popup extension starter.", options, {
        background: true,
        popup: "react"
      });
    case "content-script":
      return createTemplate(name, "Content script extension starter.", options, {
        contentScript: true
      });
    case "new-tab":
      return createTemplate(name, "New tab extension starter.", options, {
        newTab: true
      });
    case "focus-blocker":
      return createTemplate(name, "Content script focus blocker starter.", options, {
        background: true,
        contentScript: true,
        focusBlocker: true
      });
    case "ai-sidebar":
      return createTemplate(name, "AI sidebar extension starter.", options, {
        background: true,
        popup: "vanilla",
        contentScript: true,
        feature: "ai-sidebar",
        permissions: ["storage", "activeTab"],
        hostPermissions: ["<all_urls>"]
      });
    case "command-palette":
      return createTemplate(name, "Keyboard command palette extension starter.", options, {
        background: true,
        popup: "vanilla",
        contentScript: true,
        feature: "command-palette",
        permissions: ["storage", "commands"],
        hostPermissions: ["<all_urls>"]
      });
    case "tab-manager":
      return createTemplate(name, "Tab manager extension starter.", options, {
        background: true,
        popup: "vanilla",
        feature: "tab-manager",
        permissions: ["storage", "tabs"]
      });
    case "local-productivity-blocker":
      return createTemplate(name, "Local productivity blocker extension starter.", options, {
        background: true,
        contentScript: true,
        feature: "local-productivity-blocker",
        permissions: ["storage"],
        hostPermissions: ["<all_urls>"]
      });
    case "new-tab-dashboard":
      return createTemplate(name, "New tab dashboard extension starter.", options, {
        background: true,
        newTab: true,
        feature: "new-tab-dashboard",
        permissions: ["storage"]
      });
    case "context-menu-tool":
      return createTemplate(name, "Context menu tool extension starter.", options, {
        background: true,
        contentScript: true,
        feature: "context-menu-tool",
        permissions: ["storage", "contextMenus", "activeTab"],
        hostPermissions: ["<all_urls>"]
      });
  }
}

export async function writeTemplate(options: WriteTemplateOptions): Promise<ExtensionTemplate> {
  if (!isTemplateName(options.template)) {
    throw new OpenExtTemplateError(
      `Unknown template "${options.template}". Expected one of: ${templateNames.join(", ")}.`
    );
  }

  const template = getTemplate(options.template, {
    projectName: options.projectName
  });

  for (const file of template.files) {
    const targetPath = join(options.targetDir, file.path);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.content);
  }

  return template;
}

type TemplateFlags = {
  background?: boolean;
  popup?: "vanilla" | "react";
  contentScript?: boolean;
  newTab?: boolean;
  focusBlocker?: boolean;
  feature?: RichTemplateFeature;
  permissions?: string[];
  hostPermissions?: string[];
};

type RichTemplateFeature =
  | "ai-sidebar"
  | "command-palette"
  | "tab-manager"
  | "local-productivity-blocker"
  | "new-tab-dashboard"
  | "context-menu-tool";

function createTemplate(
  name: TemplateName,
  description: string,
  options: CreateTemplateOptions,
  flags: TemplateFlags
): ExtensionTemplate {
  const files: TemplateFile[] = [
    {
      path: "package.json",
      content: packageJson(options.projectName, flags.popup === "react")
    },
    {
      path: "openext.config.ts",
      content: configFile(options.projectName, flags)
    },
    {
      path: "README.md",
      content: readme(options.projectName, description)
    },
    {
      path: "test/basic.test.mjs",
      content: basicTest()
    }
  ];

  if (flags.background) {
    files.push({
      path: "src/background.ts",
      content: backgroundFile(options.projectName, flags.feature)
    });
  }

  if (flags.contentScript) {
    files.push({
      path: "src/content.ts",
      content: contentFile(flags)
    });
  }

  if (flags.popup) {
    files.push(
      {
        path: "src/popup/index.html",
        content: popupHtml(flags.popup)
      },
      {
        path: flags.popup === "react" ? "src/popup/main.tsx" : "src/popup/main.ts",
        content: flags.popup === "react" ? reactPopupFile() : popupFile(flags.feature)
      }
    );
  }

  if (flags.newTab) {
    files.push(
      {
        path: "src/new-tab/index.html",
        content: newTabHtml()
      },
      {
        path: "src/new-tab/main.ts",
        content: newTabFile(flags.feature)
      }
    );
  }

  return {
    name,
    description,
    files
  };
}

function packageJson(projectName: string, react: boolean): string {
  const packageJsonContent = {
    name: projectName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      build: "openext build all",
      doctor: "openext doctor",
      test: "node --test"
    },
    dependencies: react
      ? {
          "@vitejs/plugin-react": "latest",
          react: "latest",
          "react-dom": "latest"
        }
      : {},
    devDependencies: {
      "@openextkit/cli": "workspace:*",
      "@openextkit/core": "workspace:*"
    }
  };

  return `${JSON.stringify(packageJsonContent, null, 2)}\n`;
}

function configFile(projectName: string, flags: TemplateFlags): string {
  const permissions = flags.permissions ?? ["storage"];
  const hostPermissions = flags.hostPermissions ?? (flags.contentScript ? ["<all_urls>"] : []);
  const entrypoints = [
    flags.background ? `    background: "src/background.ts"` : undefined,
    flags.popup ? `    popup: "src/popup/index.html"` : undefined,
    flags.newTab ? `    options: "src/new-tab/index.html"` : undefined,
    flags.contentScript
      ? `    contentScripts: [
      {
        matches: ["<all_urls>"],
        js: ["src/content.ts"]
      }
    ]`
      : undefined
  ].filter(Boolean);

  return `import { defineOpenExtConfig } from "@openextkit/core";

export default defineOpenExtConfig({
  name: "${toTitle(projectName)}",
  version: "0.1.0",
  framework: "${flags.popup === "react" ? "react" : "vanilla"}",
  targets: {
    chrome: {},
    firefox: {},
    edge: {},
    opera: {}
  },
  permissions: {
    required: ${JSON.stringify(permissions)},
    host: ${JSON.stringify(hostPermissions)}
  },
  entrypoints: {
${entrypoints.join(",\n")}
  }
});
`;
}

function readme(projectName: string, description: string): string {
  return `# ${toTitle(projectName)}

${description}

Generated by OpenExtKit.
`;
}

function basicTest(): string {
  return `import test from "node:test";

test("template placeholder", () => {
  // Add extension tests here.
});
`;
}

function backgroundFile(projectName: string, feature?: RichTemplateFeature): string {
  if (feature === "tab-manager") {
    return `chrome.runtime.onInstalled.addListener(() => {
  console.log("${toTitle(projectName)} tab manager installed");
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    chrome.storage.local.set({ lastUpdatedTab: { tabId, url: tab.url, title: tab.title ?? "" } });
  }
});
`;
  }

  if (feature === "context-menu-tool") {
    return `chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "openext-context-tool",
    title: "Send selection to OpenExtKit",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id || info.menuItemId !== "openext-context-tool") {
    return;
  }

  chrome.tabs.sendMessage(tab.id, {
    type: "OPENEXTKIT_SELECTION",
    text: info.selectionText ?? ""
  });
});
`;
  }

  if (feature === "command-palette") {
    return `chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ openExtPalettePinned: [] });
});

chrome.commands?.onCommand.addListener((command) => {
  if (command === "open-command-palette") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: "OPENEXTKIT_TOGGLE_PALETTE" });
      }
    });
  }
});
`;
  }

  return `chrome.runtime.onInstalled.addListener(() => {
  console.log("${toTitle(projectName)} installed");
});
`;
}

function contentFile(flags: TemplateFlags): string {
  if (flags.focusBlocker) {
    return focusBlockerContentFile();
  }

  if (flags.feature === "ai-sidebar") {
    return aiSidebarContentFile();
  }

  if (flags.feature === "command-palette") {
    return commandPaletteContentFile();
  }

  if (flags.feature === "local-productivity-blocker") {
    return productivityBlockerContentFile();
  }

  if (flags.feature === "context-menu-tool") {
    return contextMenuContentFile();
  }

  return contentScriptFile();
}

function contentScriptFile(): string {
  return `console.log("OpenExtKit content script loaded");
`;
}

function focusBlockerContentFile(): string {
  return `const blockedHosts = new Set(["example.com"]);

if (blockedHosts.has(location.hostname)) {
  document.documentElement.innerHTML = "<body><h1>Focus mode</h1></body>";
}
`;
}

function aiSidebarContentFile(): string {
  return `const sidebar = document.createElement("aside");
sidebar.id = "openext-ai-sidebar";
sidebar.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;width:320px;max-width:calc(100vw - 32px);padding:16px;border:1px solid #d0d7de;background:#fff;color:#24292f;font:14px system-ui;border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,.18)";
sidebar.innerHTML = "<strong>AI Sidebar</strong><p>Select text on the page, then use this panel to prepare a prompt.</p><textarea style='width:100%;min-height:96px'></textarea>";
document.documentElement.append(sidebar);
`;
}

function commandPaletteContentFile(): string {
  return `const palette = document.createElement("div");
palette.id = "openext-command-palette";
palette.hidden = true;
palette.style.cssText = "position:fixed;top:20%;left:50%;z-index:2147483647;transform:translateX(-50%);width:420px;max-width:calc(100vw - 32px);padding:12px;border:1px solid #d0d7de;background:#fff;color:#24292f;font:14px system-ui;border-radius:8px;box-shadow:0 18px 48px rgba(0,0,0,.2)";
palette.innerHTML = "<input placeholder='Run command...' style='box-sizing:border-box;width:100%;padding:10px;border:1px solid #d0d7de;border-radius:6px' />";
document.documentElement.append(palette);

function togglePalette() {
  palette.hidden = !palette.hidden;
  if (!palette.hidden) {
    palette.querySelector("input")?.focus();
  }
}

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    togglePalette();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "OPENEXTKIT_TOGGLE_PALETTE") {
    togglePalette();
  }
});
`;
}

function productivityBlockerContentFile(): string {
  return `const blockedHosts = new Set(["example.com", "news.ycombinator.com"]);

chrome.storage.local.get({ blockedHosts: [...blockedHosts] }, ({ blockedHosts: hosts }) => {
  if (!Array.isArray(hosts) || !hosts.includes(location.hostname)) {
    return;
  }

  document.documentElement.innerHTML = "<body style='font:16px system-ui;margin:48px'><h1>Blocked locally</h1><p>This site is on your local focus list.</p></body>";
});
`;
}

function contextMenuContentFile(): string {
  return `chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "OPENEXTKIT_SELECTION") {
    return;
  }

  const note = document.createElement("div");
  note.textContent = \`Selected text: \${message.text}\`;
  note.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:360px;padding:12px;border:1px solid #d0d7de;background:#fff;color:#24292f;font:14px system-ui;border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,.18)";
  document.documentElement.append(note);
  setTimeout(() => note.remove(), 5000);
});
`;
}

function popupHtml(kind: "vanilla" | "react"): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Popup</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.${kind === "react" ? "tsx" : "ts"}"></script>
  </body>
</html>
`;
}

function popupFile(feature?: RichTemplateFeature): string {
  if (feature === "tab-manager") {
    return `const root = document.querySelector("#root");

async function renderTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const list = document.createElement("ul");
  list.style.cssText = "padding:0;margin:0;list-style:none;font:14px system-ui;min-width:280px";
  for (const tab of tabs.slice(0, 12)) {
    const item = document.createElement("li");
    item.textContent = tab.title ?? tab.url ?? "Untitled tab";
    item.style.cssText = "padding:8px;border-bottom:1px solid #d0d7de";
    list.append(item);
  }
  root?.replaceChildren(list);
}

renderTabs();
`;
  }

  if (feature === "ai-sidebar") {
    return `const root = document.querySelector("#root");
const button = document.createElement("button");
button.textContent = "Summarize selected text";
button.style.cssText = "font:14px system-ui;padding:8px 10px";
button.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "OPENEXTKIT_AI_SIDEBAR_FOCUS" });
  }
});
root?.replaceChildren(button);
`;
  }

  if (feature === "command-palette") {
    return `document.querySelector("#root")?.replaceChildren("Press Cmd/Ctrl+Shift+K on a page to open the command palette.");
`;
  }

  return `document.querySelector("#root")?.replaceChildren("OpenExtKit popup");
`;
}

function reactPopupFile(): string {
  return `import { createRoot } from "react-dom/client";

createRoot(document.querySelector("#root")!).render(<h1>OpenExtKit popup</h1>);
`;
}

function newTabHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>New Tab</title>
  </head>
  <body>
    <main id="root"></main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
`;
}

function newTabFile(feature?: RichTemplateFeature): string {
  if (feature === "new-tab-dashboard") {
    return `const root = document.querySelector("#root");
const now = new Date();
root?.replaceChildren(
  Object.assign(document.createElement("h1"), { textContent: "Today" }),
  Object.assign(document.createElement("p"), { textContent: now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) }),
  Object.assign(document.createElement("textarea"), { placeholder: "Top priority", rows: 4 })
);
`;
  }

  return `document.querySelector("#root")?.replaceChildren("OpenExtKit new tab");
`;
}

function toTitle(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
