import { a0 as sendCommand, a1 as request, a2 as downloadBinaryBase64, a3 as defineStore, a4 as pick, a5 as toNumber } from "./index-CTSqJF0U.js";
async function listScreenshots() {
  return await request("GET", "/api/v1/screenshot/list");
}
async function requestScreenshot(beaconid, monitorId = 0, quality = 80) {
  return await sendCommand(beaconid, 51, [monitorId, quality]);
}
async function downloadScreenshotBase64({ screenshotId, downloadUrl }) {
  const path = downloadUrl || `/api/v1/screenshot/download?screenshot_id=${encodeURIComponent(screenshotId)}`;
  return await downloadBinaryBase64(path);
}
async function deleteScreenshot(screenshotId) {
  const path = `/api/v1/screenshot?screenshot_id=${encodeURIComponent(String(screenshotId || ""))}`;
  return await request("DELETE", path);
}
function normalizeScreenshot(item) {
  const screenshotId = String(pick(item, ["screenshot_id", "screenshotId", "ScreenshotID", "ScreenshotId"]));
  return {
    screenshotId,
    beaconId: String(pick(item, ["beacon_id", "beaconId", "BeaconID", "BeaconId"])),
    hostname: String(pick(item, ["hostname", "host_name", "hostName", "Hostname"], "未知")),
    username: String(pick(item, ["username", "user_name", "userName", "Username"], "未知")),
    resolution: String(pick(item, ["resolution", "Resolution"], "-")),
    imageSize: toNumber(pick(item, ["image_size", "imageSize", "ImageSize"], 0)),
    capturedAt: toNumber(pick(item, ["captured_at", "capturedAt", "CapturedAt"], 0)),
    fileName: String(pick(item, ["file_name", "fileName", "FileName"], "screenshot.jpg")),
    previewUrl: String(pick(item, ["preview_url", "previewUrl", "PreviewURL", "PreviewUrl"], "")),
    downloadUrl: String(pick(item, ["download_url", "downloadUrl", "DownloadURL", "DownloadUrl"], "")),
    raw: item
  };
}
function sameScreenshot(left, right) {
  if (left.screenshotId && right.screenshotId && left.screenshotId === right.screenshotId) return true;
  if (left.fileName && right.fileName && left.fileName === right.fileName) return true;
  return Boolean(
    left.beaconId && right.beaconId && left.beaconId === right.beaconId && left.capturedAt && right.capturedAt && left.capturedAt === right.capturedAt
  );
}
const useScreenshotStore = defineStore("screenshot", {
  state: () => ({
    screenshots: [],
    loading: false,
    error: "",
    lastUpdated: 0
  }),
  actions: {
    async fetchScreenshots({ silent = false } = {}) {
      if (!silent) this.loading = true;
      this.error = "";
      try {
        const data = await listScreenshots();
        const list = Array.isArray(data) ? data : [];
        this.screenshots = list.map(normalizeScreenshot).sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
        this.lastUpdated = Date.now();
        return this.screenshots;
      } catch (err) {
        this.error = err.message || "获取截图列表失败";
        throw err;
      } finally {
        if (!silent) this.loading = false;
      }
    },
    upsertScreenshot(item) {
      const next = normalizeScreenshot(item);
      if (!next.screenshotId && !next.fileName) return;
      const index = this.screenshots.findIndex((current) => sameScreenshot(current, next));
      if (index >= 0) {
        this.screenshots.splice(index, 1, {
          ...this.screenshots[index],
          ...next
        });
      } else {
        this.screenshots.unshift(next);
      }
      this.screenshots.sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
      this.lastUpdated = Date.now();
    },
    removeScreenshot(target) {
      const normalized = normalizeScreenshot(target);
      this.screenshots = this.screenshots.filter((current) => !sameScreenshot(current, normalized));
      this.lastUpdated = Date.now();
    },
    clear() {
      this.screenshots = [];
      this.error = "";
      this.lastUpdated = 0;
    }
  }
});
const screenshot = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  useScreenshotStore
}, Symbol.toStringTag, { value: "Module" }));
export {
  downloadScreenshotBase64 as a,
  deleteScreenshot as d,
  requestScreenshot as r,
  screenshot as s,
  useScreenshotStore as u
};
