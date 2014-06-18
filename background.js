/*
  TODO:
  - create better data structure than _sad_ tabRules -> better code structure
  - communicate exclusively by ports (instead of accepting panel's chrome.runtime.sendMessage)
  - workaround for clearing cache
  - when applyingRules, push to panel, in case of _backend_ change
  - handle port disconnects
  - Isn't the icon.png epic? It could be made better though (the C & E). This is really serious

  We need ports for the background to communicate to the panel (...but not the other way around...)
 */


var tabRules = {/* tabId: {stop: fn, ~port:, !rules: [{from:, to:}]}  */};

// keep a reference of ports
chrome.runtime.onConnect.addListener(function (port) {
  if (port.name.substring(0, 8) === 'devtools') {
    var tabId = port.name.substring(8);
    if (!tabRules[tabId]) tabRules[tabId] = {rules: []};

    tabRules[tabId].port = port;
  }
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  var tabId;
  if (typeof request === "object") {

    if ('getRules' in request) {
      tabId = request.getRules.tabId;
      sendResponse({rules: tabRules[tabId] ? tabRules[tabId].rules : []});
      return;
    }

    if ('applyRules' in request) {
      applyRules(request.applyRules.tabId, request.applyRules.rules);
      sendResponse({success: true});
      return;
    }
  }
});

function applyRules(tabId, rules) {
  if (tabRules[tabId] && tabRules[tabId].stop) tabRules[tabId].stop();

  if (!tabRules[tabId]) tabRules[tabId] = {};
  tabRules[tabId].rules = rules;
  tabRules[tabId].stop = function (endOfLife) {
    if (endOfLife && tabRules[tabId].port) {
      tabRules[tabId].port.postMessage({rules: []});
    }
    delete tabRules[tabId];
    chrome.webRequest.onBeforeRequest.removeListener(beforeRequestListener);
    chrome.pageAction.hide(tabId);
  };

  scheduleRemoveCache();

  chrome.pageAction.show(tabId);
  chrome.webRequest.onBeforeRequest.addListener(beforeRequestListener, {
    urls: ["<all_urls>"],
    tabId: tabId,
    types: ['main_frame', 'script', 'stylesheet', 'xmlhttprequest']
  }, ['blocking']);

  var origUrl;
  function beforeRequestListener(details) {
    if (details.type === 'main_frame') {
      if (!origUrl) {
        origUrl = parseUrl(details.url);
      } else {
        if (origUrl.hostname !== parseUrl(details.url).hostname) {
          tabRules[tabId].stop(true);
        }
      }
      return;
    }

    var redirectTo;
    rules.forEach(function (rule) {
      if (details.url === rule.from) {
        redirectTo = rule.to;
      }
    });

    if (redirectTo) return { redirectUrl: redirectTo };
  }
}


chrome.tabs.onUpdated.addListener(function (tabId) {
  if (tabId in tabRules) {
    chrome.pageAction.show(tabId);
  }
});


var removingCache = false;
function scheduleRemoveCache() {
  if (!removingCache) {
    var oneWeekAgo = (new Date()).getTime() - (1000 * 60 * 60 * 24 * 7);
    chrome.browsingData.removeCache({
      since: oneWeekAgo
    }, function () {
      removingCache = false;
    });
    removingCache = true;
  }
}


function parseUrl(url) {
  var a = document.createElement('a');
  a.href = url;

  return {
    protocol: a.protocol, // "http:"
    hostname: a.hostname, // "example.com"
    port: a.port,     // "3000"
    pathname: a.pathname, // "/pathname/"
    search: a.search,   // "?search=test"
    hash: a.hash,     // "#hash"
    host: a.host    // "example.com:3000"
  };
}