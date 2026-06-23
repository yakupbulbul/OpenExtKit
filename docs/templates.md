# Templates

Create projects with:

```sh
openext init my-extension --template vanilla
```

Available templates:

- `vanilla`: minimal background extension.
- `react-popup`: React popup starter.
- `content-script`: content script starter.
- `focus-blocker`: simple content script blocker.
- `new-tab`: new tab/options page starter.
- `ai-sidebar`: page sidebar starter for AI-assisted workflows.
- `command-palette`: keyboard command palette starter.
- `tab-manager`: popup and background starter using tab APIs.
- `local-productivity-blocker`: local focus blocker starter.
- `new-tab-dashboard`: dashboard-style new tab starter.
- `context-menu-tool`: context menu and content script messaging starter.
- `tab-organizer`: tab organization popup starter.
- `bookmark-manager`: bookmark management starter.
- `web-clipper`: page selection clipping starter.
- `shopping-assistant`: shopping overlay starter.
- `passwordless-auth-helper`: identity helper starter.
- `developer-inspector`: page inspection starter.

Generated projects include an OpenExtKit config, source files, README, and a basic Node test placeholder.

List marketplace metadata with:

```sh
openext templates --json
```

Serve the local preview gallery with:

```sh
openext templates gallery
openext templates gallery --host 127.0.0.1 --port 4218
```

The gallery uses generated SVG previews from template metadata and shows categories, tags, permissions, entrypoints, and init commands.
