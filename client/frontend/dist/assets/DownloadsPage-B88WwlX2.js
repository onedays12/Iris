import { _ as _export_sfc, L as useNotificationStore, k as onMounted, o as openBlock, c as createElementBlock, b as createBaseVNode, e as createTextVNode, t as toDisplayString, f as createCommentVNode, F as Fragment, p as renderList, U as listDownloads, r as ref, S as SaveFile, V as downloadFileBase64, W as WriteBinaryFile } from "./index-CTSqJF0U.js";
const _hoisted_1 = { class: "page-container" };
const _hoisted_2 = { class: "page-header" };
const _hoisted_3 = ["disabled"];
const _hoisted_4 = { class: "content-panel" };
const _hoisted_5 = {
  key: 0,
  class: "state-line error-state"
};
const _hoisted_6 = {
  key: 1,
  class: "state-line"
};
const _hoisted_7 = {
  key: 2,
  class: "data-table"
};
const _hoisted_8 = { class: "cell-name" };
const _hoisted_9 = { class: "cell-size" };
const _hoisted_10 = { class: "cell-time" };
const _hoisted_11 = ["title"];
const _hoisted_12 = { class: "actions-col" };
const _hoisted_13 = ["disabled", "onClick"];
const _hoisted_14 = { key: 0 };
const _sfc_main = {
  __name: "DownloadsPage",
  setup(__props) {
    const notificationStore = useNotificationStore();
    const downloads = ref([]);
    const loading = ref(false);
    const savingFileId = ref("");
    const errorMessage = ref("");
    function formatSize(bytes) {
      const value = Number(bytes || 0);
      if (value === 0) return "0 B";
      const units = ["B", "KB", "MB", "GB", "TB"];
      const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
      return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
    }
    function formatTime(iso) {
      if (!iso) return "-";
      const numeric = Number(iso);
      const date = Number.isFinite(numeric) ? new Date(numeric < 1e12 ? numeric * 1e3 : numeric) : new Date(iso);
      return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    }
    async function fetchDownloads() {
      loading.value = true;
      errorMessage.value = "";
      try {
        downloads.value = await listDownloads();
      } catch (err) {
        errorMessage.value = err.message || "获取下载列表失败";
      } finally {
        loading.value = false;
      }
    }
    async function saveDownload(file) {
      if (!(file == null ? void 0 : file.file_id) && !(file == null ? void 0 : file.download_url)) return;
      const savePath = await SaveFile({
        Title: "保存下载文件",
        Filename: file.file_name || "download.bin"
      });
      if (!savePath) return;
      savingFileId.value = file.file_id || file.download_url;
      try {
        const base64Data = await downloadFileBase64({
          fileId: file.file_id,
          downloadUrl: file.download_url
        });
        await WriteBinaryFile(savePath, base64Data);
        notificationStore.success(`已保存: ${file.file_name || "download.bin"}`);
      } catch (err) {
        notificationStore.error(`保存失败: ${err.message || err}`);
      } finally {
        savingFileId.value = "";
      }
    }
    onMounted(fetchDownloads);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          _cache[1] || (_cache[1] = createBaseVNode("div", { class: "header-left" }, [
            createBaseVNode("h1", { class: "page-title" }, "下载文件"),
            createBaseVNode("p", { class: "page-subtitle" }, "查看 TeamServer 已接收完成、可保存到本地的文件")
          ], -1)),
          createBaseVNode("button", {
            class: "btn btn-primary",
            disabled: loading.value,
            onClick: fetchDownloads
          }, [
            _cache[0] || (_cache[0] = createBaseVNode("span", { class: "icon" }, "↻", -1)),
            createTextVNode(" " + toDisplayString(loading.value ? "刷新中..." : "刷新列表"), 1)
          ], 8, _hoisted_3)
        ]),
        createBaseVNode("div", _hoisted_4, [
          errorMessage.value ? (openBlock(), createElementBlock("div", _hoisted_5, toDisplayString(errorMessage.value), 1)) : createCommentVNode("", true),
          loading.value && downloads.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_6, " 正在读取下载列表... ")) : (openBlock(), createElementBlock("table", _hoisted_7, [
            _cache[4] || (_cache[4] = createBaseVNode("thead", null, [
              createBaseVNode("tr", null, [
                createBaseVNode("th", null, "文件名"),
                createBaseVNode("th", null, "大小"),
                createBaseVNode("th", null, "修改时间"),
                createBaseVNode("th", null, "SHA256"),
                createBaseVNode("th", { class: "actions-col" }, "操作")
              ])
            ], -1)),
            createBaseVNode("tbody", null, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(downloads.value, (file) => {
                return openBlock(), createElementBlock("tr", {
                  key: file.file_id || file.download_url
                }, [
                  createBaseVNode("td", _hoisted_8, [
                    _cache[2] || (_cache[2] = createBaseVNode("span", { class: "file-icon" }, "📄", -1)),
                    createTextVNode(" " + toDisplayString(file.file_name || "-"), 1)
                  ]),
                  createBaseVNode("td", _hoisted_9, toDisplayString(formatSize(file.size)), 1),
                  createBaseVNode("td", _hoisted_10, toDisplayString(formatTime(file.mod_time)), 1),
                  createBaseVNode("td", {
                    class: "cell-hash",
                    title: file.sha256 || file.file_id
                  }, toDisplayString(file.sha256 || file.file_id || "-"), 9, _hoisted_11),
                  createBaseVNode("td", _hoisted_12, [
                    createBaseVNode("button", {
                      class: "action-btn",
                      disabled: savingFileId.value === (file.file_id || file.download_url),
                      onClick: ($event) => saveDownload(file)
                    }, toDisplayString(savingFileId.value === (file.file_id || file.download_url) ? "保存中..." : "保存到本地"), 9, _hoisted_13)
                  ])
                ]);
              }), 128)),
              downloads.value.length === 0 && !loading.value ? (openBlock(), createElementBlock("tr", _hoisted_14, [..._cache[3] || (_cache[3] = [
                createBaseVNode("td", {
                  colspan: "5",
                  class: "empty-cell"
                }, "TeamServer 暂无可下载文件", -1)
              ])])) : createCommentVNode("", true)
            ])
          ]))
        ])
      ]);
    };
  }
};
const DownloadsPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-06cba5ac"]]);
export {
  DownloadsPage as default
};
