import { _ as _export_sfc, u as useAuthStore, a as useWSStore, r as ref, o as openBlock, c as createElementBlock, b as createBaseVNode, w as withModifiers, n as normalizeClass, d as withDirectives, v as vModelText, e as createTextVNode, t as toDisplayString, f as createCommentVNode, F as Fragment, g as unref, h as useRouter, O as OpenURL, l as login } from "./index-CTSqJF0U.js";
const _hoisted_1 = { class: "login-container" };
const _hoisted_2 = { class: "login-card glass-card" };
const _hoisted_3 = { class: "input-wrapper" };
const _hoisted_4 = { class: "input-wrapper" };
const _hoisted_5 = { class: "input-wrapper" };
const _hoisted_6 = {
  key: 0,
  class: "error-info"
};
const _hoisted_7 = ["disabled"];
const _hoisted_8 = { key: 0 };
const _hoisted_9 = {
  key: 2,
  class: "loader"
};
const _sfc_main = {
  __name: "LoginPage",
  setup(__props) {
    const router = useRouter();
    const authStore = useAuthStore();
    const wsStore = useWSStore();
    const username = ref("admin");
    const password = ref("");
    const serverUrl = ref(authStore.apiBase || "https://127.0.0.1:8080");
    const isLoading = ref(false);
    const isWSConnecting = ref(false);
    const showSkipButton = ref(false);
    const errorMsg = ref("");
    async function handleLogin() {
      if (!username.value || !password.value) {
        errorMsg.value = "请输入用户名和密码";
        return;
      }
      isLoading.value = true;
      errorMsg.value = "";
      try {
        authStore.setApiBase(serverUrl.value);
        const data = await login(username.value, password.value);
        if (data && data.token) {
          authStore.setToken(data.token);
          isWSConnecting.value = true;
          showSkipButton.value = false;
          await wsStore.waitForConnection();
          router.push("/dashboard");
        } else {
          throw new Error("未获取到有效凭证");
        }
      } catch (err) {
        errorMsg.value = err.message || "登录失败，请检查 TeamServer 状态";
        if (isWSConnecting.value) {
          showSkipButton.value = true;
        }
        if (!isWSConnecting.value) {
          authStore.logout();
        }
        wsStore.disconnect();
      } finally {
        isLoading.value = false;
        isWSConnecting.value = false;
      }
    }
    function openAuthorHome() {
      OpenURL("https://github.com/onedays12");
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        _cache[15] || (_cache[15] = createBaseVNode("div", { class: "background-decor" }, [
          createBaseVNode("div", { class: "blob blob-1" }),
          createBaseVNode("div", { class: "blob blob-2" }),
          createBaseVNode("div", { class: "blob blob-3" })
        ], -1)),
        createBaseVNode("div", _hoisted_2, [
          _cache[14] || (_cache[14] = createBaseVNode("header", { class: "login-header" }, [
            createBaseVNode("div", { class: "logo" }, [
              createBaseVNode("span", { class: "logo-icon" }, "💠"),
              createBaseVNode("h1", null, "TeamServer")
            ]),
            createBaseVNode("p", { class: "subtitle" }, "终端认证管理系统")
          ], -1)),
          createBaseVNode("form", {
            class: "login-form",
            onSubmit: withModifiers(handleLogin, ["prevent"])
          }, [
            createBaseVNode("div", {
              class: normalizeClass(["form-group", { "has-error": errorMsg.value && !serverUrl.value }])
            }, [
              _cache[5] || (_cache[5] = createBaseVNode("label", null, "服务器地址", -1)),
              createBaseVNode("div", _hoisted_3, [
                _cache[4] || (_cache[4] = createBaseVNode("span", { class: "input-icon" }, "🌐", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => serverUrl.value = $event),
                  type: "text",
                  placeholder: "例如: https://127.0.0.1:8080"
                }, null, 512), [
                  [vModelText, serverUrl.value]
                ])
              ])
            ], 2),
            createBaseVNode("div", {
              class: normalizeClass(["form-group", { "has-error": errorMsg.value && !username.value }])
            }, [
              _cache[7] || (_cache[7] = createBaseVNode("label", null, "用户名", -1)),
              createBaseVNode("div", _hoisted_4, [
                _cache[6] || (_cache[6] = createBaseVNode("span", { class: "input-icon" }, "👤", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => username.value = $event),
                  type: "text",
                  placeholder: "请输入管理员账号",
                  autocomplete: "username"
                }, null, 512), [
                  [vModelText, username.value]
                ])
              ])
            ], 2),
            createBaseVNode("div", {
              class: normalizeClass(["form-group", { "has-error": errorMsg.value && !password.value }])
            }, [
              _cache[9] || (_cache[9] = createBaseVNode("label", null, "密码", -1)),
              createBaseVNode("div", _hoisted_5, [
                _cache[8] || (_cache[8] = createBaseVNode("span", { class: "input-icon" }, "🔒", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => password.value = $event),
                  type: "password",
                  placeholder: "请输入访问秘钥",
                  autocomplete: "current-password"
                }, null, 512), [
                  [vModelText, password.value]
                ])
              ])
            ], 2),
            errorMsg.value ? (openBlock(), createElementBlock("div", _hoisted_6, [
              _cache[10] || (_cache[10] = createBaseVNode("span", { class: "error-icon" }, "⚠️", -1)),
              createTextVNode(" " + toDisplayString(errorMsg.value), 1)
            ])) : createCommentVNode("", true),
            createBaseVNode("button", {
              class: "login-btn",
              type: "submit",
              disabled: isLoading.value || isWSConnecting.value
            }, [
              !isLoading.value && !isWSConnecting.value ? (openBlock(), createElementBlock("span", _hoisted_8, "立即验证")) : isWSConnecting.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                _cache[11] || (_cache[11] = createBaseVNode("div", { class: "loader sm" }, null, -1)),
                _cache[12] || (_cache[12] = createBaseVNode("span", null, "建立受控链路...", -1))
              ], 64)) : (openBlock(), createElementBlock("div", _hoisted_9))
            ], 8, _hoisted_7),
            showSkipButton.value ? (openBlock(), createElementBlock("button", {
              key: 1,
              class: "skip-btn",
              type: "button",
              onClick: _cache[3] || (_cache[3] = ($event) => unref(router).push("/dashboard"))
            }, " 跳过链路检查，直接进入系统 ")) : createCommentVNode("", true)
          ], 32),
          createBaseVNode("footer", { class: "login-footer" }, [
            createBaseVNode("p", null, [
              _cache[13] || (_cache[13] = createTextVNode(" © 2026 制作 by ", -1)),
              createBaseVNode("button", {
                type: "button",
                class: "author-link",
                onClick: openAuthorHome
              }, "oneday")
            ])
          ])
        ])
      ]);
    };
  }
};
const LoginPage = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-87652b69"]]);
export {
  LoginPage as default
};
