import { _ as _export_sfc, i as useAgentStore, j as useConsoleStore, k as onMounted, m as onUnmounted, o as openBlock, c as createElementBlock, b as createBaseVNode, F as Fragment, p as renderList, g as unref, q as createBlock, f as createCommentVNode, s as computed, r as ref, n as normalizeClass, t as toDisplayString, x as normalizeStyle, d as withDirectives, v as vModelText, y as createVNode } from "./index-CTSqJF0U.js";
import { B as BeaconContextMenu } from "./BeaconContextMenu-BGXLuO9Y.js";
const _hoisted_1$1 = {
  key: 0,
  class: "data-table"
};
const _hoisted_2$1 = ["onClick", "onDblclick", "onContextmenu"];
const _hoisted_3$1 = { class: "cell-id" };
const _hoisted_4$1 = { class: "cell-hostname" };
const _hoisted_5$1 = ["title"];
const _hoisted_6$1 = { class: "os-info" };
const _hoisted_7$1 = { class: "os-badge" };
const _hoisted_8$1 = { class: "arch-text" };
const _hoisted_9$1 = { class: "cell-ip" };
const _hoisted_10$1 = { class: "cell-ip" };
const _hoisted_11$1 = ["title"];
const _hoisted_12$1 = { class: "proc-name" };
const _hoisted_13$1 = { class: "pid-tag" };
const _hoisted_14$1 = { class: "cell-policy" };
const _hoisted_15$1 = { class: "cell-topology" };
const _hoisted_16 = ["title"];
const _hoisted_17 = { class: "cell-time" };
const _hoisted_18 = ["title"];
const _hoisted_19 = { class: "status-cell" };
const _hoisted_20 = {
  key: 0,
  class: "status-detail"
};
const _hoisted_21 = {
  key: 1,
  class: "empty-state"
};
const _hoisted_22 = {
  key: 2,
  class: "empty-state"
};
const _sfc_main$1 = {
  __name: "AgentTable",
  props: {
    searchQuery: { type: String, default: "" }
  },
  setup(__props) {
    const props = __props;
    const agentStore = useAgentStore();
    const consoleStore = useConsoleStore();
    const selectedBeaconId = ref(null);
    const contextMenu = ref({ visible: false, x: 0, y: 0, beaconid: null });
    let timer = null;
    onMounted(() => {
      timer = setInterval(() => {
        agentStore.tick();
      }, 1e3);
    });
    onUnmounted(() => {
      if (timer) clearInterval(timer);
    });
    function selectAgent(beaconid) {
      selectedBeaconId.value = beaconid;
    }
    function openConsole(beaconid) {
      consoleStore.openConsole(beaconid);
    }
    function onRowContextMenu(e, agent) {
      e.preventDefault();
      selectedBeaconId.value = agent.beaconid;
      contextMenu.value = {
        visible: true,
        x: e.clientX,
        y: e.clientY,
        beaconid: agent.beaconid
      };
    }
    function closeContextMenu() {
      contextMenu.value.visible = false;
    }
    function formatTime(iso) {
      if (!iso) return "-";
      const d = new Date(iso).getTime();
      const diff = Math.max(0, Math.floor((agentStore.now - d) / 1e3));
      if (diff < 60) return `${diff}s`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m`;
      return `${Math.floor(diff / 3600)}h`;
    }
    function getBeaconStatus(agent) {
      return agentStore.beaconStatus(agent);
    }
    function getStatusClass(agent) {
      return getBeaconStatus(agent).class;
    }
    function getStatusLabel(agent) {
      return getBeaconStatus(agent).label;
    }
    function getStatusDotClass(agent) {
      return getBeaconStatus(agent).dotClass;
    }
    function getCascadeDetail(agent) {
      if (getBeaconStatus(agent).kind !== "cascade") return "";
      const parentId = String(agent.parentId || "");
      const parent = parentId ? `经由 ${parentId.substring(0, 8)}` : "经由父级";
      const protocol = agent.linkProtocol ? String(agent.linkProtocol).toLowerCase() : "unknown";
      return `${parent} / ${protocol} / 最后观测 ${formatTime(agent.lastSeen)}`;
    }
    function getStatusTitle(agent) {
      const cascadeDetail = getCascadeDetail(agent);
      if (cascadeDetail) return cascadeDetail;
      const state = String(agent.linkState || "").toLowerCase();
      if ((String(agent.listenerType || "").toLowerCase() === "internal" || Number(agent.depth || 0) > 0 || agent.parentId) && state) {
        return `链路 ${state} / 最后观测 ${formatTime(agent.lastSeen)}`;
      }
      return `最后心跳 ${formatTime(agent.lastSeen)}`;
    }
    const filteredAgents = computed(() => {
      if (!props.searchQuery) return agentStore.agents;
      const q = props.searchQuery.toLowerCase();
      return agentStore.agents.filter((agent) => {
        const bid = (agent.beaconid || "").toLowerCase();
        const host = (agent.hostname || "").toLowerCase();
        const user = (agent.username || "").toLowerCase();
        const ip = (agent.ip || "").toLowerCase();
        const extIp = (agent.externalIp || "").toLowerCase();
        const proc = (agent.processName || "").toLowerCase();
        const os = (agent.os || "").toLowerCase();
        const pid = (agent.parentId || "").toLowerCase();
        return bid.includes(q) || host.includes(q) || user.includes(q) || ip.includes(q) || extIp.includes(q) || proc.includes(q) || os.includes(q) || pid.includes(q);
      });
    });
    function formatProcessName(name) {
      if (!name) return "-";
      return name.replace(/\.exe$/i, "");
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "agent-table-wrapper",
        onClick: closeContextMenu
      }, [
        filteredAgents.value.length > 0 ? (openBlock(), createElementBlock("table", _hoisted_1$1, [
          _cache[1] || (_cache[1] = createBaseVNode("thead", null, [
            createBaseVNode("tr", null, [
              createBaseVNode("th", { style: { "width": "40px" } }),
              createBaseVNode("th", null, "ID"),
              createBaseVNode("th", null, "主机名"),
              createBaseVNode("th", null, "用户"),
              createBaseVNode("th", null, "系统 / 架构"),
              createBaseVNode("th", null, "内网 IP"),
              createBaseVNode("th", null, "外网 IP"),
              createBaseVNode("th", null, "进程 (PID)"),
              createBaseVNode("th", null, "策略 (S/J)"),
              createBaseVNode("th", null, "拓扑"),
              createBaseVNode("th", null, "最后心跳"),
              createBaseVNode("th", null, "状态")
            ])
          ], -1)),
          createBaseVNode("tbody", null, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(filteredAgents.value, (agent) => {
              return openBlock(), createElementBlock("tr", {
                key: agent.beaconid,
                class: normalizeClass([{ selected: selectedBeaconId.value === agent.beaconid }, "agent-row"]),
                onClick: ($event) => selectAgent(agent.beaconid),
                onDblclick: ($event) => openConsole(agent.beaconid),
                onContextmenu: ($event) => onRowContextMenu($event, agent)
              }, [
                createBaseVNode("td", null, [
                  createBaseVNode("span", {
                    class: normalizeClass(["status-dot", getStatusDotClass(agent)])
                  }, null, 2)
                ]),
                createBaseVNode("td", _hoisted_3$1, toDisplayString(agent.beaconid.substring(0, 8)), 1),
                createBaseVNode("td", null, [
                  createBaseVNode("span", _hoisted_4$1, toDisplayString(agent.hostname), 1)
                ]),
                createBaseVNode("td", {
                  title: agent.username
                }, [
                  createBaseVNode("span", {
                    class: normalizeClass({ "admin-user": agent.isAdmin })
                  }, toDisplayString(agent.username) + toDisplayString(agent.isAdmin ? "*" : ""), 3)
                ], 8, _hoisted_5$1),
                createBaseVNode("td", null, [
                  createBaseVNode("div", _hoisted_6$1, [
                    createBaseVNode("span", _hoisted_7$1, toDisplayString(agent.os), 1),
                    createBaseVNode("span", _hoisted_8$1, toDisplayString(agent.arch), 1)
                  ])
                ]),
                createBaseVNode("td", _hoisted_9$1, toDisplayString(agent.ip), 1),
                createBaseVNode("td", _hoisted_10$1, toDisplayString(agent.externalIp), 1),
                createBaseVNode("td", null, [
                  createBaseVNode("div", {
                    class: "process-info",
                    title: agent.processName
                  }, [
                    createBaseVNode("span", _hoisted_12$1, toDisplayString(formatProcessName(agent.processName)), 1),
                    createBaseVNode("span", _hoisted_13$1, "[" + toDisplayString(agent.pid) + "]", 1)
                  ], 8, _hoisted_11$1)
                ]),
                createBaseVNode("td", _hoisted_14$1, toDisplayString(agent.sleep) + "s / " + toDisplayString(agent.jitter) + "%", 1),
                createBaseVNode("td", _hoisted_15$1, [
                  agent.depth > 0 ? (openBlock(), createElementBlock("span", {
                    key: 0,
                    class: "topo-depth",
                    style: normalizeStyle({ paddingLeft: (agent.depth - 1) * 12 + "px" })
                  }, [
                    agent.linkProtocol ? (openBlock(), createElementBlock("span", {
                      key: 0,
                      class: normalizeClass(["topo-tag", "topo-" + agent.linkProtocol.toLowerCase()])
                    }, toDisplayString(agent.linkProtocol.toUpperCase()), 3)) : createCommentVNode("", true),
                    agent.linkState ? (openBlock(), createElementBlock("span", {
                      key: 1,
                      class: normalizeClass(["topo-state", "state-" + agent.linkState.toLowerCase()])
                    }, toDisplayString(agent.linkState), 3)) : createCommentVNode("", true),
                    agent.parentId ? (openBlock(), createElementBlock("span", {
                      key: 2,
                      class: "topo-parent",
                      title: agent.parentId
                    }, toDisplayString(agent.parentId.substring(0, 8)), 9, _hoisted_16)) : createCommentVNode("", true)
                  ], 4)) : createCommentVNode("", true)
                ]),
                createBaseVNode("td", _hoisted_17, toDisplayString(formatTime(agent.lastSeen)), 1),
                createBaseVNode("td", {
                  title: getStatusTitle(agent)
                }, [
                  createBaseVNode("div", _hoisted_19, [
                    createBaseVNode("span", {
                      class: normalizeClass(["tag", getStatusClass(agent)])
                    }, toDisplayString(getStatusLabel(agent)), 3),
                    getCascadeDetail(agent) ? (openBlock(), createElementBlock("span", _hoisted_20, toDisplayString(getCascadeDetail(agent)), 1)) : createCommentVNode("", true)
                  ])
                ], 8, _hoisted_18)
              ], 42, _hoisted_2$1);
            }), 128))
          ])
        ])) : unref(agentStore).agents.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_21, [..._cache[2] || (_cache[2] = [
          createBaseVNode("div", { class: "icon" }, "📡", -1),
          createBaseVNode("div", { class: "title" }, "等待 Agent 上线", -1),
          createBaseVNode("div", { class: "desc" }, " 当 Agent 连接到服务器后，会自动显示在此表格中 ", -1),
          createBaseVNode("div", { class: "pulse-ring" }, null, -1)
        ])])) : (openBlock(), createElementBlock("div", _hoisted_22, [
          _cache[3] || (_cache[3] = createBaseVNode("div", { class: "icon" }, "🔍", -1)),
          _cache[4] || (_cache[4] = createBaseVNode("div", { class: "title" }, "没有找到匹配的 Agent", -1)),
          _cache[5] || (_cache[5] = createBaseVNode("div", { class: "desc" }, " 试着搜索其他的关键词，如主机名或 IP ", -1)),
          createBaseVNode("button", {
            class: "btn btn-ghost btn-sm",
            style: { "margin-top": "20px" },
            onClick: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("clearSearch"))
          }, " 清除搜索 ")
        ])),
        contextMenu.value.visible ? (openBlock(), createBlock(BeaconContextMenu, {
          key: 3,
          x: contextMenu.value.x,
          y: contextMenu.value.y,
          beaconid: contextMenu.value.beaconid,
          onClose: closeContextMenu
        }, null, 8, ["x", "y", "beaconid"])) : createCommentVNode("", true)
      ]);
    };
  }
};
const AgentTable = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-2c149a16"]]);
const _hoisted_1 = { class: "dashboard-page" };
const _hoisted_2 = { class: "page-header" };
const _hoisted_3 = { class: "header-search" };
const _hoisted_4 = { class: "search-input-wrapper" };
const _hoisted_5 = { class: "header-summary" };
const _hoisted_6 = { class: "header-stats" };
const _hoisted_7 = { class: "stat-item" };
const _hoisted_8 = { class: "stat-value" };
const _hoisted_9 = { class: "stat-item" };
const _hoisted_10 = { class: "stat-value online" };
const _hoisted_11 = { class: "stat-item" };
const _hoisted_12 = { class: "stat-value cascade" };
const _hoisted_13 = { class: "header-actions" };
const _hoisted_14 = ["disabled"];
const _hoisted_15 = { class: "table-section glass-card" };
const _sfc_main = {
  __name: "DashboardPage",
  setup(__props) {
    const agentStore = useAgentStore();
    const searchQuery = ref("");
    const isRefreshing = ref(false);
    async function refreshDashboard() {
      if (isRefreshing.value) return;
      isRefreshing.value = true;
      try {
        await agentStore.fetchAgents();
      } finally {
        isRefreshing.value = false;
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          _cache[10] || (_cache[10] = createBaseVNode("div", { class: "page-title" }, [
            createBaseVNode("span", { class: "icon" }, "🖥️"),
            createBaseVNode("span", null, "仪表盘")
          ], -1)),
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("div", _hoisted_4, [
              _cache[3] || (_cache[3] = createBaseVNode("span", { class: "search-icon" }, "🔍", -1)),
              withDirectives(createBaseVNode("input", {
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => searchQuery.value = $event),
                type: "text",
                placeholder: "搜索 ID、主机名、用户、IP...",
                spellcheck: "false",
                class: "global-search-input"
              }, null, 512), [
                [vModelText, searchQuery.value]
              ]),
              searchQuery.value ? (openBlock(), createElementBlock("button", {
                key: 0,
                class: "clear-search",
                onClick: _cache[1] || (_cache[1] = ($event) => searchQuery.value = "")
              }, "×")) : createCommentVNode("", true)
            ])
          ]),
          createBaseVNode("div", _hoisted_5, [
            createBaseVNode("div", _hoisted_6, [
              createBaseVNode("div", _hoisted_7, [
                createBaseVNode("span", _hoisted_8, toDisplayString(unref(agentStore).agents.length), 1),
                _cache[4] || (_cache[4] = createBaseVNode("span", { class: "stat-label" }, "全部 Agent", -1))
              ]),
              _cache[7] || (_cache[7] = createBaseVNode("div", { class: "stat-divider" }, null, -1)),
              createBaseVNode("div", _hoisted_9, [
                createBaseVNode("span", _hoisted_10, toDisplayString(unref(agentStore).onlineCount), 1),
                _cache[5] || (_cache[5] = createBaseVNode("span", { class: "stat-label" }, "在线", -1))
              ]),
              _cache[8] || (_cache[8] = createBaseVNode("div", { class: "stat-divider" }, null, -1)),
              createBaseVNode("div", _hoisted_11, [
                createBaseVNode("span", _hoisted_12, toDisplayString(unref(agentStore).cascadeCount), 1),
                _cache[6] || (_cache[6] = createBaseVNode("span", { class: "stat-label" }, "级联", -1))
              ])
            ]),
            createBaseVNode("div", _hoisted_13, [
              createBaseVNode("button", {
                class: "btn btn-ghost",
                disabled: isRefreshing.value,
                onClick: refreshDashboard,
                title: "刷新列表"
              }, [
                (openBlock(), createElementBlock("svg", {
                  class: normalizeClass({ spin: isRefreshing.value }),
                  width: "16",
                  height: "16",
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  "stroke-width": "2"
                }, [..._cache[9] || (_cache[9] = [
                  createBaseVNode("path", { d: "M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" }, null, -1)
                ])], 2))
              ], 8, _hoisted_14)
            ])
          ])
        ]),
        createBaseVNode("div", _hoisted_15, [
          createVNode(AgentTable, {
            searchQuery: searchQuery.value,
            onClearSearch: _cache[2] || (_cache[2] = ($event) => searchQuery.value = "")
          }, null, 8, ["searchQuery"])
        ])
      ]);
    };
  }
};
const DashboardPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-9ff2b926"]]);
export {
  DashboardPage as default
};
