import { _ as _export_sfc, i as useAgentStore, H as useModalStore, L as useNotificationStore, B as watch, k as onMounted, o as openBlock, c as createElementBlock, b as createBaseVNode, e as createTextVNode, t as toDisplayString, f as createCommentVNode, F as Fragment, p as renderList, q as createBlock, d as withDirectives, M as vModelSelect, v as vModelText, Q as vModelCheckbox, T as Teleport, s as computed, r as ref, A as reactive, g as unref, n as normalizeClass, R as formatTunnelReason } from "./index-CTSqJF0U.js";
import { useTunnelStore } from "./tunnel-BWdkVgeu.js";
const _hoisted_1 = { class: "page-container proxy-pivot-page" };
const _hoisted_2 = { class: "page-header" };
const _hoisted_3 = { class: "header-actions" };
const _hoisted_4 = ["disabled"];
const _hoisted_5 = { class: "content-panel" };
const _hoisted_6 = {
  key: 0,
  class: "state-line error-state"
};
const _hoisted_7 = {
  key: 1,
  class: "state-line"
};
const _hoisted_8 = {
  key: 2,
  class: "table-scroll"
};
const _hoisted_9 = { class: "data-table" };
const _hoisted_10 = { class: "cell-time" };
const _hoisted_11 = ["title"];
const _hoisted_12 = { class: "cell-hostname" };
const _hoisted_13 = { class: "tag-protocol" };
const _hoisted_14 = { class: "cell-port" };
const _hoisted_15 = { class: "cell-port" };
const _hoisted_16 = { class: "cell-count" };
const _hoisted_17 = { class: "cell-size" };
const _hoisted_18 = { class: "cell-size" };
const _hoisted_19 = ["title"];
const _hoisted_20 = { class: "actions-col" };
const _hoisted_21 = ["onClick"];
const _hoisted_22 = ["onClick"];
const _hoisted_23 = ["onClick"];
const _hoisted_24 = ["onClick"];
const _hoisted_25 = ["onClick"];
const _hoisted_26 = ["onClick"];
const _hoisted_27 = { key: 0 };
const _hoisted_28 = {
  key: 0,
  class: "modal-overlay proxy-pivot-modal"
};
const _hoisted_29 = { class: "modal-card" };
const _hoisted_30 = { class: "modal-header" };
const _hoisted_31 = { class: "modal-title" };
const _hoisted_32 = { class: "modal-body" };
const _hoisted_33 = { class: "form-grid" };
const _hoisted_34 = { class: "form-group span-2" };
const _hoisted_35 = ["disabled"];
const _hoisted_36 = ["value"];
const _hoisted_37 = { class: "form-group span-2" };
const _hoisted_38 = ["disabled"];
const _hoisted_39 = ["value"];
const _hoisted_40 = { class: "form-group span-2" };
const _hoisted_41 = ["value"];
const _hoisted_42 = {
  key: 0,
  class: "form-group"
};
const _hoisted_43 = {
  key: 1,
  class: "form-group"
};
const _hoisted_44 = { class: "form-group span-2" };
const _hoisted_45 = { class: "checkbox-row" };
const _hoisted_46 = { class: "form-group" };
const _hoisted_47 = { class: "form-group" };
const _hoisted_48 = { class: "form-group" };
const _hoisted_49 = { class: "form-group" };
const _hoisted_50 = { class: "modal-footer" };
const _hoisted_51 = ["disabled"];
const _hoisted_52 = {
  key: 1,
  class: "modal-overlay proxy-pivot-modal"
};
const _hoisted_53 = { class: "detail-card" };
const _hoisted_54 = { class: "modal-header" };
const _hoisted_55 = { class: "modal-title" };
const _hoisted_56 = { class: "detail-body" };
const _hoisted_57 = {
  key: 0,
  class: "metrics-grid"
};
const _hoisted_58 = { class: "metric-card" };
const _hoisted_59 = { class: "metric-card" };
const _hoisted_60 = { class: "metric-card" };
const _hoisted_61 = { class: "metric-card" };
const _hoisted_62 = { class: "metric-card" };
const _hoisted_63 = {
  key: 1,
  class: "state-line"
};
const _hoisted_64 = {
  key: 2,
  class: "state-line error-state"
};
const _hoisted_65 = {
  key: 3,
  class: "channel-sections"
};
const _hoisted_66 = { class: "section-header" };
const _hoisted_67 = { class: "detail-table" };
const _hoisted_68 = { class: "cell-id" };
const _hoisted_69 = { class: "cell-port" };
const _hoisted_70 = { class: "cell-size" };
const _hoisted_71 = { class: "cell-size" };
const _hoisted_72 = { class: "cell-reason" };
const _hoisted_73 = { key: 0 };
const _hoisted_74 = {
  colspan: "6",
  class: "empty-cell"
};
const _hoisted_75 = { class: "modal-footer" };
const _hoisted_76 = ["disabled"];
const _sfc_main = {
  __name: "ProxyPivotPage",
  setup(__props) {
    const agentStore = useAgentStore();
    const modalStore = useModalStore();
    const notificationStore = useNotificationStore();
    const tunnelStore = useTunnelStore();
    const selectedBeaconId = ref("");
    const createVisible = ref(false);
    const detailVisible = ref(false);
    const activeTunnelId = ref("");
    const dialogMode = ref("create");
    const editingTunnelId = ref("");
    const createSubmitting = ref(false);
    const createForm = reactive({
      beaconId: "",
      mode: "socks5",
      bindHost: "127.0.0.1",
      bindPort: 1080,
      remoteHost: "",
      remotePort: 0,
      socksAuthMode: "no_auth",
      socksUsername: "",
      socksPassword: "",
      socksUdpAssociate: false
    });
    const tunnelModes = [
      { value: "socks5", label: "SOCKS5", description: "创建本地 SOCKS5 代理" },
      { value: "port_forward", label: "端口转发", description: "创建本地到目标主机的转发" },
      { value: "reverse_port_map", label: "反向端口映射", description: "由 Beacon 侧回连并映射到本地端口" },
      { value: "http_proxy", label: "HTTP 代理", description: "预留模式，前端仅作展示与兼容" },
      { value: "udp_proxy", label: "UDP 代理", description: "预留模式，前端仅作展示与兼容" }
    ];
    const socksAuthModes = [
      { value: "no_auth", label: "无需认证", description: "SOCKS5 不启用用户名/密码" },
      { value: "username_password", label: "用户名 / 密码", description: "SOCKS5 需要用户名和密码" }
    ];
    const tunnels = computed(() => tunnelStore.tunnels);
    const loading = computed(() => tunnelStore.loading);
    const errorMessage = computed(() => tunnelStore.error);
    const activeChannels = computed(() => tunnelStore.getChannels(activeTunnelId.value));
    const liveChannels = computed(() => activeChannels.value.filter((channel) => ["pending", "active"].includes(String(channel.status || "").toLowerCase())));
    const historyChannels = computed(() => activeChannels.value.filter((channel) => !["pending", "active"].includes(String(channel.status || "").toLowerCase())));
    const activeChannelLoading = computed(() => tunnelStore.channelsLoading[activeTunnelId.value] || false);
    const activeChannelError = computed(() => tunnelStore.channelsError[activeTunnelId.value] || "");
    const activeTunnel = computed(() => tunnels.value.find((item) => item.tunnelId === activeTunnelId.value) || null);
    const recyclableChannelCount = computed(() => historyChannels.value.filter((channel) => ["closed", "failed", "timeout"].includes(String(channel.status || "").toLowerCase())).length);
    const usesSocks5Mode = computed(() => String(createForm.mode || "").toLowerCase() === "socks5");
    const usesSocksUsernamePassword = computed(() => String(createForm.socksAuthMode || "").toLowerCase() === "username_password");
    const isEditMode = computed(() => dialogMode.value === "edit");
    const tunnelDialogTitle = computed(() => isEditMode.value ? "编辑网络隧道" : "新建网络隧道");
    const tunnelDialogDescription = computed(() => isEditMode.value ? "修改已暂停 Tunnel 的监听与认证参数，保存后可继续恢复" : "通过 Beacon 创建统一 Tunnel");
    const tunnelDialogSubmitText = computed(() => {
      if (createSubmitting.value) return isEditMode.value ? "保存中..." : "创建中...";
      return isEditMode.value ? "保存修改" : "创建隧道";
    });
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
    watch(() => createVisible.value, (visible) => {
      if (visible && !createForm.beaconId && selectedBeaconId.value) {
        createForm.beaconId = selectedBeaconId.value;
      }
    });
    watch(() => createForm.mode, (mode) => {
      if (dialogMode.value !== "create") return;
      const normalized = String(mode || "").toLowerCase();
      Object.assign(createForm, getModeDefaults(normalized));
    });
    function shortId(value) {
      if (!value) return "-";
      return String(value).substring(0, 8);
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
    function formatBind(tunnel) {
      return `${tunnel.bindHost || "127.0.0.1"}:${tunnel.bindPort || "-"}`;
    }
    function formatTarget(tunnel) {
      if (requiresRemoteTarget(tunnel.mode || tunnel.type)) {
        if (!tunnel.remoteHost && !tunnel.remotePort) return "-";
        return `${tunnel.remoteHost || "-"}:${tunnel.remotePort || "-"}`;
      }
      return "-";
    }
    function formatTunnelType(type) {
      const normalized = String(type || "").toLowerCase();
      if (normalized === "socks5") return "SOCKS5";
      if (normalized === "port_forward") return "PORT FWD";
      if (normalized === "reverse_port_map") return "REVERSE MAP";
      if (normalized === "http_proxy") return "HTTP PROXY";
      if (normalized === "udp_proxy") return "UDP PROXY";
      return normalized || "-";
    }
    function statusClass(status) {
      const value = String(status || "").toLowerCase();
      if (["running", "listening", "active", "online"].includes(value)) return "online";
      if (["paused", "pause", "pending", "timeout", "closed", "stopped"].includes(value)) return "warn";
      if (["error", "failed"].includes(value)) return "danger";
      return "active";
    }
    function statusLabel(status) {
      const value = String(status || "").toLowerCase();
      if (["running", "listening", "active", "online"].includes(value)) return "运行中";
      if (value === "pending") return "待处理";
      if (value === "timeout") return "已超时";
      if (["paused", "pause"].includes(value)) return "已暂停";
      if (value === "closed") return "已关闭";
      if (value === "stopped") return "已停止";
      if (value === "error" || value === "failed") return "异常";
      return value || "-";
    }
    function findAgent(beaconId) {
      const id = String(beaconId || "");
      return availableAgents.value.find((agent) => agent.beaconid === id || agent.beaconid.startsWith(id) || id.startsWith(agent.beaconid)) || null;
    }
    function agentLabel(beaconId) {
      const agent = findAgent(beaconId);
      if (!agent) return shortId(beaconId);
      return `${agent.hostname || "Unknown"} · ${shortId(agent.beaconid)}`;
    }
    function isRunningTunnel(tunnel) {
      const value = String((tunnel == null ? void 0 : tunnel.status) || "").toLowerCase();
      return ["running", "listening", "active", "online"].includes(value);
    }
    function isPausedTunnel(tunnel) {
      const value = String((tunnel == null ? void 0 : tunnel.status) || "").toLowerCase();
      return ["paused", "pause"].includes(value);
    }
    function getModeDefaults(mode) {
      const normalized = String(mode || "").toLowerCase();
      if (normalized === "port_forward") {
        return { bindHost: "0.0.0.0", bindPort: 8888, remoteHost: "127.0.0.1", remotePort: 3389, socksAuthMode: "no_auth", socksUsername: "", socksPassword: "", socksUdpAssociate: false };
      }
      if (normalized === "reverse_port_map") {
        return { bindHost: "0.0.0.0", bindPort: 13389, remoteHost: "127.0.0.1", remotePort: 3389, socksAuthMode: "no_auth", socksUsername: "", socksPassword: "", socksUdpAssociate: false };
      }
      if (normalized === "http_proxy") {
        return { bindHost: "127.0.0.1", bindPort: 8080, remoteHost: "", remotePort: 0, socksAuthMode: "no_auth", socksUsername: "", socksPassword: "", socksUdpAssociate: false };
      }
      if (normalized === "udp_proxy") {
        return { bindHost: "127.0.0.1", bindPort: 1080, remoteHost: "", remotePort: 0, socksAuthMode: "no_auth", socksUsername: "", socksPassword: "", socksUdpAssociate: false };
      }
      return { bindHost: "127.0.0.1", bindPort: 1080, remoteHost: "", remotePort: 0, socksAuthMode: "no_auth", socksUsername: "", socksPassword: "", socksUdpAssociate: false };
    }
    function resetTunnelForm(mode = "socks5", beaconId = "") {
      const normalizedMode = String(mode || "socks5").toLowerCase();
      Object.assign(createForm, {
        beaconId,
        mode: normalizedMode,
        ...getModeDefaults(normalizedMode)
      });
    }
    function fillTunnelFormFromTunnel(tunnel) {
      var _a;
      const mode = String((tunnel == null ? void 0 : tunnel.mode) || (tunnel == null ? void 0 : tunnel.type) || "socks5").toLowerCase();
      Object.assign(createForm, {
        beaconId: String((tunnel == null ? void 0 : tunnel.beaconId) || ""),
        mode,
        bindHost: (tunnel == null ? void 0 : tunnel.bindHost) || (mode === "socks5" ? "127.0.0.1" : "0.0.0.0"),
        bindPort: Number((tunnel == null ? void 0 : tunnel.bindPort) || 0),
        remoteHost: (tunnel == null ? void 0 : tunnel.remoteHost) || "",
        remotePort: Number((tunnel == null ? void 0 : tunnel.remotePort) || 0),
        socksAuthMode: String((tunnel == null ? void 0 : tunnel.socksAuthMode) || "no_auth").toLowerCase(),
        socksUsername: String((tunnel == null ? void 0 : tunnel.socksUsername) || ((_a = tunnel == null ? void 0 : tunnel.raw) == null ? void 0 : _a.socks_username) || "").trim(),
        socksPassword: "",
        socksUdpAssociate: Boolean(tunnel == null ? void 0 : tunnel.socksUdpAssociate)
      });
    }
    function requiresRemoteTarget(mode) {
      const normalized = String(mode || "").toLowerCase();
      return ["port_forward", "reverse_port_map"].includes(normalized);
    }
    function openCreateModal(mode = "socks5") {
      dialogMode.value = "create";
      editingTunnelId.value = "";
      resetTunnelForm(mode, selectedBeaconId.value || "");
      createVisible.value = true;
    }
    function openEditModal(tunnel) {
      if (!(tunnel == null ? void 0 : tunnel.tunnelId)) return;
      if (!isPausedTunnel(tunnel)) {
        notificationStore.warn("仅暂停状态的 Tunnel 可编辑");
        return;
      }
      dialogMode.value = "edit";
      editingTunnelId.value = String(tunnel.tunnelId);
      fillTunnelFormFromTunnel(tunnel);
      createVisible.value = true;
    }
    function closeTunnelDialog() {
      createVisible.value = false;
      dialogMode.value = "create";
      editingTunnelId.value = "";
      resetTunnelForm("socks5", selectedBeaconId.value || "");
    }
    async function refreshTunnels() {
      try {
        await tunnelStore.fetchTunnels();
      } catch (err) {
        console.error("[ProxyPivotPage] 获取 Tunnel 列表失败:", err);
      }
    }
    async function submitCreateTunnel() {
      if (!createForm.beaconId) {
        notificationStore.warn("请先选择 Beacon");
        return;
      }
      const bindPort = Number(createForm.bindPort);
      if (!Number.isInteger(bindPort) || bindPort <= 0 || bindPort > 65535) {
        notificationStore.warn("绑定端口必须是 1 到 65535 之间的整数");
        return;
      }
      const normalizedMode = String(createForm.mode || "").toLowerCase();
      const allowedModes = ["socks5", "port_forward", "reverse_port_map", "http_proxy", "udp_proxy"];
      if (!allowedModes.includes(normalizedMode)) {
        notificationStore.warn("请选择有效的 Tunnel 模式");
        return;
      }
      if (isEditMode.value && !editingTunnelId.value) {
        notificationStore.warn("Tunnel 编辑目标不存在");
        return;
      }
      createSubmitting.value = true;
      try {
        const payload = {
          bind_host: createForm.bindHost || (normalizedMode === "socks5" ? "127.0.0.1" : "0.0.0.0"),
          bind_port: bindPort
        };
        if (normalizedMode === "socks5") {
          const socksAuthMode = String(createForm.socksAuthMode || "").toLowerCase();
          if (!["no_auth", "username_password"].includes(socksAuthMode)) {
            notificationStore.warn("请选择有效的 SOCKS5 认证模式");
            return;
          }
          payload.socks_auth_mode = socksAuthMode;
          payload.socks_udp_associate = Boolean(createForm.socksUdpAssociate);
          if (socksAuthMode === "username_password") {
            const username = String(createForm.socksUsername || "").trim();
            const password = String(createForm.socksPassword || "").trim();
            if (!username) {
              notificationStore.warn("请填写 SOCKS5 用户名");
              return;
            }
            if (!password) {
              notificationStore.warn("请填写 SOCKS5 密码");
              return;
            }
            payload.socks_username = username;
            payload.socks_password = password;
          }
        }
        if (requiresRemoteTarget(normalizedMode)) {
          const remotePort = Number(createForm.remotePort);
          if (!createForm.remoteHost) {
            notificationStore.warn("请填写远程主机");
            return;
          }
          if (!Number.isInteger(remotePort) || remotePort <= 0 || remotePort > 65535) {
            notificationStore.warn("远程端口必须是 1 到 65535 之间的整数");
            return;
          }
          payload.remote_host = createForm.remoteHost;
          payload.remote_port = remotePort;
        }
        if (isEditMode.value) {
          await tunnelStore.updateTunnel(editingTunnelId.value, payload);
          notificationStore.success("Tunnel 已更新");
        } else {
          payload.beacon_id = createForm.beaconId;
          payload.mode = normalizedMode;
          if (typeof tunnelStore.createTunnel !== "function") {
            throw new Error("Tunnel 创建接口不可用，请刷新页面后重试");
          }
          await tunnelStore.createTunnel(payload);
          notificationStore.success("Tunnel 已创建");
        }
        createVisible.value = false;
        editingTunnelId.value = "";
        await refreshTunnels();
      } catch (err) {
        console.error(isEditMode.value ? "[ProxyPivotPage] 更新 Tunnel 失败:" : "[ProxyPivotPage] 创建 Tunnel 失败:", err);
      } finally {
        createSubmitting.value = false;
      }
    }
    async function openChannels(tunnel) {
      if (!(tunnel == null ? void 0 : tunnel.tunnelId)) return;
      activeTunnelId.value = tunnel.tunnelId;
      detailVisible.value = true;
      try {
        await tunnelStore.fetchChannels(tunnel.tunnelId);
      } catch (err) {
        console.error("[ProxyPivotPage] 获取 Tunnel 连接失败:", err);
      }
    }
    function closeChannels() {
      detailVisible.value = false;
      activeTunnelId.value = "";
    }
    async function pauseTunnel(tunnel) {
      if (!(tunnel == null ? void 0 : tunnel.tunnelId)) return;
      const confirmed = await modalStore.showConfirm({
        title: "暂停 Tunnel",
        message: `确定要暂停 ${formatTunnelType(tunnel.mode || tunnel.type)} (${formatBind(tunnel)}) 吗？`,
        type: "warning"
      });
      if (!confirmed) return;
      try {
        await tunnelStore.pauseTunnel(tunnel.tunnelId);
        notificationStore.success("Tunnel 已暂停");
        await refreshTunnels();
      } catch (err) {
        console.error("[ProxyPivotPage] 暂停 Tunnel 失败:", err);
      }
    }
    async function stopTunnel(tunnel) {
      if (!(tunnel == null ? void 0 : tunnel.tunnelId)) return;
      const confirmed = await modalStore.showConfirm({
        title: "停止 Tunnel",
        message: `确定要停止 ${formatTunnelType(tunnel.mode || tunnel.type)} (${formatBind(tunnel)}) 吗？
这会关闭本地监听并保留记录，后续可清除。`,
        type: "warning"
      });
      if (!confirmed) return;
      try {
        await tunnelStore.stopTunnel(tunnel.tunnelId);
        notificationStore.success("Tunnel 已停止");
        await refreshTunnels();
      } catch (err) {
        console.error("[ProxyPivotPage] 停止 Tunnel 失败:", err);
      }
    }
    async function resumeTunnel(tunnel) {
      if (!(tunnel == null ? void 0 : tunnel.tunnelId)) return;
      const confirmed = await modalStore.showConfirm({
        title: "恢复 Tunnel",
        message: `确定要恢复 ${formatTunnelType(tunnel.mode || tunnel.type)} (${formatBind(tunnel)}) 吗？`,
        type: "warning"
      });
      if (!confirmed) return;
      try {
        await tunnelStore.resumeTunnel(tunnel.tunnelId);
        notificationStore.success("Tunnel 已恢复");
        await refreshTunnels();
      } catch (err) {
        console.error("[ProxyPivotPage] 恢复 Tunnel 失败:", err);
      }
    }
    async function clearTunnel(tunnel) {
      if (!(tunnel == null ? void 0 : tunnel.tunnelId)) return;
      const confirmed = await modalStore.showConfirm({
        title: "清除 Tunnel",
        message: `确定要清除 ${formatTunnelType(tunnel.mode || tunnel.type)} (${formatBind(tunnel)}) 吗？
这会删除该 Tunnel 及其连接记录。`,
        type: "warning"
      });
      if (!confirmed) return;
      try {
        await tunnelStore.clearTunnel(tunnel.tunnelId);
        notificationStore.success("Tunnel 已清除");
        if (detailVisible.value && activeTunnelId.value === tunnel.tunnelId) {
          closeChannels();
        }
        await refreshTunnels();
      } catch (err) {
        console.error("[ProxyPivotPage] 清除 Tunnel 失败:", err);
      }
    }
    async function recycleChannels(tunnel) {
      if (!(tunnel == null ? void 0 : tunnel.tunnelId)) return;
      const count = recyclableChannelCount.value;
      if (!count) {
        notificationStore.info("当前没有可回收的终态 channel");
        return;
      }
      try {
        await tunnelStore.recycleTunnelChannels(tunnel.tunnelId, count);
        notificationStore.success(`已回收 ${count} 个终态 channel`);
        await refreshTunnels();
      } catch (err) {
        console.error("[ProxyPivotPage] 回收 channel 失败:", err);
      }
    }
    const channelSections = computed(() => [
      {
        key: "live",
        title: "活跃通道",
        items: liveChannels.value,
        emptyText: "暂无活跃通道"
      },
      {
        key: "history",
        title: "历史通道",
        items: historyChannels.value,
        emptyText: "暂无历史通道"
      }
    ]);
    function channelDisplayValue(channel) {
      const target = channel.targetAddress || [channel.remoteHost, channel.remotePort].filter(Boolean).join(":") || [channel.localHost, channel.localPort].filter(Boolean).join(":") || "-";
      return {
        target,
        reason: formatTunnelReason(channel.reason) || "-"
      };
    }
    function formatBytes(bytes) {
      const value = Number(bytes || 0);
      if (value === 0) return "0 B";
      const units = ["B", "KB", "MB", "GB", "TB"];
      const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
      return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
    }
    function formatCount(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return "-";
      return String(Math.max(0, Math.trunc(numeric)));
    }
    function displayCount(...values) {
      for (const value of values) {
        const formatted = formatCount(value);
        if (formatted !== "-") return formatted;
      }
      return "-";
    }
    function formatLatency(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) return "-";
      return `${numeric} ms`;
    }
    onMounted(refreshTunnels);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", _hoisted_2, [
          _cache[14] || (_cache[14] = createBaseVNode("div", { class: "header-left" }, [
            createBaseVNode("h1", { class: "page-title" }, "代理与穿透"),
            createBaseVNode("p", { class: "page-subtitle" }, "管理基于 Beacon 建立的统一 Tunnel")
          ], -1)),
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("button", {
              class: "btn btn-secondary",
              disabled: loading.value,
              onClick: refreshTunnels
            }, [
              _cache[12] || (_cache[12] = createBaseVNode("span", { class: "icon" }, "↻", -1)),
              createTextVNode(" " + toDisplayString(loading.value ? "刷新中..." : "刷新列表"), 1)
            ], 8, _hoisted_4),
            createBaseVNode("button", {
              class: "btn btn-primary",
              onClick: _cache[0] || (_cache[0] = ($event) => openCreateModal("socks5"))
            }, [..._cache[13] || (_cache[13] = [
              createBaseVNode("span", { class: "icon" }, "➕", -1),
              createTextVNode(" 新建 Tunnel ", -1)
            ])])
          ])
        ]),
        createBaseVNode("div", _hoisted_5, [
          errorMessage.value ? (openBlock(), createElementBlock("div", _hoisted_6, toDisplayString(errorMessage.value), 1)) : createCommentVNode("", true),
          loading.value && tunnels.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_7, " 正在读取 Tunnel 列表... ")) : (openBlock(), createElementBlock("div", _hoisted_8, [
            createBaseVNode("table", _hoisted_9, [
              _cache[16] || (_cache[16] = createBaseVNode("thead", null, [
                createBaseVNode("tr", null, [
                  createBaseVNode("th", null, "开启时间"),
                  createBaseVNode("th", null, "Beacon"),
                  createBaseVNode("th", null, "主机名"),
                  createBaseVNode("th", null, "类型"),
                  createBaseVNode("th", null, "绑定地址"),
                  createBaseVNode("th", null, "远程地址"),
                  createBaseVNode("th", null, "活跃连接"),
                  createBaseVNode("th", null, "流入"),
                  createBaseVNode("th", null, "流出"),
                  createBaseVNode("th", null, "状态"),
                  createBaseVNode("th", { class: "actions-col" }, "操作")
                ])
              ], -1)),
              createBaseVNode("tbody", null, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(tunnels.value, (tunnel) => {
                  var _a;
                  return openBlock(), createElementBlock("tr", {
                    key: tunnel.tunnelId || `${tunnel.beaconId}-${tunnel.bindPort}`
                  }, [
                    createBaseVNode("td", _hoisted_10, toDisplayString(formatTime(tunnel.createdAt || tunnel.updatedAt)), 1),
                    createBaseVNode("td", {
                      class: "cell-id",
                      title: tunnel.beaconId
                    }, toDisplayString(shortId(tunnel.beaconId)), 9, _hoisted_11),
                    createBaseVNode("td", _hoisted_12, toDisplayString(((_a = findAgent(tunnel.beaconId)) == null ? void 0 : _a.hostname) || "未知"), 1),
                    createBaseVNode("td", null, [
                      createBaseVNode("span", _hoisted_13, toDisplayString(formatTunnelType(tunnel.mode || tunnel.type)), 1)
                    ]),
                    createBaseVNode("td", _hoisted_14, toDisplayString(formatBind(tunnel)), 1),
                    createBaseVNode("td", _hoisted_15, toDisplayString(formatTarget(tunnel)), 1),
                    createBaseVNode("td", _hoisted_16, toDisplayString(displayCount(tunnel.activeChannels, tunnel.channelCount, unref(tunnelStore).getChannels(tunnel.tunnelId).length)), 1),
                    createBaseVNode("td", _hoisted_17, toDisplayString(formatBytes(tunnel.bytesIn)), 1),
                    createBaseVNode("td", _hoisted_18, toDisplayString(formatBytes(tunnel.bytesOut)), 1),
                    createBaseVNode("td", null, [
                      createBaseVNode("span", {
                        class: normalizeClass(["status-tag", statusClass(tunnel.status)]),
                        title: tunnel.errorMessage || ""
                      }, toDisplayString(statusLabel(tunnel.status)), 11, _hoisted_19)
                    ]),
                    createBaseVNode("td", _hoisted_20, [
                      createBaseVNode("button", {
                        class: "action-btn",
                        onClick: ($event) => openChannels(tunnel)
                      }, "连接", 8, _hoisted_21),
                      isPausedTunnel(tunnel) ? (openBlock(), createElementBlock("button", {
                        key: 0,
                        class: "action-btn",
                        onClick: ($event) => openEditModal(tunnel)
                      }, "编辑", 8, _hoisted_22)) : createCommentVNode("", true),
                      isRunningTunnel(tunnel) ? (openBlock(), createElementBlock("button", {
                        key: 1,
                        class: "action-btn",
                        onClick: ($event) => pauseTunnel(tunnel)
                      }, "暂停", 8, _hoisted_23)) : isPausedTunnel(tunnel) ? (openBlock(), createElementBlock("button", {
                        key: 2,
                        class: "action-btn",
                        onClick: ($event) => resumeTunnel(tunnel)
                      }, "恢复", 8, _hoisted_24)) : createCommentVNode("", true),
                      isRunningTunnel(tunnel) || isPausedTunnel(tunnel) ? (openBlock(), createElementBlock("button", {
                        key: 3,
                        class: "action-btn",
                        onClick: ($event) => stopTunnel(tunnel)
                      }, "停止", 8, _hoisted_25)) : createCommentVNode("", true),
                      createBaseVNode("button", {
                        class: "action-btn danger",
                        onClick: ($event) => clearTunnel(tunnel)
                      }, "清除", 8, _hoisted_26)
                    ])
                  ]);
                }), 128)),
                tunnels.value.length === 0 && !loading.value ? (openBlock(), createElementBlock("tr", _hoisted_27, [..._cache[15] || (_cache[15] = [
                  createBaseVNode("td", {
                    colspan: "11",
                    class: "empty-cell"
                  }, "暂无活跃的代理隧道", -1)
                ])])) : createCommentVNode("", true)
              ])
            ])
          ]))
        ]),
        (openBlock(), createBlock(Teleport, { to: "body" }, [
          createVisible.value ? (openBlock(), createElementBlock("div", _hoisted_28, [
            createBaseVNode("div", _hoisted_29, [
              createBaseVNode("header", _hoisted_30, [
                createBaseVNode("div", _hoisted_31, [
                  _cache[17] || (_cache[17] = createBaseVNode("span", { class: "icon" }, "🧩", -1)),
                  createBaseVNode("div", null, [
                    createBaseVNode("h3", null, toDisplayString(tunnelDialogTitle.value), 1),
                    createBaseVNode("span", null, toDisplayString(tunnelDialogDescription.value), 1)
                  ])
                ]),
                createBaseVNode("button", {
                  class: "close-btn",
                  onClick: closeTunnelDialog
                }, "×")
              ]),
              createBaseVNode("div", _hoisted_32, [
                createBaseVNode("div", _hoisted_33, [
                  createBaseVNode("div", _hoisted_34, [
                    _cache[19] || (_cache[19] = createBaseVNode("label", null, "Beacon", -1)),
                    withDirectives(createBaseVNode("select", {
                      "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => createForm.beaconId = $event),
                      class: "form-control",
                      disabled: isEditMode.value
                    }, [
                      _cache[18] || (_cache[18] = createBaseVNode("option", {
                        value: "",
                        disabled: ""
                      }, "请选择 Beacon", -1)),
                      (openBlock(true), createElementBlock(Fragment, null, renderList(availableAgents.value, (agent) => {
                        return openBlock(), createElementBlock("option", {
                          key: agent.beaconid,
                          value: agent.beaconid
                        }, toDisplayString(agentLabel(agent.beaconid)), 9, _hoisted_36);
                      }), 128))
                    ], 8, _hoisted_35), [
                      [vModelSelect, createForm.beaconId]
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_37, [
                    _cache[20] || (_cache[20] = createBaseVNode("label", null, "模式", -1)),
                    withDirectives(createBaseVNode("select", {
                      "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => createForm.mode = $event),
                      class: "form-control",
                      disabled: isEditMode.value
                    }, [
                      (openBlock(), createElementBlock(Fragment, null, renderList(tunnelModes, (item) => {
                        return createBaseVNode("option", {
                          key: item.value,
                          value: item.value
                        }, toDisplayString(item.label) + " - " + toDisplayString(item.description), 9, _hoisted_39);
                      }), 64))
                    ], 8, _hoisted_38), [
                      [vModelSelect, createForm.mode]
                    ])
                  ]),
                  usesSocks5Mode.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                    createBaseVNode("div", _hoisted_40, [
                      _cache[21] || (_cache[21] = createBaseVNode("label", null, "SOCKS5 认证模式 *", -1)),
                      withDirectives(createBaseVNode("select", {
                        "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => createForm.socksAuthMode = $event),
                        class: "form-control"
                      }, [
                        (openBlock(), createElementBlock(Fragment, null, renderList(socksAuthModes, (item) => {
                          return createBaseVNode("option", {
                            key: item.value,
                            value: item.value
                          }, toDisplayString(item.label) + " - " + toDisplayString(item.description), 9, _hoisted_41);
                        }), 64))
                      ], 512), [
                        [vModelSelect, createForm.socksAuthMode]
                      ])
                    ]),
                    usesSocksUsernamePassword.value ? (openBlock(), createElementBlock("div", _hoisted_42, [
                      _cache[22] || (_cache[22] = createBaseVNode("label", null, "SOCKS5 用户名 *", -1)),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => createForm.socksUsername = $event),
                        type: "text",
                        class: "form-control",
                        placeholder: "operator"
                      }, null, 512), [
                        [vModelText, createForm.socksUsername]
                      ])
                    ])) : createCommentVNode("", true),
                    usesSocksUsernamePassword.value ? (openBlock(), createElementBlock("div", _hoisted_43, [
                      _cache[23] || (_cache[23] = createBaseVNode("label", null, "SOCKS5 密码 *", -1)),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => createForm.socksPassword = $event),
                        type: "password",
                        class: "form-control",
                        placeholder: "change-me"
                      }, null, 512), [
                        [vModelText, createForm.socksPassword]
                      ])
                    ])) : createCommentVNode("", true),
                    createBaseVNode("div", _hoisted_44, [
                      _cache[25] || (_cache[25] = createBaseVNode("label", null, "SOCKS5 UDP ASSOCIATE *", -1)),
                      createBaseVNode("label", _hoisted_45, [
                        withDirectives(createBaseVNode("input", {
                          "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => createForm.socksUdpAssociate = $event),
                          type: "checkbox"
                        }, null, 512), [
                          [vModelCheckbox, createForm.socksUdpAssociate]
                        ]),
                        _cache[24] || (_cache[24] = createBaseVNode("span", null, "启用 UDP ASSOCIATE", -1))
                      ])
                    ])
                  ], 64)) : createCommentVNode("", true),
                  createBaseVNode("div", _hoisted_46, [
                    _cache[26] || (_cache[26] = createBaseVNode("label", null, "绑定地址", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => createForm.bindHost = $event),
                      type: "text",
                      class: "form-control",
                      placeholder: "127.0.0.1"
                    }, null, 512), [
                      [vModelText, createForm.bindHost]
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_47, [
                    _cache[27] || (_cache[27] = createBaseVNode("label", null, "绑定端口", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => createForm.bindPort = $event),
                      type: "number",
                      min: "1",
                      max: "65535",
                      step: "1",
                      class: "form-control"
                    }, null, 512), [
                      [
                        vModelText,
                        createForm.bindPort,
                        void 0,
                        { number: true }
                      ]
                    ])
                  ]),
                  requiresRemoteTarget(createForm.mode) ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                    createBaseVNode("div", _hoisted_48, [
                      _cache[28] || (_cache[28] = createBaseVNode("label", null, "远程主机", -1)),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => createForm.remoteHost = $event),
                        type: "text",
                        class: "form-control",
                        placeholder: "127.0.0.1"
                      }, null, 512), [
                        [vModelText, createForm.remoteHost]
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_49, [
                      _cache[29] || (_cache[29] = createBaseVNode("label", null, "远程端口", -1)),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => createForm.remotePort = $event),
                        type: "number",
                        min: "1",
                        max: "65535",
                        step: "1",
                        class: "form-control"
                      }, null, 512), [
                        [
                          vModelText,
                          createForm.remotePort,
                          void 0,
                          { number: true }
                        ]
                      ])
                    ])
                  ], 64)) : createCommentVNode("", true)
                ])
              ]),
              createBaseVNode("footer", _hoisted_50, [
                createBaseVNode("button", {
                  class: "btn btn-ghost",
                  onClick: closeTunnelDialog
                }, "取消"),
                createBaseVNode("button", {
                  class: "btn btn-primary",
                  disabled: createSubmitting.value,
                  onClick: submitCreateTunnel
                }, toDisplayString(tunnelDialogSubmitText.value), 9, _hoisted_51)
              ])
            ])
          ])) : createCommentVNode("", true),
          detailVisible.value ? (openBlock(), createElementBlock("div", _hoisted_52, [
            createBaseVNode("div", _hoisted_53, [
              createBaseVNode("header", _hoisted_54, [
                createBaseVNode("div", _hoisted_55, [
                  _cache[31] || (_cache[31] = createBaseVNode("span", { class: "icon" }, "🔗", -1)),
                  createBaseVNode("div", null, [
                    _cache[30] || (_cache[30] = createBaseVNode("h3", null, "Tunnel 连接", -1)),
                    createBaseVNode("span", null, toDisplayString(activeTunnel.value ? `${formatTunnelType(activeTunnel.value.mode || activeTunnel.value.type)} · ${formatBind(activeTunnel.value)}` : "连接明细"), 1)
                  ])
                ]),
                createBaseVNode("button", {
                  class: "close-btn",
                  onClick: closeChannels
                }, "×")
              ]),
              createBaseVNode("div", _hoisted_56, [
                activeTunnel.value ? (openBlock(), createElementBlock("div", _hoisted_57, [
                  createBaseVNode("div", _hoisted_58, [
                    _cache[32] || (_cache[32] = createBaseVNode("span", null, "活跃连接", -1)),
                    createBaseVNode("strong", null, toDisplayString(displayCount(activeTunnel.value.activeChannels, activeTunnel.value.channelCount)), 1)
                  ]),
                  createBaseVNode("div", _hoisted_59, [
                    _cache[33] || (_cache[33] = createBaseVNode("span", null, "队列深度", -1)),
                    createBaseVNode("strong", null, toDisplayString(formatCount(activeTunnel.value.queueDepth)), 1)
                  ]),
                  createBaseVNode("div", _hoisted_60, [
                    _cache[34] || (_cache[34] = createBaseVNode("span", null, "丢弃次数", -1)),
                    createBaseVNode("strong", null, toDisplayString(formatCount(activeTunnel.value.dropCount)), 1)
                  ]),
                  createBaseVNode("div", _hoisted_61, [
                    _cache[35] || (_cache[35] = createBaseVNode("span", null, "超时次数", -1)),
                    createBaseVNode("strong", null, toDisplayString(formatCount(activeTunnel.value.timeoutCount)), 1)
                  ]),
                  createBaseVNode("div", _hoisted_62, [
                    _cache[36] || (_cache[36] = createBaseVNode("span", null, "首次响应", -1)),
                    createBaseVNode("strong", null, toDisplayString(formatLatency(activeTunnel.value.openLatencyMs)), 1)
                  ])
                ])) : createCommentVNode("", true),
                activeChannelLoading.value ? (openBlock(), createElementBlock("div", _hoisted_63, "正在读取连接列表...")) : activeChannelError.value ? (openBlock(), createElementBlock("div", _hoisted_64, toDisplayString(activeChannelError.value), 1)) : (openBlock(), createElementBlock("div", _hoisted_65, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(channelSections.value, (section) => {
                    return openBlock(), createElementBlock("section", {
                      key: section.key,
                      class: "channel-section"
                    }, [
                      createBaseVNode("div", _hoisted_66, [
                        createBaseVNode("h4", null, toDisplayString(section.title), 1),
                        createBaseVNode("span", null, toDisplayString(section.items.length), 1)
                      ]),
                      createBaseVNode("table", _hoisted_67, [
                        _cache[37] || (_cache[37] = createBaseVNode("thead", null, [
                          createBaseVNode("tr", null, [
                            createBaseVNode("th", null, "连接 ID"),
                            createBaseVNode("th", null, "目标"),
                            createBaseVNode("th", null, "流入"),
                            createBaseVNode("th", null, "流出"),
                            createBaseVNode("th", null, "状态"),
                            createBaseVNode("th", null, "原因")
                          ])
                        ], -1)),
                        createBaseVNode("tbody", null, [
                          (openBlock(true), createElementBlock(Fragment, null, renderList(section.items, (channel) => {
                            return openBlock(), createElementBlock("tr", {
                              key: channel.channelId || `${channel.localHost}-${channel.localPort}-${channel.remoteHost}-${channel.remotePort}`
                            }, [
                              createBaseVNode("td", _hoisted_68, toDisplayString(channel.channelId || "-"), 1),
                              createBaseVNode("td", _hoisted_69, toDisplayString(channelDisplayValue(channel).target), 1),
                              createBaseVNode("td", _hoisted_70, toDisplayString(formatBytes(channel.bytesIn)), 1),
                              createBaseVNode("td", _hoisted_71, toDisplayString(formatBytes(channel.bytesOut)), 1),
                              createBaseVNode("td", null, [
                                createBaseVNode("span", {
                                  class: normalizeClass(["status-tag", statusClass(channel.status)])
                                }, toDisplayString(statusLabel(channel.status)), 3)
                              ]),
                              createBaseVNode("td", _hoisted_72, toDisplayString(channelDisplayValue(channel).reason), 1)
                            ]);
                          }), 128)),
                          section.items.length === 0 ? (openBlock(), createElementBlock("tr", _hoisted_73, [
                            createBaseVNode("td", _hoisted_74, toDisplayString(section.emptyText), 1)
                          ])) : createCommentVNode("", true)
                        ])
                      ])
                    ]);
                  }), 128))
                ]))
              ]),
              createBaseVNode("footer", _hoisted_75, [
                createBaseVNode("button", {
                  class: "btn btn-secondary",
                  disabled: !recyclableChannelCount.value,
                  onClick: _cache[11] || (_cache[11] = ($event) => recycleChannels(activeTunnel.value))
                }, " 回收终态 (" + toDisplayString(recyclableChannelCount.value) + ") ", 9, _hoisted_76),
                createBaseVNode("button", {
                  class: "btn btn-ghost",
                  onClick: closeChannels
                }, "关闭")
              ])
            ])
          ])) : createCommentVNode("", true)
        ]))
      ]);
    };
  }
};
const ProxyPivotPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-eedb7df8"]]);
export {
  ProxyPivotPage as default
};
