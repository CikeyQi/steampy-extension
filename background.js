"use strict";

const STEAMPY_ORIGIN = "https://steampy.com";
const FETCH_TIMEOUT_MS = 10000;

function isAllowedSteamPyUrl(value) {
  try {
    return new URL(value).origin === STEAMPY_ORIGIN;
  } catch (error) {
    return false;
  }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!request || typeof request.type !== "string") return false;

  if (request.type === "fetch") {
    if (!isAllowedSteamPyUrl(request.url)) {
      sendResponse({ success: false, error: "Blocked request URL" });
      return false;
    }

    const options = {
      cache: 'no-store',
      headers: {
        Accept: "application/json, text/plain, */*",
        "Cache-Control": "no-cache",
        Pragma: "no-cache"
      }
    };
    if (request.accessToken) options.headers.accessToken = request.accessToken;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    options.signal = controller.signal;

    fetch(request.url, options)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => sendResponse(data))
      .catch(error => sendResponse({
        success: false,
        error: error.name === "AbortError" ? "Request timed out" : error.message
      }))
      .finally(() => clearTimeout(timeoutId));
    return true;
  }

  if (request.type === "open_url") {
    if (isAllowedSteamPyUrl(request.url)) chrome.tabs.create({ url: request.url });
    return false;
  }

  return false;
});
