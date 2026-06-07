import { _ as _export_sfc, o as openBlock, c as createElementBlock, b as createBaseVNode, n as normalizeClass, t as toDisplayString, w as withModifiers, s as computed, z as createStaticVNode, F as Fragment, p as renderList, A as reactive, r as ref, q as createBlock, i as useAgentStore, B as watch, k as onMounted, C as nextTick, g as unref, y as createVNode, f as createCommentVNode } from "./index-CTSqJF0U.js";
import { B as BeaconContextMenu } from "./BeaconContextMenu-BGXLuO9Y.js";
const _hoisted_1$4 = ["transform"];
const _hoisted_2$3 = ["x", "y"];
const _hoisted_3$3 = ["x", "y"];
const _hoisted_4$3 = ["transform"];
const _hoisted_5$3 = {
  key: 0,
  class: "os-glyph windows-glyph"
};
const _hoisted_6$2 = {
  key: 1,
  class: "os-glyph mac-glyph"
};
const _hoisted_7$2 = {
  key: 2,
  class: "os-glyph linux-glyph"
};
const _hoisted_8$2 = {
  key: 3,
  x: "25",
  y: "22",
  class: "unknown-glyph"
};
const _hoisted_9$2 = ["cx", "cy"];
const _hoisted_10$2 = ["x", "y"];
const _hoisted_11$1 = ["x", "y"];
const _hoisted_12$1 = ["x", "y"];
const _hoisted_13 = ["x"];
const _hoisted_14 = ["x"];
const _hoisted_15 = ["x"];
const _hoisted_16 = ["x", "y"];
const _hoisted_17 = ["x", "y"];
const NODE_W$2 = 248;
const NODE_H$1 = 104;
const _sfc_main$4 = {
  __name: "TopologyNode",
  props: {
    agent: { type: Object, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    selected: { type: Boolean, default: false }
  },
  emits: ["dragStart", "select", "contextMenu"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const HALF_W = NODE_W$2 / 2;
    const HALF_H = NODE_H$1 / 2;
    function truncate(value, max) {
      const text = String(value || "");
      return text.length > max ? `${text.substring(0, max - 1)}...` : text;
    }
    const osKind = computed(() => {
      const os = String(props.agent.os || "").toLowerCase();
      if (os.includes("windows")) return "windows";
      if (os.includes("linux")) return "linux";
      if (os.includes("darwin") || os.includes("mac")) return "mac";
      return "unknown";
    });
    const osLabel = computed(() => {
      if (osKind.value === "windows") return "WIN";
      if (osKind.value === "linux") return "LINUX";
      if (osKind.value === "mac") return "macOS";
      return "OS";
    });
    const roleLabel = computed(() => {
      const listenerType = String(props.agent.listenerType || "").toLowerCase();
      const depth = Number(props.agent.depth || 0);
      return listenerType === "internal" || depth > 0 || props.agent.parentId ? "INTERNAL" : "EXTERNAL";
    });
    const roleClass = computed(() => {
      return roleLabel.value === "EXTERNAL" ? "role-external" : "role-internal";
    });
    const statusClass = computed(() => {
      const s = String(props.agent.status || "").toLowerCase();
      if (s === "online") return "status-online";
      if (s === "sleeping") return "status-sleeping";
      return "status-offline";
    });
    const truncatedHostname = computed(() => truncate(props.agent.hostname || "Unknown", 18));
    const truncatedUsername = computed(() => truncate(props.agent.username || "-", 15));
    const shortId = computed(() => String(props.agent.beaconid || "").substring(0, 8));
    const metaLine = computed(() => {
      const ip = props.agent.ip && props.agent.ip !== "0.0.0.0" ? props.agent.ip : props.agent.externalIp;
      return truncate(ip || props.agent.os || "-", 24);
    });
    function onMouseDown(e) {
      if (e.button !== 0) return;
      emit("dragStart", {
        beaconid: props.agent.beaconid,
        startX: props.x,
        startY: props.y,
        mouseX: e.clientX,
        mouseY: e.clientY
      });
    }
    function onClick() {
      emit("select", props.agent.beaconid);
    }
    function onContextMenu(e) {
      emit("contextMenu", {
        targetType: "beacon",
        clientX: e.clientX,
        clientY: e.clientY,
        beaconid: props.agent.beaconid
      });
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("g", {
        transform: `translate(${__props.x}, ${__props.y})`,
        class: normalizeClass(["topo-node", `os-${osKind.value}`, { selected: __props.selected }]),
        onMousedown: withModifiers(onMouseDown, ["stop"]),
        onClick: withModifiers(onClick, ["stop"]),
        onContextmenu: withModifiers(onContextMenu, ["stop", "prevent"])
      }, [
        createBaseVNode("rect", {
          x: -HALF_W,
          y: -HALF_H,
          width: NODE_W$2,
          height: NODE_H$1,
          rx: "10",
          class: "node-bg"
        }, null, 8, _hoisted_2$3),
        createBaseVNode("rect", {
          x: -HALF_W,
          y: -HALF_H,
          width: "4",
          height: NODE_H$1,
          rx: "2",
          class: "node-accent"
        }, null, 8, _hoisted_3$3),
        createBaseVNode("g", {
          transform: `translate(${-HALF_W + 18}, ${-HALF_H + 20})`,
          class: "computer-icon"
        }, [
          _cache[3] || (_cache[3] = createBaseVNode("rect", {
            x: "0",
            y: "0",
            width: "50",
            height: "34",
            rx: "5",
            class: "computer-screen"
          }, null, -1)),
          _cache[4] || (_cache[4] = createBaseVNode("rect", {
            x: "19",
            y: "34",
            width: "12",
            height: "7",
            rx: "1",
            class: "computer-neck"
          }, null, -1)),
          _cache[5] || (_cache[5] = createBaseVNode("rect", {
            x: "11",
            y: "41",
            width: "28",
            height: "4",
            rx: "2",
            class: "computer-base"
          }, null, -1)),
          osKind.value === "windows" ? (openBlock(), createElementBlock("g", _hoisted_5$3, [..._cache[0] || (_cache[0] = [
            createBaseVNode("rect", {
              x: "14",
              y: "8",
              width: "9",
              height: "9"
            }, null, -1),
            createBaseVNode("rect", {
              x: "25",
              y: "8",
              width: "9",
              height: "9"
            }, null, -1),
            createBaseVNode("rect", {
              x: "14",
              y: "19",
              width: "9",
              height: "9"
            }, null, -1),
            createBaseVNode("rect", {
              x: "25",
              y: "19",
              width: "9",
              height: "9"
            }, null, -1)
          ])])) : osKind.value === "mac" ? (openBlock(), createElementBlock("g", _hoisted_6$2, [..._cache[1] || (_cache[1] = [
            createBaseVNode("circle", {
              cx: "25",
              cy: "17",
              r: "9"
            }, null, -1),
            createBaseVNode("circle", {
              cx: "21",
              cy: "14",
              r: "1.4",
              class: "mac-dot"
            }, null, -1),
            createBaseVNode("circle", {
              cx: "28",
              cy: "14",
              r: "1.4",
              class: "mac-dot"
            }, null, -1),
            createBaseVNode("path", { d: "M20 21 Q25 24 31 21" }, null, -1)
          ])])) : osKind.value === "linux" ? (openBlock(), createElementBlock("g", _hoisted_7$2, [..._cache[2] || (_cache[2] = [
            createBaseVNode("rect", {
              x: "13",
              y: "8",
              width: "24",
              height: "21",
              rx: "3"
            }, null, -1),
            createBaseVNode("text", {
              x: "17",
              y: "22"
            }, "$", -1)
          ])])) : (openBlock(), createElementBlock("text", _hoisted_8$2, "?"))
        ], 8, _hoisted_4$3),
        createBaseVNode("circle", {
          cx: -HALF_W + 86,
          cy: -HALF_H + 22,
          r: "4",
          class: normalizeClass(statusClass.value)
        }, null, 10, _hoisted_9$2),
        createBaseVNode("text", {
          x: -HALF_W + 96,
          y: -HALF_H + 26,
          class: "node-hostname"
        }, toDisplayString(truncatedHostname.value), 9, _hoisted_10$2),
        createBaseVNode("rect", {
          x: HALF_W - 84,
          y: HALF_H - 28,
          width: "72",
          height: "18",
          rx: "5",
          class: normalizeClass(["role-badge-bg", roleClass.value])
        }, null, 10, _hoisted_11$1),
        createBaseVNode("text", {
          x: HALF_W - 48,
          y: HALF_H - 15,
          class: normalizeClass(["role-badge-text", roleClass.value])
        }, toDisplayString(roleLabel.value), 11, _hoisted_12$1),
        createBaseVNode("text", {
          x: -HALF_W + 86,
          y: "-6",
          class: "node-id"
        }, toDisplayString(shortId.value), 9, _hoisted_13),
        createBaseVNode("text", {
          x: -HALF_W + 86,
          y: "14",
          class: "node-meta"
        }, toDisplayString(metaLine.value), 9, _hoisted_14),
        createBaseVNode("text", {
          x: -HALF_W + 86,
          y: "34",
          class: "node-username"
        }, toDisplayString(truncatedUsername.value), 9, _hoisted_15),
        createBaseVNode("rect", {
          x: -HALF_W + 18,
          y: HALF_H - 24,
          width: "54",
          height: "18",
          rx: "5",
          class: "os-badge-bg"
        }, null, 8, _hoisted_16),
        createBaseVNode("text", {
          x: -HALF_W + 45,
          y: HALF_H - 11,
          class: "os-badge-text"
        }, toDisplayString(osLabel.value), 9, _hoisted_17)
      ], 42, _hoisted_1$4);
    };
  }
};
const TopologyNode = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__scopeId", "data-v-a3c0204b"]]);
const _hoisted_1$3 = { class: "topology-edge" };
const _hoisted_2$2 = ["d"];
const _hoisted_3$2 = ["d", "marker-end"];
const _hoisted_4$2 = ["x", "y", "width"];
const _hoisted_5$2 = ["x", "y"];
const _sfc_main$3 = {
  __name: "TopologyEdge",
  props: {
    x1: { type: Number, required: true },
    y1: { type: Number, required: true },
    x2: { type: Number, required: true },
    y2: { type: Number, required: true },
    linkProtocol: { type: String, default: "" },
    linkAddr: { type: String, default: "" },
    edgeType: { type: String, default: "cascade" },
    sourceHalfHeight: { type: Number, default: 44 },
    targetHalfHeight: { type: Number, default: 44 }
  },
  setup(__props) {
    const props = __props;
    const normalizedProtocol = computed(() => String(props.linkProtocol || "").toLowerCase());
    const edgeClass = computed(() => {
      if (props.edgeType === "external") return "edge-external";
      if (props.edgeType === "orphan") return "edge-orphan";
      return normalizedProtocol.value === "smb" ? "edge-smb" : "edge-tcp";
    });
    const markerEnd = computed(() => {
      if (props.edgeType === "external") return "url(#arrow-external)";
      if (props.edgeType === "orphan") return "url(#arrow-orphan)";
      return normalizedProtocol.value === "smb" ? "url(#arrow-smb)" : "url(#arrow-tcp)";
    });
    const label = computed(() => {
      if (props.edgeType === "external") return props.linkAddr || "EXTERNAL";
      if (props.edgeType === "orphan") return "PARENT LOST";
      if (props.linkAddr) return props.linkAddr;
      return normalizedProtocol.value ? normalizedProtocol.value.toUpperCase() : "TCP";
    });
    const isUpward = computed(() => props.y2 < props.y1);
    const startY = computed(() => props.y1 + (isUpward.value ? -props.sourceHalfHeight : props.sourceHalfHeight));
    const endY = computed(() => props.y2 + (isUpward.value ? props.targetHalfHeight : -props.targetHalfHeight));
    const midY = computed(() => (startY.value + endY.value) / 2);
    const labelX = computed(() => (props.x1 + props.x2) / 2);
    const labelY = computed(() => midY.value - 8);
    const labelWidth = computed(() => Math.max(46, label.value.length * 6.8 + 14));
    const pathD = computed(() => `M ${props.x1} ${startY.value} C ${props.x1} ${midY.value}, ${props.x2} ${midY.value}, ${props.x2} ${endY.value}`);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("g", _hoisted_1$3, [
        createBaseVNode("path", {
          d: pathD.value,
          class: "edge-halo"
        }, null, 8, _hoisted_2$2),
        createBaseVNode("path", {
          d: pathD.value,
          class: normalizeClass(edgeClass.value),
          "marker-end": markerEnd.value
        }, null, 10, _hoisted_3$2),
        createBaseVNode("rect", {
          x: labelX.value - labelWidth.value / 2,
          y: labelY.value - 8,
          width: labelWidth.value,
          height: "17",
          rx: "5",
          class: normalizeClass(["edge-label-bg", edgeClass.value])
        }, null, 10, _hoisted_4$2),
        createBaseVNode("text", {
          x: labelX.value,
          y: labelY.value,
          class: normalizeClass(["edge-label", edgeClass.value])
        }, toDisplayString(label.value), 11, _hoisted_5$2)
      ]);
    };
  }
};
const TopologyEdge = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["__scopeId", "data-v-34d085bd"]]);
const _hoisted_1$2 = ["viewBox"];
const _hoisted_2$1 = ["x", "y"];
const _hoisted_3$1 = { class: "layer-guides" };
const _hoisted_4$1 = ["x", "y", "width", "height"];
const _hoisted_5$1 = ["x", "y"];
const _hoisted_6$1 = ["x", "y"];
const _hoisted_7$1 = ["transform"];
const _hoisted_8$1 = ["x", "y"];
const _hoisted_9$1 = ["transform"];
const _hoisted_10$1 = ["x"];
const _hoisted_11 = ["x"];
const _hoisted_12 = ["x"];
const NODE_W$1 = 248;
const NODE_H = 104;
const SERVER_W = 248;
const SERVER_H = 78;
const V_GAP$1 = 190;
const PADDING = 140;
const TEAMSERVER_ID = "__teamserver__";
const BASE_WIDTH = 1200;
const BASE_HEIGHT = 800;
const _sfc_main$2 = {
  __name: "TopologyCanvas",
  props: {
    agents: { type: Array, default: () => [] },
    positions: { type: Object, default: () => ({}) },
    selectedId: { type: String, default: "" }
  },
  emits: ["updatePosition", "select", "contextMenu"],
  setup(__props, { expose: __expose, emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const svgRef = ref(null);
    const viewBox = reactive({ x: 0, y: -220, width: BASE_WIDTH, height: BASE_HEIGHT });
    const zoom = ref(1);
    const isPanning = ref(false);
    const panStart = reactive({ mx: 0, my: 0, vx: 0, vy: 0 });
    const dragState = ref(null);
    function resolveParentId(agent, agents = props.agents) {
      const parentId = String(agent.parentId || "");
      if (!parentId) return "";
      const selfId = String(agent.beaconid || "");
      const parent = agents.find((a) => {
        if (a.beaconid === selfId) return false;
        return a.beaconid === parentId || a.beaconid.startsWith(parentId) || parentId.startsWith(a.beaconid);
      });
      return (parent == null ? void 0 : parent.beaconid) || "";
    }
    function isCascadeLike(agent) {
      const listenerType = String(agent.listenerType || "").toLowerCase();
      const depth = Number(agent.depth || 0);
      return listenerType === "internal" || depth > 0 || Boolean(agent.parentId);
    }
    const rootAgents = computed(() => {
      return props.agents.filter((agent) => !resolveParentId(agent)).sort((a, b) => a.beaconid.localeCompare(b.beaconid));
    });
    const teamServerPosition = computed(() => {
      const rootPositions = rootAgents.value.map((agent) => props.positions[agent.beaconid]).filter(Boolean);
      if (!rootPositions.length) {
        return { x: BASE_WIDTH / 2, y: -V_GAP$1 };
      }
      const xs = rootPositions.map((pos) => pos.x);
      const ys = rootPositions.map((pos) => pos.y);
      return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: Math.min(...ys) - V_GAP$1
      };
    });
    const externalCount = computed(() => {
      return rootAgents.value.filter((agent) => !isCascadeLike(agent)).length;
    });
    const cascadeCount = computed(() => {
      return props.agents.length - rootAgents.value.length;
    });
    const topologyRows = computed(() => {
      const rows = [{
        key: "teamserver",
        y: teamServerPosition.value.y,
        label: "TeamServer",
        summary: `${externalCount.value} external / ${cascadeCount.value} cascade`,
        kind: "server",
        height: SERVER_H + 54
      }];
      const yGroups = /* @__PURE__ */ new Map();
      for (const agent of props.agents) {
        const pos = props.positions[agent.beaconid];
        if (!pos) continue;
        const y = Math.round(pos.y);
        if (!yGroups.has(y)) yGroups.set(y, []);
        yGroups.get(y).push(agent);
      }
      const sortedY = [...yGroups.keys()].sort((a, b) => a - b);
      for (const y of sortedY) {
        const agents = yGroups.get(y);
        const hasExternal = agents.some((agent) => !isCascadeLike(agent));
        const label = hasExternal ? "External Beacons" : `Cascade Level ${rows.length - 1}`;
        rows.push({
          key: `layer-${y}`,
          y,
          label,
          summary: `${agents.length} node${agents.length > 1 ? "s" : ""}`,
          kind: hasExternal ? "external" : "cascade",
          height: NODE_H + 58
        });
      }
      return rows;
    });
    const edges = computed(() => {
      const result = [];
      for (const a of props.agents) {
        const parentId = resolveParentId(a);
        if (parentId) {
          const parentPos = props.positions[parentId];
          const childPos2 = props.positions[a.beaconid];
          if (parentPos && childPos2) {
            result.push({
              key: `${parentId}-${a.beaconid}`,
              x1: parentPos.x,
              y1: parentPos.y,
              x2: childPos2.x,
              y2: childPos2.y,
              sourceHalfHeight: NODE_H / 2,
              targetHalfHeight: NODE_H / 2,
              linkProtocol: a.linkProtocol || "tcp",
              linkAddr: a.linkAddr || "",
              edgeType: "cascade"
            });
          }
          continue;
        }
        const childPos = props.positions[a.beaconid];
        if (childPos) {
          const isOrphan = isCascadeLike(a);
          result.push({
            key: `${TEAMSERVER_ID}-${a.beaconid}`,
            x1: isOrphan ? teamServerPosition.value.x : childPos.x,
            y1: isOrphan ? teamServerPosition.value.y : childPos.y,
            x2: isOrphan ? childPos.x : teamServerPosition.value.x,
            y2: isOrphan ? childPos.y : teamServerPosition.value.y,
            sourceHalfHeight: isOrphan ? SERVER_H / 2 : NODE_H / 2,
            targetHalfHeight: isOrphan ? NODE_H / 2 : SERVER_H / 2,
            linkProtocol: isOrphan ? a.linkProtocol || "tcp" : "external",
            linkAddr: a.linkAddr || "",
            edgeType: isOrphan ? "orphan" : "external"
          });
        }
      }
      return result;
    });
    const nodes = computed(() => {
      return props.agents.map((agent) => {
        var _a, _b;
        return {
          agent,
          x: ((_a = props.positions[agent.beaconid]) == null ? void 0 : _a.x) ?? 0,
          y: ((_b = props.positions[agent.beaconid]) == null ? void 0 : _b.y) ?? 0
        };
      });
    });
    function applyZoom(newZoom, focusClientX, focusClientY) {
      const clamped = Math.max(0.2, Math.min(3, newZoom));
      const svg = svgRef.value;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const ratioX = (focusClientX - rect.left) / rect.width;
      const ratioY = (focusClientY - rect.top) / rect.height;
      const newWidth = BASE_WIDTH / clamped;
      const newHeight = BASE_HEIGHT / clamped;
      viewBox.x += (viewBox.width - newWidth) * ratioX;
      viewBox.y += (viewBox.height - newHeight) * ratioY;
      viewBox.width = newWidth;
      viewBox.height = newHeight;
      zoom.value = clamped;
    }
    function onWheel(e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      applyZoom(zoom.value + delta, e.clientX, e.clientY);
    }
    function onMouseDown(e) {
      if (e.button !== 0) return;
      if (e.target !== svgRef.value && !e.target.closest(".topo-canvas-bg")) return;
      isPanning.value = true;
      panStart.mx = e.clientX;
      panStart.my = e.clientY;
      panStart.vx = viewBox.x;
      panStart.vy = viewBox.y;
    }
    function onMouseMove(e) {
      if (dragState.value) {
        const svg = svgRef.value;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const scaleX = viewBox.width / rect.width;
        const scaleY = viewBox.height / rect.height;
        const dx = (e.clientX - dragState.value.startMouseX) * scaleX;
        const dy = (e.clientY - dragState.value.startMouseY) * scaleY;
        emit("updatePosition", dragState.value.beaconid, {
          x: dragState.value.startNodeX + dx,
          y: dragState.value.startNodeY + dy
        });
        return;
      }
      if (isPanning.value) {
        const svg = svgRef.value;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const scaleX = viewBox.width / rect.width;
        const scaleY = viewBox.height / rect.height;
        viewBox.x = panStart.vx - (e.clientX - panStart.mx) * scaleX;
        viewBox.y = panStart.vy - (e.clientY - panStart.my) * scaleY;
      }
    }
    function onMouseUp() {
      isPanning.value = false;
      dragState.value = null;
    }
    function onNodeDragStart(payload) {
      dragState.value = {
        beaconid: payload.beaconid,
        startMouseX: payload.mouseX,
        startMouseY: payload.mouseY,
        startNodeX: payload.startX,
        startNodeY: payload.startY
      };
    }
    function onNodeSelect(beaconid) {
      emit("select", beaconid);
    }
    function onNodeContextMenu(payload) {
      emit("contextMenu", payload);
    }
    function zoomIn() {
      const svg = svgRef.value;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      applyZoom(zoom.value + 0.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    function zoomOut() {
      const svg = svgRef.value;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      applyZoom(zoom.value - 0.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    function fitView() {
      const posArr = Object.values(props.positions);
      if (!posArr.length) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      function includeNodeBounds({ x, y }, width, height) {
        minX = Math.min(minX, x - width / 2);
        minY = Math.min(minY, y - height / 2);
        maxX = Math.max(maxX, x + width / 2);
        maxY = Math.max(maxY, y + height / 2);
      }
      for (const pos of posArr) {
        includeNodeBounds(pos, NODE_W$1, NODE_H);
      }
      includeNodeBounds(teamServerPosition.value, SERVER_W, SERVER_H);
      const w = maxX - minX + PADDING * 2;
      const h = maxY - minY + PADDING * 2;
      viewBox.x = minX - PADDING;
      viewBox.y = minY - PADDING;
      viewBox.width = w;
      viewBox.height = h;
      zoom.value = Math.min(BASE_WIDTH / w, BASE_HEIGHT / h, 2);
    }
    __expose({ zoomIn, zoomOut, fitView });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("svg", {
        ref_key: "svgRef",
        ref: svgRef,
        class: "topo-canvas",
        viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
        onWheel,
        onMousedown: onMouseDown,
        onMousemove: onMouseMove,
        onMouseup: onMouseUp,
        onMouseleave: onMouseUp,
        onContextmenu: _cache[0] || (_cache[0] = withModifiers(() => {
        }, ["prevent"]))
      }, [
        _cache[2] || (_cache[2] = createStaticVNode('<defs data-v-7efff4d2><marker id="arrow-external" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" data-v-7efff4d2><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-success)" data-v-7efff4d2></path></marker><marker id="arrow-tcp" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" data-v-7efff4d2><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary)" data-v-7efff4d2></path></marker><marker id="arrow-smb" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" data-v-7efff4d2><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-warning)" data-v-7efff4d2></path></marker><marker id="arrow-orphan" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" data-v-7efff4d2><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-danger)" data-v-7efff4d2></path></marker></defs>', 1)),
        createBaseVNode("rect", {
          class: "topo-canvas-bg",
          x: viewBox.x - 9999,
          y: viewBox.y - 9999,
          width: 19998,
          height: 19998,
          fill: "transparent"
        }, null, 8, _hoisted_2$1),
        createBaseVNode("g", _hoisted_3$1, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(topologyRows.value, (row) => {
            return openBlock(), createElementBlock("g", {
              key: row.key,
              class: normalizeClass(["layer-row", row.kind])
            }, [
              createBaseVNode("rect", {
                x: viewBox.x + 28,
                y: row.y - row.height / 2,
                width: viewBox.width - 56,
                height: row.height,
                rx: "14",
                class: "layer-band"
              }, null, 8, _hoisted_4$1),
              createBaseVNode("text", {
                x: viewBox.x + 46,
                y: row.y - row.height / 2 + 24,
                class: "layer-title"
              }, toDisplayString(row.label), 9, _hoisted_5$1),
              createBaseVNode("text", {
                x: viewBox.x + 46,
                y: row.y - row.height / 2 + 40,
                class: "layer-summary"
              }, toDisplayString(row.summary), 9, _hoisted_6$1)
            ], 2);
          }), 128))
        ]),
        (openBlock(true), createElementBlock(Fragment, null, renderList(edges.value, (edge) => {
          return openBlock(), createBlock(TopologyEdge, {
            key: edge.key,
            x1: edge.x1,
            y1: edge.y1,
            x2: edge.x2,
            y2: edge.y2,
            "link-protocol": edge.linkProtocol,
            "link-addr": edge.linkAddr,
            "edge-type": edge.edgeType,
            "source-half-height": edge.sourceHalfHeight,
            "target-half-height": edge.targetHalfHeight
          }, null, 8, ["x1", "y1", "x2", "y2", "link-protocol", "link-addr", "edge-type", "source-half-height", "target-half-height"]);
        }), 128)),
        createBaseVNode("g", {
          class: "teamserver-node",
          transform: `translate(${teamServerPosition.value.x}, ${teamServerPosition.value.y})`
        }, [
          createBaseVNode("rect", {
            x: -SERVER_W / 2,
            y: -SERVER_H / 2,
            width: SERVER_W,
            height: SERVER_H,
            rx: "10",
            class: "teamserver-bg"
          }, null, 8, _hoisted_8$1),
          createBaseVNode("g", {
            transform: `translate(${-SERVER_W / 2 + 18}, ${-SERVER_H / 2 + 14})`,
            class: "server-icon"
          }, [..._cache[1] || (_cache[1] = [
            createStaticVNode('<rect x="0" y="0" width="38" height="34" rx="5" class="server-rack" data-v-7efff4d2></rect><line x1="7" y1="10" x2="31" y2="10" data-v-7efff4d2></line><line x1="7" y1="21" x2="31" y2="21" data-v-7efff4d2></line><circle cx="10" cy="28" r="2" data-v-7efff4d2></circle><circle cx="17" cy="28" r="2" data-v-7efff4d2></circle>', 5)
          ])], 8, _hoisted_9$1),
          createBaseVNode("text", {
            x: -SERVER_W / 2 + 68,
            y: "-10",
            class: "teamserver-title"
          }, "TeamServer", 8, _hoisted_10$1),
          createBaseVNode("text", {
            x: -SERVER_W / 2 + 68,
            y: "10",
            class: "teamserver-subtitle"
          }, "External Beacon 入口", 8, _hoisted_11),
          createBaseVNode("text", {
            x: SERVER_W / 2 - 14,
            y: "23",
            class: "teamserver-count"
          }, toDisplayString(externalCount.value) + " 外联 / " + toDisplayString(cascadeCount.value) + " 级联 ", 9, _hoisted_12)
        ], 8, _hoisted_7$1),
        (openBlock(true), createElementBlock(Fragment, null, renderList(nodes.value, (node) => {
          return openBlock(), createBlock(TopologyNode, {
            key: node.agent.beaconid,
            agent: node.agent,
            x: node.x,
            y: node.y,
            selected: __props.selectedId === node.agent.beaconid,
            onDragStart: onNodeDragStart,
            onSelect: onNodeSelect,
            onContextMenu: onNodeContextMenu
          }, null, 8, ["agent", "x", "y", "selected"]);
        }), 128))
      ], 40, _hoisted_1$2);
    };
  }
};
const TopologyCanvas = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-7efff4d2"]]);
const _hoisted_1$1 = { class: "topo-toolbar" };
const _sfc_main$1 = {
  __name: "TopologyToolbar",
  emits: ["autoLayout", "zoomIn", "zoomOut", "fitView"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        createBaseVNode("button", {
          class: "toolbar-btn",
          onClick: _cache[0] || (_cache[0] = ($event) => emit("autoLayout")),
          title: "重新布局"
        }, [..._cache[4] || (_cache[4] = [
          createStaticVNode('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" data-v-31381f07><rect x="3" y="3" width="7" height="7" rx="1" data-v-31381f07></rect><rect x="14" y="3" width="7" height="7" rx="1" data-v-31381f07></rect><rect x="8" y="14" width="8" height="7" rx="1" data-v-31381f07></rect><line x1="6.5" y1="10" x2="6.5" y2="14" data-v-31381f07></line><line x1="17.5" y1="10" x2="17.5" y2="14" data-v-31381f07></line></svg><span data-v-31381f07>布局</span>', 2)
        ])]),
        _cache[8] || (_cache[8] = createBaseVNode("div", { class: "toolbar-divider" }, null, -1)),
        createBaseVNode("button", {
          class: "toolbar-btn icon-only",
          onClick: _cache[1] || (_cache[1] = ($event) => emit("zoomIn")),
          title: "放大"
        }, [..._cache[5] || (_cache[5] = [
          createStaticVNode('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" data-v-31381f07><circle cx="11" cy="11" r="8" data-v-31381f07></circle><line x1="21" y1="21" x2="16.65" y2="16.65" data-v-31381f07></line><line x1="11" y1="8" x2="11" y2="14" data-v-31381f07></line><line x1="8" y1="11" x2="14" y2="11" data-v-31381f07></line></svg>', 1)
        ])]),
        createBaseVNode("button", {
          class: "toolbar-btn icon-only",
          onClick: _cache[2] || (_cache[2] = ($event) => emit("zoomOut")),
          title: "缩小"
        }, [..._cache[6] || (_cache[6] = [
          createBaseVNode("svg", {
            width: "14",
            height: "14",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "2"
          }, [
            createBaseVNode("circle", {
              cx: "11",
              cy: "11",
              r: "8"
            }),
            createBaseVNode("line", {
              x1: "21",
              y1: "21",
              x2: "16.65",
              y2: "16.65"
            }),
            createBaseVNode("line", {
              x1: "8",
              y1: "11",
              x2: "14",
              y2: "11"
            })
          ], -1)
        ])]),
        createBaseVNode("button", {
          class: "toolbar-btn icon-only",
          onClick: _cache[3] || (_cache[3] = ($event) => emit("fitView")),
          title: "适配视图"
        }, [..._cache[7] || (_cache[7] = [
          createStaticVNode('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" data-v-31381f07><path d="M8 3H5a2 2 0 0 0-2 2v3" data-v-31381f07></path><path d="M21 8V5a2 2 0 0 0-2-2h-3" data-v-31381f07></path><path d="M3 16v3a2 2 0 0 0 2 2h3" data-v-31381f07></path><path d="M16 21h3a2 2 0 0 0 2-2v-3" data-v-31381f07></path></svg>', 1)
        ])]),
        _cache[9] || (_cache[9] = createStaticVNode('<div class="toolbar-divider" data-v-31381f07></div><div class="legend" data-v-31381f07><span class="legend-item" data-v-31381f07><span class="legend-line external" data-v-31381f07></span>External </span><span class="legend-item" data-v-31381f07><span class="legend-line tcp" data-v-31381f07></span>TCP </span><span class="legend-item" data-v-31381f07><span class="legend-line smb" data-v-31381f07></span>SMB </span><span class="legend-item" data-v-31381f07><span class="legend-line orphan" data-v-31381f07></span>Parent Lost </span></div>', 2))
      ]);
    };
  }
};
const TopologyToolbar = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-31381f07"]]);
const _hoisted_1 = { class: "topology-page" };
const _hoisted_2 = { class: "page-header" };
const _hoisted_3 = { class: "header-stats" };
const _hoisted_4 = { class: "header-stats-inner" };
const _hoisted_5 = { class: "stat-item" };
const _hoisted_6 = { class: "stat-value" };
const _hoisted_7 = { class: "stat-item" };
const _hoisted_8 = { class: "stat-value online" };
const _hoisted_9 = { class: "topology-container glass-card" };
const _hoisted_10 = {
  key: 1,
  class: "empty-state"
};
const NODE_W = 248;
const H_GAP = 320;
const V_GAP = 190;
const _sfc_main = {
  __name: "TopologyPage",
  setup(__props) {
    const agentStore = useAgentStore();
    const canvasRef = ref(null);
    const selectedBeaconId = ref("");
    const contextMenu = reactive({ visible: false, x: 0, y: 0, targetType: "", beaconid: "" });
    function computeLayout(agents) {
      if (!agents.length) return {};
      const childrenMap = /* @__PURE__ */ new Map();
      for (const a of agents) {
        const pid = resolveParentId(a, agents);
        if (pid) {
          if (!childrenMap.has(pid)) childrenMap.set(pid, []);
          childrenMap.get(pid).push(a);
        }
      }
      for (const [, children] of childrenMap) {
        children.sort((a, b) => a.beaconid.localeCompare(b.beaconid));
      }
      const roots = agents.filter((a) => !resolveParentId(a, agents));
      roots.sort((a, b) => a.beaconid.localeCompare(b.beaconid));
      const result = {};
      let globalX = 0;
      function layoutSubtree(node, depth) {
        const children = childrenMap.get(node.beaconid) || [];
        if (children.length === 0) {
          const x = globalX + NODE_W / 2;
          const y = depth * V_GAP;
          result[node.beaconid] = { x, y };
          globalX += H_GAP;
          return H_GAP;
        }
        let totalWidth = 0;
        const childCenters = [];
        for (const child of children) {
          const cx0 = globalX;
          const w = layoutSubtree(child, depth + 1);
          childCenters.push((cx0 + globalX) / 2);
          totalWidth += w;
        }
        const minX = childCenters[0];
        const maxX = childCenters[childCenters.length - 1];
        result[node.beaconid] = { x: (minX + maxX) / 2, y: depth * V_GAP };
        return totalWidth;
      }
      for (const root of roots) {
        layoutSubtree(root, 0);
      }
      for (const a of agents) {
        if (!result[a.beaconid]) {
          result[a.beaconid] = { x: globalX + NODE_W / 2, y: 0 };
          globalX += H_GAP;
        }
      }
      return result;
    }
    function resolveParentId(agent, agents) {
      const parentId = String(agent.parentId || "");
      if (!parentId) return "";
      const selfId = String(agent.beaconid || "");
      const parent = agents.find((a) => {
        if (a.beaconid === selfId) return false;
        return a.beaconid === parentId || a.beaconid.startsWith(parentId) || parentId.startsWith(a.beaconid);
      });
      return (parent == null ? void 0 : parent.beaconid) || "";
    }
    const positions = reactive({});
    function initPositions() {
      const layout = computeLayout(agentStore.agents);
      for (const [id, pos] of Object.entries(layout)) {
        if (!positions[id]) {
          positions[id] = { x: pos.x, y: pos.y };
        }
      }
    }
    watch(() => agentStore.agents.length, () => {
      const layout = computeLayout(agentStore.agents);
      for (const a of agentStore.agents) {
        if (!positions[a.beaconid] && layout[a.beaconid]) {
          positions[a.beaconid] = { x: layout[a.beaconid].x, y: layout[a.beaconid].y };
        }
      }
      scheduleFitView();
    }, { immediate: true });
    initPositions();
    onMounted(() => {
      scheduleFitView();
    });
    function scheduleFitView() {
      nextTick(() => {
        requestAnimationFrame(() => {
          var _a;
          return (_a = canvasRef.value) == null ? void 0 : _a.fitView();
        });
      });
    }
    function resetLayout() {
      const layout = computeLayout(agentStore.agents);
      for (const key of Object.keys(positions)) {
        delete positions[key];
      }
      for (const [id, pos] of Object.entries(layout)) {
        positions[id] = { x: pos.x, y: pos.y };
      }
      scheduleFitView();
    }
    function onUpdatePosition(beaconid, newPos) {
      if (positions[beaconid]) {
        positions[beaconid].x = newPos.x;
        positions[beaconid].y = newPos.y;
      }
    }
    function onSelectNode(beaconid) {
      selectedBeaconId.value = selectedBeaconId.value === beaconid ? "" : beaconid;
    }
    function onContextMenu(payload) {
      contextMenu.visible = true;
      contextMenu.x = payload.clientX;
      contextMenu.y = payload.clientY;
      contextMenu.targetType = payload.targetType || "beacon";
      contextMenu.beaconid = payload.beaconid;
    }
    function closeContextMenu() {
      contextMenu.visible = false;
      contextMenu.targetType = "";
    }
    const hasAgents = computed(() => agentStore.agents.length > 0);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          _cache[6] || (_cache[6] = createStaticVNode('<div class="page-title" data-v-0d854a21><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" data-v-0d854a21><circle cx="12" cy="5" r="3" data-v-0d854a21></circle><circle cx="5" cy="19" r="3" data-v-0d854a21></circle><circle cx="19" cy="19" r="3" data-v-0d854a21></circle><line x1="12" y1="8" x2="5" y2="16" data-v-0d854a21></line><line x1="12" y1="8" x2="19" y2="16" data-v-0d854a21></line></svg><span data-v-0d854a21>网络拓扑</span></div>', 1)),
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("div", _hoisted_4, [
              createBaseVNode("div", _hoisted_5, [
                createBaseVNode("span", _hoisted_6, toDisplayString(unref(agentStore).agents.length), 1),
                _cache[3] || (_cache[3] = createBaseVNode("span", { class: "stat-label" }, "节点", -1))
              ]),
              _cache[5] || (_cache[5] = createBaseVNode("div", { class: "stat-divider" }, null, -1)),
              createBaseVNode("div", _hoisted_7, [
                createBaseVNode("span", _hoisted_8, toDisplayString(unref(agentStore).onlineCount), 1),
                _cache[4] || (_cache[4] = createBaseVNode("span", { class: "stat-label" }, "在线", -1))
              ])
            ])
          ])
        ]),
        createBaseVNode("div", _hoisted_9, [
          createVNode(TopologyToolbar, {
            onAutoLayout: resetLayout,
            onZoomIn: _cache[0] || (_cache[0] = ($event) => {
              var _a;
              return (_a = canvasRef.value) == null ? void 0 : _a.zoomIn();
            }),
            onZoomOut: _cache[1] || (_cache[1] = ($event) => {
              var _a;
              return (_a = canvasRef.value) == null ? void 0 : _a.zoomOut();
            }),
            onFitView: _cache[2] || (_cache[2] = ($event) => {
              var _a;
              return (_a = canvasRef.value) == null ? void 0 : _a.fitView();
            })
          }),
          hasAgents.value ? (openBlock(), createBlock(TopologyCanvas, {
            key: 0,
            ref_key: "canvasRef",
            ref: canvasRef,
            agents: unref(agentStore).agents,
            positions,
            "selected-id": selectedBeaconId.value,
            onUpdatePosition,
            onSelect: onSelectNode,
            onContextMenu
          }, null, 8, ["agents", "positions", "selected-id"])) : (openBlock(), createElementBlock("div", _hoisted_10, [..._cache[7] || (_cache[7] = [
            createBaseVNode("div", { class: "icon" }, "📡", -1),
            createBaseVNode("div", { class: "title" }, "等待 Agent 上线", -1),
            createBaseVNode("div", { class: "desc" }, " 当 Agent 连接到服务器后，会自动显示拓扑关系图 ", -1),
            createBaseVNode("div", { class: "pulse-ring" }, null, -1)
          ])]))
        ]),
        contextMenu.visible && contextMenu.targetType === "beacon" ? (openBlock(), createBlock(BeaconContextMenu, {
          key: 0,
          x: contextMenu.x,
          y: contextMenu.y,
          beaconid: contextMenu.beaconid,
          onClose: closeContextMenu
        }, null, 8, ["x", "y", "beaconid"])) : createCommentVNode("", true)
      ]);
    };
  }
};
const TopologyPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-0d854a21"]]);
export {
  TopologyPage as default
};
