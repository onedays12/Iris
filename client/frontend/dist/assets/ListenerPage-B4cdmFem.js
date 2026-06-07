import { _ as _export_sfc, K as useListenerStore, H as useModalStore, L as useNotificationStore, o as openBlock, c as createElementBlock, b as createBaseVNode, t as toDisplayString, f as createCommentVNode, F as Fragment, p as renderList, r as ref, s as computed, n as normalizeClass, e as createTextVNode, z as createStaticVNode, B as watch, d as withDirectives, v as vModelText, M as vModelSelect, g as unref, y as createVNode, q as createBlock, N as GenerateBeaconModal } from "./index-CTSqJF0U.js";
const _hoisted_1$2 = { class: "listener-list" };
const _hoisted_2$2 = {
  key: 0,
  class: "data-table"
};
const _hoisted_3$2 = { class: "header-content" };
const _hoisted_4$2 = {
  key: 0,
  class: "sort-icon"
};
const _hoisted_5$2 = { class: "header-content" };
const _hoisted_6$1 = {
  key: 0,
  class: "sort-icon"
};
const _hoisted_7$1 = { class: "cell-name" };
const _hoisted_8$1 = { class: "protocol-badge" };
const _hoisted_9$1 = { class: "cell-mono" };
const _hoisted_10$1 = { class: "cell-mono" };
const _hoisted_11$1 = {
  key: 0,
  class: "p2p-badge"
};
const _hoisted_12$1 = { class: "cell-time" };
const _hoisted_13$1 = { class: "action-btns" };
const _hoisted_14$1 = ["onClick", "title"];
const _hoisted_15$1 = {
  key: 0,
  width: "12",
  height: "12",
  viewBox: "0 0 24 24",
  fill: "currentColor"
};
const _hoisted_16$1 = {
  key: 1,
  width: "12",
  height: "12",
  viewBox: "0 0 24 24",
  fill: "currentColor"
};
const _hoisted_17$1 = ["onClick", "disabled"];
const _hoisted_18$1 = ["onClick"];
const _hoisted_19$1 = ["onClick"];
const _hoisted_20$1 = {
  key: 1,
  class: "empty-state"
};
const _sfc_main$2 = {
  __name: "ListenerList",
  props: {
    listeners: { type: Array, required: true }
  },
  emits: ["delete", "edit"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const listenerStore = useListenerStore();
    const modalStore = useModalStore();
    const notificationStore = useNotificationStore();
    const sortBy = ref("");
    const sortOrder = ref("asc");
    const sortedListeners = computed(() => {
      const result = [...props.listeners];
      if (!sortBy.value) return result;
      return result.sort((a, b) => {
        let valA = a[sortBy.value];
        let valB = b[sortBy.value];
        if (sortBy.value === "name") {
          return sortOrder.value === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        if (sortBy.value === "created_at") {
          const timeA = new Date(valA).getTime();
          const timeB = new Date(valB).getTime();
          return sortOrder.value === "asc" ? timeA - timeB : timeB - timeA;
        }
        return 0;
      });
    });
    function handleSort(key) {
      if (sortBy.value === key) {
        if (sortOrder.value === "asc") {
          sortOrder.value = "desc";
        } else {
          sortBy.value = "";
          sortOrder.value = "asc";
        }
      } else {
        sortBy.value = key;
        sortOrder.value = "asc";
      }
    }
    function getStatusClass(status) {
      if (status === "started") return "tag-success";
      if (status === "paused") return "tag-warning";
      if (status === "error") return "tag-danger";
      return "tag-danger";
    }
    function getStatusLabel(status) {
      const map = {
        "started": "运行中",
        "paused": "已暂停",
        "stopped": "已停止",
        "error": "启动失败"
      };
      return map[status] || status;
    }
    function parseConfigObject(configSource) {
      if (typeof configSource === "string") {
        try {
          return JSON.parse(configSource || "{}");
        } catch (e) {
          return {};
        }
      } else if (configSource && typeof configSource === "object" && !Array.isArray(configSource)) {
        return configSource;
      }
      return {};
    }
    function readConfigValue(configSource, keys) {
      const config = parseConfigObject(configSource);
      for (const key of keys) {
        if (config[key] !== void 0 && config[key] !== "") {
          return config[key];
        }
      }
      return "-";
    }
    function getListenerHost(listener) {
      const keys = listener.listener_type === "internal" ? ["bind_host", "host"] : ["host", "bind_host"];
      return readConfigValue(listener.config, keys);
    }
    function getListenerPort(listener) {
      const keys = listener.listener_type === "internal" ? ["bind_port", "port"] : ["port", "bind_port"];
      return readConfigValue(listener.config, keys);
    }
    function toggleListener(listener) {
      if (listener.status === "started") {
        listenerStore.stopListener(listener.name);
      } else {
        listenerStore.startListener(listener.name);
      }
    }
    function handleGenerateClient(listener) {
      if (listener.status !== "started") {
        notificationStore.warning("只有运行中的监听器才能生成客户端");
        return;
      }
      modalStore.openGenerateBeacon(listener.id);
    }
    function formatTime(iso) {
      if (!iso) return "-";
      const d = new Date(iso);
      return d.toLocaleDateString("zh-CN") + " " + d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$2, [
        __props.listeners.length > 0 ? (openBlock(), createElementBlock("table", _hoisted_2$2, [
          createBaseVNode("thead", null, [
            createBaseVNode("tr", null, [
              _cache[4] || (_cache[4] = createBaseVNode("th", { style: { "width": "40px" } }, null, -1)),
              createBaseVNode("th", {
                class: "sortable",
                onClick: _cache[0] || (_cache[0] = ($event) => handleSort("name"))
              }, [
                createBaseVNode("div", _hoisted_3$2, [
                  _cache[2] || (_cache[2] = createBaseVNode("span", null, "名称", -1)),
                  sortBy.value === "name" ? (openBlock(), createElementBlock("span", _hoisted_4$2, toDisplayString(sortOrder.value === "asc" ? "↑" : "↓"), 1)) : createCommentVNode("", true)
                ])
              ]),
              _cache[5] || (_cache[5] = createBaseVNode("th", null, "协议", -1)),
              _cache[6] || (_cache[6] = createBaseVNode("th", null, "类型", -1)),
              _cache[7] || (_cache[7] = createBaseVNode("th", null, "地址", -1)),
              _cache[8] || (_cache[8] = createBaseVNode("th", null, "端口", -1)),
              _cache[9] || (_cache[9] = createBaseVNode("th", null, "状态", -1)),
              createBaseVNode("th", {
                class: "sortable",
                onClick: _cache[1] || (_cache[1] = ($event) => handleSort("created_at"))
              }, [
                createBaseVNode("div", _hoisted_5$2, [
                  _cache[3] || (_cache[3] = createBaseVNode("span", null, "创建时间", -1)),
                  sortBy.value === "created_at" ? (openBlock(), createElementBlock("span", _hoisted_6$1, toDisplayString(sortOrder.value === "asc" ? "↑" : "↓"), 1)) : createCommentVNode("", true)
                ])
              ]),
              _cache[10] || (_cache[10] = createBaseVNode("th", { style: { "width": "120px" } }, "操作", -1))
            ])
          ]),
          createBaseVNode("tbody", null, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(sortedListeners.value, (listener) => {
              return openBlock(), createElementBlock("tr", {
                key: listener.id
              }, [
                createBaseVNode("td", null, [
                  createBaseVNode("span", {
                    class: normalizeClass(["status-dot", listener.status === "started" ? "online" : "offline"])
                  }, null, 2)
                ]),
                createBaseVNode("td", null, [
                  createBaseVNode("span", _hoisted_7$1, toDisplayString(listener.name), 1)
                ]),
                createBaseVNode("td", null, [
                  createBaseVNode("span", _hoisted_8$1, toDisplayString(listener.protocol.toUpperCase()), 1)
                ]),
                createBaseVNode("td", null, [
                  createBaseVNode("span", {
                    class: normalizeClass(["ltype-tag", listener.listener_type === "external" ? "tag-external" : "tag-internal"])
                  }, toDisplayString(listener.listener_type === "external" ? "External" : "Internal"), 3)
                ]),
                createBaseVNode("td", _hoisted_9$1, toDisplayString(getListenerHost(listener)), 1),
                createBaseVNode("td", _hoisted_10$1, [
                  createTextVNode(toDisplayString(getListenerPort(listener)) + " ", 1),
                  listener.listener_type === "internal" ? (openBlock(), createElementBlock("span", _hoisted_11$1, "P2P")) : createCommentVNode("", true)
                ]),
                createBaseVNode("td", null, [
                  createBaseVNode("span", {
                    class: normalizeClass(["tag", getStatusClass(listener.status)])
                  }, toDisplayString(getStatusLabel(listener.status)), 3)
                ]),
                createBaseVNode("td", _hoisted_12$1, toDisplayString(formatTime(listener.created_at)), 1),
                createBaseVNode("td", null, [
                  createBaseVNode("div", _hoisted_13$1, [
                    createBaseVNode("button", {
                      class: "btn btn-sm btn-ghost",
                      onClick: ($event) => toggleListener(listener),
                      title: listener.status === "started" ? "停止" : "启动"
                    }, [
                      listener.status === "started" ? (openBlock(), createElementBlock("svg", _hoisted_15$1, [..._cache[11] || (_cache[11] = [
                        createBaseVNode("rect", {
                          x: "6",
                          y: "4",
                          width: "4",
                          height: "16",
                          rx: "1"
                        }, null, -1),
                        createBaseVNode("rect", {
                          x: "14",
                          y: "4",
                          width: "4",
                          height: "16",
                          rx: "1"
                        }, null, -1)
                      ])])) : (openBlock(), createElementBlock("svg", _hoisted_16$1, [..._cache[12] || (_cache[12] = [
                        createBaseVNode("polygon", { points: "5,3 19,12 5,21" }, null, -1)
                      ])]))
                    ], 8, _hoisted_14$1),
                    createBaseVNode("button", {
                      class: "btn btn-sm btn-ghost",
                      onClick: ($event) => handleGenerateClient(listener),
                      disabled: listener.status !== "started",
                      title: "生成客户端"
                    }, [..._cache[13] || (_cache[13] = [
                      createStaticVNode('<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" data-v-7b13cc0d><path d="M2 3h20v14a2 2 0 01-2 2H4a2 2 0 01-2-2V3z" data-v-7b13cc0d></path><path d="M8 21h8" data-v-7b13cc0d></path><path d="M12 17v4" data-v-7b13cc0d></path><path d="M7 8l5 5 5-5" data-v-7b13cc0d></path></svg>', 1)
                    ])], 8, _hoisted_17$1),
                    createBaseVNode("button", {
                      class: "btn btn-sm btn-ghost",
                      onClick: ($event) => _ctx.$emit("edit", listener),
                      title: "编辑配置"
                    }, [..._cache[14] || (_cache[14] = [
                      createBaseVNode("svg", {
                        width: "12",
                        height: "12",
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "currentColor",
                        "stroke-width": "2"
                      }, [
                        createBaseVNode("path", { d: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" }),
                        createBaseVNode("path", { d: "M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" })
                      ], -1)
                    ])], 8, _hoisted_18$1),
                    createBaseVNode("button", {
                      class: "btn btn-sm btn-ghost danger-hover",
                      onClick: ($event) => _ctx.$emit("delete", listener.name),
                      title: "删除"
                    }, [..._cache[15] || (_cache[15] = [
                      createBaseVNode("svg", {
                        width: "12",
                        height: "12",
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "currentColor",
                        "stroke-width": "2"
                      }, [
                        createBaseVNode("polyline", { points: "3 6 5 6 21 6" }),
                        createBaseVNode("path", { d: "M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" })
                      ], -1)
                    ])], 8, _hoisted_19$1)
                  ])
                ])
              ]);
            }), 128))
          ])
        ])) : (openBlock(), createElementBlock("div", _hoisted_20$1, [..._cache[16] || (_cache[16] = [
          createBaseVNode("div", { class: "icon" }, "📡", -1),
          createBaseVNode("div", { class: "title" }, "暂无监听器", -1),
          createBaseVNode("div", { class: "desc" }, "点击上方「新建监听器」按钮创建你的第一个监听器", -1)
        ])]))
      ]);
    };
  }
};
const ListenerList = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-7b13cc0d"]]);
const _hoisted_1$1 = { class: "modal-overlay" };
const _hoisted_2$1 = { class: "listener-modal glass-card" };
const _hoisted_3$1 = { class: "modal-header" };
const _hoisted_4$1 = { class: "modal-header-main" };
const _hoisted_5$1 = { class: "modal-title" };
const _hoisted_6 = { class: "title-icon" };
const _hoisted_7 = { class: "modal-desc" };
const _hoisted_8 = { class: "form-container" };
const _hoisted_9 = { class: "form-section" };
const _hoisted_10 = { class: "section-heading" };
const _hoisted_11 = { class: "form-grid" };
const _hoisted_12 = { class: "form-group" };
const _hoisted_13 = ["disabled"];
const _hoisted_14 = { class: "form-group" };
const _hoisted_15 = ["disabled"];
const _hoisted_16 = ["value"];
const _hoisted_17 = { class: "form-group" };
const _hoisted_18 = ["disabled"];
const _hoisted_19 = ["value"];
const _hoisted_20 = { class: "field-hint" };
const _hoisted_21 = { class: "form-group" };
const _hoisted_22 = ["value"];
const _hoisted_23 = { class: "field-hint" };
const _hoisted_24 = {
  key: 0,
  class: "internal-info"
};
const _hoisted_25 = { class: "form-section" };
const _hoisted_26 = {
  key: 0,
  class: "endpoint-grid"
};
const _hoisted_27 = { class: "endpoint-card" };
const _hoisted_28 = { class: "form-group" };
const _hoisted_29 = {
  key: 1,
  class: "endpoint-grid"
};
const _hoisted_30 = { class: "endpoint-card" };
const _hoisted_31 = { class: "endpoint-head" };
const _hoisted_32 = { class: "endpoint-row" };
const _hoisted_33 = { class: "field host-field" };
const _hoisted_34 = { class: "field port-field" };
const _hoisted_35 = {
  key: 0,
  class: "endpoint-card callback"
};
const _hoisted_36 = { class: "endpoint-row" };
const _hoisted_37 = { class: "field host-field" };
const _hoisted_38 = { class: "field port-field" };
const _hoisted_39 = {
  key: 0,
  class: "form-section"
};
const _hoisted_40 = { class: "endpoint-grid compact" };
const _hoisted_41 = { class: "endpoint-card" };
const _hoisted_42 = { class: "endpoint-row" };
const _hoisted_43 = { class: "field host-field" };
const _hoisted_44 = { class: "field port-field" };
const _hoisted_45 = { class: "endpoint-card callback" };
const _hoisted_46 = { class: "endpoint-row" };
const _hoisted_47 = { class: "field host-field" };
const _hoisted_48 = { class: "field port-field" };
const _hoisted_49 = {
  key: 1,
  class: "form-section"
};
const _hoisted_50 = { class: "form-grid security-row" };
const _hoisted_51 = { class: "form-group span-4" };
const _hoisted_52 = { class: "input-with-action" };
const _hoisted_53 = {
  key: 3,
  class: "advanced-panel"
};
const _hoisted_54 = { class: "form-section" };
const _hoisted_55 = { class: "cert-grid" };
const _hoisted_56 = { class: "form-group" };
const _hoisted_57 = { class: "form-group" };
const _hoisted_58 = { class: "modal-footer" };
const _hoisted_59 = ["disabled"];
const _hoisted_60 = ["disabled"];
const _hoisted_61 = {
  key: 0,
  class: "spin inline-spin"
};
const _sfc_main$1 = {
  __name: "ListenerDialog",
  props: {
    editData: { type: Object, default: null }
  },
  emits: ["confirm", "cancel"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const notificationStore = useNotificationStore();
    const listenerStore = useListenerStore();
    const emit = __emit;
    const isEdit = computed(() => !!props.editData);
    const protocols = ["HTTP", "HTTPS"];
    const internalProtocols = ["TCP", "SMB"];
    const listenerTypes = [
      { value: "external", label: "外部 (TeamServer)", desc: "TeamServer 直接监听" },
      { value: "internal", label: "内部 (P2P/Beacon)", desc: "由 Beacon 承载" }
    ];
    const profileOptions = [
      { value: "http-default", label: "http-default", desc: "普通 HTTP/HTTPS C2，不启用 Stager。", stager: false },
      { value: "http-stager", label: "http-stager", desc: "启用 HTTP Stager，需要填写 stage 下载端点。", stager: true }
    ];
    function defaultForm() {
      return {
        name: "",
        protocol: "http",
        listener_type: "external",
        profile: "http-default",
        host: "0.0.0.0",
        port: 4444,
        callback_host: "",
        callback_port: 4444,
        ssl_cert: "",
        ssl_key: "",
        encrypt_key: "",
        pipe_name: "",
        stager: {
          bind_host: "0.0.0.0",
          bind_port: 8081,
          callback_host: "",
          callback_port: 8081
        }
      };
    }
    const form = ref(defaultForm());
    const selectedProfile = computed(() => profileOptions.find((item) => item.value === form.value.profile));
    const profileRequiresStager = computed(() => {
      var _a;
      return Boolean((_a = selectedProfile.value) == null ? void 0 : _a.stager);
    });
    const profileDescription = computed(() => {
      var _a;
      return ((_a = selectedProfile.value) == null ? void 0 : _a.desc) || "自定义 c2profile；仅提交实例端点。";
    });
    const isInternal = computed(() => form.value.listener_type === "internal");
    const availableProtocols = computed(() => isInternal.value ? internalProtocols : protocols);
    function parseListenerConfig(config) {
      if (!config) return {};
      if (typeof config === "string") {
        try {
          return JSON.parse(config);
        } catch {
          return {};
        }
      }
      if (typeof config === "object" && !Array.isArray(config)) {
        return config;
      }
      return {};
    }
    function splitHostPort(value, fallbackPort) {
      const text = String(value || "").trim();
      if (!text) return { host: "", port: fallbackPort };
      const bracket = text.match(/^\[([^\]]+)\]:(\d+)$/);
      if (bracket) {
        return { host: bracket[1], port: Number(bracket[2]) || fallbackPort };
      }
      const lastColon = text.lastIndexOf(":");
      if (lastColon > 0 && text.indexOf(":") === lastColon) {
        const maybePort = text.slice(lastColon + 1);
        if (/^\d+$/.test(maybePort)) {
          return { host: text.slice(0, lastColon), port: Number(maybePort) || fallbackPort };
        }
      }
      return { host: text, port: fallbackPort };
    }
    function hostHasPort(value) {
      const text = String(value || "").trim();
      if (/^\[[^\]]+\]:\d+$/.test(text)) return true;
      const lastColon = text.lastIndexOf(":");
      if (lastColon <= 0 || text.indexOf(":") !== lastColon) return false;
      return /^\d+$/.test(text.slice(lastColon + 1));
    }
    function validateHostOnly(value, label, { allowUnspecified = true } = {}) {
      const host = String(value || "").trim();
      if (!host) {
        notificationStore.error(`${label}不能为空`);
        return "";
      }
      if (host.includes("://") || hostHasPort(host)) {
        notificationStore.error(`${label}只能填写 host/IP，不能包含协议或端口`);
        return "";
      }
      if (!allowUnspecified && (host === "0.0.0.0" || host === "::")) {
        notificationStore.error(`${label}必须是 Beacon 可访问的地址，不能使用 0.0.0.0 或 ::`);
        return "";
      }
      return host;
    }
    function parsePort(value, label) {
      const port = parseInt(value, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        notificationStore.error(`${label}必须在 1-65535 之间`);
        return null;
      }
      return port;
    }
    function inferProfile(config) {
      if (typeof config.profile === "string" && config.profile.trim()) return config.profile.trim();
      if (config.stager && typeof config.stager === "object" && Object.keys(config.stager).length) return "http-stager";
      return "http-default";
    }
    watch(() => props.editData, (newVal) => {
      if (newVal) {
        const config = parseListenerConfig(newVal.config);
        const callback = splitHostPort(config.callback_host || "", Number(config.callback_port ?? config.port ?? newVal.bind_port ?? 4444));
        const stager = config.stager && typeof config.stager === "object" ? config.stager : {};
        form.value.name = newVal.name;
        form.value.protocol = (newVal.protocol || config.protocol || "http").toLowerCase();
        form.value.listener_type = newVal.listener_type || "external";
        form.value.profile = inferProfile(config);
        form.value.host = config.bind_host || config.host || newVal.bind_addr || "0.0.0.0";
        form.value.port = Number(config.bind_port ?? config.port ?? newVal.bind_port ?? 4444);
        form.value.callback_host = callback.host;
        form.value.callback_port = callback.port;
        form.value.ssl_cert = config.ssl_cert || "";
        form.value.ssl_key = config.ssl_key || "";
        form.value.encrypt_key = config.encrypt_key || "";
        form.value.pipe_name = config.pipe_name || "";
        form.value.stager = {
          bind_host: stager.bind_host || stager.host || "0.0.0.0",
          bind_port: Number(stager.bind_port ?? stager.port ?? 8081),
          callback_host: stager.callback_host || callback.host || "",
          callback_port: Number(stager.callback_port ?? 8081)
        };
      } else {
        resetForm();
      }
    }, { immediate: true });
    watch(() => form.value.listener_type, (newType) => {
      if (newType === "internal" && ["http", "https"].includes(form.value.protocol)) {
        form.value.protocol = "tcp";
      } else if (newType === "external" && ["tcp", "smb"].includes(form.value.protocol)) {
        form.value.protocol = "http";
      }
    });
    const showAdvanced = ref(false);
    const loading = ref(false);
    function generateEncryptKey() {
      var _a;
      const bytes = new Uint8Array(16);
      if ((_a = globalThis.crypto) == null ? void 0 : _a.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < bytes.length; i += 1) {
          bytes[i] = Math.floor(Math.random() * 256);
        }
      }
      form.value.encrypt_key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
    async function handleConfirm() {
      var _a;
      loading.value = true;
      try {
        const name = ((_a = form.value.name) == null ? void 0 : _a.trim()) || "";
        const protocol = String(form.value.protocol || "").toLowerCase();
        const profile = String(form.value.profile || "").trim();
        if (!name) {
          notificationStore.error("监听器名称不能为空");
          return;
        }
        const encryptKey = String(form.value.encrypt_key || "").trim();
        if (!encryptKey) {
          notificationStore.error("通信加密密钥不能为空");
          return;
        }
        if (isInternal.value) {
          if (!["tcp", "smb"].includes(protocol)) {
            notificationStore.error("Internal 监听器只支持 TCP / SMB");
            return;
          }
          let payload2;
          if (protocol === "tcp") {
            const host2 = validateHostOnly(form.value.host, "绑定地址 (Host)");
            if (!host2) return;
            const port2 = parsePort(form.value.port, "监听端口");
            if (port2 === null) return;
            payload2 = {
              name,
              protocol: "tcp",
              listener_type: "internal",
              profile: profile || "http-default",
              encrypt_key: encryptKey,
              bind_host: host2,
              bind_port: port2,
              connect_timeout: 5e3
            };
          } else {
            const pipeName = String(form.value.pipe_name || "").trim();
            if (!pipeName) {
              notificationStore.error("SMB Pipe 名称不能为空");
              return;
            }
            payload2 = {
              name,
              protocol: "smb",
              listener_type: "internal",
              profile: profile || "http-default",
              encrypt_key: encryptKey,
              pipe_name: pipeName,
              connect_timeout: 5e3
            };
          }
          if (isEdit.value) {
            await listenerStore.updateListener(payload2);
            notificationStore.success(`监听器 ${name} 配置已成功热更新`);
          } else {
            const newListener = await listenerStore.createListener(payload2);
            if (newListener && newListener.status === "error") {
              notificationStore.error(`部署失败：配置错误`);
              return;
            }
            notificationStore.success(`监听器 ${name} 部署成功并已启动`);
          }
          emit("confirm");
          resetForm();
          return;
        }
        if (!["http", "https"].includes(protocol)) {
          notificationStore.error("当前 c2profile listener 只支持 HTTP / HTTPS");
          return;
        }
        if (!profile) {
          notificationStore.error("请选择 C2 Profile");
          return;
        }
        const host = validateHostOnly(form.value.host, "绑定地址 (Host)");
        if (!host) return;
        const port = parsePort(form.value.port, "监听端口");
        if (port === null) return;
        const callbackHost = validateHostOnly(form.value.callback_host, "回连地址 (Callback Host)", { allowUnspecified: false });
        if (!callbackHost) return;
        const callbackPort = parsePort(form.value.callback_port, "回连端口");
        if (callbackPort === null) return;
        let stagerConfig = void 0;
        if (profileRequiresStager.value) {
          const stager = form.value.stager || {};
          const stagerBindHost = validateHostOnly(stager.bind_host, "Stager 监听地址 (Bind Host)");
          if (!stagerBindHost) return;
          const stagerBindPort = parsePort(stager.bind_port, "Stager 监听端口");
          if (stagerBindPort === null) return;
          const stagerCallbackHost = validateHostOnly(stager.callback_host, "Stager 下载地址 (Callback Host)", { allowUnspecified: false });
          if (!stagerCallbackHost) return;
          const stagerCallbackPort = parsePort(stager.callback_port, "Stager 下载端口");
          if (stagerCallbackPort === null) return;
          stagerConfig = {
            bind_host: stagerBindHost,
            bind_port: stagerBindPort,
            callback_host: stagerCallbackHost,
            callback_port: stagerCallbackPort
          };
        }
        const payload = {
          name,
          protocol,
          listener_type: form.value.listener_type,
          profile,
          host,
          port,
          callback_host: callbackHost,
          callback_port: callbackPort,
          encrypt_key: encryptKey,
          ...form.value.ssl_cert ? { ssl_cert: form.value.ssl_cert } : {},
          ...form.value.ssl_key ? { ssl_key: form.value.ssl_key } : {},
          ...stagerConfig ? { stager: stagerConfig } : {}
        };
        if (isEdit.value) {
          await listenerStore.updateListener(payload);
          notificationStore.success(`监听器 ${name} 配置已成功热更新`);
        } else {
          const newListener = await listenerStore.createListener(payload);
          if (newListener && newListener.status === "error") {
            notificationStore.error(`部署失败：端口可能已被占用或配置错误`);
            return;
          }
          notificationStore.success(`监听器 ${name} 部署成功并已启动`);
        }
        emit("confirm");
        resetForm();
      } catch (err) {
        const msg = err.message || "操作失败，请检查 TeamServer 状态";
        if (!msg.includes("TeamServer")) {
          notificationStore.error(msg);
        }
        console.error("操作执行异常:", err);
      } finally {
        loading.value = false;
      }
    }
    function handleCancel() {
      emit("cancel");
      resetForm();
    }
    function resetForm() {
      form.value = defaultForm();
      if (!isEdit.value) {
        generateEncryptKey();
      }
    }
    return (_ctx, _cache) => {
      var _a;
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        createBaseVNode("div", _hoisted_2$1, [
          createBaseVNode("header", _hoisted_3$1, [
            createBaseVNode("div", _hoisted_4$1, [
              createBaseVNode("div", _hoisted_5$1, [
                createBaseVNode("span", _hoisted_6, toDisplayString(isEdit.value ? "📝" : "📡"), 1),
                createBaseVNode("div", null, [
                  _cache[17] || (_cache[17] = createBaseVNode("div", { class: "header-tag" }, "LISTENER CONFIG", -1)),
                  createBaseVNode("h2", null, toDisplayString(isEdit.value ? "编辑监听器" : "部署新监听器"), 1)
                ])
              ]),
              createBaseVNode("p", _hoisted_7, toDisplayString(isEdit.value ? "更新实例端点并重新解析 C2 Profile" : "选择 C2 Profile，填写实例端点和通信密钥"), 1)
            ]),
            createBaseVNode("button", {
              type: "button",
              class: "modal-close-btn",
              onClick: handleCancel,
              "aria-label": "取消",
              title: "取消"
            }, " × ")
          ]),
          createBaseVNode("div", _hoisted_8, [
            createBaseVNode("section", _hoisted_9, [
              createBaseVNode("div", _hoisted_10, [
                _cache[18] || (_cache[18] = createBaseVNode("h3", { class: "section-title" }, "基础信息", -1)),
                createBaseVNode("span", {
                  class: normalizeClass(["profile-badge", { stager: profileRequiresStager.value }])
                }, toDisplayString(form.value.profile), 3)
              ]),
              createBaseVNode("div", _hoisted_11, [
                createBaseVNode("div", _hoisted_12, [
                  createBaseVNode("label", null, "监听器名称 " + toDisplayString(isEdit.value ? "(不可更改)" : ""), 1),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.value.name = $event),
                    type: "text",
                    placeholder: "例如: LST-01",
                    class: "glass-input",
                    disabled: isEdit.value
                  }, null, 8, _hoisted_13), [
                    [vModelText, form.value.name]
                  ])
                ]),
                createBaseVNode("div", _hoisted_14, [
                  createBaseVNode("label", null, "传输协议 " + toDisplayString(isEdit.value ? "(不可更改)" : ""), 1),
                  withDirectives(createBaseVNode("select", {
                    "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.value.protocol = $event),
                    class: "glass-input",
                    disabled: isEdit.value
                  }, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(availableProtocols.value, (p) => {
                      return openBlock(), createElementBlock("option", {
                        key: p,
                        value: p.toLowerCase()
                      }, toDisplayString(p), 9, _hoisted_16);
                    }), 128))
                  ], 8, _hoisted_15), [
                    [vModelSelect, form.value.protocol]
                  ])
                ]),
                createBaseVNode("div", _hoisted_17, [
                  createBaseVNode("label", null, "监听器类型 " + toDisplayString(isEdit.value ? "(不可更改)" : ""), 1),
                  withDirectives(createBaseVNode("select", {
                    "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.value.listener_type = $event),
                    class: "glass-input ltype-select",
                    disabled: isEdit.value
                  }, [
                    (openBlock(), createElementBlock(Fragment, null, renderList(listenerTypes, (lt) => {
                      return createBaseVNode("option", {
                        key: lt.value,
                        value: lt.value
                      }, toDisplayString(lt.label), 9, _hoisted_19);
                    }), 64))
                  ], 8, _hoisted_18), [
                    [vModelSelect, form.value.listener_type]
                  ]),
                  createBaseVNode("p", _hoisted_20, toDisplayString((_a = listenerTypes.find((lt) => lt.value === form.value.listener_type)) == null ? void 0 : _a.desc), 1)
                ]),
                createBaseVNode("div", _hoisted_21, [
                  _cache[19] || (_cache[19] = createBaseVNode("label", null, "C2 Profile", -1)),
                  withDirectives(createBaseVNode("select", {
                    "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.value.profile = $event),
                    class: "glass-input"
                  }, [
                    (openBlock(), createElementBlock(Fragment, null, renderList(profileOptions, (profile) => {
                      return createBaseVNode("option", {
                        key: profile.value,
                        value: profile.value
                      }, toDisplayString(profile.label), 9, _hoisted_22);
                    }), 64))
                  ], 512), [
                    [vModelSelect, form.value.profile]
                  ]),
                  createBaseVNode("p", _hoisted_23, toDisplayString(profileDescription.value), 1)
                ])
              ]),
              form.value.listener_type === "internal" ? (openBlock(), createElementBlock("div", _hoisted_24, [..._cache[20] || (_cache[20] = [
                createBaseVNode("span", { class: "info-icon" }, "💡", -1),
                createBaseVNode("p", null, "Internal 类型监听器由 Beacon 承载，不占用 TeamServer 端口，仅作为 P2P 元数据存在。", -1)
              ])])) : createCommentVNode("", true),
              _cache[21] || (_cache[21] = createBaseVNode("div", { class: "profile-note" }, [
                createBaseVNode("span", { class: "note-icon" }, "📄"),
                createBaseVNode("span", null, "URI、User-Agent、响应头、sleep/jitter、Stager Base URI 等由 c2profile YAML 管理。")
              ], -1))
            ]),
            createBaseVNode("section", _hoisted_25, [
              _cache[33] || (_cache[33] = createBaseVNode("div", { class: "section-heading" }, [
                createBaseVNode("h3", { class: "section-title" }, "主 Listener 端点")
              ], -1)),
              isInternal.value && form.value.protocol === "smb" ? (openBlock(), createElementBlock("div", _hoisted_26, [
                createBaseVNode("div", _hoisted_27, [
                  _cache[23] || (_cache[23] = createBaseVNode("div", { class: "endpoint-head" }, [
                    createBaseVNode("span", null, "SMB Pipe"),
                    createBaseVNode("small", null, "Beacon 承载的命名管道")
                  ], -1)),
                  createBaseVNode("div", _hoisted_28, [
                    _cache[22] || (_cache[22] = createBaseVNode("label", null, "Pipe 名称", -1)),
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.value.pipe_name = $event),
                      type: "text",
                      class: "glass-input mono",
                      placeholder: "\\\\.\\pipe\\beacon_internal"
                    }, null, 512), [
                      [vModelText, form.value.pipe_name]
                    ])
                  ]),
                  _cache[24] || (_cache[24] = createBaseVNode("p", { class: "field-hint" }, "SMB 管道路径，由 Beacon 创建并监听。", -1))
                ])
              ])) : (openBlock(), createElementBlock("div", _hoisted_29, [
                createBaseVNode("div", _hoisted_30, [
                  createBaseVNode("div", _hoisted_31, [
                    _cache[25] || (_cache[25] = createBaseVNode("span", null, "Bind", -1)),
                    createBaseVNode("small", null, toDisplayString(isInternal.value ? "Beacon 本地监听" : "TeamServer 本地监听"), 1)
                  ]),
                  createBaseVNode("div", _hoisted_32, [
                    createBaseVNode("div", _hoisted_33, [
                      _cache[26] || (_cache[26] = createBaseVNode("label", null, "Host", -1)),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.value.host = $event),
                        type: "text",
                        class: "glass-input mono",
                        placeholder: "0.0.0.0"
                      }, null, 512), [
                        [vModelText, form.value.host]
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_34, [
                      _cache[27] || (_cache[27] = createBaseVNode("label", null, "Port", -1)),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.value.port = $event),
                        type: "number",
                        class: "glass-input mono",
                        placeholder: "4444"
                      }, null, 512), [
                        [vModelText, form.value.port]
                      ])
                    ])
                  ]),
                  _cache[28] || (_cache[28] = createBaseVNode("p", { class: "field-hint" }, "只填 host/IP，不要包含协议或端口。", -1))
                ]),
                !isInternal.value ? (openBlock(), createElementBlock("div", _hoisted_35, [
                  _cache[31] || (_cache[31] = createBaseVNode("div", { class: "endpoint-head" }, [
                    createBaseVNode("span", null, "Callback"),
                    createBaseVNode("small", null, "Beacon 实际访问")
                  ], -1)),
                  createBaseVNode("div", _hoisted_36, [
                    createBaseVNode("div", _hoisted_37, [
                      _cache[29] || (_cache[29] = createBaseVNode("label", null, "Host", -1)),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.value.callback_host = $event),
                        type: "text",
                        class: "glass-input mono",
                        placeholder: "192.168.1.10",
                        required: ""
                      }, null, 512), [
                        [vModelText, form.value.callback_host]
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_38, [
                      _cache[30] || (_cache[30] = createBaseVNode("label", null, "Port", -1)),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => form.value.callback_port = $event),
                        type: "number",
                        class: "glass-input mono",
                        placeholder: "4444"
                      }, null, 512), [
                        [vModelText, form.value.callback_port]
                      ])
                    ])
                  ]),
                  _cache[32] || (_cache[32] = createBaseVNode("p", { class: "field-hint" }, "不能使用 0.0.0.0 或 ::。", -1))
                ])) : createCommentVNode("", true)
              ]))
            ]),
            !isInternal.value && profileRequiresStager.value ? (openBlock(), createElementBlock("section", _hoisted_39, [
              _cache[40] || (_cache[40] = createBaseVNode("div", { class: "section-header" }, [
                createBaseVNode("h3", { class: "section-title" }, "HTTP Stager 端点")
              ], -1)),
              createBaseVNode("div", _hoisted_40, [
                createBaseVNode("div", _hoisted_41, [
                  _cache[36] || (_cache[36] = createBaseVNode("div", { class: "endpoint-head" }, [
                    createBaseVNode("span", null, "Stage Bind"),
                    createBaseVNode("small", null, "下载服务监听")
                  ], -1)),
                  createBaseVNode("div", _hoisted_42, [
                    createBaseVNode("div", _hoisted_43, [
                      _cache[34] || (_cache[34] = createBaseVNode("label", null, "Host", -1)),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.value.stager.bind_host = $event),
                        type: "text",
                        class: "glass-input mono",
                        placeholder: "0.0.0.0"
                      }, null, 512), [
                        [vModelText, form.value.stager.bind_host]
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_44, [
                      _cache[35] || (_cache[35] = createBaseVNode("label", null, "Port", -1)),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => form.value.stager.bind_port = $event),
                        type: "number",
                        class: "glass-input mono",
                        min: "1",
                        max: "65535"
                      }, null, 512), [
                        [vModelText, form.value.stager.bind_port]
                      ])
                    ])
                  ])
                ]),
                createBaseVNode("div", _hoisted_45, [
                  _cache[39] || (_cache[39] = createBaseVNode("div", { class: "endpoint-head" }, [
                    createBaseVNode("span", null, "Stage Callback"),
                    createBaseVNode("small", null, "Beacon 下载 stage")
                  ], -1)),
                  createBaseVNode("div", _hoisted_46, [
                    createBaseVNode("div", _hoisted_47, [
                      _cache[37] || (_cache[37] = createBaseVNode("label", null, "Host", -1)),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => form.value.stager.callback_host = $event),
                        type: "text",
                        class: "glass-input mono",
                        placeholder: "192.168.1.10"
                      }, null, 512), [
                        [vModelText, form.value.stager.callback_host]
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_48, [
                      _cache[38] || (_cache[38] = createBaseVNode("label", null, "Port", -1)),
                      withDirectives(createBaseVNode("input", {
                        "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => form.value.stager.callback_port = $event),
                        type: "number",
                        class: "glass-input mono",
                        min: "1",
                        max: "65535"
                      }, null, 512), [
                        [vModelText, form.value.stager.callback_port]
                      ])
                    ])
                  ])
                ])
              ]),
              _cache[41] || (_cache[41] = createBaseVNode("p", { class: "field-hint inline-hint" }, "base_uri、HTTPS、chunk size 等来自 c2profile。", -1))
            ])) : createCommentVNode("", true),
            !isInternal.value ? (openBlock(), createElementBlock("section", _hoisted_49, [
              _cache[44] || (_cache[44] = createBaseVNode("div", { class: "section-heading" }, [
                createBaseVNode("h3", { class: "section-title" }, "安全加密")
              ], -1)),
              createBaseVNode("div", _hoisted_50, [
                createBaseVNode("div", _hoisted_51, [
                  _cache[42] || (_cache[42] = createBaseVNode("label", null, "通信加密密钥 (AES Key)", -1)),
                  createBaseVNode("div", _hoisted_52, [
                    withDirectives(createBaseVNode("input", {
                      "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => form.value.encrypt_key = $event),
                      type: "text",
                      class: "glass-input mono",
                      placeholder: "00112233445566778899aabbccddeeff"
                    }, null, 512), [
                      [vModelText, form.value.encrypt_key]
                    ]),
                    createBaseVNode("button", {
                      type: "button",
                      onClick: generateEncryptKey,
                      class: "btn-small glass-btn",
                      title: "重新生成密钥"
                    }, "重新生成")
                  ]),
                  _cache[43] || (_cache[43] = createBaseVNode("p", { class: "field-hint" }, "实例级密钥，不来自 c2profile。", -1))
                ])
              ])
            ])) : createCommentVNode("", true),
            !isInternal.value ? (openBlock(), createElementBlock("div", {
              key: 2,
              class: "advanced-toggle",
              onClick: _cache[14] || (_cache[14] = ($event) => showAdvanced.value = !showAdvanced.value)
            }, [
              createBaseVNode("span", null, toDisplayString(showAdvanced.value ? "收起" : "展开") + " TLS 证书", 1)
            ])) : createCommentVNode("", true),
            showAdvanced.value ? (openBlock(), createElementBlock("div", _hoisted_53, [
              createBaseVNode("section", _hoisted_54, [
                _cache[47] || (_cache[47] = createBaseVNode("h3", { class: "section-title" }, "SSL 证书链 (PEM 格式)", -1)),
                _cache[48] || (_cache[48] = createBaseVNode("p", { class: "field-hint" }, "仅 protocol=https 时使用；留空则由后端按当前能力处理。", -1)),
                createBaseVNode("div", _hoisted_55, [
                  createBaseVNode("div", _hoisted_56, [
                    _cache[45] || (_cache[45] = createBaseVNode("label", null, "SSL Certificate", -1)),
                    withDirectives(createBaseVNode("textarea", {
                      "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => form.value.ssl_cert = $event),
                      class: "glass-input area mono",
                      placeholder: "-----BEGIN CERTIFICATE-----"
                    }, null, 512), [
                      [vModelText, form.value.ssl_cert]
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_57, [
                    _cache[46] || (_cache[46] = createBaseVNode("label", null, "SSL Private Key", -1)),
                    withDirectives(createBaseVNode("textarea", {
                      "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => form.value.ssl_key = $event),
                      class: "glass-input area mono",
                      placeholder: "-----BEGIN PRIVATE KEY-----"
                    }, null, 512), [
                      [vModelText, form.value.ssl_key]
                    ])
                  ])
                ])
              ])
            ])) : createCommentVNode("", true)
          ]),
          createBaseVNode("footer", _hoisted_58, [
            createBaseVNode("button", {
              class: "btn btn-ghost",
              onClick: handleCancel,
              disabled: loading.value
            }, "取消", 8, _hoisted_59),
            createBaseVNode("button", {
              class: "btn btn-primary",
              onClick: handleConfirm,
              disabled: loading.value
            }, [
              loading.value ? (openBlock(), createElementBlock("span", _hoisted_61)) : createCommentVNode("", true),
              createTextVNode(" " + toDisplayString(loading.value ? "保存中..." : isEdit.value ? "保存更改" : "确认部署"), 1)
            ], 8, _hoisted_60)
          ])
        ])
      ]);
    };
  }
};
const ListenerDialog = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-44ec45cb"]]);
const _hoisted_1 = { class: "listener-page" };
const _hoisted_2 = { class: "page-header" };
const _hoisted_3 = { class: "header-actions" };
const _hoisted_4 = ["disabled"];
const _hoisted_5 = { class: "list-section glass-card" };
const _sfc_main = {
  __name: "ListenerPage",
  setup(__props) {
    const listenerStore = useListenerStore();
    const modalStore = useModalStore();
    const showDialog = ref(false);
    const editingListener = ref(null);
    function handleCreate() {
      closeDialog();
    }
    function handleEdit(listener) {
      editingListener.value = listener;
      showDialog.value = true;
    }
    function closeDialog() {
      showDialog.value = false;
      editingListener.value = null;
    }
    async function handleDelete(name) {
      await listenerStore.deleteListener(name);
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("div", _hoisted_2, [
          _cache[4] || (_cache[4] = createBaseVNode("div", { class: "page-title" }, [
            createBaseVNode("span", { class: "icon" }, "📡"),
            createBaseVNode("span", null, "监听器管理")
          ], -1)),
          createBaseVNode("div", _hoisted_3, [
            createBaseVNode("button", {
              class: "btn btn-ghost",
              onClick: _cache[0] || (_cache[0] = ($event) => unref(listenerStore).fetchListeners()),
              title: "刷新列表",
              disabled: unref(listenerStore).loading
            }, [
              (openBlock(), createElementBlock("svg", {
                class: normalizeClass({ "spin": unref(listenerStore).loading }),
                width: "16",
                height: "16",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                "stroke-width": "2"
              }, [..._cache[2] || (_cache[2] = [
                createBaseVNode("path", { d: "M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" }, null, -1)
              ])], 2))
            ], 8, _hoisted_4),
            createBaseVNode("button", {
              class: "btn btn-primary",
              onClick: _cache[1] || (_cache[1] = ($event) => showDialog.value = true)
            }, [..._cache[3] || (_cache[3] = [
              createBaseVNode("svg", {
                width: "14",
                height: "14",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                "stroke-width": "2.5"
              }, [
                createBaseVNode("line", {
                  x1: "12",
                  y1: "5",
                  x2: "12",
                  y2: "19"
                }),
                createBaseVNode("line", {
                  x1: "5",
                  y1: "12",
                  x2: "19",
                  y2: "12"
                })
              ], -1),
              createTextVNode(" 新建监听器 ", -1)
            ])])
          ])
        ]),
        createBaseVNode("div", _hoisted_5, [
          createVNode(ListenerList, {
            listeners: unref(listenerStore).listeners,
            onDelete: handleDelete,
            onEdit: handleEdit
          }, null, 8, ["listeners"])
        ]),
        showDialog.value ? (openBlock(), createBlock(ListenerDialog, {
          key: 0,
          "edit-data": editingListener.value,
          onConfirm: handleCreate,
          onCancel: closeDialog
        }, null, 8, ["edit-data"])) : createCommentVNode("", true),
        unref(modalStore).generateBeaconVisible ? (openBlock(), createBlock(GenerateBeaconModal, { key: 1 })) : createCommentVNode("", true)
      ]);
    };
  }
};
const ListenerPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-b5b5c44e"]]);
export {
  ListenerPage as default
};
