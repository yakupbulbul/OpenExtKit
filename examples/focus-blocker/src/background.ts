chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    focusBlockerHosts: ["example.com"]
  });
});
