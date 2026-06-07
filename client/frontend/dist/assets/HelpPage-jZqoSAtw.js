import { _ as _export_sfc, u as useAuthStore, a as useWSStore, i as useAgentStore, I as usePluginStore, Y as useThemeStore, L as useNotificationStore, o as openBlock, c as createElementBlock, b as createBaseVNode, z as createStaticVNode, F as Fragment, p as renderList, g as unref, f as createCommentVNode, t as toDisplayString, n as normalizeClass, e as createTextVNode, Z as Browser, s as computed, r as ref, $ as COMMAND_HELP } from "./index-CTSqJF0U.js";
const _hoisted_1 = { class: "help-page" };
const _hoisted_2 = { class: "help-body" };
const _hoisted_3 = { class: "data-table cmd-table" };
const _hoisted_4 = { class: "cmd-name" };
const _hoisted_5 = { class: "cmd-usage" };
const _hoisted_6 = { class: "cmd-actions" };
const _hoisted_7 = ["onClick"];
const _hoisted_8 = ["onClick"];
const _hoisted_9 = { key: 0 };
const _hoisted_10 = {
  colspan: "4",
  class: "cmd-notes-cell"
};
const _hoisted_11 = { class: "cmd-notes" };
const _hoisted_12 = {
  key: 0,
  class: "diag-warning"
};
const _hoisted_13 = { class: "diag-grid" };
const _hoisted_14 = { class: "diag-item" };
const _hoisted_15 = { class: "diag-value" };
const _hoisted_16 = { class: "diag-item" };
const _hoisted_17 = { class: "diag-value" };
const _hoisted_18 = { class: "diag-item" };
const _hoisted_19 = { class: "diag-value" };
const _hoisted_20 = { class: "diag-item" };
const _hoisted_21 = { class: "diag-value" };
const _hoisted_22 = { class: "diag-item" };
const _hoisted_23 = { class: "diag-value" };
const _hoisted_24 = { class: "diag-item" };
const _hoisted_25 = { class: "diag-value" };
const _hoisted_26 = { class: "diag-item" };
const _hoisted_27 = { class: "diag-value" };
const _hoisted_28 = { class: "about-line" };
const _sfc_main = {
  __name: "HelpPage",
  setup(__props) {
    const authStore = useAuthStore();
    const wsStore = useWSStore();
    const agentStore = useAgentStore();
    const pluginStore = usePluginStore();
    const themeStore = useThemeStore();
    const notificationStore = useNotificationStore();
    const expandedCommands = ref(/* @__PURE__ */ new Set());
    const commandList = computed(
      () => Object.entries(COMMAND_HELP).filter(([name]) => name !== "HELP").map(([name, info]) => ({
        name: name.toLowerCase(),
        usage: info.usage,
        desc: info.desc,
        notes: info.notes
      }))
    );
    const platformLabel = computed(() => {
      const ua = navigator.userAgent || "";
      if (ua.includes("Mac")) return "macOS";
      if (ua.includes("Linux")) return "Linux";
      return "Windows";
    });
    const wsStatusLabel = computed(() => {
      switch (wsStore.status) {
        case "open":
          return { label: "已连接", cls: "tag-success" };
        case "connecting":
          return { label: "连接中", cls: "tag-warning" };
        case "error":
          return { label: "连接失败", cls: "tag-danger" };
        default:
          return { label: "未连接", cls: "tag-danger" };
      }
    });
    function toggleCommand(name) {
      if (expandedCommands.value.has(name)) expandedCommands.value.delete(name);
      else expandedCommands.value.add(name);
    }
    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        notificationStore.success("已复制");
      } catch {
        notificationStore.error("复制失败");
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        _cache[14] || (_cache[14] = createBaseVNode("div", { class: "page-header" }, [
          createBaseVNode("div", { class: "page-title" }, [
            createBaseVNode("span", { class: "icon" }, "❓"),
            createBaseVNode("span", null, "帮助")
          ])
        ], -1)),
        createBaseVNode("div", _hoisted_2, [
          _cache[11] || (_cache[11] = createStaticVNode('<h2 class="help-section-title" data-v-a0f9bb51>快速开始</h2><ol class="quick-list" data-v-a0f9bb51><li data-v-a0f9bb51><strong data-v-a0f9bb51>登录</strong> — 启动客户端后，在登录页填入 TeamServer 地址（如 <code data-v-a0f9bb51>https://192.168.1.100:8080</code>）和凭证，点击登录</li><li data-v-a0f9bb51><strong data-v-a0f9bb51>创建监听器</strong> — 进入「生成监听器」页面，新建 HTTP 或 HTTPS 监听器（填入监听地址和端口）</li><li data-v-a0f9bb51><strong data-v-a0f9bb51>生成 Payload</strong> — 在监听器卡片上点击「生成 Beacon」，选择架构和输出格式（EXE/DLL/Shellcode），下载到目标机执行</li><li data-v-a0f9bb51><strong data-v-a0f9bb51>等待上线</strong> — 目标机运行 Payload 后，仪表盘会自动显示新上线的 Agent（绿色圆点 = 在线）</li><li data-v-a0f9bb51><strong data-v-a0f9bb51>交互操作</strong> — 右键 Agent 行打开菜单：控制台、文件浏览器、进程管理、网络信息、截图、BOF 执行等</li><li data-v-a0f9bb51><strong data-v-a0f9bb51>执行命令</strong> — 在控制台中输入命令回车发送，输入 <code data-v-a0f9bb51>help</code> 查看所有可用命令</li></ol><h2 class="help-section-title" data-v-a0f9bb51>功能说明</h2><table class="feature-table" data-v-a0f9bb51><tbody data-v-a0f9bb51><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>仪表盘</td><td data-v-a0f9bb51>Agent 列表与状态总览。支持按主机名/IP/用户名搜索过滤。右键菜单提供：打开控制台、文件浏览、进程管理、网络浏览器、修改 Sleep、截图、执行 BOF、级联连接、退出/删除会话等操作</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>拓扑图</td><td data-v-a0f9bb51>以图形方式展示 Agent 之间的级联关系。节点可拖拽布局，右键节点可执行与仪表盘相同的操作。支持级联链路的 TCP/SMB 连接可视化</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>生成监听器</td><td data-v-a0f9bb51>管理 HTTP/HTTPS/DNS/ExternalC2/SMB 等协议的监听器。创建监听器后，从卡片上生成 Beacon Payload（支持 EXE、DLL、Shellcode 等格式）</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>Proxy Pivot</td><td data-v-a0f9bb51>通过 Beacon 建立 SOCKS5 代理或端口转发隧道。支持创建、暂停、恢复、停止隧道。可查看隧道状态、已传输字节数和断开原因</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>Screenshots</td><td data-v-a0f9bb51>Beacon 截图列表，支持按 Agent 过滤、大图预览、保存到本地、请求新截图、删除</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>下载文件</td><td data-v-a0f9bb51>通过 <code data-v-a0f9bb51>download</code> 命令回传的文件列表，点击保存可导出到本地磁盘</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>插件</td><td data-v-a0f9bb51>添加含 <code data-v-a0f9bb51>plugin.json</code> 的目录即可注册插件。插件动作会出现在 Agent 右键菜单中，支持 BOF 执行和自定义参数输入</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>帮助</td><td data-v-a0f9bb51>当前页面。查看命令参考、系统诊断信息、功能说明</td></tr></tbody></table><h2 class="help-section-title" data-v-a0f9bb51>Agent 右键菜单</h2><table class="feature-table" data-v-a0f9bb51><tbody data-v-a0f9bb51><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>打开控制台</td><td data-v-a0f9bb51>打开该 Agent 的交互式控制台，可输入命令并查看输出</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>文件浏览器</td><td data-v-a0f9bb51>浏览远程文件系统，支持导航、下载、上传、删除、创建文件夹、压缩 ZIP、修改属性</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>进程浏览器</td><td data-v-a0f9bb51>查看远程进程列表，支持搜索、排序、终止进程</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>网络浏览器</td><td data-v-a0f9bb51>查看网络接口信息和活动网络连接</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>修改 Sleep</td><td data-v-a0f9bb51>调整 Beacon 心跳间隔（毫秒）和抖动比例</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>截图</td><td data-v-a0f9bb51>请求并获取远程屏幕截图</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>执行 BOF</td><td data-v-a0f9bb51>打开 BOF 执行对话框，选择 Beacon Object File 并传入参数执行</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>级联连接</td><td data-v-a0f9bb51>通过 TCP 或 SMB 管道连接子 Beacon，构建多层代理链路</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>插件动作</td><td data-v-a0f9bb51>执行已注册的插件动作（如有参数则弹出输入对话框）</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>退出会话</td><td data-v-a0f9bb51>下发 exit 指令，终止目标机上的 Beacon 进程（不可恢复）</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>删除会话</td><td data-v-a0f9bb51>注销并删除 Agent 记录，同步清理服务端缓存（不可撤销）</td></tr></tbody></table><h2 class="help-section-title" data-v-a0f9bb51>控制台快捷操作</h2><table class="feature-table" data-v-a0f9bb51><tbody data-v-a0f9bb51><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>↑ / ↓</td><td data-v-a0f9bb51>翻阅历史命令</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>Tab</td><td data-v-a0f9bb51>命令名自动补全（循环匹配）</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>Enter</td><td data-v-a0f9bb51>发送命令</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>help</td><td data-v-a0f9bb51>显示所有可用命令帮助</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>help &lt;cmd&gt;</td><td data-v-a0f9bb51>显示指定命令的详细用法</td></tr><tr data-v-a0f9bb51><td class="ft-name" data-v-a0f9bb51>exec-bof</td><td data-v-a0f9bb51>打开 BOF 执行对话框（本地命令，不发送到 Beacon）</td></tr></tbody></table><h2 class="help-section-title" data-v-a0f9bb51>命令参考</h2>', 9)),
          createBaseVNode("table", _hoisted_3, [
            _cache[1] || (_cache[1] = createBaseVNode("thead", null, [
              createBaseVNode("tr", null, [
                createBaseVNode("th", null, "命令"),
                createBaseVNode("th", null, "用法"),
                createBaseVNode("th", null, "说明"),
                createBaseVNode("th")
              ])
            ], -1)),
            createBaseVNode("tbody", null, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(commandList.value, (cmd) => {
                return openBlock(), createElementBlock(Fragment, {
                  key: cmd.name
                }, [
                  createBaseVNode("tr", null, [
                    createBaseVNode("td", _hoisted_4, toDisplayString(cmd.name), 1),
                    createBaseVNode("td", null, [
                      createBaseVNode("code", _hoisted_5, toDisplayString(cmd.usage), 1)
                    ]),
                    createBaseVNode("td", null, toDisplayString(cmd.desc), 1),
                    createBaseVNode("td", _hoisted_6, [
                      createBaseVNode("button", {
                        type: "button",
                        class: "btn btn-ghost btn-sm",
                        onClick: ($event) => copyText(cmd.usage)
                      }, "复制", 8, _hoisted_7),
                      cmd.notes ? (openBlock(), createElementBlock("button", {
                        key: 0,
                        type: "button",
                        class: "btn btn-ghost btn-sm",
                        onClick: ($event) => toggleCommand(cmd.name)
                      }, toDisplayString(expandedCommands.value.has(cmd.name) ? "收起" : "详情"), 9, _hoisted_8)) : createCommentVNode("", true)
                    ])
                  ]),
                  expandedCommands.value.has(cmd.name) && cmd.notes ? (openBlock(), createElementBlock("tr", _hoisted_9, [
                    createBaseVNode("td", _hoisted_10, [
                      createBaseVNode("pre", _hoisted_11, toDisplayString(cmd.notes), 1)
                    ])
                  ])) : createCommentVNode("", true)
                ], 64);
              }), 128))
            ])
          ]),
          _cache[12] || (_cache[12] = createBaseVNode("h2", { class: "help-section-title" }, "系统诊断", -1)),
          unref(wsStore).status !== "open" ? (openBlock(), createElementBlock("div", _hoisted_12, " WebSocket 未连接，部分功能可能不可用 ")) : createCommentVNode("", true),
          createBaseVNode("div", _hoisted_13, [
            _cache[9] || (_cache[9] = createBaseVNode("div", { class: "diag-item" }, [
              createBaseVNode("span", { class: "diag-label" }, "版本"),
              createBaseVNode("span", { class: "diag-value" }, "v0.0.1")
            ], -1)),
            createBaseVNode("div", _hoisted_14, [
              _cache[2] || (_cache[2] = createBaseVNode("span", { class: "diag-label" }, "平台", -1)),
              createBaseVNode("span", _hoisted_15, toDisplayString(platformLabel.value), 1)
            ]),
            createBaseVNode("div", _hoisted_16, [
              _cache[3] || (_cache[3] = createBaseVNode("span", { class: "diag-label" }, "主题", -1)),
              createBaseVNode("span", _hoisted_17, toDisplayString(unref(themeStore).label), 1)
            ]),
            createBaseVNode("div", _hoisted_18, [
              _cache[4] || (_cache[4] = createBaseVNode("span", { class: "diag-label" }, "TeamServer", -1)),
              createBaseVNode("span", _hoisted_19, toDisplayString(unref(authStore).apiBase || "未配置"), 1)
            ]),
            createBaseVNode("div", _hoisted_20, [
              _cache[5] || (_cache[5] = createBaseVNode("span", { class: "diag-label" }, "登录状态", -1)),
              createBaseVNode("span", _hoisted_21, toDisplayString(unref(authStore).isLoggedIn ? "已登录" : "未登录"), 1)
            ]),
            createBaseVNode("div", _hoisted_22, [
              _cache[6] || (_cache[6] = createBaseVNode("span", { class: "diag-label" }, "WebSocket", -1)),
              createBaseVNode("span", _hoisted_23, [
                createBaseVNode("span", {
                  class: normalizeClass(["status-dot", unref(wsStore).status === "open" ? "online" : "offline"])
                }, null, 2),
                createTextVNode(" " + toDisplayString(wsStatusLabel.value.label), 1)
              ])
            ]),
            createBaseVNode("div", _hoisted_24, [
              _cache[7] || (_cache[7] = createBaseVNode("span", { class: "diag-label" }, "Agent", -1)),
              createBaseVNode("span", _hoisted_25, "在线 " + toDisplayString(unref(agentStore).onlineCount) + " / 级联 " + toDisplayString(unref(agentStore).cascadeCount) + " / 全部 " + toDisplayString(unref(agentStore).agents.length), 1)
            ]),
            createBaseVNode("div", _hoisted_26, [
              _cache[8] || (_cache[8] = createBaseVNode("span", { class: "diag-label" }, "插件", -1)),
              createBaseVNode("span", _hoisted_27, toDisplayString(unref(pluginStore).plugins.length), 1)
            ])
          ]),
          _cache[13] || (_cache[13] = createBaseVNode("div", { class: "about-line" }, "Iris Client v0.0.1 · Wails 3 + Vue 3 · Windows / macOS / Linux", -1)),
          createBaseVNode("div", _hoisted_28, [
            _cache[10] || (_cache[10] = createTextVNode("作者：", -1)),
            createBaseVNode("button", {
              type: "button",
              class: "about-link",
              onClick: _cache[0] || (_cache[0] = ($event) => unref(Browser).OpenURL("https://github.com/onedays12"))
            }, "oneday")
          ])
        ])
      ]);
    };
  }
};
const HelpPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-a0f9bb51"]]);
export {
  HelpPage as default
};
