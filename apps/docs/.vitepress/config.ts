import { defineConfig } from "vitepress";

export default defineConfig({
  title: "OpenExtKit",
  description: "AI-native, cross-browser extension development toolkit.",
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    logo: "/logo.svg",
    nav: [
      { text: "Guide", link: "/introduction" },
      { text: "MCP", link: "/mcp-integration" },
      { text: "Security", link: "/security-model" },
      { text: "Roadmap", link: "/roadmap" }
    ],
    sidebar: [
      {
        text: "Start",
        items: [
          { text: "Introduction", link: "/introduction" },
          { text: "Quick Start", link: "/quick-start" },
          { text: "Installation", link: "/installation" },
          { text: "First Extension", link: "/creating-your-first-extension" }
        ]
      },
      {
        text: "Core Workflow",
        items: [
          { text: "Project Config", link: "/project-config" },
          { text: "Browser Targets", link: "/browser-targets" },
          { text: "Manifest Generation", link: "/manifest-generation" },
          { text: "Permissions Audit", link: "/permissions-audit" },
          { text: "Browser Compatibility", link: "/browser-compatibility" },
          { text: "Testing Extensions", link: "/testing-extensions" },
          { text: "Packaging Extensions", link: "/packaging-extensions" },
          { text: "Sharing and Publishing", link: "/sharing-and-publishing-extensions" }
        ]
      },
      {
        text: "AI Tools",
        items: [
          { text: "MCP Integration", link: "/mcp-integration" },
          { text: "Using with Codex", link: "/using-with-codex" },
          { text: "Using with Claude Code", link: "/using-with-claude-code" },
          { text: "Using with Cursor", link: "/using-with-cursor" },
          { text: "Using with Windsurf", link: "/using-with-windsurf" }
        ]
      },
      {
        text: "Project",
        items: [
          { text: "Security Model", link: "/security-model" },
          { text: "Contributing", link: "/contributing" },
          { text: "Roadmap", link: "/roadmap" }
        ]
      }
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/yakupbulbul/OpenExtKit" }],
    search: {
      provider: "local"
    }
  }
});
