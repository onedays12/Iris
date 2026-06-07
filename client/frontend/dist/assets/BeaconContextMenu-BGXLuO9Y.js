import { D as isMenuActionSupportedForOS, P as PLUGIN_COMMAND_ID, E as normalizeBeaconArch, G as normalizeBeaconPlatform, i as useAgentStore, j as useConsoleStore, H as useModalStore, I as usePluginStore, J as sendExitCommand, _ as _export_sfc, r as ref, k as onMounted, C as nextTick, m as onUnmounted, o as openBlock, q as createBlock, b as createBaseVNode, c as createElementBlock, p as renderList, F as Fragment, w as withModifiers, x as normalizeStyle, T as Teleport, s as computed, t as toDisplayString, n as normalizeClass } from "./index-CTSqJF0U.js";
const BEACON_ACTION = Object.freeze({
  CONSOLE: "console",
  FILES: "files",
  PROCESSES: "processes",
  NETWORK: "network",
  PLUGIN: "plugin-action",
  EXEC_BOF: "exec-bof",
  CASCADE_CONNECT_TCP: "cascade-connect-tcp",
  CASCADE_LINK_SMB: "cascade-link-smb",
  EDIT_SLEEP: "edit-sleep",
  EXIT: "exit",
  DELETE_SESSION: "delete-session"
});
function normalizeTargetOSList(values) {
  if (!Array.isArray(values)) return [];
  return values.map((item) => normalizeBeaconPlatform(item)).filter((item) => item && item !== "unknown");
}
function normalizeTargetArchList(values) {
  if (!Array.isArray(values)) return [];
  return values.map((item) => normalizeBeaconArch(item)).filter((item) => item && item !== "unknown");
}
function normalizeArtifactByArchMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [normalizeBeaconArch(key), String(item || "").trim()]).filter(([key, item]) => key && key !== "unknown" && item)
  );
}
function resolveActionArtifact(action, beaconArch) {
  const artifactByArch = normalizeArtifactByArchMap((action == null ? void 0 : action.artifactByArch) || (action == null ? void 0 : action.artifact_by_arch) || {});
  const arch = normalizeBeaconArch(beaconArch);
  return artifactByArch[arch] || String((action == null ? void 0 : action.artifact) || "").trim();
}
function isPluginActionTargetSupported(action, commandId, targetOs, targetArch) {
  if (!isMenuActionSupportedForOS(BEACON_ACTION.PLUGIN, targetOs, commandId)) return false;
  const beaconOS = normalizeBeaconPlatform(targetOs);
  const beaconArch = normalizeBeaconArch(targetArch);
  const supportedOS = normalizeTargetOSList((action == null ? void 0 : action.os) || (action == null ? void 0 : action.OS));
  const supportedArch = normalizeTargetArchList((action == null ? void 0 : action.arch) || (action == null ? void 0 : action.Arch));
  if (supportedOS.length && !supportedOS.includes(beaconOS)) return false;
  if (supportedArch.length && !supportedArch.includes(beaconArch)) return false;
  const artifactByArch = normalizeArtifactByArchMap((action == null ? void 0 : action.artifactByArch) || (action == null ? void 0 : action.artifact_by_arch) || {});
  if (Object.keys(artifactByArch).length && !artifactByArch[beaconArch] && !String((action == null ? void 0 : action.artifact) || "").trim()) {
    return false;
  }
  return true;
}
function buildPluginMenuGroups(targetAgent, plugins) {
  const targetOs = String((targetAgent == null ? void 0 : targetAgent.os) || "");
  const targetArch = String((targetAgent == null ? void 0 : targetAgent.arch) || "");
  return plugins.map((plugin) => {
    const actions = Array.isArray(plugin.actions) ? plugin.actions : [];
    const children = actions.map((action) => {
      const actionId = String((action == null ? void 0 : action.id) || "").trim();
      const label = String((action == null ? void 0 : action.label) || actionId || "").trim();
      if (!actionId || !label) return null;
      const artifactByArch = normalizeArtifactByArchMap((action == null ? void 0 : action.artifactByArch) || (action == null ? void 0 : action.artifact_by_arch) || {});
      const resolvedArtifact = resolveActionArtifact(action, targetArch);
      return {
        type: BEACON_ACTION.PLUGIN,
        action: BEACON_ACTION.PLUGIN,
        label,
        icon: "•",
        pluginId: plugin.id,
        pluginName: plugin.displayName || plugin.name || plugin.id,
        pluginAction: {
          id: actionId,
          label,
          description: String((action == null ? void 0 : action.description) || ""),
          os: normalizeTargetOSList((action == null ? void 0 : action.os) || (action == null ? void 0 : action.OS)),
          arch: normalizeTargetArchList((action == null ? void 0 : action.arch) || (action == null ? void 0 : action.Arch)),
          artifact: resolvedArtifact,
          artifactByArch,
          artifactData: String((action == null ? void 0 : action.artifactData) || (action == null ? void 0 : action.artifact_data) || ""),
          commandId: Number((action == null ? void 0 : action.commandId) || (action == null ? void 0 : action.command_id) || 0) || 0,
          requiresInput: Boolean((action == null ? void 0 : action.requiresInput) || (action == null ? void 0 : action.requires_input) || Array.isArray(action == null ? void 0 : action.fields) && action.fields.length),
          fields: Array.isArray(action == null ? void 0 : action.fields) ? action.fields : []
        }
      };
    }).filter(Boolean).filter((item) => {
      var _a;
      const commandId = Number(((_a = item == null ? void 0 : item.pluginAction) == null ? void 0 : _a.commandId) || 0) || PLUGIN_COMMAND_ID.EXECUTION_BOF;
      return isPluginActionTargetSupported(item == null ? void 0 : item.pluginAction, commandId, targetOs, targetArch);
    });
    if (!children.length) return null;
    return {
      type: "group",
      label: plugin.displayName || plugin.name || plugin.id,
      icon: "🧩",
      children
    };
  }).filter(Boolean);
}
function disableBeaconItems(items, reason) {
  return items.map((item) => {
    if (item.type === "divider") return item;
    if (item.type === "group") {
      return {
        ...item,
        children: item.children.map((child) => ({ ...child, disabled: true, disabledReason: reason }))
      };
    }
    return { ...item, disabled: true, disabledReason: reason };
  });
}
function buildBeaconMenuItems(targetAgent, plugins = []) {
  const targetOs = String((targetAgent == null ? void 0 : targetAgent.os) || "");
  const pluginMenuGroups = targetAgent ? buildPluginMenuGroups(targetAgent, plugins) : [];
  const items = [
    { label: "打开控制台", icon: "⌨️", action: BEACON_ACTION.CONSOLE },
    { label: "查看文件目录", icon: "📁", action: BEACON_ACTION.FILES },
    { label: "进程列表浏览", icon: "🔍", action: BEACON_ACTION.PROCESSES },
    { label: "网络浏览器", icon: "🌐", action: BEACON_ACTION.NETWORK },
    ...pluginMenuGroups.length ? [{ type: "divider" }] : [],
    ...pluginMenuGroups,
    { type: "divider" },
    ...isMenuActionSupportedForOS(BEACON_ACTION.EXEC_BOF, targetOs) ? [{ label: "Execute BOF", icon: "⚡", action: BEACON_ACTION.EXEC_BOF }] : [],
    { type: "divider" },
    { label: "Connect TCP Child", icon: "🔗", action: BEACON_ACTION.CASCADE_CONNECT_TCP },
    { label: "Link SMB Child", icon: "🔗", action: BEACON_ACTION.CASCADE_LINK_SMB },
    { type: "divider" },
    { label: "修改 SleepTime", icon: "⏰", action: BEACON_ACTION.EDIT_SLEEP },
    { label: "退出", icon: "🚪", action: BEACON_ACTION.EXIT },
    { label: "删除会话", icon: "🗑️", action: BEACON_ACTION.DELETE_SESSION, danger: true }
  ];
  if (!targetAgent) {
    return disableBeaconItems(items, "未找到目标 Beacon");
  }
  return items;
}
function shortBeaconId(beaconid) {
  return String(beaconid || "").substring(0, 8) || "unknown";
}
function useBeaconActions() {
  const agentStore = useAgentStore();
  const consoleStore = useConsoleStore();
  const modalStore = useModalStore();
  const pluginStore = usePluginStore();
  function getBeaconMenuItems(beaconid) {
    const targetAgent = agentStore.getAgentById(beaconid);
    return buildBeaconMenuItems(targetAgent, pluginStore.plugins);
  }
  async function executePluginAction(beaconid, item) {
    const targetAgent = agentStore.getAgentById(beaconid);
    const payload = {
      beacon_id: beaconid,
      selected_beacon_id: beaconid,
      plugin_id: item.pluginId,
      plugin_name: item.pluginName,
      action_id: item.pluginAction.id,
      action_label: item.pluginAction.label,
      command_id: item.pluginAction.commandId,
      artifact: item.pluginAction.artifact,
      artifact_data: item.pluginAction.artifactData,
      beacon_os: normalizeBeaconPlatform(targetAgent == null ? void 0 : targetAgent.os),
      beacon_arch: normalizeBeaconArch(targetAgent == null ? void 0 : targetAgent.arch),
      values: {}
    };
    await pluginStore.invokePluginAction(item.pluginId, item.pluginAction.id, payload);
  }
  async function runBeaconAction(beaconid, item) {
    var _a;
    if (!beaconid || (item == null ? void 0 : item.disabled)) return;
    const action = typeof item === "string" ? item : (item == null ? void 0 : item.action) || (item == null ? void 0 : item.type) || "";
    switch (action) {
      case BEACON_ACTION.CONSOLE:
        consoleStore.openConsole(beaconid);
        break;
      case BEACON_ACTION.FILES:
        modalStore.openFileBrowser(beaconid);
        break;
      case BEACON_ACTION.PROCESSES:
        modalStore.openProcessBrowser(beaconid);
        break;
      case BEACON_ACTION.NETWORK:
        modalStore.openNetworkBrowser(beaconid);
        break;
      case BEACON_ACTION.PLUGIN:
        consoleStore.openConsole(beaconid);
        if ((_a = item == null ? void 0 : item.pluginAction) == null ? void 0 : _a.requiresInput) {
          consoleStore.appendToConsole(beaconid, "output", "已打开插件执行窗口。");
          modalStore.openPluginAction({
            pluginId: item.pluginId,
            pluginName: item.pluginName,
            beaconid,
            action: item.pluginAction
          });
        } else {
          try {
            await executePluginAction(beaconid, item);
          } catch (err) {
            console.error("[BeaconActions] 执行插件动作失败:", err);
          }
        }
        break;
      case BEACON_ACTION.EXEC_BOF:
        modalStore.openExecuteModal(beaconid, "bof");
        break;
      case BEACON_ACTION.CASCADE_CONNECT_TCP:
        modalStore.openCascadeConnectModal(beaconid, "tcp");
        break;
      case BEACON_ACTION.CASCADE_LINK_SMB:
        modalStore.openCascadeConnectModal(beaconid, "smb");
        break;
      case BEACON_ACTION.EDIT_SLEEP:
        consoleStore.openConsole(beaconid);
        modalStore.openSleepModal(beaconid);
        break;
      case BEACON_ACTION.EXIT:
        {
          consoleStore.openConsole(beaconid);
          const confirmed = await modalStore.showConfirm({
            title: "退出 Beacon 会话",
            message: `你确定要向会话 [${shortBeaconId(beaconid)}] 下发退出指令吗？
这会直接杀掉目标机器上的 Beacon 进程。`,
            type: "danger"
          });
          if (confirmed) {
            consoleStore.appendToConsole(beaconid, "input", "exit");
            consoleStore.appendToConsole(beaconid, "output", "正在下发退出指令...");
            try {
              await sendExitCommand(beaconid);
              consoleStore.appendToConsole(beaconid, "output", "退出指令已下发。");
            } catch (err) {
              consoleStore.appendToConsole(beaconid, "error", `发送退出指令失败: ${err.message || err}`);
              console.error("发送退出指令失败:", err);
            }
          }
        }
        break;
      case BEACON_ACTION.DELETE_SESSION:
        {
          const confirmed = await modalStore.showConfirm({
            title: "彻底删除会话",
            message: `你确定要注销并删除会话 [${shortBeaconId(beaconid)}] 吗？
此操作将同步清理服务端的缓存数据，且不可撤销。`,
            type: "danger"
          });
          if (confirmed) {
            agentStore.removeBeacon(beaconid).catch(() => {
            });
          }
        }
        break;
    }
  }
  return {
    getBeaconMenuItems,
    runBeaconAction
  };
}
const _hoisted_1 = {
  key: 0,
  class: "divider"
};
const _hoisted_2 = {
  key: 1,
  class: "menu-group"
};
const _hoisted_3 = { class: "menu-item menu-parent" };
const _hoisted_4 = { class: "menu-icon" };
const _hoisted_5 = { class: "menu-label" };
const _hoisted_6 = { class: "submenu" };
const _hoisted_7 = ["title", "onClick"];
const _hoisted_8 = { class: "menu-icon" };
const _hoisted_9 = { class: "submenu-label" };
const _hoisted_10 = ["title", "onClick"];
const _hoisted_11 = { class: "menu-icon" };
const _sfc_main = {
  __name: "BeaconContextMenu",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    beaconid: { type: String, required: true }
  },
  emits: ["close"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const { getBeaconMenuItems, runBeaconAction } = useBeaconActions();
    const menuRef = ref(null);
    const adjustedX = ref(props.x);
    const adjustedY = ref(props.y);
    const menuItems = computed(() => getBeaconMenuItems(props.beaconid));
    async function handleAction(item) {
      if (item == null ? void 0 : item.disabled) return;
      emit("close");
      await runBeaconAction(props.beaconid, item);
    }
    function handleClickOutside() {
      emit("close");
    }
    function handleContextMenuOutside(e) {
      e.preventDefault();
      emit("close");
    }
    onMounted(async () => {
      await nextTick();
      if (menuRef.value) {
        const rect = menuRef.value.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const padding = 10;
        adjustedX.value = props.x + rect.width > vw - padding ? Math.max(padding, props.x - rect.width) : props.x;
        adjustedY.value = props.y + rect.height > vh - padding ? Math.max(padding, props.y - rect.height) : props.y;
      }
      setTimeout(() => {
        document.addEventListener("click", handleClickOutside);
        document.addEventListener("contextmenu", handleContextMenuOutside);
      }, 0);
    });
    onUnmounted(() => {
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("contextmenu", handleContextMenuOutside);
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        createBaseVNode("div", {
          ref_key: "menuRef",
          ref: menuRef,
          class: "context-menu",
          style: normalizeStyle({ left: adjustedX.value + "px", top: adjustedY.value + "px" }),
          onClick: _cache[0] || (_cache[0] = withModifiers(() => {
          }, ["stop"])),
          onContextmenu: _cache[1] || (_cache[1] = withModifiers(() => {
          }, ["stop", "prevent"]))
        }, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(menuItems.value, (item, idx) => {
            return openBlock(), createElementBlock(Fragment, { key: idx }, [
              item.type === "divider" ? (openBlock(), createElementBlock("div", _hoisted_1)) : item.type === "group" ? (openBlock(), createElementBlock("div", _hoisted_2, [
                createBaseVNode("div", _hoisted_3, [
                  createBaseVNode("span", _hoisted_4, toDisplayString(item.icon), 1),
                  createBaseVNode("span", _hoisted_5, toDisplayString(item.label), 1),
                  _cache[2] || (_cache[2] = createBaseVNode("span", { class: "submenu-arrow" }, "›", -1))
                ]),
                createBaseVNode("div", _hoisted_6, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(item.children, (child, childIdx) => {
                    return openBlock(), createElementBlock("div", {
                      key: `${item.label}-${childIdx}`,
                      class: normalizeClass(["menu-item submenu-item", { disabled: child.disabled }]),
                      title: child.disabledReason || child.label,
                      onClick: ($event) => handleAction(child)
                    }, [
                      createBaseVNode("span", _hoisted_8, toDisplayString(child.icon), 1),
                      createBaseVNode("span", _hoisted_9, toDisplayString(child.label), 1)
                    ], 10, _hoisted_7);
                  }), 128))
                ])
              ])) : (openBlock(), createElementBlock("div", {
                key: 2,
                class: normalizeClass(["menu-item", { danger: item.danger, disabled: item.disabled }]),
                title: item.disabledReason || item.label,
                onClick: ($event) => handleAction(item)
              }, [
                createBaseVNode("span", _hoisted_11, toDisplayString(item.icon), 1),
                createBaseVNode("span", null, toDisplayString(item.label), 1)
              ], 10, _hoisted_10))
            ], 64);
          }), 128))
        ], 36)
      ]);
    };
  }
};
const BeaconContextMenu = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-46e6a6bf"]]);
export {
  BeaconContextMenu as B
};
