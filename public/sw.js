/*
 * Task Inbox service worker: makes the inbox installable as an app. No
 * offline cache: tasks always come fresh from the server.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
// Some browsers only offer "Install" when the worker handles fetches; pass everything through.
self.addEventListener("fetch", () => {});
