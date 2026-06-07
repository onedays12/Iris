import { _ as _export_sfc, i as useAgentStore, H as useModalStore, L as useNotificationStore, B as watch, k as onMounted, o as openBlock, c as createElementBlock, b as createBaseVNode, d as withDirectives, M as vModelSelect, F as Fragment, p as renderList, v as vModelText, e as createTextVNode, t as toDisplayString, f as createCommentVNode, q as createBlock, T as Teleport, r as ref, s as computed, S as SaveFile, W as WriteBinaryFile } from "./index-CTSqJF0U.js";
import { u as useScreenshotStore, r as requestScreenshot, d as deleteScreenshot, a as downloadScreenshotBase64 } from "./screenshot-kLHFs45O.js";
const _hoisted_1 = { class: "page-container screenshots-page" };
const _hoisted_2 = { class: "page-header" };
const _hoisted_3 = { class: "header-actions" };
const _hoisted_4 = { class: "control-group" };
const _hoisted_5 = ["value"];
const _hoisted_6 = { class: "control-group small" };
const _hoisted_7 = { class: "control-group small" };
const _hoisted_8 = ["disabled"];
const _hoisted_9 = ["disabled"];
const _hoisted_10 = { class: "content-panel" };
const _hoisted_11 = {
  key: 0,
  class: "state-line error-state"
};
const _hoisted_12 = {
  key: 1,
  class: "state-line"
};
const _hoisted_13 = {
  key: 2,
  class: "table-scroll"
};
const _hoisted_14 = { class: "data-table" };
const _hoisted_15 = { class: "cell-time" };
const _hoisted_16 = ["title"];
const _hoisted_17 = { class: "cell-hostname" };
const _hoisted_18 = { class: "cell-user" };
const _hoisted_19 = { class: "tag-res" };
const _hoisted_20 = { class: "cell-size" };
const _hoisted_21 = { class: "actions-col" };
const _hoisted_22 = ["onClick"];
const _hoisted_23 = ["disabled", "onClick"];
const _hoisted_24 = ["disabled", "onClick"];
const _hoisted_25 = { key: 0 };
const _hoisted_26 = {
  key: 0,
  class: "preview-overlay"
};
const _hoisted_27 = { class: "preview-modal" };
const _hoisted_28 = { class: "preview-header" };
const _hoisted_29 = { class: "preview-title" };
const _hoisted_30 = { class: "preview-meta" };
const _hoisted_31 = { class: "preview-body" };
const _hoisted_32 = {
  key: 0,
  class: "preview-state"
};
const _hoisted_33 = ["src", "alt"];
const _hoisted_34 = {
  key: 2,
  class: "preview-state"
};
const _hoisted_35 = { class: "preview-footer" };
const _hoisted_36 = ["disabled"];
const _hoisted_37 = ["disabled"];
const _sfc_main = {
  __name: "ScreenshotsPage",
  setup(__props) {
    const agentStore = useAgentStore();
    const modalStore = useModalStore();
    const notificationStore = useNotificationStore();
    const screenshotStore = useScreenshotStore();
    const selectedBeaconId = ref("");
    const monitorId = ref(0);
    const quality = ref(80);
    const requestLoading = ref(false);
    const savingShotId = ref("");
    const deletingShotId = ref("");
    const preview = ref({
      visible: false,
      loading: false,
      shot: null,
      src: ""
    });
    const screenshots = computed(() => screenshotStore.screenshots);
    const loading = computed(() => screenshotStore.loading);
    const errorMessage = computed(() => screenshotStore.error);
    const availableAgents = computed(() => {
      return [...agentStore.agents].sort((a, b) => {
        const left = a.hostname || a.beaconid || "";
        const right = b.hostname || b.beaconid || "";
        return left.localeCompare(right);
      });
    });
    watch(availableAgents, (agents) => {
      if (!agents.length) {
        selectedBeaconId.value = "";
        return;
      }
      const current = agents.find((agent) => agent.beaconid === selectedBeaconId.value);
      if (!current) {
        selectedBeaconId.value = agents[0].beaconid;
      }
    }, { immediate: true });
    function shortId(value) {
      if (!value) return "-";
      return String(value).substring(0, 8);
    }
    function formatSize(bytes) {
      const value = Number(bytes || 0);
      if (value === 0) return "0 B";
      const units = ["B", "KB", "MB", "GB", "TB"];
      const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
      return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
    }
    function formatTime(value) {
      if (!value) return "-";
      const numeric = Number(value);
      const date = Number.isFinite(numeric) ? new Date(numeric < 1e12 ? numeric * 1e3 : numeric) : new Date(value);
      return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    }
    async function refreshScreenshots() {
      try {
        await screenshotStore.fetchScreenshots();
      } catch (err) {
        console.error("[ScreenshotsPage] 获取截图列表失败:", err);
      }
    }
    async function requestScreenshot$1() {
      if (!selectedBeaconId.value) {
        notificationStore.warn("请先选择 Beacon");
        return;
      }
      const monitor = monitorId.value;
      const shotQuality = quality.value;
      if (!Number.isInteger(monitor) || monitor < 0) {
        notificationStore.warn("monitor_id 必须是非负整数");
        return;
      }
      if (!Number.isInteger(shotQuality) || shotQuality < 1 || shotQuality > 100) {
        notificationStore.warn("quality 需要在 1 到 100 之间");
        return;
      }
      requestLoading.value = true;
      try {
        await requestScreenshot(selectedBeaconId.value, monitor, shotQuality);
        notificationStore.success("截图任务已下发，等待任务回传");
      } catch (err) {
        console.error("[ScreenshotsPage] 下发截图任务失败:", err);
      } finally {
        requestLoading.value = false;
      }
    }
    async function openPreview(shot) {
      preview.value = {
        visible: true,
        loading: true,
        shot,
        src: ""
      };
      try {
        const base64 = await downloadScreenshotBase64({
          screenshotId: shot.screenshotId,
          downloadUrl: shot.previewUrl
        });
        preview.value.src = `data:image/jpeg;base64,${base64}`;
      } catch (err) {
        notificationStore.error(err.message || "加载截图预览失败");
        closePreview();
      } finally {
        preview.value.loading = false;
      }
    }
    function closePreview() {
      preview.value = {
        visible: false,
        loading: false,
        shot: null,
        src: ""
      };
    }
    async function saveScreenshot(shot) {
      if (!(shot == null ? void 0 : shot.screenshotId) && !(shot == null ? void 0 : shot.downloadUrl)) return;
      const savePath = await SaveFile({
        Title: "保存截图",
        Filename: shot.fileName || "screenshot.jpg"
      });
      if (!savePath) return;
      const key = shot.screenshotId || shot.downloadUrl;
      savingShotId.value = key;
      try {
        const base64Data = await downloadScreenshotBase64({
          screenshotId: shot.screenshotId,
          downloadUrl: shot.downloadUrl
        });
        await WriteBinaryFile(savePath, base64Data);
        notificationStore.success(`已保存: ${shot.fileName || "screenshot.jpg"}`);
      } catch (err) {
        notificationStore.error(`保存截图失败: ${err.message || err}`);
      } finally {
        savingShotId.value = "";
      }
    }
    async function deleteScreenshot$1(shot) {
      var _a;
      if (!(shot == null ? void 0 : shot.screenshotId)) return;
      const confirmed = await modalStore.showConfirm({
        title: "删除截图",
        message: `确定要删除截图 ${shot.fileName || shot.screenshotId} 吗？`,
        type: "danger"
      });
      if (!confirmed) return;
      deletingShotId.value = shot.screenshotId;
      try {
        await deleteScreenshot(shot.screenshotId);
        screenshotStore.removeScreenshot(shot);
        if (preview.value.visible && ((_a = preview.value.shot) == null ? void 0 : _a.screenshotId) === shot.screenshotId) {
          closePreview();
        }
        notificationStore.success(`已删除: ${shot.fileName || shot.screenshotId}`);
      } catch (err) {
        notificationStore.error(`删除截图失败: ${err.message || err}`);
      } finally {
        deletingShotId.value = "";
      }
    }
    onMounted(refreshScreenshots);
    return (_ctx, _cache) => {
      var _a, _b, _c, _d, _e, _f, _g;
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          _cache[11] || (_cache[11] = createBaseVNode("div", { class: "header-left" }, [
            createBaseVNode("h1", { class: "page-title" }, "屏幕截图"),
            createBaseVNode("p", { class: "page-subtitle" }, "查看已保存的截图，并向指定 Beacon 下发新的截图任务")
          ], -1)),
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("div", _hoisted_4, [
              _cache[6] || (_cache[6] = createBaseVNode("label", null, "Beacon", -1)),
              withDirectives(createBaseVNode("select", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => selectedBeaconId.value = $event),
                class: "form-control select-control"
              }, [
                _cache[5] || (_cache[5] = createBaseVNode("option", {
                  value: "",
                  disabled: ""
                }, "请选择 Beacon", -1)),
                (openBlock(true), createElementBlock(Fragment, null, renderList(availableAgents.value, (agent) => {
                  return openBlock(), createElementBlock("option", {
                    key: agent.beaconid,
                    value: agent.beaconid
                  }, toDisplayString(agent.hostname || "Unknown") + " · " + toDisplayString(shortId(agent.beaconid)), 9, _hoisted_5);
                }), 128))
              ], 512), [
                [vModelSelect, selectedBeaconId.value]
              ])
            ]),
            createBaseVNode("div", _hoisted_6, [
              _cache[7] || (_cache[7] = createBaseVNode("label", null, "Monitor", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => monitorId.value = $event),
                type: "number",
                min: "0",
                step: "1",
                class: "form-control number-control"
              }, null, 512), [
                [
                  vModelText,
                  monitorId.value,
                  void 0,
                  { number: true }
                ]
              ])
            ]),
            createBaseVNode("div", _hoisted_7, [
              _cache[8] || (_cache[8] = createBaseVNode("label", null, "Quality", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => quality.value = $event),
                type: "number",
                min: "1",
                max: "100",
                step: "1",
                class: "form-control number-control"
              }, null, 512), [
                [
                  vModelText,
                  quality.value,
                  void 0,
                  { number: true }
                ]
              ])
            ]),
            createBaseVNode("button", {
              class: "btn btn-primary",
              disabled: requestLoading.value || !selectedBeaconId.value,
              onClick: requestScreenshot$1
            }, [
              _cache[9] || (_cache[9] = createBaseVNode("span", { class: "icon" }, "📸", -1)),
              createTextVNode(" " + toDisplayString(requestLoading.value ? "下发中..." : "下发截图"), 1)
            ], 8, _hoisted_8),
            createBaseVNode("button", {
              class: "btn btn-secondary",
              disabled: loading.value,
              onClick: refreshScreenshots
            }, [
              _cache[10] || (_cache[10] = createBaseVNode("span", { class: "icon" }, "↻", -1)),
              createTextVNode(" " + toDisplayString(loading.value ? "刷新中..." : "刷新列表"), 1)
            ], 8, _hoisted_9)
          ])
        ]),
        createBaseVNode("div", _hoisted_10, [
          errorMessage.value ? (openBlock(), createElementBlock("div", _hoisted_11, toDisplayString(errorMessage.value), 1)) : createCommentVNode("", true),
          loading.value && screenshots.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_12, " 正在读取截图列表... ")) : (openBlock(), createElementBlock("div", _hoisted_13, [
            createBaseVNode("table", _hoisted_14, [
              _cache[13] || (_cache[13] = createBaseVNode("thead", null, [
                createBaseVNode("tr", null, [
                  createBaseVNode("th", null, "捕获时间"),
                  createBaseVNode("th", null, "Beacon"),
                  createBaseVNode("th", null, "主机名"),
                  createBaseVNode("th", null, "用户"),
                  createBaseVNode("th", null, "分辨率"),
                  createBaseVNode("th", null, "大小"),
                  createBaseVNode("th", { class: "actions-col" }, "操作")
                ])
              ], -1)),
              createBaseVNode("tbody", null, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(screenshots.value, (shot) => {
                  return openBlock(), createElementBlock("tr", {
                    key: shot.screenshotId || shot.fileName
                  }, [
                    createBaseVNode("td", _hoisted_15, toDisplayString(formatTime(shot.capturedAt)), 1),
                    createBaseVNode("td", {
                      class: "cell-id",
                      title: shot.beaconId
                    }, toDisplayString(shortId(shot.beaconId)), 9, _hoisted_16),
                    createBaseVNode("td", _hoisted_17, toDisplayString(shot.hostname || "-"), 1),
                    createBaseVNode("td", _hoisted_18, toDisplayString(shot.username || "-"), 1),
                    createBaseVNode("td", null, [
                      createBaseVNode("span", _hoisted_19, toDisplayString(shot.resolution || "-"), 1)
                    ]),
                    createBaseVNode("td", _hoisted_20, toDisplayString(formatSize(shot.imageSize)), 1),
                    createBaseVNode("td", _hoisted_21, [
                      createBaseVNode("button", {
                        class: "action-btn",
                        onClick: ($event) => openPreview(shot)
                      }, "预览", 8, _hoisted_22),
                      createBaseVNode("button", {
                        class: "action-btn",
                        disabled: savingShotId.value === (shot.screenshotId || shot.downloadUrl),
                        onClick: ($event) => saveScreenshot(shot)
                      }, toDisplayString(savingShotId.value === (shot.screenshotId || shot.downloadUrl) ? "保存中..." : "下载"), 9, _hoisted_23),
                      createBaseVNode("button", {
                        class: "action-btn action-btn-danger",
                        disabled: deletingShotId.value === shot.screenshotId,
                        onClick: ($event) => deleteScreenshot$1(shot)
                      }, toDisplayString(deletingShotId.value === shot.screenshotId ? "删除中..." : "删除"), 9, _hoisted_24)
                    ])
                  ]);
                }), 128)),
                screenshots.value.length === 0 && !loading.value ? (openBlock(), createElementBlock("tr", _hoisted_25, [..._cache[12] || (_cache[12] = [
                  createBaseVNode("td", {
                    colspan: "7",
                    class: "empty-cell"
                  }, "TeamServer 暂无截图记录", -1)
                ])])) : createCommentVNode("", true)
              ])
            ])
          ]))
        ]),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          preview.value.visible ? (openBlock(), createElementBlock("div", _hoisted_26, [
            createBaseVNode("div", _hoisted_27, [
              createBaseVNode("header", _hoisted_28, [
                createBaseVNode("div", _hoisted_29, [
                  _cache[14] || (_cache[14] = createBaseVNode("span", { class: "icon" }, "🖼️", -1)),
                  createBaseVNode("div", _hoisted_30, [
                    createBaseVNode("h3", null, toDisplayString(((_a = preview.value.shot) == null ? void 0 : _a.fileName) || "截图预览"), 1),
                    createBaseVNode("span", null, toDisplayString(((_b = preview.value.shot) == null ? void 0 : _b.hostname) || "-") + " · " + toDisplayString(shortId((_c = preview.value.shot) == null ? void 0 : _c.beaconId)) + " · " + toDisplayString(formatTime((_d = preview.value.shot) == null ? void 0 : _d.capturedAt)), 1)
                  ])
                ]),
                createBaseVNode("button", {
                  class: "close-btn",
                  onClick: closePreview
                }, "×")
              ]),
              createBaseVNode("div", _hoisted_31, [
                preview.value.loading ? (openBlock(), createElementBlock("div", _hoisted_32, "正在加载截图预览...")) : preview.value.src ? (openBlock(), createElementBlock("img", {
                  key: 1,
                  src: preview.value.src,
                  class: "preview-image",
                  alt: ((_e = preview.value.shot) == null ? void 0 : _e.fileName) || "screenshot"
                }, null, 8, _hoisted_33)) : (openBlock(), createElementBlock("div", _hoisted_34, "暂无预览内容"))
              ]),
              createBaseVNode("footer", _hoisted_35, [
                createBaseVNode("button", {
                  class: "btn btn-secondary",
                  onClick: closePreview
                }, "关闭"),
                createBaseVNode("button", {
                  class: "btn btn-danger",
                  disabled: !preview.value.shot || deletingShotId.value === ((_f = preview.value.shot) == null ? void 0 : _f.screenshotId),
                  onClick: _cache[3] || (_cache[3] = ($event) => deleteScreenshot$1(preview.value.shot))
                }, toDisplayString(deletingShotId.value === ((_g = preview.value.shot) == null ? void 0 : _g.screenshotId) ? "删除中..." : "删除截图"), 9, _hoisted_36),
                createBaseVNode("button", {
                  class: "btn btn-primary",
                  disabled: !preview.value.shot,
                  onClick: _cache[4] || (_cache[4] = ($event) => saveScreenshot(preview.value.shot))
                }, " 下载到本地 ", 8, _hoisted_37)
              ])
            ])
          ])) : createCommentVNode("", true)
        ]))
      ]);
    };
  }
};
const ScreenshotsPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-07adea90"]]);
export {
  ScreenshotsPage as default
};
