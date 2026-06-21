chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    openExtKitExample: "vanilla-extension"
  });
});
