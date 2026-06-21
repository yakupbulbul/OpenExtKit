const hostsInput = document.querySelector<HTMLTextAreaElement>("#hosts");
const saveButton = document.querySelector<HTMLButtonElement>("#save");
const status = document.querySelector("#status");

chrome.storage.local.get(["focusBlockerHosts"], (settings: { focusBlockerHosts?: string[] }) => {
  if (hostsInput) {
    hostsInput.value = (settings.focusBlockerHosts ?? ["example.com"]).join("\n");
  }
});

saveButton?.addEventListener("click", () => {
  const hosts = hostsInput?.value
    .split(/\s+/)
    .map((host) => host.trim())
    .filter(Boolean) ?? [];

  chrome.storage.local.set({ focusBlockerHosts: hosts }, () => {
    if (status) {
      status.textContent = "Saved locally.";
    }
  });
});
