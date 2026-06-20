import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const templateNames = [
  "vanilla",
  "react-popup",
  "focus-blocker",
  "content-script",
  "new-tab"
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
};

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
      content: backgroundFile(options.projectName)
    });
  }

  if (flags.contentScript) {
    files.push({
      path: "src/content.ts",
      content: flags.focusBlocker ? focusBlockerContentFile() : contentScriptFile()
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
        content: flags.popup === "react" ? reactPopupFile() : vanillaPopupFile()
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
        content: newTabFile()
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
    edge: {}
  },
  permissions: {
    required: ["storage"],
    host: ${flags.contentScript ? `["<all_urls>"]` : "[]"}
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

function backgroundFile(projectName: string): string {
  return `chrome.runtime.onInstalled.addListener(() => {
  console.log("${toTitle(projectName)} installed");
});
`;
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

function vanillaPopupFile(): string {
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

function newTabFile(): string {
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
