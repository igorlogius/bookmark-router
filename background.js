/* global browser */

const manifest = browser.runtime.getManifest();
const extname = manifest.name;

let bookmarkFoldersCache;
let delayTimerId;
let notifications = false;

function notify(title, message = "", iconUrl = "icon.png") {
  if (notifications) {
    return browser.notifications.create("" + Date.now(), {
      type: "basic",
      iconUrl,
      title,
      message,
    });
  }
}

async function getFromStorage(type, id, fallback) {
  let tmp = await browser.storage.local.get(id);
  return typeof tmp[id] === type ? tmp[id] : fallback;
}

function recGetFolders(node, depth = 0) {
  let out = new Map();
  if (typeof node.url !== "string") {
    if (node.id !== "root________") {
      out.set(node.id, { depth: depth, title: node.title });
    }
    if (node.children) {
      for (let child of node.children) {
        out = new Map([...out, ...recGetFolders(child, depth + 1)]);
      }
    }
  }
  return out;
}

async function updateBookmarkFoldersCache() {
  const nodes = await browser.bookmarks.getTree();
  let out = new Map();
  let depth = 1;
  for (const node of nodes) {
    out = new Map([...out, ...recGetFolders(node, depth)]);
  }
  bookmarkFoldersCache = out;
}

function delay_updateBookmarkFoldesCache() {
  clearTimeout(delayTimerId);
  delayTimerId = setTimeout(updateBookmarkFoldersCache, 2000);
}

function onBAClicked() {
  browser.windows.create({
    url: ["options.html"],
    type: "popup",
  });
}

// send the cachedFolders to the options page
function onMessage(/*data, sender*/) {
  return Promise.resolve(bookmarkFoldersCache);
}

async function onBookmarkCreated(id, bookmark) {
  // when a folder is created, only update the FolderCache
  if (typeof bookmark.url !== "string") {
    delay_updateBookmarkFoldesCache();
    return;
  }

  // a bookmark is created ... lets see if any routing is required

  let store = {};

  try {
    store = await browser.storage.local.get("selectors");
    if (typeof store === "undefined") {
      store = {};
    }
  } catch (e) {
    console.error("error", "access to rules storage failed");
    store = {};
  }

  if (typeof store.selectors === "undefined") {
    store.selectors = [];
  }

  for (let selector of store.selectors) {
    // check activ
    if (typeof selector.activ === "boolean") {
      if (selector.activ === true) {
        // check url regex
        if (typeof selector.url_regex === "string") {
          selector.url_regex = selector.url_regex.trim();
          if (selector.url_regex !== "") {
            if (new RegExp(selector.url_regex).test(bookmark.url)) {
              if (typeof selector.bookmarkId === "string") {
                if (selector.bookmarkId !== "") {
                  browser.bookmarks.move(id, { parentId: selector.bookmarkId });
                  const bm = (
                    await browser.bookmarks.get(selector.bookmarkId)
                  )[0];
                  notify(extname, "Moved to '" + bm.title + "'");
                  return;
                }
              }
            }
          }
        }
      }
    }
  } // for
}

function onBookmarkChanged(id, changeInfo) {
  if (!changeInfo.url) {
    // If the item is a folder, url is omitted <=> folder renamed
    delay_updateBookmarkFoldesCache();
  }
}

async function onStorageChanged() {
  notifications = await getFromStorage("boolean", "notifications", true);
  console.debug("notifications (2) ", notifications);
}

// open option
browser.browserAction.onClicked.addListener(onBAClicked);

// option page opened
browser.runtime.onMessage.addListener(onMessage);

// events to update the folder Cache
browser.runtime.onStartup.addListener(delay_updateBookmarkFoldesCache);
browser.runtime.onInstalled.addListener(delay_updateBookmarkFoldesCache);
browser.bookmarks.onRemoved.addListener(delay_updateBookmarkFoldesCache);
browser.bookmarks.onChanged.addListener(onBookmarkChanged);
browser.bookmarks.onCreated.addListener(onBookmarkCreated);
browser.storage.onChanged.addListener(onStorageChanged);

(async () => {
  notifications = await getFromStorage("boolean", "notifications", true);
  console.debug("notifications (1) ", notifications);
})();
