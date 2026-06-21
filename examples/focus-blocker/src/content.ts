type StoredSettings = {
  focusBlockerHosts?: string[];
};

chrome.storage.local.get(["focusBlockerHosts"], (settings: StoredSettings) => {
  const blockedHosts = new Set(settings.focusBlockerHosts ?? []);

  if (!blockedHosts.has(location.hostname)) {
    return;
  }

  const overlay = document.createElement("main");
  overlay.className = "openextkit-focus-blocker";
  overlay.innerHTML = `
    <h1>Focus mode</h1>
    <p>${location.hostname} is on your local blocklist.</p>
  `;
  document.documentElement.replaceChildren(overlay);
});
