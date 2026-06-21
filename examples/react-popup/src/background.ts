chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    popupOpened: 0
  });
});
