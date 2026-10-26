/* Imgur Unblocker — background service worker.
   Copyright (c) 2026 holstenpils (Discord). All rights reserved. */

const RULESET_ID = "imgur_proxy";
const STORAGE_KEY = "imgurUnblockerEnabled";

async function setRulesetEnabled(enabled) {
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets(
      enabled
        ? { enableRulesetIds: [RULESET_ID] }
        : { disableRulesetIds: [RULESET_ID] }
    );
  } catch (error) {
    console.warn("Imgur Unblocker: could not update the proxy ruleset.", error);
  }
}

async function syncFromStorage() {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: true });
  await setRulesetEnabled(stored[STORAGE_KEY] !== false);
}

chrome.runtime.onInstalled.addListener(syncFromStorage);
chrome.runtime.onStartup.addListener(syncFromStorage);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) return;
  setRulesetEnabled(changes[STORAGE_KEY].newValue !== false);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== "IU_COUNT" || !sender.tab) return;

  const count = Number(message.count) || 0;
  const enabled = message.enabled !== false;
  const text = enabled && count > 0 ? (count > 99 ? "99+" : String(count)) : "";

  chrome.action.setBadgeText({ tabId: sender.tab.id, text }).catch(() => {});
  chrome.action
    .setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#1bb76e" })
    .catch(() => {});
});
