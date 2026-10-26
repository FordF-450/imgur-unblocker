/* Imgur Unblocker — popup logic.
   Copyright (c) 2026 holstenpils (Discord). All rights reserved. */

const STORAGE_KEY = "imgurUnblockerEnabled";
const RULESET_ID = "imgur_proxy";

const toggle = document.getElementById("enabled");
const statusEl = document.getElementById("status");

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function getState() {
  const tab = await getActiveTab();
  if (!tab || tab.id == null) return null;

  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "IU_GET_STATE" });
  } catch {
    return null;
  }
}

async function setRuleset(enabled) {
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets(
      enabled
        ? { enableRulesetIds: [RULESET_ID] }
        : { disableRulesetIds: [RULESET_ID] }
    );
  } catch (error) {
    console.warn("Imgur Unblocker: ruleset update failed.", error);
  }
}

async function refreshStatus() {
  if (!toggle.checked) {
    statusEl.textContent = "Paused — Imgur images load normally.";
    statusEl.dataset.state = "paused";
    return;
  }

  const state = await getState();
  if (!state) {
    statusEl.textContent = "Open a page with Imgur images to use this.";
    statusEl.dataset.state = "idle";
    return;
  }

  const count = state.count || 0;
  if (count > 0) {
    statusEl.textContent = `${count} Imgur ${
      count === 1 ? "image" : "images"
    } will load through the proxy.`;
    statusEl.dataset.state = "active";
  } else {
    statusEl.textContent = "No Imgur images found on this page.";
    statusEl.dataset.state = "idle";
  }
}

async function init() {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: true });
  toggle.checked = stored[STORAGE_KEY] !== false;
  await refreshStatus();
}

toggle.addEventListener("change", async () => {
  const enabled = toggle.checked;

  await chrome.storage.local.set({ [STORAGE_KEY]: enabled });
  await setRuleset(enabled);

  const tab = await getActiveTab();
  if (tab && tab.id != null) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "IU_SET_ENABLED",
        enabled
      });
    } catch {
      // No content script on this page.
    }
  }

  await refreshStatus();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) return;

  const enabled = changes[STORAGE_KEY].newValue !== false;
  if (toggle.checked !== enabled) {
    toggle.checked = enabled;
    refreshStatus();
  }
});

init();
