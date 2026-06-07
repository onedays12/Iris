import { _ as _export_sfc, H as useModalStore, L as useNotificationStore, I as usePluginStore, k as onMounted, o as openBlock, c as createElementBlock, b as createBaseVNode, g as unref, e as createTextVNode, t as toDisplayString, f as createCommentVNode, n as normalizeClass, F as Fragment, p as renderList, X as OpenFile, s as computed } from "./index-CTSqJF0U.js";
const _hoisted_1 = { class: "plugin-page" };
const _hoisted_2 = { class: "page-header" };
const _hoisted_3 = { class: "page-actions" };
const _hoisted_4 = ["disabled"];
const _hoisted_5 = ["disabled"];
const _hoisted_6 = ["disabled"];
const _hoisted_7 = { class: "list-section glass-card" };
const _hoisted_8 = { class: "panel-heading" };
const _hoisted_9 = { class: "panel-subtitle" };
const _hoisted_10 = { key: 0 };
const _hoisted_11 = {
  key: 0,
  class: "error-banner"
};
const _hoisted_12 = {
  key: 1,
  class: "data-table plugin-table"
};
const _hoisted_13 = ["onClick"];
const _hoisted_14 = { class: "cell-name" };
const _hoisted_15 = { class: "cell-path" };
const _hoisted_16 = { class: "cell-desc" };
const _hoisted_17 = {
  key: 2,
  class: "empty-state"
};
const _sfc_main = {
  __name: "PluginsPage",
  setup(__props) {
    const modalStore = useModalStore();
    const notificationStore = useNotificationStore();
    const pluginStore = usePluginStore();
    const plugins = computed(() => pluginStore.plugins);
    const selectedPlugin = computed(() => pluginStore.selectedPlugin);
    function statusClass(status) {
      const value = String(status || "").toLowerCase();
      if (["ready", "loaded", "running", "active", "ok"].includes(value)) return "online";
      if (["loading"].includes(value)) return "connecting";
      if (["error", "failed"].includes(value)) return "error";
      return "offline";
    }
    function statusLabel(status) {
      const value = String(status || "").toLowerCase();
      if (value === "ready") return "就绪";
      if (value === "loaded") return "已加载";
      if (value === "loading") return "加载中";
      if (value === "error" || value === "failed") return "异常";
      if (value === "running" || value === "active") return "运行中";
      return value || "-";
    }
    function formatPath(value) {
      const text = String(value || "").trim();
      return text || "-";
    }
    function getSelectedPluginLabel() {
      if (!selectedPlugin.value) return "未选择";
      return selectedPlugin.value.displayName || selectedPlugin.value.name || selectedPlugin.value.id || "Plugin";
    }
    function selectPlugin(pluginId) {
      pluginStore.selectPlugin(pluginId);
    }
    async function handleAddPlugin() {
      try {
        const picked = await OpenFile({
          Title: "选择 plugin.json",
          Message: "请选择插件根目录中的 plugin.json 文件",
          CanChooseFiles: true,
          AllowsMultipleSelection: false,
          Filters: [
            { DisplayName: "插件元数据", Pattern: "*.json" }
          ]
        });
        const sourcePath = Array.isArray(picked) ? picked[0] : picked;
        if (!sourcePath) return;
        if (!/[/\\]plugin\.json$/i.test(String(sourcePath))) {
          notificationStore.warn("请选择 plugin.json 文件");
          return;
        }
        await pluginStore.addPlugin(sourcePath);
        notificationStore.success("插件已添加");
      } catch (err) {
        notificationStore.error(err.message || "添加插件失败");
        console.error("[PluginsPage] 添加插件失败:", err);
      }
    }
    async function handleDeletePlugin() {
      if (!selectedPlugin.value) {
        notificationStore.warn("请先选择一个插件");
        return;
      }
      const confirmed = await modalStore.showConfirm({
        title: "删除插件",
        message: `确定要删除插件 [${getSelectedPluginLabel()}] 吗？
这会移除插件目录并重新加载插件列表。`,
        type: "danger"
      });
      if (!confirmed) return;
      try {
        await pluginStore.deletePlugin(selectedPlugin.value.id);
        notificationStore.success("插件已删除");
      } catch (err) {
        notificationStore.error(err.message || "删除插件失败");
        console.error("[PluginsPage] 删除插件失败:", err);
      }
    }
    async function handleReloadPlugins() {
      try {
        await pluginStore.reloadPlugins();
        notificationStore.success("插件已重新加载");
      } catch (err) {
        notificationStore.error(err.message || "重新加载插件失败");
        console.error("[PluginsPage] 重新加载插件失败:", err);
      }
    }
    onMounted(async () => {
      try {
        await pluginStore.fetchPlugins();
      } catch (err) {
        console.error("[PluginsPage] 获取插件列表失败:", err);
      }
    });
    return (_ctx, _cache) => {
      var _a;
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          _cache[0] || (_cache[0] = createBaseVNode("div", null, [
            createBaseVNode("div", { class: "page-title-row" }, [
              createBaseVNode("div", { class: "page-icon" }, "🧩"),
              createBaseVNode("h1", { class: "page-title" }, "插件系统")
            ]),
            createBaseVNode("p", { class: "page-subtitle" }, " 只展示插件条目与管理按钮。右键 Beacon 时会按插件主题展开为树状动作菜单。 ")
          ], -1)),
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("button", {
              class: "btn btn-ghost",
              type: "button",
              disabled: unref(pluginStore).loading,
              onClick: handleAddPlugin
            }, "添加插件", 8, _hoisted_4),
            createBaseVNode("button", {
              class: "btn btn-ghost danger",
              type: "button",
              disabled: unref(pluginStore).loading || !selectedPlugin.value,
              onClick: handleDeletePlugin
            }, "删除插件", 8, _hoisted_5),
            createBaseVNode("button", {
              class: "btn btn-primary",
              type: "button",
              disabled: unref(pluginStore).loading,
              onClick: handleReloadPlugins
            }, "重新加载插件", 8, _hoisted_6)
          ])
        ]),
        createBaseVNode("section", _hoisted_7, [
          createBaseVNode("div", _hoisted_8, [
            createBaseVNode("div", null, [
              _cache[1] || (_cache[1] = createBaseVNode("div", { class: "panel-title" }, "插件列表", -1)),
              createBaseVNode("div", _hoisted_9, [
                createTextVNode(toDisplayString(plugins.value.length) + " 个插件 ", 1),
                selectedPlugin.value ? (openBlock(), createElementBlock("span", _hoisted_10, " · 已选择 " + toDisplayString(getSelectedPluginLabel()), 1)) : createCommentVNode("", true)
              ])
            ]),
            createBaseVNode("div", {
              class: normalizeClass(["panel-status", statusClass(unref(pluginStore).loading ? "loading" : (_a = selectedPlugin.value) == null ? void 0 : _a.status)])
            }, toDisplayString(unref(pluginStore).loading ? "加载中" : selectedPlugin.value ? statusLabel(selectedPlugin.value.status) : "未选择"), 3)
          ]),
          unref(pluginStore).error ? (openBlock(), createElementBlock("div", _hoisted_11, toDisplayString(unref(pluginStore).error), 1)) : createCommentVNode("", true),
          plugins.value.length ? (openBlock(), createElementBlock("table", _hoisted_12, [
            _cache[2] || (_cache[2] = createBaseVNode("thead", null, [
              createBaseVNode("tr", null, [
                createBaseVNode("th", { style: { "width": "32px" } }),
                createBaseVNode("th", null, "插件名称"),
                createBaseVNode("th", null, "路径"),
                createBaseVNode("th", null, "作用"),
                createBaseVNode("th", { style: { "width": "120px" } }, "状态")
              ])
            ], -1)),
            createBaseVNode("tbody", null, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(plugins.value, (plugin) => {
                return openBlock(), createElementBlock("tr", {
                  key: plugin.id,
                  class: normalizeClass({ selected: plugin.id === unref(pluginStore).selectedPluginId }),
                  onClick: ($event) => selectPlugin(plugin.id)
                }, [
                  createBaseVNode("td", null, [
                    createBaseVNode("span", {
                      class: normalizeClass(["status-dot", statusClass(plugin.status)])
                    }, null, 2)
                  ]),
                  createBaseVNode("td", null, [
                    createBaseVNode("div", _hoisted_14, toDisplayString(plugin.displayName), 1)
                  ]),
                  createBaseVNode("td", _hoisted_15, toDisplayString(formatPath(plugin.path)), 1),
                  createBaseVNode("td", _hoisted_16, toDisplayString(plugin.description || "暂无描述"), 1),
                  createBaseVNode("td", null, [
                    createBaseVNode("span", {
                      class: normalizeClass(["plugin-status", statusClass(plugin.status)])
                    }, toDisplayString(statusLabel(plugin.status)), 3)
                  ])
                ], 10, _hoisted_13);
              }), 128))
            ])
          ])) : (openBlock(), createElementBlock("div", _hoisted_17, [..._cache[3] || (_cache[3] = [
            createBaseVNode("div", { class: "empty-icon" }, "🧩", -1),
            createBaseVNode("div", { class: "empty-title" }, "还没有加载插件", -1),
            createBaseVNode("div", { class: "empty-text" }, "点击「添加插件」选择一个 plugin.json，或者先重新加载当前目录。", -1)
          ])]))
        ])
      ]);
    };
  }
};
const PluginsPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-01b85628"]]);
export {
  PluginsPage as default
};
