/* Imgur Unblocker — counts Imgur images and unblocks direct post links.
   Copyright (c) 2026 holstenpils (Discord). All rights reserved.
   Do not redistribute or republish without permission. */
(() => {
  "use strict";

  const STORAGE_KEY = "imgurUnblockerEnabled";
  const PROXY_PREFIX = "https://external-content.duckduckgo.com/iu/?u=";
  const ORIGINAL_HREF_ATTR = "data-iu-original-href";

  const STATIC_PATHS = new Set([
    "about",
    "account",
    "advertise",
    "api",
    "apps",
    "arcade",
    "blog",
    "ccpa",
    "community-resources",
    "consent",
    "contact",
    "cookie",
    "cookies",
    "developers",
    "dmca",
    "download",
    "emerald",
    "forgot",
    "gallery",
    "help",
    "jobs",
    "legal",
    "login",
    "logout",
    "meme-generator",
    "messages",
    "notifications",
    "oembed",
    "password",
    "press",
    "privacy",
    "random",
    "register",
    "rules",
    "search",
    "settings",
    "signin",
    "signup",
    "sitemap",
    "support",
    "tos",
    "trending",
    "upload",
    "user",
    "users"
  ]);

  let enabled = true;
  let observer = null;
  let countTimer = 0;
  let lastCount = -1;

  const IMGUR_CDN_RE = /^https?:\/\/(?:[a-z0-9-]+\.)?i\.imgur\.com\//i;
  const IMGUR_DIRECT_RE =
    /^https?:\/\/(?:www\.)?imgur\.com\/[^/?#]+\.(?:jpe?g|png|gif|webp|avif)(?:[?#]|$)/i;
  const IMGUR_IN_SRCSET_RE =
    /https?:\/\/(?:[a-z0-9-]+\.)?i\.imgur\.com\/|https?:\/\/(?:www\.)?imgur\.com\/[^?#\s]+\.(?:jpe?g|png|gif|webp|avif)/i;

  function isImgurImage(url) {
    return typeof url === "string" && (IMGUR_CDN_RE.test(url) || IMGUR_DIRECT_RE.test(url));
  }

  function proxyUrl(url) {
    return PROXY_PREFIX + encodeURIComponent(url);
  }

  function processLink(anchor) {
    if (!enabled || !anchor || anchor.tagName !== "A") return;

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith(PROXY_PREFIX)) return;

    if (anchor.hasAttribute(ORIGINAL_HREF_ATTR)) {
      if (!(anchor.getAttribute("href") || "").startsWith(PROXY_PREFIX)) {
        anchor.removeAttribute(ORIGINAL_HREF_ATTR);
      }
      return;
    }

    let url;
    try {
      url = new URL(href, location.href);
    } catch {
      return;
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    if (
      url.hostname !== "imgur.com" &&
      url.hostname !== "www.imgur.com" &&
      url.hostname !== "m.imgur.com"
    ) {
      return;
    }

    const match = url.pathname.match(/^\/([A-Za-z0-9]{5,10})\/?$/);
    if (!match) return;

    const id = match[1];
    if (STATIC_PATHS.has(id.toLowerCase())) return;

    anchor.setAttribute(ORIGINAL_HREF_ATTR, href);
    anchor.setAttribute("href", proxyUrl(`https://imgur.com/${id}.png`));
  }

  function restoreLink(anchor) {
    if (!anchor || !anchor.hasAttribute(ORIGINAL_HREF_ATTR)) return;
    anchor.setAttribute("href", anchor.getAttribute(ORIGINAL_HREF_ATTR));
    anchor.removeAttribute(ORIGINAL_HREF_ATTR);
  }

  function processLinks(root) {
    if (!root) return;

    if (
      root.nodeType === Node.ELEMENT_NODE &&
      root.matches('a[href*="imgur.com"]')
    ) {
      processLink(root);
    }

    if (root.querySelectorAll) {
      root.querySelectorAll('a[href*="imgur.com"]').forEach(processLink);
    }
  }

  function restoreLinks() {
    document
      .querySelectorAll("a[" + ORIGINAL_HREF_ATTR + "]")
      .forEach(restoreLink);
  }

  function countImages() {
    let count = 0;
    for (const img of document.images) {
      const src = img.getAttribute("src") || "";
      const srcset = img.getAttribute("srcset") || "";
      if (
        isImgurImage(img.currentSrc) ||
        isImgurImage(src) ||
        IMGUR_IN_SRCSET_RE.test(srcset)
      ) {
        count += 1;
      }
    }
    return count;
  }

  function reportCount(force = false) {
    const count = countImages();
    if (!force && count === lastCount) return;
    lastCount = count;

    try {
      chrome.runtime.sendMessage(
        { type: "IU_COUNT", count, enabled },
        () => void chrome.runtime.lastError
      );
    } catch {
      // The extension was reloaded or removed; nothing to report to.
    }
  }

  function scheduleCount() {
    if (countTimer) clearTimeout(countTimer);
    countTimer = window.setTimeout(() => {
      countTimer = 0;
      reportCount();
    }, 150);
  }

  function onMutations(mutations) {
    let shouldCount = false;

    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            processLinks(node);
          }
        });
        shouldCount = true;
      } else if (mutation.type === "attributes") {
        if (mutation.target.tagName === "A") {
          processLink(mutation.target);
        }
        if (
          mutation.target.tagName === "IMG" ||
          mutation.target.tagName === "SOURCE"
        ) {
          shouldCount = true;
        }
      }
    }

    if (shouldCount) scheduleCount();
  }

  function start() {
    if (observer || !document.documentElement) return;

    processLinks(document);
    reportCount(true);

    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href", "src", "srcset"]
    });

    scheduleCount();
  }

  function setEnabled(value) {
    const next = value !== false;
    if (next === enabled) return;
    enabled = next;

    if (enabled) {
      processLinks(document);
    } else {
      restoreLinks();
    }
    scheduleCount();
  }

  function init() {
    chrome.storage.local.get({ [STORAGE_KEY]: true }, (result) => {
      enabled = result[STORAGE_KEY] !== false;
      start();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[STORAGE_KEY]) return;
      setEnabled(changes[STORAGE_KEY].newValue !== false);
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message) return;

      if (message.type === "IU_GET_STATE") {
        sendResponse({ enabled, count: countImages() });
      } else if (message.type === "IU_SET_ENABLED") {
        setEnabled(message.enabled);
        sendResponse({ enabled });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
