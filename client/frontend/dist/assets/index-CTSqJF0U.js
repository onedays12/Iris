const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/LoginPage-d_-LKDn_.js","assets/LoginPage-CS2xXmea.css","assets/DashboardPage-B_VDltEI.js","assets/BeaconContextMenu-BGXLuO9Y.js","assets/BeaconContextMenu-eZDjQSXO.css","assets/DashboardPage-Bx18ql8G.css","assets/TopologyPage-B63-G9CB.js","assets/TopologyPage-DrNJ3Zph.css","assets/ListenerPage-B4cdmFem.js","assets/ListenerPage-Bb7uKpvx.css","assets/ProxyPivotPage-BYOT3Q2p.js","assets/tunnel-BWdkVgeu.js","assets/ProxyPivotPage-DhckPtz0.css","assets/ScreenshotsPage-7eJUhfpR.js","assets/screenshot-kLHFs45O.js","assets/ScreenshotsPage-BMVxBNt1.css","assets/DownloadsPage-B88WwlX2.js","assets/DownloadsPage-DysVvpKh.css","assets/PluginsPage-CWy930a3.js","assets/PluginsPage-BtJlaYjU.css","assets/HelpPage-jZqoSAtw.js","assets/HelpPage-DSrzT1Ah.css"])))=>i.map(i=>d[i]);
(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
/**
* @vue/shared v3.5.32
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
// @__NO_SIDE_EFFECTS__
function makeMap(str) {
  const map = /* @__PURE__ */ Object.create(null);
  for (const key of str.split(",")) map[key] = 1;
  return (val) => val in map;
}
const EMPTY_OBJ = {};
const EMPTY_ARR = [];
const NOOP = () => {
};
const NO = () => false;
const isOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && // uppercase letter
(key.charCodeAt(2) > 122 || key.charCodeAt(2) < 97);
const isModelListener = (key) => key.startsWith("onUpdate:");
const extend = Object.assign;
const remove = (arr, el) => {
  const i = arr.indexOf(el);
  if (i > -1) {
    arr.splice(i, 1);
  }
};
const hasOwnProperty$1 = Object.prototype.hasOwnProperty;
const hasOwn = (val, key) => hasOwnProperty$1.call(val, key);
const isArray$1 = Array.isArray;
const isMap = (val) => toTypeString(val) === "[object Map]";
const isSet = (val) => toTypeString(val) === "[object Set]";
const isDate = (val) => toTypeString(val) === "[object Date]";
const isFunction = (val) => typeof val === "function";
const isString = (val) => typeof val === "string";
const isSymbol = (val) => typeof val === "symbol";
const isObject = (val) => val !== null && typeof val === "object";
const isPromise = (val) => {
  return (isObject(val) || isFunction(val)) && isFunction(val.then) && isFunction(val.catch);
};
const objectToString = Object.prototype.toString;
const toTypeString = (value) => objectToString.call(value);
const toRawType = (value) => {
  return toTypeString(value).slice(8, -1);
};
const isPlainObject$1 = (val) => toTypeString(val) === "[object Object]";
const isIntegerKey = (key) => isString(key) && key !== "NaN" && key[0] !== "-" && "" + parseInt(key, 10) === key;
const isReservedProp = /* @__PURE__ */ makeMap(
  // the leading comma is intentional so empty string "" is also included
  ",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"
);
const cacheStringFunction = (fn) => {
  const cache = /* @__PURE__ */ Object.create(null);
  return (str) => {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  };
};
const camelizeRE = /-\w/g;
const camelize = cacheStringFunction(
  (str) => {
    return str.replace(camelizeRE, (c) => c.slice(1).toUpperCase());
  }
);
const hyphenateRE = /\B([A-Z])/g;
const hyphenate = cacheStringFunction(
  (str) => str.replace(hyphenateRE, "-$1").toLowerCase()
);
const capitalize = cacheStringFunction((str) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
});
const toHandlerKey = cacheStringFunction(
  (str) => {
    const s = str ? `on${capitalize(str)}` : ``;
    return s;
  }
);
const hasChanged = (value, oldValue) => !Object.is(value, oldValue);
const invokeArrayFns = (fns, ...arg) => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](...arg);
  }
};
const def = (obj, key, value, writable = false) => {
  Object.defineProperty(obj, key, {
    configurable: true,
    enumerable: false,
    writable,
    value
  });
};
const looseToNumber = (val) => {
  const n = parseFloat(val);
  return isNaN(n) ? val : n;
};
const toNumber$1 = (val) => {
  const n = isString(val) ? Number(val) : NaN;
  return isNaN(n) ? val : n;
};
let _globalThis;
const getGlobalThis = () => {
  return _globalThis || (_globalThis = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
};
function normalizeStyle(value) {
  if (isArray$1(value)) {
    const res = {};
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const normalized = isString(item) ? parseStringStyle(item) : normalizeStyle(item);
      if (normalized) {
        for (const key in normalized) {
          res[key] = normalized[key];
        }
      }
    }
    return res;
  } else if (isString(value) || isObject(value)) {
    return value;
  }
}
const listDelimiterRE = /;(?![^(]*\))/g;
const propertyDelimiterRE = /:([^]+)/;
const styleCommentRE = /\/\*[^]*?\*\//g;
function parseStringStyle(cssText) {
  const ret = {};
  cssText.replace(styleCommentRE, "").split(listDelimiterRE).forEach((item) => {
    if (item) {
      const tmp = item.split(propertyDelimiterRE);
      tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim());
    }
  });
  return ret;
}
function normalizeClass(value) {
  let res = "";
  if (isString(value)) {
    res = value;
  } else if (isArray$1(value)) {
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i]);
      if (normalized) {
        res += normalized + " ";
      }
    }
  } else if (isObject(value)) {
    for (const name in value) {
      if (value[name]) {
        res += name + " ";
      }
    }
  }
  return res.trim();
}
const specialBooleanAttrs = `itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly`;
const isSpecialBooleanAttr = /* @__PURE__ */ makeMap(specialBooleanAttrs);
function includeBooleanAttr(value) {
  return !!value || value === "";
}
function looseCompareArrays(a, b) {
  if (a.length !== b.length) return false;
  let equal = true;
  for (let i = 0; equal && i < a.length; i++) {
    equal = looseEqual(a[i], b[i]);
  }
  return equal;
}
function looseEqual(a, b) {
  if (a === b) return true;
  let aValidType = isDate(a);
  let bValidType = isDate(b);
  if (aValidType || bValidType) {
    return aValidType && bValidType ? a.getTime() === b.getTime() : false;
  }
  aValidType = isSymbol(a);
  bValidType = isSymbol(b);
  if (aValidType || bValidType) {
    return a === b;
  }
  aValidType = isArray$1(a);
  bValidType = isArray$1(b);
  if (aValidType || bValidType) {
    return aValidType && bValidType ? looseCompareArrays(a, b) : false;
  }
  aValidType = isObject(a);
  bValidType = isObject(b);
  if (aValidType || bValidType) {
    if (!aValidType || !bValidType) {
      return false;
    }
    const aKeysCount = Object.keys(a).length;
    const bKeysCount = Object.keys(b).length;
    if (aKeysCount !== bKeysCount) {
      return false;
    }
    for (const key in a) {
      const aHasKey = a.hasOwnProperty(key);
      const bHasKey = b.hasOwnProperty(key);
      if (aHasKey && !bHasKey || !aHasKey && bHasKey || !looseEqual(a[key], b[key])) {
        return false;
      }
    }
  }
  return String(a) === String(b);
}
function looseIndexOf(arr, val) {
  return arr.findIndex((item) => looseEqual(item, val));
}
const isRef$1 = (val) => {
  return !!(val && val["__v_isRef"] === true);
};
const toDisplayString = (val) => {
  return isString(val) ? val : val == null ? "" : isArray$1(val) || isObject(val) && (val.toString === objectToString || !isFunction(val.toString)) ? isRef$1(val) ? toDisplayString(val.value) : JSON.stringify(val, replacer, 2) : String(val);
};
const replacer = (_key, val) => {
  if (isRef$1(val)) {
    return replacer(_key, val.value);
  } else if (isMap(val)) {
    return {
      [`Map(${val.size})`]: [...val.entries()].reduce(
        (entries, [key, val2], i) => {
          entries[stringifySymbol(key, i) + " =>"] = val2;
          return entries;
        },
        {}
      )
    };
  } else if (isSet(val)) {
    return {
      [`Set(${val.size})`]: [...val.values()].map((v) => stringifySymbol(v))
    };
  } else if (isSymbol(val)) {
    return stringifySymbol(val);
  } else if (isObject(val) && !isArray$1(val) && !isPlainObject$1(val)) {
    return String(val);
  }
  return val;
};
const stringifySymbol = (v, i = "") => {
  var _a2;
  return (
    // Symbol.description in es2019+ so we need to cast here to pass
    // the lib: es2016 check
    isSymbol(v) ? `Symbol(${(_a2 = v.description) != null ? _a2 : i})` : v
  );
};
/**
* @vue/reactivity v3.5.32
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let activeEffectScope;
class EffectScope {
  // TODO isolatedDeclarations "__v_skip"
  constructor(detached = false) {
    this.detached = detached;
    this._active = true;
    this._on = 0;
    this.effects = [];
    this.cleanups = [];
    this._isPaused = false;
    this.__v_skip = true;
    this.parent = activeEffectScope;
    if (!detached && activeEffectScope) {
      this.index = (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(
        this
      ) - 1;
    }
  }
  get active() {
    return this._active;
  }
  pause() {
    if (this._active) {
      this._isPaused = true;
      let i, l;
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].pause();
        }
      }
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].pause();
      }
    }
  }
  /**
   * Resumes the effect scope, including all child scopes and effects.
   */
  resume() {
    if (this._active) {
      if (this._isPaused) {
        this._isPaused = false;
        let i, l;
        if (this.scopes) {
          for (i = 0, l = this.scopes.length; i < l; i++) {
            this.scopes[i].resume();
          }
        }
        for (i = 0, l = this.effects.length; i < l; i++) {
          this.effects[i].resume();
        }
      }
    }
  }
  run(fn) {
    if (this._active) {
      const currentEffectScope = activeEffectScope;
      try {
        activeEffectScope = this;
        return fn();
      } finally {
        activeEffectScope = currentEffectScope;
      }
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  on() {
    if (++this._on === 1) {
      this.prevScope = activeEffectScope;
      activeEffectScope = this;
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  off() {
    if (this._on > 0 && --this._on === 0) {
      activeEffectScope = this.prevScope;
      this.prevScope = void 0;
    }
  }
  stop(fromParent) {
    if (this._active) {
      this._active = false;
      let i, l;
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].stop();
      }
      this.effects.length = 0;
      for (i = 0, l = this.cleanups.length; i < l; i++) {
        this.cleanups[i]();
      }
      this.cleanups.length = 0;
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].stop(true);
        }
        this.scopes.length = 0;
      }
      if (!this.detached && this.parent && !fromParent) {
        const last = this.parent.scopes.pop();
        if (last && last !== this) {
          this.parent.scopes[this.index] = last;
          last.index = this.index;
        }
      }
      this.parent = void 0;
    }
  }
}
function effectScope(detached) {
  return new EffectScope(detached);
}
function getCurrentScope() {
  return activeEffectScope;
}
function onScopeDispose(fn, failSilently = false) {
  if (activeEffectScope) {
    activeEffectScope.cleanups.push(fn);
  }
}
let activeSub;
const pausedQueueEffects = /* @__PURE__ */ new WeakSet();
class ReactiveEffect {
  constructor(fn) {
    this.fn = fn;
    this.deps = void 0;
    this.depsTail = void 0;
    this.flags = 1 | 4;
    this.next = void 0;
    this.cleanup = void 0;
    this.scheduler = void 0;
    if (activeEffectScope && activeEffectScope.active) {
      activeEffectScope.effects.push(this);
    }
  }
  pause() {
    this.flags |= 64;
  }
  resume() {
    if (this.flags & 64) {
      this.flags &= -65;
      if (pausedQueueEffects.has(this)) {
        pausedQueueEffects.delete(this);
        this.trigger();
      }
    }
  }
  /**
   * @internal
   */
  notify() {
    if (this.flags & 2 && !(this.flags & 32)) {
      return;
    }
    if (!(this.flags & 8)) {
      batch(this);
    }
  }
  run() {
    if (!(this.flags & 1)) {
      return this.fn();
    }
    this.flags |= 2;
    cleanupEffect(this);
    prepareDeps(this);
    const prevEffect = activeSub;
    const prevShouldTrack = shouldTrack;
    activeSub = this;
    shouldTrack = true;
    try {
      return this.fn();
    } finally {
      cleanupDeps(this);
      activeSub = prevEffect;
      shouldTrack = prevShouldTrack;
      this.flags &= -3;
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let link = this.deps; link; link = link.nextDep) {
        removeSub(link);
      }
      this.deps = this.depsTail = void 0;
      cleanupEffect(this);
      this.onStop && this.onStop();
      this.flags &= -2;
    }
  }
  trigger() {
    if (this.flags & 64) {
      pausedQueueEffects.add(this);
    } else if (this.scheduler) {
      this.scheduler();
    } else {
      this.runIfDirty();
    }
  }
  /**
   * @internal
   */
  runIfDirty() {
    if (isDirty(this)) {
      this.run();
    }
  }
  get dirty() {
    return isDirty(this);
  }
}
let batchDepth = 0;
let batchedSub;
let batchedComputed;
function batch(sub, isComputed2 = false) {
  sub.flags |= 8;
  if (isComputed2) {
    sub.next = batchedComputed;
    batchedComputed = sub;
    return;
  }
  sub.next = batchedSub;
  batchedSub = sub;
}
function startBatch() {
  batchDepth++;
}
function endBatch() {
  if (--batchDepth > 0) {
    return;
  }
  if (batchedComputed) {
    let e = batchedComputed;
    batchedComputed = void 0;
    while (e) {
      const next = e.next;
      e.next = void 0;
      e.flags &= -9;
      e = next;
    }
  }
  let error;
  while (batchedSub) {
    let e = batchedSub;
    batchedSub = void 0;
    while (e) {
      const next = e.next;
      e.next = void 0;
      e.flags &= -9;
      if (e.flags & 1) {
        try {
          ;
          e.trigger();
        } catch (err) {
          if (!error) error = err;
        }
      }
      e = next;
    }
  }
  if (error) throw error;
}
function prepareDeps(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    link.version = -1;
    link.prevActiveLink = link.dep.activeLink;
    link.dep.activeLink = link;
  }
}
function cleanupDeps(sub) {
  let head;
  let tail = sub.depsTail;
  let link = tail;
  while (link) {
    const prev = link.prevDep;
    if (link.version === -1) {
      if (link === tail) tail = prev;
      removeSub(link);
      removeDep(link);
    } else {
      head = link;
    }
    link.dep.activeLink = link.prevActiveLink;
    link.prevActiveLink = void 0;
    link = prev;
  }
  sub.deps = head;
  sub.depsTail = tail;
}
function isDirty(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    if (link.dep.version !== link.version || link.dep.computed && (refreshComputed(link.dep.computed) || link.dep.version !== link.version)) {
      return true;
    }
  }
  if (sub._dirty) {
    return true;
  }
  return false;
}
function refreshComputed(computed2) {
  if (computed2.flags & 4 && !(computed2.flags & 16)) {
    return;
  }
  computed2.flags &= -17;
  if (computed2.globalVersion === globalVersion) {
    return;
  }
  computed2.globalVersion = globalVersion;
  if (!computed2.isSSR && computed2.flags & 128 && (!computed2.deps && !computed2._dirty || !isDirty(computed2))) {
    return;
  }
  computed2.flags |= 2;
  const dep = computed2.dep;
  const prevSub = activeSub;
  const prevShouldTrack = shouldTrack;
  activeSub = computed2;
  shouldTrack = true;
  try {
    prepareDeps(computed2);
    const value = computed2.fn(computed2._value);
    if (dep.version === 0 || hasChanged(value, computed2._value)) {
      computed2.flags |= 128;
      computed2._value = value;
      dep.version++;
    }
  } catch (err) {
    dep.version++;
    throw err;
  } finally {
    activeSub = prevSub;
    shouldTrack = prevShouldTrack;
    cleanupDeps(computed2);
    computed2.flags &= -3;
  }
}
function removeSub(link, soft = false) {
  const { dep, prevSub, nextSub } = link;
  if (prevSub) {
    prevSub.nextSub = nextSub;
    link.prevSub = void 0;
  }
  if (nextSub) {
    nextSub.prevSub = prevSub;
    link.nextSub = void 0;
  }
  if (dep.subs === link) {
    dep.subs = prevSub;
    if (!prevSub && dep.computed) {
      dep.computed.flags &= -5;
      for (let l = dep.computed.deps; l; l = l.nextDep) {
        removeSub(l, true);
      }
    }
  }
  if (!soft && !--dep.sc && dep.map) {
    dep.map.delete(dep.key);
  }
}
function removeDep(link) {
  const { prevDep, nextDep } = link;
  if (prevDep) {
    prevDep.nextDep = nextDep;
    link.prevDep = void 0;
  }
  if (nextDep) {
    nextDep.prevDep = prevDep;
    link.nextDep = void 0;
  }
}
let shouldTrack = true;
const trackStack = [];
function pauseTracking() {
  trackStack.push(shouldTrack);
  shouldTrack = false;
}
function resetTracking() {
  const last = trackStack.pop();
  shouldTrack = last === void 0 ? true : last;
}
function cleanupEffect(e) {
  const { cleanup } = e;
  e.cleanup = void 0;
  if (cleanup) {
    const prevSub = activeSub;
    activeSub = void 0;
    try {
      cleanup();
    } finally {
      activeSub = prevSub;
    }
  }
}
let globalVersion = 0;
class Link {
  constructor(sub, dep) {
    this.sub = sub;
    this.dep = dep;
    this.version = dep.version;
    this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
  }
}
class Dep {
  // TODO isolatedDeclarations "__v_skip"
  constructor(computed2) {
    this.computed = computed2;
    this.version = 0;
    this.activeLink = void 0;
    this.subs = void 0;
    this.map = void 0;
    this.key = void 0;
    this.sc = 0;
    this.__v_skip = true;
  }
  track(debugInfo) {
    if (!activeSub || !shouldTrack || activeSub === this.computed) {
      return;
    }
    let link = this.activeLink;
    if (link === void 0 || link.sub !== activeSub) {
      link = this.activeLink = new Link(activeSub, this);
      if (!activeSub.deps) {
        activeSub.deps = activeSub.depsTail = link;
      } else {
        link.prevDep = activeSub.depsTail;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
      }
      addSub(link);
    } else if (link.version === -1) {
      link.version = this.version;
      if (link.nextDep) {
        const next = link.nextDep;
        next.prevDep = link.prevDep;
        if (link.prevDep) {
          link.prevDep.nextDep = next;
        }
        link.prevDep = activeSub.depsTail;
        link.nextDep = void 0;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
        if (activeSub.deps === link) {
          activeSub.deps = next;
        }
      }
    }
    return link;
  }
  trigger(debugInfo) {
    this.version++;
    globalVersion++;
    this.notify(debugInfo);
  }
  notify(debugInfo) {
    startBatch();
    try {
      if (false) ;
      for (let link = this.subs; link; link = link.prevSub) {
        if (link.sub.notify()) {
          ;
          link.sub.dep.notify();
        }
      }
    } finally {
      endBatch();
    }
  }
}
function addSub(link) {
  link.dep.sc++;
  if (link.sub.flags & 4) {
    const computed2 = link.dep.computed;
    if (computed2 && !link.dep.subs) {
      computed2.flags |= 4 | 16;
      for (let l = computed2.deps; l; l = l.nextDep) {
        addSub(l);
      }
    }
    const currentTail = link.dep.subs;
    if (currentTail !== link) {
      link.prevSub = currentTail;
      if (currentTail) currentTail.nextSub = link;
    }
    link.dep.subs = link;
  }
}
const targetMap = /* @__PURE__ */ new WeakMap();
const ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
const MAP_KEY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
const ARRAY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
function track(target, type, key) {
  if (shouldTrack && activeSub) {
    let depsMap = targetMap.get(target);
    if (!depsMap) {
      targetMap.set(target, depsMap = /* @__PURE__ */ new Map());
    }
    let dep = depsMap.get(key);
    if (!dep) {
      depsMap.set(key, dep = new Dep());
      dep.map = depsMap;
      dep.key = key;
    }
    {
      dep.track();
    }
  }
}
function trigger(target, type, key, newValue, oldValue, oldTarget) {
  const depsMap = targetMap.get(target);
  if (!depsMap) {
    globalVersion++;
    return;
  }
  const run = (dep) => {
    if (dep) {
      {
        dep.trigger();
      }
    }
  };
  startBatch();
  if (type === "clear") {
    depsMap.forEach(run);
  } else {
    const targetIsArray = isArray$1(target);
    const isArrayIndex = targetIsArray && isIntegerKey(key);
    if (targetIsArray && key === "length") {
      const newLength = Number(newValue);
      depsMap.forEach((dep, key2) => {
        if (key2 === "length" || key2 === ARRAY_ITERATE_KEY || !isSymbol(key2) && key2 >= newLength) {
          run(dep);
        }
      });
    } else {
      if (key !== void 0 || depsMap.has(void 0)) {
        run(depsMap.get(key));
      }
      if (isArrayIndex) {
        run(depsMap.get(ARRAY_ITERATE_KEY));
      }
      switch (type) {
        case "add":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          } else if (isArrayIndex) {
            run(depsMap.get("length"));
          }
          break;
        case "delete":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          }
          break;
        case "set":
          if (isMap(target)) {
            run(depsMap.get(ITERATE_KEY));
          }
          break;
      }
    }
  }
  endBatch();
}
function getDepFromReactive(object, key) {
  const depMap = targetMap.get(object);
  return depMap && depMap.get(key);
}
function reactiveReadArray(array) {
  const raw = /* @__PURE__ */ toRaw(array);
  if (raw === array) return raw;
  track(raw, "iterate", ARRAY_ITERATE_KEY);
  return /* @__PURE__ */ isShallow(array) ? raw : raw.map(toReactive);
}
function shallowReadArray(arr) {
  track(arr = /* @__PURE__ */ toRaw(arr), "iterate", ARRAY_ITERATE_KEY);
  return arr;
}
function toWrapped(target, item) {
  if (/* @__PURE__ */ isReadonly(target)) {
    return /* @__PURE__ */ isReactive(target) ? toReadonly(toReactive(item)) : toReadonly(item);
  }
  return toReactive(item);
}
const arrayInstrumentations = {
  __proto__: null,
  [Symbol.iterator]() {
    return iterator(this, Symbol.iterator, (item) => toWrapped(this, item));
  },
  concat(...args) {
    return reactiveReadArray(this).concat(
      ...args.map((x) => isArray$1(x) ? reactiveReadArray(x) : x)
    );
  },
  entries() {
    return iterator(this, "entries", (value) => {
      value[1] = toWrapped(this, value[1]);
      return value;
    });
  },
  every(fn, thisArg) {
    return apply(this, "every", fn, thisArg, void 0, arguments);
  },
  filter(fn, thisArg) {
    return apply(
      this,
      "filter",
      fn,
      thisArg,
      (v) => v.map((item) => toWrapped(this, item)),
      arguments
    );
  },
  find(fn, thisArg) {
    return apply(
      this,
      "find",
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments
    );
  },
  findIndex(fn, thisArg) {
    return apply(this, "findIndex", fn, thisArg, void 0, arguments);
  },
  findLast(fn, thisArg) {
    return apply(
      this,
      "findLast",
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments
    );
  },
  findLastIndex(fn, thisArg) {
    return apply(this, "findLastIndex", fn, thisArg, void 0, arguments);
  },
  // flat, flatMap could benefit from ARRAY_ITERATE but are not straight-forward to implement
  forEach(fn, thisArg) {
    return apply(this, "forEach", fn, thisArg, void 0, arguments);
  },
  includes(...args) {
    return searchProxy(this, "includes", args);
  },
  indexOf(...args) {
    return searchProxy(this, "indexOf", args);
  },
  join(separator) {
    return reactiveReadArray(this).join(separator);
  },
  // keys() iterator only reads `length`, no optimization required
  lastIndexOf(...args) {
    return searchProxy(this, "lastIndexOf", args);
  },
  map(fn, thisArg) {
    return apply(this, "map", fn, thisArg, void 0, arguments);
  },
  pop() {
    return noTracking(this, "pop");
  },
  push(...args) {
    return noTracking(this, "push", args);
  },
  reduce(fn, ...args) {
    return reduce(this, "reduce", fn, args);
  },
  reduceRight(fn, ...args) {
    return reduce(this, "reduceRight", fn, args);
  },
  shift() {
    return noTracking(this, "shift");
  },
  // slice could use ARRAY_ITERATE but also seems to beg for range tracking
  some(fn, thisArg) {
    return apply(this, "some", fn, thisArg, void 0, arguments);
  },
  splice(...args) {
    return noTracking(this, "splice", args);
  },
  toReversed() {
    return reactiveReadArray(this).toReversed();
  },
  toSorted(comparer) {
    return reactiveReadArray(this).toSorted(comparer);
  },
  toSpliced(...args) {
    return reactiveReadArray(this).toSpliced(...args);
  },
  unshift(...args) {
    return noTracking(this, "unshift", args);
  },
  values() {
    return iterator(this, "values", (item) => toWrapped(this, item));
  }
};
function iterator(self2, method, wrapValue) {
  const arr = shallowReadArray(self2);
  const iter = arr[method]();
  if (arr !== self2 && !/* @__PURE__ */ isShallow(self2)) {
    iter._next = iter.next;
    iter.next = () => {
      const result = iter._next();
      if (!result.done) {
        result.value = wrapValue(result.value);
      }
      return result;
    };
  }
  return iter;
}
const arrayProto = Array.prototype;
function apply(self2, method, fn, thisArg, wrappedRetFn, args) {
  const arr = shallowReadArray(self2);
  const needsWrap = arr !== self2 && !/* @__PURE__ */ isShallow(self2);
  const methodFn = arr[method];
  if (methodFn !== arrayProto[method]) {
    const result2 = methodFn.apply(self2, args);
    return needsWrap ? toReactive(result2) : result2;
  }
  let wrappedFn = fn;
  if (arr !== self2) {
    if (needsWrap) {
      wrappedFn = function(item, index2) {
        return fn.call(this, toWrapped(self2, item), index2, self2);
      };
    } else if (fn.length > 2) {
      wrappedFn = function(item, index2) {
        return fn.call(this, item, index2, self2);
      };
    }
  }
  const result = methodFn.call(arr, wrappedFn, thisArg);
  return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result;
}
function reduce(self2, method, fn, args) {
  const arr = shallowReadArray(self2);
  const needsWrap = arr !== self2 && !/* @__PURE__ */ isShallow(self2);
  let wrappedFn = fn;
  let wrapInitialAccumulator = false;
  if (arr !== self2) {
    if (needsWrap) {
      wrapInitialAccumulator = args.length === 0;
      wrappedFn = function(acc, item, index2) {
        if (wrapInitialAccumulator) {
          wrapInitialAccumulator = false;
          acc = toWrapped(self2, acc);
        }
        return fn.call(this, acc, toWrapped(self2, item), index2, self2);
      };
    } else if (fn.length > 3) {
      wrappedFn = function(acc, item, index2) {
        return fn.call(this, acc, item, index2, self2);
      };
    }
  }
  const result = arr[method](wrappedFn, ...args);
  return wrapInitialAccumulator ? toWrapped(self2, result) : result;
}
function searchProxy(self2, method, args) {
  const arr = /* @__PURE__ */ toRaw(self2);
  track(arr, "iterate", ARRAY_ITERATE_KEY);
  const res = arr[method](...args);
  if ((res === -1 || res === false) && /* @__PURE__ */ isProxy(args[0])) {
    args[0] = /* @__PURE__ */ toRaw(args[0]);
    return arr[method](...args);
  }
  return res;
}
function noTracking(self2, method, args = []) {
  pauseTracking();
  startBatch();
  const res = (/* @__PURE__ */ toRaw(self2))[method].apply(self2, args);
  endBatch();
  resetTracking();
  return res;
}
const isNonTrackableKeys = /* @__PURE__ */ makeMap(`__proto__,__v_isRef,__isVue`);
const builtInSymbols = new Set(
  /* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((key) => key !== "arguments" && key !== "caller").map((key) => Symbol[key]).filter(isSymbol)
);
function hasOwnProperty(key) {
  if (!isSymbol(key)) key = String(key);
  const obj = /* @__PURE__ */ toRaw(this);
  track(obj, "has", key);
  return obj.hasOwnProperty(key);
}
class BaseReactiveHandler {
  constructor(_isReadonly = false, _isShallow = false) {
    this._isReadonly = _isReadonly;
    this._isShallow = _isShallow;
  }
  get(target, key, receiver) {
    if (key === "__v_skip") return target["__v_skip"];
    const isReadonly2 = this._isReadonly, isShallow2 = this._isShallow;
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_isShallow") {
      return isShallow2;
    } else if (key === "__v_raw") {
      if (receiver === (isReadonly2 ? isShallow2 ? shallowReadonlyMap : readonlyMap : isShallow2 ? shallowReactiveMap : reactiveMap).get(target) || // receiver is not the reactive proxy, but has the same prototype
      // this means the receiver is a user proxy of the reactive proxy
      Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)) {
        return target;
      }
      return;
    }
    const targetIsArray = isArray$1(target);
    if (!isReadonly2) {
      let fn;
      if (targetIsArray && (fn = arrayInstrumentations[key])) {
        return fn;
      }
      if (key === "hasOwnProperty") {
        return hasOwnProperty;
      }
    }
    const res = Reflect.get(
      target,
      key,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      /* @__PURE__ */ isRef(target) ? target : receiver
    );
    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res;
    }
    if (!isReadonly2) {
      track(target, "get", key);
    }
    if (isShallow2) {
      return res;
    }
    if (/* @__PURE__ */ isRef(res)) {
      const value = targetIsArray && isIntegerKey(key) ? res : res.value;
      return isReadonly2 && isObject(value) ? /* @__PURE__ */ readonly(value) : value;
    }
    if (isObject(res)) {
      return isReadonly2 ? /* @__PURE__ */ readonly(res) : /* @__PURE__ */ reactive(res);
    }
    return res;
  }
}
class MutableReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(false, isShallow2);
  }
  set(target, key, value, receiver) {
    let oldValue = target[key];
    const isArrayWithIntegerKey = isArray$1(target) && isIntegerKey(key);
    if (!this._isShallow) {
      const isOldValueReadonly = /* @__PURE__ */ isReadonly(oldValue);
      if (!/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) {
        oldValue = /* @__PURE__ */ toRaw(oldValue);
        value = /* @__PURE__ */ toRaw(value);
      }
      if (!isArrayWithIntegerKey && /* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) {
        if (isOldValueReadonly) {
          return true;
        } else {
          oldValue.value = value;
          return true;
        }
      }
    }
    const hadKey = isArrayWithIntegerKey ? Number(key) < target.length : hasOwn(target, key);
    const result = Reflect.set(
      target,
      key,
      value,
      /* @__PURE__ */ isRef(target) ? target : receiver
    );
    if (target === /* @__PURE__ */ toRaw(receiver)) {
      if (!hadKey) {
        trigger(target, "add", key, value);
      } else if (hasChanged(value, oldValue)) {
        trigger(target, "set", key, value);
      }
    }
    return result;
  }
  deleteProperty(target, key) {
    const hadKey = hasOwn(target, key);
    target[key];
    const result = Reflect.deleteProperty(target, key);
    if (result && hadKey) {
      trigger(target, "delete", key, void 0);
    }
    return result;
  }
  has(target, key) {
    const result = Reflect.has(target, key);
    if (!isSymbol(key) || !builtInSymbols.has(key)) {
      track(target, "has", key);
    }
    return result;
  }
  ownKeys(target) {
    track(
      target,
      "iterate",
      isArray$1(target) ? "length" : ITERATE_KEY
    );
    return Reflect.ownKeys(target);
  }
}
class ReadonlyReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(true, isShallow2);
  }
  set(target, key) {
    return true;
  }
  deleteProperty(target, key) {
    return true;
  }
}
const mutableHandlers = /* @__PURE__ */ new MutableReactiveHandler();
const readonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler();
const shallowReactiveHandlers = /* @__PURE__ */ new MutableReactiveHandler(true);
const shallowReadonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler(true);
const toShallow = (value) => value;
const getProto = (v) => Reflect.getPrototypeOf(v);
function createIterableMethod(method, isReadonly2, isShallow2) {
  return function(...args) {
    const target = this["__v_raw"];
    const rawTarget = /* @__PURE__ */ toRaw(target);
    const targetIsMap = isMap(rawTarget);
    const isPair = method === "entries" || method === Symbol.iterator && targetIsMap;
    const isKeyOnly = method === "keys" && targetIsMap;
    const innerIterator = target[method](...args);
    const wrap = isShallow2 ? toShallow : isReadonly2 ? toReadonly : toReactive;
    !isReadonly2 && track(
      rawTarget,
      "iterate",
      isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY
    );
    return extend(
      // inheriting all iterator properties
      Object.create(innerIterator),
      {
        // iterator protocol
        next() {
          const { value, done } = innerIterator.next();
          return done ? { value, done } : {
            value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
            done
          };
        }
      }
    );
  };
}
function createReadonlyMethod(type) {
  return function(...args) {
    return type === "delete" ? false : type === "clear" ? void 0 : this;
  };
}
function createInstrumentations(readonly2, shallow) {
  const instrumentations = {
    get(key) {
      const target = this["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const rawKey = /* @__PURE__ */ toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "get", key);
        }
        track(rawTarget, "get", rawKey);
      }
      const { has } = getProto(rawTarget);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      if (has.call(rawTarget, key)) {
        return wrap(target.get(key));
      } else if (has.call(rawTarget, rawKey)) {
        return wrap(target.get(rawKey));
      } else if (target !== rawTarget) {
        target.get(key);
      }
    },
    get size() {
      const target = this["__v_raw"];
      !readonly2 && track(/* @__PURE__ */ toRaw(target), "iterate", ITERATE_KEY);
      return target.size;
    },
    has(key) {
      const target = this["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const rawKey = /* @__PURE__ */ toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "has", key);
        }
        track(rawTarget, "has", rawKey);
      }
      return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
    },
    forEach(callback, thisArg) {
      const observed = this;
      const target = observed["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      !readonly2 && track(rawTarget, "iterate", ITERATE_KEY);
      return target.forEach((value, key) => {
        return callback.call(thisArg, wrap(value), wrap(key), observed);
      });
    }
  };
  extend(
    instrumentations,
    readonly2 ? {
      add: createReadonlyMethod("add"),
      set: createReadonlyMethod("set"),
      delete: createReadonlyMethod("delete"),
      clear: createReadonlyMethod("clear")
    } : {
      add(value) {
        const target = /* @__PURE__ */ toRaw(this);
        const proto = getProto(target);
        const rawValue = /* @__PURE__ */ toRaw(value);
        const valueToAdd = !shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value) ? rawValue : value;
        const hadKey = proto.has.call(target, valueToAdd) || hasChanged(value, valueToAdd) && proto.has.call(target, value) || hasChanged(rawValue, valueToAdd) && proto.has.call(target, rawValue);
        if (!hadKey) {
          target.add(valueToAdd);
          trigger(target, "add", valueToAdd, valueToAdd);
        }
        return this;
      },
      set(key, value) {
        if (!shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) {
          value = /* @__PURE__ */ toRaw(value);
        }
        const target = /* @__PURE__ */ toRaw(this);
        const { has, get } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
          key = /* @__PURE__ */ toRaw(key);
          hadKey = has.call(target, key);
        }
        const oldValue = get.call(target, key);
        target.set(key, value);
        if (!hadKey) {
          trigger(target, "add", key, value);
        } else if (hasChanged(value, oldValue)) {
          trigger(target, "set", key, value);
        }
        return this;
      },
      delete(key) {
        const target = /* @__PURE__ */ toRaw(this);
        const { has, get } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
          key = /* @__PURE__ */ toRaw(key);
          hadKey = has.call(target, key);
        }
        get ? get.call(target, key) : void 0;
        const result = target.delete(key);
        if (hadKey) {
          trigger(target, "delete", key, void 0);
        }
        return result;
      },
      clear() {
        const target = /* @__PURE__ */ toRaw(this);
        const hadItems = target.size !== 0;
        const result = target.clear();
        if (hadItems) {
          trigger(
            target,
            "clear",
            void 0,
            void 0
          );
        }
        return result;
      }
    }
  );
  const iteratorMethods = [
    "keys",
    "values",
    "entries",
    Symbol.iterator
  ];
  iteratorMethods.forEach((method) => {
    instrumentations[method] = createIterableMethod(method, readonly2, shallow);
  });
  return instrumentations;
}
function createInstrumentationGetter(isReadonly2, shallow) {
  const instrumentations = createInstrumentations(isReadonly2, shallow);
  return (target, key, receiver) => {
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_raw") {
      return target;
    }
    return Reflect.get(
      hasOwn(instrumentations, key) && key in target ? instrumentations : target,
      key,
      receiver
    );
  };
}
const mutableCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, false)
};
const shallowCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, true)
};
const readonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, false)
};
const shallowReadonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, true)
};
const reactiveMap = /* @__PURE__ */ new WeakMap();
const shallowReactiveMap = /* @__PURE__ */ new WeakMap();
const readonlyMap = /* @__PURE__ */ new WeakMap();
const shallowReadonlyMap = /* @__PURE__ */ new WeakMap();
function targetTypeMap(rawType) {
  switch (rawType) {
    case "Object":
    case "Array":
      return 1;
    case "Map":
    case "Set":
    case "WeakMap":
    case "WeakSet":
      return 2;
    default:
      return 0;
  }
}
function getTargetType(value) {
  return value["__v_skip"] || !Object.isExtensible(value) ? 0 : targetTypeMap(toRawType(value));
}
// @__NO_SIDE_EFFECTS__
function reactive(target) {
  if (/* @__PURE__ */ isReadonly(target)) {
    return target;
  }
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap
  );
}
// @__NO_SIDE_EFFECTS__
function shallowReactive(target) {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers,
    shallowReactiveMap
  );
}
// @__NO_SIDE_EFFECTS__
function readonly(target) {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers,
    readonlyMap
  );
}
// @__NO_SIDE_EFFECTS__
function shallowReadonly(target) {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    shallowReadonlyCollectionHandlers,
    shallowReadonlyMap
  );
}
function createReactiveObject(target, isReadonly2, baseHandlers, collectionHandlers, proxyMap) {
  if (!isObject(target)) {
    return target;
  }
  if (target["__v_raw"] && !(isReadonly2 && target["__v_isReactive"])) {
    return target;
  }
  const targetType = getTargetType(target);
  if (targetType === 0) {
    return target;
  }
  const existingProxy = proxyMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }
  const proxy = new Proxy(
    target,
    targetType === 2 ? collectionHandlers : baseHandlers
  );
  proxyMap.set(target, proxy);
  return proxy;
}
// @__NO_SIDE_EFFECTS__
function isReactive(value) {
  if (/* @__PURE__ */ isReadonly(value)) {
    return /* @__PURE__ */ isReactive(value["__v_raw"]);
  }
  return !!(value && value["__v_isReactive"]);
}
// @__NO_SIDE_EFFECTS__
function isReadonly(value) {
  return !!(value && value["__v_isReadonly"]);
}
// @__NO_SIDE_EFFECTS__
function isShallow(value) {
  return !!(value && value["__v_isShallow"]);
}
// @__NO_SIDE_EFFECTS__
function isProxy(value) {
  return value ? !!value["__v_raw"] : false;
}
// @__NO_SIDE_EFFECTS__
function toRaw(observed) {
  const raw = observed && observed["__v_raw"];
  return raw ? /* @__PURE__ */ toRaw(raw) : observed;
}
function markRaw(value) {
  if (!hasOwn(value, "__v_skip") && Object.isExtensible(value)) {
    def(value, "__v_skip", true);
  }
  return value;
}
const toReactive = (value) => isObject(value) ? /* @__PURE__ */ reactive(value) : value;
const toReadonly = (value) => isObject(value) ? /* @__PURE__ */ readonly(value) : value;
// @__NO_SIDE_EFFECTS__
function isRef(r) {
  return r ? r["__v_isRef"] === true : false;
}
// @__NO_SIDE_EFFECTS__
function ref(value) {
  return createRef(value, false);
}
// @__NO_SIDE_EFFECTS__
function shallowRef(value) {
  return createRef(value, true);
}
function createRef(rawValue, shallow) {
  if (/* @__PURE__ */ isRef(rawValue)) {
    return rawValue;
  }
  return new RefImpl(rawValue, shallow);
}
class RefImpl {
  constructor(value, isShallow2) {
    this.dep = new Dep();
    this["__v_isRef"] = true;
    this["__v_isShallow"] = false;
    this._rawValue = isShallow2 ? value : /* @__PURE__ */ toRaw(value);
    this._value = isShallow2 ? value : toReactive(value);
    this["__v_isShallow"] = isShallow2;
  }
  get value() {
    {
      this.dep.track();
    }
    return this._value;
  }
  set value(newValue) {
    const oldValue = this._rawValue;
    const useDirectValue = this["__v_isShallow"] || /* @__PURE__ */ isShallow(newValue) || /* @__PURE__ */ isReadonly(newValue);
    newValue = useDirectValue ? newValue : /* @__PURE__ */ toRaw(newValue);
    if (hasChanged(newValue, oldValue)) {
      this._rawValue = newValue;
      this._value = useDirectValue ? newValue : toReactive(newValue);
      {
        this.dep.trigger();
      }
    }
  }
}
function unref(ref2) {
  return /* @__PURE__ */ isRef(ref2) ? ref2.value : ref2;
}
const shallowUnwrapHandlers = {
  get: (target, key, receiver) => key === "__v_raw" ? target : unref(Reflect.get(target, key, receiver)),
  set: (target, key, value, receiver) => {
    const oldValue = target[key];
    if (/* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) {
      oldValue.value = value;
      return true;
    } else {
      return Reflect.set(target, key, value, receiver);
    }
  }
};
function proxyRefs(objectWithRefs) {
  return /* @__PURE__ */ isReactive(objectWithRefs) ? objectWithRefs : new Proxy(objectWithRefs, shallowUnwrapHandlers);
}
// @__NO_SIDE_EFFECTS__
function toRefs(object) {
  const ret = isArray$1(object) ? new Array(object.length) : {};
  for (const key in object) {
    ret[key] = propertyToRef(object, key);
  }
  return ret;
}
class ObjectRefImpl {
  constructor(_object, key, _defaultValue) {
    this._object = _object;
    this._defaultValue = _defaultValue;
    this["__v_isRef"] = true;
    this._value = void 0;
    this._key = isSymbol(key) ? key : String(key);
    this._raw = /* @__PURE__ */ toRaw(_object);
    let shallow = true;
    let obj = _object;
    if (!isArray$1(_object) || isSymbol(this._key) || !isIntegerKey(this._key)) {
      do {
        shallow = !/* @__PURE__ */ isProxy(obj) || /* @__PURE__ */ isShallow(obj);
      } while (shallow && (obj = obj["__v_raw"]));
    }
    this._shallow = shallow;
  }
  get value() {
    let val = this._object[this._key];
    if (this._shallow) {
      val = unref(val);
    }
    return this._value = val === void 0 ? this._defaultValue : val;
  }
  set value(newVal) {
    if (this._shallow && /* @__PURE__ */ isRef(this._raw[this._key])) {
      const nestedRef = this._object[this._key];
      if (/* @__PURE__ */ isRef(nestedRef)) {
        nestedRef.value = newVal;
        return;
      }
    }
    this._object[this._key] = newVal;
  }
  get dep() {
    return getDepFromReactive(this._raw, this._key);
  }
}
function propertyToRef(source, key, defaultValue) {
  return new ObjectRefImpl(source, key, defaultValue);
}
class ComputedRefImpl {
  constructor(fn, setter, isSSR) {
    this.fn = fn;
    this.setter = setter;
    this._value = void 0;
    this.dep = new Dep(this);
    this.__v_isRef = true;
    this.deps = void 0;
    this.depsTail = void 0;
    this.flags = 16;
    this.globalVersion = globalVersion - 1;
    this.next = void 0;
    this.effect = this;
    this["__v_isReadonly"] = !setter;
    this.isSSR = isSSR;
  }
  /**
   * @internal
   */
  notify() {
    this.flags |= 16;
    if (!(this.flags & 8) && // avoid infinite self recursion
    activeSub !== this) {
      batch(this, true);
      return true;
    }
  }
  get value() {
    const link = this.dep.track();
    refreshComputed(this);
    if (link) {
      link.version = this.dep.version;
    }
    return this._value;
  }
  set value(newValue) {
    if (this.setter) {
      this.setter(newValue);
    }
  }
}
// @__NO_SIDE_EFFECTS__
function computed$1(getterOrOptions, debugOptions, isSSR = false) {
  let getter;
  let setter;
  if (isFunction(getterOrOptions)) {
    getter = getterOrOptions;
  } else {
    getter = getterOrOptions.get;
    setter = getterOrOptions.set;
  }
  const cRef = new ComputedRefImpl(getter, setter, isSSR);
  return cRef;
}
const INITIAL_WATCHER_VALUE = {};
const cleanupMap = /* @__PURE__ */ new WeakMap();
let activeWatcher = void 0;
function onWatcherCleanup(cleanupFn, failSilently = false, owner = activeWatcher) {
  if (owner) {
    let cleanups = cleanupMap.get(owner);
    if (!cleanups) cleanupMap.set(owner, cleanups = []);
    cleanups.push(cleanupFn);
  }
}
function watch$1(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, once, scheduler, augmentJob, call: call2 } = options;
  const reactiveGetter = (source2) => {
    if (deep) return source2;
    if (/* @__PURE__ */ isShallow(source2) || deep === false || deep === 0)
      return traverse(source2, 1);
    return traverse(source2);
  };
  let effect2;
  let getter;
  let cleanup;
  let boundCleanup;
  let forceTrigger = false;
  let isMultiSource = false;
  if (/* @__PURE__ */ isRef(source)) {
    getter = () => source.value;
    forceTrigger = /* @__PURE__ */ isShallow(source);
  } else if (/* @__PURE__ */ isReactive(source)) {
    getter = () => reactiveGetter(source);
    forceTrigger = true;
  } else if (isArray$1(source)) {
    isMultiSource = true;
    forceTrigger = source.some((s) => /* @__PURE__ */ isReactive(s) || /* @__PURE__ */ isShallow(s));
    getter = () => source.map((s) => {
      if (/* @__PURE__ */ isRef(s)) {
        return s.value;
      } else if (/* @__PURE__ */ isReactive(s)) {
        return reactiveGetter(s);
      } else if (isFunction(s)) {
        return call2 ? call2(s, 2) : s();
      } else ;
    });
  } else if (isFunction(source)) {
    if (cb) {
      getter = call2 ? () => call2(source, 2) : source;
    } else {
      getter = () => {
        if (cleanup) {
          pauseTracking();
          try {
            cleanup();
          } finally {
            resetTracking();
          }
        }
        const currentEffect = activeWatcher;
        activeWatcher = effect2;
        try {
          return call2 ? call2(source, 3, [boundCleanup]) : source(boundCleanup);
        } finally {
          activeWatcher = currentEffect;
        }
      };
    }
  } else {
    getter = NOOP;
  }
  if (cb && deep) {
    const baseGetter = getter;
    const depth = deep === true ? Infinity : deep;
    getter = () => traverse(baseGetter(), depth);
  }
  const scope = getCurrentScope();
  const watchHandle = () => {
    effect2.stop();
    if (scope && scope.active) {
      remove(scope.effects, effect2);
    }
  };
  if (once && cb) {
    const _cb = cb;
    cb = (...args) => {
      _cb(...args);
      watchHandle();
    };
  }
  let oldValue = isMultiSource ? new Array(source.length).fill(INITIAL_WATCHER_VALUE) : INITIAL_WATCHER_VALUE;
  const job = (immediateFirstRun) => {
    if (!(effect2.flags & 1) || !effect2.dirty && !immediateFirstRun) {
      return;
    }
    if (cb) {
      const newValue = effect2.run();
      if (deep || forceTrigger || (isMultiSource ? newValue.some((v, i) => hasChanged(v, oldValue[i])) : hasChanged(newValue, oldValue))) {
        if (cleanup) {
          cleanup();
        }
        const currentWatcher = activeWatcher;
        activeWatcher = effect2;
        try {
          const args = [
            newValue,
            // pass undefined as the old value when it's changed for the first time
            oldValue === INITIAL_WATCHER_VALUE ? void 0 : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE ? [] : oldValue,
            boundCleanup
          ];
          oldValue = newValue;
          call2 ? call2(cb, 3, args) : (
            // @ts-expect-error
            cb(...args)
          );
        } finally {
          activeWatcher = currentWatcher;
        }
      }
    } else {
      effect2.run();
    }
  };
  if (augmentJob) {
    augmentJob(job);
  }
  effect2 = new ReactiveEffect(getter);
  effect2.scheduler = scheduler ? () => scheduler(job, false) : job;
  boundCleanup = (fn) => onWatcherCleanup(fn, false, effect2);
  cleanup = effect2.onStop = () => {
    const cleanups = cleanupMap.get(effect2);
    if (cleanups) {
      if (call2) {
        call2(cleanups, 4);
      } else {
        for (const cleanup2 of cleanups) cleanup2();
      }
      cleanupMap.delete(effect2);
    }
  };
  if (cb) {
    if (immediate) {
      job(true);
    } else {
      oldValue = effect2.run();
    }
  } else if (scheduler) {
    scheduler(job.bind(null, true), true);
  } else {
    effect2.run();
  }
  watchHandle.pause = effect2.pause.bind(effect2);
  watchHandle.resume = effect2.resume.bind(effect2);
  watchHandle.stop = watchHandle;
  return watchHandle;
}
function traverse(value, depth = Infinity, seen2) {
  if (depth <= 0 || !isObject(value) || value["__v_skip"]) {
    return value;
  }
  seen2 = seen2 || /* @__PURE__ */ new Map();
  if ((seen2.get(value) || 0) >= depth) {
    return value;
  }
  seen2.set(value, depth);
  depth--;
  if (/* @__PURE__ */ isRef(value)) {
    traverse(value.value, depth, seen2);
  } else if (isArray$1(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], depth, seen2);
    }
  } else if (isSet(value) || isMap(value)) {
    value.forEach((v) => {
      traverse(v, depth, seen2);
    });
  } else if (isPlainObject$1(value)) {
    for (const key in value) {
      traverse(value[key], depth, seen2);
    }
    for (const key of Object.getOwnPropertySymbols(value)) {
      if (Object.prototype.propertyIsEnumerable.call(value, key)) {
        traverse(value[key], depth, seen2);
      }
    }
  }
  return value;
}
/**
* @vue/runtime-core v3.5.32
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
const stack = [];
let isWarning = false;
function warn$1(msg, ...args) {
  if (isWarning) return;
  isWarning = true;
  pauseTracking();
  const instance = stack.length ? stack[stack.length - 1].component : null;
  const appWarnHandler = instance && instance.appContext.config.warnHandler;
  const trace = getComponentTrace();
  if (appWarnHandler) {
    callWithErrorHandling(
      appWarnHandler,
      instance,
      11,
      [
        // eslint-disable-next-line no-restricted-syntax
        msg + args.map((a) => {
          var _a2, _b;
          return (_b = (_a2 = a.toString) == null ? void 0 : _a2.call(a)) != null ? _b : JSON.stringify(a);
        }).join(""),
        instance && instance.proxy,
        trace.map(
          ({ vnode }) => `at <${formatComponentName(instance, vnode.type)}>`
        ).join("\n"),
        trace
      ]
    );
  } else {
    const warnArgs = [`[Vue warn]: ${msg}`, ...args];
    if (trace.length && // avoid spamming console during tests
    true) {
      warnArgs.push(`
`, ...formatTrace(trace));
    }
    console.warn(...warnArgs);
  }
  resetTracking();
  isWarning = false;
}
function getComponentTrace() {
  let currentVNode = stack[stack.length - 1];
  if (!currentVNode) {
    return [];
  }
  const normalizedStack = [];
  while (currentVNode) {
    const last = normalizedStack[0];
    if (last && last.vnode === currentVNode) {
      last.recurseCount++;
    } else {
      normalizedStack.push({
        vnode: currentVNode,
        recurseCount: 0
      });
    }
    const parentInstance = currentVNode.component && currentVNode.component.parent;
    currentVNode = parentInstance && parentInstance.vnode;
  }
  return normalizedStack;
}
function formatTrace(trace) {
  const logs = [];
  trace.forEach((entry, i) => {
    logs.push(...i === 0 ? [] : [`
`], ...formatTraceEntry(entry));
  });
  return logs;
}
function formatTraceEntry({ vnode, recurseCount }) {
  const postfix = recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``;
  const isRoot = vnode.component ? vnode.component.parent == null : false;
  const open = ` at <${formatComponentName(
    vnode.component,
    vnode.type,
    isRoot
  )}`;
  const close = `>` + postfix;
  return vnode.props ? [open, ...formatProps(vnode.props), close] : [open + close];
}
function formatProps(props) {
  const res = [];
  const keys = Object.keys(props);
  keys.slice(0, 3).forEach((key) => {
    res.push(...formatProp(key, props[key]));
  });
  if (keys.length > 3) {
    res.push(` ...`);
  }
  return res;
}
function formatProp(key, value, raw) {
  if (isString(value)) {
    value = JSON.stringify(value);
    return raw ? value : [`${key}=${value}`];
  } else if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return raw ? value : [`${key}=${value}`];
  } else if (/* @__PURE__ */ isRef(value)) {
    value = formatProp(key, /* @__PURE__ */ toRaw(value.value), true);
    return raw ? value : [`${key}=Ref<`, value, `>`];
  } else if (isFunction(value)) {
    return [`${key}=fn${value.name ? `<${value.name}>` : ``}`];
  } else {
    value = /* @__PURE__ */ toRaw(value);
    return raw ? value : [`${key}=`, value];
  }
}
function callWithErrorHandling(fn, instance, type, args) {
  try {
    return args ? fn(...args) : fn();
  } catch (err) {
    handleError(err, instance, type);
  }
}
function callWithAsyncErrorHandling(fn, instance, type, args) {
  if (isFunction(fn)) {
    const res = callWithErrorHandling(fn, instance, type, args);
    if (res && isPromise(res)) {
      res.catch((err) => {
        handleError(err, instance, type);
      });
    }
    return res;
  }
  if (isArray$1(fn)) {
    const values = [];
    for (let i = 0; i < fn.length; i++) {
      values.push(callWithAsyncErrorHandling(fn[i], instance, type, args));
    }
    return values;
  }
}
function handleError(err, instance, type, throwInDev = true) {
  const contextVNode = instance ? instance.vnode : null;
  const { errorHandler, throwUnhandledErrorInProduction } = instance && instance.appContext.config || EMPTY_OBJ;
  if (instance) {
    let cur = instance.parent;
    const exposedInstance = instance.proxy;
    const errorInfo = `https://vuejs.org/error-reference/#runtime-${type}`;
    while (cur) {
      const errorCapturedHooks = cur.ec;
      if (errorCapturedHooks) {
        for (let i = 0; i < errorCapturedHooks.length; i++) {
          if (errorCapturedHooks[i](err, exposedInstance, errorInfo) === false) {
            return;
          }
        }
      }
      cur = cur.parent;
    }
    if (errorHandler) {
      pauseTracking();
      callWithErrorHandling(errorHandler, null, 10, [
        err,
        exposedInstance,
        errorInfo
      ]);
      resetTracking();
      return;
    }
  }
  logError(err, type, contextVNode, throwInDev, throwUnhandledErrorInProduction);
}
function logError(err, type, contextVNode, throwInDev = true, throwInProd = false) {
  if (throwInProd) {
    throw err;
  } else {
    console.error(err);
  }
}
const queue = [];
let flushIndex = -1;
const pendingPostFlushCbs = [];
let activePostFlushCbs = null;
let postFlushIndex = 0;
const resolvedPromise = /* @__PURE__ */ Promise.resolve();
let currentFlushPromise = null;
function nextTick(fn) {
  const p2 = currentFlushPromise || resolvedPromise;
  return fn ? p2.then(this ? fn.bind(this) : fn) : p2;
}
function findInsertionIndex$1(id) {
  let start = flushIndex + 1;
  let end = queue.length;
  while (start < end) {
    const middle = start + end >>> 1;
    const middleJob = queue[middle];
    const middleJobId = getId(middleJob);
    if (middleJobId < id || middleJobId === id && middleJob.flags & 2) {
      start = middle + 1;
    } else {
      end = middle;
    }
  }
  return start;
}
function queueJob(job) {
  if (!(job.flags & 1)) {
    const jobId = getId(job);
    const lastJob = queue[queue.length - 1];
    if (!lastJob || // fast path when the job id is larger than the tail
    !(job.flags & 2) && jobId >= getId(lastJob)) {
      queue.push(job);
    } else {
      queue.splice(findInsertionIndex$1(jobId), 0, job);
    }
    job.flags |= 1;
    queueFlush();
  }
}
function queueFlush() {
  if (!currentFlushPromise) {
    currentFlushPromise = resolvedPromise.then(flushJobs);
  }
}
function queuePostFlushCb(cb) {
  if (!isArray$1(cb)) {
    if (activePostFlushCbs && cb.id === -1) {
      activePostFlushCbs.splice(postFlushIndex + 1, 0, cb);
    } else if (!(cb.flags & 1)) {
      pendingPostFlushCbs.push(cb);
      cb.flags |= 1;
    }
  } else {
    pendingPostFlushCbs.push(...cb);
  }
  queueFlush();
}
function flushPreFlushCbs(instance, seen2, i = flushIndex + 1) {
  for (; i < queue.length; i++) {
    const cb = queue[i];
    if (cb && cb.flags & 2) {
      if (instance && cb.id !== instance.uid) {
        continue;
      }
      queue.splice(i, 1);
      i--;
      if (cb.flags & 4) {
        cb.flags &= -2;
      }
      cb();
      if (!(cb.flags & 4)) {
        cb.flags &= -2;
      }
    }
  }
}
function flushPostFlushCbs(seen2) {
  if (pendingPostFlushCbs.length) {
    const deduped = [...new Set(pendingPostFlushCbs)].sort(
      (a, b) => getId(a) - getId(b)
    );
    pendingPostFlushCbs.length = 0;
    if (activePostFlushCbs) {
      activePostFlushCbs.push(...deduped);
      return;
    }
    activePostFlushCbs = deduped;
    for (postFlushIndex = 0; postFlushIndex < activePostFlushCbs.length; postFlushIndex++) {
      const cb = activePostFlushCbs[postFlushIndex];
      if (cb.flags & 4) {
        cb.flags &= -2;
      }
      if (!(cb.flags & 8)) cb();
      cb.flags &= -2;
    }
    activePostFlushCbs = null;
    postFlushIndex = 0;
  }
}
const getId = (job) => job.id == null ? job.flags & 2 ? -1 : Infinity : job.id;
function flushJobs(seen2) {
  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job && !(job.flags & 8)) {
        if (false) ;
        if (job.flags & 4) {
          job.flags &= ~1;
        }
        callWithErrorHandling(
          job,
          job.i,
          job.i ? 15 : 14
        );
        if (!(job.flags & 4)) {
          job.flags &= ~1;
        }
      }
    }
  } finally {
    for (; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job) {
        job.flags &= -2;
      }
    }
    flushIndex = -1;
    queue.length = 0;
    flushPostFlushCbs();
    currentFlushPromise = null;
    if (queue.length || pendingPostFlushCbs.length) {
      flushJobs();
    }
  }
}
let currentRenderingInstance = null;
let currentScopeId = null;
function setCurrentRenderingInstance(instance) {
  const prev = currentRenderingInstance;
  currentRenderingInstance = instance;
  currentScopeId = instance && instance.type.__scopeId || null;
  return prev;
}
function withCtx(fn, ctx = currentRenderingInstance, isNonScopedSlot) {
  if (!ctx) return fn;
  if (fn._n) {
    return fn;
  }
  const renderFnWithContext = (...args) => {
    if (renderFnWithContext._d) {
      setBlockTracking(-1);
    }
    const prevInstance = setCurrentRenderingInstance(ctx);
    let res;
    try {
      res = fn(...args);
    } finally {
      setCurrentRenderingInstance(prevInstance);
      if (renderFnWithContext._d) {
        setBlockTracking(1);
      }
    }
    return res;
  };
  renderFnWithContext._n = true;
  renderFnWithContext._c = true;
  renderFnWithContext._d = true;
  return renderFnWithContext;
}
function withDirectives(vnode, directives) {
  if (currentRenderingInstance === null) {
    return vnode;
  }
  const instance = getComponentPublicInstance(currentRenderingInstance);
  const bindings = vnode.dirs || (vnode.dirs = []);
  for (let i = 0; i < directives.length; i++) {
    let [dir, value, arg, modifiers = EMPTY_OBJ] = directives[i];
    if (dir) {
      if (isFunction(dir)) {
        dir = {
          mounted: dir,
          updated: dir
        };
      }
      if (dir.deep) {
        traverse(value);
      }
      bindings.push({
        dir,
        instance,
        value,
        oldValue: void 0,
        arg,
        modifiers
      });
    }
  }
  return vnode;
}
function invokeDirectiveHook(vnode, prevVNode, instance, name) {
  const bindings = vnode.dirs;
  const oldBindings = prevVNode && prevVNode.dirs;
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i];
    if (oldBindings) {
      binding.oldValue = oldBindings[i].value;
    }
    let hook = binding.dir[name];
    if (hook) {
      pauseTracking();
      callWithAsyncErrorHandling(hook, instance, 8, [
        vnode.el,
        binding,
        vnode,
        prevVNode
      ]);
      resetTracking();
    }
  }
}
function provide(key, value) {
  if (currentInstance) {
    let provides = currentInstance.provides;
    const parentProvides = currentInstance.parent && currentInstance.parent.provides;
    if (parentProvides === provides) {
      provides = currentInstance.provides = Object.create(parentProvides);
    }
    provides[key] = value;
  }
}
function inject(key, defaultValue, treatDefaultAsFactory = false) {
  const instance = getCurrentInstance();
  if (instance || currentApp) {
    let provides = currentApp ? currentApp._context.provides : instance ? instance.parent == null || instance.ce ? instance.vnode.appContext && instance.vnode.appContext.provides : instance.parent.provides : void 0;
    if (provides && key in provides) {
      return provides[key];
    } else if (arguments.length > 1) {
      return treatDefaultAsFactory && isFunction(defaultValue) ? defaultValue.call(instance && instance.proxy) : defaultValue;
    } else ;
  }
}
function hasInjectionContext() {
  return !!(getCurrentInstance() || currentApp);
}
const ssrContextKey = /* @__PURE__ */ Symbol.for("v-scx");
const useSSRContext = () => {
  {
    const ctx = inject(ssrContextKey);
    return ctx;
  }
};
function watch(source, cb, options) {
  return doWatch(source, cb, options);
}
function doWatch(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, flush, once } = options;
  const baseWatchOptions = extend({}, options);
  const runsImmediately = cb && immediate || !cb && flush !== "post";
  let ssrCleanup;
  if (isInSSRComponentSetup) {
    if (flush === "sync") {
      const ctx = useSSRContext();
      ssrCleanup = ctx.__watcherHandles || (ctx.__watcherHandles = []);
    } else if (!runsImmediately) {
      const watchStopHandle = () => {
      };
      watchStopHandle.stop = NOOP;
      watchStopHandle.resume = NOOP;
      watchStopHandle.pause = NOOP;
      return watchStopHandle;
    }
  }
  const instance = currentInstance;
  baseWatchOptions.call = (fn, type, args) => callWithAsyncErrorHandling(fn, instance, type, args);
  let isPre = false;
  if (flush === "post") {
    baseWatchOptions.scheduler = (job) => {
      queuePostRenderEffect(job, instance && instance.suspense);
    };
  } else if (flush !== "sync") {
    isPre = true;
    baseWatchOptions.scheduler = (job, isFirstRun) => {
      if (isFirstRun) {
        job();
      } else {
        queueJob(job);
      }
    };
  }
  baseWatchOptions.augmentJob = (job) => {
    if (cb) {
      job.flags |= 4;
    }
    if (isPre) {
      job.flags |= 2;
      if (instance) {
        job.id = instance.uid;
        job.i = instance;
      }
    }
  };
  const watchHandle = watch$1(source, cb, baseWatchOptions);
  if (isInSSRComponentSetup) {
    if (ssrCleanup) {
      ssrCleanup.push(watchHandle);
    } else if (runsImmediately) {
      watchHandle();
    }
  }
  return watchHandle;
}
function instanceWatch(source, value, options) {
  const publicThis = this.proxy;
  const getter = isString(source) ? source.includes(".") ? createPathGetter(publicThis, source) : () => publicThis[source] : source.bind(publicThis, publicThis);
  let cb;
  if (isFunction(value)) {
    cb = value;
  } else {
    cb = value.handler;
    options = value;
  }
  const reset = setCurrentInstance(this);
  const res = doWatch(getter, cb.bind(publicThis), options);
  reset();
  return res;
}
function createPathGetter(ctx, path) {
  const segments = path.split(".");
  return () => {
    let cur = ctx;
    for (let i = 0; i < segments.length && cur; i++) {
      cur = cur[segments[i]];
    }
    return cur;
  };
}
const pendingMounts = /* @__PURE__ */ new WeakMap();
const TeleportEndKey = /* @__PURE__ */ Symbol("_vte");
const isTeleport = (type) => type.__isTeleport;
const isTeleportDisabled = (props) => props && (props.disabled || props.disabled === "");
const isTeleportDeferred = (props) => props && (props.defer || props.defer === "");
const isTargetSVG = (target) => typeof SVGElement !== "undefined" && target instanceof SVGElement;
const isTargetMathML = (target) => typeof MathMLElement === "function" && target instanceof MathMLElement;
const resolveTarget = (props, select) => {
  const targetSelector = props && props.to;
  if (isString(targetSelector)) {
    if (!select) {
      return null;
    } else {
      const target = select(targetSelector);
      return target;
    }
  } else {
    return targetSelector;
  }
};
const TeleportImpl = {
  name: "Teleport",
  __isTeleport: true,
  process(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, internals) {
    const {
      mc: mountChildren,
      pc: patchChildren,
      pbc: patchBlockChildren,
      o: { insert, querySelector, createText, createComment }
    } = internals;
    const disabled = isTeleportDisabled(n2.props);
    let { dynamicChildren } = n2;
    const mount = (vnode, container2, anchor2) => {
      if (vnode.shapeFlag & 16) {
        mountChildren(
          vnode.children,
          container2,
          anchor2,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      }
    };
    const mountToTarget = (vnode = n2) => {
      const disabled2 = isTeleportDisabled(vnode.props);
      const target = vnode.target = resolveTarget(vnode.props, querySelector);
      const targetAnchor = prepareAnchor(target, vnode, createText, insert);
      if (target) {
        if (namespace !== "svg" && isTargetSVG(target)) {
          namespace = "svg";
        } else if (namespace !== "mathml" && isTargetMathML(target)) {
          namespace = "mathml";
        }
        if (parentComponent && parentComponent.isCE) {
          (parentComponent.ce._teleportTargets || (parentComponent.ce._teleportTargets = /* @__PURE__ */ new Set())).add(target);
        }
        if (!disabled2) {
          mount(vnode, target, targetAnchor);
          updateCssVars(vnode, false);
        }
      }
    };
    const queuePendingMount = (vnode) => {
      const mountJob = () => {
        if (pendingMounts.get(vnode) !== mountJob) return;
        pendingMounts.delete(vnode);
        if (isTeleportDisabled(vnode.props)) {
          mount(vnode, container, vnode.anchor);
          updateCssVars(vnode, true);
        }
        mountToTarget(vnode);
      };
      pendingMounts.set(vnode, mountJob);
      queuePostRenderEffect(mountJob, parentSuspense);
    };
    if (n1 == null) {
      const placeholder = n2.el = createText("");
      const mainAnchor = n2.anchor = createText("");
      insert(placeholder, container, anchor);
      insert(mainAnchor, container, anchor);
      if (isTeleportDeferred(n2.props) || parentSuspense && parentSuspense.pendingBranch) {
        queuePendingMount(n2);
        return;
      }
      if (disabled) {
        mount(n2, container, mainAnchor);
        updateCssVars(n2, true);
      }
      mountToTarget();
    } else {
      n2.el = n1.el;
      const mainAnchor = n2.anchor = n1.anchor;
      const pendingMount = pendingMounts.get(n1);
      if (pendingMount) {
        pendingMount.flags |= 8;
        pendingMounts.delete(n1);
        queuePendingMount(n2);
        return;
      }
      n2.targetStart = n1.targetStart;
      const target = n2.target = n1.target;
      const targetAnchor = n2.targetAnchor = n1.targetAnchor;
      const wasDisabled = isTeleportDisabled(n1.props);
      const currentContainer = wasDisabled ? container : target;
      const currentAnchor = wasDisabled ? mainAnchor : targetAnchor;
      if (namespace === "svg" || isTargetSVG(target)) {
        namespace = "svg";
      } else if (namespace === "mathml" || isTargetMathML(target)) {
        namespace = "mathml";
      }
      if (dynamicChildren) {
        patchBlockChildren(
          n1.dynamicChildren,
          dynamicChildren,
          currentContainer,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds
        );
        traverseStaticChildren(n1, n2, true);
      } else if (!optimized) {
        patchChildren(
          n1,
          n2,
          currentContainer,
          currentAnchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          false
        );
      }
      if (disabled) {
        if (!wasDisabled) {
          moveTeleport(
            n2,
            container,
            mainAnchor,
            internals,
            1
          );
        } else {
          if (n2.props && n1.props && n2.props.to !== n1.props.to) {
            n2.props.to = n1.props.to;
          }
        }
      } else {
        if ((n2.props && n2.props.to) !== (n1.props && n1.props.to)) {
          const nextTarget = n2.target = resolveTarget(
            n2.props,
            querySelector
          );
          if (nextTarget) {
            moveTeleport(
              n2,
              nextTarget,
              null,
              internals,
              0
            );
          }
        } else if (wasDisabled) {
          moveTeleport(
            n2,
            target,
            targetAnchor,
            internals,
            1
          );
        }
      }
      updateCssVars(n2, disabled);
    }
  },
  remove(vnode, parentComponent, parentSuspense, { um: unmount, o: { remove: hostRemove } }, doRemove) {
    const {
      shapeFlag,
      children,
      anchor,
      targetStart,
      targetAnchor,
      target,
      props
    } = vnode;
    let shouldRemove = doRemove || !isTeleportDisabled(props);
    const pendingMount = pendingMounts.get(vnode);
    if (pendingMount) {
      pendingMount.flags |= 8;
      pendingMounts.delete(vnode);
      shouldRemove = false;
    }
    if (target) {
      hostRemove(targetStart);
      hostRemove(targetAnchor);
    }
    doRemove && hostRemove(anchor);
    if (shapeFlag & 16) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        unmount(
          child,
          parentComponent,
          parentSuspense,
          shouldRemove,
          !!child.dynamicChildren
        );
      }
    }
  },
  move: moveTeleport,
  hydrate: hydrateTeleport
};
function moveTeleport(vnode, container, parentAnchor, { o: { insert }, m: move }, moveType = 2) {
  if (moveType === 0) {
    insert(vnode.targetAnchor, container, parentAnchor);
  }
  const { el, anchor, shapeFlag, children, props } = vnode;
  const isReorder = moveType === 2;
  if (isReorder) {
    insert(el, container, parentAnchor);
  }
  if (!isReorder || isTeleportDisabled(props)) {
    if (shapeFlag & 16) {
      for (let i = 0; i < children.length; i++) {
        move(
          children[i],
          container,
          parentAnchor,
          2
        );
      }
    }
  }
  if (isReorder) {
    insert(anchor, container, parentAnchor);
  }
}
function hydrateTeleport(node, vnode, parentComponent, parentSuspense, slotScopeIds, optimized, {
  o: { nextSibling, parentNode, querySelector, insert, createText }
}, hydrateChildren) {
  function hydrateAnchor(target2, targetNode) {
    let targetAnchor = targetNode;
    while (targetAnchor) {
      if (targetAnchor && targetAnchor.nodeType === 8) {
        if (targetAnchor.data === "teleport start anchor") {
          vnode.targetStart = targetAnchor;
        } else if (targetAnchor.data === "teleport anchor") {
          vnode.targetAnchor = targetAnchor;
          target2._lpa = vnode.targetAnchor && nextSibling(vnode.targetAnchor);
          break;
        }
      }
      targetAnchor = nextSibling(targetAnchor);
    }
  }
  function hydrateDisabledTeleport(node2, vnode2) {
    vnode2.anchor = hydrateChildren(
      nextSibling(node2),
      vnode2,
      parentNode(node2),
      parentComponent,
      parentSuspense,
      slotScopeIds,
      optimized
    );
  }
  const target = vnode.target = resolveTarget(
    vnode.props,
    querySelector
  );
  const disabled = isTeleportDisabled(vnode.props);
  if (target) {
    const targetNode = target._lpa || target.firstChild;
    if (vnode.shapeFlag & 16) {
      if (disabled) {
        hydrateDisabledTeleport(node, vnode);
        hydrateAnchor(target, targetNode);
        if (!vnode.targetAnchor) {
          prepareAnchor(
            target,
            vnode,
            createText,
            insert,
            // if target is the same as the main view, insert anchors before current node
            // to avoid hydrating mismatch
            parentNode(node) === target ? node : null
          );
        }
      } else {
        vnode.anchor = nextSibling(node);
        hydrateAnchor(target, targetNode);
        if (!vnode.targetAnchor) {
          prepareAnchor(target, vnode, createText, insert);
        }
        hydrateChildren(
          targetNode && nextSibling(targetNode),
          vnode,
          target,
          parentComponent,
          parentSuspense,
          slotScopeIds,
          optimized
        );
      }
    }
    updateCssVars(vnode, disabled);
  } else if (disabled) {
    if (vnode.shapeFlag & 16) {
      hydrateDisabledTeleport(node, vnode);
      vnode.targetStart = node;
      vnode.targetAnchor = nextSibling(node);
    }
  }
  return vnode.anchor && nextSibling(vnode.anchor);
}
const Teleport = TeleportImpl;
function updateCssVars(vnode, isDisabled) {
  const ctx = vnode.ctx;
  if (ctx && ctx.ut) {
    let node, anchor;
    if (isDisabled) {
      node = vnode.el;
      anchor = vnode.anchor;
    } else {
      node = vnode.targetStart;
      anchor = vnode.targetAnchor;
    }
    while (node && node !== anchor) {
      if (node.nodeType === 1) node.setAttribute("data-v-owner", ctx.uid);
      node = node.nextSibling;
    }
    ctx.ut();
  }
}
function prepareAnchor(target, vnode, createText, insert, anchor = null) {
  const targetStart = vnode.targetStart = createText("");
  const targetAnchor = vnode.targetAnchor = createText("");
  targetStart[TeleportEndKey] = targetAnchor;
  if (target) {
    insert(targetStart, target, anchor);
    insert(targetAnchor, target, anchor);
  }
  return targetAnchor;
}
const leaveCbKey = /* @__PURE__ */ Symbol("_leaveCb");
const enterCbKey$1 = /* @__PURE__ */ Symbol("_enterCb");
function useTransitionState() {
  const state = {
    isMounted: false,
    isLeaving: false,
    isUnmounting: false,
    leavingVNodes: /* @__PURE__ */ new Map()
  };
  onMounted(() => {
    state.isMounted = true;
  });
  onBeforeUnmount(() => {
    state.isUnmounting = true;
  });
  return state;
}
const TransitionHookValidator = [Function, Array];
const BaseTransitionPropsValidators = {
  mode: String,
  appear: Boolean,
  persisted: Boolean,
  // enter
  onBeforeEnter: TransitionHookValidator,
  onEnter: TransitionHookValidator,
  onAfterEnter: TransitionHookValidator,
  onEnterCancelled: TransitionHookValidator,
  // leave
  onBeforeLeave: TransitionHookValidator,
  onLeave: TransitionHookValidator,
  onAfterLeave: TransitionHookValidator,
  onLeaveCancelled: TransitionHookValidator,
  // appear
  onBeforeAppear: TransitionHookValidator,
  onAppear: TransitionHookValidator,
  onAfterAppear: TransitionHookValidator,
  onAppearCancelled: TransitionHookValidator
};
const recursiveGetSubtree = (instance) => {
  const subTree = instance.subTree;
  return subTree.component ? recursiveGetSubtree(subTree.component) : subTree;
};
const BaseTransitionImpl = {
  name: `BaseTransition`,
  props: BaseTransitionPropsValidators,
  setup(props, { slots }) {
    const instance = getCurrentInstance();
    const state = useTransitionState();
    return () => {
      const children = slots.default && getTransitionRawChildren(slots.default(), true);
      if (!children || !children.length) {
        return;
      }
      const child = findNonCommentChild(children);
      const rawProps = /* @__PURE__ */ toRaw(props);
      const { mode } = rawProps;
      if (state.isLeaving) {
        return emptyPlaceholder(child);
      }
      const innerChild = getInnerChild$1(child);
      if (!innerChild) {
        return emptyPlaceholder(child);
      }
      let enterHooks = resolveTransitionHooks(
        innerChild,
        rawProps,
        state,
        instance,
        // #11061, ensure enterHooks is fresh after clone
        (hooks) => enterHooks = hooks
      );
      if (innerChild.type !== Comment) {
        setTransitionHooks(innerChild, enterHooks);
      }
      let oldInnerChild = instance.subTree && getInnerChild$1(instance.subTree);
      if (oldInnerChild && oldInnerChild.type !== Comment && !isSameVNodeType(oldInnerChild, innerChild) && recursiveGetSubtree(instance).type !== Comment) {
        let leavingHooks = resolveTransitionHooks(
          oldInnerChild,
          rawProps,
          state,
          instance
        );
        setTransitionHooks(oldInnerChild, leavingHooks);
        if (mode === "out-in" && innerChild.type !== Comment) {
          state.isLeaving = true;
          leavingHooks.afterLeave = () => {
            state.isLeaving = false;
            if (!(instance.job.flags & 8)) {
              instance.update();
            }
            delete leavingHooks.afterLeave;
            oldInnerChild = void 0;
          };
          return emptyPlaceholder(child);
        } else if (mode === "in-out" && innerChild.type !== Comment) {
          leavingHooks.delayLeave = (el, earlyRemove, delayedLeave) => {
            const leavingVNodesCache = getLeavingNodesForType(
              state,
              oldInnerChild
            );
            leavingVNodesCache[String(oldInnerChild.key)] = oldInnerChild;
            el[leaveCbKey] = () => {
              earlyRemove();
              el[leaveCbKey] = void 0;
              delete enterHooks.delayedLeave;
              oldInnerChild = void 0;
            };
            enterHooks.delayedLeave = () => {
              delayedLeave();
              delete enterHooks.delayedLeave;
              oldInnerChild = void 0;
            };
          };
        } else {
          oldInnerChild = void 0;
        }
      } else if (oldInnerChild) {
        oldInnerChild = void 0;
      }
      return child;
    };
  }
};
function findNonCommentChild(children) {
  let child = children[0];
  if (children.length > 1) {
    for (const c of children) {
      if (c.type !== Comment) {
        child = c;
        break;
      }
    }
  }
  return child;
}
const BaseTransition = BaseTransitionImpl;
function getLeavingNodesForType(state, vnode) {
  const { leavingVNodes } = state;
  let leavingVNodesCache = leavingVNodes.get(vnode.type);
  if (!leavingVNodesCache) {
    leavingVNodesCache = /* @__PURE__ */ Object.create(null);
    leavingVNodes.set(vnode.type, leavingVNodesCache);
  }
  return leavingVNodesCache;
}
function resolveTransitionHooks(vnode, props, state, instance, postClone) {
  const {
    appear,
    mode,
    persisted = false,
    onBeforeEnter,
    onEnter,
    onAfterEnter,
    onEnterCancelled,
    onBeforeLeave,
    onLeave,
    onAfterLeave,
    onLeaveCancelled,
    onBeforeAppear,
    onAppear,
    onAfterAppear,
    onAppearCancelled
  } = props;
  const key = String(vnode.key);
  const leavingVNodesCache = getLeavingNodesForType(state, vnode);
  const callHook2 = (hook, args) => {
    hook && callWithAsyncErrorHandling(
      hook,
      instance,
      9,
      args
    );
  };
  const callAsyncHook = (hook, args) => {
    const done = args[1];
    callHook2(hook, args);
    if (isArray$1(hook)) {
      if (hook.every((hook2) => hook2.length <= 1)) done();
    } else if (hook.length <= 1) {
      done();
    }
  };
  const hooks = {
    mode,
    persisted,
    beforeEnter(el) {
      let hook = onBeforeEnter;
      if (!state.isMounted) {
        if (appear) {
          hook = onBeforeAppear || onBeforeEnter;
        } else {
          return;
        }
      }
      if (el[leaveCbKey]) {
        el[leaveCbKey](
          true
          /* cancelled */
        );
      }
      const leavingVNode = leavingVNodesCache[key];
      if (leavingVNode && isSameVNodeType(vnode, leavingVNode) && leavingVNode.el[leaveCbKey]) {
        leavingVNode.el[leaveCbKey]();
      }
      callHook2(hook, [el]);
    },
    enter(el) {
      if (leavingVNodesCache[key] === vnode) return;
      let hook = onEnter;
      let afterHook = onAfterEnter;
      let cancelHook = onEnterCancelled;
      if (!state.isMounted) {
        if (appear) {
          hook = onAppear || onEnter;
          afterHook = onAfterAppear || onAfterEnter;
          cancelHook = onAppearCancelled || onEnterCancelled;
        } else {
          return;
        }
      }
      let called = false;
      el[enterCbKey$1] = (cancelled) => {
        if (called) return;
        called = true;
        if (cancelled) {
          callHook2(cancelHook, [el]);
        } else {
          callHook2(afterHook, [el]);
        }
        if (hooks.delayedLeave) {
          hooks.delayedLeave();
        }
        el[enterCbKey$1] = void 0;
      };
      const done = el[enterCbKey$1].bind(null, false);
      if (hook) {
        callAsyncHook(hook, [el, done]);
      } else {
        done();
      }
    },
    leave(el, remove2) {
      const key2 = String(vnode.key);
      if (el[enterCbKey$1]) {
        el[enterCbKey$1](
          true
          /* cancelled */
        );
      }
      if (state.isUnmounting) {
        return remove2();
      }
      callHook2(onBeforeLeave, [el]);
      let called = false;
      el[leaveCbKey] = (cancelled) => {
        if (called) return;
        called = true;
        remove2();
        if (cancelled) {
          callHook2(onLeaveCancelled, [el]);
        } else {
          callHook2(onAfterLeave, [el]);
        }
        el[leaveCbKey] = void 0;
        if (leavingVNodesCache[key2] === vnode) {
          delete leavingVNodesCache[key2];
        }
      };
      const done = el[leaveCbKey].bind(null, false);
      leavingVNodesCache[key2] = vnode;
      if (onLeave) {
        callAsyncHook(onLeave, [el, done]);
      } else {
        done();
      }
    },
    clone(vnode2) {
      const hooks2 = resolveTransitionHooks(
        vnode2,
        props,
        state,
        instance,
        postClone
      );
      if (postClone) postClone(hooks2);
      return hooks2;
    }
  };
  return hooks;
}
function emptyPlaceholder(vnode) {
  if (isKeepAlive(vnode)) {
    vnode = cloneVNode(vnode);
    vnode.children = null;
    return vnode;
  }
}
function getInnerChild$1(vnode) {
  if (!isKeepAlive(vnode)) {
    if (isTeleport(vnode.type) && vnode.children) {
      return findNonCommentChild(vnode.children);
    }
    return vnode;
  }
  if (vnode.component) {
    return vnode.component.subTree;
  }
  const { shapeFlag, children } = vnode;
  if (children) {
    if (shapeFlag & 16) {
      return children[0];
    }
    if (shapeFlag & 32 && isFunction(children.default)) {
      return children.default();
    }
  }
}
function setTransitionHooks(vnode, hooks) {
  if (vnode.shapeFlag & 6 && vnode.component) {
    vnode.transition = hooks;
    setTransitionHooks(vnode.component.subTree, hooks);
  } else if (vnode.shapeFlag & 128) {
    vnode.ssContent.transition = hooks.clone(vnode.ssContent);
    vnode.ssFallback.transition = hooks.clone(vnode.ssFallback);
  } else {
    vnode.transition = hooks;
  }
}
function getTransitionRawChildren(children, keepComment = false, parentKey) {
  let ret = [];
  let keyedFragmentCount = 0;
  for (let i = 0; i < children.length; i++) {
    let child = children[i];
    const key = parentKey == null ? child.key : String(parentKey) + String(child.key != null ? child.key : i);
    if (child.type === Fragment) {
      if (child.patchFlag & 128) keyedFragmentCount++;
      ret = ret.concat(
        getTransitionRawChildren(child.children, keepComment, key)
      );
    } else if (keepComment || child.type !== Comment) {
      ret.push(key != null ? cloneVNode(child, { key }) : child);
    }
  }
  if (keyedFragmentCount > 1) {
    for (let i = 0; i < ret.length; i++) {
      ret[i].patchFlag = -2;
    }
  }
  return ret;
}
// @__NO_SIDE_EFFECTS__
function defineComponent(options, extraOptions) {
  return isFunction(options) ? (
    // #8236: extend call and options.name access are considered side-effects
    // by Rollup, so we have to wrap it in a pure-annotated IIFE.
    /* @__PURE__ */ (() => extend({ name: options.name }, extraOptions, { setup: options }))()
  ) : options;
}
function markAsyncBoundary(instance) {
  instance.ids = [instance.ids[0] + instance.ids[2]++ + "-", 0, 0];
}
function isTemplateRefKey(refs, key) {
  let desc;
  return !!((desc = Object.getOwnPropertyDescriptor(refs, key)) && !desc.configurable);
}
const pendingSetRefMap = /* @__PURE__ */ new WeakMap();
function setRef(rawRef, oldRawRef, parentSuspense, vnode, isUnmount = false) {
  if (isArray$1(rawRef)) {
    rawRef.forEach(
      (r, i) => setRef(
        r,
        oldRawRef && (isArray$1(oldRawRef) ? oldRawRef[i] : oldRawRef),
        parentSuspense,
        vnode,
        isUnmount
      )
    );
    return;
  }
  if (isAsyncWrapper(vnode) && !isUnmount) {
    if (vnode.shapeFlag & 512 && vnode.type.__asyncResolved && vnode.component.subTree.component) {
      setRef(rawRef, oldRawRef, parentSuspense, vnode.component.subTree);
    }
    return;
  }
  const refValue = vnode.shapeFlag & 4 ? getComponentPublicInstance(vnode.component) : vnode.el;
  const value = isUnmount ? null : refValue;
  const { i: owner, r: ref3 } = rawRef;
  const oldRef = oldRawRef && oldRawRef.r;
  const refs = owner.refs === EMPTY_OBJ ? owner.refs = {} : owner.refs;
  const setupState = owner.setupState;
  const rawSetupState = /* @__PURE__ */ toRaw(setupState);
  const canSetSetupRef = setupState === EMPTY_OBJ ? NO : (key) => {
    if (isTemplateRefKey(refs, key)) {
      return false;
    }
    return hasOwn(rawSetupState, key);
  };
  const canSetRef = (ref22, key) => {
    if (key && isTemplateRefKey(refs, key)) {
      return false;
    }
    return true;
  };
  if (oldRef != null && oldRef !== ref3) {
    invalidatePendingSetRef(oldRawRef);
    if (isString(oldRef)) {
      refs[oldRef] = null;
      if (canSetSetupRef(oldRef)) {
        setupState[oldRef] = null;
      }
    } else if (/* @__PURE__ */ isRef(oldRef)) {
      const oldRawRefAtom = oldRawRef;
      if (canSetRef(oldRef, oldRawRefAtom.k)) {
        oldRef.value = null;
      }
      if (oldRawRefAtom.k) refs[oldRawRefAtom.k] = null;
    }
  }
  if (isFunction(ref3)) {
    callWithErrorHandling(ref3, owner, 12, [value, refs]);
  } else {
    const _isString = isString(ref3);
    const _isRef = /* @__PURE__ */ isRef(ref3);
    if (_isString || _isRef) {
      const doSet = () => {
        if (rawRef.f) {
          const existing = _isString ? canSetSetupRef(ref3) ? setupState[ref3] : refs[ref3] : canSetRef() || !rawRef.k ? ref3.value : refs[rawRef.k];
          if (isUnmount) {
            isArray$1(existing) && remove(existing, refValue);
          } else {
            if (!isArray$1(existing)) {
              if (_isString) {
                refs[ref3] = [refValue];
                if (canSetSetupRef(ref3)) {
                  setupState[ref3] = refs[ref3];
                }
              } else {
                const newVal = [refValue];
                if (canSetRef(ref3, rawRef.k)) {
                  ref3.value = newVal;
                }
                if (rawRef.k) refs[rawRef.k] = newVal;
              }
            } else if (!existing.includes(refValue)) {
              existing.push(refValue);
            }
          }
        } else if (_isString) {
          refs[ref3] = value;
          if (canSetSetupRef(ref3)) {
            setupState[ref3] = value;
          }
        } else if (_isRef) {
          if (canSetRef(ref3, rawRef.k)) {
            ref3.value = value;
          }
          if (rawRef.k) refs[rawRef.k] = value;
        } else ;
      };
      if (value) {
        const job = () => {
          doSet();
          pendingSetRefMap.delete(rawRef);
        };
        job.id = -1;
        pendingSetRefMap.set(rawRef, job);
        queuePostRenderEffect(job, parentSuspense);
      } else {
        invalidatePendingSetRef(rawRef);
        doSet();
      }
    }
  }
}
function invalidatePendingSetRef(rawRef) {
  const pendingSetRef = pendingSetRefMap.get(rawRef);
  if (pendingSetRef) {
    pendingSetRef.flags |= 8;
    pendingSetRefMap.delete(rawRef);
  }
}
getGlobalThis().requestIdleCallback || ((cb) => setTimeout(cb, 1));
getGlobalThis().cancelIdleCallback || ((id) => clearTimeout(id));
const isAsyncWrapper = (i) => !!i.type.__asyncLoader;
const isKeepAlive = (vnode) => vnode.type.__isKeepAlive;
function onActivated(hook, target) {
  registerKeepAliveHook(hook, "a", target);
}
function onDeactivated(hook, target) {
  registerKeepAliveHook(hook, "da", target);
}
function registerKeepAliveHook(hook, type, target = currentInstance) {
  const wrappedHook = hook.__wdc || (hook.__wdc = () => {
    let current = target;
    while (current) {
      if (current.isDeactivated) {
        return;
      }
      current = current.parent;
    }
    return hook();
  });
  injectHook(type, wrappedHook, target);
  if (target) {
    let current = target.parent;
    while (current && current.parent) {
      if (isKeepAlive(current.parent.vnode)) {
        injectToKeepAliveRoot(wrappedHook, type, target, current);
      }
      current = current.parent;
    }
  }
}
function injectToKeepAliveRoot(hook, type, target, keepAliveRoot) {
  const injected = injectHook(
    type,
    hook,
    keepAliveRoot,
    true
    /* prepend */
  );
  onUnmounted(() => {
    remove(keepAliveRoot[type], injected);
  }, target);
}
function injectHook(type, hook, target = currentInstance, prepend = false) {
  if (target) {
    const hooks = target[type] || (target[type] = []);
    const wrappedHook = hook.__weh || (hook.__weh = (...args) => {
      pauseTracking();
      const reset = setCurrentInstance(target);
      const res = callWithAsyncErrorHandling(hook, target, type, args);
      reset();
      resetTracking();
      return res;
    });
    if (prepend) {
      hooks.unshift(wrappedHook);
    } else {
      hooks.push(wrappedHook);
    }
    return wrappedHook;
  }
}
const createHook = (lifecycle) => (hook, target = currentInstance) => {
  if (!isInSSRComponentSetup || lifecycle === "sp") {
    injectHook(lifecycle, (...args) => hook(...args), target);
  }
};
const onBeforeMount = createHook("bm");
const onMounted = createHook("m");
const onBeforeUpdate = createHook(
  "bu"
);
const onUpdated = createHook("u");
const onBeforeUnmount = createHook(
  "bum"
);
const onUnmounted = createHook("um");
const onServerPrefetch = createHook(
  "sp"
);
const onRenderTriggered = createHook("rtg");
const onRenderTracked = createHook("rtc");
function onErrorCaptured(hook, target = currentInstance) {
  injectHook("ec", hook, target);
}
const COMPONENTS = "components";
function resolveComponent(name, maybeSelfReference) {
  return resolveAsset(COMPONENTS, name, true, maybeSelfReference) || name;
}
const NULL_DYNAMIC_COMPONENT = /* @__PURE__ */ Symbol.for("v-ndc");
function resolveAsset(type, name, warnMissing = true, maybeSelfReference = false) {
  const instance = currentRenderingInstance || currentInstance;
  if (instance) {
    const Component = instance.type;
    {
      const selfName = getComponentName(
        Component,
        false
      );
      if (selfName && (selfName === name || selfName === camelize(name) || selfName === capitalize(camelize(name)))) {
        return Component;
      }
    }
    const res = (
      // local registration
      // check instance[type] first which is resolved for options API
      resolve(instance[type] || Component[type], name) || // global registration
      resolve(instance.appContext[type], name)
    );
    if (!res && maybeSelfReference) {
      return Component;
    }
    return res;
  }
}
function resolve(registry, name) {
  return registry && (registry[name] || registry[camelize(name)] || registry[capitalize(camelize(name))]);
}
function renderList(source, renderItem, cache, index2) {
  let ret;
  const cached = cache;
  const sourceIsArray = isArray$1(source);
  if (sourceIsArray || isString(source)) {
    const sourceIsReactiveArray = sourceIsArray && /* @__PURE__ */ isReactive(source);
    let needsWrap = false;
    let isReadonlySource = false;
    if (sourceIsReactiveArray) {
      needsWrap = !/* @__PURE__ */ isShallow(source);
      isReadonlySource = /* @__PURE__ */ isReadonly(source);
      source = shallowReadArray(source);
    }
    ret = new Array(source.length);
    for (let i = 0, l = source.length; i < l; i++) {
      ret[i] = renderItem(
        needsWrap ? isReadonlySource ? toReadonly(toReactive(source[i])) : toReactive(source[i]) : source[i],
        i,
        void 0,
        cached
      );
    }
  } else if (typeof source === "number") {
    {
      ret = new Array(source);
      for (let i = 0; i < source; i++) {
        ret[i] = renderItem(i + 1, i, void 0, cached);
      }
    }
  } else if (isObject(source)) {
    if (source[Symbol.iterator]) {
      ret = Array.from(
        source,
        (item, i) => renderItem(item, i, void 0, cached)
      );
    } else {
      const keys = Object.keys(source);
      ret = new Array(keys.length);
      for (let i = 0, l = keys.length; i < l; i++) {
        const key = keys[i];
        ret[i] = renderItem(source[key], key, i, cached);
      }
    }
  } else {
    ret = [];
  }
  return ret;
}
const getPublicInstance = (i) => {
  if (!i) return null;
  if (isStatefulComponent(i)) return getComponentPublicInstance(i);
  return getPublicInstance(i.parent);
};
const publicPropertiesMap = (
  // Move PURE marker to new line to workaround compiler discarding it
  // due to type annotation
  /* @__PURE__ */ extend(/* @__PURE__ */ Object.create(null), {
    $: (i) => i,
    $el: (i) => i.vnode.el,
    $data: (i) => i.data,
    $props: (i) => i.props,
    $attrs: (i) => i.attrs,
    $slots: (i) => i.slots,
    $refs: (i) => i.refs,
    $parent: (i) => getPublicInstance(i.parent),
    $root: (i) => getPublicInstance(i.root),
    $host: (i) => i.ce,
    $emit: (i) => i.emit,
    $options: (i) => resolveMergedOptions(i),
    $forceUpdate: (i) => i.f || (i.f = () => {
      queueJob(i.update);
    }),
    $nextTick: (i) => i.n || (i.n = nextTick.bind(i.proxy)),
    $watch: (i) => instanceWatch.bind(i)
  })
);
const hasSetupBinding = (state, key) => state !== EMPTY_OBJ && !state.__isScriptSetup && hasOwn(state, key);
const PublicInstanceProxyHandlers = {
  get({ _: instance }, key) {
    if (key === "__v_skip") {
      return true;
    }
    const { ctx, setupState, data, props, accessCache, type, appContext } = instance;
    if (key[0] !== "$") {
      const n = accessCache[key];
      if (n !== void 0) {
        switch (n) {
          case 1:
            return setupState[key];
          case 2:
            return data[key];
          case 4:
            return ctx[key];
          case 3:
            return props[key];
        }
      } else if (hasSetupBinding(setupState, key)) {
        accessCache[key] = 1;
        return setupState[key];
      } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
        accessCache[key] = 2;
        return data[key];
      } else if (hasOwn(props, key)) {
        accessCache[key] = 3;
        return props[key];
      } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
        accessCache[key] = 4;
        return ctx[key];
      } else if (shouldCacheAccess) {
        accessCache[key] = 0;
      }
    }
    const publicGetter = publicPropertiesMap[key];
    let cssModule, globalProperties;
    if (publicGetter) {
      if (key === "$attrs") {
        track(instance.attrs, "get", "");
      }
      return publicGetter(instance);
    } else if (
      // css module (injected by vue-loader)
      (cssModule = type.__cssModules) && (cssModule = cssModule[key])
    ) {
      return cssModule;
    } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
      accessCache[key] = 4;
      return ctx[key];
    } else if (
      // global properties
      globalProperties = appContext.config.globalProperties, hasOwn(globalProperties, key)
    ) {
      {
        return globalProperties[key];
      }
    } else ;
  },
  set({ _: instance }, key, value) {
    const { data, setupState, ctx } = instance;
    if (hasSetupBinding(setupState, key)) {
      setupState[key] = value;
      return true;
    } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
      data[key] = value;
      return true;
    } else if (hasOwn(instance.props, key)) {
      return false;
    }
    if (key[0] === "$" && key.slice(1) in instance) {
      return false;
    } else {
      {
        ctx[key] = value;
      }
    }
    return true;
  },
  has({
    _: { data, setupState, accessCache, ctx, appContext, props, type }
  }, key) {
    let cssModules;
    return !!(accessCache[key] || data !== EMPTY_OBJ && key[0] !== "$" && hasOwn(data, key) || hasSetupBinding(setupState, key) || hasOwn(props, key) || hasOwn(ctx, key) || hasOwn(publicPropertiesMap, key) || hasOwn(appContext.config.globalProperties, key) || (cssModules = type.__cssModules) && cssModules[key]);
  },
  defineProperty(target, key, descriptor) {
    if (descriptor.get != null) {
      target._.accessCache[key] = 0;
    } else if (hasOwn(descriptor, "value")) {
      this.set(target, key, descriptor.value, null);
    }
    return Reflect.defineProperty(target, key, descriptor);
  }
};
function normalizePropsOrEmits(props) {
  return isArray$1(props) ? props.reduce(
    (normalized, p2) => (normalized[p2] = null, normalized),
    {}
  ) : props;
}
let shouldCacheAccess = true;
function applyOptions(instance) {
  const options = resolveMergedOptions(instance);
  const publicThis = instance.proxy;
  const ctx = instance.ctx;
  shouldCacheAccess = false;
  if (options.beforeCreate) {
    callHook$1(options.beforeCreate, instance, "bc");
  }
  const {
    // state
    data: dataOptions,
    computed: computedOptions,
    methods,
    watch: watchOptions,
    provide: provideOptions,
    inject: injectOptions,
    // lifecycle
    created,
    beforeMount,
    mounted,
    beforeUpdate,
    updated,
    activated,
    deactivated,
    beforeDestroy,
    beforeUnmount,
    destroyed,
    unmounted,
    render,
    renderTracked,
    renderTriggered,
    errorCaptured,
    serverPrefetch,
    // public API
    expose,
    inheritAttrs,
    // assets
    components,
    directives,
    filters
  } = options;
  const checkDuplicateProperties = null;
  if (injectOptions) {
    resolveInjections(injectOptions, ctx, checkDuplicateProperties);
  }
  if (methods) {
    for (const key in methods) {
      const methodHandler = methods[key];
      if (isFunction(methodHandler)) {
        {
          ctx[key] = methodHandler.bind(publicThis);
        }
      }
    }
  }
  if (dataOptions) {
    const data = dataOptions.call(publicThis, publicThis);
    if (!isObject(data)) ;
    else {
      instance.data = /* @__PURE__ */ reactive(data);
    }
  }
  shouldCacheAccess = true;
  if (computedOptions) {
    for (const key in computedOptions) {
      const opt = computedOptions[key];
      const get = isFunction(opt) ? opt.bind(publicThis, publicThis) : isFunction(opt.get) ? opt.get.bind(publicThis, publicThis) : NOOP;
      const set = !isFunction(opt) && isFunction(opt.set) ? opt.set.bind(publicThis) : NOOP;
      const c = computed({
        get,
        set
      });
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => c.value,
        set: (v) => c.value = v
      });
    }
  }
  if (watchOptions) {
    for (const key in watchOptions) {
      createWatcher(watchOptions[key], ctx, publicThis, key);
    }
  }
  if (provideOptions) {
    const provides = isFunction(provideOptions) ? provideOptions.call(publicThis) : provideOptions;
    Reflect.ownKeys(provides).forEach((key) => {
      provide(key, provides[key]);
    });
  }
  if (created) {
    callHook$1(created, instance, "c");
  }
  function registerLifecycleHook(register, hook) {
    if (isArray$1(hook)) {
      hook.forEach((_hook) => register(_hook.bind(publicThis)));
    } else if (hook) {
      register(hook.bind(publicThis));
    }
  }
  registerLifecycleHook(onBeforeMount, beforeMount);
  registerLifecycleHook(onMounted, mounted);
  registerLifecycleHook(onBeforeUpdate, beforeUpdate);
  registerLifecycleHook(onUpdated, updated);
  registerLifecycleHook(onActivated, activated);
  registerLifecycleHook(onDeactivated, deactivated);
  registerLifecycleHook(onErrorCaptured, errorCaptured);
  registerLifecycleHook(onRenderTracked, renderTracked);
  registerLifecycleHook(onRenderTriggered, renderTriggered);
  registerLifecycleHook(onBeforeUnmount, beforeUnmount);
  registerLifecycleHook(onUnmounted, unmounted);
  registerLifecycleHook(onServerPrefetch, serverPrefetch);
  if (isArray$1(expose)) {
    if (expose.length) {
      const exposed = instance.exposed || (instance.exposed = {});
      expose.forEach((key) => {
        Object.defineProperty(exposed, key, {
          get: () => publicThis[key],
          set: (val) => publicThis[key] = val,
          enumerable: true
        });
      });
    } else if (!instance.exposed) {
      instance.exposed = {};
    }
  }
  if (render && instance.render === NOOP) {
    instance.render = render;
  }
  if (inheritAttrs != null) {
    instance.inheritAttrs = inheritAttrs;
  }
  if (components) instance.components = components;
  if (directives) instance.directives = directives;
  if (serverPrefetch) {
    markAsyncBoundary(instance);
  }
}
function resolveInjections(injectOptions, ctx, checkDuplicateProperties = NOOP) {
  if (isArray$1(injectOptions)) {
    injectOptions = normalizeInject(injectOptions);
  }
  for (const key in injectOptions) {
    const opt = injectOptions[key];
    let injected;
    if (isObject(opt)) {
      if ("default" in opt) {
        injected = inject(
          opt.from || key,
          opt.default,
          true
        );
      } else {
        injected = inject(opt.from || key);
      }
    } else {
      injected = inject(opt);
    }
    if (/* @__PURE__ */ isRef(injected)) {
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => injected.value,
        set: (v) => injected.value = v
      });
    } else {
      ctx[key] = injected;
    }
  }
}
function callHook$1(hook, instance, type) {
  callWithAsyncErrorHandling(
    isArray$1(hook) ? hook.map((h2) => h2.bind(instance.proxy)) : hook.bind(instance.proxy),
    instance,
    type
  );
}
function createWatcher(raw, ctx, publicThis, key) {
  let getter = key.includes(".") ? createPathGetter(publicThis, key) : () => publicThis[key];
  if (isString(raw)) {
    const handler = ctx[raw];
    if (isFunction(handler)) {
      {
        watch(getter, handler);
      }
    }
  } else if (isFunction(raw)) {
    {
      watch(getter, raw.bind(publicThis));
    }
  } else if (isObject(raw)) {
    if (isArray$1(raw)) {
      raw.forEach((r) => createWatcher(r, ctx, publicThis, key));
    } else {
      const handler = isFunction(raw.handler) ? raw.handler.bind(publicThis) : ctx[raw.handler];
      if (isFunction(handler)) {
        watch(getter, handler, raw);
      }
    }
  } else ;
}
function resolveMergedOptions(instance) {
  const base = instance.type;
  const { mixins, extends: extendsOptions } = base;
  const {
    mixins: globalMixins,
    optionsCache: cache,
    config: { optionMergeStrategies }
  } = instance.appContext;
  const cached = cache.get(base);
  let resolved;
  if (cached) {
    resolved = cached;
  } else if (!globalMixins.length && !mixins && !extendsOptions) {
    {
      resolved = base;
    }
  } else {
    resolved = {};
    if (globalMixins.length) {
      globalMixins.forEach(
        (m) => mergeOptions$1(resolved, m, optionMergeStrategies, true)
      );
    }
    mergeOptions$1(resolved, base, optionMergeStrategies);
  }
  if (isObject(base)) {
    cache.set(base, resolved);
  }
  return resolved;
}
function mergeOptions$1(to, from, strats, asMixin = false) {
  const { mixins, extends: extendsOptions } = from;
  if (extendsOptions) {
    mergeOptions$1(to, extendsOptions, strats, true);
  }
  if (mixins) {
    mixins.forEach(
      (m) => mergeOptions$1(to, m, strats, true)
    );
  }
  for (const key in from) {
    if (asMixin && key === "expose") ;
    else {
      const strat = internalOptionMergeStrats[key] || strats && strats[key];
      to[key] = strat ? strat(to[key], from[key]) : from[key];
    }
  }
  return to;
}
const internalOptionMergeStrats = {
  data: mergeDataFn,
  props: mergeEmitsOrPropsOptions,
  emits: mergeEmitsOrPropsOptions,
  // objects
  methods: mergeObjectOptions,
  computed: mergeObjectOptions,
  // lifecycle
  beforeCreate: mergeAsArray,
  created: mergeAsArray,
  beforeMount: mergeAsArray,
  mounted: mergeAsArray,
  beforeUpdate: mergeAsArray,
  updated: mergeAsArray,
  beforeDestroy: mergeAsArray,
  beforeUnmount: mergeAsArray,
  destroyed: mergeAsArray,
  unmounted: mergeAsArray,
  activated: mergeAsArray,
  deactivated: mergeAsArray,
  errorCaptured: mergeAsArray,
  serverPrefetch: mergeAsArray,
  // assets
  components: mergeObjectOptions,
  directives: mergeObjectOptions,
  // watch
  watch: mergeWatchOptions,
  // provide / inject
  provide: mergeDataFn,
  inject: mergeInject
};
function mergeDataFn(to, from) {
  if (!from) {
    return to;
  }
  if (!to) {
    return from;
  }
  return function mergedDataFn() {
    return extend(
      isFunction(to) ? to.call(this, this) : to,
      isFunction(from) ? from.call(this, this) : from
    );
  };
}
function mergeInject(to, from) {
  return mergeObjectOptions(normalizeInject(to), normalizeInject(from));
}
function normalizeInject(raw) {
  if (isArray$1(raw)) {
    const res = {};
    for (let i = 0; i < raw.length; i++) {
      res[raw[i]] = raw[i];
    }
    return res;
  }
  return raw;
}
function mergeAsArray(to, from) {
  return to ? [...new Set([].concat(to, from))] : from;
}
function mergeObjectOptions(to, from) {
  return to ? extend(/* @__PURE__ */ Object.create(null), to, from) : from;
}
function mergeEmitsOrPropsOptions(to, from) {
  if (to) {
    if (isArray$1(to) && isArray$1(from)) {
      return [.../* @__PURE__ */ new Set([...to, ...from])];
    }
    return extend(
      /* @__PURE__ */ Object.create(null),
      normalizePropsOrEmits(to),
      normalizePropsOrEmits(from != null ? from : {})
    );
  } else {
    return from;
  }
}
function mergeWatchOptions(to, from) {
  if (!to) return from;
  if (!from) return to;
  const merged = extend(/* @__PURE__ */ Object.create(null), to);
  for (const key in from) {
    merged[key] = mergeAsArray(to[key], from[key]);
  }
  return merged;
}
function createAppContext() {
  return {
    app: null,
    config: {
      isNativeTag: NO,
      performance: false,
      globalProperties: {},
      optionMergeStrategies: {},
      errorHandler: void 0,
      warnHandler: void 0,
      compilerOptions: {}
    },
    mixins: [],
    components: {},
    directives: {},
    provides: /* @__PURE__ */ Object.create(null),
    optionsCache: /* @__PURE__ */ new WeakMap(),
    propsCache: /* @__PURE__ */ new WeakMap(),
    emitsCache: /* @__PURE__ */ new WeakMap()
  };
}
let uid$1 = 0;
function createAppAPI(render, hydrate) {
  return function createApp2(rootComponent, rootProps = null) {
    if (!isFunction(rootComponent)) {
      rootComponent = extend({}, rootComponent);
    }
    if (rootProps != null && !isObject(rootProps)) {
      rootProps = null;
    }
    const context = createAppContext();
    const installedPlugins = /* @__PURE__ */ new WeakSet();
    const pluginCleanupFns = [];
    let isMounted = false;
    const app2 = context.app = {
      _uid: uid$1++,
      _component: rootComponent,
      _props: rootProps,
      _container: null,
      _context: context,
      _instance: null,
      version,
      get config() {
        return context.config;
      },
      set config(v) {
      },
      use(plugin, ...options) {
        if (installedPlugins.has(plugin)) ;
        else if (plugin && isFunction(plugin.install)) {
          installedPlugins.add(plugin);
          plugin.install(app2, ...options);
        } else if (isFunction(plugin)) {
          installedPlugins.add(plugin);
          plugin(app2, ...options);
        } else ;
        return app2;
      },
      mixin(mixin) {
        {
          if (!context.mixins.includes(mixin)) {
            context.mixins.push(mixin);
          }
        }
        return app2;
      },
      component(name, component) {
        if (!component) {
          return context.components[name];
        }
        context.components[name] = component;
        return app2;
      },
      directive(name, directive) {
        if (!directive) {
          return context.directives[name];
        }
        context.directives[name] = directive;
        return app2;
      },
      mount(rootContainer, isHydrate, namespace) {
        if (!isMounted) {
          const vnode = app2._ceVNode || createVNode(rootComponent, rootProps);
          vnode.appContext = context;
          if (namespace === true) {
            namespace = "svg";
          } else if (namespace === false) {
            namespace = void 0;
          }
          {
            render(vnode, rootContainer, namespace);
          }
          isMounted = true;
          app2._container = rootContainer;
          rootContainer.__vue_app__ = app2;
          return getComponentPublicInstance(vnode.component);
        }
      },
      onUnmount(cleanupFn) {
        pluginCleanupFns.push(cleanupFn);
      },
      unmount() {
        if (isMounted) {
          callWithAsyncErrorHandling(
            pluginCleanupFns,
            app2._instance,
            16
          );
          render(null, app2._container);
          delete app2._container.__vue_app__;
        }
      },
      provide(key, value) {
        context.provides[key] = value;
        return app2;
      },
      runWithContext(fn) {
        const lastApp = currentApp;
        currentApp = app2;
        try {
          return fn();
        } finally {
          currentApp = lastApp;
        }
      }
    };
    return app2;
  };
}
let currentApp = null;
const getModelModifiers = (props, modelName) => {
  return modelName === "modelValue" || modelName === "model-value" ? props.modelModifiers : props[`${modelName}Modifiers`] || props[`${camelize(modelName)}Modifiers`] || props[`${hyphenate(modelName)}Modifiers`];
};
function emit(instance, event, ...rawArgs) {
  if (instance.isUnmounted) return;
  const props = instance.vnode.props || EMPTY_OBJ;
  let args = rawArgs;
  const isModelListener2 = event.startsWith("update:");
  const modifiers = isModelListener2 && getModelModifiers(props, event.slice(7));
  if (modifiers) {
    if (modifiers.trim) {
      args = rawArgs.map((a) => isString(a) ? a.trim() : a);
    }
    if (modifiers.number) {
      args = rawArgs.map(looseToNumber);
    }
  }
  let handlerName;
  let handler = props[handlerName = toHandlerKey(event)] || // also try camelCase event handler (#2249)
  props[handlerName = toHandlerKey(camelize(event))];
  if (!handler && isModelListener2) {
    handler = props[handlerName = toHandlerKey(hyphenate(event))];
  }
  if (handler) {
    callWithAsyncErrorHandling(
      handler,
      instance,
      6,
      args
    );
  }
  const onceHandler = props[handlerName + `Once`];
  if (onceHandler) {
    if (!instance.emitted) {
      instance.emitted = {};
    } else if (instance.emitted[handlerName]) {
      return;
    }
    instance.emitted[handlerName] = true;
    callWithAsyncErrorHandling(
      onceHandler,
      instance,
      6,
      args
    );
  }
}
const mixinEmitsCache = /* @__PURE__ */ new WeakMap();
function normalizeEmitsOptions(comp, appContext, asMixin = false) {
  const cache = asMixin ? mixinEmitsCache : appContext.emitsCache;
  const cached = cache.get(comp);
  if (cached !== void 0) {
    return cached;
  }
  const raw = comp.emits;
  let normalized = {};
  let hasExtends = false;
  if (!isFunction(comp)) {
    const extendEmits = (raw2) => {
      const normalizedFromExtend = normalizeEmitsOptions(raw2, appContext, true);
      if (normalizedFromExtend) {
        hasExtends = true;
        extend(normalized, normalizedFromExtend);
      }
    };
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendEmits);
    }
    if (comp.extends) {
      extendEmits(comp.extends);
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendEmits);
    }
  }
  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, null);
    }
    return null;
  }
  if (isArray$1(raw)) {
    raw.forEach((key) => normalized[key] = null);
  } else {
    extend(normalized, raw);
  }
  if (isObject(comp)) {
    cache.set(comp, normalized);
  }
  return normalized;
}
function isEmitListener(options, key) {
  if (!options || !isOn(key)) {
    return false;
  }
  key = key.slice(2).replace(/Once$/, "");
  return hasOwn(options, key[0].toLowerCase() + key.slice(1)) || hasOwn(options, hyphenate(key)) || hasOwn(options, key);
}
function markAttrsAccessed() {
}
function renderComponentRoot(instance) {
  const {
    type: Component,
    vnode,
    proxy,
    withProxy,
    propsOptions: [propsOptions],
    slots,
    attrs,
    emit: emit2,
    render,
    renderCache,
    props,
    data,
    setupState,
    ctx,
    inheritAttrs
  } = instance;
  const prev = setCurrentRenderingInstance(instance);
  let result;
  let fallthroughAttrs;
  try {
    if (vnode.shapeFlag & 4) {
      const proxyToUse = withProxy || proxy;
      const thisProxy = false ? new Proxy(proxyToUse, {
        get(target, key, receiver) {
          warn$1(
            `Property '${String(
              key
            )}' was accessed via 'this'. Avoid using 'this' in templates.`
          );
          return Reflect.get(target, key, receiver);
        }
      }) : proxyToUse;
      result = normalizeVNode(
        render.call(
          thisProxy,
          proxyToUse,
          renderCache,
          false ? /* @__PURE__ */ shallowReadonly(props) : props,
          setupState,
          data,
          ctx
        )
      );
      fallthroughAttrs = attrs;
    } else {
      const render2 = Component;
      if (false) ;
      result = normalizeVNode(
        render2.length > 1 ? render2(
          false ? /* @__PURE__ */ shallowReadonly(props) : props,
          false ? {
            get attrs() {
              markAttrsAccessed();
              return /* @__PURE__ */ shallowReadonly(attrs);
            },
            slots,
            emit: emit2
          } : { attrs, slots, emit: emit2 }
        ) : render2(
          false ? /* @__PURE__ */ shallowReadonly(props) : props,
          null
        )
      );
      fallthroughAttrs = Component.props ? attrs : getFunctionalFallthrough(attrs);
    }
  } catch (err) {
    blockStack.length = 0;
    handleError(err, instance, 1);
    result = createVNode(Comment);
  }
  let root = result;
  if (fallthroughAttrs && inheritAttrs !== false) {
    const keys = Object.keys(fallthroughAttrs);
    const { shapeFlag } = root;
    if (keys.length) {
      if (shapeFlag & (1 | 6)) {
        if (propsOptions && keys.some(isModelListener)) {
          fallthroughAttrs = filterModelListeners(
            fallthroughAttrs,
            propsOptions
          );
        }
        root = cloneVNode(root, fallthroughAttrs, false, true);
      }
    }
  }
  if (vnode.dirs) {
    root = cloneVNode(root, null, false, true);
    root.dirs = root.dirs ? root.dirs.concat(vnode.dirs) : vnode.dirs;
  }
  if (vnode.transition) {
    setTransitionHooks(root, vnode.transition);
  }
  {
    result = root;
  }
  setCurrentRenderingInstance(prev);
  return result;
}
const getFunctionalFallthrough = (attrs) => {
  let res;
  for (const key in attrs) {
    if (key === "class" || key === "style" || isOn(key)) {
      (res || (res = {}))[key] = attrs[key];
    }
  }
  return res;
};
const filterModelListeners = (attrs, props) => {
  const res = {};
  for (const key in attrs) {
    if (!isModelListener(key) || !(key.slice(9) in props)) {
      res[key] = attrs[key];
    }
  }
  return res;
};
function shouldUpdateComponent(prevVNode, nextVNode, optimized) {
  const { props: prevProps, children: prevChildren, component } = prevVNode;
  const { props: nextProps, children: nextChildren, patchFlag } = nextVNode;
  const emits = component.emitsOptions;
  if (nextVNode.dirs || nextVNode.transition) {
    return true;
  }
  if (optimized && patchFlag >= 0) {
    if (patchFlag & 1024) {
      return true;
    }
    if (patchFlag & 16) {
      if (!prevProps) {
        return !!nextProps;
      }
      return hasPropsChanged(prevProps, nextProps, emits);
    } else if (patchFlag & 8) {
      const dynamicProps = nextVNode.dynamicProps;
      for (let i = 0; i < dynamicProps.length; i++) {
        const key = dynamicProps[i];
        if (hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emits, key)) {
          return true;
        }
      }
    }
  } else {
    if (prevChildren || nextChildren) {
      if (!nextChildren || !nextChildren.$stable) {
        return true;
      }
    }
    if (prevProps === nextProps) {
      return false;
    }
    if (!prevProps) {
      return !!nextProps;
    }
    if (!nextProps) {
      return true;
    }
    return hasPropsChanged(prevProps, nextProps, emits);
  }
  return false;
}
function hasPropsChanged(prevProps, nextProps, emitsOptions) {
  const nextKeys = Object.keys(nextProps);
  if (nextKeys.length !== Object.keys(prevProps).length) {
    return true;
  }
  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i];
    if (hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emitsOptions, key)) {
      return true;
    }
  }
  return false;
}
function hasPropValueChanged(nextProps, prevProps, key) {
  const nextProp = nextProps[key];
  const prevProp = prevProps[key];
  if (key === "style" && isObject(nextProp) && isObject(prevProp)) {
    return !looseEqual(nextProp, prevProp);
  }
  return nextProp !== prevProp;
}
function updateHOCHostEl({ vnode, parent, suspense }, el) {
  while (parent) {
    const root = parent.subTree;
    if (root.suspense && root.suspense.activeBranch === vnode) {
      root.suspense.vnode.el = root.el = el;
      vnode = root;
    }
    if (root === vnode) {
      (vnode = parent.vnode).el = el;
      parent = parent.parent;
    } else {
      break;
    }
  }
  if (suspense && suspense.activeBranch === vnode) {
    suspense.vnode.el = el;
  }
}
const internalObjectProto = {};
const createInternalObject = () => Object.create(internalObjectProto);
const isInternalObject = (obj) => Object.getPrototypeOf(obj) === internalObjectProto;
function initProps(instance, rawProps, isStateful, isSSR = false) {
  const props = {};
  const attrs = createInternalObject();
  instance.propsDefaults = /* @__PURE__ */ Object.create(null);
  setFullProps(instance, rawProps, props, attrs);
  for (const key in instance.propsOptions[0]) {
    if (!(key in props)) {
      props[key] = void 0;
    }
  }
  if (isStateful) {
    instance.props = isSSR ? props : /* @__PURE__ */ shallowReactive(props);
  } else {
    if (!instance.type.props) {
      instance.props = attrs;
    } else {
      instance.props = props;
    }
  }
  instance.attrs = attrs;
}
function updateProps(instance, rawProps, rawPrevProps, optimized) {
  const {
    props,
    attrs,
    vnode: { patchFlag }
  } = instance;
  const rawCurrentProps = /* @__PURE__ */ toRaw(props);
  const [options] = instance.propsOptions;
  let hasAttrsChanged = false;
  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    (optimized || patchFlag > 0) && !(patchFlag & 16)
  ) {
    if (patchFlag & 8) {
      const propsToUpdate = instance.vnode.dynamicProps;
      for (let i = 0; i < propsToUpdate.length; i++) {
        let key = propsToUpdate[i];
        if (isEmitListener(instance.emitsOptions, key)) {
          continue;
        }
        const value = rawProps[key];
        if (options) {
          if (hasOwn(attrs, key)) {
            if (value !== attrs[key]) {
              attrs[key] = value;
              hasAttrsChanged = true;
            }
          } else {
            const camelizedKey = camelize(key);
            props[camelizedKey] = resolvePropValue(
              options,
              rawCurrentProps,
              camelizedKey,
              value,
              instance,
              false
            );
          }
        } else {
          if (value !== attrs[key]) {
            attrs[key] = value;
            hasAttrsChanged = true;
          }
        }
      }
    }
  } else {
    if (setFullProps(instance, rawProps, props, attrs)) {
      hasAttrsChanged = true;
    }
    let kebabKey;
    for (const key in rawCurrentProps) {
      if (!rawProps || // for camelCase
      !hasOwn(rawProps, key) && // it's possible the original props was passed in as kebab-case
      // and converted to camelCase (#955)
      ((kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey))) {
        if (options) {
          if (rawPrevProps && // for camelCase
          (rawPrevProps[key] !== void 0 || // for kebab-case
          rawPrevProps[kebabKey] !== void 0)) {
            props[key] = resolvePropValue(
              options,
              rawCurrentProps,
              key,
              void 0,
              instance,
              true
            );
          }
        } else {
          delete props[key];
        }
      }
    }
    if (attrs !== rawCurrentProps) {
      for (const key in attrs) {
        if (!rawProps || !hasOwn(rawProps, key) && true) {
          delete attrs[key];
          hasAttrsChanged = true;
        }
      }
    }
  }
  if (hasAttrsChanged) {
    trigger(instance.attrs, "set", "");
  }
}
function setFullProps(instance, rawProps, props, attrs) {
  const [options, needCastKeys] = instance.propsOptions;
  let hasAttrsChanged = false;
  let rawCastValues;
  if (rawProps) {
    for (let key in rawProps) {
      if (isReservedProp(key)) {
        continue;
      }
      const value = rawProps[key];
      let camelKey;
      if (options && hasOwn(options, camelKey = camelize(key))) {
        if (!needCastKeys || !needCastKeys.includes(camelKey)) {
          props[camelKey] = value;
        } else {
          (rawCastValues || (rawCastValues = {}))[camelKey] = value;
        }
      } else if (!isEmitListener(instance.emitsOptions, key)) {
        if (!(key in attrs) || value !== attrs[key]) {
          attrs[key] = value;
          hasAttrsChanged = true;
        }
      }
    }
  }
  if (needCastKeys) {
    const rawCurrentProps = /* @__PURE__ */ toRaw(props);
    const castValues = rawCastValues || EMPTY_OBJ;
    for (let i = 0; i < needCastKeys.length; i++) {
      const key = needCastKeys[i];
      props[key] = resolvePropValue(
        options,
        rawCurrentProps,
        key,
        castValues[key],
        instance,
        !hasOwn(castValues, key)
      );
    }
  }
  return hasAttrsChanged;
}
function resolvePropValue(options, props, key, value, instance, isAbsent) {
  const opt = options[key];
  if (opt != null) {
    const hasDefault = hasOwn(opt, "default");
    if (hasDefault && value === void 0) {
      const defaultValue = opt.default;
      if (opt.type !== Function && !opt.skipFactory && isFunction(defaultValue)) {
        const { propsDefaults } = instance;
        if (key in propsDefaults) {
          value = propsDefaults[key];
        } else {
          const reset = setCurrentInstance(instance);
          value = propsDefaults[key] = defaultValue.call(
            null,
            props
          );
          reset();
        }
      } else {
        value = defaultValue;
      }
      if (instance.ce) {
        instance.ce._setProp(key, value);
      }
    }
    if (opt[
      0
      /* shouldCast */
    ]) {
      if (isAbsent && !hasDefault) {
        value = false;
      } else if (opt[
        1
        /* shouldCastTrue */
      ] && (value === "" || value === hyphenate(key))) {
        value = true;
      }
    }
  }
  return value;
}
const mixinPropsCache = /* @__PURE__ */ new WeakMap();
function normalizePropsOptions(comp, appContext, asMixin = false) {
  const cache = asMixin ? mixinPropsCache : appContext.propsCache;
  const cached = cache.get(comp);
  if (cached) {
    return cached;
  }
  const raw = comp.props;
  const normalized = {};
  const needCastKeys = [];
  let hasExtends = false;
  if (!isFunction(comp)) {
    const extendProps = (raw2) => {
      hasExtends = true;
      const [props, keys] = normalizePropsOptions(raw2, appContext, true);
      extend(normalized, props);
      if (keys) needCastKeys.push(...keys);
    };
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendProps);
    }
    if (comp.extends) {
      extendProps(comp.extends);
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendProps);
    }
  }
  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, EMPTY_ARR);
    }
    return EMPTY_ARR;
  }
  if (isArray$1(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const normalizedKey = camelize(raw[i]);
      if (validatePropName(normalizedKey)) {
        normalized[normalizedKey] = EMPTY_OBJ;
      }
    }
  } else if (raw) {
    for (const key in raw) {
      const normalizedKey = camelize(key);
      if (validatePropName(normalizedKey)) {
        const opt = raw[key];
        const prop = normalized[normalizedKey] = isArray$1(opt) || isFunction(opt) ? { type: opt } : extend({}, opt);
        const propType = prop.type;
        let shouldCast = false;
        let shouldCastTrue = true;
        if (isArray$1(propType)) {
          for (let index2 = 0; index2 < propType.length; ++index2) {
            const type = propType[index2];
            const typeName = isFunction(type) && type.name;
            if (typeName === "Boolean") {
              shouldCast = true;
              break;
            } else if (typeName === "String") {
              shouldCastTrue = false;
            }
          }
        } else {
          shouldCast = isFunction(propType) && propType.name === "Boolean";
        }
        prop[
          0
          /* shouldCast */
        ] = shouldCast;
        prop[
          1
          /* shouldCastTrue */
        ] = shouldCastTrue;
        if (shouldCast || hasOwn(prop, "default")) {
          needCastKeys.push(normalizedKey);
        }
      }
    }
  }
  const res = [normalized, needCastKeys];
  if (isObject(comp)) {
    cache.set(comp, res);
  }
  return res;
}
function validatePropName(key) {
  if (key[0] !== "$" && !isReservedProp(key)) {
    return true;
  }
  return false;
}
const isInternalKey = (key) => key === "_" || key === "_ctx" || key === "$stable";
const normalizeSlotValue = (value) => isArray$1(value) ? value.map(normalizeVNode) : [normalizeVNode(value)];
const normalizeSlot$1 = (key, rawSlot, ctx) => {
  if (rawSlot._n) {
    return rawSlot;
  }
  const normalized = withCtx((...args) => {
    if (false) ;
    return normalizeSlotValue(rawSlot(...args));
  }, ctx);
  normalized._c = false;
  return normalized;
};
const normalizeObjectSlots = (rawSlots, slots, instance) => {
  const ctx = rawSlots._ctx;
  for (const key in rawSlots) {
    if (isInternalKey(key)) continue;
    const value = rawSlots[key];
    if (isFunction(value)) {
      slots[key] = normalizeSlot$1(key, value, ctx);
    } else if (value != null) {
      const normalized = normalizeSlotValue(value);
      slots[key] = () => normalized;
    }
  }
};
const normalizeVNodeSlots = (instance, children) => {
  const normalized = normalizeSlotValue(children);
  instance.slots.default = () => normalized;
};
const assignSlots = (slots, children, optimized) => {
  for (const key in children) {
    if (optimized || !isInternalKey(key)) {
      slots[key] = children[key];
    }
  }
};
const initSlots = (instance, children, optimized) => {
  const slots = instance.slots = createInternalObject();
  if (instance.vnode.shapeFlag & 32) {
    const type = children._;
    if (type) {
      assignSlots(slots, children, optimized);
      if (optimized) {
        def(slots, "_", type, true);
      }
    } else {
      normalizeObjectSlots(children, slots);
    }
  } else if (children) {
    normalizeVNodeSlots(instance, children);
  }
};
const updateSlots = (instance, children, optimized) => {
  const { vnode, slots } = instance;
  let needDeletionCheck = true;
  let deletionComparisonTarget = EMPTY_OBJ;
  if (vnode.shapeFlag & 32) {
    const type = children._;
    if (type) {
      if (optimized && type === 1) {
        needDeletionCheck = false;
      } else {
        assignSlots(slots, children, optimized);
      }
    } else {
      needDeletionCheck = !children.$stable;
      normalizeObjectSlots(children, slots);
    }
    deletionComparisonTarget = children;
  } else if (children) {
    normalizeVNodeSlots(instance, children);
    deletionComparisonTarget = { default: 1 };
  }
  if (needDeletionCheck) {
    for (const key in slots) {
      if (!isInternalKey(key) && deletionComparisonTarget[key] == null) {
        delete slots[key];
      }
    }
  }
};
const queuePostRenderEffect = queueEffectWithSuspense;
function createRenderer(options) {
  return baseCreateRenderer(options);
}
function baseCreateRenderer(options, createHydrationFns) {
  const target = getGlobalThis();
  target.__VUE__ = true;
  const {
    insert: hostInsert,
    remove: hostRemove,
    patchProp: hostPatchProp,
    createElement: hostCreateElement,
    createText: hostCreateText,
    createComment: hostCreateComment,
    setText: hostSetText,
    setElementText: hostSetElementText,
    parentNode: hostParentNode,
    nextSibling: hostNextSibling,
    setScopeId: hostSetScopeId = NOOP,
    insertStaticContent: hostInsertStaticContent
  } = options;
  const patch = (n1, n2, container, anchor = null, parentComponent = null, parentSuspense = null, namespace = void 0, slotScopeIds = null, optimized = !!n2.dynamicChildren) => {
    if (n1 === n2) {
      return;
    }
    if (n1 && !isSameVNodeType(n1, n2)) {
      anchor = getNextHostNode(n1);
      unmount(n1, parentComponent, parentSuspense, true);
      n1 = null;
    }
    if (n2.patchFlag === -2) {
      optimized = false;
      n2.dynamicChildren = null;
    }
    const { type, ref: ref3, shapeFlag } = n2;
    switch (type) {
      case Text:
        processText(n1, n2, container, anchor);
        break;
      case Comment:
        processCommentNode(n1, n2, container, anchor);
        break;
      case Static:
        if (n1 == null) {
          mountStaticNode(n2, container, anchor, namespace);
        }
        break;
      case Fragment:
        processFragment(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        break;
      default:
        if (shapeFlag & 1) {
          processElement(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & 6) {
          processComponent(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & 64) {
          type.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals
          );
        } else if (shapeFlag & 128) {
          type.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals
          );
        } else ;
    }
    if (ref3 != null && parentComponent) {
      setRef(ref3, n1 && n1.ref, parentSuspense, n2 || n1, !n2);
    } else if (ref3 == null && n1 && n1.ref != null) {
      setRef(n1.ref, null, parentSuspense, n1, true);
    }
  };
  const processText = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        n2.el = hostCreateText(n2.children),
        container,
        anchor
      );
    } else {
      const el = n2.el = n1.el;
      if (n2.children !== n1.children) {
        hostSetText(el, n2.children);
      }
    }
  };
  const processCommentNode = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        n2.el = hostCreateComment(n2.children || ""),
        container,
        anchor
      );
    } else {
      n2.el = n1.el;
    }
  };
  const mountStaticNode = (n2, container, anchor, namespace) => {
    [n2.el, n2.anchor] = hostInsertStaticContent(
      n2.children,
      container,
      anchor,
      namespace,
      n2.el,
      n2.anchor
    );
  };
  const moveStaticNode = ({ el, anchor }, container, nextSibling) => {
    let next;
    while (el && el !== anchor) {
      next = hostNextSibling(el);
      hostInsert(el, container, nextSibling);
      el = next;
    }
    hostInsert(anchor, container, nextSibling);
  };
  const removeStaticNode = ({ el, anchor }) => {
    let next;
    while (el && el !== anchor) {
      next = hostNextSibling(el);
      hostRemove(el);
      el = next;
    }
    hostRemove(anchor);
  };
  const processElement = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    if (n2.type === "svg") {
      namespace = "svg";
    } else if (n2.type === "math") {
      namespace = "mathml";
    }
    if (n1 == null) {
      mountElement(
        n2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    } else {
      const customElement = n1.el && n1.el._isVueCE ? n1.el : null;
      try {
        if (customElement) {
          customElement._beginPatch();
        }
        patchElement(
          n1,
          n2,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } finally {
        if (customElement) {
          customElement._endPatch();
        }
      }
    }
  };
  const mountElement = (vnode, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    let el;
    let vnodeHook;
    const { props, shapeFlag, transition, dirs } = vnode;
    el = vnode.el = hostCreateElement(
      vnode.type,
      namespace,
      props && props.is,
      props
    );
    if (shapeFlag & 8) {
      hostSetElementText(el, vnode.children);
    } else if (shapeFlag & 16) {
      mountChildren(
        vnode.children,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(vnode, namespace),
        slotScopeIds,
        optimized
      );
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, "created");
    }
    setScopeId(el, vnode, vnode.scopeId, slotScopeIds, parentComponent);
    if (props) {
      for (const key in props) {
        if (key !== "value" && !isReservedProp(key)) {
          hostPatchProp(el, key, null, props[key], namespace, parentComponent);
        }
      }
      if ("value" in props) {
        hostPatchProp(el, "value", null, props.value, namespace);
      }
      if (vnodeHook = props.onVnodeBeforeMount) {
        invokeVNodeHook(vnodeHook, parentComponent, vnode);
      }
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, "beforeMount");
    }
    const needCallTransitionHooks = needTransition(parentSuspense, transition);
    if (needCallTransitionHooks) {
      transition.beforeEnter(el);
    }
    hostInsert(el, container, anchor);
    if ((vnodeHook = props && props.onVnodeMounted) || needCallTransitionHooks || dirs) {
      queuePostRenderEffect(() => {
        try {
          vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
          needCallTransitionHooks && transition.enter(el);
          dirs && invokeDirectiveHook(vnode, null, parentComponent, "mounted");
        } finally {
        }
      }, parentSuspense);
    }
  };
  const setScopeId = (el, vnode, scopeId, slotScopeIds, parentComponent) => {
    if (scopeId) {
      hostSetScopeId(el, scopeId);
    }
    if (slotScopeIds) {
      for (let i = 0; i < slotScopeIds.length; i++) {
        hostSetScopeId(el, slotScopeIds[i]);
      }
    }
    if (parentComponent) {
      let subTree = parentComponent.subTree;
      if (vnode === subTree || isSuspense(subTree.type) && (subTree.ssContent === vnode || subTree.ssFallback === vnode)) {
        const parentVNode = parentComponent.vnode;
        setScopeId(
          el,
          parentVNode,
          parentVNode.scopeId,
          parentVNode.slotScopeIds,
          parentComponent.parent
        );
      }
    }
  };
  const mountChildren = (children, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, start = 0) => {
    for (let i = start; i < children.length; i++) {
      const child = children[i] = optimized ? cloneIfMounted(children[i]) : normalizeVNode(children[i]);
      patch(
        null,
        child,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    }
  };
  const patchElement = (n1, n2, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    const el = n2.el = n1.el;
    let { patchFlag, dynamicChildren, dirs } = n2;
    patchFlag |= n1.patchFlag & 16;
    const oldProps = n1.props || EMPTY_OBJ;
    const newProps = n2.props || EMPTY_OBJ;
    let vnodeHook;
    parentComponent && toggleRecurse(parentComponent, false);
    if (vnodeHook = newProps.onVnodeBeforeUpdate) {
      invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
    }
    if (dirs) {
      invokeDirectiveHook(n2, n1, parentComponent, "beforeUpdate");
    }
    parentComponent && toggleRecurse(parentComponent, true);
    if (oldProps.innerHTML && newProps.innerHTML == null || oldProps.textContent && newProps.textContent == null) {
      hostSetElementText(el, "");
    }
    if (dynamicChildren) {
      patchBlockChildren(
        n1.dynamicChildren,
        dynamicChildren,
        el,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds
      );
    } else if (!optimized) {
      patchChildren(
        n1,
        n2,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds,
        false
      );
    }
    if (patchFlag > 0) {
      if (patchFlag & 16) {
        patchProps(el, oldProps, newProps, parentComponent, namespace);
      } else {
        if (patchFlag & 2) {
          if (oldProps.class !== newProps.class) {
            hostPatchProp(el, "class", null, newProps.class, namespace);
          }
        }
        if (patchFlag & 4) {
          hostPatchProp(el, "style", oldProps.style, newProps.style, namespace);
        }
        if (patchFlag & 8) {
          const propsToUpdate = n2.dynamicProps;
          for (let i = 0; i < propsToUpdate.length; i++) {
            const key = propsToUpdate[i];
            const prev = oldProps[key];
            const next = newProps[key];
            if (next !== prev || key === "value") {
              hostPatchProp(el, key, prev, next, namespace, parentComponent);
            }
          }
        }
      }
      if (patchFlag & 1) {
        if (n1.children !== n2.children) {
          hostSetElementText(el, n2.children);
        }
      }
    } else if (!optimized && dynamicChildren == null) {
      patchProps(el, oldProps, newProps, parentComponent, namespace);
    }
    if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
        dirs && invokeDirectiveHook(n2, n1, parentComponent, "updated");
      }, parentSuspense);
    }
  };
  const patchBlockChildren = (oldChildren, newChildren, fallbackContainer, parentComponent, parentSuspense, namespace, slotScopeIds) => {
    for (let i = 0; i < newChildren.length; i++) {
      const oldVNode = oldChildren[i];
      const newVNode = newChildren[i];
      const container = (
        // oldVNode may be an errored async setup() component inside Suspense
        // which will not have a mounted element
        oldVNode.el && // - In the case of a Fragment, we need to provide the actual parent
        // of the Fragment itself so it can move its children.
        (oldVNode.type === Fragment || // - In the case of different nodes, there is going to be a replacement
        // which also requires the correct parent container
        !isSameVNodeType(oldVNode, newVNode) || // - In the case of a component, it could contain anything.
        oldVNode.shapeFlag & (6 | 64 | 128)) ? hostParentNode(oldVNode.el) : (
          // In other cases, the parent container is not actually used so we
          // just pass the block element here to avoid a DOM parentNode call.
          fallbackContainer
        )
      );
      patch(
        oldVNode,
        newVNode,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        true
      );
    }
  };
  const patchProps = (el, oldProps, newProps, parentComponent, namespace) => {
    if (oldProps !== newProps) {
      if (oldProps !== EMPTY_OBJ) {
        for (const key in oldProps) {
          if (!isReservedProp(key) && !(key in newProps)) {
            hostPatchProp(
              el,
              key,
              oldProps[key],
              null,
              namespace,
              parentComponent
            );
          }
        }
      }
      for (const key in newProps) {
        if (isReservedProp(key)) continue;
        const next = newProps[key];
        const prev = oldProps[key];
        if (next !== prev && key !== "value") {
          hostPatchProp(el, key, prev, next, namespace, parentComponent);
        }
      }
      if ("value" in newProps) {
        hostPatchProp(el, "value", oldProps.value, newProps.value, namespace);
      }
    }
  };
  const processFragment = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    const fragmentStartAnchor = n2.el = n1 ? n1.el : hostCreateText("");
    const fragmentEndAnchor = n2.anchor = n1 ? n1.anchor : hostCreateText("");
    let { patchFlag, dynamicChildren, slotScopeIds: fragmentSlotScopeIds } = n2;
    if (fragmentSlotScopeIds) {
      slotScopeIds = slotScopeIds ? slotScopeIds.concat(fragmentSlotScopeIds) : fragmentSlotScopeIds;
    }
    if (n1 == null) {
      hostInsert(fragmentStartAnchor, container, anchor);
      hostInsert(fragmentEndAnchor, container, anchor);
      mountChildren(
        // #10007
        // such fragment like `<></>` will be compiled into
        // a fragment which doesn't have a children.
        // In this case fallback to an empty array
        n2.children || [],
        container,
        fragmentEndAnchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    } else {
      if (patchFlag > 0 && patchFlag & 64 && dynamicChildren && // #2715 the previous fragment could've been a BAILed one as a result
      // of renderSlot() with no valid children
      n1.dynamicChildren && n1.dynamicChildren.length === dynamicChildren.length) {
        patchBlockChildren(
          n1.dynamicChildren,
          dynamicChildren,
          container,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds
        );
        if (
          // #2080 if the stable fragment has a key, it's a <template v-for> that may
          //  get moved around. Make sure all root level vnodes inherit el.
          // #2134 or if it's a component root, it may also get moved around
          // as the component is being moved.
          n2.key != null || parentComponent && n2 === parentComponent.subTree
        ) {
          traverseStaticChildren(
            n1,
            n2,
            true
            /* shallow */
          );
        }
      } else {
        patchChildren(
          n1,
          n2,
          container,
          fragmentEndAnchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      }
    }
  };
  const processComponent = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    n2.slotScopeIds = slotScopeIds;
    if (n1 == null) {
      if (n2.shapeFlag & 512) {
        parentComponent.ctx.activate(
          n2,
          container,
          anchor,
          namespace,
          optimized
        );
      } else {
        mountComponent(
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          optimized
        );
      }
    } else {
      updateComponent(n1, n2, optimized);
    }
  };
  const mountComponent = (initialVNode, container, anchor, parentComponent, parentSuspense, namespace, optimized) => {
    const instance = initialVNode.component = createComponentInstance(
      initialVNode,
      parentComponent,
      parentSuspense
    );
    if (isKeepAlive(initialVNode)) {
      instance.ctx.renderer = internals;
    }
    {
      setupComponent(instance, false, optimized);
    }
    if (instance.asyncDep) {
      parentSuspense && parentSuspense.registerDep(instance, setupRenderEffect, optimized);
      if (!initialVNode.el) {
        const placeholder = instance.subTree = createVNode(Comment);
        processCommentNode(null, placeholder, container, anchor);
        initialVNode.placeholder = placeholder.el;
      }
    } else {
      setupRenderEffect(
        instance,
        initialVNode,
        container,
        anchor,
        parentSuspense,
        namespace,
        optimized
      );
    }
  };
  const updateComponent = (n1, n2, optimized) => {
    const instance = n2.component = n1.component;
    if (shouldUpdateComponent(n1, n2, optimized)) {
      if (instance.asyncDep && !instance.asyncResolved) {
        updateComponentPreRender(instance, n2, optimized);
        return;
      } else {
        instance.next = n2;
        instance.update();
      }
    } else {
      n2.el = n1.el;
      instance.vnode = n2;
    }
  };
  const setupRenderEffect = (instance, initialVNode, container, anchor, parentSuspense, namespace, optimized) => {
    const componentUpdateFn = () => {
      if (!instance.isMounted) {
        let vnodeHook;
        const { el, props } = initialVNode;
        const { bm, m, parent, root, type } = instance;
        const isAsyncWrapperVNode = isAsyncWrapper(initialVNode);
        toggleRecurse(instance, false);
        if (bm) {
          invokeArrayFns(bm);
        }
        if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeBeforeMount)) {
          invokeVNodeHook(vnodeHook, parent, initialVNode);
        }
        toggleRecurse(instance, true);
        {
          if (root.ce && root.ce._hasShadowRoot()) {
            root.ce._injectChildStyle(
              type,
              instance.parent ? instance.parent.type : void 0
            );
          }
          const subTree = instance.subTree = renderComponentRoot(instance);
          patch(
            null,
            subTree,
            container,
            anchor,
            instance,
            parentSuspense,
            namespace
          );
          initialVNode.el = subTree.el;
        }
        if (m) {
          queuePostRenderEffect(m, parentSuspense);
        }
        if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeMounted)) {
          const scopedInitialVNode = initialVNode;
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, scopedInitialVNode),
            parentSuspense
          );
        }
        if (initialVNode.shapeFlag & 256 || parent && isAsyncWrapper(parent.vnode) && parent.vnode.shapeFlag & 256) {
          instance.a && queuePostRenderEffect(instance.a, parentSuspense);
        }
        instance.isMounted = true;
        initialVNode = container = anchor = null;
      } else {
        let { next, bu, u, parent, vnode } = instance;
        {
          const nonHydratedAsyncRoot = locateNonHydratedAsyncRoot(instance);
          if (nonHydratedAsyncRoot) {
            if (next) {
              next.el = vnode.el;
              updateComponentPreRender(instance, next, optimized);
            }
            nonHydratedAsyncRoot.asyncDep.then(() => {
              queuePostRenderEffect(() => {
                if (!instance.isUnmounted) update2();
              }, parentSuspense);
            });
            return;
          }
        }
        let originNext = next;
        let vnodeHook;
        toggleRecurse(instance, false);
        if (next) {
          next.el = vnode.el;
          updateComponentPreRender(instance, next, optimized);
        } else {
          next = vnode;
        }
        if (bu) {
          invokeArrayFns(bu);
        }
        if (vnodeHook = next.props && next.props.onVnodeBeforeUpdate) {
          invokeVNodeHook(vnodeHook, parent, next, vnode);
        }
        toggleRecurse(instance, true);
        const nextTree = renderComponentRoot(instance);
        const prevTree = instance.subTree;
        instance.subTree = nextTree;
        patch(
          prevTree,
          nextTree,
          // parent may have changed if it's in a teleport
          hostParentNode(prevTree.el),
          // anchor may have changed if it's in a fragment
          getNextHostNode(prevTree),
          instance,
          parentSuspense,
          namespace
        );
        next.el = nextTree.el;
        if (originNext === null) {
          updateHOCHostEl(instance, nextTree.el);
        }
        if (u) {
          queuePostRenderEffect(u, parentSuspense);
        }
        if (vnodeHook = next.props && next.props.onVnodeUpdated) {
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, next, vnode),
            parentSuspense
          );
        }
      }
    };
    instance.scope.on();
    const effect2 = instance.effect = new ReactiveEffect(componentUpdateFn);
    instance.scope.off();
    const update2 = instance.update = effect2.run.bind(effect2);
    const job = instance.job = effect2.runIfDirty.bind(effect2);
    job.i = instance;
    job.id = instance.uid;
    effect2.scheduler = () => queueJob(job);
    toggleRecurse(instance, true);
    update2();
  };
  const updateComponentPreRender = (instance, nextVNode, optimized) => {
    nextVNode.component = instance;
    const prevProps = instance.vnode.props;
    instance.vnode = nextVNode;
    instance.next = null;
    updateProps(instance, nextVNode.props, prevProps, optimized);
    updateSlots(instance, nextVNode.children, optimized);
    pauseTracking();
    flushPreFlushCbs(instance);
    resetTracking();
  };
  const patchChildren = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized = false) => {
    const c1 = n1 && n1.children;
    const prevShapeFlag = n1 ? n1.shapeFlag : 0;
    const c2 = n2.children;
    const { patchFlag, shapeFlag } = n2;
    if (patchFlag > 0) {
      if (patchFlag & 128) {
        patchKeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        return;
      } else if (patchFlag & 256) {
        patchUnkeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        return;
      }
    }
    if (shapeFlag & 8) {
      if (prevShapeFlag & 16) {
        unmountChildren(c1, parentComponent, parentSuspense);
      }
      if (c2 !== c1) {
        hostSetElementText(container, c2);
      }
    } else {
      if (prevShapeFlag & 16) {
        if (shapeFlag & 16) {
          patchKeyedChildren(
            c1,
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else {
          unmountChildren(c1, parentComponent, parentSuspense, true);
        }
      } else {
        if (prevShapeFlag & 8) {
          hostSetElementText(container, "");
        }
        if (shapeFlag & 16) {
          mountChildren(
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        }
      }
    }
  };
  const patchUnkeyedChildren = (c1, c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    c1 = c1 || EMPTY_ARR;
    c2 = c2 || EMPTY_ARR;
    const oldLength = c1.length;
    const newLength = c2.length;
    const commonLength = Math.min(oldLength, newLength);
    let i;
    for (i = 0; i < commonLength; i++) {
      const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
      patch(
        c1[i],
        nextChild,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    }
    if (oldLength > newLength) {
      unmountChildren(
        c1,
        parentComponent,
        parentSuspense,
        true,
        false,
        commonLength
      );
    } else {
      mountChildren(
        c2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
        commonLength
      );
    }
  };
  const patchKeyedChildren = (c1, c2, container, parentAnchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    let i = 0;
    const l2 = c2.length;
    let e1 = c1.length - 1;
    let e2 = l2 - 1;
    while (i <= e1 && i <= e2) {
      const n1 = c1[i];
      const n2 = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } else {
        break;
      }
      i++;
    }
    while (i <= e1 && i <= e2) {
      const n1 = c1[e1];
      const n2 = c2[e2] = optimized ? cloneIfMounted(c2[e2]) : normalizeVNode(c2[e2]);
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } else {
        break;
      }
      e1--;
      e2--;
    }
    if (i > e1) {
      if (i <= e2) {
        const nextPos = e2 + 1;
        const anchor = nextPos < l2 ? c2[nextPos].el : parentAnchor;
        while (i <= e2) {
          patch(
            null,
            c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]),
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
          i++;
        }
      }
    } else if (i > e2) {
      while (i <= e1) {
        unmount(c1[i], parentComponent, parentSuspense, true);
        i++;
      }
    } else {
      const s1 = i;
      const s2 = i;
      const keyToNewIndexMap = /* @__PURE__ */ new Map();
      for (i = s2; i <= e2; i++) {
        const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
        if (nextChild.key != null) {
          keyToNewIndexMap.set(nextChild.key, i);
        }
      }
      let j;
      let patched = 0;
      const toBePatched = e2 - s2 + 1;
      let moved = false;
      let maxNewIndexSoFar = 0;
      const newIndexToOldIndexMap = new Array(toBePatched);
      for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0;
      for (i = s1; i <= e1; i++) {
        const prevChild = c1[i];
        if (patched >= toBePatched) {
          unmount(prevChild, parentComponent, parentSuspense, true);
          continue;
        }
        let newIndex;
        if (prevChild.key != null) {
          newIndex = keyToNewIndexMap.get(prevChild.key);
        } else {
          for (j = s2; j <= e2; j++) {
            if (newIndexToOldIndexMap[j - s2] === 0 && isSameVNodeType(prevChild, c2[j])) {
              newIndex = j;
              break;
            }
          }
        }
        if (newIndex === void 0) {
          unmount(prevChild, parentComponent, parentSuspense, true);
        } else {
          newIndexToOldIndexMap[newIndex - s2] = i + 1;
          if (newIndex >= maxNewIndexSoFar) {
            maxNewIndexSoFar = newIndex;
          } else {
            moved = true;
          }
          patch(
            prevChild,
            c2[newIndex],
            container,
            null,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
          patched++;
        }
      }
      const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : EMPTY_ARR;
      j = increasingNewIndexSequence.length - 1;
      for (i = toBePatched - 1; i >= 0; i--) {
        const nextIndex = s2 + i;
        const nextChild = c2[nextIndex];
        const anchorVNode = c2[nextIndex + 1];
        const anchor = nextIndex + 1 < l2 ? (
          // #13559, #14173 fallback to el placeholder for unresolved async component
          anchorVNode.el || resolveAsyncComponentPlaceholder(anchorVNode)
        ) : parentAnchor;
        if (newIndexToOldIndexMap[i] === 0) {
          patch(
            null,
            nextChild,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (moved) {
          if (j < 0 || i !== increasingNewIndexSequence[j]) {
            move(nextChild, container, anchor, 2);
          } else {
            j--;
          }
        }
      }
    }
  };
  const move = (vnode, container, anchor, moveType, parentSuspense = null) => {
    const { el, type, transition, children, shapeFlag } = vnode;
    if (shapeFlag & 6) {
      move(vnode.component.subTree, container, anchor, moveType);
      return;
    }
    if (shapeFlag & 128) {
      vnode.suspense.move(container, anchor, moveType);
      return;
    }
    if (shapeFlag & 64) {
      type.move(vnode, container, anchor, internals);
      return;
    }
    if (type === Fragment) {
      hostInsert(el, container, anchor);
      for (let i = 0; i < children.length; i++) {
        move(children[i], container, anchor, moveType);
      }
      hostInsert(vnode.anchor, container, anchor);
      return;
    }
    if (type === Static) {
      moveStaticNode(vnode, container, anchor);
      return;
    }
    const needTransition2 = moveType !== 2 && shapeFlag & 1 && transition;
    if (needTransition2) {
      if (moveType === 0) {
        transition.beforeEnter(el);
        hostInsert(el, container, anchor);
        queuePostRenderEffect(() => transition.enter(el), parentSuspense);
      } else {
        const { leave, delayLeave, afterLeave } = transition;
        const remove22 = () => {
          if (vnode.ctx.isUnmounted) {
            hostRemove(el);
          } else {
            hostInsert(el, container, anchor);
          }
        };
        const performLeave = () => {
          if (el._isLeaving) {
            el[leaveCbKey](
              true
              /* cancelled */
            );
          }
          leave(el, () => {
            remove22();
            afterLeave && afterLeave();
          });
        };
        if (delayLeave) {
          delayLeave(el, remove22, performLeave);
        } else {
          performLeave();
        }
      }
    } else {
      hostInsert(el, container, anchor);
    }
  };
  const unmount = (vnode, parentComponent, parentSuspense, doRemove = false, optimized = false) => {
    const {
      type,
      props,
      ref: ref3,
      children,
      dynamicChildren,
      shapeFlag,
      patchFlag,
      dirs,
      cacheIndex,
      memo
    } = vnode;
    if (patchFlag === -2) {
      optimized = false;
    }
    if (ref3 != null) {
      pauseTracking();
      setRef(ref3, null, parentSuspense, vnode, true);
      resetTracking();
    }
    if (cacheIndex != null) {
      parentComponent.renderCache[cacheIndex] = void 0;
    }
    if (shapeFlag & 256) {
      parentComponent.ctx.deactivate(vnode);
      return;
    }
    const shouldInvokeDirs = shapeFlag & 1 && dirs;
    const shouldInvokeVnodeHook = !isAsyncWrapper(vnode);
    let vnodeHook;
    if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeBeforeUnmount)) {
      invokeVNodeHook(vnodeHook, parentComponent, vnode);
    }
    if (shapeFlag & 6) {
      unmountComponent(vnode.component, parentSuspense, doRemove);
    } else {
      if (shapeFlag & 128) {
        vnode.suspense.unmount(parentSuspense, doRemove);
        return;
      }
      if (shouldInvokeDirs) {
        invokeDirectiveHook(vnode, null, parentComponent, "beforeUnmount");
      }
      if (shapeFlag & 64) {
        vnode.type.remove(
          vnode,
          parentComponent,
          parentSuspense,
          internals,
          doRemove
        );
      } else if (dynamicChildren && // #5154
      // when v-once is used inside a block, setBlockTracking(-1) marks the
      // parent block with hasOnce: true
      // so that it doesn't take the fast path during unmount - otherwise
      // components nested in v-once are never unmounted.
      !dynamicChildren.hasOnce && // #1153: fast path should not be taken for non-stable (v-for) fragments
      (type !== Fragment || patchFlag > 0 && patchFlag & 64)) {
        unmountChildren(
          dynamicChildren,
          parentComponent,
          parentSuspense,
          false,
          true
        );
      } else if (type === Fragment && patchFlag & (128 | 256) || !optimized && shapeFlag & 16) {
        unmountChildren(children, parentComponent, parentSuspense);
      }
      if (doRemove) {
        remove2(vnode);
      }
    }
    const shouldInvalidateMemo = memo != null && cacheIndex == null;
    if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeUnmounted) || shouldInvokeDirs || shouldInvalidateMemo) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
        shouldInvokeDirs && invokeDirectiveHook(vnode, null, parentComponent, "unmounted");
        if (shouldInvalidateMemo) {
          vnode.el = null;
        }
      }, parentSuspense);
    }
  };
  const remove2 = (vnode) => {
    const { type, el, anchor, transition } = vnode;
    if (type === Fragment) {
      {
        removeFragment(el, anchor);
      }
      return;
    }
    if (type === Static) {
      removeStaticNode(vnode);
      return;
    }
    const performRemove = () => {
      hostRemove(el);
      if (transition && !transition.persisted && transition.afterLeave) {
        transition.afterLeave();
      }
    };
    if (vnode.shapeFlag & 1 && transition && !transition.persisted) {
      const { leave, delayLeave } = transition;
      const performLeave = () => leave(el, performRemove);
      if (delayLeave) {
        delayLeave(vnode.el, performRemove, performLeave);
      } else {
        performLeave();
      }
    } else {
      performRemove();
    }
  };
  const removeFragment = (cur, end) => {
    let next;
    while (cur !== end) {
      next = hostNextSibling(cur);
      hostRemove(cur);
      cur = next;
    }
    hostRemove(end);
  };
  const unmountComponent = (instance, parentSuspense, doRemove) => {
    const { bum, scope, job, subTree, um, m, a } = instance;
    invalidateMount(m);
    invalidateMount(a);
    if (bum) {
      invokeArrayFns(bum);
    }
    scope.stop();
    if (job) {
      job.flags |= 8;
      unmount(subTree, instance, parentSuspense, doRemove);
    }
    if (um) {
      queuePostRenderEffect(um, parentSuspense);
    }
    queuePostRenderEffect(() => {
      instance.isUnmounted = true;
    }, parentSuspense);
  };
  const unmountChildren = (children, parentComponent, parentSuspense, doRemove = false, optimized = false, start = 0) => {
    for (let i = start; i < children.length; i++) {
      unmount(children[i], parentComponent, parentSuspense, doRemove, optimized);
    }
  };
  const getNextHostNode = (vnode) => {
    if (vnode.shapeFlag & 6) {
      return getNextHostNode(vnode.component.subTree);
    }
    if (vnode.shapeFlag & 128) {
      return vnode.suspense.next();
    }
    const el = hostNextSibling(vnode.anchor || vnode.el);
    const teleportEnd = el && el[TeleportEndKey];
    return teleportEnd ? hostNextSibling(teleportEnd) : el;
  };
  let isFlushing = false;
  const render = (vnode, container, namespace) => {
    let instance;
    if (vnode == null) {
      if (container._vnode) {
        unmount(container._vnode, null, null, true);
        instance = container._vnode.component;
      }
    } else {
      patch(
        container._vnode || null,
        vnode,
        container,
        null,
        null,
        null,
        namespace
      );
    }
    container._vnode = vnode;
    if (!isFlushing) {
      isFlushing = true;
      flushPreFlushCbs(instance);
      flushPostFlushCbs();
      isFlushing = false;
    }
  };
  const internals = {
    p: patch,
    um: unmount,
    m: move,
    r: remove2,
    mt: mountComponent,
    mc: mountChildren,
    pc: patchChildren,
    pbc: patchBlockChildren,
    n: getNextHostNode,
    o: options
  };
  let hydrate;
  return {
    render,
    hydrate,
    createApp: createAppAPI(render)
  };
}
function resolveChildrenNamespace({ type, props }, currentNamespace) {
  return currentNamespace === "svg" && type === "foreignObject" || currentNamespace === "mathml" && type === "annotation-xml" && props && props.encoding && props.encoding.includes("html") ? void 0 : currentNamespace;
}
function toggleRecurse({ effect: effect2, job }, allowed) {
  if (allowed) {
    effect2.flags |= 32;
    job.flags |= 4;
  } else {
    effect2.flags &= -33;
    job.flags &= -5;
  }
}
function needTransition(parentSuspense, transition) {
  return (!parentSuspense || parentSuspense && !parentSuspense.pendingBranch) && transition && !transition.persisted;
}
function traverseStaticChildren(n1, n2, shallow = false) {
  const ch1 = n1.children;
  const ch2 = n2.children;
  if (isArray$1(ch1) && isArray$1(ch2)) {
    for (let i = 0; i < ch1.length; i++) {
      const c1 = ch1[i];
      let c2 = ch2[i];
      if (c2.shapeFlag & 1 && !c2.dynamicChildren) {
        if (c2.patchFlag <= 0 || c2.patchFlag === 32) {
          c2 = ch2[i] = cloneIfMounted(ch2[i]);
          c2.el = c1.el;
        }
        if (!shallow && c2.patchFlag !== -2)
          traverseStaticChildren(c1, c2);
      }
      if (c2.type === Text) {
        if (c2.patchFlag === -1) {
          c2 = ch2[i] = cloneIfMounted(c2);
        }
        c2.el = c1.el;
      }
      if (c2.type === Comment && !c2.el) {
        c2.el = c1.el;
      }
    }
  }
}
function getSequence(arr) {
  const p2 = arr.slice();
  const result = [0];
  let i, j, u, v, c;
  const len = arr.length;
  for (i = 0; i < len; i++) {
    const arrI = arr[i];
    if (arrI !== 0) {
      j = result[result.length - 1];
      if (arr[j] < arrI) {
        p2[i] = j;
        result.push(i);
        continue;
      }
      u = 0;
      v = result.length - 1;
      while (u < v) {
        c = u + v >> 1;
        if (arr[result[c]] < arrI) {
          u = c + 1;
        } else {
          v = c;
        }
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p2[i] = result[u - 1];
        }
        result[u] = i;
      }
    }
  }
  u = result.length;
  v = result[u - 1];
  while (u-- > 0) {
    result[u] = v;
    v = p2[v];
  }
  return result;
}
function locateNonHydratedAsyncRoot(instance) {
  const subComponent = instance.subTree.component;
  if (subComponent) {
    if (subComponent.asyncDep && !subComponent.asyncResolved) {
      return subComponent;
    } else {
      return locateNonHydratedAsyncRoot(subComponent);
    }
  }
}
function invalidateMount(hooks) {
  if (hooks) {
    for (let i = 0; i < hooks.length; i++)
      hooks[i].flags |= 8;
  }
}
function resolveAsyncComponentPlaceholder(anchorVnode) {
  if (anchorVnode.placeholder) {
    return anchorVnode.placeholder;
  }
  const instance = anchorVnode.component;
  if (instance) {
    return resolveAsyncComponentPlaceholder(instance.subTree);
  }
  return null;
}
const isSuspense = (type) => type.__isSuspense;
function queueEffectWithSuspense(fn, suspense) {
  if (suspense && suspense.pendingBranch) {
    if (isArray$1(fn)) {
      suspense.effects.push(...fn);
    } else {
      suspense.effects.push(fn);
    }
  } else {
    queuePostFlushCb(fn);
  }
}
const Fragment = /* @__PURE__ */ Symbol.for("v-fgt");
const Text = /* @__PURE__ */ Symbol.for("v-txt");
const Comment = /* @__PURE__ */ Symbol.for("v-cmt");
const Static = /* @__PURE__ */ Symbol.for("v-stc");
const blockStack = [];
let currentBlock = null;
function openBlock(disableTracking = false) {
  blockStack.push(currentBlock = disableTracking ? null : []);
}
function closeBlock() {
  blockStack.pop();
  currentBlock = blockStack[blockStack.length - 1] || null;
}
let isBlockTreeEnabled = 1;
function setBlockTracking(value, inVOnce = false) {
  isBlockTreeEnabled += value;
  if (value < 0 && currentBlock && inVOnce) {
    currentBlock.hasOnce = true;
  }
}
function setupBlock(vnode) {
  vnode.dynamicChildren = isBlockTreeEnabled > 0 ? currentBlock || EMPTY_ARR : null;
  closeBlock();
  if (isBlockTreeEnabled > 0 && currentBlock) {
    currentBlock.push(vnode);
  }
  return vnode;
}
function createElementBlock(type, props, children, patchFlag, dynamicProps, shapeFlag) {
  return setupBlock(
    createBaseVNode(
      type,
      props,
      children,
      patchFlag,
      dynamicProps,
      shapeFlag,
      true
    )
  );
}
function createBlock(type, props, children, patchFlag, dynamicProps) {
  return setupBlock(
    createVNode(
      type,
      props,
      children,
      patchFlag,
      dynamicProps,
      true
    )
  );
}
function isVNode(value) {
  return value ? value.__v_isVNode === true : false;
}
function isSameVNodeType(n1, n2) {
  return n1.type === n2.type && n1.key === n2.key;
}
const normalizeKey = ({ key }) => key != null ? key : null;
const normalizeRef = ({
  ref: ref3,
  ref_key,
  ref_for
}) => {
  if (typeof ref3 === "number") {
    ref3 = "" + ref3;
  }
  return ref3 != null ? isString(ref3) || /* @__PURE__ */ isRef(ref3) || isFunction(ref3) ? { i: currentRenderingInstance, r: ref3, k: ref_key, f: !!ref_for } : ref3 : null;
};
function createBaseVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, shapeFlag = type === Fragment ? 0 : 1, isBlockNode = false, needFullChildrenNormalization = false) {
  const vnode = {
    __v_isVNode: true,
    __v_skip: true,
    type,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: currentScopeId,
    slotScopeIds: null,
    children,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetStart: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null,
    ctx: currentRenderingInstance
  };
  if (needFullChildrenNormalization) {
    normalizeChildren(vnode, children);
    if (shapeFlag & 128) {
      type.normalize(vnode);
    }
  } else if (children) {
    vnode.shapeFlag |= isString(children) ? 8 : 16;
  }
  if (isBlockTreeEnabled > 0 && // avoid a block node from tracking itself
  !isBlockNode && // has current parent block
  currentBlock && // presence of a patch flag indicates this node needs patching on updates.
  // component nodes also should always be patched, because even if the
  // component doesn't need to update, it needs to persist the instance on to
  // the next vnode so that it can be properly unmounted later.
  (vnode.patchFlag > 0 || shapeFlag & 6) && // the EVENTS flag is only for hydration and if it is the only flag, the
  // vnode should not be considered dynamic due to handler caching.
  vnode.patchFlag !== 32) {
    currentBlock.push(vnode);
  }
  return vnode;
}
const createVNode = _createVNode;
function _createVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, isBlockNode = false) {
  if (!type || type === NULL_DYNAMIC_COMPONENT) {
    type = Comment;
  }
  if (isVNode(type)) {
    const cloned = cloneVNode(
      type,
      props,
      true
      /* mergeRef: true */
    );
    if (children) {
      normalizeChildren(cloned, children);
    }
    if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock) {
      if (cloned.shapeFlag & 6) {
        currentBlock[currentBlock.indexOf(type)] = cloned;
      } else {
        currentBlock.push(cloned);
      }
    }
    cloned.patchFlag = -2;
    return cloned;
  }
  if (isClassComponent(type)) {
    type = type.__vccOpts;
  }
  if (props) {
    props = guardReactiveProps(props);
    let { class: klass, style } = props;
    if (klass && !isString(klass)) {
      props.class = normalizeClass(klass);
    }
    if (isObject(style)) {
      if (/* @__PURE__ */ isProxy(style) && !isArray$1(style)) {
        style = extend({}, style);
      }
      props.style = normalizeStyle(style);
    }
  }
  const shapeFlag = isString(type) ? 1 : isSuspense(type) ? 128 : isTeleport(type) ? 64 : isObject(type) ? 4 : isFunction(type) ? 2 : 0;
  return createBaseVNode(
    type,
    props,
    children,
    patchFlag,
    dynamicProps,
    shapeFlag,
    isBlockNode,
    true
  );
}
function guardReactiveProps(props) {
  if (!props) return null;
  return /* @__PURE__ */ isProxy(props) || isInternalObject(props) ? extend({}, props) : props;
}
function cloneVNode(vnode, extraProps, mergeRef = false, cloneTransition = false) {
  const { props, ref: ref3, patchFlag, children, transition } = vnode;
  const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props;
  const cloned = {
    __v_isVNode: true,
    __v_skip: true,
    type: vnode.type,
    props: mergedProps,
    key: mergedProps && normalizeKey(mergedProps),
    ref: extraProps && extraProps.ref ? (
      // #2078 in the case of <component :is="vnode" ref="extra"/>
      // if the vnode itself already has a ref, cloneVNode will need to merge
      // the refs so the single vnode can be set on multiple refs
      mergeRef && ref3 ? isArray$1(ref3) ? ref3.concat(normalizeRef(extraProps)) : [ref3, normalizeRef(extraProps)] : normalizeRef(extraProps)
    ) : ref3,
    scopeId: vnode.scopeId,
    slotScopeIds: vnode.slotScopeIds,
    children,
    target: vnode.target,
    targetStart: vnode.targetStart,
    targetAnchor: vnode.targetAnchor,
    staticCount: vnode.staticCount,
    shapeFlag: vnode.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: preserve flag for fragments since they use the flag for children
    // fast paths only.
    patchFlag: extraProps && vnode.type !== Fragment ? patchFlag === -1 ? 16 : patchFlag | 16 : patchFlag,
    dynamicProps: vnode.dynamicProps,
    dynamicChildren: vnode.dynamicChildren,
    appContext: vnode.appContext,
    dirs: vnode.dirs,
    transition,
    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    component: vnode.component,
    suspense: vnode.suspense,
    ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
    ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
    placeholder: vnode.placeholder,
    el: vnode.el,
    anchor: vnode.anchor,
    ctx: vnode.ctx,
    ce: vnode.ce
  };
  if (transition && cloneTransition) {
    setTransitionHooks(
      cloned,
      transition.clone(cloned)
    );
  }
  return cloned;
}
function createTextVNode(text = " ", flag = 0) {
  return createVNode(Text, null, text, flag);
}
function createStaticVNode(content, numberOfNodes) {
  const vnode = createVNode(Static, null, content);
  vnode.staticCount = numberOfNodes;
  return vnode;
}
function createCommentVNode(text = "", asBlock = false) {
  return asBlock ? (openBlock(), createBlock(Comment, null, text)) : createVNode(Comment, null, text);
}
function normalizeVNode(child) {
  if (child == null || typeof child === "boolean") {
    return createVNode(Comment);
  } else if (isArray$1(child)) {
    return createVNode(
      Fragment,
      null,
      // #3666, avoid reference pollution when reusing vnode
      child.slice()
    );
  } else if (isVNode(child)) {
    return cloneIfMounted(child);
  } else {
    return createVNode(Text, null, String(child));
  }
}
function cloneIfMounted(child) {
  return child.el === null && child.patchFlag !== -1 || child.memo ? child : cloneVNode(child);
}
function normalizeChildren(vnode, children) {
  let type = 0;
  const { shapeFlag } = vnode;
  if (children == null) {
    children = null;
  } else if (isArray$1(children)) {
    type = 16;
  } else if (typeof children === "object") {
    if (shapeFlag & (1 | 64)) {
      const slot = children.default;
      if (slot) {
        slot._c && (slot._d = false);
        normalizeChildren(vnode, slot());
        slot._c && (slot._d = true);
      }
      return;
    } else {
      type = 32;
      const slotFlag = children._;
      if (!slotFlag && !isInternalObject(children)) {
        children._ctx = currentRenderingInstance;
      } else if (slotFlag === 3 && currentRenderingInstance) {
        if (currentRenderingInstance.slots._ === 1) {
          children._ = 1;
        } else {
          children._ = 2;
          vnode.patchFlag |= 1024;
        }
      }
    }
  } else if (isFunction(children)) {
    children = { default: children, _ctx: currentRenderingInstance };
    type = 32;
  } else {
    children = String(children);
    if (shapeFlag & 64) {
      type = 16;
      children = [createTextVNode(children)];
    } else {
      type = 8;
    }
  }
  vnode.children = children;
  vnode.shapeFlag |= type;
}
function mergeProps(...args) {
  const ret = {};
  for (let i = 0; i < args.length; i++) {
    const toMerge = args[i];
    for (const key in toMerge) {
      if (key === "class") {
        if (ret.class !== toMerge.class) {
          ret.class = normalizeClass([ret.class, toMerge.class]);
        }
      } else if (key === "style") {
        ret.style = normalizeStyle([ret.style, toMerge.style]);
      } else if (isOn(key)) {
        const existing = ret[key];
        const incoming = toMerge[key];
        if (incoming && existing !== incoming && !(isArray$1(existing) && existing.includes(incoming))) {
          ret[key] = existing ? [].concat(existing, incoming) : incoming;
        } else if (incoming == null && existing == null && // mergeProps({ 'onUpdate:modelValue': undefined }) should not retain
        // the model listener.
        !isModelListener(key)) {
          ret[key] = incoming;
        }
      } else if (key !== "") {
        ret[key] = toMerge[key];
      }
    }
  }
  return ret;
}
function invokeVNodeHook(hook, instance, vnode, prevVNode = null) {
  callWithAsyncErrorHandling(hook, instance, 7, [
    vnode,
    prevVNode
  ]);
}
const emptyAppContext = createAppContext();
let uid = 0;
function createComponentInstance(vnode, parent, suspense) {
  const type = vnode.type;
  const appContext = (parent ? parent.appContext : vnode.appContext) || emptyAppContext;
  const instance = {
    uid: uid++,
    vnode,
    type,
    parent,
    appContext,
    root: null,
    // to be immediately set
    next: null,
    subTree: null,
    // will be set synchronously right after creation
    effect: null,
    update: null,
    // will be set synchronously right after creation
    job: null,
    scope: new EffectScope(
      true
      /* detached */
    ),
    render: null,
    proxy: null,
    exposed: null,
    exposeProxy: null,
    withProxy: null,
    provides: parent ? parent.provides : Object.create(appContext.provides),
    ids: parent ? parent.ids : ["", 0, 0],
    accessCache: null,
    renderCache: [],
    // local resolved assets
    components: null,
    directives: null,
    // resolved props and emits options
    propsOptions: normalizePropsOptions(type, appContext),
    emitsOptions: normalizeEmitsOptions(type, appContext),
    // emit
    emit: null,
    // to be set immediately
    emitted: null,
    // props default value
    propsDefaults: EMPTY_OBJ,
    // inheritAttrs
    inheritAttrs: type.inheritAttrs,
    // state
    ctx: EMPTY_OBJ,
    data: EMPTY_OBJ,
    props: EMPTY_OBJ,
    attrs: EMPTY_OBJ,
    slots: EMPTY_OBJ,
    refs: EMPTY_OBJ,
    setupState: EMPTY_OBJ,
    setupContext: null,
    // suspense related
    suspense,
    suspenseId: suspense ? suspense.pendingId : 0,
    asyncDep: null,
    asyncResolved: false,
    // lifecycle hooks
    // not using enums here because it results in computed properties
    isMounted: false,
    isUnmounted: false,
    isDeactivated: false,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
    rtg: null,
    rtc: null,
    ec: null,
    sp: null
  };
  {
    instance.ctx = { _: instance };
  }
  instance.root = parent ? parent.root : instance;
  instance.emit = emit.bind(null, instance);
  if (vnode.ce) {
    vnode.ce(instance);
  }
  return instance;
}
let currentInstance = null;
const getCurrentInstance = () => currentInstance || currentRenderingInstance;
let internalSetCurrentInstance;
let setInSSRSetupState;
{
  const g = getGlobalThis();
  const registerGlobalSetter = (key, setter) => {
    let setters;
    if (!(setters = g[key])) setters = g[key] = [];
    setters.push(setter);
    return (v) => {
      if (setters.length > 1) setters.forEach((set) => set(v));
      else setters[0](v);
    };
  };
  internalSetCurrentInstance = registerGlobalSetter(
    `__VUE_INSTANCE_SETTERS__`,
    (v) => currentInstance = v
  );
  setInSSRSetupState = registerGlobalSetter(
    `__VUE_SSR_SETTERS__`,
    (v) => isInSSRComponentSetup = v
  );
}
const setCurrentInstance = (instance) => {
  const prev = currentInstance;
  internalSetCurrentInstance(instance);
  instance.scope.on();
  return () => {
    instance.scope.off();
    internalSetCurrentInstance(prev);
  };
};
const unsetCurrentInstance = () => {
  currentInstance && currentInstance.scope.off();
  internalSetCurrentInstance(null);
};
function isStatefulComponent(instance) {
  return instance.vnode.shapeFlag & 4;
}
let isInSSRComponentSetup = false;
function setupComponent(instance, isSSR = false, optimized = false) {
  isSSR && setInSSRSetupState(isSSR);
  const { props, children } = instance.vnode;
  const isStateful = isStatefulComponent(instance);
  initProps(instance, props, isStateful, isSSR);
  initSlots(instance, children, optimized || isSSR);
  const setupResult = isStateful ? setupStatefulComponent(instance, isSSR) : void 0;
  isSSR && setInSSRSetupState(false);
  return setupResult;
}
function setupStatefulComponent(instance, isSSR) {
  const Component = instance.type;
  instance.accessCache = /* @__PURE__ */ Object.create(null);
  instance.proxy = new Proxy(instance.ctx, PublicInstanceProxyHandlers);
  const { setup } = Component;
  if (setup) {
    pauseTracking();
    const setupContext = instance.setupContext = setup.length > 1 ? createSetupContext(instance) : null;
    const reset = setCurrentInstance(instance);
    const setupResult = callWithErrorHandling(
      setup,
      instance,
      0,
      [
        instance.props,
        setupContext
      ]
    );
    const isAsyncSetup = isPromise(setupResult);
    resetTracking();
    reset();
    if ((isAsyncSetup || instance.sp) && !isAsyncWrapper(instance)) {
      markAsyncBoundary(instance);
    }
    if (isAsyncSetup) {
      setupResult.then(unsetCurrentInstance, unsetCurrentInstance);
      if (isSSR) {
        return setupResult.then((resolvedResult) => {
          handleSetupResult(instance, resolvedResult);
        }).catch((e) => {
          handleError(e, instance, 0);
        });
      } else {
        instance.asyncDep = setupResult;
      }
    } else {
      handleSetupResult(instance, setupResult);
    }
  } else {
    finishComponentSetup(instance);
  }
}
function handleSetupResult(instance, setupResult, isSSR) {
  if (isFunction(setupResult)) {
    if (instance.type.__ssrInlineRender) {
      instance.ssrRender = setupResult;
    } else {
      instance.render = setupResult;
    }
  } else if (isObject(setupResult)) {
    instance.setupState = proxyRefs(setupResult);
  } else ;
  finishComponentSetup(instance);
}
function finishComponentSetup(instance, isSSR, skipOptions) {
  const Component = instance.type;
  if (!instance.render) {
    instance.render = Component.render || NOOP;
  }
  {
    const reset = setCurrentInstance(instance);
    pauseTracking();
    try {
      applyOptions(instance);
    } finally {
      resetTracking();
      reset();
    }
  }
}
const attrsProxyHandlers = {
  get(target, key) {
    track(target, "get", "");
    return target[key];
  }
};
function createSetupContext(instance) {
  const expose = (exposed) => {
    instance.exposed = exposed || {};
  };
  {
    return {
      attrs: new Proxy(instance.attrs, attrsProxyHandlers),
      slots: instance.slots,
      emit: instance.emit,
      expose
    };
  }
}
function getComponentPublicInstance(instance) {
  if (instance.exposed) {
    return instance.exposeProxy || (instance.exposeProxy = new Proxy(proxyRefs(markRaw(instance.exposed)), {
      get(target, key) {
        if (key in target) {
          return target[key];
        } else if (key in publicPropertiesMap) {
          return publicPropertiesMap[key](instance);
        }
      },
      has(target, key) {
        return key in target || key in publicPropertiesMap;
      }
    }));
  } else {
    return instance.proxy;
  }
}
const classifyRE = /(?:^|[-_])\w/g;
const classify = (str) => str.replace(classifyRE, (c) => c.toUpperCase()).replace(/[-_]/g, "");
function getComponentName(Component, includeInferred = true) {
  return isFunction(Component) ? Component.displayName || Component.name : Component.name || includeInferred && Component.__name;
}
function formatComponentName(instance, Component, isRoot = false) {
  let name = getComponentName(Component);
  if (!name && Component.__file) {
    const match = Component.__file.match(/([^/\\]+)\.\w+$/);
    if (match) {
      name = match[1];
    }
  }
  if (!name && instance) {
    const inferFromRegistry = (registry) => {
      for (const key in registry) {
        if (registry[key] === Component) {
          return key;
        }
      }
    };
    name = inferFromRegistry(instance.components) || instance.parent && inferFromRegistry(
      instance.parent.type.components
    ) || inferFromRegistry(instance.appContext.components);
  }
  return name ? classify(name) : isRoot ? `App` : `Anonymous`;
}
function isClassComponent(value) {
  return isFunction(value) && "__vccOpts" in value;
}
const computed = (getterOrOptions, debugOptions) => {
  const c = /* @__PURE__ */ computed$1(getterOrOptions, debugOptions, isInSSRComponentSetup);
  return c;
};
function h(type, propsOrChildren, children) {
  try {
    setBlockTracking(-1);
    const l = arguments.length;
    if (l === 2) {
      if (isObject(propsOrChildren) && !isArray$1(propsOrChildren)) {
        if (isVNode(propsOrChildren)) {
          return createVNode(type, null, [propsOrChildren]);
        }
        return createVNode(type, propsOrChildren);
      } else {
        return createVNode(type, null, propsOrChildren);
      }
    } else {
      if (l > 3) {
        children = Array.prototype.slice.call(arguments, 2);
      } else if (l === 3 && isVNode(children)) {
        children = [children];
      }
      return createVNode(type, propsOrChildren, children);
    }
  } finally {
    setBlockTracking(1);
  }
}
const version = "3.5.32";
/**
* @vue/runtime-dom v3.5.32
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let policy = void 0;
const tt = typeof window !== "undefined" && window.trustedTypes;
if (tt) {
  try {
    policy = /* @__PURE__ */ tt.createPolicy("vue", {
      createHTML: (val) => val
    });
  } catch (e) {
  }
}
const unsafeToTrustedHTML = policy ? (val) => policy.createHTML(val) : (val) => val;
const svgNS = "http://www.w3.org/2000/svg";
const mathmlNS = "http://www.w3.org/1998/Math/MathML";
const doc = typeof document !== "undefined" ? document : null;
const templateContainer = doc && /* @__PURE__ */ doc.createElement("template");
const nodeOps = {
  insert: (child, parent, anchor) => {
    parent.insertBefore(child, anchor || null);
  },
  remove: (child) => {
    const parent = child.parentNode;
    if (parent) {
      parent.removeChild(child);
    }
  },
  createElement: (tag, namespace, is, props) => {
    const el = namespace === "svg" ? doc.createElementNS(svgNS, tag) : namespace === "mathml" ? doc.createElementNS(mathmlNS, tag) : is ? doc.createElement(tag, { is }) : doc.createElement(tag);
    if (tag === "select" && props && props.multiple != null) {
      el.setAttribute("multiple", props.multiple);
    }
    return el;
  },
  createText: (text) => doc.createTextNode(text),
  createComment: (text) => doc.createComment(text),
  setText: (node, text) => {
    node.nodeValue = text;
  },
  setElementText: (el, text) => {
    el.textContent = text;
  },
  parentNode: (node) => node.parentNode,
  nextSibling: (node) => node.nextSibling,
  querySelector: (selector) => doc.querySelector(selector),
  setScopeId(el, id) {
    el.setAttribute(id, "");
  },
  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  insertStaticContent(content, parent, anchor, namespace, start, end) {
    const before = anchor ? anchor.previousSibling : parent.lastChild;
    if (start && (start === end || start.nextSibling)) {
      while (true) {
        parent.insertBefore(start.cloneNode(true), anchor);
        if (start === end || !(start = start.nextSibling)) break;
      }
    } else {
      templateContainer.innerHTML = unsafeToTrustedHTML(
        namespace === "svg" ? `<svg>${content}</svg>` : namespace === "mathml" ? `<math>${content}</math>` : content
      );
      const template = templateContainer.content;
      if (namespace === "svg" || namespace === "mathml") {
        const wrapper = template.firstChild;
        while (wrapper.firstChild) {
          template.appendChild(wrapper.firstChild);
        }
        template.removeChild(wrapper);
      }
      parent.insertBefore(template, anchor);
    }
    return [
      // first
      before ? before.nextSibling : parent.firstChild,
      // last
      anchor ? anchor.previousSibling : parent.lastChild
    ];
  }
};
const TRANSITION = "transition";
const ANIMATION = "animation";
const vtcKey = /* @__PURE__ */ Symbol("_vtc");
const DOMTransitionPropsValidators = {
  name: String,
  type: String,
  css: {
    type: Boolean,
    default: true
  },
  duration: [String, Number, Object],
  enterFromClass: String,
  enterActiveClass: String,
  enterToClass: String,
  appearFromClass: String,
  appearActiveClass: String,
  appearToClass: String,
  leaveFromClass: String,
  leaveActiveClass: String,
  leaveToClass: String
};
const TransitionPropsValidators = /* @__PURE__ */ extend(
  {},
  BaseTransitionPropsValidators,
  DOMTransitionPropsValidators
);
const decorate$1 = (t) => {
  t.displayName = "Transition";
  t.props = TransitionPropsValidators;
  return t;
};
const Transition = /* @__PURE__ */ decorate$1(
  (props, { slots }) => h(BaseTransition, resolveTransitionProps(props), slots)
);
const callHook = (hook, args = []) => {
  if (isArray$1(hook)) {
    hook.forEach((h2) => h2(...args));
  } else if (hook) {
    hook(...args);
  }
};
const hasExplicitCallback = (hook) => {
  return hook ? isArray$1(hook) ? hook.some((h2) => h2.length > 1) : hook.length > 1 : false;
};
function resolveTransitionProps(rawProps) {
  const baseProps = {};
  for (const key in rawProps) {
    if (!(key in DOMTransitionPropsValidators)) {
      baseProps[key] = rawProps[key];
    }
  }
  if (rawProps.css === false) {
    return baseProps;
  }
  const {
    name = "v",
    type,
    duration,
    enterFromClass = `${name}-enter-from`,
    enterActiveClass = `${name}-enter-active`,
    enterToClass = `${name}-enter-to`,
    appearFromClass = enterFromClass,
    appearActiveClass = enterActiveClass,
    appearToClass = enterToClass,
    leaveFromClass = `${name}-leave-from`,
    leaveActiveClass = `${name}-leave-active`,
    leaveToClass = `${name}-leave-to`
  } = rawProps;
  const durations = normalizeDuration(duration);
  const enterDuration = durations && durations[0];
  const leaveDuration = durations && durations[1];
  const {
    onBeforeEnter,
    onEnter,
    onEnterCancelled,
    onLeave,
    onLeaveCancelled,
    onBeforeAppear = onBeforeEnter,
    onAppear = onEnter,
    onAppearCancelled = onEnterCancelled
  } = baseProps;
  const finishEnter = (el, isAppear, done, isCancelled) => {
    el._enterCancelled = isCancelled;
    removeTransitionClass(el, isAppear ? appearToClass : enterToClass);
    removeTransitionClass(el, isAppear ? appearActiveClass : enterActiveClass);
    done && done();
  };
  const finishLeave = (el, done) => {
    el._isLeaving = false;
    removeTransitionClass(el, leaveFromClass);
    removeTransitionClass(el, leaveToClass);
    removeTransitionClass(el, leaveActiveClass);
    done && done();
  };
  const makeEnterHook = (isAppear) => {
    return (el, done) => {
      const hook = isAppear ? onAppear : onEnter;
      const resolve2 = () => finishEnter(el, isAppear, done);
      callHook(hook, [el, resolve2]);
      nextFrame(() => {
        removeTransitionClass(el, isAppear ? appearFromClass : enterFromClass);
        addTransitionClass(el, isAppear ? appearToClass : enterToClass);
        if (!hasExplicitCallback(hook)) {
          whenTransitionEnds(el, type, enterDuration, resolve2);
        }
      });
    };
  };
  return extend(baseProps, {
    onBeforeEnter(el) {
      callHook(onBeforeEnter, [el]);
      addTransitionClass(el, enterFromClass);
      addTransitionClass(el, enterActiveClass);
    },
    onBeforeAppear(el) {
      callHook(onBeforeAppear, [el]);
      addTransitionClass(el, appearFromClass);
      addTransitionClass(el, appearActiveClass);
    },
    onEnter: makeEnterHook(false),
    onAppear: makeEnterHook(true),
    onLeave(el, done) {
      el._isLeaving = true;
      const resolve2 = () => finishLeave(el, done);
      addTransitionClass(el, leaveFromClass);
      if (!el._enterCancelled) {
        forceReflow(el);
        addTransitionClass(el, leaveActiveClass);
      } else {
        addTransitionClass(el, leaveActiveClass);
        forceReflow(el);
      }
      nextFrame(() => {
        if (!el._isLeaving) {
          return;
        }
        removeTransitionClass(el, leaveFromClass);
        addTransitionClass(el, leaveToClass);
        if (!hasExplicitCallback(onLeave)) {
          whenTransitionEnds(el, type, leaveDuration, resolve2);
        }
      });
      callHook(onLeave, [el, resolve2]);
    },
    onEnterCancelled(el) {
      finishEnter(el, false, void 0, true);
      callHook(onEnterCancelled, [el]);
    },
    onAppearCancelled(el) {
      finishEnter(el, true, void 0, true);
      callHook(onAppearCancelled, [el]);
    },
    onLeaveCancelled(el) {
      finishLeave(el);
      callHook(onLeaveCancelled, [el]);
    }
  });
}
function normalizeDuration(duration) {
  if (duration == null) {
    return null;
  } else if (isObject(duration)) {
    return [NumberOf(duration.enter), NumberOf(duration.leave)];
  } else {
    const n = NumberOf(duration);
    return [n, n];
  }
}
function NumberOf(val) {
  const res = toNumber$1(val);
  return res;
}
function addTransitionClass(el, cls) {
  cls.split(/\s+/).forEach((c) => c && el.classList.add(c));
  (el[vtcKey] || (el[vtcKey] = /* @__PURE__ */ new Set())).add(cls);
}
function removeTransitionClass(el, cls) {
  cls.split(/\s+/).forEach((c) => c && el.classList.remove(c));
  const _vtc = el[vtcKey];
  if (_vtc) {
    _vtc.delete(cls);
    if (!_vtc.size) {
      el[vtcKey] = void 0;
    }
  }
}
function nextFrame(cb) {
  requestAnimationFrame(() => {
    requestAnimationFrame(cb);
  });
}
let endId = 0;
function whenTransitionEnds(el, expectedType, explicitTimeout, resolve2) {
  const id = el._endId = ++endId;
  const resolveIfNotStale = () => {
    if (id === el._endId) {
      resolve2();
    }
  };
  if (explicitTimeout != null) {
    return setTimeout(resolveIfNotStale, explicitTimeout);
  }
  const { type, timeout, propCount } = getTransitionInfo(el, expectedType);
  if (!type) {
    return resolve2();
  }
  const endEvent = type + "end";
  let ended = 0;
  const end = () => {
    el.removeEventListener(endEvent, onEnd);
    resolveIfNotStale();
  };
  const onEnd = (e) => {
    if (e.target === el && ++ended >= propCount) {
      end();
    }
  };
  setTimeout(() => {
    if (ended < propCount) {
      end();
    }
  }, timeout + 1);
  el.addEventListener(endEvent, onEnd);
}
function getTransitionInfo(el, expectedType) {
  const styles = window.getComputedStyle(el);
  const getStyleProperties = (key) => (styles[key] || "").split(", ");
  const transitionDelays = getStyleProperties(`${TRANSITION}Delay`);
  const transitionDurations = getStyleProperties(`${TRANSITION}Duration`);
  const transitionTimeout = getTimeout(transitionDelays, transitionDurations);
  const animationDelays = getStyleProperties(`${ANIMATION}Delay`);
  const animationDurations = getStyleProperties(`${ANIMATION}Duration`);
  const animationTimeout = getTimeout(animationDelays, animationDurations);
  let type = null;
  let timeout = 0;
  let propCount = 0;
  if (expectedType === TRANSITION) {
    if (transitionTimeout > 0) {
      type = TRANSITION;
      timeout = transitionTimeout;
      propCount = transitionDurations.length;
    }
  } else if (expectedType === ANIMATION) {
    if (animationTimeout > 0) {
      type = ANIMATION;
      timeout = animationTimeout;
      propCount = animationDurations.length;
    }
  } else {
    timeout = Math.max(transitionTimeout, animationTimeout);
    type = timeout > 0 ? transitionTimeout > animationTimeout ? TRANSITION : ANIMATION : null;
    propCount = type ? type === TRANSITION ? transitionDurations.length : animationDurations.length : 0;
  }
  const hasTransform = type === TRANSITION && /\b(?:transform|all)(?:,|$)/.test(
    getStyleProperties(`${TRANSITION}Property`).toString()
  );
  return {
    type,
    timeout,
    propCount,
    hasTransform
  };
}
function getTimeout(delays, durations) {
  while (delays.length < durations.length) {
    delays = delays.concat(delays);
  }
  return Math.max(...durations.map((d, i) => toMs(d) + toMs(delays[i])));
}
function toMs(s) {
  if (s === "auto") return 0;
  return Number(s.slice(0, -1).replace(",", ".")) * 1e3;
}
function forceReflow(el) {
  const targetDocument = el ? el.ownerDocument : document;
  return targetDocument.body.offsetHeight;
}
function patchClass(el, value, isSVG) {
  const transitionClasses = el[vtcKey];
  if (transitionClasses) {
    value = (value ? [value, ...transitionClasses] : [...transitionClasses]).join(" ");
  }
  if (value == null) {
    el.removeAttribute("class");
  } else if (isSVG) {
    el.setAttribute("class", value);
  } else {
    el.className = value;
  }
}
const vShowOriginalDisplay = /* @__PURE__ */ Symbol("_vod");
const vShowHidden = /* @__PURE__ */ Symbol("_vsh");
const vShow = {
  // used for prop mismatch check during hydration
  name: "show",
  beforeMount(el, { value }, { transition }) {
    el[vShowOriginalDisplay] = el.style.display === "none" ? "" : el.style.display;
    if (transition && value) {
      transition.beforeEnter(el);
    } else {
      setDisplay(el, value);
    }
  },
  mounted(el, { value }, { transition }) {
    if (transition && value) {
      transition.enter(el);
    }
  },
  updated(el, { value, oldValue }, { transition }) {
    if (!value === !oldValue) return;
    if (transition) {
      if (value) {
        transition.beforeEnter(el);
        setDisplay(el, true);
        transition.enter(el);
      } else {
        transition.leave(el, () => {
          setDisplay(el, false);
        });
      }
    } else {
      setDisplay(el, value);
    }
  },
  beforeUnmount(el, { value }) {
    setDisplay(el, value);
  }
};
function setDisplay(el, value) {
  el.style.display = value ? el[vShowOriginalDisplay] : "none";
  el[vShowHidden] = !value;
}
const CSS_VAR_TEXT = /* @__PURE__ */ Symbol("");
const displayRE = /(?:^|;)\s*display\s*:/;
function patchStyle(el, prev, next) {
  const style = el.style;
  const isCssString = isString(next);
  let hasControlledDisplay = false;
  if (next && !isCssString) {
    if (prev) {
      if (!isString(prev)) {
        for (const key in prev) {
          if (next[key] == null) {
            setStyle(style, key, "");
          }
        }
      } else {
        for (const prevStyle of prev.split(";")) {
          const key = prevStyle.slice(0, prevStyle.indexOf(":")).trim();
          if (next[key] == null) {
            setStyle(style, key, "");
          }
        }
      }
    }
    for (const key in next) {
      if (key === "display") {
        hasControlledDisplay = true;
      }
      setStyle(style, key, next[key]);
    }
  } else {
    if (isCssString) {
      if (prev !== next) {
        const cssVarText = style[CSS_VAR_TEXT];
        if (cssVarText) {
          next += ";" + cssVarText;
        }
        style.cssText = next;
        hasControlledDisplay = displayRE.test(next);
      }
    } else if (prev) {
      el.removeAttribute("style");
    }
  }
  if (vShowOriginalDisplay in el) {
    el[vShowOriginalDisplay] = hasControlledDisplay ? style.display : "";
    if (el[vShowHidden]) {
      style.display = "none";
    }
  }
}
const importantRE = /\s*!important$/;
function setStyle(style, name, val) {
  if (isArray$1(val)) {
    val.forEach((v) => setStyle(style, name, v));
  } else {
    if (val == null) val = "";
    if (name.startsWith("--")) {
      style.setProperty(name, val);
    } else {
      const prefixed = autoPrefix(style, name);
      if (importantRE.test(val)) {
        style.setProperty(
          hyphenate(prefixed),
          val.replace(importantRE, ""),
          "important"
        );
      } else {
        style[prefixed] = val;
      }
    }
  }
}
const prefixes = ["Webkit", "Moz", "ms"];
const prefixCache = {};
function autoPrefix(style, rawName) {
  const cached = prefixCache[rawName];
  if (cached) {
    return cached;
  }
  let name = camelize(rawName);
  if (name !== "filter" && name in style) {
    return prefixCache[rawName] = name;
  }
  name = capitalize(name);
  for (let i = 0; i < prefixes.length; i++) {
    const prefixed = prefixes[i] + name;
    if (prefixed in style) {
      return prefixCache[rawName] = prefixed;
    }
  }
  return rawName;
}
const xlinkNS = "http://www.w3.org/1999/xlink";
function patchAttr(el, key, value, isSVG, instance, isBoolean = isSpecialBooleanAttr(key)) {
  if (isSVG && key.startsWith("xlink:")) {
    if (value == null) {
      el.removeAttributeNS(xlinkNS, key.slice(6, key.length));
    } else {
      el.setAttributeNS(xlinkNS, key, value);
    }
  } else {
    if (value == null || isBoolean && !includeBooleanAttr(value)) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(
        key,
        isBoolean ? "" : isSymbol(value) ? String(value) : value
      );
    }
  }
}
function patchDOMProp(el, key, value, parentComponent, attrName) {
  if (key === "innerHTML" || key === "textContent") {
    if (value != null) {
      el[key] = key === "innerHTML" ? unsafeToTrustedHTML(value) : value;
    }
    return;
  }
  const tag = el.tagName;
  if (key === "value" && tag !== "PROGRESS" && // custom elements may use _value internally
  !tag.includes("-")) {
    const oldValue = tag === "OPTION" ? el.getAttribute("value") || "" : el.value;
    const newValue = value == null ? (
      // #11647: value should be set as empty string for null and undefined,
      // but <input type="checkbox"> should be set as 'on'.
      el.type === "checkbox" ? "on" : ""
    ) : String(value);
    if (oldValue !== newValue || !("_value" in el)) {
      el.value = newValue;
    }
    if (value == null) {
      el.removeAttribute(key);
    }
    el._value = value;
    return;
  }
  let needRemove = false;
  if (value === "" || value == null) {
    const type = typeof el[key];
    if (type === "boolean") {
      value = includeBooleanAttr(value);
    } else if (value == null && type === "string") {
      value = "";
      needRemove = true;
    } else if (type === "number") {
      value = 0;
      needRemove = true;
    }
  }
  try {
    el[key] = value;
  } catch (e) {
  }
  needRemove && el.removeAttribute(attrName || key);
}
function addEventListener(el, event, handler, options) {
  el.addEventListener(event, handler, options);
}
function removeEventListener(el, event, handler, options) {
  el.removeEventListener(event, handler, options);
}
const veiKey = /* @__PURE__ */ Symbol("_vei");
function patchEvent(el, rawName, prevValue, nextValue, instance = null) {
  const invokers = el[veiKey] || (el[veiKey] = {});
  const existingInvoker = invokers[rawName];
  if (nextValue && existingInvoker) {
    existingInvoker.value = nextValue;
  } else {
    const [name, options] = parseName(rawName);
    if (nextValue) {
      const invoker = invokers[rawName] = createInvoker(
        nextValue,
        instance
      );
      addEventListener(el, name, invoker, options);
    } else if (existingInvoker) {
      removeEventListener(el, name, existingInvoker, options);
      invokers[rawName] = void 0;
    }
  }
}
const optionsModifierRE = /(?:Once|Passive|Capture)$/;
function parseName(name) {
  let options;
  if (optionsModifierRE.test(name)) {
    options = {};
    let m;
    while (m = name.match(optionsModifierRE)) {
      name = name.slice(0, name.length - m[0].length);
      options[m[0].toLowerCase()] = true;
    }
  }
  const event = name[2] === ":" ? name.slice(3) : hyphenate(name.slice(2));
  return [event, options];
}
let cachedNow = 0;
const p = /* @__PURE__ */ Promise.resolve();
const getNow = () => cachedNow || (p.then(() => cachedNow = 0), cachedNow = Date.now());
function createInvoker(initialValue, instance) {
  const invoker = (e) => {
    if (!e._vts) {
      e._vts = Date.now();
    } else if (e._vts <= invoker.attached) {
      return;
    }
    callWithAsyncErrorHandling(
      patchStopImmediatePropagation(e, invoker.value),
      instance,
      5,
      [e]
    );
  };
  invoker.value = initialValue;
  invoker.attached = getNow();
  return invoker;
}
function patchStopImmediatePropagation(e, value) {
  if (isArray$1(value)) {
    const originalStop = e.stopImmediatePropagation;
    e.stopImmediatePropagation = () => {
      originalStop.call(e);
      e._stopped = true;
    };
    return value.map(
      (fn) => (e2) => !e2._stopped && fn && fn(e2)
    );
  } else {
    return value;
  }
}
const isNativeOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && // lowercase letter
key.charCodeAt(2) > 96 && key.charCodeAt(2) < 123;
const patchProp = (el, key, prevValue, nextValue, namespace, parentComponent) => {
  const isSVG = namespace === "svg";
  if (key === "class") {
    patchClass(el, nextValue, isSVG);
  } else if (key === "style") {
    patchStyle(el, prevValue, nextValue);
  } else if (isOn(key)) {
    if (!isModelListener(key)) {
      patchEvent(el, key, prevValue, nextValue, parentComponent);
    }
  } else if (key[0] === "." ? (key = key.slice(1), true) : key[0] === "^" ? (key = key.slice(1), false) : shouldSetAsProp(el, key, nextValue, isSVG)) {
    patchDOMProp(el, key, nextValue);
    if (!el.tagName.includes("-") && (key === "value" || key === "checked" || key === "selected")) {
      patchAttr(el, key, nextValue, isSVG, parentComponent, key !== "value");
    }
  } else if (
    // #11081 force set props for possible async custom element
    el._isVueCE && // #12408 check if it's declared prop or it's async custom element
    (shouldSetAsPropForVueCE(el, key) || // @ts-expect-error _def is private
    el._def.__asyncLoader && (/[A-Z]/.test(key) || !isString(nextValue)))
  ) {
    patchDOMProp(el, camelize(key), nextValue, parentComponent, key);
  } else {
    if (key === "true-value") {
      el._trueValue = nextValue;
    } else if (key === "false-value") {
      el._falseValue = nextValue;
    }
    patchAttr(el, key, nextValue, isSVG);
  }
};
function shouldSetAsProp(el, key, value, isSVG) {
  if (isSVG) {
    if (key === "innerHTML" || key === "textContent") {
      return true;
    }
    if (key in el && isNativeOn(key) && isFunction(value)) {
      return true;
    }
    return false;
  }
  if (key === "spellcheck" || key === "draggable" || key === "translate" || key === "autocorrect") {
    return false;
  }
  if (key === "sandbox" && el.tagName === "IFRAME") {
    return false;
  }
  if (key === "form") {
    return false;
  }
  if (key === "list" && el.tagName === "INPUT") {
    return false;
  }
  if (key === "type" && el.tagName === "TEXTAREA") {
    return false;
  }
  if (key === "width" || key === "height") {
    const tag = el.tagName;
    if (tag === "IMG" || tag === "VIDEO" || tag === "CANVAS" || tag === "SOURCE") {
      return false;
    }
  }
  if (isNativeOn(key) && isString(value)) {
    return false;
  }
  return key in el;
}
function shouldSetAsPropForVueCE(el, key) {
  const props = (
    // @ts-expect-error _def is private
    el._def.props
  );
  if (!props) {
    return false;
  }
  const camelKey = camelize(key);
  return Array.isArray(props) ? props.some((prop) => camelize(prop) === camelKey) : Object.keys(props).some((prop) => camelize(prop) === camelKey);
}
const positionMap = /* @__PURE__ */ new WeakMap();
const newPositionMap = /* @__PURE__ */ new WeakMap();
const moveCbKey = /* @__PURE__ */ Symbol("_moveCb");
const enterCbKey = /* @__PURE__ */ Symbol("_enterCb");
const decorate = (t) => {
  delete t.props.mode;
  return t;
};
const TransitionGroupImpl = /* @__PURE__ */ decorate({
  name: "TransitionGroup",
  props: /* @__PURE__ */ extend({}, TransitionPropsValidators, {
    tag: String,
    moveClass: String
  }),
  setup(props, { slots }) {
    const instance = getCurrentInstance();
    const state = useTransitionState();
    let prevChildren;
    let children;
    onUpdated(() => {
      if (!prevChildren.length) {
        return;
      }
      const moveClass = props.moveClass || `${props.name || "v"}-move`;
      if (!hasCSSTransform(
        prevChildren[0].el,
        instance.vnode.el,
        moveClass
      )) {
        prevChildren = [];
        return;
      }
      prevChildren.forEach(callPendingCbs);
      prevChildren.forEach(recordPosition);
      const movedChildren = prevChildren.filter(applyTranslation);
      forceReflow(instance.vnode.el);
      movedChildren.forEach((c) => {
        const el = c.el;
        const style = el.style;
        addTransitionClass(el, moveClass);
        style.transform = style.webkitTransform = style.transitionDuration = "";
        const cb = el[moveCbKey] = (e) => {
          if (e && e.target !== el) {
            return;
          }
          if (!e || e.propertyName.endsWith("transform")) {
            el.removeEventListener("transitionend", cb);
            el[moveCbKey] = null;
            removeTransitionClass(el, moveClass);
          }
        };
        el.addEventListener("transitionend", cb);
      });
      prevChildren = [];
    });
    return () => {
      const rawProps = /* @__PURE__ */ toRaw(props);
      const cssTransitionProps = resolveTransitionProps(rawProps);
      let tag = rawProps.tag || Fragment;
      prevChildren = [];
      if (children) {
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (child.el && child.el instanceof Element) {
            prevChildren.push(child);
            setTransitionHooks(
              child,
              resolveTransitionHooks(
                child,
                cssTransitionProps,
                state,
                instance
              )
            );
            positionMap.set(child, getPosition(child.el));
          }
        }
      }
      children = slots.default ? getTransitionRawChildren(slots.default()) : [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.key != null) {
          setTransitionHooks(
            child,
            resolveTransitionHooks(child, cssTransitionProps, state, instance)
          );
        }
      }
      return createVNode(tag, null, children);
    };
  }
});
const TransitionGroup = TransitionGroupImpl;
function callPendingCbs(c) {
  const el = c.el;
  if (el[moveCbKey]) {
    el[moveCbKey]();
  }
  if (el[enterCbKey]) {
    el[enterCbKey]();
  }
}
function recordPosition(c) {
  newPositionMap.set(c, getPosition(c.el));
}
function applyTranslation(c) {
  const oldPos = positionMap.get(c);
  const newPos = newPositionMap.get(c);
  const dx = oldPos.left - newPos.left;
  const dy = oldPos.top - newPos.top;
  if (dx || dy) {
    const el = c.el;
    const s = el.style;
    const rect = el.getBoundingClientRect();
    let scaleX = 1;
    let scaleY = 1;
    if (el.offsetWidth) scaleX = rect.width / el.offsetWidth;
    if (el.offsetHeight) scaleY = rect.height / el.offsetHeight;
    if (!Number.isFinite(scaleX) || scaleX === 0) scaleX = 1;
    if (!Number.isFinite(scaleY) || scaleY === 0) scaleY = 1;
    if (Math.abs(scaleX - 1) < 0.01) scaleX = 1;
    if (Math.abs(scaleY - 1) < 0.01) scaleY = 1;
    s.transform = s.webkitTransform = `translate(${dx / scaleX}px,${dy / scaleY}px)`;
    s.transitionDuration = "0s";
    return c;
  }
}
function getPosition(el) {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top
  };
}
function hasCSSTransform(el, root, moveClass) {
  const clone = el.cloneNode();
  const _vtc = el[vtcKey];
  if (_vtc) {
    _vtc.forEach((cls) => {
      cls.split(/\s+/).forEach((c) => c && clone.classList.remove(c));
    });
  }
  moveClass.split(/\s+/).forEach((c) => c && clone.classList.add(c));
  clone.style.display = "none";
  const container = root.nodeType === 1 ? root : root.parentNode;
  container.appendChild(clone);
  const { hasTransform } = getTransitionInfo(clone);
  container.removeChild(clone);
  return hasTransform;
}
const getModelAssigner = (vnode) => {
  const fn = vnode.props["onUpdate:modelValue"] || false;
  return isArray$1(fn) ? (value) => invokeArrayFns(fn, value) : fn;
};
function onCompositionStart(e) {
  e.target.composing = true;
}
function onCompositionEnd(e) {
  const target = e.target;
  if (target.composing) {
    target.composing = false;
    target.dispatchEvent(new Event("input"));
  }
}
const assignKey = /* @__PURE__ */ Symbol("_assign");
function castValue(value, trim, number) {
  if (trim) value = value.trim();
  if (number) value = looseToNumber(value);
  return value;
}
const vModelText = {
  created(el, { modifiers: { lazy, trim, number } }, vnode) {
    el[assignKey] = getModelAssigner(vnode);
    const castToNumber = number || vnode.props && vnode.props.type === "number";
    addEventListener(el, lazy ? "change" : "input", (e) => {
      if (e.target.composing) return;
      el[assignKey](castValue(el.value, trim, castToNumber));
    });
    if (trim || castToNumber) {
      addEventListener(el, "change", () => {
        el.value = castValue(el.value, trim, castToNumber);
      });
    }
    if (!lazy) {
      addEventListener(el, "compositionstart", onCompositionStart);
      addEventListener(el, "compositionend", onCompositionEnd);
      addEventListener(el, "change", onCompositionEnd);
    }
  },
  // set value on mounted so it's after min/max for type="range"
  mounted(el, { value }) {
    el.value = value == null ? "" : value;
  },
  beforeUpdate(el, { value, oldValue, modifiers: { lazy, trim, number } }, vnode) {
    el[assignKey] = getModelAssigner(vnode);
    if (el.composing) return;
    const elValue = (number || el.type === "number") && !/^0\d/.test(el.value) ? looseToNumber(el.value) : el.value;
    const newValue = value == null ? "" : value;
    if (elValue === newValue) {
      return;
    }
    const rootNode = el.getRootNode();
    if ((rootNode instanceof Document || rootNode instanceof ShadowRoot) && rootNode.activeElement === el && el.type !== "range") {
      if (lazy && value === oldValue) {
        return;
      }
      if (trim && el.value.trim() === newValue) {
        return;
      }
    }
    el.value = newValue;
  }
};
const vModelCheckbox = {
  // #4096 array checkboxes need to be deep traversed
  deep: true,
  created(el, _, vnode) {
    el[assignKey] = getModelAssigner(vnode);
    addEventListener(el, "change", () => {
      const modelValue = el._modelValue;
      const elementValue = getValue(el);
      const checked = el.checked;
      const assign2 = el[assignKey];
      if (isArray$1(modelValue)) {
        const index2 = looseIndexOf(modelValue, elementValue);
        const found = index2 !== -1;
        if (checked && !found) {
          assign2(modelValue.concat(elementValue));
        } else if (!checked && found) {
          const filtered = [...modelValue];
          filtered.splice(index2, 1);
          assign2(filtered);
        }
      } else if (isSet(modelValue)) {
        const cloned = new Set(modelValue);
        if (checked) {
          cloned.add(elementValue);
        } else {
          cloned.delete(elementValue);
        }
        assign2(cloned);
      } else {
        assign2(getCheckboxValue(el, checked));
      }
    });
  },
  // set initial checked on mount to wait for true-value/false-value
  mounted: setChecked,
  beforeUpdate(el, binding, vnode) {
    el[assignKey] = getModelAssigner(vnode);
    setChecked(el, binding, vnode);
  }
};
function setChecked(el, { value, oldValue }, vnode) {
  el._modelValue = value;
  let checked;
  if (isArray$1(value)) {
    checked = looseIndexOf(value, vnode.props.value) > -1;
  } else if (isSet(value)) {
    checked = value.has(vnode.props.value);
  } else {
    if (value === oldValue) return;
    checked = looseEqual(value, getCheckboxValue(el, true));
  }
  if (el.checked !== checked) {
    el.checked = checked;
  }
}
const vModelSelect = {
  // <select multiple> value need to be deep traversed
  deep: true,
  created(el, { value, modifiers: { number } }, vnode) {
    const isSetModel = isSet(value);
    addEventListener(el, "change", () => {
      const selectedVal = Array.prototype.filter.call(el.options, (o) => o.selected).map(
        (o) => number ? looseToNumber(getValue(o)) : getValue(o)
      );
      el[assignKey](
        el.multiple ? isSetModel ? new Set(selectedVal) : selectedVal : selectedVal[0]
      );
      el._assigning = true;
      nextTick(() => {
        el._assigning = false;
      });
    });
    el[assignKey] = getModelAssigner(vnode);
  },
  // set value in mounted & updated because <select> relies on its children
  // <option>s.
  mounted(el, { value }) {
    setSelected(el, value);
  },
  beforeUpdate(el, _binding, vnode) {
    el[assignKey] = getModelAssigner(vnode);
  },
  updated(el, { value }) {
    if (!el._assigning) {
      setSelected(el, value);
    }
  }
};
function setSelected(el, value) {
  const isMultiple = el.multiple;
  const isArrayValue = isArray$1(value);
  if (isMultiple && !isArrayValue && !isSet(value)) {
    return;
  }
  for (let i = 0, l = el.options.length; i < l; i++) {
    const option = el.options[i];
    const optionValue = getValue(option);
    if (isMultiple) {
      if (isArrayValue) {
        const optionType = typeof optionValue;
        if (optionType === "string" || optionType === "number") {
          option.selected = value.some((v) => String(v) === String(optionValue));
        } else {
          option.selected = looseIndexOf(value, optionValue) > -1;
        }
      } else {
        option.selected = value.has(optionValue);
      }
    } else if (looseEqual(getValue(option), value)) {
      if (el.selectedIndex !== i) el.selectedIndex = i;
      return;
    }
  }
  if (!isMultiple && el.selectedIndex !== -1) {
    el.selectedIndex = -1;
  }
}
function getValue(el) {
  return "_value" in el ? el._value : el.value;
}
function getCheckboxValue(el, checked) {
  const key = checked ? "_trueValue" : "_falseValue";
  return key in el ? el[key] : checked;
}
const systemModifiers = ["ctrl", "shift", "alt", "meta"];
const modifierGuards = {
  stop: (e) => e.stopPropagation(),
  prevent: (e) => e.preventDefault(),
  self: (e) => e.target !== e.currentTarget,
  ctrl: (e) => !e.ctrlKey,
  shift: (e) => !e.shiftKey,
  alt: (e) => !e.altKey,
  meta: (e) => !e.metaKey,
  left: (e) => "button" in e && e.button !== 0,
  middle: (e) => "button" in e && e.button !== 1,
  right: (e) => "button" in e && e.button !== 2,
  exact: (e, modifiers) => systemModifiers.some((m) => e[`${m}Key`] && !modifiers.includes(m))
};
const withModifiers = (fn, modifiers) => {
  if (!fn) return fn;
  const cache = fn._withMods || (fn._withMods = {});
  const cacheKey = modifiers.join(".");
  return cache[cacheKey] || (cache[cacheKey] = (event, ...args) => {
    for (let i = 0; i < modifiers.length; i++) {
      const guard = modifierGuards[modifiers[i]];
      if (guard && guard(event, modifiers)) return;
    }
    return fn(event, ...args);
  });
};
const keyNames = {
  esc: "escape",
  space: " ",
  up: "arrow-up",
  left: "arrow-left",
  right: "arrow-right",
  down: "arrow-down",
  delete: "backspace"
};
const withKeys = (fn, modifiers) => {
  const cache = fn._withKeys || (fn._withKeys = {});
  const cacheKey = modifiers.join(".");
  return cache[cacheKey] || (cache[cacheKey] = (event) => {
    if (!("key" in event)) {
      return;
    }
    const eventKey = hyphenate(event.key);
    if (modifiers.some(
      (k) => k === eventKey || keyNames[k] === eventKey
    )) {
      return fn(event);
    }
  });
};
const rendererOptions = /* @__PURE__ */ extend({ patchProp }, nodeOps);
let renderer;
function ensureRenderer() {
  return renderer || (renderer = createRenderer(rendererOptions));
}
const createApp = (...args) => {
  const app2 = ensureRenderer().createApp(...args);
  const { mount } = app2;
  app2.mount = (containerOrSelector) => {
    const container = normalizeContainer(containerOrSelector);
    if (!container) return;
    const component = app2._component;
    if (!isFunction(component) && !component.render && !component.template) {
      component.template = container.innerHTML;
    }
    if (container.nodeType === 1) {
      container.textContent = "";
    }
    const proxy = mount(container, false, resolveRootNamespace(container));
    if (container instanceof Element) {
      container.removeAttribute("v-cloak");
      container.setAttribute("data-v-app", "");
    }
    return proxy;
  };
  return app2;
};
function resolveRootNamespace(container) {
  if (container instanceof SVGElement) {
    return "svg";
  }
  if (typeof MathMLElement === "function" && container instanceof MathMLElement) {
    return "mathml";
  }
}
function normalizeContainer(container) {
  if (isString(container)) {
    const res = document.querySelector(container);
    return res;
  }
  return container;
}
/*!
 * pinia v3.0.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */
let activePinia;
const setActivePinia = (pinia) => activePinia = pinia;
const piniaSymbol = (
  /* istanbul ignore next */
  Symbol()
);
function isPlainObject(o) {
  return o && typeof o === "object" && Object.prototype.toString.call(o) === "[object Object]" && typeof o.toJSON !== "function";
}
var MutationType;
(function(MutationType2) {
  MutationType2["direct"] = "direct";
  MutationType2["patchObject"] = "patch object";
  MutationType2["patchFunction"] = "patch function";
})(MutationType || (MutationType = {}));
function createPinia() {
  const scope = effectScope(true);
  const state = scope.run(() => /* @__PURE__ */ ref({}));
  let _p = [];
  let toBeInstalled = [];
  const pinia = markRaw({
    install(app2) {
      setActivePinia(pinia);
      pinia._a = app2;
      app2.provide(piniaSymbol, pinia);
      app2.config.globalProperties.$pinia = pinia;
      toBeInstalled.forEach((plugin) => _p.push(plugin));
      toBeInstalled = [];
    },
    use(plugin) {
      if (!this._a) {
        toBeInstalled.push(plugin);
      } else {
        _p.push(plugin);
      }
      return this;
    },
    _p,
    // it's actually undefined here
    // @ts-expect-error
    _a: null,
    _e: scope,
    _s: /* @__PURE__ */ new Map(),
    state
  });
  return pinia;
}
const noop$1 = () => {
};
function addSubscription(subscriptions, callback, detached, onCleanup = noop$1) {
  subscriptions.add(callback);
  const removeSubscription = () => {
    const isDel = subscriptions.delete(callback);
    isDel && onCleanup();
  };
  if (!detached && getCurrentScope()) {
    onScopeDispose(removeSubscription);
  }
  return removeSubscription;
}
function triggerSubscriptions(subscriptions, ...args) {
  subscriptions.forEach((callback) => {
    callback(...args);
  });
}
const fallbackRunWithContext = (fn) => fn();
const ACTION_MARKER = Symbol();
const ACTION_NAME = Symbol();
function mergeReactiveObjects(target, patchToApply) {
  if (target instanceof Map && patchToApply instanceof Map) {
    patchToApply.forEach((value, key) => target.set(key, value));
  } else if (target instanceof Set && patchToApply instanceof Set) {
    patchToApply.forEach(target.add, target);
  }
  for (const key in patchToApply) {
    if (!patchToApply.hasOwnProperty(key))
      continue;
    const subPatch = patchToApply[key];
    const targetValue = target[key];
    if (isPlainObject(targetValue) && isPlainObject(subPatch) && target.hasOwnProperty(key) && !/* @__PURE__ */ isRef(subPatch) && !/* @__PURE__ */ isReactive(subPatch)) {
      target[key] = mergeReactiveObjects(targetValue, subPatch);
    } else {
      target[key] = subPatch;
    }
  }
  return target;
}
const skipHydrateSymbol = (
  /* istanbul ignore next */
  Symbol()
);
function shouldHydrate(obj) {
  return !isPlainObject(obj) || !Object.prototype.hasOwnProperty.call(obj, skipHydrateSymbol);
}
const { assign: assign$1 } = Object;
function isComputed(o) {
  return !!(/* @__PURE__ */ isRef(o) && o.effect);
}
function createOptionsStore(id, options, pinia, hot) {
  const { state, actions, getters } = options;
  const initialState = pinia.state.value[id];
  let store;
  function setup() {
    if (!initialState && true) {
      pinia.state.value[id] = state ? state() : {};
    }
    const localState = /* @__PURE__ */ toRefs(pinia.state.value[id]);
    return assign$1(localState, actions, Object.keys(getters || {}).reduce((computedGetters, name) => {
      computedGetters[name] = markRaw(computed(() => {
        setActivePinia(pinia);
        const store2 = pinia._s.get(id);
        return getters[name].call(store2, store2);
      }));
      return computedGetters;
    }, {}));
  }
  store = createSetupStore(id, setup, options, pinia, hot, true);
  return store;
}
function createSetupStore($id, setup, options = {}, pinia, hot, isOptionsStore) {
  let scope;
  const optionsForPlugin = assign$1({ actions: {} }, options);
  const $subscribeOptions = { deep: true };
  let isListening;
  let isSyncListening;
  let subscriptions = /* @__PURE__ */ new Set();
  let actionSubscriptions = /* @__PURE__ */ new Set();
  let debuggerEvents;
  const initialState = pinia.state.value[$id];
  if (!isOptionsStore && !initialState && true) {
    pinia.state.value[$id] = {};
  }
  let activeListener;
  function $patch(partialStateOrMutator) {
    let subscriptionMutation;
    isListening = isSyncListening = false;
    if (typeof partialStateOrMutator === "function") {
      partialStateOrMutator(pinia.state.value[$id]);
      subscriptionMutation = {
        type: MutationType.patchFunction,
        storeId: $id,
        events: debuggerEvents
      };
    } else {
      mergeReactiveObjects(pinia.state.value[$id], partialStateOrMutator);
      subscriptionMutation = {
        type: MutationType.patchObject,
        payload: partialStateOrMutator,
        storeId: $id,
        events: debuggerEvents
      };
    }
    const myListenerId = activeListener = Symbol();
    nextTick().then(() => {
      if (activeListener === myListenerId) {
        isListening = true;
      }
    });
    isSyncListening = true;
    triggerSubscriptions(subscriptions, subscriptionMutation, pinia.state.value[$id]);
  }
  const $reset = isOptionsStore ? function $reset2() {
    const { state } = options;
    const newState = state ? state() : {};
    this.$patch(($state) => {
      assign$1($state, newState);
    });
  } : (
    /* istanbul ignore next */
    noop$1
  );
  function $dispose() {
    scope.stop();
    subscriptions.clear();
    actionSubscriptions.clear();
    pinia._s.delete($id);
  }
  const action = (fn, name = "") => {
    if (ACTION_MARKER in fn) {
      fn[ACTION_NAME] = name;
      return fn;
    }
    const wrappedAction = function() {
      setActivePinia(pinia);
      const args = Array.from(arguments);
      const afterCallbackSet = /* @__PURE__ */ new Set();
      const onErrorCallbackSet = /* @__PURE__ */ new Set();
      function after(callback) {
        afterCallbackSet.add(callback);
      }
      function onError(callback) {
        onErrorCallbackSet.add(callback);
      }
      triggerSubscriptions(actionSubscriptions, {
        args,
        name: wrappedAction[ACTION_NAME],
        store,
        after,
        onError
      });
      let ret;
      try {
        ret = fn.apply(this && this.$id === $id ? this : store, args);
      } catch (error) {
        triggerSubscriptions(onErrorCallbackSet, error);
        throw error;
      }
      if (ret instanceof Promise) {
        return ret.then((value) => {
          triggerSubscriptions(afterCallbackSet, value);
          return value;
        }).catch((error) => {
          triggerSubscriptions(onErrorCallbackSet, error);
          return Promise.reject(error);
        });
      }
      triggerSubscriptions(afterCallbackSet, ret);
      return ret;
    };
    wrappedAction[ACTION_MARKER] = true;
    wrappedAction[ACTION_NAME] = name;
    return wrappedAction;
  };
  const partialStore = {
    _p: pinia,
    // _s: scope,
    $id,
    $onAction: addSubscription.bind(null, actionSubscriptions),
    $patch,
    $reset,
    $subscribe(callback, options2 = {}) {
      const removeSubscription = addSubscription(subscriptions, callback, options2.detached, () => stopWatcher());
      const stopWatcher = scope.run(() => watch(() => pinia.state.value[$id], (state) => {
        if (options2.flush === "sync" ? isSyncListening : isListening) {
          callback({
            storeId: $id,
            type: MutationType.direct,
            events: debuggerEvents
          }, state);
        }
      }, assign$1({}, $subscribeOptions, options2)));
      return removeSubscription;
    },
    $dispose
  };
  const store = /* @__PURE__ */ reactive(partialStore);
  pinia._s.set($id, store);
  const runWithContext = pinia._a && pinia._a.runWithContext || fallbackRunWithContext;
  const setupStore = runWithContext(() => pinia._e.run(() => (scope = effectScope()).run(() => setup({ action }))));
  for (const key in setupStore) {
    const prop = setupStore[key];
    if (/* @__PURE__ */ isRef(prop) && !isComputed(prop) || /* @__PURE__ */ isReactive(prop)) {
      if (!isOptionsStore) {
        if (initialState && shouldHydrate(prop)) {
          if (/* @__PURE__ */ isRef(prop)) {
            prop.value = initialState[key];
          } else {
            mergeReactiveObjects(prop, initialState[key]);
          }
        }
        pinia.state.value[$id][key] = prop;
      }
    } else if (typeof prop === "function") {
      const actionValue = action(prop, key);
      setupStore[key] = actionValue;
      optionsForPlugin.actions[key] = prop;
    } else ;
  }
  assign$1(store, setupStore);
  assign$1(/* @__PURE__ */ toRaw(store), setupStore);
  Object.defineProperty(store, "$state", {
    get: () => pinia.state.value[$id],
    set: (state) => {
      $patch(($state) => {
        assign$1($state, state);
      });
    }
  });
  pinia._p.forEach((extender) => {
    {
      assign$1(store, scope.run(() => extender({
        store,
        app: pinia._a,
        pinia,
        options: optionsForPlugin
      })));
    }
  });
  if (initialState && isOptionsStore && options.hydrate) {
    options.hydrate(store.$state, initialState);
  }
  isListening = true;
  isSyncListening = true;
  return store;
}
/*! #__NO_SIDE_EFFECTS__ */
// @__NO_SIDE_EFFECTS__
function defineStore(id, setup, setupOptions) {
  let options;
  const isSetupStore = typeof setup === "function";
  options = isSetupStore ? setupOptions : setup;
  function useStore(pinia, hot) {
    const hasContext = hasInjectionContext();
    pinia = // in test mode, ignore the argument provided as we can always retrieve a
    // pinia instance with getActivePinia()
    pinia || (hasContext ? inject(piniaSymbol, null) : null);
    if (pinia)
      setActivePinia(pinia);
    pinia = activePinia;
    if (!pinia._s.has(id)) {
      if (isSetupStore) {
        createSetupStore(id, setup, options, pinia);
      } else {
        createOptionsStore(id, options, pinia);
      }
    }
    const store = pinia._s.get(id);
    return store;
  }
  useStore.$id = id;
  return useStore;
}
/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */
const isBrowser = typeof document !== "undefined";
function isRouteComponent(component) {
  return typeof component === "object" || "displayName" in component || "props" in component || "__vccOpts" in component;
}
function isESModule(obj) {
  return obj.__esModule || obj[Symbol.toStringTag] === "Module" || obj.default && isRouteComponent(obj.default);
}
const assign = Object.assign;
function applyToParams(fn, params) {
  const newParams = {};
  for (const key in params) {
    const value = params[key];
    newParams[key] = isArray(value) ? value.map(fn) : fn(value);
  }
  return newParams;
}
const noop = () => {
};
const isArray = Array.isArray;
function mergeOptions(defaults, partialOptions) {
  const options = {};
  for (const key in defaults) options[key] = key in partialOptions ? partialOptions[key] : defaults[key];
  return options;
}
const HASH_RE = /#/g;
const AMPERSAND_RE = /&/g;
const SLASH_RE = /\//g;
const EQUAL_RE = /=/g;
const IM_RE = /\?/g;
const PLUS_RE = /\+/g;
const ENC_BRACKET_OPEN_RE = /%5B/g;
const ENC_BRACKET_CLOSE_RE = /%5D/g;
const ENC_CARET_RE = /%5E/g;
const ENC_BACKTICK_RE = /%60/g;
const ENC_CURLY_OPEN_RE = /%7B/g;
const ENC_PIPE_RE = /%7C/g;
const ENC_CURLY_CLOSE_RE = /%7D/g;
const ENC_SPACE_RE = /%20/g;
function commonEncode(text) {
  return text == null ? "" : encodeURI("" + text).replace(ENC_PIPE_RE, "|").replace(ENC_BRACKET_OPEN_RE, "[").replace(ENC_BRACKET_CLOSE_RE, "]");
}
function encodeHash(text) {
  return commonEncode(text).replace(ENC_CURLY_OPEN_RE, "{").replace(ENC_CURLY_CLOSE_RE, "}").replace(ENC_CARET_RE, "^");
}
function encodeQueryValue(text) {
  return commonEncode(text).replace(PLUS_RE, "%2B").replace(ENC_SPACE_RE, "+").replace(HASH_RE, "%23").replace(AMPERSAND_RE, "%26").replace(ENC_BACKTICK_RE, "`").replace(ENC_CURLY_OPEN_RE, "{").replace(ENC_CURLY_CLOSE_RE, "}").replace(ENC_CARET_RE, "^");
}
function encodeQueryKey(text) {
  return encodeQueryValue(text).replace(EQUAL_RE, "%3D");
}
function encodePath(text) {
  return commonEncode(text).replace(HASH_RE, "%23").replace(IM_RE, "%3F");
}
function encodeParam(text) {
  return encodePath(text).replace(SLASH_RE, "%2F");
}
function decode(text) {
  if (text == null) return null;
  try {
    return decodeURIComponent("" + text);
  } catch (err) {
  }
  return "" + text;
}
const TRAILING_SLASH_RE = /\/$/;
const removeTrailingSlash = (path) => path.replace(TRAILING_SLASH_RE, "");
function parseURL(parseQuery$1, location2, currentLocation = "/") {
  let path, query = {}, searchString = "", hash = "";
  const hashPos = location2.indexOf("#");
  let searchPos = location2.indexOf("?");
  searchPos = hashPos >= 0 && searchPos > hashPos ? -1 : searchPos;
  if (searchPos >= 0) {
    path = location2.slice(0, searchPos);
    searchString = location2.slice(searchPos, hashPos > 0 ? hashPos : location2.length);
    query = parseQuery$1(searchString.slice(1));
  }
  if (hashPos >= 0) {
    path = path || location2.slice(0, hashPos);
    hash = location2.slice(hashPos, location2.length);
  }
  path = resolveRelativePath(path != null ? path : location2, currentLocation);
  return {
    fullPath: path + searchString + hash,
    path,
    query,
    hash: decode(hash)
  };
}
function stringifyURL(stringifyQuery$1, location2) {
  const query = location2.query ? stringifyQuery$1(location2.query) : "";
  return location2.path + (query && "?") + query + (location2.hash || "");
}
function stripBase(pathname, base) {
  if (!base || !pathname.toLowerCase().startsWith(base.toLowerCase())) return pathname;
  return pathname.slice(base.length) || "/";
}
function isSameRouteLocation(stringifyQuery$1, a, b) {
  const aLastIndex = a.matched.length - 1;
  const bLastIndex = b.matched.length - 1;
  return aLastIndex > -1 && aLastIndex === bLastIndex && isSameRouteRecord(a.matched[aLastIndex], b.matched[bLastIndex]) && isSameRouteLocationParams(a.params, b.params) && stringifyQuery$1(a.query) === stringifyQuery$1(b.query) && a.hash === b.hash;
}
function isSameRouteRecord(a, b) {
  return (a.aliasOf || a) === (b.aliasOf || b);
}
function isSameRouteLocationParams(a, b) {
  if (Object.keys(a).length !== Object.keys(b).length) return false;
  for (var key in a) if (!isSameRouteLocationParamsValue(a[key], b[key])) return false;
  return true;
}
function isSameRouteLocationParamsValue(a, b) {
  return isArray(a) ? isEquivalentArray(a, b) : isArray(b) ? isEquivalentArray(b, a) : (a == null ? void 0 : a.valueOf()) === (b == null ? void 0 : b.valueOf());
}
function isEquivalentArray(a, b) {
  return isArray(b) ? a.length === b.length && a.every((value, i) => value === b[i]) : a.length === 1 && a[0] === b;
}
function resolveRelativePath(to, from) {
  if (to.startsWith("/")) return to;
  if (!to) return from;
  const fromSegments = from.split("/");
  const toSegments = to.split("/");
  const lastToSegment = toSegments[toSegments.length - 1];
  if (lastToSegment === ".." || lastToSegment === ".") toSegments.push("");
  let position = fromSegments.length - 1;
  let toPosition;
  let segment;
  for (toPosition = 0; toPosition < toSegments.length; toPosition++) {
    segment = toSegments[toPosition];
    if (segment === ".") continue;
    if (segment === "..") {
      if (position > 1) position--;
    } else break;
  }
  return fromSegments.slice(0, position).join("/") + "/" + toSegments.slice(toPosition).join("/");
}
const START_LOCATION_NORMALIZED = {
  path: "/",
  name: void 0,
  params: {},
  query: {},
  hash: "",
  fullPath: "/",
  matched: [],
  meta: {},
  redirectedFrom: void 0
};
let NavigationType = /* @__PURE__ */ function(NavigationType$1) {
  NavigationType$1["pop"] = "pop";
  NavigationType$1["push"] = "push";
  return NavigationType$1;
}({});
let NavigationDirection = /* @__PURE__ */ function(NavigationDirection$1) {
  NavigationDirection$1["back"] = "back";
  NavigationDirection$1["forward"] = "forward";
  NavigationDirection$1["unknown"] = "";
  return NavigationDirection$1;
}({});
function normalizeBase(base) {
  if (!base) if (isBrowser) {
    const baseEl = document.querySelector("base");
    base = baseEl && baseEl.getAttribute("href") || "/";
    base = base.replace(/^\w+:\/\/[^\/]+/, "");
  } else base = "/";
  if (base[0] !== "/" && base[0] !== "#") base = "/" + base;
  return removeTrailingSlash(base);
}
const BEFORE_HASH_RE = /^[^#]+#/;
function createHref(base, location2) {
  return base.replace(BEFORE_HASH_RE, "#") + location2;
}
function getElementPosition(el, offset) {
  const docRect = document.documentElement.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return {
    behavior: offset.behavior,
    left: elRect.left - docRect.left - (offset.left || 0),
    top: elRect.top - docRect.top - (offset.top || 0)
  };
}
const computeScrollPosition = () => ({
  left: window.scrollX,
  top: window.scrollY
});
function scrollToPosition(position) {
  let scrollToOptions;
  if ("el" in position) {
    const positionEl = position.el;
    const isIdSelector = typeof positionEl === "string" && positionEl.startsWith("#");
    const el = typeof positionEl === "string" ? isIdSelector ? document.getElementById(positionEl.slice(1)) : document.querySelector(positionEl) : positionEl;
    if (!el) {
      return;
    }
    scrollToOptions = getElementPosition(el, position);
  } else scrollToOptions = position;
  if ("scrollBehavior" in document.documentElement.style) window.scrollTo(scrollToOptions);
  else window.scrollTo(scrollToOptions.left != null ? scrollToOptions.left : window.scrollX, scrollToOptions.top != null ? scrollToOptions.top : window.scrollY);
}
function getScrollKey(path, delta) {
  return (history.state ? history.state.position - delta : -1) + path;
}
const scrollPositions = /* @__PURE__ */ new Map();
function saveScrollPosition(key, scrollPosition) {
  scrollPositions.set(key, scrollPosition);
}
function getSavedScrollPosition(key) {
  const scroll = scrollPositions.get(key);
  scrollPositions.delete(key);
  return scroll;
}
function isRouteLocation(route) {
  return typeof route === "string" || route && typeof route === "object";
}
function isRouteName(name) {
  return typeof name === "string" || typeof name === "symbol";
}
let ErrorTypes = /* @__PURE__ */ function(ErrorTypes$1) {
  ErrorTypes$1[ErrorTypes$1["MATCHER_NOT_FOUND"] = 1] = "MATCHER_NOT_FOUND";
  ErrorTypes$1[ErrorTypes$1["NAVIGATION_GUARD_REDIRECT"] = 2] = "NAVIGATION_GUARD_REDIRECT";
  ErrorTypes$1[ErrorTypes$1["NAVIGATION_ABORTED"] = 4] = "NAVIGATION_ABORTED";
  ErrorTypes$1[ErrorTypes$1["NAVIGATION_CANCELLED"] = 8] = "NAVIGATION_CANCELLED";
  ErrorTypes$1[ErrorTypes$1["NAVIGATION_DUPLICATED"] = 16] = "NAVIGATION_DUPLICATED";
  return ErrorTypes$1;
}({});
const NavigationFailureSymbol = Symbol("");
({
  [ErrorTypes.MATCHER_NOT_FOUND]({ location: location2, currentLocation }) {
    return `No match for
 ${JSON.stringify(location2)}${currentLocation ? "\nwhile being at\n" + JSON.stringify(currentLocation) : ""}`;
  },
  [ErrorTypes.NAVIGATION_GUARD_REDIRECT]({ from, to }) {
    return `Redirected from "${from.fullPath}" to "${stringifyRoute(to)}" via a navigation guard.`;
  },
  [ErrorTypes.NAVIGATION_ABORTED]({ from, to }) {
    return `Navigation aborted from "${from.fullPath}" to "${to.fullPath}" via a navigation guard.`;
  },
  [ErrorTypes.NAVIGATION_CANCELLED]({ from, to }) {
    return `Navigation cancelled from "${from.fullPath}" to "${to.fullPath}" with a new navigation.`;
  },
  [ErrorTypes.NAVIGATION_DUPLICATED]({ from, to }) {
    return `Avoided redundant navigation to current location: "${from.fullPath}".`;
  }
});
function createRouterError(type, params) {
  return assign(/* @__PURE__ */ new Error(), {
    type,
    [NavigationFailureSymbol]: true
  }, params);
}
function isNavigationFailure(error, type) {
  return error instanceof Error && NavigationFailureSymbol in error && (type == null || !!(error.type & type));
}
const propertiesToLog = [
  "params",
  "query",
  "hash"
];
function stringifyRoute(to) {
  if (typeof to === "string") return to;
  if (to.path != null) return to.path;
  const location2 = {};
  for (const key of propertiesToLog) if (key in to) location2[key] = to[key];
  return JSON.stringify(location2, null, 2);
}
function parseQuery(search) {
  const query = {};
  if (search === "" || search === "?") return query;
  const searchParams = (search[0] === "?" ? search.slice(1) : search).split("&");
  for (let i = 0; i < searchParams.length; ++i) {
    const searchParam = searchParams[i].replace(PLUS_RE, " ");
    const eqPos = searchParam.indexOf("=");
    const key = decode(eqPos < 0 ? searchParam : searchParam.slice(0, eqPos));
    const value = eqPos < 0 ? null : decode(searchParam.slice(eqPos + 1));
    if (key in query) {
      let currentValue = query[key];
      if (!isArray(currentValue)) currentValue = query[key] = [currentValue];
      currentValue.push(value);
    } else query[key] = value;
  }
  return query;
}
function stringifyQuery(query) {
  let search = "";
  for (let key in query) {
    const value = query[key];
    key = encodeQueryKey(key);
    if (value == null) {
      if (value !== void 0) search += (search.length ? "&" : "") + key;
      continue;
    }
    (isArray(value) ? value.map((v) => v && encodeQueryValue(v)) : [value && encodeQueryValue(value)]).forEach((value$1) => {
      if (value$1 !== void 0) {
        search += (search.length ? "&" : "") + key;
        if (value$1 != null) search += "=" + value$1;
      }
    });
  }
  return search;
}
function normalizeQuery(query) {
  const normalizedQuery = {};
  for (const key in query) {
    const value = query[key];
    if (value !== void 0) normalizedQuery[key] = isArray(value) ? value.map((v) => v == null ? null : "" + v) : value == null ? value : "" + value;
  }
  return normalizedQuery;
}
const matchedRouteKey = Symbol("");
const viewDepthKey = Symbol("");
const routerKey = Symbol("");
const routeLocationKey = Symbol("");
const routerViewLocationKey = Symbol("");
function useCallbacks() {
  let handlers = [];
  function add(handler) {
    handlers.push(handler);
    return () => {
      const i = handlers.indexOf(handler);
      if (i > -1) handlers.splice(i, 1);
    };
  }
  function reset() {
    handlers = [];
  }
  return {
    add,
    list: () => handlers.slice(),
    reset
  };
}
function guardToPromiseFn(guard, to, from, record, name, runWithContext = (fn) => fn()) {
  const enterCallbackArray = record && (record.enterCallbacks[name] = record.enterCallbacks[name] || []);
  return () => new Promise((resolve2, reject) => {
    const next = (valid) => {
      if (valid === false) reject(createRouterError(ErrorTypes.NAVIGATION_ABORTED, {
        from,
        to
      }));
      else if (valid instanceof Error) reject(valid);
      else if (isRouteLocation(valid)) reject(createRouterError(ErrorTypes.NAVIGATION_GUARD_REDIRECT, {
        from: to,
        to: valid
      }));
      else {
        if (enterCallbackArray && record.enterCallbacks[name] === enterCallbackArray && typeof valid === "function") enterCallbackArray.push(valid);
        resolve2();
      }
    };
    const guardReturn = runWithContext(() => guard.call(record && record.instances[name], to, from, next));
    let guardCall = Promise.resolve(guardReturn);
    if (guard.length < 3) guardCall = guardCall.then(next);
    guardCall.catch((err) => reject(err));
  });
}
function extractComponentsGuards(matched, guardType, to, from, runWithContext = (fn) => fn()) {
  const guards = [];
  for (const record of matched) {
    for (const name in record.components) {
      let rawComponent = record.components[name];
      if (guardType !== "beforeRouteEnter" && !record.instances[name]) continue;
      if (isRouteComponent(rawComponent)) {
        const guard = (rawComponent.__vccOpts || rawComponent)[guardType];
        guard && guards.push(guardToPromiseFn(guard, to, from, record, name, runWithContext));
      } else {
        let componentPromise = rawComponent();
        guards.push(() => componentPromise.then((resolved) => {
          if (!resolved) throw new Error(`Couldn't resolve component "${name}" at "${record.path}"`);
          const resolvedComponent = isESModule(resolved) ? resolved.default : resolved;
          record.mods[name] = resolved;
          record.components[name] = resolvedComponent;
          const guard = (resolvedComponent.__vccOpts || resolvedComponent)[guardType];
          return guard && guardToPromiseFn(guard, to, from, record, name, runWithContext)();
        }));
      }
    }
  }
  return guards;
}
function extractChangingRecords(to, from) {
  const leavingRecords = [];
  const updatingRecords = [];
  const enteringRecords = [];
  const len = Math.max(from.matched.length, to.matched.length);
  for (let i = 0; i < len; i++) {
    const recordFrom = from.matched[i];
    if (recordFrom) if (to.matched.find((record) => isSameRouteRecord(record, recordFrom))) updatingRecords.push(recordFrom);
    else leavingRecords.push(recordFrom);
    const recordTo = to.matched[i];
    if (recordTo) {
      if (!from.matched.find((record) => isSameRouteRecord(record, recordTo))) enteringRecords.push(recordTo);
    }
  }
  return [
    leavingRecords,
    updatingRecords,
    enteringRecords
  ];
}
/*!
 * vue-router v4.6.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */
let createBaseLocation = () => location.protocol + "//" + location.host;
function createCurrentLocation(base, location$1) {
  const { pathname, search, hash } = location$1;
  const hashPos = base.indexOf("#");
  if (hashPos > -1) {
    let slicePos = hash.includes(base.slice(hashPos)) ? base.slice(hashPos).length : 1;
    let pathFromHash = hash.slice(slicePos);
    if (pathFromHash[0] !== "/") pathFromHash = "/" + pathFromHash;
    return stripBase(pathFromHash, "");
  }
  return stripBase(pathname, base) + search + hash;
}
function useHistoryListeners(base, historyState, currentLocation, replace) {
  let listeners = [];
  let teardowns = [];
  let pauseState = null;
  const popStateHandler = ({ state }) => {
    const to = createCurrentLocation(base, location);
    const from = currentLocation.value;
    const fromState = historyState.value;
    let delta = 0;
    if (state) {
      currentLocation.value = to;
      historyState.value = state;
      if (pauseState && pauseState === from) {
        pauseState = null;
        return;
      }
      delta = fromState ? state.position - fromState.position : 0;
    } else replace(to);
    listeners.forEach((listener2) => {
      listener2(currentLocation.value, from, {
        delta,
        type: NavigationType.pop,
        direction: delta ? delta > 0 ? NavigationDirection.forward : NavigationDirection.back : NavigationDirection.unknown
      });
    });
  };
  function pauseListeners() {
    pauseState = currentLocation.value;
  }
  function listen(callback) {
    listeners.push(callback);
    const teardown = () => {
      const index2 = listeners.indexOf(callback);
      if (index2 > -1) listeners.splice(index2, 1);
    };
    teardowns.push(teardown);
    return teardown;
  }
  function beforeUnloadListener() {
    if (document.visibilityState === "hidden") {
      const { history: history$1 } = window;
      if (!history$1.state) return;
      history$1.replaceState(assign({}, history$1.state, { scroll: computeScrollPosition() }), "");
    }
  }
  function destroy() {
    for (const teardown of teardowns) teardown();
    teardowns = [];
    window.removeEventListener("popstate", popStateHandler);
    window.removeEventListener("pagehide", beforeUnloadListener);
    document.removeEventListener("visibilitychange", beforeUnloadListener);
  }
  window.addEventListener("popstate", popStateHandler);
  window.addEventListener("pagehide", beforeUnloadListener);
  document.addEventListener("visibilitychange", beforeUnloadListener);
  return {
    pauseListeners,
    listen,
    destroy
  };
}
function buildState(back, current, forward, replaced = false, computeScroll = false) {
  return {
    back,
    current,
    forward,
    replaced,
    position: window.history.length,
    scroll: computeScroll ? computeScrollPosition() : null
  };
}
function useHistoryStateNavigation(base) {
  const { history: history$1, location: location$1 } = window;
  const currentLocation = { value: createCurrentLocation(base, location$1) };
  const historyState = { value: history$1.state };
  if (!historyState.value) changeLocation(currentLocation.value, {
    back: null,
    current: currentLocation.value,
    forward: null,
    position: history$1.length - 1,
    replaced: true,
    scroll: null
  }, true);
  function changeLocation(to, state, replace$1) {
    const hashIndex = base.indexOf("#");
    const url = hashIndex > -1 ? (location$1.host && document.querySelector("base") ? base : base.slice(hashIndex)) + to : createBaseLocation() + base + to;
    try {
      history$1[replace$1 ? "replaceState" : "pushState"](state, "", url);
      historyState.value = state;
    } catch (err) {
      console.error(err);
      location$1[replace$1 ? "replace" : "assign"](url);
    }
  }
  function replace(to, data) {
    changeLocation(to, assign({}, history$1.state, buildState(historyState.value.back, to, historyState.value.forward, true), data, { position: historyState.value.position }), true);
    currentLocation.value = to;
  }
  function push(to, data) {
    const currentState = assign({}, historyState.value, history$1.state, {
      forward: to,
      scroll: computeScrollPosition()
    });
    changeLocation(currentState.current, currentState, true);
    changeLocation(to, assign({}, buildState(currentLocation.value, to, null), { position: currentState.position + 1 }, data), false);
    currentLocation.value = to;
  }
  return {
    location: currentLocation,
    state: historyState,
    push,
    replace
  };
}
function createWebHistory(base) {
  base = normalizeBase(base);
  const historyNavigation = useHistoryStateNavigation(base);
  const historyListeners = useHistoryListeners(base, historyNavigation.state, historyNavigation.location, historyNavigation.replace);
  function go(delta, triggerListeners = true) {
    if (!triggerListeners) historyListeners.pauseListeners();
    history.go(delta);
  }
  const routerHistory = assign({
    location: "",
    base,
    go,
    createHref: createHref.bind(null, base)
  }, historyNavigation, historyListeners);
  Object.defineProperty(routerHistory, "location", {
    enumerable: true,
    get: () => historyNavigation.location.value
  });
  Object.defineProperty(routerHistory, "state", {
    enumerable: true,
    get: () => historyNavigation.state.value
  });
  return routerHistory;
}
function createWebHashHistory(base) {
  base = location.host ? base || location.pathname + location.search : "";
  if (!base.includes("#")) base += "#";
  return createWebHistory(base);
}
let TokenType = /* @__PURE__ */ function(TokenType$1) {
  TokenType$1[TokenType$1["Static"] = 0] = "Static";
  TokenType$1[TokenType$1["Param"] = 1] = "Param";
  TokenType$1[TokenType$1["Group"] = 2] = "Group";
  return TokenType$1;
}({});
var TokenizerState = /* @__PURE__ */ function(TokenizerState$1) {
  TokenizerState$1[TokenizerState$1["Static"] = 0] = "Static";
  TokenizerState$1[TokenizerState$1["Param"] = 1] = "Param";
  TokenizerState$1[TokenizerState$1["ParamRegExp"] = 2] = "ParamRegExp";
  TokenizerState$1[TokenizerState$1["ParamRegExpEnd"] = 3] = "ParamRegExpEnd";
  TokenizerState$1[TokenizerState$1["EscapeNext"] = 4] = "EscapeNext";
  return TokenizerState$1;
}(TokenizerState || {});
const ROOT_TOKEN = {
  type: TokenType.Static,
  value: ""
};
const VALID_PARAM_RE = /[a-zA-Z0-9_]/;
function tokenizePath(path) {
  if (!path) return [[]];
  if (path === "/") return [[ROOT_TOKEN]];
  if (!path.startsWith("/")) throw new Error(`Invalid path "${path}"`);
  function crash(message) {
    throw new Error(`ERR (${state})/"${buffer}": ${message}`);
  }
  let state = TokenizerState.Static;
  let previousState = state;
  const tokens = [];
  let segment;
  function finalizeSegment() {
    if (segment) tokens.push(segment);
    segment = [];
  }
  let i = 0;
  let char;
  let buffer = "";
  let customRe = "";
  function consumeBuffer() {
    if (!buffer) return;
    if (state === TokenizerState.Static) segment.push({
      type: TokenType.Static,
      value: buffer
    });
    else if (state === TokenizerState.Param || state === TokenizerState.ParamRegExp || state === TokenizerState.ParamRegExpEnd) {
      if (segment.length > 1 && (char === "*" || char === "+")) crash(`A repeatable param (${buffer}) must be alone in its segment. eg: '/:ids+.`);
      segment.push({
        type: TokenType.Param,
        value: buffer,
        regexp: customRe,
        repeatable: char === "*" || char === "+",
        optional: char === "*" || char === "?"
      });
    } else crash("Invalid state to consume buffer");
    buffer = "";
  }
  function addCharToBuffer() {
    buffer += char;
  }
  while (i < path.length) {
    char = path[i++];
    if (char === "\\" && state !== TokenizerState.ParamRegExp) {
      previousState = state;
      state = TokenizerState.EscapeNext;
      continue;
    }
    switch (state) {
      case TokenizerState.Static:
        if (char === "/") {
          if (buffer) consumeBuffer();
          finalizeSegment();
        } else if (char === ":") {
          consumeBuffer();
          state = TokenizerState.Param;
        } else addCharToBuffer();
        break;
      case TokenizerState.EscapeNext:
        addCharToBuffer();
        state = previousState;
        break;
      case TokenizerState.Param:
        if (char === "(") state = TokenizerState.ParamRegExp;
        else if (VALID_PARAM_RE.test(char)) addCharToBuffer();
        else {
          consumeBuffer();
          state = TokenizerState.Static;
          if (char !== "*" && char !== "?" && char !== "+") i--;
        }
        break;
      case TokenizerState.ParamRegExp:
        if (char === ")") if (customRe[customRe.length - 1] == "\\") customRe = customRe.slice(0, -1) + char;
        else state = TokenizerState.ParamRegExpEnd;
        else customRe += char;
        break;
      case TokenizerState.ParamRegExpEnd:
        consumeBuffer();
        state = TokenizerState.Static;
        if (char !== "*" && char !== "?" && char !== "+") i--;
        customRe = "";
        break;
      default:
        crash("Unknown state");
        break;
    }
  }
  if (state === TokenizerState.ParamRegExp) crash(`Unfinished custom RegExp for param "${buffer}"`);
  consumeBuffer();
  finalizeSegment();
  return tokens;
}
const BASE_PARAM_PATTERN = "[^/]+?";
const BASE_PATH_PARSER_OPTIONS = {
  sensitive: false,
  strict: false,
  start: true,
  end: true
};
var PathScore = /* @__PURE__ */ function(PathScore$1) {
  PathScore$1[PathScore$1["_multiplier"] = 10] = "_multiplier";
  PathScore$1[PathScore$1["Root"] = 90] = "Root";
  PathScore$1[PathScore$1["Segment"] = 40] = "Segment";
  PathScore$1[PathScore$1["SubSegment"] = 30] = "SubSegment";
  PathScore$1[PathScore$1["Static"] = 40] = "Static";
  PathScore$1[PathScore$1["Dynamic"] = 20] = "Dynamic";
  PathScore$1[PathScore$1["BonusCustomRegExp"] = 10] = "BonusCustomRegExp";
  PathScore$1[PathScore$1["BonusWildcard"] = -50] = "BonusWildcard";
  PathScore$1[PathScore$1["BonusRepeatable"] = -20] = "BonusRepeatable";
  PathScore$1[PathScore$1["BonusOptional"] = -8] = "BonusOptional";
  PathScore$1[PathScore$1["BonusStrict"] = 0.7000000000000001] = "BonusStrict";
  PathScore$1[PathScore$1["BonusCaseSensitive"] = 0.25] = "BonusCaseSensitive";
  return PathScore$1;
}(PathScore || {});
const REGEX_CHARS_RE = /[.+*?^${}()[\]/\\]/g;
function tokensToParser(segments, extraOptions) {
  const options = assign({}, BASE_PATH_PARSER_OPTIONS, extraOptions);
  const score = [];
  let pattern = options.start ? "^" : "";
  const keys = [];
  for (const segment of segments) {
    const segmentScores = segment.length ? [] : [PathScore.Root];
    if (options.strict && !segment.length) pattern += "/";
    for (let tokenIndex = 0; tokenIndex < segment.length; tokenIndex++) {
      const token = segment[tokenIndex];
      let subSegmentScore = PathScore.Segment + (options.sensitive ? PathScore.BonusCaseSensitive : 0);
      if (token.type === TokenType.Static) {
        if (!tokenIndex) pattern += "/";
        pattern += token.value.replace(REGEX_CHARS_RE, "\\$&");
        subSegmentScore += PathScore.Static;
      } else if (token.type === TokenType.Param) {
        const { value, repeatable, optional, regexp } = token;
        keys.push({
          name: value,
          repeatable,
          optional
        });
        const re$1 = regexp ? regexp : BASE_PARAM_PATTERN;
        if (re$1 !== BASE_PARAM_PATTERN) {
          subSegmentScore += PathScore.BonusCustomRegExp;
          try {
            `${re$1}`;
          } catch (err) {
            throw new Error(`Invalid custom RegExp for param "${value}" (${re$1}): ` + err.message);
          }
        }
        let subPattern = repeatable ? `((?:${re$1})(?:/(?:${re$1}))*)` : `(${re$1})`;
        if (!tokenIndex) subPattern = optional && segment.length < 2 ? `(?:/${subPattern})` : "/" + subPattern;
        if (optional) subPattern += "?";
        pattern += subPattern;
        subSegmentScore += PathScore.Dynamic;
        if (optional) subSegmentScore += PathScore.BonusOptional;
        if (repeatable) subSegmentScore += PathScore.BonusRepeatable;
        if (re$1 === ".*") subSegmentScore += PathScore.BonusWildcard;
      }
      segmentScores.push(subSegmentScore);
    }
    score.push(segmentScores);
  }
  if (options.strict && options.end) {
    const i = score.length - 1;
    score[i][score[i].length - 1] += PathScore.BonusStrict;
  }
  if (!options.strict) pattern += "/?";
  if (options.end) pattern += "$";
  else if (options.strict && !pattern.endsWith("/")) pattern += "(?:/|$)";
  const re = new RegExp(pattern, options.sensitive ? "" : "i");
  function parse(path) {
    const match = path.match(re);
    const params = {};
    if (!match) return null;
    for (let i = 1; i < match.length; i++) {
      const value = match[i] || "";
      const key = keys[i - 1];
      params[key.name] = value && key.repeatable ? value.split("/") : value;
    }
    return params;
  }
  function stringify(params) {
    let path = "";
    let avoidDuplicatedSlash = false;
    for (const segment of segments) {
      if (!avoidDuplicatedSlash || !path.endsWith("/")) path += "/";
      avoidDuplicatedSlash = false;
      for (const token of segment) if (token.type === TokenType.Static) path += token.value;
      else if (token.type === TokenType.Param) {
        const { value, repeatable, optional } = token;
        const param = value in params ? params[value] : "";
        if (isArray(param) && !repeatable) throw new Error(`Provided param "${value}" is an array but it is not repeatable (* or + modifiers)`);
        const text = isArray(param) ? param.join("/") : param;
        if (!text) if (optional) {
          if (segment.length < 2) if (path.endsWith("/")) path = path.slice(0, -1);
          else avoidDuplicatedSlash = true;
        } else throw new Error(`Missing required param "${value}"`);
        path += text;
      }
    }
    return path || "/";
  }
  return {
    re,
    score,
    keys,
    parse,
    stringify
  };
}
function compareScoreArray(a, b) {
  let i = 0;
  while (i < a.length && i < b.length) {
    const diff = b[i] - a[i];
    if (diff) return diff;
    i++;
  }
  if (a.length < b.length) return a.length === 1 && a[0] === PathScore.Static + PathScore.Segment ? -1 : 1;
  else if (a.length > b.length) return b.length === 1 && b[0] === PathScore.Static + PathScore.Segment ? 1 : -1;
  return 0;
}
function comparePathParserScore(a, b) {
  let i = 0;
  const aScore = a.score;
  const bScore = b.score;
  while (i < aScore.length && i < bScore.length) {
    const comp = compareScoreArray(aScore[i], bScore[i]);
    if (comp) return comp;
    i++;
  }
  if (Math.abs(bScore.length - aScore.length) === 1) {
    if (isLastScoreNegative(aScore)) return 1;
    if (isLastScoreNegative(bScore)) return -1;
  }
  return bScore.length - aScore.length;
}
function isLastScoreNegative(score) {
  const last = score[score.length - 1];
  return score.length > 0 && last[last.length - 1] < 0;
}
const PATH_PARSER_OPTIONS_DEFAULTS = {
  strict: false,
  end: true,
  sensitive: false
};
function createRouteRecordMatcher(record, parent, options) {
  const parser = tokensToParser(tokenizePath(record.path), options);
  const matcher = assign(parser, {
    record,
    parent,
    children: [],
    alias: []
  });
  if (parent) {
    if (!matcher.record.aliasOf === !parent.record.aliasOf) parent.children.push(matcher);
  }
  return matcher;
}
function createRouterMatcher(routes2, globalOptions) {
  const matchers = [];
  const matcherMap = /* @__PURE__ */ new Map();
  globalOptions = mergeOptions(PATH_PARSER_OPTIONS_DEFAULTS, globalOptions);
  function getRecordMatcher(name) {
    return matcherMap.get(name);
  }
  function addRoute(record, parent, originalRecord) {
    const isRootAdd = !originalRecord;
    const mainNormalizedRecord = normalizeRouteRecord(record);
    mainNormalizedRecord.aliasOf = originalRecord && originalRecord.record;
    const options = mergeOptions(globalOptions, record);
    const normalizedRecords = [mainNormalizedRecord];
    if ("alias" in record) {
      const aliases = typeof record.alias === "string" ? [record.alias] : record.alias;
      for (const alias of aliases) normalizedRecords.push(normalizeRouteRecord(assign({}, mainNormalizedRecord, {
        components: originalRecord ? originalRecord.record.components : mainNormalizedRecord.components,
        path: alias,
        aliasOf: originalRecord ? originalRecord.record : mainNormalizedRecord
      })));
    }
    let matcher;
    let originalMatcher;
    for (const normalizedRecord of normalizedRecords) {
      const { path } = normalizedRecord;
      if (parent && path[0] !== "/") {
        const parentPath = parent.record.path;
        const connectingSlash = parentPath[parentPath.length - 1] === "/" ? "" : "/";
        normalizedRecord.path = parent.record.path + (path && connectingSlash + path);
      }
      matcher = createRouteRecordMatcher(normalizedRecord, parent, options);
      if (originalRecord) {
        originalRecord.alias.push(matcher);
      } else {
        originalMatcher = originalMatcher || matcher;
        if (originalMatcher !== matcher) originalMatcher.alias.push(matcher);
        if (isRootAdd && record.name && !isAliasRecord(matcher)) {
          removeRoute(record.name);
        }
      }
      if (isMatchable(matcher)) insertMatcher(matcher);
      if (mainNormalizedRecord.children) {
        const children = mainNormalizedRecord.children;
        for (let i = 0; i < children.length; i++) addRoute(children[i], matcher, originalRecord && originalRecord.children[i]);
      }
      originalRecord = originalRecord || matcher;
    }
    return originalMatcher ? () => {
      removeRoute(originalMatcher);
    } : noop;
  }
  function removeRoute(matcherRef) {
    if (isRouteName(matcherRef)) {
      const matcher = matcherMap.get(matcherRef);
      if (matcher) {
        matcherMap.delete(matcherRef);
        matchers.splice(matchers.indexOf(matcher), 1);
        matcher.children.forEach(removeRoute);
        matcher.alias.forEach(removeRoute);
      }
    } else {
      const index2 = matchers.indexOf(matcherRef);
      if (index2 > -1) {
        matchers.splice(index2, 1);
        if (matcherRef.record.name) matcherMap.delete(matcherRef.record.name);
        matcherRef.children.forEach(removeRoute);
        matcherRef.alias.forEach(removeRoute);
      }
    }
  }
  function getRoutes() {
    return matchers;
  }
  function insertMatcher(matcher) {
    const index2 = findInsertionIndex(matcher, matchers);
    matchers.splice(index2, 0, matcher);
    if (matcher.record.name && !isAliasRecord(matcher)) matcherMap.set(matcher.record.name, matcher);
  }
  function resolve2(location$1, currentLocation) {
    let matcher;
    let params = {};
    let path;
    let name;
    if ("name" in location$1 && location$1.name) {
      matcher = matcherMap.get(location$1.name);
      if (!matcher) throw createRouterError(ErrorTypes.MATCHER_NOT_FOUND, { location: location$1 });
      name = matcher.record.name;
      params = assign(pickParams(currentLocation.params, matcher.keys.filter((k) => !k.optional).concat(matcher.parent ? matcher.parent.keys.filter((k) => k.optional) : []).map((k) => k.name)), location$1.params && pickParams(location$1.params, matcher.keys.map((k) => k.name)));
      path = matcher.stringify(params);
    } else if (location$1.path != null) {
      path = location$1.path;
      matcher = matchers.find((m) => m.re.test(path));
      if (matcher) {
        params = matcher.parse(path);
        name = matcher.record.name;
      }
    } else {
      matcher = currentLocation.name ? matcherMap.get(currentLocation.name) : matchers.find((m) => m.re.test(currentLocation.path));
      if (!matcher) throw createRouterError(ErrorTypes.MATCHER_NOT_FOUND, {
        location: location$1,
        currentLocation
      });
      name = matcher.record.name;
      params = assign({}, currentLocation.params, location$1.params);
      path = matcher.stringify(params);
    }
    const matched = [];
    let parentMatcher = matcher;
    while (parentMatcher) {
      matched.unshift(parentMatcher.record);
      parentMatcher = parentMatcher.parent;
    }
    return {
      name,
      path,
      params,
      matched,
      meta: mergeMetaFields(matched)
    };
  }
  routes2.forEach((route) => addRoute(route));
  function clearRoutes() {
    matchers.length = 0;
    matcherMap.clear();
  }
  return {
    addRoute,
    resolve: resolve2,
    removeRoute,
    clearRoutes,
    getRoutes,
    getRecordMatcher
  };
}
function pickParams(params, keys) {
  const newParams = {};
  for (const key of keys) if (key in params) newParams[key] = params[key];
  return newParams;
}
function normalizeRouteRecord(record) {
  const normalized = {
    path: record.path,
    redirect: record.redirect,
    name: record.name,
    meta: record.meta || {},
    aliasOf: record.aliasOf,
    beforeEnter: record.beforeEnter,
    props: normalizeRecordProps(record),
    children: record.children || [],
    instances: {},
    leaveGuards: /* @__PURE__ */ new Set(),
    updateGuards: /* @__PURE__ */ new Set(),
    enterCallbacks: {},
    components: "components" in record ? record.components || null : record.component && { default: record.component }
  };
  Object.defineProperty(normalized, "mods", { value: {} });
  return normalized;
}
function normalizeRecordProps(record) {
  const propsObject = {};
  const props = record.props || false;
  if ("component" in record) propsObject.default = props;
  else for (const name in record.components) propsObject[name] = typeof props === "object" ? props[name] : props;
  return propsObject;
}
function isAliasRecord(record) {
  while (record) {
    if (record.record.aliasOf) return true;
    record = record.parent;
  }
  return false;
}
function mergeMetaFields(matched) {
  return matched.reduce((meta, record) => assign(meta, record.meta), {});
}
function findInsertionIndex(matcher, matchers) {
  let lower = 0;
  let upper = matchers.length;
  while (lower !== upper) {
    const mid = lower + upper >> 1;
    if (comparePathParserScore(matcher, matchers[mid]) < 0) upper = mid;
    else lower = mid + 1;
  }
  const insertionAncestor = getInsertionAncestor(matcher);
  if (insertionAncestor) {
    upper = matchers.lastIndexOf(insertionAncestor, upper - 1);
  }
  return upper;
}
function getInsertionAncestor(matcher) {
  let ancestor = matcher;
  while (ancestor = ancestor.parent) if (isMatchable(ancestor) && comparePathParserScore(matcher, ancestor) === 0) return ancestor;
}
function isMatchable({ record }) {
  return !!(record.name || record.components && Object.keys(record.components).length || record.redirect);
}
function useLink(props) {
  const router2 = inject(routerKey);
  const currentRoute = inject(routeLocationKey);
  const route = computed(() => {
    const to = unref(props.to);
    return router2.resolve(to);
  });
  const activeRecordIndex = computed(() => {
    const { matched } = route.value;
    const { length } = matched;
    const routeMatched = matched[length - 1];
    const currentMatched = currentRoute.matched;
    if (!routeMatched || !currentMatched.length) return -1;
    const index2 = currentMatched.findIndex(isSameRouteRecord.bind(null, routeMatched));
    if (index2 > -1) return index2;
    const parentRecordPath = getOriginalPath(matched[length - 2]);
    return length > 1 && getOriginalPath(routeMatched) === parentRecordPath && currentMatched[currentMatched.length - 1].path !== parentRecordPath ? currentMatched.findIndex(isSameRouteRecord.bind(null, matched[length - 2])) : index2;
  });
  const isActive = computed(() => activeRecordIndex.value > -1 && includesParams(currentRoute.params, route.value.params));
  const isExactActive = computed(() => activeRecordIndex.value > -1 && activeRecordIndex.value === currentRoute.matched.length - 1 && isSameRouteLocationParams(currentRoute.params, route.value.params));
  function navigate(e = {}) {
    if (guardEvent(e)) {
      const p2 = router2[unref(props.replace) ? "replace" : "push"](unref(props.to)).catch(noop);
      if (props.viewTransition && typeof document !== "undefined" && "startViewTransition" in document) document.startViewTransition(() => p2);
      return p2;
    }
    return Promise.resolve();
  }
  return {
    route,
    href: computed(() => route.value.href),
    isActive,
    isExactActive,
    navigate
  };
}
function preferSingleVNode(vnodes) {
  return vnodes.length === 1 ? vnodes[0] : vnodes;
}
const RouterLinkImpl = /* @__PURE__ */ defineComponent({
  name: "RouterLink",
  compatConfig: { MODE: 3 },
  props: {
    to: {
      type: [String, Object],
      required: true
    },
    replace: Boolean,
    activeClass: String,
    exactActiveClass: String,
    custom: Boolean,
    ariaCurrentValue: {
      type: String,
      default: "page"
    },
    viewTransition: Boolean
  },
  useLink,
  setup(props, { slots }) {
    const link = /* @__PURE__ */ reactive(useLink(props));
    const { options } = inject(routerKey);
    const elClass = computed(() => ({
      [getLinkClass(props.activeClass, options.linkActiveClass, "router-link-active")]: link.isActive,
      [getLinkClass(props.exactActiveClass, options.linkExactActiveClass, "router-link-exact-active")]: link.isExactActive
    }));
    return () => {
      const children = slots.default && preferSingleVNode(slots.default(link));
      return props.custom ? children : h("a", {
        "aria-current": link.isExactActive ? props.ariaCurrentValue : null,
        href: link.href,
        onClick: link.navigate,
        class: elClass.value
      }, children);
    };
  }
});
const RouterLink = RouterLinkImpl;
function guardEvent(e) {
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
  if (e.defaultPrevented) return;
  if (e.button !== void 0 && e.button !== 0) return;
  if (e.currentTarget && e.currentTarget.getAttribute) {
    const target = e.currentTarget.getAttribute("target");
    if (/\b_blank\b/i.test(target)) return;
  }
  if (e.preventDefault) e.preventDefault();
  return true;
}
function includesParams(outer, inner) {
  for (const key in inner) {
    const innerValue = inner[key];
    const outerValue = outer[key];
    if (typeof innerValue === "string") {
      if (innerValue !== outerValue) return false;
    } else if (!isArray(outerValue) || outerValue.length !== innerValue.length || innerValue.some((value, i) => value.valueOf() !== outerValue[i].valueOf())) return false;
  }
  return true;
}
function getOriginalPath(record) {
  return record ? record.aliasOf ? record.aliasOf.path : record.path : "";
}
const getLinkClass = (propClass, globalClass, defaultClass) => propClass != null ? propClass : globalClass != null ? globalClass : defaultClass;
const RouterViewImpl = /* @__PURE__ */ defineComponent({
  name: "RouterView",
  inheritAttrs: false,
  props: {
    name: {
      type: String,
      default: "default"
    },
    route: Object
  },
  compatConfig: { MODE: 3 },
  setup(props, { attrs, slots }) {
    const injectedRoute = inject(routerViewLocationKey);
    const routeToDisplay = computed(() => props.route || injectedRoute.value);
    const injectedDepth = inject(viewDepthKey, 0);
    const depth = computed(() => {
      let initialDepth = unref(injectedDepth);
      const { matched } = routeToDisplay.value;
      let matchedRoute;
      while ((matchedRoute = matched[initialDepth]) && !matchedRoute.components) initialDepth++;
      return initialDepth;
    });
    const matchedRouteRef = computed(() => routeToDisplay.value.matched[depth.value]);
    provide(viewDepthKey, computed(() => depth.value + 1));
    provide(matchedRouteKey, matchedRouteRef);
    provide(routerViewLocationKey, routeToDisplay);
    const viewRef = /* @__PURE__ */ ref();
    watch(() => [
      viewRef.value,
      matchedRouteRef.value,
      props.name
    ], ([instance, to, name], [oldInstance, from, oldName]) => {
      if (to) {
        to.instances[name] = instance;
        if (from && from !== to && instance && instance === oldInstance) {
          if (!to.leaveGuards.size) to.leaveGuards = from.leaveGuards;
          if (!to.updateGuards.size) to.updateGuards = from.updateGuards;
        }
      }
      if (instance && to && (!from || !isSameRouteRecord(to, from) || !oldInstance)) (to.enterCallbacks[name] || []).forEach((callback) => callback(instance));
    }, { flush: "post" });
    return () => {
      const route = routeToDisplay.value;
      const currentName = props.name;
      const matchedRoute = matchedRouteRef.value;
      const ViewComponent = matchedRoute && matchedRoute.components[currentName];
      if (!ViewComponent) return normalizeSlot(slots.default, {
        Component: ViewComponent,
        route
      });
      const routePropsOption = matchedRoute.props[currentName];
      const routeProps = routePropsOption ? routePropsOption === true ? route.params : typeof routePropsOption === "function" ? routePropsOption(route) : routePropsOption : null;
      const onVnodeUnmounted = (vnode) => {
        if (vnode.component.isUnmounted) matchedRoute.instances[currentName] = null;
      };
      const component = h(ViewComponent, assign({}, routeProps, attrs, {
        onVnodeUnmounted,
        ref: viewRef
      }));
      return normalizeSlot(slots.default, {
        Component: component,
        route
      }) || component;
    };
  }
});
function normalizeSlot(slot, data) {
  if (!slot) return null;
  const slotContent = slot(data);
  return slotContent.length === 1 ? slotContent[0] : slotContent;
}
const RouterView = RouterViewImpl;
function createRouter(options) {
  const matcher = createRouterMatcher(options.routes, options);
  const parseQuery$1 = options.parseQuery || parseQuery;
  const stringifyQuery$1 = options.stringifyQuery || stringifyQuery;
  const routerHistory = options.history;
  const beforeGuards = useCallbacks();
  const beforeResolveGuards = useCallbacks();
  const afterGuards = useCallbacks();
  const currentRoute = /* @__PURE__ */ shallowRef(START_LOCATION_NORMALIZED);
  let pendingLocation = START_LOCATION_NORMALIZED;
  if (isBrowser && options.scrollBehavior && "scrollRestoration" in history) history.scrollRestoration = "manual";
  const normalizeParams = applyToParams.bind(null, (paramValue) => "" + paramValue);
  const encodeParams = applyToParams.bind(null, encodeParam);
  const decodeParams = applyToParams.bind(null, decode);
  function addRoute(parentOrRoute, route) {
    let parent;
    let record;
    if (isRouteName(parentOrRoute)) {
      parent = matcher.getRecordMatcher(parentOrRoute);
      record = route;
    } else record = parentOrRoute;
    return matcher.addRoute(record, parent);
  }
  function removeRoute(name) {
    const recordMatcher = matcher.getRecordMatcher(name);
    if (recordMatcher) matcher.removeRoute(recordMatcher);
  }
  function getRoutes() {
    return matcher.getRoutes().map((routeMatcher) => routeMatcher.record);
  }
  function hasRoute(name) {
    return !!matcher.getRecordMatcher(name);
  }
  function resolve2(rawLocation, currentLocation) {
    currentLocation = assign({}, currentLocation || currentRoute.value);
    if (typeof rawLocation === "string") {
      const locationNormalized = parseURL(parseQuery$1, rawLocation, currentLocation.path);
      const matchedRoute$1 = matcher.resolve({ path: locationNormalized.path }, currentLocation);
      const href$1 = routerHistory.createHref(locationNormalized.fullPath);
      return assign(locationNormalized, matchedRoute$1, {
        params: decodeParams(matchedRoute$1.params),
        hash: decode(locationNormalized.hash),
        redirectedFrom: void 0,
        href: href$1
      });
    }
    let matcherLocation;
    if (rawLocation.path != null) {
      matcherLocation = assign({}, rawLocation, { path: parseURL(parseQuery$1, rawLocation.path, currentLocation.path).path });
    } else {
      const targetParams = assign({}, rawLocation.params);
      for (const key in targetParams) if (targetParams[key] == null) delete targetParams[key];
      matcherLocation = assign({}, rawLocation, { params: encodeParams(targetParams) });
      currentLocation.params = encodeParams(currentLocation.params);
    }
    const matchedRoute = matcher.resolve(matcherLocation, currentLocation);
    const hash = rawLocation.hash || "";
    matchedRoute.params = normalizeParams(decodeParams(matchedRoute.params));
    const fullPath = stringifyURL(stringifyQuery$1, assign({}, rawLocation, {
      hash: encodeHash(hash),
      path: matchedRoute.path
    }));
    const href = routerHistory.createHref(fullPath);
    return assign({
      fullPath,
      hash,
      query: stringifyQuery$1 === stringifyQuery ? normalizeQuery(rawLocation.query) : rawLocation.query || {}
    }, matchedRoute, {
      redirectedFrom: void 0,
      href
    });
  }
  function locationAsObject(to) {
    return typeof to === "string" ? parseURL(parseQuery$1, to, currentRoute.value.path) : assign({}, to);
  }
  function checkCanceledNavigation(to, from) {
    if (pendingLocation !== to) return createRouterError(ErrorTypes.NAVIGATION_CANCELLED, {
      from,
      to
    });
  }
  function push(to) {
    return pushWithRedirect(to);
  }
  function replace(to) {
    return push(assign(locationAsObject(to), { replace: true }));
  }
  function handleRedirectRecord(to, from) {
    const lastMatched = to.matched[to.matched.length - 1];
    if (lastMatched && lastMatched.redirect) {
      const { redirect } = lastMatched;
      let newTargetLocation = typeof redirect === "function" ? redirect(to, from) : redirect;
      if (typeof newTargetLocation === "string") {
        newTargetLocation = newTargetLocation.includes("?") || newTargetLocation.includes("#") ? newTargetLocation = locationAsObject(newTargetLocation) : { path: newTargetLocation };
        newTargetLocation.params = {};
      }
      return assign({
        query: to.query,
        hash: to.hash,
        params: newTargetLocation.path != null ? {} : to.params
      }, newTargetLocation);
    }
  }
  function pushWithRedirect(to, redirectedFrom) {
    const targetLocation = pendingLocation = resolve2(to);
    const from = currentRoute.value;
    const data = to.state;
    const force = to.force;
    const replace$1 = to.replace === true;
    const shouldRedirect = handleRedirectRecord(targetLocation, from);
    if (shouldRedirect) return pushWithRedirect(assign(locationAsObject(shouldRedirect), {
      state: typeof shouldRedirect === "object" ? assign({}, data, shouldRedirect.state) : data,
      force,
      replace: replace$1
    }), redirectedFrom || targetLocation);
    const toLocation = targetLocation;
    toLocation.redirectedFrom = redirectedFrom;
    let failure;
    if (!force && isSameRouteLocation(stringifyQuery$1, from, targetLocation)) {
      failure = createRouterError(ErrorTypes.NAVIGATION_DUPLICATED, {
        to: toLocation,
        from
      });
      handleScroll(from, from, true, false);
    }
    return (failure ? Promise.resolve(failure) : navigate(toLocation, from)).catch((error) => isNavigationFailure(error) ? isNavigationFailure(error, ErrorTypes.NAVIGATION_GUARD_REDIRECT) ? error : markAsReady(error) : triggerError(error, toLocation, from)).then((failure$1) => {
      if (failure$1) {
        if (isNavigationFailure(failure$1, ErrorTypes.NAVIGATION_GUARD_REDIRECT)) {
          return pushWithRedirect(assign({ replace: replace$1 }, locationAsObject(failure$1.to), {
            state: typeof failure$1.to === "object" ? assign({}, data, failure$1.to.state) : data,
            force
          }), redirectedFrom || toLocation);
        }
      } else failure$1 = finalizeNavigation(toLocation, from, true, replace$1, data);
      triggerAfterEach(toLocation, from, failure$1);
      return failure$1;
    });
  }
  function checkCanceledNavigationAndReject(to, from) {
    const error = checkCanceledNavigation(to, from);
    return error ? Promise.reject(error) : Promise.resolve();
  }
  function runWithContext(fn) {
    const app2 = installedApps.values().next().value;
    return app2 && typeof app2.runWithContext === "function" ? app2.runWithContext(fn) : fn();
  }
  function navigate(to, from) {
    let guards;
    const [leavingRecords, updatingRecords, enteringRecords] = extractChangingRecords(to, from);
    guards = extractComponentsGuards(leavingRecords.reverse(), "beforeRouteLeave", to, from);
    for (const record of leavingRecords) record.leaveGuards.forEach((guard) => {
      guards.push(guardToPromiseFn(guard, to, from));
    });
    const canceledNavigationCheck = checkCanceledNavigationAndReject.bind(null, to, from);
    guards.push(canceledNavigationCheck);
    return runGuardQueue(guards).then(() => {
      guards = [];
      for (const guard of beforeGuards.list()) guards.push(guardToPromiseFn(guard, to, from));
      guards.push(canceledNavigationCheck);
      return runGuardQueue(guards);
    }).then(() => {
      guards = extractComponentsGuards(updatingRecords, "beforeRouteUpdate", to, from);
      for (const record of updatingRecords) record.updateGuards.forEach((guard) => {
        guards.push(guardToPromiseFn(guard, to, from));
      });
      guards.push(canceledNavigationCheck);
      return runGuardQueue(guards);
    }).then(() => {
      guards = [];
      for (const record of enteringRecords) if (record.beforeEnter) if (isArray(record.beforeEnter)) for (const beforeEnter of record.beforeEnter) guards.push(guardToPromiseFn(beforeEnter, to, from));
      else guards.push(guardToPromiseFn(record.beforeEnter, to, from));
      guards.push(canceledNavigationCheck);
      return runGuardQueue(guards);
    }).then(() => {
      to.matched.forEach((record) => record.enterCallbacks = {});
      guards = extractComponentsGuards(enteringRecords, "beforeRouteEnter", to, from, runWithContext);
      guards.push(canceledNavigationCheck);
      return runGuardQueue(guards);
    }).then(() => {
      guards = [];
      for (const guard of beforeResolveGuards.list()) guards.push(guardToPromiseFn(guard, to, from));
      guards.push(canceledNavigationCheck);
      return runGuardQueue(guards);
    }).catch((err) => isNavigationFailure(err, ErrorTypes.NAVIGATION_CANCELLED) ? err : Promise.reject(err));
  }
  function triggerAfterEach(to, from, failure) {
    afterGuards.list().forEach((guard) => runWithContext(() => guard(to, from, failure)));
  }
  function finalizeNavigation(toLocation, from, isPush, replace$1, data) {
    const error = checkCanceledNavigation(toLocation, from);
    if (error) return error;
    const isFirstNavigation = from === START_LOCATION_NORMALIZED;
    const state = !isBrowser ? {} : history.state;
    if (isPush) if (replace$1 || isFirstNavigation) routerHistory.replace(toLocation.fullPath, assign({ scroll: isFirstNavigation && state && state.scroll }, data));
    else routerHistory.push(toLocation.fullPath, data);
    currentRoute.value = toLocation;
    handleScroll(toLocation, from, isPush, isFirstNavigation);
    markAsReady();
  }
  let removeHistoryListener;
  function setupListeners() {
    if (removeHistoryListener) return;
    removeHistoryListener = routerHistory.listen((to, _from, info) => {
      if (!router2.listening) return;
      const toLocation = resolve2(to);
      const shouldRedirect = handleRedirectRecord(toLocation, router2.currentRoute.value);
      if (shouldRedirect) {
        pushWithRedirect(assign(shouldRedirect, {
          replace: true,
          force: true
        }), toLocation).catch(noop);
        return;
      }
      pendingLocation = toLocation;
      const from = currentRoute.value;
      if (isBrowser) saveScrollPosition(getScrollKey(from.fullPath, info.delta), computeScrollPosition());
      navigate(toLocation, from).catch((error) => {
        if (isNavigationFailure(error, ErrorTypes.NAVIGATION_ABORTED | ErrorTypes.NAVIGATION_CANCELLED)) return error;
        if (isNavigationFailure(error, ErrorTypes.NAVIGATION_GUARD_REDIRECT)) {
          pushWithRedirect(assign(locationAsObject(error.to), { force: true }), toLocation).then((failure) => {
            if (isNavigationFailure(failure, ErrorTypes.NAVIGATION_ABORTED | ErrorTypes.NAVIGATION_DUPLICATED) && !info.delta && info.type === NavigationType.pop) routerHistory.go(-1, false);
          }).catch(noop);
          return Promise.reject();
        }
        if (info.delta) routerHistory.go(-info.delta, false);
        return triggerError(error, toLocation, from);
      }).then((failure) => {
        failure = failure || finalizeNavigation(toLocation, from, false);
        if (failure) {
          if (info.delta && !isNavigationFailure(failure, ErrorTypes.NAVIGATION_CANCELLED)) routerHistory.go(-info.delta, false);
          else if (info.type === NavigationType.pop && isNavigationFailure(failure, ErrorTypes.NAVIGATION_ABORTED | ErrorTypes.NAVIGATION_DUPLICATED)) routerHistory.go(-1, false);
        }
        triggerAfterEach(toLocation, from, failure);
      }).catch(noop);
    });
  }
  let readyHandlers = useCallbacks();
  let errorListeners = useCallbacks();
  let ready;
  function triggerError(error, to, from) {
    markAsReady(error);
    const list = errorListeners.list();
    if (list.length) list.forEach((handler) => handler(error, to, from));
    else {
      console.error(error);
    }
    return Promise.reject(error);
  }
  function isReady() {
    if (ready && currentRoute.value !== START_LOCATION_NORMALIZED) return Promise.resolve();
    return new Promise((resolve$1, reject) => {
      readyHandlers.add([resolve$1, reject]);
    });
  }
  function markAsReady(err) {
    if (!ready) {
      ready = !err;
      setupListeners();
      readyHandlers.list().forEach(([resolve$1, reject]) => err ? reject(err) : resolve$1());
      readyHandlers.reset();
    }
    return err;
  }
  function handleScroll(to, from, isPush, isFirstNavigation) {
    const { scrollBehavior } = options;
    if (!isBrowser || !scrollBehavior) return Promise.resolve();
    const scrollPosition = !isPush && getSavedScrollPosition(getScrollKey(to.fullPath, 0)) || (isFirstNavigation || !isPush) && history.state && history.state.scroll || null;
    return nextTick().then(() => scrollBehavior(to, from, scrollPosition)).then((position) => position && scrollToPosition(position)).catch((err) => triggerError(err, to, from));
  }
  const go = (delta) => routerHistory.go(delta);
  let started;
  const installedApps = /* @__PURE__ */ new Set();
  const router2 = {
    currentRoute,
    listening: true,
    addRoute,
    removeRoute,
    clearRoutes: matcher.clearRoutes,
    hasRoute,
    getRoutes,
    resolve: resolve2,
    options,
    push,
    replace,
    go,
    back: () => go(-1),
    forward: () => go(1),
    beforeEach: beforeGuards.add,
    beforeResolve: beforeResolveGuards.add,
    afterEach: afterGuards.add,
    onError: errorListeners.add,
    isReady,
    install(app2) {
      app2.component("RouterLink", RouterLink);
      app2.component("RouterView", RouterView);
      app2.config.globalProperties.$router = router2;
      Object.defineProperty(app2.config.globalProperties, "$route", {
        enumerable: true,
        get: () => unref(currentRoute)
      });
      if (isBrowser && !started && currentRoute.value === START_LOCATION_NORMALIZED) {
        started = true;
        push(routerHistory.location).catch((err) => {
        });
      }
      const reactiveRoute = {};
      for (const key in START_LOCATION_NORMALIZED) Object.defineProperty(reactiveRoute, key, {
        get: () => currentRoute.value[key],
        enumerable: true
      });
      app2.provide(routerKey, router2);
      app2.provide(routeLocationKey, /* @__PURE__ */ shallowReactive(reactiveRoute));
      app2.provide(routerViewLocationKey, currentRoute);
      const unmountApp = app2.unmount;
      installedApps.add(app2);
      app2.unmount = function() {
        installedApps.delete(app2);
        if (installedApps.size < 1) {
          pendingLocation = START_LOCATION_NORMALIZED;
          removeHistoryListener && removeHistoryListener();
          removeHistoryListener = null;
          currentRoute.value = START_LOCATION_NORMALIZED;
          started = false;
          ready = false;
        }
        unmountApp();
      };
    }
  };
  function runGuardQueue(guards) {
    return guards.reduce((promise, guard) => promise.then(() => runWithContext(guard)), Promise.resolve());
  }
  return router2;
}
function useRouter() {
  return inject(routerKey);
}
function useRoute(_name) {
  return inject(routeLocationKey);
}
const useAuthStore = /* @__PURE__ */ defineStore("auth", {
  // ─── 状态 ───
  state: () => ({
    token: sessionStorage.getItem("token") || "",
    /** 服务器基础地址 (持久化存储) */
    apiBase: localStorage.getItem("api_base") || "https://127.0.0.1:8080",
    user: null
  }),
  // ─── 计算属性 ───
  getters: {
    isLoggedIn: (state) => !!state.token
  },
  // ─── 方法 ───
  actions: {
    /**
     * 设置服务器地址
     * @param {string} url 
     */
    setApiBase(url) {
      if (!url) return;
      let formattedUrl = url.trim();
      if (!formattedUrl.startsWith("http")) {
        formattedUrl = `https://${formattedUrl}`;
      }
      formattedUrl = formattedUrl.replace(/\/+$/, "");
      this.apiBase = formattedUrl;
      localStorage.setItem("api_base", formattedUrl);
    },
    /**
     * 设置登录状态
     */
    setToken(token) {
      this.token = token;
      sessionStorage.setItem("token", token);
    },
    /**
     * 退出登录
     */
    logout() {
      this.token = "";
      this.user = null;
      sessionStorage.removeItem("token");
    }
  }
});
const auth = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  useAuthStore
}, Symbol.toStringTag, { value: "Module" }));
const scriptRel = "modulepreload";
const assetsURL = function(dep) {
  return "/" + dep;
};
const seen = {};
const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (deps && deps.length > 0) {
    document.getElementsByTagName("link");
    const cspNonceMeta = document.querySelector(
      "meta[property=csp-nonce]"
    );
    const cspNonce = (cspNonceMeta == null ? void 0 : cspNonceMeta.nonce) || (cspNonceMeta == null ? void 0 : cspNonceMeta.getAttribute("nonce"));
    promise = Promise.allSettled(
      deps.map((dep) => {
        dep = assetsURL(dep);
        if (dep in seen) return;
        seen[dep] = true;
        const isCss = dep.endsWith(".css");
        const cssSelector = isCss ? '[rel="stylesheet"]' : "";
        if (document.querySelector(`link[href="${dep}"]${cssSelector}`)) {
          return;
        }
        const link = document.createElement("link");
        link.rel = isCss ? "stylesheet" : scriptRel;
        if (!isCss) {
          link.as = "script";
        }
        link.crossOrigin = "";
        link.href = dep;
        if (cspNonce) {
          link.setAttribute("nonce", cspNonce);
        }
        document.head.appendChild(link);
        if (isCss) {
          return new Promise((res, rej) => {
            link.addEventListener("load", res);
            link.addEventListener(
              "error",
              () => rej(new Error(`Unable to preload CSS for ${dep}`))
            );
          });
        }
      })
    );
  }
  function handlePreloadError(err) {
    const e = new Event("vite:preloadError", {
      cancelable: true
    });
    e.payload = err;
    window.dispatchEvent(e);
    if (!e.defaultPrevented) {
      throw err;
    }
  }
  return promise.then((res) => {
    for (const item of res || []) {
      if (item.status !== "rejected") continue;
      handlePreloadError(item.reason);
    }
    return baseModule().catch(handlePreloadError);
  });
};
const urlAlphabet = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
function nanoid(size = 21) {
  let id = "";
  let i = size | 0;
  while (i--) {
    id += urlAlphabet[Math.random() * 64 | 0];
  }
  return id;
}
const runtimeURL = window.location.origin + "/wails/runtime";
const objectNames = Object.freeze({
  Call: 0,
  Clipboard: 1,
  Application: 2,
  Events: 3,
  ContextMenu: 4,
  Dialog: 5,
  Window: 6,
  Screens: 7,
  System: 8,
  Browser: 9,
  CancelCall: 10,
  IOS: 11
});
let clientId = nanoid();
function newRuntimeCaller(object, windowName = "") {
  return function(method, args = null) {
    return runtimeCallWithID(object, method, windowName, args);
  };
}
async function runtimeCallWithID(objectID, method, windowName, args) {
  var _a2, _b;
  let url = new URL(runtimeURL);
  let body = {
    object: objectID,
    method
  };
  if (args !== null && args !== void 0) {
    body.args = args;
  }
  let headers = {
    ["x-wails-client-id"]: clientId,
    ["Content-Type"]: "application/json"
  };
  if (windowName) {
    headers["x-wails-window-name"] = windowName;
  }
  let response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  if (((_b = (_a2 = response.headers.get("Content-Type")) === null || _a2 === void 0 ? void 0 : _a2.indexOf("application/json")) !== null && _b !== void 0 ? _b : -1) !== -1) {
    return response.json();
  } else {
    return response.text();
  }
}
newRuntimeCaller(objectNames.System);
const _invoke = function() {
  var _a2, _b, _c, _d, _e, _f;
  try {
    if ((_b = (_a2 = window.chrome) === null || _a2 === void 0 ? void 0 : _a2.webview) === null || _b === void 0 ? void 0 : _b.postMessage) {
      return window.chrome.webview.postMessage.bind(window.chrome.webview);
    } else if ((_e = (_d = (_c = window.webkit) === null || _c === void 0 ? void 0 : _c.messageHandlers) === null || _d === void 0 ? void 0 : _d["external"]) === null || _e === void 0 ? void 0 : _e.postMessage) {
      return window.webkit.messageHandlers["external"].postMessage.bind(window.webkit.messageHandlers["external"]);
    } else if ((_f = window.wails) === null || _f === void 0 ? void 0 : _f.invoke) {
      return (msg) => window.wails.invoke(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
  } catch (e) {
  }
  console.warn("\n%c⚠️ Browser Environment Detected %c\n\n%cOnly UI previews are available in the browser. For full functionality, please run the application in desktop mode.\nMore information at: https://v3.wails.io/learn/build/#using-a-browser-for-development\n", "background: #ffffff; color: #000000; font-weight: bold; padding: 4px 8px; border-radius: 4px; border: 2px solid #000000;", "background: transparent;", "color: #ffffff; font-style: italic; font-weight: bold;");
  return null;
}();
function invoke(msg) {
  _invoke === null || _invoke === void 0 ? void 0 : _invoke(msg);
}
function IsWindows() {
  var _a2, _b;
  return ((_b = (_a2 = window._wails) === null || _a2 === void 0 ? void 0 : _a2.environment) === null || _b === void 0 ? void 0 : _b.OS) === "windows";
}
function IsDebug() {
  var _a2, _b;
  return Boolean((_b = (_a2 = window._wails) === null || _a2 === void 0 ? void 0 : _a2.environment) === null || _b === void 0 ? void 0 : _b.Debug);
}
function canTrackButtons() {
  return new MouseEvent("mousedown").buttons === 0;
}
function eventTarget(event) {
  var _a2;
  if (event.target instanceof HTMLElement) {
    return event.target;
  } else if (!(event.target instanceof HTMLElement) && event.target instanceof Node) {
    return (_a2 = event.target.parentElement) !== null && _a2 !== void 0 ? _a2 : document.body;
  } else {
    return document.body;
  }
}
document.addEventListener("DOMContentLoaded", () => {
});
window.addEventListener("contextmenu", contextMenuHandler);
const call$3 = newRuntimeCaller(objectNames.ContextMenu);
const ContextMenuOpen = 0;
function openContextMenu(id, x, y, data) {
  void call$3(ContextMenuOpen, { id, x, y, data });
}
function contextMenuHandler(event) {
  const target = eventTarget(event);
  const customContextMenu = window.getComputedStyle(target).getPropertyValue("--custom-contextmenu").trim();
  if (customContextMenu) {
    event.preventDefault();
    const data = window.getComputedStyle(target).getPropertyValue("--custom-contextmenu-data");
    openContextMenu(customContextMenu, event.clientX, event.clientY, data);
  } else {
    processDefaultContextMenu(event, target);
  }
}
function processDefaultContextMenu(event, target) {
  if (IsDebug()) {
    return;
  }
  switch (window.getComputedStyle(target).getPropertyValue("--default-contextmenu").trim()) {
    case "show":
      return;
    case "hide":
      event.preventDefault();
      return;
  }
  if (target.isContentEditable) {
    return;
  }
  const selection = window.getSelection();
  const hasSelection = selection && selection.toString().length > 0;
  if (hasSelection) {
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      const rects = range.getClientRects();
      for (let j = 0; j < rects.length; j++) {
        const rect = rects[j];
        if (document.elementFromPoint(rect.left, rect.top) === target) {
          return;
        }
      }
    }
  }
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    if (hasSelection || !target.readOnly && !target.disabled) {
      return;
    }
  }
  event.preventDefault();
}
function GetFlag(key) {
  try {
    return window._wails.flags[key];
  } catch (e) {
    throw new Error("Unable to retrieve flag '" + key + "': " + e, { cause: e });
  }
}
let canDrag = false;
let dragging = false;
let resizable = false;
let canResize = false;
let resizing = false;
let resizeEdge = "";
let defaultCursor = "auto";
let buttons = 0;
const buttonsTracked = canTrackButtons();
window._wails = window._wails || {};
window._wails.setResizable = (value) => {
  resizable = value;
  if (!resizable) {
    canResize = resizing = false;
    setResize();
  }
};
let dragInitDone = false;
function isMobile() {
  var _a2, _b;
  const os = (_b = (_a2 = window._wails) === null || _a2 === void 0 ? void 0 : _a2.environment) === null || _b === void 0 ? void 0 : _b.OS;
  if (os === "ios" || os === "android")
    return true;
  const ua = navigator.userAgent || navigator.vendor || window.opera || "";
  return /android|iphone|ipad|ipod|iemobile|wpdesktop/i.test(ua);
}
function tryInitDragHandlers() {
  if (dragInitDone)
    return;
  if (isMobile())
    return;
  window.addEventListener("mousedown", update, { capture: true });
  window.addEventListener("mousemove", update, { capture: true });
  window.addEventListener("mouseup", update, { capture: true });
  for (const ev of ["click", "contextmenu", "dblclick"]) {
    window.addEventListener(ev, suppressEvent, { capture: true });
  }
  dragInitDone = true;
}
tryInitDragHandlers();
document.addEventListener("DOMContentLoaded", tryInitDragHandlers, { once: true });
let dragEnvPolls = 0;
const dragEnvPoll = window.setInterval(() => {
  if (dragInitDone) {
    window.clearInterval(dragEnvPoll);
    return;
  }
  tryInitDragHandlers();
  if (++dragEnvPolls > 100) {
    window.clearInterval(dragEnvPoll);
  }
}, 50);
function suppressEvent(event) {
  if (dragging || resizing) {
    event.stopImmediatePropagation();
    event.stopPropagation();
    event.preventDefault();
  }
}
const MouseDown = 0;
const MouseUp = 1;
const MouseMove = 2;
function update(event) {
  let eventType, eventButtons = event.buttons;
  switch (event.type) {
    case "mousedown":
      eventType = MouseDown;
      if (!buttonsTracked) {
        eventButtons = buttons | 1 << event.button;
      }
      break;
    case "mouseup":
      eventType = MouseUp;
      if (!buttonsTracked) {
        eventButtons = buttons & ~(1 << event.button);
      }
      break;
    default:
      eventType = MouseMove;
      if (!buttonsTracked) {
        eventButtons = buttons;
      }
      break;
  }
  let released = buttons & ~eventButtons;
  let pressed = eventButtons & ~buttons;
  buttons = eventButtons;
  if (eventType === MouseDown && !(pressed & event.button)) {
    released |= 1 << event.button;
    pressed |= 1 << event.button;
  }
  if (eventType !== MouseMove && resizing || dragging && (eventType === MouseDown || event.button !== 0)) {
    event.stopImmediatePropagation();
    event.stopPropagation();
    event.preventDefault();
  }
  if (released & 1) {
    primaryUp();
  }
  if (pressed & 1) {
    primaryDown(event);
  }
  if (eventType === MouseMove) {
    onMouseMove(event);
  }
}
function primaryDown(event) {
  canDrag = false;
  canResize = false;
  if (!IsWindows()) {
    if (event.type === "mousedown" && event.button === 0 && event.detail !== 1) {
      return;
    }
  }
  if (resizeEdge) {
    canResize = true;
    return;
  }
  const target = eventTarget(event);
  const style = window.getComputedStyle(target);
  canDrag = style.getPropertyValue("--wails-draggable").trim() === "drag" && (event.offsetX - parseFloat(style.paddingLeft) < target.clientWidth && event.offsetY - parseFloat(style.paddingTop) < target.clientHeight);
}
function primaryUp(event) {
  canDrag = false;
  dragging = false;
  canResize = false;
  resizing = false;
}
const cursorForEdge = Object.freeze({
  "se-resize": "nwse-resize",
  "sw-resize": "nesw-resize",
  "nw-resize": "nwse-resize",
  "ne-resize": "nesw-resize",
  "w-resize": "ew-resize",
  "n-resize": "ns-resize",
  "s-resize": "ns-resize",
  "e-resize": "ew-resize"
});
function setResize(edge) {
  if (edge) {
    if (!resizeEdge) {
      defaultCursor = document.body.style.cursor;
    }
    document.body.style.cursor = cursorForEdge[edge];
  } else if (!edge && resizeEdge) {
    document.body.style.cursor = defaultCursor;
  }
  resizeEdge = edge || "";
}
function onMouseMove(event) {
  if (canResize && resizeEdge) {
    resizing = true;
    invoke("wails:resize:" + resizeEdge);
  } else if (canDrag) {
    dragging = true;
    invoke("wails:drag");
  }
  if (dragging || resizing) {
    canDrag = canResize = false;
    return;
  }
  if (!resizable || !IsWindows()) {
    if (resizeEdge) {
      setResize();
    }
    return;
  }
  const resizeHandleHeight = GetFlag("system.resizeHandleHeight") || 5;
  const resizeHandleWidth = GetFlag("system.resizeHandleWidth") || 5;
  const cornerExtra = GetFlag("resizeCornerExtra") || 10;
  const rightBorder = window.outerWidth - event.clientX < resizeHandleWidth;
  const leftBorder = event.clientX < resizeHandleWidth;
  const topBorder = event.clientY < resizeHandleHeight;
  const bottomBorder = window.outerHeight - event.clientY < resizeHandleHeight;
  const rightCorner = window.outerWidth - event.clientX < resizeHandleWidth + cornerExtra;
  const leftCorner = event.clientX < resizeHandleWidth + cornerExtra;
  const topCorner = event.clientY < resizeHandleHeight + cornerExtra;
  const bottomCorner = window.outerHeight - event.clientY < resizeHandleHeight + cornerExtra;
  if (!leftCorner && !topCorner && !bottomCorner && !rightCorner) {
    setResize();
  } else if (rightCorner && bottomCorner)
    setResize("se-resize");
  else if (leftCorner && bottomCorner)
    setResize("sw-resize");
  else if (leftCorner && topCorner)
    setResize("nw-resize");
  else if (topCorner && rightCorner)
    setResize("ne-resize");
  else if (leftBorder)
    setResize("w-resize");
  else if (topBorder)
    setResize("n-resize");
  else if (bottomBorder)
    setResize("s-resize");
  else if (rightBorder)
    setResize("e-resize");
  else
    setResize();
}
const call$2 = newRuntimeCaller(objectNames.Browser);
const BrowserOpenURL = 0;
function OpenURL(url) {
  return call$2(BrowserOpenURL, { url: url.toString() });
}
const Browser = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  OpenURL
}, Symbol.toStringTag, { value: "Module" }));
var fnToStr = Function.prototype.toString;
var reflectApply = typeof Reflect === "object" && Reflect !== null && Reflect.apply;
var badArrayLike;
var isCallableMarker;
if (typeof reflectApply === "function" && typeof Object.defineProperty === "function") {
  try {
    badArrayLike = Object.defineProperty({}, "length", {
      get: function() {
        throw isCallableMarker;
      }
    });
    isCallableMarker = {};
    reflectApply(function() {
      throw 42;
    }, null, badArrayLike);
  } catch (_) {
    if (_ !== isCallableMarker) {
      reflectApply = null;
    }
  }
} else {
  reflectApply = null;
}
var constructorRegex = /^\s*class\b/;
var isES6ClassFn = function isES6ClassFunction(value) {
  try {
    var fnStr = fnToStr.call(value);
    return constructorRegex.test(fnStr);
  } catch (e) {
    return false;
  }
};
var tryFunctionObject = function tryFunctionToStr(value) {
  try {
    if (isES6ClassFn(value)) {
      return false;
    }
    fnToStr.call(value);
    return true;
  } catch (e) {
    return false;
  }
};
var toStr = Object.prototype.toString;
var objectClass = "[object Object]";
var fnClass = "[object Function]";
var genClass = "[object GeneratorFunction]";
var ddaClass = "[object HTMLAllCollection]";
var ddaClass2 = "[object HTML document.all class]";
var ddaClass3 = "[object HTMLCollection]";
var hasToStringTag = typeof Symbol === "function" && !!Symbol.toStringTag;
var isIE68 = !(0 in [,]);
var isDDA = function isDocumentDotAll() {
  return false;
};
if (typeof document === "object") {
  var all = document.all;
  if (toStr.call(all) === toStr.call(document.all)) {
    isDDA = function isDocumentDotAll2(value) {
      if ((isIE68 || !value) && (typeof value === "undefined" || typeof value === "object")) {
        try {
          var str = toStr.call(value);
          return (str === ddaClass || str === ddaClass2 || str === ddaClass3 || str === objectClass) && value("") == null;
        } catch (e) {
        }
      }
      return false;
    };
  }
}
function isCallableRefApply(value) {
  if (isDDA(value)) {
    return true;
  }
  if (!value) {
    return false;
  }
  if (typeof value !== "function" && typeof value !== "object") {
    return false;
  }
  try {
    reflectApply(value, null, badArrayLike);
  } catch (e) {
    if (e !== isCallableMarker) {
      return false;
    }
  }
  return !isES6ClassFn(value) && tryFunctionObject(value);
}
function isCallableNoRefApply(value) {
  if (isDDA(value)) {
    return true;
  }
  if (!value) {
    return false;
  }
  if (typeof value !== "function" && typeof value !== "object") {
    return false;
  }
  if (hasToStringTag) {
    return tryFunctionObject(value);
  }
  if (isES6ClassFn(value)) {
    return false;
  }
  var strClass = toStr.call(value);
  if (strClass !== fnClass && strClass !== genClass && !/^\[object HTML/.test(strClass)) {
    return false;
  }
  return tryFunctionObject(value);
}
const isCallable = reflectApply ? isCallableRefApply : isCallableNoRefApply;
var _a;
class CancelError extends Error {
  /**
   * Constructs a new `CancelError` instance.
   * @param message - The error message.
   * @param options - Options to be forwarded to the Error constructor.
   */
  constructor(message, options) {
    super(message, options);
    this.name = "CancelError";
  }
}
class CancelledRejectionError extends Error {
  /**
   * Constructs a new `CancelledRejectionError` instance.
   * @param promise - The promise that caused the error originally.
   * @param reason - The rejection reason.
   * @param info - An optional informative message specifying the circumstances in which the error was thrown.
   *               Defaults to the string `"Unhandled rejection in cancelled promise."`.
   */
  constructor(promise, reason, info) {
    super((info !== null && info !== void 0 ? info : "Unhandled rejection in cancelled promise.") + " Reason: " + errorMessage(reason), { cause: reason });
    this.promise = promise;
    this.name = "CancelledRejectionError";
  }
}
const barrierSym = Symbol("barrier");
const cancelImplSym = Symbol("cancelImpl");
const species = (_a = Symbol.species) !== null && _a !== void 0 ? _a : Symbol("speciesPolyfill");
class CancellablePromise extends Promise {
  /**
   * Creates a new `CancellablePromise`.
   *
   * @param executor - A callback used to initialize the promise. This callback is passed two arguments:
   *                   a `resolve` callback used to resolve the promise with a value
   *                   or the result of another promise (possibly cancellable),
   *                   and a `reject` callback used to reject the promise with a provided reason or error.
   *                   If the value provided to the `resolve` callback is a thenable _and_ cancellable object
   *                   (it has a `then` _and_ a `cancel` method),
   *                   cancellation requests will be forwarded to that object and the oncancelled will not be invoked anymore.
   *                   If any one of the two callbacks is called _after_ the promise has been cancelled,
   *                   the provided values will be cancelled and resolved as usual,
   *                   but their results will be discarded.
   *                   However, if the resolution process ultimately ends up in a rejection
   *                   that is not due to cancellation, the rejection reason
   *                   will be wrapped in a {@link CancelledRejectionError}
   *                   and bubbled up as an unhandled rejection.
   * @param oncancelled - It is the caller's responsibility to ensure that any operation
   *                      started by the executor is properly halted upon cancellation.
   *                      This optional callback can be used to that purpose.
   *                      It will be called _synchronously_ with a cancellation cause
   *                      when cancellation is requested, _after_ the promise has already rejected
   *                      with a {@link CancelError}, but _before_
   *                      any {@link then}/{@link catch}/{@link finally} callback runs.
   *                      If the callback returns a thenable, the promise returned from {@link cancel}
   *                      will only fulfill after the former has settled.
   *                      Unhandled exceptions or rejections from the callback will be wrapped
   *                      in a {@link CancelledRejectionError} and bubbled up as unhandled rejections.
   *                      If the `resolve` callback is called before cancellation with a cancellable promise,
   *                      cancellation requests on this promise will be diverted to that promise,
   *                      and the original `oncancelled` callback will be discarded.
   */
  constructor(executor, oncancelled) {
    let resolve2;
    let reject;
    super((res, rej) => {
      resolve2 = res;
      reject = rej;
    });
    if (this.constructor[species] !== Promise) {
      throw new TypeError("CancellablePromise does not support transparent subclassing. Please refrain from overriding the [Symbol.species] static property.");
    }
    let promise = {
      promise: this,
      resolve: resolve2,
      reject,
      get oncancelled() {
        return oncancelled !== null && oncancelled !== void 0 ? oncancelled : null;
      },
      set oncancelled(cb) {
        oncancelled = cb !== null && cb !== void 0 ? cb : void 0;
      }
    };
    const state = {
      get root() {
        return state;
      },
      resolving: false,
      settled: false
    };
    void Object.defineProperties(this, {
      [barrierSym]: {
        configurable: false,
        enumerable: false,
        writable: true,
        value: null
      },
      [cancelImplSym]: {
        configurable: false,
        enumerable: false,
        writable: false,
        value: cancellerFor(promise, state)
      }
    });
    const rejector = rejectorFor(promise, state);
    try {
      executor(resolverFor(promise, state), rejector);
    } catch (err) {
      if (state.resolving) {
        console.log("Unhandled exception in CancellablePromise executor.", err);
      } else {
        rejector(err);
      }
    }
  }
  /**
   * Cancels immediately the execution of the operation associated with this promise.
   * The promise rejects with a {@link CancelError} instance as reason,
   * with the {@link CancelError#cause} property set to the given argument, if any.
   *
   * Has no effect if called after the promise has already settled;
   * repeated calls in particular are safe, but only the first one
   * will set the cancellation cause.
   *
   * The `CancelError` exception _need not_ be handled explicitly _on the promises that are being cancelled:_
   * cancelling a promise with no attached rejection handler does not trigger an unhandled rejection event.
   * Therefore, the following idioms are all equally correct:
   * ```ts
   * new CancellablePromise((resolve, reject) => { ... }).cancel();
   * new CancellablePromise((resolve, reject) => { ... }).then(...).cancel();
   * new CancellablePromise((resolve, reject) => { ... }).then(...).catch(...).cancel();
   * ```
   * Whenever some cancelled promise in a chain rejects with a `CancelError`
   * with the same cancellation cause as itself, the error will be discarded silently.
   * However, the `CancelError` _will still be delivered_ to all attached rejection handlers
   * added by {@link then} and related methods:
   * ```ts
   * let cancellable = new CancellablePromise((resolve, reject) => { ... });
   * cancellable.then(() => { ... }).catch(console.log);
   * cancellable.cancel(); // A CancelError is printed to the console.
   * ```
   * If the `CancelError` is not handled downstream by the time it reaches
   * a _non-cancelled_ promise, it _will_ trigger an unhandled rejection event,
   * just like normal rejections would:
   * ```ts
   * let cancellable = new CancellablePromise((resolve, reject) => { ... });
   * let chained = cancellable.then(() => { ... }).then(() => { ... }); // No catch...
   * cancellable.cancel(); // Unhandled rejection event on chained!
   * ```
   * Therefore, it is important to either cancel whole promise chains from their tail,
   * as shown in the correct idioms above, or take care of handling errors everywhere.
   *
   * @returns A cancellable promise that _fulfills_ after the cancel callback (if any)
   * and all handlers attached up to the call to cancel have run.
   * If the cancel callback returns a thenable, the promise returned by `cancel`
   * will also wait for that thenable to settle.
   * This enables callers to wait for the cancelled operation to terminate
   * without being forced to handle potential errors at the call site.
   * ```ts
   * cancellable.cancel().then(() => {
   *     // Cleanup finished, it's safe to do something else.
   * }, (err) => {
   *     // Unreachable: the promise returned from cancel will never reject.
   * });
   * ```
   * Note that the returned promise will _not_ handle implicitly any rejection
   * that might have occurred already in the cancelled chain.
   * It will just track whether registered handlers have been executed or not.
   * Therefore, unhandled rejections will never be silently handled by calling cancel.
   */
  cancel(cause) {
    return new CancellablePromise((resolve2) => {
      Promise.all([
        this[cancelImplSym](new CancelError("Promise cancelled.", { cause })),
        currentBarrier(this)
      ]).then(() => resolve2(), () => resolve2());
    });
  }
  /**
   * Binds promise cancellation to the abort event of the given {@link AbortSignal}.
   * If the signal has already aborted, the promise will be cancelled immediately.
   * When either condition is verified, the cancellation cause will be set
   * to the signal's abort reason (see {@link AbortSignal#reason}).
   *
   * Has no effect if called (or if the signal aborts) _after_ the promise has already settled.
   * Only the first signal to abort will set the cancellation cause.
   *
   * For more details about the cancellation process,
   * see {@link cancel} and the `CancellablePromise` constructor.
   *
   * This method enables `await`ing cancellable promises without having
   * to store them for future cancellation, e.g.:
   * ```ts
   * await longRunningOperation().cancelOn(signal);
   * ```
   * instead of:
   * ```ts
   * let promiseToBeCancelled = longRunningOperation();
   * await promiseToBeCancelled;
   * ```
   *
   * @returns This promise, for method chaining.
   */
  cancelOn(signal) {
    if (signal.aborted) {
      void this.cancel(signal.reason);
    } else {
      signal.addEventListener("abort", () => void this.cancel(signal.reason), { capture: true });
    }
    return this;
  }
  /**
   * Attaches callbacks for the resolution and/or rejection of the `CancellablePromise`.
   *
   * The optional `oncancelled` argument will be invoked when the returned promise is cancelled,
   * with the same semantics as the `oncancelled` argument of the constructor.
   * When the parent promise rejects or is cancelled, the `onrejected` callback will run,
   * _even after the returned promise has been cancelled:_
   * in that case, should it reject or throw, the reason will be wrapped
   * in a {@link CancelledRejectionError} and bubbled up as an unhandled rejection.
   *
   * @param onfulfilled The callback to execute when the Promise is resolved.
   * @param onrejected The callback to execute when the Promise is rejected.
   * @returns A `CancellablePromise` for the completion of whichever callback is executed.
   * The returned promise is hooked up to propagate cancellation requests up the chain, but not down:
   *
   *   - if the parent promise is cancelled, the `onrejected` handler will be invoked with a `CancelError`
   *     and the returned promise _will resolve regularly_ with its result;
   *   - conversely, if the returned promise is cancelled, _the parent promise is cancelled too;_
   *     the `onrejected` handler will still be invoked with the parent's `CancelError`,
   *     but its result will be discarded
   *     and the returned promise will reject with a `CancelError` as well.
   *
   * The promise returned from {@link cancel} will fulfill only after all attached handlers
   * up the entire promise chain have been run.
   *
   * If either callback returns a cancellable promise,
   * cancellation requests will be diverted to it,
   * and the specified `oncancelled` callback will be discarded.
   */
  then(onfulfilled, onrejected, oncancelled) {
    if (!(this instanceof CancellablePromise)) {
      throw new TypeError("CancellablePromise.prototype.then called on an invalid object.");
    }
    if (!isCallable(onfulfilled)) {
      onfulfilled = identity;
    }
    if (!isCallable(onrejected)) {
      onrejected = thrower;
    }
    if (onfulfilled === identity && onrejected == thrower) {
      return new CancellablePromise((resolve2) => resolve2(this));
    }
    const barrier = {};
    this[barrierSym] = barrier;
    return new CancellablePromise((resolve2, reject) => {
      void super.then((value) => {
        var _a2;
        if (this[barrierSym] === barrier) {
          this[barrierSym] = null;
        }
        (_a2 = barrier.resolve) === null || _a2 === void 0 ? void 0 : _a2.call(barrier);
        try {
          resolve2(onfulfilled(value));
        } catch (err) {
          reject(err);
        }
      }, (reason) => {
        var _a2;
        if (this[barrierSym] === barrier) {
          this[barrierSym] = null;
        }
        (_a2 = barrier.resolve) === null || _a2 === void 0 ? void 0 : _a2.call(barrier);
        try {
          resolve2(onrejected(reason));
        } catch (err) {
          reject(err);
        }
      });
    }, async (cause) => {
      try {
        return oncancelled === null || oncancelled === void 0 ? void 0 : oncancelled(cause);
      } finally {
        await this.cancel(cause);
      }
    });
  }
  /**
   * Attaches a callback for only the rejection of the Promise.
   *
   * The optional `oncancelled` argument will be invoked when the returned promise is cancelled,
   * with the same semantics as the `oncancelled` argument of the constructor.
   * When the parent promise rejects or is cancelled, the `onrejected` callback will run,
   * _even after the returned promise has been cancelled:_
   * in that case, should it reject or throw, the reason will be wrapped
   * in a {@link CancelledRejectionError} and bubbled up as an unhandled rejection.
   *
   * It is equivalent to
   * ```ts
   * cancellablePromise.then(undefined, onrejected, oncancelled);
   * ```
   * and the same caveats apply.
   *
   * @returns A Promise for the completion of the callback.
   * Cancellation requests on the returned promise
   * will propagate up the chain to the parent promise,
   * but not in the other direction.
   *
   * The promise returned from {@link cancel} will fulfill only after all attached handlers
   * up the entire promise chain have been run.
   *
   * If `onrejected` returns a cancellable promise,
   * cancellation requests will be diverted to it,
   * and the specified `oncancelled` callback will be discarded.
   * See {@link then} for more details.
   */
  catch(onrejected, oncancelled) {
    return this.then(void 0, onrejected, oncancelled);
  }
  /**
   * Attaches a callback that is invoked when the CancellablePromise is settled (fulfilled or rejected). The
   * resolved value cannot be accessed or modified from the callback.
   * The returned promise will settle in the same state as the original one
   * after the provided callback has completed execution,
   * unless the callback throws or returns a rejecting promise,
   * in which case the returned promise will reject as well.
   *
   * The optional `oncancelled` argument will be invoked when the returned promise is cancelled,
   * with the same semantics as the `oncancelled` argument of the constructor.
   * Once the parent promise settles, the `onfinally` callback will run,
   * _even after the returned promise has been cancelled:_
   * in that case, should it reject or throw, the reason will be wrapped
   * in a {@link CancelledRejectionError} and bubbled up as an unhandled rejection.
   *
   * This method is implemented in terms of {@link then} and the same caveats apply.
   * It is polyfilled, hence available in every OS/webview version.
   *
   * @returns A Promise for the completion of the callback.
   * Cancellation requests on the returned promise
   * will propagate up the chain to the parent promise,
   * but not in the other direction.
   *
   * The promise returned from {@link cancel} will fulfill only after all attached handlers
   * up the entire promise chain have been run.
   *
   * If `onfinally` returns a cancellable promise,
   * cancellation requests will be diverted to it,
   * and the specified `oncancelled` callback will be discarded.
   * See {@link then} for more details.
   */
  finally(onfinally, oncancelled) {
    if (!(this instanceof CancellablePromise)) {
      throw new TypeError("CancellablePromise.prototype.finally called on an invalid object.");
    }
    if (!isCallable(onfinally)) {
      return this.then(onfinally, onfinally, oncancelled);
    }
    return this.then((value) => CancellablePromise.resolve(onfinally()).then(() => value), (reason) => CancellablePromise.resolve(onfinally()).then(() => {
      throw reason;
    }), oncancelled);
  }
  /**
   * We use the `[Symbol.species]` static property, if available,
   * to disable the built-in automatic subclassing features from {@link Promise}.
   * It is critical for performance reasons that extenders do not override this.
   * Once the proposal at https://github.com/tc39/proposal-rm-builtin-subclassing
   * is either accepted or retired, this implementation will have to be revised accordingly.
   *
   * @ignore
   * @internal
   */
  static get [species]() {
    return Promise;
  }
  static all(values) {
    let collected = Array.from(values);
    const promise = collected.length === 0 ? CancellablePromise.resolve(collected) : new CancellablePromise((resolve2, reject) => {
      void Promise.all(collected).then(resolve2, reject);
    }, (cause) => cancelAll(promise, collected, cause));
    return promise;
  }
  static allSettled(values) {
    let collected = Array.from(values);
    const promise = collected.length === 0 ? CancellablePromise.resolve(collected) : new CancellablePromise((resolve2, reject) => {
      void Promise.allSettled(collected).then(resolve2, reject);
    }, (cause) => cancelAll(promise, collected, cause));
    return promise;
  }
  static any(values) {
    let collected = Array.from(values);
    const promise = collected.length === 0 ? CancellablePromise.resolve(collected) : new CancellablePromise((resolve2, reject) => {
      void Promise.any(collected).then(resolve2, reject);
    }, (cause) => cancelAll(promise, collected, cause));
    return promise;
  }
  static race(values) {
    let collected = Array.from(values);
    const promise = new CancellablePromise((resolve2, reject) => {
      void Promise.race(collected).then(resolve2, reject);
    }, (cause) => cancelAll(promise, collected, cause));
    return promise;
  }
  /**
   * Creates a new cancelled CancellablePromise for the provided cause.
   *
   * @group Static Methods
   */
  static cancel(cause) {
    const p2 = new CancellablePromise(() => {
    });
    p2.cancel(cause);
    return p2;
  }
  /**
   * Creates a new CancellablePromise that cancels
   * after the specified timeout, with the provided cause.
   *
   * If the {@link AbortSignal.timeout} factory method is available,
   * it is used to base the timeout on _active_ time rather than _elapsed_ time.
   * Otherwise, `timeout` falls back to {@link setTimeout}.
   *
   * @group Static Methods
   */
  static timeout(milliseconds, cause) {
    const promise = new CancellablePromise(() => {
    });
    if (AbortSignal && typeof AbortSignal === "function" && AbortSignal.timeout && typeof AbortSignal.timeout === "function") {
      AbortSignal.timeout(milliseconds).addEventListener("abort", () => void promise.cancel(cause));
    } else {
      setTimeout(() => void promise.cancel(cause), milliseconds);
    }
    return promise;
  }
  static sleep(milliseconds, value) {
    return new CancellablePromise((resolve2) => {
      setTimeout(() => resolve2(value), milliseconds);
    });
  }
  /**
   * Creates a new rejected CancellablePromise for the provided reason.
   *
   * @group Static Methods
   */
  static reject(reason) {
    return new CancellablePromise((_, reject) => reject(reason));
  }
  static resolve(value) {
    if (value instanceof CancellablePromise) {
      return value;
    }
    return new CancellablePromise((resolve2) => resolve2(value));
  }
  /**
   * Creates a new CancellablePromise and returns it in an object, along with its resolve and reject functions
   * and a getter/setter for the cancellation callback.
   *
   * This method is polyfilled, hence available in every OS/webview version.
   *
   * @group Static Methods
   */
  static withResolvers() {
    let result = { oncancelled: null };
    result.promise = new CancellablePromise((resolve2, reject) => {
      result.resolve = resolve2;
      result.reject = reject;
    }, (cause) => {
      var _a2;
      (_a2 = result.oncancelled) === null || _a2 === void 0 ? void 0 : _a2.call(result, cause);
    });
    return result;
  }
}
function cancellerFor(promise, state) {
  let cancellationPromise = void 0;
  return (reason) => {
    if (!state.settled) {
      state.settled = true;
      state.reason = reason;
      promise.reject(reason);
      void Promise.prototype.then.call(promise.promise, void 0, (err) => {
        if (err !== reason) {
          throw err;
        }
      });
    }
    if (!state.reason || !promise.oncancelled) {
      return;
    }
    cancellationPromise = new Promise((resolve2) => {
      try {
        resolve2(promise.oncancelled(state.reason.cause));
      } catch (err) {
        Promise.reject(new CancelledRejectionError(promise.promise, err, "Unhandled exception in oncancelled callback."));
      }
    }).catch((reason2) => {
      Promise.reject(new CancelledRejectionError(promise.promise, reason2, "Unhandled rejection in oncancelled callback."));
    });
    promise.oncancelled = null;
    return cancellationPromise;
  };
}
function resolverFor(promise, state) {
  return (value) => {
    if (state.resolving) {
      return;
    }
    state.resolving = true;
    if (value === promise.promise) {
      if (state.settled) {
        return;
      }
      state.settled = true;
      promise.reject(new TypeError("A promise cannot be resolved with itself."));
      return;
    }
    if (value != null && (typeof value === "object" || typeof value === "function")) {
      let then;
      try {
        then = value.then;
      } catch (err) {
        state.settled = true;
        promise.reject(err);
        return;
      }
      if (isCallable(then)) {
        try {
          let cancel = value.cancel;
          if (isCallable(cancel)) {
            const oncancelled = (cause) => {
              Reflect.apply(cancel, value, [cause]);
            };
            if (state.reason) {
              void cancellerFor(Object.assign(Object.assign({}, promise), { oncancelled }), state)(state.reason);
            } else {
              promise.oncancelled = oncancelled;
            }
          }
        } catch (_a2) {
        }
        const newState = {
          root: state.root,
          resolving: false,
          get settled() {
            return this.root.settled;
          },
          set settled(value2) {
            this.root.settled = value2;
          },
          get reason() {
            return this.root.reason;
          }
        };
        const rejector = rejectorFor(promise, newState);
        try {
          Reflect.apply(then, value, [resolverFor(promise, newState), rejector]);
        } catch (err) {
          rejector(err);
        }
        return;
      }
    }
    if (state.settled) {
      return;
    }
    state.settled = true;
    promise.resolve(value);
  };
}
function rejectorFor(promise, state) {
  return (reason) => {
    if (state.resolving) {
      return;
    }
    state.resolving = true;
    if (state.settled) {
      try {
        if (reason instanceof CancelError && state.reason instanceof CancelError && Object.is(reason.cause, state.reason.cause)) {
          return;
        }
      } catch (_a2) {
      }
      void Promise.reject(new CancelledRejectionError(promise.promise, reason));
    } else {
      state.settled = true;
      promise.reject(reason);
    }
  };
}
function cancelAll(parent, values, cause) {
  const results = [];
  for (const value of values) {
    let cancel;
    try {
      if (!isCallable(value.then)) {
        continue;
      }
      cancel = value.cancel;
      if (!isCallable(cancel)) {
        continue;
      }
    } catch (_a2) {
      continue;
    }
    let result;
    try {
      result = Reflect.apply(cancel, value, [cause]);
    } catch (err) {
      Promise.reject(new CancelledRejectionError(parent, err, "Unhandled exception in cancel method."));
      continue;
    }
    if (!result) {
      continue;
    }
    results.push((result instanceof Promise ? result : Promise.resolve(result)).catch((reason) => {
      Promise.reject(new CancelledRejectionError(parent, reason, "Unhandled rejection in cancel method."));
    }));
  }
  return Promise.all(results);
}
function identity(x) {
  return x;
}
function thrower(reason) {
  throw reason;
}
function errorMessage(err) {
  try {
    if (err instanceof Error || typeof err !== "object" || err.toString !== Object.prototype.toString) {
      return "" + err;
    }
  } catch (_a2) {
  }
  try {
    return JSON.stringify(err);
  } catch (_b) {
  }
  try {
    return Object.prototype.toString.call(err);
  } catch (_c) {
  }
  return "<could not convert error to string>";
}
function currentBarrier(promise) {
  var _a2;
  let pwr = (_a2 = promise[barrierSym]) !== null && _a2 !== void 0 ? _a2 : {};
  if (!("promise" in pwr)) {
    Object.assign(pwr, promiseWithResolvers());
  }
  if (promise[barrierSym] == null) {
    pwr.resolve();
    promise[barrierSym] = pwr;
  }
  return pwr.promise;
}
let promiseWithResolvers = Promise.withResolvers;
if (promiseWithResolvers && typeof promiseWithResolvers === "function") {
  promiseWithResolvers = promiseWithResolvers.bind(Promise);
} else {
  promiseWithResolvers = function() {
    let resolve2;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve2 = res;
      reject = rej;
    });
    return { promise, resolve: resolve2, reject };
  };
}
window._wails = window._wails || {};
const call$1 = newRuntimeCaller(objectNames.Call);
const cancelCall = newRuntimeCaller(objectNames.CancelCall);
const callResponses = /* @__PURE__ */ new Map();
const CallBinding = 0;
const CancelMethod = 0;
function generateID() {
  let result;
  do {
    result = nanoid();
  } while (callResponses.has(result));
  return result;
}
function Call(options) {
  const id = generateID();
  const result = CancellablePromise.withResolvers();
  callResponses.set(id, { resolve: result.resolve, reject: result.reject });
  const request2 = call$1(CallBinding, Object.assign({ "call-id": id }, options));
  let running = true;
  request2.then((res) => {
    running = false;
    callResponses.delete(id);
    result.resolve(res);
  }, (err) => {
    running = false;
    callResponses.delete(id);
    result.reject(err);
  });
  const cancel = () => {
    callResponses.delete(id);
    return cancelCall(CancelMethod, { "call-id": id }).catch((err) => {
      console.error("Error while requesting binding call cancellation:", err);
    });
  };
  result.oncancelled = () => {
    if (running) {
      return cancel();
    } else {
      return request2.then(cancel);
    }
  };
  return result.promise;
}
function ByID(methodID, ...args) {
  return Call({ methodID, args });
}
function Any(source) {
  return source;
}
function Array$1(element) {
  if (element === Any) {
    return (source) => source === null ? [] : source;
  }
  return (source) => {
    if (source === null) {
      return [];
    }
    for (let i = 0; i < source.length; i++) {
      source[i] = element(source[i]);
    }
    return source;
  };
}
function Map$1(key, value) {
  if (value === Any) {
    return (source) => source === null ? {} : source;
  }
  return (source) => {
    if (source === null) {
      return {};
    }
    for (const key2 in source) {
      source[key2] = value(source[key2]);
    }
    return source;
  };
}
const Events = {};
window._wails = window._wails || {};
const call = newRuntimeCaller(objectNames.Dialog);
const DialogInfo = 0;
const DialogWarning = 1;
const DialogError = 2;
const DialogQuestion = 3;
const DialogOpenFile = 4;
const DialogSaveFile = 5;
function dialog(type, options = {}) {
  return call(type, options);
}
function Info(options) {
  return dialog(DialogInfo, options);
}
function Warning(options) {
  return dialog(DialogWarning, options);
}
function Error$1(options) {
  return dialog(DialogError, options);
}
function Question(options) {
  return dialog(DialogQuestion, options);
}
function OpenFile(options) {
  var _a2;
  return (_a2 = dialog(DialogOpenFile, options)) !== null && _a2 !== void 0 ? _a2 : [];
}
function SaveFile(options) {
  return dialog(DialogSaveFile, options);
}
const dialogs = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  Error: Error$1,
  Info,
  OpenFile,
  Question,
  SaveFile,
  Warning
}, Symbol.toStringTag, { value: "Module" }));
const eventListeners = /* @__PURE__ */ new Map();
class Listener {
  constructor(eventName, callback, maxCallbacks) {
    this.eventName = eventName;
    this.callback = callback;
    this.maxCallbacks = maxCallbacks || -1;
  }
  dispatch(data) {
    try {
      this.callback(data);
    } catch (err) {
      console.error(err);
    }
    if (this.maxCallbacks === -1)
      return false;
    this.maxCallbacks -= 1;
    return this.maxCallbacks === 0;
  }
}
function listenerOff(listener2) {
  let listeners = eventListeners.get(listener2.eventName);
  if (!listeners) {
    return;
  }
  listeners = listeners.filter((l) => l !== listener2);
  if (listeners.length === 0) {
    eventListeners.delete(listener2.eventName);
  } else {
    eventListeners.set(listener2.eventName, listeners);
  }
}
window._wails = window._wails || {};
window._wails.dispatchWailsEvent = dispatchWailsEvent;
newRuntimeCaller(objectNames.Events);
class WailsEvent {
  constructor(name, data) {
    this.name = name;
    this.data = data !== null && data !== void 0 ? data : null;
  }
}
function dispatchWailsEvent(event) {
  let listeners = eventListeners.get(event.name);
  if (!listeners) {
    return;
  }
  let wailsEvent = new WailsEvent(event.name, event.name in Events ? Events[event.name](event.data) : event.data);
  if ("sender" in event) {
    wailsEvent.sender = event.sender;
  }
  listeners = listeners.filter((listener2) => !listener2.dispatch(wailsEvent));
  if (listeners.length === 0) {
    eventListeners.delete(event.name);
  } else {
    eventListeners.set(event.name, listeners);
  }
}
function OnMultiple(eventName, callback, maxCallbacks) {
  let listeners = eventListeners.get(eventName) || [];
  const thisListener = new Listener(eventName, callback, maxCallbacks);
  listeners.push(thisListener);
  eventListeners.set(eventName, listeners);
  return () => listenerOff(thisListener);
}
function On(eventName, callback) {
  return OnMultiple(eventName, callback, -1);
}
const DROP_TARGET_ATTRIBUTE = "data-file-drop-target";
const DROP_TARGET_ACTIVE_CLASS = "file-drop-target-active";
let currentDropTarget = null;
const PositionMethod = 0;
const CenterMethod = 1;
const CloseMethod = 2;
const DisableSizeConstraintsMethod = 3;
const EnableSizeConstraintsMethod = 4;
const FocusMethod = 5;
const ForceReloadMethod = 6;
const FullscreenMethod = 7;
const GetScreenMethod = 8;
const GetZoomMethod = 9;
const HeightMethod = 10;
const HideMethod = 11;
const IsFocusedMethod = 12;
const IsFullscreenMethod = 13;
const IsMaximisedMethod = 14;
const IsMinimisedMethod = 15;
const MaximiseMethod = 16;
const MinimiseMethod = 17;
const NameMethod = 18;
const OpenDevToolsMethod = 19;
const RelativePositionMethod = 20;
const ReloadMethod = 21;
const ResizableMethod = 22;
const RestoreMethod = 23;
const SetPositionMethod = 24;
const SetAlwaysOnTopMethod = 25;
const SetBackgroundColourMethod = 26;
const SetFramelessMethod = 27;
const SetFullscreenButtonEnabledMethod = 28;
const SetMaxSizeMethod = 29;
const SetMinSizeMethod = 30;
const SetRelativePositionMethod = 31;
const SetResizableMethod = 32;
const SetSizeMethod = 33;
const SetTitleMethod = 34;
const SetZoomMethod = 35;
const ShowMethod = 36;
const SizeMethod = 37;
const ToggleFullscreenMethod = 38;
const ToggleMaximiseMethod = 39;
const ToggleFramelessMethod = 40;
const UnFullscreenMethod = 41;
const UnMaximiseMethod = 42;
const UnMinimiseMethod = 43;
const WidthMethod = 44;
const ZoomMethod = 45;
const ZoomInMethod = 46;
const ZoomOutMethod = 47;
const ZoomResetMethod = 48;
const SnapAssistMethod = 49;
const FilesDropped = 50;
const PrintMethod = 51;
function getDropTargetElement(element) {
  if (!element) {
    return null;
  }
  return element.closest(`[${DROP_TARGET_ATTRIBUTE}]`);
}
function canResolveFilePaths() {
  var _a2, _b, _c, _d;
  if (((_b = (_a2 = window.chrome) === null || _a2 === void 0 ? void 0 : _a2.webview) === null || _b === void 0 ? void 0 : _b.postMessageWithAdditionalObjects) == null) {
    return false;
  }
  return ((_d = (_c = window._wails) === null || _c === void 0 ? void 0 : _c.flags) === null || _d === void 0 ? void 0 : _d.enableFileDrop) === true;
}
function resolveFilePaths(x, y, files) {
  var _a2, _b;
  if ((_b = (_a2 = window.chrome) === null || _a2 === void 0 ? void 0 : _a2.webview) === null || _b === void 0 ? void 0 : _b.postMessageWithAdditionalObjects) {
    window.chrome.webview.postMessageWithAdditionalObjects(`file:drop:${x}:${y}`, files);
  }
}
let nativeDragActive = false;
function cleanupNativeDrag() {
  nativeDragActive = false;
  if (currentDropTarget) {
    currentDropTarget.classList.remove(DROP_TARGET_ACTIVE_CLASS);
    currentDropTarget = null;
  }
}
function handleDragEnter() {
  var _a2, _b;
  if (((_b = (_a2 = window._wails) === null || _a2 === void 0 ? void 0 : _a2.flags) === null || _b === void 0 ? void 0 : _b.enableFileDrop) === false) {
    return;
  }
  nativeDragActive = true;
}
function handleDragLeave() {
  cleanupNativeDrag();
}
function handleDragOver(x, y) {
  var _a2, _b;
  if (!nativeDragActive)
    return;
  if (((_b = (_a2 = window._wails) === null || _a2 === void 0 ? void 0 : _a2.flags) === null || _b === void 0 ? void 0 : _b.enableFileDrop) === false) {
    return;
  }
  const targetElement = document.elementFromPoint(x, y);
  const dropTarget = getDropTargetElement(targetElement);
  if (currentDropTarget && currentDropTarget !== dropTarget) {
    currentDropTarget.classList.remove(DROP_TARGET_ACTIVE_CLASS);
  }
  if (dropTarget) {
    dropTarget.classList.add(DROP_TARGET_ACTIVE_CLASS);
    currentDropTarget = dropTarget;
  } else {
    currentDropTarget = null;
  }
}
const callerSym = Symbol("caller");
class Window {
  /**
   * Initialises a window object with the specified name.
   *
   * @private
   * @param name - The name of the target window.
   */
  constructor(name = "") {
    this[callerSym] = newRuntimeCaller(objectNames.Window, name);
    for (const method of Object.getOwnPropertyNames(Window.prototype)) {
      if (method !== "constructor" && typeof this[method] === "function") {
        this[method] = this[method].bind(this);
      }
    }
  }
  /**
   * Gets the specified window.
   *
   * @param name - The name of the window to get.
   * @returns The corresponding window object.
   */
  Get(name) {
    return new Window(name);
  }
  /**
   * Returns the absolute position of the window.
   *
   * @returns The current absolute position of the window.
   */
  Position() {
    return this[callerSym](PositionMethod);
  }
  /**
   * Centers the window on the screen.
   */
  Center() {
    return this[callerSym](CenterMethod);
  }
  /**
   * Closes the window.
   */
  Close() {
    return this[callerSym](CloseMethod);
  }
  /**
   * Disables min/max size constraints.
   */
  DisableSizeConstraints() {
    return this[callerSym](DisableSizeConstraintsMethod);
  }
  /**
   * Enables min/max size constraints.
   */
  EnableSizeConstraints() {
    return this[callerSym](EnableSizeConstraintsMethod);
  }
  /**
   * Focuses the window.
   */
  Focus() {
    return this[callerSym](FocusMethod);
  }
  /**
   * Forces the window to reload the page assets.
   */
  ForceReload() {
    return this[callerSym](ForceReloadMethod);
  }
  /**
   * Switches the window to fullscreen mode.
   */
  Fullscreen() {
    return this[callerSym](FullscreenMethod);
  }
  /**
   * Returns the screen that the window is on.
   *
   * @returns The screen the window is currently on.
   */
  GetScreen() {
    return this[callerSym](GetScreenMethod);
  }
  /**
   * Returns the current zoom level of the window.
   *
   * @returns The current zoom level.
   */
  GetZoom() {
    return this[callerSym](GetZoomMethod);
  }
  /**
   * Returns the height of the window.
   *
   * @returns The current height of the window.
   */
  Height() {
    return this[callerSym](HeightMethod);
  }
  /**
   * Hides the window.
   */
  Hide() {
    return this[callerSym](HideMethod);
  }
  /**
   * Returns true if the window is focused.
   *
   * @returns Whether the window is currently focused.
   */
  IsFocused() {
    return this[callerSym](IsFocusedMethod);
  }
  /**
   * Returns true if the window is fullscreen.
   *
   * @returns Whether the window is currently fullscreen.
   */
  IsFullscreen() {
    return this[callerSym](IsFullscreenMethod);
  }
  /**
   * Returns true if the window is maximised.
   *
   * @returns Whether the window is currently maximised.
   */
  IsMaximised() {
    return this[callerSym](IsMaximisedMethod);
  }
  /**
   * Returns true if the window is minimised.
   *
   * @returns Whether the window is currently minimised.
   */
  IsMinimised() {
    return this[callerSym](IsMinimisedMethod);
  }
  /**
   * Maximises the window.
   */
  Maximise() {
    return this[callerSym](MaximiseMethod);
  }
  /**
   * Minimises the window.
   */
  Minimise() {
    return this[callerSym](MinimiseMethod);
  }
  /**
   * Returns the name of the window.
   *
   * @returns The name of the window.
   */
  Name() {
    return this[callerSym](NameMethod);
  }
  /**
   * Opens the development tools pane.
   */
  OpenDevTools() {
    return this[callerSym](OpenDevToolsMethod);
  }
  /**
   * Returns the relative position of the window to the screen.
   *
   * @returns The current relative position of the window.
   */
  RelativePosition() {
    return this[callerSym](RelativePositionMethod);
  }
  /**
   * Reloads the page assets.
   */
  Reload() {
    return this[callerSym](ReloadMethod);
  }
  /**
   * Returns true if the window is resizable.
   *
   * @returns Whether the window is currently resizable.
   */
  Resizable() {
    return this[callerSym](ResizableMethod);
  }
  /**
   * Restores the window to its previous state if it was previously minimised, maximised or fullscreen.
   */
  Restore() {
    return this[callerSym](RestoreMethod);
  }
  /**
   * Sets the absolute position of the window.
   *
   * @param x - The desired horizontal absolute position of the window.
   * @param y - The desired vertical absolute position of the window.
   */
  SetPosition(x, y) {
    return this[callerSym](SetPositionMethod, { x, y });
  }
  /**
   * Sets the window to be always on top.
   *
   * @param alwaysOnTop - Whether the window should stay on top.
   */
  SetAlwaysOnTop(alwaysOnTop) {
    return this[callerSym](SetAlwaysOnTopMethod, { alwaysOnTop });
  }
  /**
   * Sets the background colour of the window.
   *
   * @param r - The desired red component of the window background.
   * @param g - The desired green component of the window background.
   * @param b - The desired blue component of the window background.
   * @param a - The desired alpha component of the window background.
   */
  SetBackgroundColour(r, g, b, a) {
    return this[callerSym](SetBackgroundColourMethod, { r, g, b, a });
  }
  /**
   * Removes the window frame and title bar.
   *
   * @param frameless - Whether the window should be frameless.
   */
  SetFrameless(frameless) {
    return this[callerSym](SetFramelessMethod, { frameless });
  }
  /**
   * Disables the system fullscreen button.
   *
   * @param enabled - Whether the fullscreen button should be enabled.
   */
  SetFullscreenButtonEnabled(enabled) {
    return this[callerSym](SetFullscreenButtonEnabledMethod, { enabled });
  }
  /**
   * Sets the maximum size of the window.
   *
   * @param width - The desired maximum width of the window.
   * @param height - The desired maximum height of the window.
   */
  SetMaxSize(width, height) {
    return this[callerSym](SetMaxSizeMethod, { width, height });
  }
  /**
   * Sets the minimum size of the window.
   *
   * @param width - The desired minimum width of the window.
   * @param height - The desired minimum height of the window.
   */
  SetMinSize(width, height) {
    return this[callerSym](SetMinSizeMethod, { width, height });
  }
  /**
   * Sets the relative position of the window to the screen.
   *
   * @param x - The desired horizontal relative position of the window.
   * @param y - The desired vertical relative position of the window.
   */
  SetRelativePosition(x, y) {
    return this[callerSym](SetRelativePositionMethod, { x, y });
  }
  /**
   * Sets whether the window is resizable.
   *
   * @param resizable - Whether the window should be resizable.
   */
  SetResizable(resizable2) {
    return this[callerSym](SetResizableMethod, { resizable: resizable2 });
  }
  /**
   * Sets the size of the window.
   *
   * @param width - The desired width of the window.
   * @param height - The desired height of the window.
   */
  SetSize(width, height) {
    return this[callerSym](SetSizeMethod, { width, height });
  }
  /**
   * Sets the title of the window.
   *
   * @param title - The desired title of the window.
   */
  SetTitle(title) {
    return this[callerSym](SetTitleMethod, { title });
  }
  /**
   * Sets the zoom level of the window.
   *
   * @param zoom - The desired zoom level.
   */
  SetZoom(zoom) {
    return this[callerSym](SetZoomMethod, { zoom });
  }
  /**
   * Shows the window.
   */
  Show() {
    return this[callerSym](ShowMethod);
  }
  /**
   * Returns the size of the window.
   *
   * @returns The current size of the window.
   */
  Size() {
    return this[callerSym](SizeMethod);
  }
  /**
   * Toggles the window between fullscreen and normal.
   */
  ToggleFullscreen() {
    return this[callerSym](ToggleFullscreenMethod);
  }
  /**
   * Toggles the window between maximised and normal.
   */
  ToggleMaximise() {
    return this[callerSym](ToggleMaximiseMethod);
  }
  /**
   * Toggles the window between frameless and normal.
   */
  ToggleFrameless() {
    return this[callerSym](ToggleFramelessMethod);
  }
  /**
   * Un-fullscreens the window.
   */
  UnFullscreen() {
    return this[callerSym](UnFullscreenMethod);
  }
  /**
   * Un-maximises the window.
   */
  UnMaximise() {
    return this[callerSym](UnMaximiseMethod);
  }
  /**
   * Un-minimises the window.
   */
  UnMinimise() {
    return this[callerSym](UnMinimiseMethod);
  }
  /**
   * Returns the width of the window.
   *
   * @returns The current width of the window.
   */
  Width() {
    return this[callerSym](WidthMethod);
  }
  /**
   * Zooms the window.
   */
  Zoom() {
    return this[callerSym](ZoomMethod);
  }
  /**
   * Increases the zoom level of the webview content.
   */
  ZoomIn() {
    return this[callerSym](ZoomInMethod);
  }
  /**
   * Decreases the zoom level of the webview content.
   */
  ZoomOut() {
    return this[callerSym](ZoomOutMethod);
  }
  /**
   * Resets the zoom level of the webview content.
   */
  ZoomReset() {
    return this[callerSym](ZoomResetMethod);
  }
  /**
   * Handles file drops originating from platform-specific code (e.g., macOS/Linux native drag-and-drop).
   * Gathers information about the drop target element and sends it back to the Go backend.
   *
   * @param filenames - An array of file paths (strings) that were dropped.
   * @param x - The x-coordinate of the drop event (CSS pixels).
   * @param y - The y-coordinate of the drop event (CSS pixels).
   */
  HandlePlatformFileDrop(filenames, x, y) {
    var _a2, _b;
    if (((_b = (_a2 = window._wails) === null || _a2 === void 0 ? void 0 : _a2.flags) === null || _b === void 0 ? void 0 : _b.enableFileDrop) === false) {
      return;
    }
    const element = document.elementFromPoint(x, y);
    const dropTarget = getDropTargetElement(element);
    if (!dropTarget) {
      return;
    }
    const elementDetails = {
      id: dropTarget.id,
      classList: Array.from(dropTarget.classList),
      attributes: {}
    };
    for (let i = 0; i < dropTarget.attributes.length; i++) {
      const attr = dropTarget.attributes[i];
      elementDetails.attributes[attr.name] = attr.value;
    }
    const payload = {
      filenames,
      x,
      y,
      elementDetails
    };
    this[callerSym](FilesDropped, payload);
    cleanupNativeDrag();
  }
  /* Triggers Windows 11 Snap Assist feature (Windows only).
   * This is equivalent to pressing Win+Z and shows snap layout options.
   */
  SnapAssist() {
    return this[callerSym](SnapAssistMethod);
  }
  /**
   * Opens the print dialog for the window.
   */
  Print() {
    return this[callerSym](PrintMethod);
  }
}
const thisWindow = new Window("");
function setupDropTargetListeners() {
  const docElement = document.documentElement;
  let dragEnterCounter = 0;
  docElement.addEventListener("dragenter", (event) => {
    var _a2, _b, _c;
    if (!((_a2 = event.dataTransfer) === null || _a2 === void 0 ? void 0 : _a2.types.includes("Files"))) {
      return;
    }
    event.preventDefault();
    if (((_c = (_b = window._wails) === null || _b === void 0 ? void 0 : _b.flags) === null || _c === void 0 ? void 0 : _c.enableFileDrop) === false) {
      event.dataTransfer.dropEffect = "none";
      return;
    }
    dragEnterCounter++;
    const targetElement = document.elementFromPoint(event.clientX, event.clientY);
    const dropTarget = getDropTargetElement(targetElement);
    if (currentDropTarget && currentDropTarget !== dropTarget) {
      currentDropTarget.classList.remove(DROP_TARGET_ACTIVE_CLASS);
    }
    if (dropTarget) {
      dropTarget.classList.add(DROP_TARGET_ACTIVE_CLASS);
      event.dataTransfer.dropEffect = "copy";
      currentDropTarget = dropTarget;
    } else {
      event.dataTransfer.dropEffect = "none";
      currentDropTarget = null;
    }
  }, false);
  docElement.addEventListener("dragover", (event) => {
    var _a2, _b, _c;
    if (!((_a2 = event.dataTransfer) === null || _a2 === void 0 ? void 0 : _a2.types.includes("Files"))) {
      return;
    }
    event.preventDefault();
    if (((_c = (_b = window._wails) === null || _b === void 0 ? void 0 : _b.flags) === null || _c === void 0 ? void 0 : _c.enableFileDrop) === false) {
      event.dataTransfer.dropEffect = "none";
      return;
    }
    const targetElement = document.elementFromPoint(event.clientX, event.clientY);
    const dropTarget = getDropTargetElement(targetElement);
    if (currentDropTarget && currentDropTarget !== dropTarget) {
      currentDropTarget.classList.remove(DROP_TARGET_ACTIVE_CLASS);
    }
    if (dropTarget) {
      if (!dropTarget.classList.contains(DROP_TARGET_ACTIVE_CLASS)) {
        dropTarget.classList.add(DROP_TARGET_ACTIVE_CLASS);
      }
      event.dataTransfer.dropEffect = "copy";
      currentDropTarget = dropTarget;
    } else {
      event.dataTransfer.dropEffect = "none";
      currentDropTarget = null;
    }
  }, false);
  docElement.addEventListener("dragleave", (event) => {
    var _a2, _b, _c;
    if (!((_a2 = event.dataTransfer) === null || _a2 === void 0 ? void 0 : _a2.types.includes("Files"))) {
      return;
    }
    event.preventDefault();
    if (((_c = (_b = window._wails) === null || _b === void 0 ? void 0 : _b.flags) === null || _c === void 0 ? void 0 : _c.enableFileDrop) === false) {
      return;
    }
    if (event.relatedTarget === null) {
      return;
    }
    dragEnterCounter--;
    if (dragEnterCounter === 0 || currentDropTarget && !currentDropTarget.contains(event.relatedTarget)) {
      if (currentDropTarget) {
        currentDropTarget.classList.remove(DROP_TARGET_ACTIVE_CLASS);
        currentDropTarget = null;
      }
      dragEnterCounter = 0;
    }
  }, false);
  docElement.addEventListener("drop", (event) => {
    var _a2, _b, _c;
    if (!((_a2 = event.dataTransfer) === null || _a2 === void 0 ? void 0 : _a2.types.includes("Files"))) {
      return;
    }
    event.preventDefault();
    if (((_c = (_b = window._wails) === null || _b === void 0 ? void 0 : _b.flags) === null || _c === void 0 ? void 0 : _c.enableFileDrop) === false) {
      return;
    }
    dragEnterCounter = 0;
    if (currentDropTarget) {
      currentDropTarget.classList.remove(DROP_TARGET_ACTIVE_CLASS);
      currentDropTarget = null;
    }
    if (canResolveFilePaths()) {
      const files = [];
      if (event.dataTransfer.items) {
        for (const item of event.dataTransfer.items) {
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file)
              files.push(file);
          }
        }
      } else if (event.dataTransfer.files) {
        for (const file of event.dataTransfer.files) {
          files.push(file);
        }
      }
      if (files.length > 0) {
        resolveFilePaths(event.clientX, event.clientY, files);
      }
    }
  }, false);
}
if (typeof window !== "undefined" && typeof document !== "undefined") {
  setupDropTargetListeners();
}
window._wails = window._wails || {};
window._wails.invoke = invoke;
window._wails.clientId = clientId;
window._wails.handlePlatformFileDrop = thisWindow.HandlePlatformFileDrop.bind(thisWindow);
window._wails.handleDragEnter = handleDragEnter;
window._wails.handleDragLeave = handleDragLeave;
window._wails.handleDragOver = handleDragOver;
invoke("wails:runtime:ready");
function loadOptionalScript(url) {
  return fetch(url, { method: "HEAD" }).then((response) => {
    if (response.ok) {
      const script = document.createElement("script");
      script.src = url;
      document.head.appendChild(script);
    }
  }).catch(() => {
  });
}
loadOptionalScript("/wails/custom.js");
const index = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  Browser,
  CancelError,
  CancellablePromise,
  CancelledRejectionError,
  Dialogs: dialogs,
  Window: thisWindow,
  clientId,
  loadOptionalScript,
  objectNames
}, Symbol.toStringTag, { value: "Module" }));
function ReadBinaryFileBase64(sourcePath) {
  return ByID(1464573290, sourcePath);
}
function WriteBinaryFile(targetPath, base64Data) {
  return ByID(640552146, targetPath, base64Data);
}
const fileservice = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ReadBinaryFileBase64,
  WriteBinaryFile
}, Symbol.toStringTag, { value: "Module" }));
class BeaconCommandArg {
  /**
   * Creates a new BeaconCommandArg instance.
   * @param {Partial<BeaconCommandArg>} [$$source = {}] - The source object to create the BeaconCommandArg.
   */
  constructor($$source = {}) {
    if (!("kind" in $$source)) {
      this["kind"] = "";
    }
    if (!("value" in $$source)) {
      this["value"] = null;
    }
    Object.assign(this, $$source);
  }
  /**
   * Creates a new BeaconCommandArg instance from a string or object.
   * @param {any} [$$source = {}]
   * @returns {BeaconCommandArg}
   */
  static createFrom($$source = {}) {
    let $$parsedSource = typeof $$source === "string" ? JSON.parse($$source) : $$source;
    return new BeaconCommandArg(
      /** @type {Partial<BeaconCommandArg>} */
      $$parsedSource
    );
  }
}
class PluginAction {
  /**
   * Creates a new PluginAction instance.
   * @param {Partial<PluginAction>} [$$source = {}] - The source object to create the PluginAction.
   */
  constructor($$source = {}) {
    if (!("id" in $$source)) {
      this["id"] = "";
    }
    if (!("label" in $$source)) {
      this["label"] = "";
    }
    if (!("description" in $$source)) {
      this["description"] = "";
    }
    if (!("artifact" in $$source)) {
      this["artifact"] = "";
    }
    if (!("requires_input" in $$source)) {
      this["requires_input"] = false;
    }
    Object.assign(this, $$source);
  }
  /**
   * Creates a new PluginAction instance from a string or object.
   * @param {any} [$$source = {}]
   * @returns {PluginAction}
   */
  static createFrom($$source = {}) {
    const $$createField3_0 = $$createType0$1;
    const $$createField4_0 = $$createType0$1;
    const $$createField6_0 = $$createType1$1;
    const $$createField10_0 = $$createType3;
    const $$createField11_0 = $$createType5;
    let $$parsedSource = typeof $$source === "string" ? JSON.parse($$source) : $$source;
    if ("os" in $$parsedSource) {
      $$parsedSource["os"] = $$createField3_0($$parsedSource["os"]);
    }
    if ("arch" in $$parsedSource) {
      $$parsedSource["arch"] = $$createField4_0($$parsedSource["arch"]);
    }
    if ("artifact_by_arch" in $$parsedSource) {
      $$parsedSource["artifact_by_arch"] = $$createField6_0($$parsedSource["artifact_by_arch"]);
    }
    if ("fields" in $$parsedSource) {
      $$parsedSource["fields"] = $$createField10_0($$parsedSource["fields"]);
    }
    if ("args" in $$parsedSource) {
      $$parsedSource["args"] = $$createField11_0($$parsedSource["args"]);
    }
    return new PluginAction(
      /** @type {Partial<PluginAction>} */
      $$parsedSource
    );
  }
}
class PluginActionField {
  /**
   * Creates a new PluginActionField instance.
   * @param {Partial<PluginActionField>} [$$source = {}] - The source object to create the PluginActionField.
   */
  constructor($$source = {}) {
    if (!("name" in $$source)) {
      this["name"] = "";
    }
    if (!("label" in $$source)) {
      this["label"] = "";
    }
    if (!("type" in $$source)) {
      this["type"] = "";
    }
    if (!("placeholder" in $$source)) {
      this["placeholder"] = "";
    }
    if (!("default" in $$source)) {
      this["default"] = null;
    }
    if (!("required" in $$source)) {
      this["required"] = false;
    }
    if (!("help" in $$source)) {
      this["help"] = "";
    }
    Object.assign(this, $$source);
  }
  /**
   * Creates a new PluginActionField instance from a string or object.
   * @param {any} [$$source = {}]
   * @returns {PluginActionField}
   */
  static createFrom($$source = {}) {
    const $$createField7_0 = $$createType0$1;
    let $$parsedSource = typeof $$source === "string" ? JSON.parse($$source) : $$source;
    if ("options" in $$parsedSource) {
      $$parsedSource["options"] = $$createField7_0($$parsedSource["options"]);
    }
    return new PluginActionField(
      /** @type {Partial<PluginActionField>} */
      $$parsedSource
    );
  }
}
class PluginSnapshot {
  /**
   * Creates a new PluginSnapshot instance.
   * @param {Partial<PluginSnapshot>} [$$source = {}] - The source object to create the PluginSnapshot.
   */
  constructor($$source = {}) {
    if (!("id" in $$source)) {
      this["id"] = "";
    }
    if (!("name" in $$source)) {
      this["name"] = "";
    }
    if (!("display_name" in $$source)) {
      this["display_name"] = "";
    }
    if (!("version" in $$source)) {
      this["version"] = "";
    }
    if (!("description" in $$source)) {
      this["description"] = "";
    }
    if (!("path" in $$source)) {
      this["path"] = "";
    }
    if (!("permissions" in $$source)) {
      this["permissions"] = [];
    }
    if (!("actions" in $$source)) {
      this["actions"] = [];
    }
    if (!("status" in $$source)) {
      this["status"] = "";
    }
    if (!("last_error" in $$source)) {
      this["last_error"] = "";
    }
    if (!("loaded_at" in $$source)) {
      this["loaded_at"] = null;
    }
    if (!("updated_at" in $$source)) {
      this["updated_at"] = null;
    }
    Object.assign(this, $$source);
  }
  /**
   * Creates a new PluginSnapshot instance from a string or object.
   * @param {any} [$$source = {}]
   * @returns {PluginSnapshot}
   */
  static createFrom($$source = {}) {
    const $$createField6_0 = $$createType0$1;
    const $$createField7_0 = $$createType7;
    let $$parsedSource = typeof $$source === "string" ? JSON.parse($$source) : $$source;
    if ("permissions" in $$parsedSource) {
      $$parsedSource["permissions"] = $$createField6_0($$parsedSource["permissions"]);
    }
    if ("actions" in $$parsedSource) {
      $$parsedSource["actions"] = $$createField7_0($$parsedSource["actions"]);
    }
    return new PluginSnapshot(
      /** @type {Partial<PluginSnapshot>} */
      $$parsedSource
    );
  }
}
const $$createType0$1 = Array$1(Any);
const $$createType1$1 = Map$1(Any, Any);
const $$createType2 = PluginActionField.createFrom;
const $$createType3 = Array$1($$createType2);
const $$createType4 = BeaconCommandArg.createFrom;
const $$createType5 = Array$1($$createType4);
const $$createType6 = PluginAction.createFrom;
const $$createType7 = Array$1($$createType6);
function AddPlugin(sourcePath) {
  return ByID(573901041, sourcePath).then(
    /** @type {($result: any) => any} */
    ($result) => {
      return $$createType1($result);
    }
  );
}
function DeletePlugin(pluginID) {
  return ByID(2934088899, pluginID).then(
    /** @type {($result: any) => any} */
    ($result) => {
      return $$createType1($result);
    }
  );
}
function InvokePluginAction(pluginID, action, payloadJSON) {
  return ByID(2413106546, pluginID, action, payloadJSON).then(
    /** @type {($result: any) => any} */
    ($result) => {
      return $$createType0($result);
    }
  );
}
function ListPlugins() {
  return ByID(936869721).then(
    /** @type {($result: any) => any} */
    ($result) => {
      return $$createType1($result);
    }
  );
}
function ReloadPlugins() {
  return ByID(1463169090).then(
    /** @type {($result: any) => any} */
    ($result) => {
      return $$createType1($result);
    }
  );
}
const $$createType0 = PluginSnapshot.createFrom;
const $$createType1 = Array$1($$createType0);
function DoRequest(method, url, payload, headersMap) {
  return ByID(3950893472, method, url, payload, headersMap);
}
function DownloadFileBase64(url, headersMap) {
  return ByID(2306400731, url, headersMap);
}
function UploadFileBase64(url, fileName, base64Data, headersMap) {
  return ByID(157469278, url, fileName, base64Data, headersMap);
}
function Connect(apiBase, token) {
  return ByID(154642053, apiBase, token);
}
function Disconnect() {
  return ByID(2994002663);
}
function normalizeEventType(type) {
  const normalized = String(type || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return normalized.startsWith("EVENT") ? normalized.slice(5) : normalized;
}
function normalizeEventData(data) {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
}
function getBeaconId(data) {
  if (!data || typeof data !== "object") return "";
  return data.beacon_id || data.beaconid || data.beaconId || data.BeaconID || data.BeaconId || data.id || data.ID || data.uuid || data.UUID || "";
}
function getCommandResultPayload(data) {
  if (!data || typeof data !== "object") return data;
  const payload = data.data ?? data.Data ?? data.result ?? data.Result ?? data.content ?? data.Content ?? data.payload ?? data.Payload;
  return payload === void 0 ? data : normalizeEventData(payload);
}
function getTextResultContent$1(payload) {
  if (payload === void 0 || payload === null) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    const text = payload.text ?? payload.Text ?? payload.value ?? payload.Value;
    if (text !== void 0 && text !== null && text !== "") return String(text);
  }
  return "";
}
function isZipSuccessResult(text) {
  return String(text || "").trim().toLowerCase().startsWith("zip success:");
}
function getTaskCommandId(data, raw = null) {
  if (!data || typeof data !== "object") return (raw == null ? void 0 : raw.command_id) || (raw == null ? void 0 : raw.commandId) || (raw == null ? void 0 : raw.CommandID) || (raw == null ? void 0 : raw.CommandId) || "";
  return data.command_id || data.commandId || data.CommandID || data.CommandId || (raw == null ? void 0 : raw.command_id) || (raw == null ? void 0 : raw.commandId) || (raw == null ? void 0 : raw.CommandID) || (raw == null ? void 0 : raw.CommandId) || "";
}
function getCommandField(data, raw, keys, fallback = "") {
  if (data && typeof data === "object") {
    for (const key of keys) {
      if (data[key] !== void 0 && data[key] !== null && data[key] !== "") return data[key];
    }
  }
  if (raw && typeof raw === "object") {
    for (const key of keys) {
      if (raw[key] !== void 0 && raw[key] !== null && raw[key] !== "") return raw[key];
    }
  }
  return fallback;
}
function getCommandPhase(data, raw = null) {
  return String(getCommandField(data, raw, ["phase", "Phase"])).toLowerCase();
}
function getCommandStatus(data, raw = null) {
  return String(getCommandField(data, raw, ["status", "Status"])).toLowerCase();
}
function getCommandResultType(data, raw = null) {
  const value = getCommandField(data, raw, ["result_type", "resultType", "ResultType"]);
  if (value !== "") return String(value).toLowerCase();
  if (data && typeof data === "object" && data.type !== void 0 && data.type !== null && data.type !== "") {
    return String(data.type).toLowerCase();
  }
  if (data && typeof data === "object" && data.Type !== void 0 && data.Type !== null && data.Type !== "") {
    return String(data.Type).toLowerCase();
  }
  return "";
}
function getTransferDirection(data) {
  if (!data || typeof data !== "object") return "";
  return String(data.direction || data.Direction || "").toLowerCase();
}
function getTransferFileId(data) {
  if (!data || typeof data !== "object") return "";
  return data.file_id || data.fileId || data.FileID || data.FileId || "";
}
function getTransferFileName(data) {
  if (!data || typeof data !== "object") return "download.bin";
  return data.file_name || data.fileName || data.FileName || "download.bin";
}
function getTransferDownloadUrl(data) {
  if (!data || typeof data !== "object") return "";
  return data.download_url || data.downloadUrl || data.DownloadURL || data.DownloadUrl || "";
}
function getTransferError(data) {
  if (!data || typeof data !== "object") return String(data || "文件传输失败");
  return data.error || data.Error || data.error_message || data.errorMessage || data.message || data.Message || "文件传输失败";
}
function formatProcessTable(processes) {
  if (!Array.isArray(processes) || processes.length === 0) return "未获取到进程数据。";
  const headers = ["PID", "PPID", "Arch", "Session", "User", "Name"];
  const data = processes.map((p2) => ({
    pid: String(p2.pid || 0),
    ppid: String(p2.ppid || 0),
    arch: p2.arch_name || (p2.arch === 2 ? "arm64" : p2.arch === 1 ? "x64" : p2.arch === 0 ? "x86" : "unk"),
    session: String(p2.session_id ?? "-"),
    user: p2.user || "Unknown",
    name: p2.name || "Unknown"
  })).sort((a, b) => parseInt(a.pid) - parseInt(b.pid));
  const colWidths = {};
  headers.forEach((h2) => {
    colWidths[h2.toLowerCase()] = Math.max(h2.length, ...data.map((row) => String(row[h2.toLowerCase()]).length));
  });
  const pad = (str, width) => String(str).padEnd(width + 2);
  const headerRow = headers.map((h2) => pad(h2, colWidths[h2.toLowerCase()])).join("");
  const separator = headers.map((h2) => pad("-".repeat(h2.length), colWidths[h2.toLowerCase()])).join("");
  const bodyRows = data.map(
    (row) => headers.map((h2) => pad(row[h2.toLowerCase()], colWidths[h2.toLowerCase()])).join("")
  );
  return [headerRow, separator, ...bodyRows, "", `总进程数: ${data.length}`].join("\n");
}
function formatNetInfo(interfaces) {
  if (!Array.isArray(interfaces) || interfaces.length === 0) return "未获取到网络接口数据。";
  const sorted = [...interfaces].sort((a, b) => Number((a == null ? void 0 : a.index) || 0) - Number((b == null ? void 0 : b.index) || 0));
  const lines = [`网络接口数: ${sorted.length}`];
  for (const iface of sorted) {
    const index2 = (iface == null ? void 0 : iface.index) ?? "-";
    const name = (iface == null ? void 0 : iface.name) || "Unknown";
    const mtu = (iface == null ? void 0 : iface.mtu) ?? "-";
    const flags = Array.isArray(iface == null ? void 0 : iface.flags) ? iface.flags.join(", ") : String((iface == null ? void 0 : iface.flags) || "-");
    const mac = (iface == null ? void 0 : iface.hardware_addr) || (iface == null ? void 0 : iface.hardwareAddr) || "-";
    const addrs = Array.isArray(iface == null ? void 0 : iface.addrs) ? iface.addrs.join(", ") : String((iface == null ? void 0 : iface.addrs) || "-");
    const up = (iface == null ? void 0 : iface.is_up) === void 0 ? "-" : iface.is_up ? "yes" : "no";
    const loopback = (iface == null ? void 0 : iface.is_loopback) === void 0 ? "-" : iface.is_loopback ? "yes" : "no";
    const multicast = (iface == null ? void 0 : iface.is_multicast) === void 0 ? "-" : iface.is_multicast ? "yes" : "no";
    lines.push(
      "",
      `[${index2}] ${name}`,
      `  MTU: ${mtu}`,
      `  Flags: ${flags}`,
      `  MAC: ${mac}`,
      `  Addrs: ${addrs}`,
      `  State: up=${up} / loopback=${loopback} / multicast=${multicast}`
    );
  }
  return lines.join("\n");
}
function formatNetstatTable(connections) {
  if (!Array.isArray(connections) || connections.length === 0) return "未获取到网络连接数据。";
  const headers = ["PROTO", "LOCAL", "REMOTE", "STATE", "PID"];
  const data = connections.map((conn) => ({
    proto: String((conn == null ? void 0 : conn.protocol) || (conn == null ? void 0 : conn.proto) || "unk"),
    local: `${(conn == null ? void 0 : conn.local_address) || "-"}:${(conn == null ? void 0 : conn.local_port) ?? "-"}`,
    remote: `${(conn == null ? void 0 : conn.remote_address) || "-"}:${(conn == null ? void 0 : conn.remote_port) ?? "-"}`,
    state: String((conn == null ? void 0 : conn.state) || "-"),
    pid: String((conn == null ? void 0 : conn.pid) ?? "-")
  })).sort((a, b) => {
    const protoCmp = a.proto.localeCompare(b.proto);
    if (protoCmp !== 0) return protoCmp;
    const localCmp = a.local.localeCompare(b.local);
    if (localCmp !== 0) return localCmp;
    return a.remote.localeCompare(b.remote);
  });
  const colWidths = {};
  headers.forEach((h2) => {
    colWidths[h2.toLowerCase()] = Math.max(h2.length, ...data.map((row) => String(row[h2.toLowerCase()]).length));
  });
  const pad = (str, width) => String(str).padEnd(width + 2);
  const headerRow = headers.map((h2) => pad(h2, colWidths[h2.toLowerCase()])).join("");
  const separator = headers.map((h2) => pad("-".repeat(h2.length), colWidths[h2.toLowerCase()])).join("");
  const bodyRows = data.map((row) => headers.map((h2) => pad(row[h2.toLowerCase()], colWidths[h2.toLowerCase()])).join(""));
  return [headerRow, separator, ...bodyRows, "", `总连接数: ${data.length}`].join("\n");
}
const useNotificationStore = /* @__PURE__ */ defineStore("notification", {
  // ─── 状态 ───
  state: () => ({
    /** @type {Array<{id: number, message: string, type: string, duration: number}>} */
    notifications: []
  }),
  actions: {
    /**
     * 显示通知
     * @param {string} message 
     * @param {'success' | 'error' | 'warn' | 'info'} type 
     * @param {number} duration (ms)
     */
    add(message, type = "info", duration = 3e3) {
      const id = Date.now();
      this.notifications.push({ id, message, type, duration });
      if (duration > 0) {
        setTimeout(() => {
          this.remove(id);
        }, duration);
      }
    },
    success(message) {
      this.add(message, "success");
    },
    error(message) {
      this.add(message, "error", 5e3);
    },
    warn(message) {
      this.add(message, "warn", 4e3);
    },
    info(message) {
      this.add(message, "info");
    },
    remove(id) {
      this.notifications = this.notifications.filter((n) => n.id !== id);
    }
  }
});
const notification = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  useNotificationStore
}, Symbol.toStringTag, { value: "Module" }));
function parseApiResponse(responseJson) {
  if (responseJson.trim().startsWith("<!DOCTYPE") || responseJson.trim().startsWith("<html")) {
    throw new Error("服务器返回了非预期的 HTML 页面 (可能是路径错误或接口变更)。");
  }
  const result = JSON.parse(responseJson);
  if (result.ok === false || result.error) {
    throw new Error(result.message || result.error || "API Error");
  }
  return result.data !== void 0 ? result.data : result;
}
function authHeaders() {
  const authStore = useAuthStore();
  const headers = {};
  if (authStore.token) {
    headers["Authorization"] = `Bearer ${authStore.token}`;
  }
  return headers;
}
function resolveApiUrl(pathOrUrl) {
  const authStore = useAuthStore();
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const apiBase = authStore.apiBase || "https://127.0.0.1:8080";
  return `${apiBase}${pathOrUrl}`;
}
async function request(method, path, body = null) {
  const authStore = useAuthStore();
  try {
    const headers = {
      "Content-Type": "application/json"
    };
    if (authStore.token) {
      headers["Authorization"] = `Bearer ${authStore.token}`;
    }
    const apiBase = authStore.apiBase || "https://127.0.0.1:8080";
    const url = `${apiBase}${path}`;
    const payload = body ? JSON.stringify(body) : "";
    const responseJson = await DoRequest(method, url, payload, headers);
    return parseApiResponse(responseJson);
  } catch (err) {
    const notificationStore = useNotificationStore();
    let userMessage = err.message || "网络连接异常";
    const lowerMsg = userMessage.toLowerCase();
    if (lowerMsg.includes("connection refused") || lowerMsg.includes("econnrefused") || lowerMsg.includes("actively refuse")) {
      userMessage = "【连接失败】无法触达 TeamServer，请确认服务器已启动且端口号正确。";
    } else if (lowerMsg.includes("timeout")) {
      userMessage = "【请求超时】后端响应太慢，请检查服务器负载或网络。";
    }
    notificationStore.error(userMessage);
    console.error(`[Proxy-API] ${method} ${path} failed:`, err);
    throw err;
  }
}
async function uploadFileBase64(pathOrUrl, fileName, base64Data) {
  const responseJson = await UploadFileBase64(
    resolveApiUrl(pathOrUrl),
    fileName,
    base64Data,
    authHeaders()
  );
  return parseApiResponse(responseJson);
}
async function downloadBinaryBase64(pathOrUrl) {
  return await DownloadFileBase64(resolveApiUrl(pathOrUrl), authHeaders());
}
async function readFileAsBase64(file) {
  return await new Promise((resolve2, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve2(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error("读取本地文件失败"));
    reader.readAsDataURL(file);
  });
}
async function explorerFiles(beaconid, path = "", limit = 1e3, offset = 0) {
  const payload = {
    beacon_id: String(beaconid),
    path: String(path),
    limit: Number(limit),
    offset: Number(offset)
  };
  return await request("POST", "/api/v1/explorer/files", payload);
}
async function uploadFile(file) {
  const notificationStore = useNotificationStore();
  try {
    const base64Data = await readFileAsBase64(file);
    return await uploadFileBase64("/api/v1/files/uploads", file.name, base64Data);
  } catch (err) {
    const userMessage = err.message || "上传文件到 TeamServer 失败";
    notificationStore.error(userMessage);
    console.error("[Proxy-API] POST /api/v1/files/uploads failed:", err);
    throw err;
  }
}
async function listDownloads() {
  return await request("GET", "/api/v1/files/downloads");
}
async function downloadFileBase64({ fileId, downloadUrl }) {
  const path = downloadUrl || `/api/v1/files/downloads/${encodeURIComponent(fileId)}`;
  return await downloadBinaryBase64(path);
}
async function saveCompletedDownload(data) {
  const fileId = getTransferFileId(data);
  const downloadUrl = getTransferDownloadUrl(data);
  const fileName = getTransferFileName(data);
  if (!fileId && !downloadUrl) {
    throw new Error("缺少 download_url 或 file_id");
  }
  const { Dialogs } = await __vitePreload(async () => {
    const { Dialogs: Dialogs2 } = await Promise.resolve().then(() => index);
    return { Dialogs: Dialogs2 };
  }, true ? void 0 : void 0);
  const FileService = await __vitePreload(() => Promise.resolve().then(() => fileservice), true ? void 0 : void 0);
  const savePath = await Dialogs.SaveFile({
    Title: "保存下载文件",
    Filename: fileName
  });
  if (!savePath) return false;
  const base64Data = await downloadFileBase64({ fileId, downloadUrl });
  await FileService.WriteBinaryFile(savePath, base64Data);
  return true;
}
async function handleCommandEvent({ data, raw, commandId = "", phase = "", status = "", resultType = "" }) {
  const bid = getBeaconId(data) || getBeaconId(raw);
  if (!bid) return;
  const normalizedPhase = String(phase || "").toLowerCase();
  const normalizedStatus = String(status || "").toLowerCase();
  const normalizedResultType = normalizeEventType(resultType);
  const numericCommandId = Number(commandId);
  const commandPayload = getCommandResultPayload(data);
  const resultPayload = commandPayload;
  const { useConsoleStore: useConsoleStore2 } = await __vitePreload(async () => {
    const { useConsoleStore: useConsoleStore3 } = await Promise.resolve().then(() => console$1);
    return { useConsoleStore: useConsoleStore3 };
  }, true ? void 0 : void 0);
  const consoleStore = useConsoleStore2();
  const textResult = getTextResultContent$1(resultPayload);
  if (numericCommandId === 22 && textResult) {
    const { useExplorerStore: useExplorerStore2 } = await __vitePreload(async () => {
      const { useExplorerStore: useExplorerStore3 } = await Promise.resolve().then(() => explorer);
      return { useExplorerStore: useExplorerStore3 };
    }, true ? void 0 : void 0);
    useExplorerStore2().handlePwdResponse(String(bid), resultPayload);
  }
  if (normalizedResultType === "SCREENSHOT") {
    const { useScreenshotStore } = await __vitePreload(async () => {
      const { useScreenshotStore: useScreenshotStore2 } = await import("./screenshot-kLHFs45O.js").then((n) => n.s);
      return { useScreenshotStore: useScreenshotStore2 };
    }, true ? [] : void 0);
    const screenshotStore = useScreenshotStore();
    if (normalizedStatus !== "error" && resultPayload && typeof resultPayload === "object") {
      screenshotStore.upsertScreenshot(resultPayload);
    }
    if (normalizedStatus === "completed" || normalizedPhase === "result") {
      screenshotStore.fetchScreenshots({ silent: true }).catch((err) => {
        console.warn("[SCREENSHOT] 列表刷新失败:", err);
      });
    }
  } else if (normalizedResultType === "EXPLORERFILES") {
    const { useExplorerStore: useExplorerStore2 } = await __vitePreload(async () => {
      const { useExplorerStore: useExplorerStore3 } = await Promise.resolve().then(() => explorer);
      return { useExplorerStore: useExplorerStore3 };
    }, true ? void 0 : void 0);
    useExplorerStore2().handleExplorerResponse(String(bid), resultPayload);
  } else if (["PSLIST", "PROCESSLIST", "PROCESSES", "PS"].includes(normalizedResultType)) {
    const { useProcessBrowserStore: useProcessBrowserStore2 } = await __vitePreload(async () => {
      const { useProcessBrowserStore: useProcessBrowserStore3 } = await Promise.resolve().then(() => processBrowser);
      return { useProcessBrowserStore: useProcessBrowserStore3 };
    }, true ? void 0 : void 0);
    useProcessBrowserStore2().handleProcessResponse(String(bid), resultPayload);
    if (Array.isArray(resultPayload)) {
      consoleStore.pushCommandResult(bid, formatProcessTable(resultPayload));
    } else {
      const text = typeof resultPayload === "string" ? resultPayload : JSON.stringify(resultPayload);
      if (text && text !== "undefined") {
        consoleStore.pushCommandResult(bid, text);
      }
    }
  } else if (["NETINFO", "NET_INFO"].includes(normalizedResultType) || numericCommandId === 52) {
    const interfaces = Array.isArray(resultPayload) ? resultPayload : resultPayload && typeof resultPayload === "object" ? resultPayload.interfaces || resultPayload.Interfaces || [] : [];
    const { useNetworkBrowserStore: useNetworkBrowserStore2 } = await __vitePreload(async () => {
      const { useNetworkBrowserStore: useNetworkBrowserStore3 } = await Promise.resolve().then(() => networkBrowser);
      return { useNetworkBrowserStore: useNetworkBrowserStore3 };
    }, true ? void 0 : void 0);
    useNetworkBrowserStore2().handleNetInfoResponse(String(bid), resultPayload);
    consoleStore.pushCommandResult(bid, formatNetInfo(interfaces));
  } else if (["NETSTAT"].includes(normalizedResultType) || numericCommandId === 53) {
    const connections = Array.isArray(resultPayload) ? resultPayload : resultPayload && typeof resultPayload === "object" ? resultPayload.connections || resultPayload.Connections || [] : [];
    const { useNetworkBrowserStore: useNetworkBrowserStore2 } = await __vitePreload(async () => {
      const { useNetworkBrowserStore: useNetworkBrowserStore3 } = await Promise.resolve().then(() => networkBrowser);
      return { useNetworkBrowserStore: useNetworkBrowserStore3 };
    }, true ? void 0 : void 0);
    useNetworkBrowserStore2().handleNetstatResponse(String(bid), resultPayload);
    consoleStore.pushCommandResult(bid, formatNetstatTable(connections));
  } else if (normalizedResultType === "TEXT") {
    if (textResult) {
      consoleStore.pushCommandResult(bid, textResult);
    } else {
      const fallback = typeof resultPayload === "string" ? resultPayload : JSON.stringify(resultPayload);
      if (fallback && fallback !== "undefined") {
        consoleStore.pushCommandResult(bid, fallback);
      }
    }
  } else if (["DOWNLOAD", "UPLOAD"].includes(normalizedResultType)) {
    const { useNotificationStore: useNotificationStore2 } = await __vitePreload(async () => {
      const { useNotificationStore: useNotificationStore3 } = await Promise.resolve().then(() => notification);
      return { useNotificationStore: useNotificationStore3 };
    }, true ? void 0 : void 0);
    const { useFileTransferStore: useFileTransferStore2 } = await __vitePreload(async () => {
      const { useFileTransferStore: useFileTransferStore3 } = await Promise.resolve().then(() => fileTransfer);
      return { useFileTransferStore: useFileTransferStore3 };
    }, true ? void 0 : void 0);
    const notificationStore = useNotificationStore2();
    const fileTransferStore = useFileTransferStore2();
    const transferData = resultPayload && typeof resultPayload === "object" ? resultPayload : data;
    const transferStatus = normalizedStatus || (normalizedPhase === "progress" ? normalizedResultType === "UPLOAD" ? "uploading" : "receiving" : normalizedPhase === "result" ? "completed" : "running");
    fileTransferStore.handleTransferEvent(transferData, transferStatus);
    if (transferStatus === "error") {
      notificationStore.error(getTransferError(transferData));
    } else if (transferStatus === "completed" || normalizedPhase === "result") {
      if (getTransferDirection(transferData) === "download" || normalizedResultType === "DOWNLOAD") {
        try {
          const saved = await saveCompletedDownload(transferData);
          if (saved) {
            notificationStore.success(`下载完成并已保存: ${getTransferFileName(transferData)}`);
          } else {
            notificationStore.info(`下载已完成，已取消本地保存: ${getTransferFileName(transferData)}`);
          }
        } catch (err) {
          notificationStore.error(`保存下载文件失败: ${err.message || err}`);
        }
      } else {
        notificationStore.success(`文件传输完成: ${getTransferFileName(transferData)}`);
      }
    }
  } else {
    const text = getTextResultContent$1(resultPayload) || (typeof resultPayload === "string" ? resultPayload : JSON.stringify(resultPayload));
    if (text && text !== "undefined") {
      consoleStore.pushCommandResult(bid, text);
    }
  }
  if (Number(commandId) === 32 && isZipSuccessResult(textResult)) {
    const { useModalStore: useModalStore2 } = await __vitePreload(async () => {
      const { useModalStore: useModalStore3 } = await Promise.resolve().then(() => modal);
      return { useModalStore: useModalStore3 };
    }, true ? void 0 : void 0);
    const modalStore = useModalStore2();
    if (modalStore.fileBrowserVisible && String(modalStore.activeFileBrowserBeaconId || "") === String(bid)) {
      const { useExplorerStore: useExplorerStore2 } = await __vitePreload(async () => {
        const { useExplorerStore: useExplorerStore3 } = await Promise.resolve().then(() => explorer);
        return { useExplorerStore: useExplorerStore3 };
      }, true ? void 0 : void 0);
      const explorerStore = useExplorerStore2();
      const currentPath = explorerStore.uiCurrentPath[bid] || "";
      console.log(`[ZIP DONE] 指令 32 执行成功，准备刷新文件浏览器: ${bid} -> ${currentPath}`);
      explorerStore.loadDirectory(String(bid), currentPath, true);
    }
  }
  if (Number(commandId) === 25 && (normalizedStatus === "completed" || normalizedPhase === "result" || normalizedResultType === "TEXT" || !normalizedStatus)) {
    const { useExplorerStore: useExplorerStore2 } = await __vitePreload(async () => {
      const { useExplorerStore: useExplorerStore3 } = await Promise.resolve().then(() => explorer);
      return { useExplorerStore: useExplorerStore3 };
    }, true ? void 0 : void 0);
    const explorerStore = useExplorerStore2();
    const currentPath = explorerStore.uiCurrentPath[bid] || "";
    console.log(`[RM DONE] 指令 25 执行完成，准备强制刷新: ${bid} -> ${currentPath}`);
    explorerStore.loadDirectory(String(bid), currentPath, true);
  }
  if (Number(commandId) === 42 && (normalizedStatus === "completed" || normalizedPhase === "result" || normalizedResultType === "TEXT" || !normalizedStatus)) {
    const { useProcessBrowserStore: useProcessBrowserStore2 } = await __vitePreload(async () => {
      const { useProcessBrowserStore: useProcessBrowserStore3 } = await Promise.resolve().then(() => processBrowser);
      return { useProcessBrowserStore: useProcessBrowserStore3 };
    }, true ? void 0 : void 0);
    const processStore = useProcessBrowserStore2();
    if (processStore.consumeRefreshAfterKill(String(bid))) {
      console.log(`[KILL DONE] 指令 42 执行完成，准备刷新进程列表: ${bid}`);
      processStore.requestProcesses(String(bid));
    } else {
      console.log(`[KILL DONE] 指令 42 执行完成，但来源不是进程浏览器，跳过自动刷新: ${bid}`);
    }
  }
}
async function handleTunnelEvent({ type, data }) {
  const { useTunnelStore } = await __vitePreload(async () => {
    const { useTunnelStore: useTunnelStore2 } = await import("./tunnel-BWdkVgeu.js");
    return { useTunnelStore: useTunnelStore2 };
  }, true ? [] : void 0);
  const tunnelStore = useTunnelStore();
  const tunnelId = String(getCommandField(data, null, ["tunnel_id", "tunnelId", "TunnelID", "TunnelId", "id", "ID"], ""));
  if (["TUNNELSTARTED", "TUNNELPAUSED", "TUNNELRESUMED", "TUNNELSTOPPED", "TUNNELUPDATED"].includes(type)) {
    if (data && typeof data === "object") {
      tunnelStore.upsertTunnel(data);
    }
    tunnelStore.fetchTunnels({ silent: true }).catch((err) => {
      console.warn("[TUNNEL] 列表刷新失败:", err);
    });
    return;
  }
  if (type === "TUNNELCLEARED") {
    if (tunnelId) {
      tunnelStore.removeTunnelLocal(tunnelId);
    }
    tunnelStore.fetchTunnels({ silent: true }).catch((err) => {
      console.warn("[TUNNEL] 列表刷新失败:", err);
    });
    return;
  }
  if (type === "TUNNELSTATS") {
    if (data && typeof data === "object") {
      tunnelStore.upsertTunnel(data);
    }
    return;
  }
  if (["TUNNELCHANNELOPEN", "TUNNELCHANNELCLOSE", "TUNNELCHANNELRECYCLED"].includes(type)) {
    if (tunnelId) {
      tunnelStore.fetchChannels(tunnelId, { silent: true }).catch((err) => {
        console.warn("[TUNNEL] 连接列表刷新失败:", err);
      });
      tunnelStore.fetchTunnels({ silent: true }).catch((err) => {
        console.warn("[TUNNEL] 列表刷新失败:", err);
      });
    }
    return;
  }
  if (type === "TUNNELERROR") {
    tunnelStore.error = String(getCommandField(data, null, ["error", "Error", "message", "Message", "error_message", "errorMessage"], "Tunnel 事件异常"));
  }
}
const QUIET_EVENT_TYPES = ["BEACONTICK", "TUNNELCHANNELOPEN", "TUNNELCHANNELCLOSE", "TUNNELCHANNELRECYCLED", "TUNNELSTATS"];
async function handleWsEventMessage(rawData) {
  const msg = JSON.parse(rawData);
  const rawType = msg.type || msg.Type || msg.event || msg.Event || msg.event_type || msg.EventType;
  const type = normalizeEventType(rawType);
  const data = normalizeEventData(msg.data ?? msg.Data ?? msg.payload ?? msg.Payload);
  console.log("[WS EVENT]", {
    type: rawType,
    normalizedType: type,
    data,
    raw: msg
  });
  if (type !== "BEACONTICK" && !QUIET_EVENT_TYPES.includes(type)) {
    const { useEventPanelStore: useEventPanelStore2 } = await __vitePreload(async () => {
      const { useEventPanelStore: useEventPanelStore3 } = await Promise.resolve().then(() => eventPanel);
      return { useEventPanelStore: useEventPanelStore3 };
    }, true ? void 0 : void 0);
    useEventPanelStore2().recordEvent({
      rawType,
      type,
      data: data && typeof data === "object" ? data : msg,
      raw: msg,
      commandId: getTaskCommandId(data, msg),
      phase: getCommandPhase(data, msg),
      status: getCommandStatus(data, msg),
      resultType: getCommandResultType(data, msg)
    });
  }
  if (!data) return;
  switch (type) {
    case "BEACONREGISTERED":
    case "BEACONONLINE":
      {
        const { useAgentStore: useAgentStore2 } = await __vitePreload(async () => {
          const { useAgentStore: useAgentStore3 } = await Promise.resolve().then(() => agent);
          return { useAgentStore: useAgentStore3 };
        }, true ? void 0 : void 0);
        useAgentStore2().addAgent(data);
      }
      break;
    case "BEACONTICK":
      {
        const { useAgentStore: useAgentStore2 } = await __vitePreload(async () => {
          const { useAgentStore: useAgentStore3 } = await Promise.resolve().then(() => agent);
          return { useAgentStore: useAgentStore3 };
        }, true ? void 0 : void 0);
        const agentStore = useAgentStore2();
        const receivedAt = Date.now();
        agentStore.now = receivedAt;
        agentStore.updateAgent(getBeaconId(data), {
          lastSeen: new Date(receivedAt).toISOString(),
          status: "online"
        });
      }
      break;
    case "BEACONREMOVED":
      {
        const bid = getBeaconId(data);
        const { useAgentStore: useAgentStore2 } = await __vitePreload(async () => {
          const { useAgentStore: useAgentStore3 } = await Promise.resolve().then(() => agent);
          return { useAgentStore: useAgentStore3 };
        }, true ? void 0 : void 0);
        if (bid) useAgentStore2().removeAgent(String(bid));
      }
      break;
    case "COMMANDEVENT":
      await handleCommandEvent({
        data,
        raw: msg,
        commandId: getTaskCommandId(data, msg),
        phase: getCommandPhase(data, msg),
        status: getCommandStatus(data, msg),
        resultType: getCommandResultType(data, msg)
      });
      break;
    case "LISTENERSTATECHANGE":
    case "LISTENERSTATECHANGED":
      {
        const { useListenerStore: useListenerStore2 } = await __vitePreload(async () => {
          const { useListenerStore: useListenerStore3 } = await Promise.resolve().then(() => listener);
          return { useListenerStore: useListenerStore3 };
        }, true ? void 0 : void 0);
        useListenerStore2().fetchListeners();
      }
      break;
    case "TUNNELSTARTED":
    case "TUNNELPAUSED":
    case "TUNNELRESUMED":
    case "TUNNELCLEARED":
    case "TUNNELSTOPPED":
    case "TUNNELUPDATED":
    case "TUNNELCHANNELOPEN":
    case "TUNNELCHANNELCLOSE":
    case "TUNNELCHANNELRECYCLED":
    case "TUNNELSTATS":
    case "TUNNELERROR":
      await handleTunnelEvent({ type, data });
      break;
    case "SYSTEMLOG":
      console.log("[SYSTEM]", data.content || data);
      break;
  }
}
const useWSStore = /* @__PURE__ */ defineStore("ws", {
  // ─── 状态 ───
  state: () => ({
    socket: null,
    status: "closed",
    reconnectCount: 0,
    maxReconnect: 5,
    reconnectTimer: null,
    nativeWsRegistered: false,
    nativeWsUnsubscribers: [],
    manualDisconnect: false
  }),
  actions: {
    // ─── Wails 原生事件桥接 ───
    ensureNativeWebSocketEvents() {
      if (this.nativeWsRegistered) return;
      this.nativeWsUnsubscribers = [
        On("teamserver:ws:message", (event) => {
          const payload = event == null ? void 0 : event.data;
          const data = (payload == null ? void 0 : payload.data) ?? (payload == null ? void 0 : payload.Data) ?? payload;
          if (data !== void 0 && data !== null) {
            this.handleMessage(String(data));
          }
        }),
        On("teamserver:ws:status", (event) => {
          const payload = (event == null ? void 0 : event.data) || {};
          const status = String(payload.status || payload.Status || "").toLowerCase();
          if (status === "open") {
            console.log("[WS] ✅ Go WebSocket 链路已连接");
            this.status = "open";
            this.reconnectCount = 0;
            return;
          }
          if (status === "connecting") {
            this.status = "connecting";
            return;
          }
          if (status === "closed") {
            console.log("[WS] ❌ Go WebSocket 链路已关闭");
            this.status = "closed";
            if (!this.manualDisconnect) {
              this.handleReconnect();
            }
          }
        }),
        On("teamserver:ws:error", (event) => {
          const payload = (event == null ? void 0 : event.data) || {};
          const message = payload.message || payload.Message || "unknown websocket error";
          console.error("[WS] ⚠️ Go WebSocket 链路异常:", message);
          this.status = "error";
          if (!this.manualDisconnect) {
            this.handleReconnect();
          }
        })
      ];
      this.nativeWsRegistered = true;
    },
    // ─── 连接管理 ───
    /**
     * 核心连接方法
     * @param {string} explicitToken 如果提供，则直接使用该 Token
     */
    async connect(explicitToken = null) {
      if (this.status === "open" || this.status === "connecting") return;
      let token = explicitToken;
      let apiBase = "";
      try {
        const { useAuthStore: useAuthStore2 } = await __vitePreload(async () => {
          const { useAuthStore: useAuthStore3 } = await Promise.resolve().then(() => auth);
          return { useAuthStore: useAuthStore3 };
        }, true ? void 0 : void 0);
        const authStore = useAuthStore2();
        if (!token) token = authStore.token;
        apiBase = authStore.apiBase;
      } catch (e) {
        console.error("[WS] Failed to get context from authStore:", e);
      }
      if (!token) {
        console.warn("[WS] No token available for connection");
        return;
      }
      const targetApiBase = apiBase || window.location.origin;
      this.ensureNativeWebSocketEvents();
      this.manualDisconnect = false;
      console.log(`[WS] 📡 准备建立 Go WebSocket 受控链路: ${targetApiBase}`);
      this.status = "connecting";
      try {
        await Connect(targetApiBase, token);
        if (!this.manualDisconnect) {
          this.status = "open";
          this.reconnectCount = 0;
        }
      } catch (err) {
        console.error("[WS] 🚨 Go WebSocket 链路创建失败:", err);
        this.status = "error";
        if (!this.manualDisconnect) {
          this.handleReconnect();
        }
      }
    },
    /** 
     * 等待连接成功
     */
    waitForConnection(timeout = 1e4) {
      if (this.status === "open") return Promise.resolve();
      return new Promise((resolve2, reject) => {
        const start = Date.now();
        const timer = setInterval(() => {
          if (this.status === "open") {
            clearInterval(timer);
            resolve2();
          } else if (this.status === "error" || Date.now() - start > timeout) {
            clearInterval(timer);
            reject(new Error(this.status === "error" ? "受控链路连接失败" : "链路连接超时 (10s)"));
          }
        }, 200);
      });
    },
    /**
     * 处理收到的原始消息
     */
    async handleMessage(rawData) {
      try {
        await handleWsEventMessage(rawData);
      } catch (err) {
        console.warn("[WS] Event process failed:", err);
      }
    },
    // ─── 重连策略 ───
    handleReconnect() {
      if (this.manualDisconnect || this.reconnectTimer) return;
      if (this.reconnectCount < this.maxReconnect) {
        this.reconnectCount++;
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 3e3);
      }
    },
    // ─── 断开连接 ───
    disconnect() {
      this.manualDisconnect = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.nativeWsUnsubscribers.length) {
        this.nativeWsUnsubscribers.forEach((unsub) => unsub());
        this.nativeWsUnsubscribers = [];
        this.nativeWsRegistered = false;
      }
      Disconnect().catch((err) => {
        console.warn("[WS] Go WebSocket disconnect failed:", err);
      });
      if (this.socket) {
        this.socket.onclose = null;
        this.socket.close();
        this.socket = null;
      }
      this.status = "closed";
    }
  }
});
async function listListeners() {
  return await request("GET", "/api/v1/listener/list");
}
async function createListener(config) {
  return await request("POST", "/api/v1/listener/create", config);
}
async function pauseListener(name) {
  return await request("POST", "/api/v1/listener/pause", { name });
}
async function resumeListener(name) {
  return await request("POST", "/api/v1/listener/resume", { name });
}
async function removeListener(name) {
  return await request("POST", "/api/v1/listener/remove", { name });
}
async function editListener(payload) {
  return await request("POST", "/api/v1/listener/edit", payload);
}
const useListenerStore = /* @__PURE__ */ defineStore("listener", {
  state: () => ({
    /** @type {Array<{id: string, name: string, protocol: string, status: string, created_at: string, config: string}>} */
    listeners: [],
    loading: false
  }),
  getters: {
    /** 获取运行中的监听器 */
    runningListeners: (state) => state.listeners.filter((l) => l.status === "started")
  },
  actions: {
    /** 获取最新的监听器列表 */
    async fetchListeners() {
      this.loading = true;
      try {
        const data = await listListeners();
        this.listeners = data || [];
      } catch (err) {
        console.error("获取监听器列表失败:", err);
      } finally {
        this.loading = false;
      }
    },
    /** 创建监听器 */
    async createListener(config) {
      try {
        await createListener(config);
        await this.fetchListeners();
        return this.listeners.find((l) => l.name === config.name);
      } catch (err) {
        console.error("创建监听器失败:", err);
        throw err;
      }
    },
    /** 删除监听器 */
    async deleteListener(name) {
      try {
        await removeListener(name);
        this.listeners = this.listeners.filter((l) => l.name !== name);
      } catch (err) {
        console.error("删除监听器失败:", err);
        throw err;
      }
    },
    /** 启动 (Resume) 监听器 */
    async startListener(name) {
      try {
        await resumeListener(name);
        const listener2 = this.listeners.find((l) => l.name === name);
        if (listener2) listener2.status = "started";
      } catch (err) {
        console.error("启动监听器失败:", err);
        throw err;
      }
    },
    /** 暂停 (Pause) 监听器 */
    async stopListener(name) {
      try {
        await pauseListener(name);
        const listener2 = this.listeners.find((l) => l.name === name);
        if (listener2) listener2.status = "paused";
      } catch (err) {
        console.error("停止监听器失败:", err);
        throw err;
      }
    },
    /** 更新监听器配置 (Edit) */
    async updateListener(payload) {
      try {
        await editListener(payload);
        await this.fetchListeners();
        return this.listeners.find((l) => l.name === payload.name);
      } catch (err) {
        console.error("更新监听器失败:", err);
        throw err;
      }
    }
  }
});
const listener = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  useListenerStore
}, Symbol.toStringTag, { value: "Module" }));
const COMMAND_ID = {
  // 通用控制 (1-9)
  SLEEP: 1,
  EXIT: 2,
  // 基础执行 (10-19)
  SHELL: 10,
  POWERSHELL: 11,
  // 文件系统 (20-39)
  CD: 20,
  LS: 21,
  PWD: 22,
  CAT: 23,
  MKDIR: 24,
  RM: 25,
  MV: 26,
  CP: 27,
  // 数据传输
  DOWNLOAD: 28,
  UPLOAD: 29,
  SETATTR: 31,
  ZIP: 32,
  // 进程与令牌 / 网络 / 截图 (40-59)
  PS: 40,
  KILLJOB: 41,
  KILL: 42,
  STEAL_TOKEN: 43,
  JOBS: 44,
  WHOAMI: 50,
  SCREENSHOT: 51,
  NETINFO: 52,
  NETSTAT: 53,
  // Cascade 级联 (80-89)
  CASCADE_CONNECT_TCP: 80,
  CONNECT: 80,
  CASCADE_LINK_SMB: 81,
  LINK: 81,
  CASCADE_ROUTE: 82,
  CASCADE_CLOSE: 83,
  CASCADE_OPEN: 84,
  CASCADE_READ: 85,
  CASCADE_DEAD: 86,
  CASCADE_PING: 87
};
const PLUGIN_COMMAND_ID = {
  EXECUTION_BOF: 70
};
const COMMAND_NAME = Object.fromEntries(
  [
    ...Object.entries(COMMAND_ID),
    ...Object.entries(PLUGIN_COMMAND_ID)
  ].map(([key, value]) => [value, key.toLowerCase()])
);
function getCommandId(name) {
  if (!name) return null;
  const upperName = name.toUpperCase();
  return COMMAND_ID[upperName] || null;
}
const COMMAND_HELP = {
  SLEEP: {
    usage: "sleep <ms> [jitter]",
    desc: "设置 Beacon 心跳间隔和抖动比例",
    notes: "例如: sleep 5000 10 (建议 ms 不要低于 1000)"
  },
  EXIT: {
    usage: "exit",
    desc: "终止当前 Beacon 会话",
    notes: "此操作将彻底关闭目标上的 Beacon 进程"
  },
  SHELL: {
    usage: "shell <raw_command>",
    desc: "通过 cmd.exe 执行系统命令",
    notes: '固定只传 1 个原始命令字符串；前端不会按空格拆分。引号、括号、管道、重定向等字符会保留。例如: shell copy "C:\\Temp\\a (1).txt" C:\\Temp\\b.txt'
  },
  POWERSHELL: {
    usage: "powershell <raw_command>",
    desc: "执行 PowerShell 命令",
    notes: '固定只传 1 个原始命令字符串；前端不会按空格拆分。路径建议使用 -LiteralPath 并保留引号。例如: powershell Copy-Item -LiteralPath "C:\\Users\\Administrator\\Desktop\\inject (2).exe" -Destination "C:\\Users\\Administrator\\Desktop\\message111.exe"'
  },
  CD: {
    usage: "cd [path]",
    desc: "切换工作目录或查看当前路径",
    notes: "支持绝对/相对路径；不带参数时返回当前工作目录"
  },
  LS: {
    usage: "ls [path]",
    desc: "列出目录内容",
    notes: "若不带路径则列出当前目录"
  },
  PWD: {
    usage: "pwd",
    desc: "显示当前完整路径",
    notes: "获取 Beacon 所在的当前绝对路径"
  },
  CAT: {
    usage: "cat <file>",
    desc: "读取并显示文本文件内容",
    notes: "安全限制：最大支持读取 10MB 以内的文件"
  },
  MKDIR: {
    usage: "mkdir <name>",
    desc: "创建新目录",
    notes: "支持创建单层或多层目录"
  },
  RM: {
    usage: "rm <path>",
    desc: "删除文件或目录",
    notes: "警告：此操作不可恢复，请谨慎使用"
  },
  MV: {
    usage: "mv <src> <dst>",
    desc: "移动或重命名文件/目录",
    notes: "跨分区移动可能会触发复制操作"
  },
  CP: {
    usage: "cp <src> <dst>",
    desc: "复制文件或目录",
    notes: "备份重要文件时的常用指令"
  },
  SETATTR: {
    usage: "setattr <TargetPath> <ModifyFlag> [new_name] [MTime] [ATime] [CTime] [WinAttributes] [LinuxMode]",
    desc: "修改文件或文件夹属性",
    notes: [
      "参数按前端实际选择的顺序发送，未启用的字段不发送。",
      "ModifyFlag 位掩码：1=new_name，2=MTime，4=ATime，8=CTime，16=WinAttributes，32=LinuxMode。",
      "例如：3 表示同时修改 new_name 和 MTime；16 表示仅修改 Windows 属性。",
      "示例：setattr C:\\test.txt 3 renamed.txt 1730000000"
    ].join("\n")
  },
  ZIP: {
    usage: "zip <source_path> <zip_path> [overwrite] [include_root]",
    desc: "压缩文件或目录为 ZIP 文件",
    notes: [
      "source_path 为要压缩的文件或目录。",
      "zip_path 为输出 zip 文件路径。",
      "overwrite 默认 0；1 表示覆盖已存在 zip，0 表示已存在时返回失败。",
      "include_root 默认 1；压缩目录时 1 表示包含根目录名，0 表示只压缩目录内容。",
      "例如：zip C:\\Temp\\logs C:\\Temp\\logs.zip 1 1"
    ].join("\n")
  },
  PS: {
    usage: "ps",
    desc: "列出系统运行中进程",
    notes: "返回 PID, PPID, 名称, 路径等信息"
  },
  KILLJOB: {
    usage: "killjob <job_id>",
    desc: "停止指定后台 job",
    notes: [
      "job_id 当前等于创建该后台 job 时返回的 task_id。",
      "参数必须是 int32 正整数。",
      "例如：killjob 123"
    ].join("\n")
  },
  KILL: {
    usage: "kill <PID>",
    desc: "终止指定进程",
    notes: "请确认 PID 正确，强制结束无法撤销"
  },
  STEAL_TOKEN: {
    usage: "steal_token <PID>",
    desc: "窃取目标进程令牌",
    notes: "提升权限或切换身份时使用"
  },
  JOBS: {
    usage: "jobs",
    desc: "查看当前 Beacon 后台 job 列表",
    notes: [
      "无参数。",
      "返回当前 Beacon 内存中的后台 job 列表。",
      "job_id 当前等于创建该后台 job 时对应的 task_id。"
    ].join("\n")
  },
  WHOAMI: {
    usage: "whoami",
    desc: "查看当前用户权限信息",
    notes: "显示当前会话的完整用户信息"
  },
  SCREENSHOT: {
    usage: "screenshot [monitor_id] [quality]",
    desc: "获取屏幕截图",
    notes: [
      "monitor_id 默认 0，表示主显示器。",
      "quality 默认 80，取值范围 1-100。",
      "前端下发时直接发送参数，Beacon 侧再解析为整数。"
    ].join("\n")
  },
  NETINFO: {
    usage: "netinfo",
    desc: "列出网络接口信息",
    notes: [
      "无参数。",
      "返回接口索引、名称、MTU、flags、MAC、地址等信息。"
    ].join("\n")
  },
  NETSTAT: {
    usage: "netstat",
    desc: "列出网络连接快照",
    notes: [
      "无参数。",
      "返回协议、本地/远端地址、状态和 PID。"
    ].join("\n")
  },
  CASCADE_CONNECT_TCP: {
    usage: "connect [child_id] <host> <port>",
    desc: "通过 TCP 连接子 Beacon",
    notes: "child_id 可选，留空则由服务端自动分配"
  },
  CASCADE_LINK_SMB: {
    usage: "link [child_id] <pipe_name>",
    desc: "通过 SMB pipe 连接子 Beacon",
    notes: "child_id 可选，留空则由服务端自动分配"
  },
  HELP: {
    usage: "help [command]",
    desc: "显示指令帮助信息",
    notes: "不带参数显示全部，带参数显示特定指令详情"
  }
};
const COMMAND_HELP_ALIASES = {
  CONNECT: "CASCADE_CONNECT_TCP",
  LINK: "CASCADE_LINK_SMB"
};
const LOCAL_COMMAND_HELP = {
  "EXEC-BOF": {
    usage: "exec-bof",
    desc: "打开 BOF 执行窗口",
    notes: "这是控制台本地入口，不直接发送给 Beacon；会弹出 BOF 执行对话框。"
  }
};
const MENU_ACTION_COMMAND_MAP = {
  "exec-bof": PLUGIN_COMMAND_ID.EXECUTION_BOF
};
const PLATFORM_UNSUPPORTED_COMMANDS = {
  linux: {
    names: /* @__PURE__ */ new Set(["powershell"])
  }
};
function normalizeBeaconPlatform(os) {
  const text = String(os || "").toLowerCase();
  if (text.includes("windows")) return "windows";
  if (text.includes("linux")) return "linux";
  if (text.includes("darwin") || text.includes("mac")) return "darwin";
  return "unknown";
}
function normalizeBeaconArch(arch) {
  const text = String(arch || "").trim().toLowerCase();
  if (["amd64", "x64", "x86_64"].includes(text)) return "amd64";
  if (["x86", "i386", "386"].includes(text)) return "x86";
  return text || "unknown";
}
function isCommandSupportedForOS(command, os) {
  var _a2, _b, _c;
  const platform = normalizeBeaconPlatform(os);
  const rules = PLATFORM_UNSUPPORTED_COMMANDS[platform];
  if (!rules) return true;
  if (typeof command === "number") {
    if ((_a2 = rules.ids) == null ? void 0 : _a2.has(command)) return false;
    const mappedName = String(COMMAND_NAME[command] || "").toLowerCase();
    return mappedName ? !((_b = rules.names) == null ? void 0 : _b.has(mappedName)) : true;
  }
  const normalizedName = String(command || "").trim().toLowerCase().replace(/_/g, "-");
  if (!normalizedName) return true;
  return !((_c = rules.names) == null ? void 0 : _c.has(normalizedName));
}
function getSupportedCommandNamesForOS(os) {
  return Object.keys(COMMAND_ID).map((name) => name.toLowerCase()).filter((name) => isCommandSupportedForOS(name, os));
}
function getSupportedLocalCommandNamesForOS(os) {
  return Object.keys(LOCAL_COMMAND_HELP).map((name) => name.toLowerCase()).filter((name) => isCommandSupportedForOS(name, os));
}
function getSupportedCommandHelpEntriesForOS(os) {
  return Object.entries(COMMAND_HELP).filter(([name]) => isCommandSupportedForOS(name, os));
}
function getSupportedLocalCommandHelpEntriesForOS(os) {
  return Object.entries(LOCAL_COMMAND_HELP).filter(([name]) => isCommandSupportedForOS(name, os));
}
function getUnsupportedCommandMessage(commandName, os) {
  const platform = normalizeBeaconPlatform(os);
  const platformLabel = platform === "linux" ? "Linux" : platform === "windows" ? "Windows" : "当前";
  return `当前 ${platformLabel} Beacon 不支持命令 "${commandName}"。`;
}
function isMenuActionSupportedForOS(action, os, commandId = null) {
  if (typeof commandId === "number" && Number.isFinite(commandId)) {
    return isCommandSupportedForOS(commandId, os);
  }
  const mappedCommandId = MENU_ACTION_COMMAND_MAP[String(action || "").trim().toLowerCase()];
  if (typeof mappedCommandId === "number") {
    return isCommandSupportedForOS(mappedCommandId, os);
  }
  return true;
}
function isBeaconArg(value) {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) && typeof value.kind === "string" && Object.prototype.hasOwnProperty.call(value, "value")
  );
}
function makeBeaconArg(kind, value) {
  return { kind, value };
}
function parseInt32Arg(value, label = "参数") {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`${label} 不能为空`);
  }
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new Error(`${label} 必须是整数`);
  }
  if (numeric < -2147483648 || numeric > 2147483647) {
    throw new Error(`${label} 超出 int32 范围`);
  }
  return numeric;
}
function parseInt16Arg(value, label = "参数") {
  const numeric = parseInt32Arg(value, label);
  if (numeric < -32768 || numeric > 32767) {
    throw new Error(`${label} 超出 short 范围`);
  }
  return numeric;
}
function parseUint32Arg(value, label = "参数") {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`${label} 不能为空`);
  }
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new Error(`${label} 必须是整数`);
  }
  if (numeric < 0 || numeric > 4294967295) {
    throw new Error(`${label} 超出 uint32 范围`);
  }
  return numeric;
}
function parseOptionalInt32Arg(value, fallback, label) {
  if (value === void 0 || value === null) return fallback;
  const text = String(value).trim();
  if (!text) return fallback;
  return parseInt32Arg(text, label);
}
function parseBoolArg(value, label = "参数") {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off", ""].includes(text)) return false;
  throw new Error(`${label} 必须是布尔值`);
}
function normalizeBeaconArg(arg) {
  if (isBeaconArg(arg)) {
    const kind = String(arg.kind || "string").trim().toLowerCase();
    if (kind === "bool") {
      return makeBeaconArg("bool", parseBoolArg(arg.value));
    }
    if (kind === "int32") {
      return makeBeaconArg("int32", parseInt32Arg(arg.value));
    }
    if (kind === "short" || kind === "int16") {
      return makeBeaconArg("short", parseInt16Arg(arg.value));
    }
    if (kind === "bytes") {
      return makeBeaconArg("bytes", String(arg.value ?? "").trim());
    }
    return makeBeaconArg("string", String(arg.value ?? ""));
  }
  if (typeof arg === "boolean") {
    return makeBeaconArg("bool", arg);
  }
  if (typeof arg === "number") {
    return makeBeaconArg("int32", parseInt32Arg(arg));
  }
  return makeBeaconArg("string", String(arg ?? ""));
}
function buildSetAttrArgs(args = []) {
  const source = Array.isArray(args) ? args : [];
  if (source.length < 2) {
    throw new Error("setattr 任务参数不完整");
  }
  const targetPath = String(source[0] ?? "").trim();
  if (!targetPath) {
    throw new Error("targetPath 不能为空");
  }
  const flag = parseInt32Arg(source[1], "ModifyFlag");
  const typedArgs = [
    makeBeaconArg("string", targetPath),
    makeBeaconArg("int32", flag)
  ];
  let index2 = 2;
  const nextValue = (label) => {
    if (index2 >= source.length) {
      throw new Error(`setattr 参数缺少 ${label}`);
    }
    const value = source[index2];
    index2 += 1;
    return value;
  };
  if (flag & 1) {
    typedArgs.push(makeBeaconArg("string", String(nextValue("new_name") ?? "")));
  }
  if (flag & 2) {
    typedArgs.push(makeBeaconArg("string", String(nextValue("MTime") ?? "")));
  }
  if (flag & 4) {
    typedArgs.push(makeBeaconArg("string", String(nextValue("ATime") ?? "")));
  }
  if (flag & 8) {
    typedArgs.push(makeBeaconArg("string", String(nextValue("CTime") ?? "")));
  }
  if (flag & 16) {
    typedArgs.push(makeBeaconArg("int32", parseInt32Arg(nextValue("WinAttributes"), "WinAttributes")));
  }
  if (flag & 32) {
    typedArgs.push(makeBeaconArg("int32", parseInt32Arg(nextValue("LinuxMode"), "LinuxMode")));
  }
  if (index2 !== source.length) {
    throw new Error("setattr 参数数量与 ModifyFlag 不匹配");
  }
  return typedArgs;
}
function buildBeaconCommandArgs(commandId, args = []) {
  var _a2;
  const source = Array.isArray(args) ? args : [];
  switch (Number(commandId)) {
    case COMMAND_ID.SHELL:
    case COMMAND_ID.POWERSHELL: {
      if (source.length !== 1) {
        throw new Error("Shell / PowerShell 命令必须只传 1 个 raw command 字符串");
      }
      const rawArg = normalizeBeaconArg(source[0]);
      if (rawArg.kind !== "string") {
        throw new Error("Shell / PowerShell 命令参数必须是 string");
      }
      if (!String(rawArg.value || "").trim()) {
        throw new Error("Shell / PowerShell raw command 不能为空");
      }
      return [makeBeaconArg("string", String(rawArg.value))];
    }
  }
  if (source.length === 0) return [];
  if (source.every(isBeaconArg)) {
    const normalized = source.map(normalizeBeaconArg);
    if (Number(commandId) === PLUGIN_COMMAND_ID.EXECUTION_BOF && ((_a2 = normalized[0]) == null ? void 0 : _a2.kind) !== "bytes") {
      throw new Error("BOF 命令第一个参数必须是 bytes 工件内容");
    }
    return normalized;
  }
  switch (Number(commandId)) {
    case PLUGIN_COMMAND_ID.EXECUTION_BOF:
      throw new Error("BOF 命令必须使用 typed args：bytes 工件 + BOF 参数规格");
    case COMMAND_ID.SLEEP:
      return [
        makeBeaconArg("int32", parseInt32Arg(source[0], "sleep_ms")),
        makeBeaconArg("int32", parseOptionalInt32Arg(source[1], 0, "jitter"))
      ];
    case COMMAND_ID.DOWNLOAD:
      return [
        makeBeaconArg("string", String(source[0] ?? "")),
        makeBeaconArg("int32", parseOptionalInt32Arg(source[1], 524288, "chunk_size")),
        makeBeaconArg("int32", parseOptionalInt32Arg(source[2], 3, "chunks_per_heartbeat"))
      ];
    case COMMAND_ID.UPLOAD:
      return [
        makeBeaconArg("string", String(source[0] ?? "")),
        makeBeaconArg("string", String(source[1] ?? "")),
        makeBeaconArg("int32", parseOptionalInt32Arg(source[2], 524288, "chunk_size"))
      ];
    case COMMAND_ID.KILLJOB:
      return [
        makeBeaconArg("int32", new Int32Array(new Uint32Array([parseUint32Arg(source[0], "job_id")]).buffer)[0])
      ];
    case COMMAND_ID.CASCADE_CONNECT_TCP:
      return [
        makeBeaconArg("string", String(source[0] || "")),
        makeBeaconArg("string", String(source[1] || "")),
        makeBeaconArg("int32", parseInt32Arg(source[2], "port"))
      ];
    case COMMAND_ID.CASCADE_LINK_SMB:
      return [
        makeBeaconArg("string", String(source[0] || "")),
        makeBeaconArg("string", String(source[1] || ""))
      ];
    case COMMAND_ID.KILL:
    case COMMAND_ID.STEAL_TOKEN:
      return [
        makeBeaconArg("int32", parseInt32Arg(source[0], "pid"))
      ];
    case COMMAND_ID.SCREENSHOT:
      return [
        makeBeaconArg("int32", parseOptionalInt32Arg(source[0], 0, "monitor_id")),
        makeBeaconArg("int32", parseOptionalInt32Arg(source[1], 80, "quality"))
      ];
    case COMMAND_ID.SETATTR:
      return buildSetAttrArgs(source);
    case COMMAND_ID.ZIP:
      return [
        makeBeaconArg("string", String(source[0] ?? "")),
        makeBeaconArg("string", String(source[1] ?? "")),
        makeBeaconArg("int32", parseOptionalInt32Arg(source[2], 0, "overwrite")),
        makeBeaconArg("int32", parseOptionalInt32Arg(source[3], 1, "include_root"))
      ];
    default:
      return source.map(normalizeBeaconArg);
  }
}
async function listBeacons() {
  return await request("GET", "/api/v1/beacon/list");
}
async function sendCommand(beaconid, commandId, args = []) {
  const normalizedArgs = buildBeaconCommandArgs(commandId, args);
  const payload = {
    beacon_id: String(beaconid),
    command: Number(commandId),
    args: normalizedArgs
  };
  return await request("POST", "/api/v1/beacon/command", payload);
}
async function removeBeacon(beaconid) {
  return await request("POST", "/api/v1/beacon/remove", { beacon_id: String(beaconid) });
}
function sendBeaconCommand(beaconid, commandId, args = []) {
  return sendCommand(beaconid, commandId, args);
}
function sendSleepCommand(beaconid, sleeptime, jitter) {
  return sendCommand(beaconid, COMMAND_ID.SLEEP, [sleeptime, jitter]);
}
function sendProcessListCommand(beaconid) {
  return sendCommand(beaconid, COMMAND_ID.PS, []);
}
function sendKillProcessCommand(beaconid, pid) {
  return sendCommand(beaconid, COMMAND_ID.KILL, [pid]);
}
function sendNetworkInfoCommand(beaconid) {
  return sendCommand(beaconid, COMMAND_ID.NETINFO, []);
}
function sendNetworkStatCommand(beaconid) {
  return sendCommand(beaconid, COMMAND_ID.NETSTAT, []);
}
function sendNetworkBrowserCommands(beaconid) {
  return Promise.all([
    sendNetworkInfoCommand(beaconid),
    sendNetworkStatCommand(beaconid)
  ]);
}
function sendPwdCommand(beaconid) {
  return sendCommand(beaconid, COMMAND_ID.PWD, []);
}
function sendSetAttrCommand(beaconid, args) {
  return sendCommand(beaconid, COMMAND_ID.SETATTR, args);
}
function sendZipCommand(beaconid, sourcePath, zipPath, overwrite, includeRoot) {
  return sendCommand(beaconid, COMMAND_ID.ZIP, [sourcePath, zipPath, overwrite, includeRoot]);
}
function sendDownloadCommand(beaconid, remotePath, chunkSize = 524288, retries = 3) {
  return sendCommand(beaconid, COMMAND_ID.DOWNLOAD, [remotePath, chunkSize, retries]);
}
function sendRemoveFileCommand(beaconid, remotePath) {
  return sendCommand(beaconid, COMMAND_ID.RM, [remotePath]);
}
function sendMoveFileCommand(beaconid, sourcePath, destinationPath) {
  return sendCommand(beaconid, COMMAND_ID.MV, [sourcePath, destinationPath]);
}
function sendCopyFileCommand(beaconid, sourcePath, destinationPath) {
  return sendCommand(beaconid, COMMAND_ID.CP, [sourcePath, destinationPath]);
}
function sendMkdirCommand(beaconid, remotePath) {
  return sendCommand(beaconid, COMMAND_ID.MKDIR, [remotePath]);
}
function sendUploadCommand(beaconid, fileId, remotePath, chunkSize = 524288) {
  return sendCommand(beaconid, COMMAND_ID.UPLOAD, [fileId, remotePath, chunkSize]);
}
function sendCascadeConnectCommand(beaconid, mode, args) {
  const commandId = mode === "tcp" ? COMMAND_ID.CASCADE_CONNECT_TCP : COMMAND_ID.CASCADE_LINK_SMB;
  return sendCommand(beaconid, commandId, args);
}
function sendExecutionBofCommand(beaconid, args) {
  return sendCommand(beaconid, PLUGIN_COMMAND_ID.EXECUTION_BOF, args);
}
function sendExitCommand(beaconid) {
  return sendCommand(beaconid, COMMAND_ID.EXIT);
}
const useConsoleStore = /* @__PURE__ */ defineStore("console", {
  // ─── 状态 ───
  state: () => ({
    /**
     * 已打开的控制台标签
     * @type {Array<{beaconid: string, history: Array<{type: 'input'|'output'|'error', content: string, timestamp: string}>}>}
     */
    activeConsoles: [],
    // 当前活跃的控制台 ID（对应某个 beaconid）
    activeBeaconId: null,
    // 全局控制台 Dock 是否展开
    consolePanelVisible: false,
    // 全局命令历史记录 (用于输入框上下键翻阅)
    commandHistory: []
  }),
  // ─── 计算属性 ───
  getters: {
    /** 获取当前激活控制台对象 */
    currentConsole: (state) => state.activeConsoles.find((c) => c.beaconid === state.activeBeaconId) || null
  },
  // ─── 方法 ───
  actions: {
    /** 打开或切换到对应 Agent 的控制台 Tab */
    openConsole(beaconid) {
      const exists = this.activeConsoles.find((c) => c.beaconid === beaconid);
      if (!exists) {
        this.activeConsoles.push({ beaconid, history: [] });
      }
      this.activeBeaconId = beaconid;
      this.consolePanelVisible = true;
    },
    /** 关闭指定 Agent 的控制台 Tab */
    closeConsole(beaconid) {
      this.activeConsoles = this.activeConsoles.filter((c) => c.beaconid !== beaconid);
      if (this.activeBeaconId === beaconid) {
        this.activeBeaconId = this.activeConsoles.length > 0 ? this.activeConsoles[this.activeConsoles.length - 1].beaconid : null;
      }
      if (this.activeConsoles.length === 0) {
        this.consolePanelVisible = false;
      }
    },
    /** 切换当前激活 Tab */
    setActiveConsole(beaconid) {
      this.activeBeaconId = beaconid;
    },
    /** 发送命令（已支持结构化参数） */
    async sendCommand(beaconid, commandId, args = [], fullCommandString = "") {
      const tab = this.activeConsoles.find((c) => c.beaconid === beaconid);
      if (!tab) return;
      tab.history.push({
        type: "input",
        content: fullCommandString,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      try {
        await sendBeaconCommand(beaconid, commandId, args);
        if (commandId === COMMAND_ID.SLEEP && args.length >= 1) {
          const { useAgentStore: useAgentStore2 } = await __vitePreload(async () => {
            const { useAgentStore: useAgentStore3 } = await Promise.resolve().then(() => agent);
            return { useAgentStore: useAgentStore3 };
          }, true ? void 0 : void 0);
          const agentStore = useAgentStore2();
          agentStore.updateAgent(beaconid, { sleep: (Number(args[0]) || 0) / 1e3, jitter: Number(args[1]) || 0 });
        }
        if (fullCommandString && this.commandHistory[this.commandHistory.length - 1] !== fullCommandString) {
          this.commandHistory.push(fullCommandString);
          if (this.commandHistory.length > 100) this.commandHistory.shift();
        }
      } catch (err) {
        tab.history.push({
          type: "error",
          content: `发送指令失败: ${err.message}`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    },
    /** 服务端推送结果（WebSocket 回调调用） */
    pushCommandResult(beaconid, result) {
      const tab = this.activeConsoles.find((c) => c.beaconid === beaconid);
      if (tab) {
        tab.history.push({
          type: "output",
          content: result,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    },
    /** 向指定 Agent 控制台写入一条记录（供其他模块集成用） */
    appendToConsole(beaconid, type, content, prompt = "") {
      const tab = this.activeConsoles.find((c) => c.beaconid === beaconid);
      if (tab) {
        tab.history.push({
          type,
          content,
          prompt,
          // 新增：保存自定义提示符
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    }
  }
});
const console$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  useConsoleStore
}, Symbol.toStringTag, { value: "Module" }));
function normalizePathKey(path) {
  if (path === void 0 || path === null) return "";
  let n = path.trim();
  if (!n) return "";
  const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(n) || /^[a-zA-Z]:$/.test(n) || /^\\\\/.test(n) || n.includes("\\");
  if (isWindowsPath) {
    n = n.replace(/\//g, "\\");
    n = n.toLowerCase();
    n = n.replace(/\\+/g, "\\");
    if (/^[a-z]:$/.test(n)) {
      n += "\\";
    }
    if (n.length > 3 && n.endsWith("\\")) {
      n = n.substring(0, n.length - 1);
    }
    return n;
  }
  n = n.replace(/\\/g, "/");
  n = n.replace(/\/+/g, "/");
  if (n.length > 1 && n.endsWith("/")) {
    n = n.substring(0, n.length - 1);
  }
  return n;
}
function joinPaths(base, sub) {
  const normalizedBase = normalizePathKey(base);
  const normalizedSub = normalizePathKey(sub);
  if (!normalizedBase) return normalizedSub;
  if (!normalizedSub) return normalizedBase;
  if (/^[a-zA-Z]:[\\/]/.test(normalizedSub) || /^\\\\/.test(normalizedSub) || normalizedSub.startsWith("/")) {
    return normalizedSub;
  }
  const useWindowsSeparator = normalizedBase.includes("\\") || /^[a-zA-Z]:/.test(normalizedBase) || /^\\\\/.test(normalizedBase);
  const separator = useWindowsSeparator ? "\\" : "/";
  const baseWithSeparator = normalizedBase.endsWith(separator) ? normalizedBase : normalizedBase + separator;
  const subWithoutSeparator = normalizedSub.startsWith(separator) ? normalizedSub.substring(1) : normalizedSub;
  return normalizePathKey(baseWithSeparator + subWithoutSeparator);
}
function parseMaybeJson$2(value) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}
function unwrapExplorerResult(result) {
  let value = parseMaybeJson$2(result);
  if (!value || typeof value !== "object") return value;
  value = value.explorer_files || value.explorerFiles || value.ExplorerFiles || value.result || value.Result || value.data || value.Data || value;
  return parseMaybeJson$2(value);
}
function normalizeFileInfo(file) {
  if (!file || typeof file !== "object") return file;
  const isDir = file.is_dir ?? file.isDir ?? file.IsDir ?? false;
  return {
    name: file.name ?? file.Name ?? "",
    path: file.path ?? file.Path ?? "",
    is_dir: Boolean(isDir),
    size: Number(file.size ?? file.Size ?? 0),
    mod_time: Number(file.mod_time ?? file.modTime ?? file.ModTime ?? 0),
    permission: file.permission ?? file.Permission ?? "",
    owner: file.owner ?? file.Owner ?? "",
    is_hidden: Boolean(file.is_hidden ?? file.isHidden ?? file.IsHidden ?? false)
  };
}
function isExplorerAbsolutePath(path) {
  if (!path || typeof path !== "string") return false;
  return path.startsWith("/") || path.startsWith("\\\\") || /^[a-zA-Z]:[\\/]/.test(path);
}
function absolutizeExplorerFile(file, basePath, isWindowsAgent) {
  const normalized = normalizeFileInfo(file);
  if (!normalized || typeof normalized !== "object") return normalized;
  const fallbackPath = normalized.path || normalized.name || "";
  let nextPath = String(fallbackPath || "");
  if (!nextPath) return normalized;
  if (!isExplorerAbsolutePath(nextPath)) {
    if (basePath) {
      nextPath = joinPaths(basePath, nextPath);
    } else if (!isWindowsAgent) {
      nextPath = normalizePathKey(`/${nextPath.replace(/^\/+/, "")}`);
    }
  } else {
    nextPath = normalizePathKey(nextPath);
  }
  return {
    ...normalized,
    path: nextPath
  };
}
const explorerRequestTimers = /* @__PURE__ */ new Map();
const EXPLORER_REQUEST_TIMEOUT_MS = 15e3;
const cwdResolvers = /* @__PURE__ */ new Map();
const CWD_REQUEST_TIMEOUT_MS = 1e4;
function getRequestTimerKey(beaconid, path) {
  return `${beaconid}::${normalizePathKey(path)}`;
}
function getTextResultContent(payload) {
  if (payload === void 0 || payload === null) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    const text = payload.text ?? payload.Text ?? payload.value ?? payload.Value;
    if (text !== void 0 && text !== null && text !== "") return String(text);
  }
  return "";
}
const useExplorerStore = /* @__PURE__ */ defineStore("explorer", {
  // ─── 状态 ───
  state: () => ({
    /** 
     * 双层 Map 缓存结构：{ [beaconid]: { [normalizedPath]: { isLoaded, lastUpdate, items, errorMessage } } } 
     */
    cache: {},
    /** 
     * 盘符列表：{ [beaconid]: ["C:\", "D:\", ...] } 
     */
    drives: {},
    /** 
     * 正在加载的路径锁：{ [beaconid]: Set(['path1', 'path2']) } 
     */
    loadingPaths: {},
    /** 
     * 对应 Beacon 的当前焦点路径 (未归一化，用于 UI 输入框显示) 
     */
    uiCurrentPath: {},
    /**
     * Linux/Unix Beacon 当前工作目录（由 pwd 获取）
     */
    workingDirectories: {}
  }),
  // ─── 方法 ───
  actions: {
    // ─── 缓存查询 ───
    /**
     * 获取路径缓存节点
     */
    getCacheNode(beaconid, path) {
      const nPath = normalizePathKey(path);
      if (!this.cache[beaconid]) return null;
      return this.cache[beaconid][nPath] || null;
    },
    async requestCurrentDirectory(beaconid) {
      const existing = cwdResolvers.get(beaconid);
      if (existing == null ? void 0 : existing.promise) return existing.promise;
      const promise = new Promise((resolve2, reject) => {
        const timer = setTimeout(() => {
          cwdResolvers.delete(beaconid);
          reject(new Error("获取当前工作目录超时，请重试"));
        }, CWD_REQUEST_TIMEOUT_MS);
        cwdResolvers.set(beaconid, {
          resolve: resolve2,
          reject,
          timer,
          promise: null
        });
      });
      const resolver = cwdResolvers.get(beaconid);
      if (resolver) resolver.promise = promise;
      try {
        await sendPwdCommand(beaconid);
      } catch (err) {
        const pending = cwdResolvers.get(beaconid);
        if (pending) {
          clearTimeout(pending.timer);
          cwdResolvers.delete(beaconid);
          pending.reject(err);
        }
        throw err;
      }
      return promise;
    },
    // ─── 目录加载 ───
    /**
     * [核心] 加载目录逻辑 (对接 explorerFiles)
     * @param {string} beaconid 
     * @param {string} path 
     * @param {boolean} force 是否强制刷新
     */
    async loadDirectory(beaconid, path, force = false, options = {}) {
      var _a2;
      const agentStore = useAgentStore();
      const agentOS = String(((_a2 = agentStore.getAgentById(beaconid)) == null ? void 0 : _a2.os) || "").toLowerCase();
      const isWindowsAgent = agentOS.includes("windows");
      let requestPath = path;
      if ((!requestPath || !String(requestPath).trim()) && !isWindowsAgent) {
        requestPath = await this.requestCurrentDirectory(beaconid);
        this.workingDirectories[beaconid] = normalizePathKey(requestPath);
      }
      const nPath = normalizePathKey(requestPath);
      const limit = Math.min(5e3, Math.max(1, Number(options.limit ?? 1e3) || 1e3));
      const offset = Math.max(0, Number(options.offset ?? 0) || 0);
      const append = Boolean(options.append && offset > 0);
      this.uiCurrentPath[beaconid] = nPath;
      const node = this.getCacheNode(beaconid, nPath);
      if (!force && !append && (node == null ? void 0 : node.isLoaded)) {
        console.log(`[ExplorerStore] 命中缓存: ${nPath}`);
        return;
      }
      if (this.isPathLoading(beaconid, nPath)) {
        console.log(`[ExplorerStore] 正在加载中，跳过重复请求: ${nPath}`);
        return;
      }
      try {
        this.setPathLoading(beaconid, nPath, true);
        const timerKey = getRequestTimerKey(beaconid, nPath);
        clearTimeout(explorerRequestTimers.get(timerKey));
        explorerRequestTimers.set(timerKey, setTimeout(() => {
          if (!this.isPathLoading(beaconid, nPath)) return;
          console.warn(`[ExplorerStore] 目录请求超时: ${nPath}`);
          if (!this.cache[beaconid]) this.cache[beaconid] = {};
          this.cache[beaconid][nPath] = {
            ...this.cache[beaconid][nPath] || {},
            isLoaded: false,
            errorMessage: "目录加载超时，请重试或检查后端事件返回"
          };
          this.setPathLoading(beaconid, nPath, false);
        }, EXPLORER_REQUEST_TIMEOUT_MS));
        console.log(`[ExplorerStore] 发起目录刷新请求: ${nPath} (force=${force}, offset=${offset}, limit=${limit}, append=${append})`);
        await explorerFiles(beaconid, nPath, limit, offset);
      } catch (err) {
        console.error(`[ExplorerStore] 请求目录失败: ${nPath}`, err);
        if (!this.cache[beaconid]) this.cache[beaconid] = {};
        this.cache[beaconid][nPath] = {
          ...this.cache[beaconid][nPath] || {},
          isLoaded: false,
          errorMessage: err.message || String(err)
        };
        this.setPathLoading(beaconid, nPath, false);
      }
    },
    // ─── 响应处理 ───
    /**
     * 处理后端响应
     */
    handleExplorerResponse(beaconid, result) {
      var _a2, _b;
      const agentStore = useAgentStore();
      const agentOS = String(((_a2 = agentStore.getAgentById(beaconid)) == null ? void 0 : _a2.os) || "").toLowerCase();
      const isWindowsAgent = agentOS.includes("windows");
      const value = unwrapExplorerResult(result);
      if (!value || typeof value !== "object") {
        const fallbackPath = normalizePathKey(this.uiCurrentPath[beaconid] || "");
        console.warn(`[ExplorerStore] 无法解析目录响应，回退清理路径锁: ${fallbackPath}`);
        this.setPathLoading(beaconid, fallbackPath, false);
        return;
      }
      const responsePath = String(value.path ?? value.Path ?? this.uiCurrentPath[beaconid] ?? "");
      const rawPath = responsePath === "" && !isWindowsAgent ? "/" : responsePath;
      const nPath = normalizePathKey(rawPath);
      const rawFiles = value.files ?? value.Files ?? [];
      const files = Array.isArray(rawFiles) ? rawFiles.map((file) => absolutizeExplorerFile(file, rawPath === "/" ? "/" : rawPath, isWindowsAgent)) : [];
      const limit = Math.min(5e3, Math.max(1, Number(value.limit ?? value.Limit ?? 1e3) || 1e3));
      const offset = Math.max(0, Number(value.offset ?? value.Offset ?? 0) || 0);
      const hasMore = Boolean(value.has_more ?? value.hasMore ?? value.HasMore ?? false);
      const errMsg = String(value.error_message ?? value.errorMessage ?? value.ErrorMessage ?? "");
      const timerKey = getRequestTimerKey(beaconid, nPath);
      clearTimeout(explorerRequestTimers.get(timerKey));
      explorerRequestTimers.delete(timerKey);
      this.setPathLoading(beaconid, nPath, false);
      if (responsePath === "" && isWindowsAgent && files.length > 0 && files.every((f) => f.is_dir)) {
        this.drives[beaconid] = files.map((f) => f.path || f.name);
      }
      if (!this.cache[beaconid]) this.cache[beaconid] = {};
      const existingItems = offset > 0 && Array.isArray((_b = this.cache[beaconid][nPath]) == null ? void 0 : _b.items) ? this.cache[beaconid][nPath].items : [];
      const mergedItems = offset > 0 ? [...existingItems, ...files].filter((item, index2, array) => {
        const currentKey = normalizePathKey((item == null ? void 0 : item.path) || (item == null ? void 0 : item.name) || `${index2}`);
        return array.findIndex((candidate) => normalizePathKey((candidate == null ? void 0 : candidate.path) || (candidate == null ? void 0 : candidate.name) || "") === currentKey) === index2;
      }) : files;
      this.cache[beaconid][nPath] = {
        isLoaded: true,
        lastUpdate: Date.now(),
        items: mergedItems,
        errorMessage: errMsg,
        limit,
        offset,
        hasMore
      };
      this.uiCurrentPath[beaconid] = rawPath;
      console.log(`[ExplorerStore] Path updated: ${nPath} for ${beaconid}. Items: ${files.length}`);
    },
    handlePwdResponse(beaconid, result) {
      const pending = cwdResolvers.get(beaconid);
      const text = normalizePathKey(getTextResultContent(result));
      if (!pending) return;
      clearTimeout(pending.timer);
      cwdResolvers.delete(beaconid);
      if (!text) {
        pending.reject(new Error("未获取到有效的当前工作目录"));
        return;
      }
      this.workingDirectories[beaconid] = text;
      pending.resolve(text);
    },
    // ─── 加载锁管理 ───
    /**
     * 设置路径加载锁
     */
    setPathLoading(beaconid, path, status) {
      if (!this.loadingPaths[beaconid]) this.loadingPaths[beaconid] = /* @__PURE__ */ new Set();
      const nPath = normalizePathKey(path);
      if (status) {
        this.loadingPaths[beaconid].add(nPath);
      } else {
        this.loadingPaths[beaconid].delete(nPath);
      }
    },
    /**
     * 检查路径是否正在加载
     */
    isPathLoading(beaconid, path) {
      var _a2;
      const nPath = normalizePathKey(path);
      return ((_a2 = this.loadingPaths[beaconid]) == null ? void 0 : _a2.has(nPath)) || false;
    },
    /**
     * 内存回收：清空特定 Beacon 的全量缓存
     */
    clearCache(beaconid) {
      const pending = cwdResolvers.get(beaconid);
      if (pending) {
        clearTimeout(pending.timer);
        cwdResolvers.delete(beaconid);
      }
      if (this.cache[beaconid]) delete this.cache[beaconid];
      if (this.drives[beaconid]) delete this.drives[beaconid];
      if (this.workingDirectories[beaconid]) delete this.workingDirectories[beaconid];
      if (this.loadingPaths[beaconid]) delete this.loadingPaths[beaconid];
      if (this.uiCurrentPath[beaconid]) delete this.uiCurrentPath[beaconid];
      console.log(`[ExplorerStore] Memory recovered for beacon: ${beaconid}`);
    }
  }
});
const explorer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  joinPaths,
  normalizePathKey,
  useExplorerStore
}, Symbol.toStringTag, { value: "Module" }));
function unwrapAgentPayload(agent2) {
  if (!agent2 || typeof agent2 !== "object") return agent2;
  if (agent2.beacon) return agent2.beacon;
  if (agent2.Beacon) return agent2.Beacon;
  if (agent2.agent) return agent2.agent;
  if (agent2.Agent) return agent2.Agent;
  if (agent2.data && typeof agent2.data === "object" && !agent2.data.beacon_id) return agent2.data;
  if (agent2.Data && typeof agent2.Data === "object" && !agent2.Data.BeaconID) return agent2.Data;
  return agent2;
}
function getAgentId(agent2) {
  if (!agent2 || typeof agent2 !== "object") return "";
  const id = agent2.beacon_id || agent2.beaconid || agent2.beaconId || agent2.BeaconID || agent2.BeaconId || agent2.id || agent2.ID || agent2.uuid || agent2.UUID;
  return id ? String(id) : "";
}
function normalizeLastSeen(value, now = Date.now()) {
  const fallback = new Date(now).toISOString();
  if (!value) return fallback;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return fallback;
  return time > now ? fallback : value;
}
function isCascadeAgent(agent2) {
  if (!agent2) return false;
  const listenerType = String(agent2.listenerType || agent2.listener_type || "").toLowerCase();
  const depth = Number(agent2.depth || agent2.Depth || 0);
  return listenerType === "internal" || depth > 0 || Boolean(agent2.parentId || agent2.parent_id);
}
function isLinkClosed(agent2) {
  const state = String((agent2 == null ? void 0 : agent2.linkState) || (agent2 == null ? void 0 : agent2.link_state) || "").toLowerCase();
  return ["lost", "closed", "disconnected", "failed", "error"].includes(state);
}
function isHeartbeatAlive(agent2, now) {
  if (!(agent2 == null ? void 0 : agent2.lastSeen)) return false;
  const lastSeenTime = new Date(agent2.lastSeen).getTime();
  if (!Number.isFinite(lastSeenTime)) return false;
  const diffSeconds = (now - lastSeenTime) / 1e3;
  return diffSeconds < 60;
}
function getParentBeaconId(agent2) {
  return String((agent2 == null ? void 0 : agent2.parentId) || (agent2 == null ? void 0 : agent2.parent_id) || "");
}
function findAgentById(agents, beaconid) {
  const id = String(beaconid || "");
  if (!id) return null;
  return agents.find((item) => item.beaconid === id || item.beaconid.startsWith(id) || id.startsWith(item.beaconid)) || null;
}
function resolveBeaconStatus(agent2, agents, now, visited = /* @__PURE__ */ new Set()) {
  if (!agent2) {
    return { kind: "offline", label: "离线", class: "tag-danger", dotClass: "offline" };
  }
  if (!isCascadeAgent(agent2)) {
    const online = isHeartbeatAlive(agent2, now);
    return {
      kind: online ? "online" : "offline",
      label: online ? "在线" : "离线",
      class: online ? "tag-success" : "tag-danger",
      dotClass: online ? "online" : "offline"
    };
  }
  if (isLinkClosed(agent2)) {
    return { kind: "offline", label: "离线", class: "tag-danger", dotClass: "offline" };
  }
  const parentId = getParentBeaconId(agent2);
  if (!parentId) {
    return { kind: "offline", label: "离线", class: "tag-danger", dotClass: "offline" };
  }
  if (visited.has(parentId)) {
    return { kind: "offline", label: "离线", class: "tag-danger", dotClass: "offline" };
  }
  const parent = findAgentById(agents, parentId);
  if (!parent) {
    return { kind: "offline", label: "离线", class: "tag-danger", dotClass: "offline" };
  }
  visited.add(parentId);
  const parentStatus = resolveBeaconStatus(parent, agents, now, visited);
  if (parentStatus.kind === "offline") {
    return { kind: "offline", label: "离线", class: "tag-danger", dotClass: "offline" };
  }
  return { kind: "cascade", label: "级联", class: "tag-info", dotClass: "cascade" };
}
const useAgentStore = /* @__PURE__ */ defineStore("agent", {
  // ─── 状态 ───
  state: () => ({
    /** @type {Array<{beaconid: string, hostname: string, username: string, os: string, arch: string, ip: string, lastSeen: string, status: string, listenerType: string, parentId: string, linkState: string}>} */
    agents: [],
    /** 响应式时钟，用于驱动状态判定 */
    now: Date.now()
  }),
  // ─── 计算属性 ───
  getters: {
    /** 统一判定单个 Agent 是否在线 */
    isOnline: (state) => (agent2) => {
      return resolveBeaconStatus(agent2, state.agents, state.now).kind === "online";
    },
    /** 统一返回 Agent 可达状态：online / offline / cascade */
    beaconStatus: (state) => (agent2) => {
      return resolveBeaconStatus(agent2, state.agents, state.now);
    },
    /** 直连在线 Agent 数量 */
    onlineCount(state) {
      return state.agents.filter((a) => this.isOnline(a)).length;
    },
    /** 级联可达 Agent 数量 */
    cascadeCount(state) {
      return state.agents.filter((a) => this.beaconStatus(a).kind === "cascade").length;
    },
    /** 通过 ID 查询 Agent */
    getAgentById: (state) => (beaconid) => state.agents.find((a) => a.beaconid === beaconid)
  },
  // ─── 方法 ───
  actions: {
    /** 添加或更新 Agent */
    addAgent(agent2) {
      agent2 = unwrapAgentPayload(agent2);
      const beaconid = getAgentId(agent2);
      if (!beaconid) {
        console.warn("[AgentStore] Agent missing ID field:", agent2);
        return;
      }
      const beaconKey = String(beaconid);
      const idx = this.agents.findIndex((a) => a.beaconid === beaconKey);
      const mappedAgent = {
        beaconid: beaconKey,
        // 强制转为字符串，防止 substring 崩溃
        hostname: agent2.hostname || agent2.Hostname || agent2.host_name || agent2.HostName || "Unknown",
        // 净化用户名：剔除 MACHINE\User 或 DOMAIN\User 中的前缀
        username: (agent2.username || agent2.Username || agent2.user_name || agent2.UserName || "Unknown").split("\\").pop(),
        os: agent2.os || agent2.OS || "Unknown",
        arch: agent2.arch || agent2.Arch || "Unknown",
        ip: agent2.internal_ip || agent2.internalIp || agent2.ip || agent2.InternalIP || agent2.InternalIp || "0.0.0.0",
        externalIp: agent2.external_ip || agent2.externalIp || agent2.ExternalIP || agent2.ExternalIp || "-",
        lastSeen: normalizeLastSeen(agent2.last_seen || agent2.LastSeen || agent2.lastSeen),
        status: agent2.status || agent2.Status || "online",
        processName: agent2.process_name || agent2.ProcessName || agent2.processName || agent2.process || agent2.Process || "-",
        pid: agent2.pid || agent2.PID || 0,
        acp: agent2.acp || agent2.ACP || 0,
        isAdmin: agent2.is_admin || agent2.IsAdmin || agent2.isAdmin || false,
        sleep: agent2.sleep || agent2.Sleep || 0,
        jitter: agent2.jitter || agent2.Jitter || 0,
        protocol: agent2.protocol || agent2.Protocol || "http",
        listener: agent2.listener || agent2.Listener || "-",
        listenerType: agent2.listener_type || agent2.ListenerType || "",
        parentId: agent2.parent_id || agent2.ParentId || agent2.ParentID || "",
        gatewayId: agent2.gateway_id || agent2.GatewayId || agent2.GatewayID || "",
        depth: agent2.depth || agent2.Depth || 0,
        linkProtocol: agent2.link_protocol || agent2.LinkProtocol || "",
        linkState: agent2.link_state || agent2.LinkState || "",
        linkHint: agent2.link_hint || agent2.LinkHint || "",
        linkAddr: agent2.link_addr || agent2.LinkAddr || agent2.linkAddr || ""
      };
      if (idx >= 0) {
        this.agents[idx] = { ...this.agents[idx], ...mappedAgent };
        console.log(`%c[AgentStore] UPDATED Agent: ${beaconKey}`, "color: #3b82f6");
      } else {
        this.agents.push(mappedAgent);
        console.log(`%c[AgentStore] NEW Agent Registered: ${beaconKey}`, "color: #10b981; font-weight: bold", mappedAgent);
      }
    },
    /** 全量获取并同步 Agent 列表 */
    async fetchAgents() {
      try {
        const data = await listBeacons();
        if (Array.isArray(data)) {
          this.agents = [];
          data.forEach((item) => this.addAgent(item));
        }
      } catch (err) {
        console.error("获取 Beacon 列表失败:", err);
      }
    },
    /** 彻底注销并删除 Agent */
    async removeBeacon(beaconid) {
      try {
        await removeBeacon(beaconid);
        this.agents = this.agents.filter((a) => a.beaconid !== beaconid);
        const consoleStore = useConsoleStore();
        consoleStore.closeConsole(beaconid);
        const explorerStore = useExplorerStore();
        explorerStore.clearCache(beaconid);
        return true;
      } catch (err) {
        console.error("删除会话失败:", err);
        throw err;
      }
    },
    /** 移除本地 Agent (仅前端清理，如 WS 断开等场景) */
    removeAgent(beaconid) {
      this.agents = this.agents.filter((a) => a.beaconid !== beaconid);
      const consoleStore = useConsoleStore();
      consoleStore.closeConsole(beaconid);
      const explorerStore = useExplorerStore();
      explorerStore.clearCache(beaconid);
    },
    /** 更新 Agent 部分字段 */
    updateAgent(beaconid, data) {
      beaconid = String(beaconid || "");
      const agent2 = this.agents.find((a) => a.beaconid === beaconid);
      if (agent2) {
        Object.keys(data).forEach((key) => {
          if (data[key] !== void 0 && data[key] !== null) {
            agent2[key] = key === "lastSeen" ? normalizeLastSeen(data[key], this.now) : data[key];
          }
        });
      } else if (beaconid) {
        this.addAgent({ ...data, beaconid });
      }
    },
    /** 驱动时钟脉冲 (每秒调用一次) */
    tick() {
      this.now = Date.now();
    }
  }
});
const agent = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  useAgentStore
}, Symbol.toStringTag, { value: "Module" }));
function listPlugins() {
  return ListPlugins();
}
function reloadPlugins() {
  return ReloadPlugins();
}
function addPlugin(pluginPath) {
  return AddPlugin(pluginPath);
}
function deletePlugin(pluginId) {
  return DeletePlugin(pluginId);
}
function invokePluginAction(pluginId, action, payloadJSON = "") {
  return InvokePluginAction(pluginId, action, payloadJSON);
}
function pick(data, keys, fallback = "") {
  if (!data || typeof data !== "object") return fallback;
  for (const key of keys) {
    if (data[key] !== void 0 && data[key] !== null && data[key] !== "") return data[key];
  }
  return fallback;
}
function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
function pickString(value, fallback = "") {
  if (value === void 0 || value === null) return fallback;
  const text = String(value);
  return text === "" ? fallback : text;
}
function normalizePluginActionField(field) {
  if (!field || typeof field !== "object") return null;
  return {
    name: pickString(field.name || field.Name),
    label: pickString(field.label || field.Label || field.name || field.Name),
    type: pickString(field.type || field.Type || "string").toLowerCase(),
    placeholder: pickString(field.placeholder || field.Placeholder || ""),
    defaultValue: field.default ?? field.default_value ?? field.defaultValue ?? field.Default ?? "",
    required: Boolean(field.required || field.Required),
    help: pickString(field.help || field.Help || ""),
    options: Array.isArray(field.options || field.Options) ? (field.options || field.Options).map((item) => pickString(item)).filter(Boolean) : []
  };
}
function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => pickString(item).trim().toLowerCase()).filter(Boolean);
}
function normalizeStringMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [pickString(key).trim().toLowerCase(), pickString(item).trim()]).filter(([key, item]) => key && item)
  );
}
function normalizePluginAction(action) {
  if (!action || typeof action !== "object") return null;
  const fields = Array.isArray(action.fields || action.Fields) ? (action.fields || action.Fields).map(normalizePluginActionField).filter(Boolean) : [];
  return {
    id: pickString(action.id || action.ID || action.name),
    label: pickString(action.label || action.Label || action.display_name || action.displayName || action.name || action.id || action.ID),
    description: pickString(action.description || action.Description || ""),
    os: normalizeStringList(action.os || action.OS),
    arch: normalizeStringList(action.arch || action.Arch),
    artifact: pickString(action.artifact || action.Artifact || action.binary || action.Binary || ""),
    artifactByArch: normalizeStringMap(action.artifact_by_arch || action.artifactByArch || action.ArtifactByArch),
    artifactData: pickString(action.artifact_data || action.artifactData || action.ArtifactData || ""),
    commandId: Number(action.command_id || action.commandId || action.CommandID || 0) || 0,
    requiresInput: Boolean(action.requires_input || action.requiresInput || action.RequiresInput || fields.length),
    fields,
    raw: action
  };
}
function normalizePlugin(plugin) {
  if (!plugin || typeof plugin !== "object") return null;
  const actions = Array.isArray(plugin.actions || plugin.Actions) ? (plugin.actions || plugin.Actions).map(normalizePluginAction).filter(Boolean) : [];
  return {
    id: pickString(plugin.id || plugin.name || plugin.ID),
    name: pickString(plugin.name || plugin.id || plugin.ID),
    displayName: pickString(plugin.display_name || plugin.displayName || plugin.name || plugin.id || plugin.ID || "Plugin"),
    version: pickString(plugin.version || plugin.Version || ""),
    description: pickString(plugin.description || plugin.Description || ""),
    path: pickString(plugin.path || plugin.Path || plugin.root || plugin.Root || ""),
    permissions: Array.isArray(plugin.permissions || plugin.Permissions) ? (plugin.permissions || plugin.Permissions).map((item) => pickString(item)) : [],
    actions,
    status: pickString(plugin.status || plugin.Status || "unknown"),
    lastError: pickString(plugin.last_error || plugin.lastError || plugin.LastError || ""),
    loadedAt: plugin.loaded_at || plugin.loadedAt || plugin.LoadedAt || null,
    updatedAt: plugin.updated_at || plugin.updatedAt || plugin.UpdatedAt || null,
    raw: plugin
  };
}
const usePluginStore = /* @__PURE__ */ defineStore("plugin", {
  // 核心状态：插件列表、当前选中 ID 及操作状态
  state: () => ({
    plugins: [],
    selectedPluginId: "",
    loading: false,
    error: "",
    invoking: false
  }),
  getters: {
    selectedPlugin: (state) => state.plugins.find((item) => item.id === state.selectedPluginId) || null,
    hasPlugins: (state) => state.plugins.length > 0
  },
  actions: {
    mergePlugin(plugin) {
      const normalized = normalizePlugin(plugin);
      if (!normalized || !normalized.id) return;
      const index2 = this.plugins.findIndex((item) => item.id === normalized.id);
      if (index2 >= 0) {
        this.plugins[index2] = { ...this.plugins[index2], ...normalized };
      } else {
        this.plugins.push(normalized);
      }
    },
    applyPluginList(list, preferredPluginId = "") {
      const normalizedList = Array.isArray(list) ? list.map(normalizePlugin).filter(Boolean) : [];
      this.plugins = normalizedList;
      if (preferredPluginId && this.plugins.some((item) => item.id === preferredPluginId)) {
        this.selectedPluginId = preferredPluginId;
        return this.plugins;
      }
      if (this.selectedPluginId && !this.plugins.some((item) => item.id === this.selectedPluginId) && this.plugins.length) {
        this.selectedPluginId = this.plugins[0].id;
      } else if (!this.plugins.length) {
        this.selectedPluginId = "";
      } else if (!this.selectedPluginId && this.plugins.length) {
        this.selectedPluginId = this.plugins[0].id;
      }
      return this.plugins;
    },
    async fetchPlugins() {
      this.loading = true;
      this.error = "";
      try {
        const data = await listPlugins();
        this.applyPluginList(data);
        return this.plugins;
      } catch (err) {
        this.error = err.message || "加载插件失败";
        throw err;
      } finally {
        this.loading = false;
      }
    },
    async reloadPlugins() {
      this.loading = true;
      this.error = "";
      try {
        const data = await reloadPlugins();
        this.applyPluginList(data);
        return this.plugins;
      } catch (err) {
        this.error = err.message || "重新加载插件失败";
        throw err;
      } finally {
        this.loading = false;
      }
    },
    async addPlugin(pluginPath) {
      this.loading = true;
      this.error = "";
      try {
        const data = await addPlugin(pluginPath);
        this.applyPluginList(data);
        return this.plugins;
      } catch (err) {
        this.error = err.message || "添加插件失败";
        throw err;
      } finally {
        this.loading = false;
      }
    },
    async deletePlugin(pluginId) {
      this.loading = true;
      this.error = "";
      try {
        const data = await deletePlugin(pluginId);
        this.applyPluginList(data);
        return this.plugins;
      } catch (err) {
        this.error = err.message || "删除插件失败";
        throw err;
      } finally {
        this.loading = false;
      }
    },
    selectPlugin(pluginId) {
      this.selectedPluginId = pickString(pluginId);
    },
    async invokePluginAction(pluginId, actionId, payload = {}) {
      const normalizedPluginId = pickString(pluginId);
      const normalizedActionId = pickString(actionId);
      if (!normalizedPluginId) {
        throw new Error("请先选择插件");
      }
      if (!normalizedActionId) {
        throw new Error("缺少插件动作标识");
      }
      this.invoking = true;
      this.error = "";
      try {
        const authStore = useAuthStore();
        const consoleStore = useConsoleStore();
        const beaconId = pickString(payload.beacon_id || payload.beaconId || payload.selected_beacon_id || payload.selectedBeaconId);
        const artifact = pickString(payload.artifact || payload.artifact_path || payload.artifactPath || "");
        if (beaconId) {
          consoleStore.openConsole(beaconId);
          if (artifact) {
            consoleStore.appendToConsole(beaconId, "input", `bof "${artifact}"`.trim());
          } else {
            consoleStore.appendToConsole(beaconId, "input", "bof");
          }
          consoleStore.appendToConsole(beaconId, "output", "正在推送 Payload 并准备执行 bof...");
        }
        const requestPayload = {
          ...payload,
          api_base: authStore.apiBase || "",
          token: authStore.token || ""
        };
        const response = await invokePluginAction(
          normalizedPluginId,
          normalizedActionId,
          JSON.stringify(requestPayload)
        );
        if (beaconId) {
          consoleStore.appendToConsole(beaconId, "output", "注入成功 / 执行完成。");
          consoleStore.appendToConsole(beaconId, "output", "截获返回信息:");
        }
        const normalized = normalizePlugin(response);
        if (normalized) {
          this.mergePlugin(normalized);
        }
        return normalized;
      } catch (err) {
        const consoleStore = useConsoleStore();
        const beaconId = pickString(payload.beacon_id || payload.beaconId || payload.selected_beacon_id || payload.selectedBeaconId);
        if (beaconId) {
          consoleStore.appendToConsole(beaconId, "error", `插件 BOF 执行失败: ${err.message || "未知错误"}`);
        }
        this.error = err.message || "插件动作执行失败";
        throw err;
      } finally {
        this.invoking = false;
      }
    }
  }
});
const STORAGE_KEY = "ui-theme";
const THEMES = ["liquid", "dark"];
function normalizeTheme(value) {
  const theme = String(value || "").trim().toLowerCase();
  return THEMES.includes(theme) ? theme : "liquid";
}
function applyTheme(theme) {
  document.documentElement.dataset.uiTheme = normalizeTheme(theme);
}
const useThemeStore = /* @__PURE__ */ defineStore("theme", {
  state: () => ({
    currentTheme: "liquid"
  }),
  getters: {
    isDark: (state) => state.currentTheme === "dark",
    label: (state) => state.currentTheme === "dark" ? "Dark" : "Liquid",
    nextLabel: (state) => state.currentTheme === "dark" ? "Liquid" : "Dark"
  },
  actions: {
    initTheme() {
      const savedTheme = normalizeTheme(localStorage.getItem(STORAGE_KEY));
      this.currentTheme = savedTheme;
      applyTheme(savedTheme);
    },
    setTheme(theme) {
      const normalized = normalizeTheme(theme);
      this.currentTheme = normalized;
      localStorage.setItem(STORAGE_KEY, normalized);
      applyTheme(normalized);
    },
    toggleTheme() {
      this.setTheme(this.currentTheme === "dark" ? "liquid" : "dark");
    }
  }
});
async function login(username, password) {
  return await request("POST", "/api/v1/login", { username, password });
}
async function logout() {
  return await request("POST", "/api/v1/logout");
}
const useModalStore = /* @__PURE__ */ defineStore("modal", {
  // ─── 状态 ───
  state: () => ({
    // 通用确认弹窗
    confirm: {
      visible: false,
      title: "确认操作",
      message: "",
      type: "info",
      // 'info', 'warning', 'danger'
      confirmText: "继续操作",
      cancelText: "取消",
      onConfirm: null,
      onCancel: null
    },
    // 通用输入弹窗
    prompt: {
      visible: false,
      title: "输入内容",
      message: "",
      value: "",
      placeholder: "",
      onConfirm: null,
      onCancel: null
    },
    // 文件浏览器
    fileBrowserVisible: false,
    activeFileBrowserBeaconId: null,
    // 进程浏览器
    processBrowserVisible: false,
    activeProcessBrowserBeaconId: null,
    // 网络浏览器
    networkBrowserVisible: false,
    activeNetworkBrowserBeaconId: null,
    // Payload 执行弹窗
    executeModalVisible: false,
    activeExecuteModal: {
      beaconid: null,
      executionType: ""
    },
    // Beacon 生成弹窗
    generateBeaconVisible: false,
    activeGenerateBeaconListenerId: null,
    // Sleep 配置弹窗
    sleepModalVisible: false,
    activeSleepBeaconId: null,
    // 插件动作弹窗
    pluginActionVisible: false,
    activePluginAction: {
      pluginId: "",
      pluginName: "",
      beaconid: "",
      action: null
    },
    // Cascade 级联连接弹窗
    cascadeConnectModalVisible: false,
    cascadeConnectBeaconId: "",
    cascadeConnectMode: "tcp"
    // 'tcp' | 'smb'
  }),
  // ─── 方法 ───
  actions: {
    // ─── Sleep 配置弹窗 ───
    openSleepModal(beaconid) {
      this.activeSleepBeaconId = beaconid;
      this.sleepModalVisible = true;
    },
    closeSleepModal() {
      this.sleepModalVisible = false;
      this.activeSleepBeaconId = null;
    },
    // ─── 文件浏览器 ───
    openFileBrowser(beaconid) {
      this.activeFileBrowserBeaconId = beaconid;
      this.fileBrowserVisible = true;
    },
    closeFileBrowser() {
      this.fileBrowserVisible = false;
      this.activeFileBrowserBeaconId = null;
    },
    // ─── 进程浏览器 ───
    openProcessBrowser(beaconid) {
      this.activeProcessBrowserBeaconId = beaconid;
      this.processBrowserVisible = true;
    },
    closeProcessBrowser() {
      this.processBrowserVisible = false;
      this.activeProcessBrowserBeaconId = null;
    },
    // ─── 网络浏览器 ───
    openNetworkBrowser(beaconid) {
      this.activeNetworkBrowserBeaconId = beaconid;
      this.networkBrowserVisible = true;
    },
    closeNetworkBrowser() {
      this.networkBrowserVisible = false;
      this.activeNetworkBrowserBeaconId = null;
    },
    // ─── Payload 执行弹窗 ───
    openExecuteModal(beaconid, executionType) {
      this.activeExecuteModal.beaconid = beaconid;
      this.activeExecuteModal.executionType = executionType;
      this.executeModalVisible = true;
    },
    closeExecuteModal() {
      this.executeModalVisible = false;
      this.activeExecuteModal.beaconid = null;
      this.activeExecuteModal.executionType = "";
    },
    // ─── Beacon 生成弹窗 ───
    openGenerateBeacon(listenerId) {
      this.activeGenerateBeaconListenerId = listenerId;
      this.generateBeaconVisible = true;
    },
    closeGenerateBeacon() {
      this.generateBeaconVisible = false;
      this.activeGenerateBeaconListenerId = null;
    },
    // ─── 插件动作弹窗 ───
    openPluginAction(payload = {}) {
      this.activePluginAction = {
        pluginId: payload.pluginId || "",
        pluginName: payload.pluginName || "",
        beaconid: payload.beaconid || "",
        action: payload.action || null
      };
      this.pluginActionVisible = true;
    },
    closePluginAction() {
      this.pluginActionVisible = false;
      this.activePluginAction = {
        pluginId: "",
        pluginName: "",
        beaconid: "",
        action: null
      };
    },
    // ─── Cascade 级联连接弹窗 ───
    openCascadeConnectModal(beaconid, mode) {
      this.cascadeConnectBeaconId = beaconid;
      this.cascadeConnectMode = mode;
      this.cascadeConnectModalVisible = true;
    },
    closeCascadeConnectModal() {
      this.cascadeConnectModalVisible = false;
      this.cascadeConnectBeaconId = "";
    },
    /**
     * 打开通用确认弹窗
     * @returns {Promise<boolean>} 返回一个 Promise，用户点击确认返回 true，取消返回 false
     */
    showConfirm(options = {}) {
      return new Promise((resolve2) => {
        this.confirm = {
          visible: true,
          title: options.title || "确认操作",
          message: options.message || "确定要执行此操作吗？",
          type: options.type || "info",
          confirmText: options.confirmText || "继续操作",
          cancelText: options.cancelText || "取消",
          onConfirm: () => {
            this.confirm.visible = false;
            resolve2(true);
          },
          onCancel: () => {
            this.confirm.visible = false;
            resolve2(false);
          }
        };
      });
    },
    /**
     * 打开通用输入弹窗
     * @returns {Promise<string|null>} 返回输入内容，取消则返回 null
     */
    showPrompt(options = {}) {
      return new Promise((resolve2) => {
        this.prompt = {
          visible: true,
          title: options.title || "输入内容",
          message: options.message || "",
          value: options.defaultValue || "",
          placeholder: options.placeholder || "请输入...",
          onConfirm: (val) => {
            this.prompt.visible = false;
            resolve2(val);
          },
          onCancel: () => {
            this.prompt.visible = false;
            resolve2(null);
          }
        };
      });
    }
  }
});
const modal = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  useModalStore
}, Symbol.toStringTag, { value: "Module" }));
const defaultAvatar = "/assets/default-avatar-CVmWE3hm.jpg";
const _export_sfc = (sfc, props) => {
  const target = sfc.__vccOpts || sfc;
  for (const [key, val] of props) {
    target[key] = val;
  }
  return target;
};
const _hoisted_1$g = { class: "sidebar" };
const _hoisted_2$f = { class: "logo" };
const _hoisted_3$f = { class: "brand" };
const _hoisted_4$f = { class: "logo-icon" };
const _hoisted_5$e = ["src"];
const _hoisted_6$d = { class: "logo-actions" };
const _hoisted_7$d = ["title", "aria-label"];
const _hoisted_8$c = ["disabled"];
const _hoisted_9$c = { class: "nav" };
const _hoisted_10$c = ["onClick"];
const _hoisted_11$c = {
  key: 0,
  class: "nav-icon",
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2"
};
const _hoisted_12$c = {
  key: 1,
  class: "nav-icon",
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2"
};
const _hoisted_13$c = {
  key: 2,
  class: "nav-icon",
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2"
};
const _hoisted_14$b = {
  key: 3,
  class: "nav-icon",
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2"
};
const _hoisted_15$b = {
  key: 4,
  class: "nav-icon",
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2"
};
const _hoisted_16$9 = {
  key: 5,
  class: "nav-icon",
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2"
};
const _hoisted_17$7 = {
  key: 6,
  class: "nav-icon",
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2"
};
const _hoisted_18$7 = {
  key: 7,
  class: "nav-icon",
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2"
};
const _hoisted_19$7 = {
  key: 8,
  class: "nav-icon",
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2"
};
const _hoisted_20$7 = {
  key: 9,
  class: "nav-icon",
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2"
};
const _hoisted_21$6 = {
  key: 10,
  class: "nav-icon",
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2"
};
const _hoisted_22$6 = { class: "sidebar-footer" };
const _hoisted_23$6 = ["title"];
const _hoisted_24$6 = { class: "status-text" };
const AVATAR_STORAGE_KEY = "iris-user-avatar";
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const _sfc_main$i = {
  __name: "Sidebar",
  setup(__props) {
    const route = useRoute();
    const router2 = useRouter();
    const authStore = useAuthStore();
    const modalStore = useModalStore();
    const notificationStore = useNotificationStore();
    const themeStore = useThemeStore();
    const wsStore = useWSStore();
    const isLoggingOut = /* @__PURE__ */ ref(false);
    const AVATAR_MIME_BY_EXT = {
      gif: "image/gif",
      jpeg: "image/jpeg",
      jpg: "image/jpeg",
      png: "image/png",
      webp: "image/webp"
    };
    const avatarSrc = /* @__PURE__ */ ref(loadAvatar());
    const connectionStatus = computed(() => {
      switch (wsStore.status) {
        case "open":
          return { label: "TeamServer 已连接", class: "online" };
        case "connecting":
          return { label: "正在连接服务器...", class: "connecting" };
        case "error":
          return { label: "连接失败 (证书错误?)", class: "error" };
        default:
          return { label: "后台服务未就绪", class: "offline" };
      }
    });
    const navItems = [
      { path: "/dashboard", label: "仪表盘", icon: "dashboard" },
      { path: "/topology", label: "拓扑图", icon: "topology" },
      { path: "/listener", label: "生成监听器", icon: "listener" },
      { path: "/proxy", label: "Proxy Pivot", icon: "proxy" },
      { path: "/screenshots", label: "Screenshots", icon: "screenshots" },
      { path: "/downloads", label: "下载文件", icon: "downloads" },
      { path: "/plugins", label: "插件", icon: "plugins" },
      { path: "/help", label: "帮助", icon: "help" }
    ];
    function navigateTo(path) {
      if (route.path === path) return;
      router2.push(path);
    }
    function loadAvatar() {
      try {
        return localStorage.getItem(AVATAR_STORAGE_KEY) || defaultAvatar;
      } catch {
        return defaultAvatar;
      }
    }
    function getAvatarMimeType(path) {
      var _a2;
      const ext = (_a2 = String(path || "").split(".").pop()) == null ? void 0 : _a2.toLowerCase();
      return AVATAR_MIME_BY_EXT[ext] || "";
    }
    async function openAvatarPicker() {
      try {
        const picked = await OpenFile({
          Title: "选择头像图片",
          Message: "请选择 PNG、JPG、WebP 或 GIF 图片",
          CanChooseFiles: true,
          AllowsMultipleSelection: false,
          Filters: [
            { DisplayName: "图片文件", Pattern: "*.png;*.jpg;*.jpeg;*.webp;*.gif" }
          ]
        });
        const sourcePath = Array.isArray(picked) ? picked[0] : picked;
        if (!sourcePath) return;
        const mimeType = getAvatarMimeType(sourcePath);
        if (!mimeType) {
          notificationStore.error("请选择图片文件");
          return;
        }
        const base64Data = await ReadBinaryFileBase64(sourcePath);
        const estimatedSize = Math.floor(String(base64Data || "").length * 3 / 4);
        if (estimatedSize > MAX_AVATAR_SIZE) {
          notificationStore.error("头像图片不能超过 2MB");
          return;
        }
        const result = `data:${mimeType};base64,${base64Data}`;
        avatarSrc.value = result;
        try {
          localStorage.setItem(AVATAR_STORAGE_KEY, result);
        } catch {
          notificationStore.error("头像保存失败，请选择更小的图片");
          return;
        }
        notificationStore.success("头像已更新");
      } catch (err) {
        notificationStore.error(err.message || "头像选择失败");
        console.error("[Sidebar] 头像选择失败:", err);
      }
    }
    async function handleLogout() {
      if (isLoggingOut.value) return;
      const confirmed = await modalStore.showConfirm({
        title: "确认登出",
        message: "确定要退出当前登录会话吗？\n确认后会通知 TeamServer 注销当前 Token，并返回登录页。",
        type: "warning",
        confirmText: "确认登出"
      });
      if (!confirmed) return;
      isLoggingOut.value = true;
      let remoteLoggedOut = false;
      try {
        await logout();
        remoteLoggedOut = true;
      } catch (err) {
        console.warn("[Auth] logout request failed, clear local session anyway:", err);
      } finally {
        authStore.logout();
        wsStore.disconnect();
        if (remoteLoggedOut) {
          notificationStore.success("已登出");
        }
        router2.replace({ name: "Login" });
        isLoggingOut.value = false;
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("aside", _hoisted_1$g, [
        createBaseVNode("div", _hoisted_2$f, [
          createBaseVNode("div", _hoisted_3$f, [
            createBaseVNode("div", _hoisted_4$f, [
              createBaseVNode("button", {
                type: "button",
                class: "avatar-button",
                title: "上传个人头像",
                "aria-label": "上传个人头像",
                onClick: openAvatarPicker
              }, [
                createBaseVNode("img", {
                  src: avatarSrc.value,
                  alt: "Iris Client",
                  onError: _cache[0] || (_cache[0] = ($event) => avatarSrc.value = unref(defaultAvatar))
                }, null, 40, _hoisted_5$e),
                _cache[2] || (_cache[2] = createBaseVNode("span", { class: "avatar-overlay" }, "更换", -1))
              ])
            ]),
            _cache[3] || (_cache[3] = createBaseVNode("div", { class: "logo-text" }, [
              createBaseVNode("span", { class: "logo-name" }, "Iris Client"),
              createBaseVNode("span", { class: "logo-version" }, "v0.0.1")
            ], -1))
          ]),
          createBaseVNode("div", _hoisted_6$d, [
            createBaseVNode("button", {
              type: "button",
              class: "theme-btn",
              title: `切换到 ${unref(themeStore).nextLabel} 主题`,
              "aria-label": `切换到 ${unref(themeStore).nextLabel} 主题`,
              onClick: _cache[1] || (_cache[1] = ($event) => unref(themeStore).toggleTheme())
            }, [
              createBaseVNode("span", null, toDisplayString(unref(themeStore).isDark ? "☾" : "☼"), 1)
            ], 8, _hoisted_7$d),
            createBaseVNode("button", {
              type: "button",
              class: "logout-btn",
              disabled: isLoggingOut.value,
              title: "登出",
              "aria-label": "登出",
              onClick: handleLogout
            }, [..._cache[4] || (_cache[4] = [
              createBaseVNode("svg", {
                width: "17",
                height: "17",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                "stroke-width": "2.1",
                "stroke-linecap": "round",
                "stroke-linejoin": "round"
              }, [
                createBaseVNode("path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }),
                createBaseVNode("path", { d: "M16 17l5-5-5-5" }),
                createBaseVNode("path", { d: "M21 12H9" })
              ], -1)
            ])], 8, _hoisted_8$c)
          ])
        ]),
        createBaseVNode("nav", _hoisted_9$c, [
          _cache[17] || (_cache[17] = createBaseVNode("div", { class: "section-label" }, "导航", -1)),
          (openBlock(), createElementBlock(Fragment, null, renderList(navItems, (item) => {
            return createBaseVNode("button", {
              key: item.path,
              type: "button",
              class: normalizeClass(["nav-item", { active: unref(route).path === item.path }]),
              onClick: withModifiers(($event) => navigateTo(item.path), ["prevent", "stop"])
            }, [
              item.icon === "dashboard" ? (openBlock(), createElementBlock("svg", _hoisted_11$c, [..._cache[5] || (_cache[5] = [
                createBaseVNode("rect", {
                  x: "3",
                  y: "3",
                  width: "7",
                  height: "7",
                  rx: "1"
                }, null, -1),
                createBaseVNode("rect", {
                  x: "14",
                  y: "3",
                  width: "7",
                  height: "7",
                  rx: "1"
                }, null, -1),
                createBaseVNode("rect", {
                  x: "3",
                  y: "14",
                  width: "7",
                  height: "7",
                  rx: "1"
                }, null, -1),
                createBaseVNode("rect", {
                  x: "14",
                  y: "14",
                  width: "7",
                  height: "7",
                  rx: "1"
                }, null, -1)
              ])])) : item.icon === "topology" ? (openBlock(), createElementBlock("svg", _hoisted_12$c, [..._cache[6] || (_cache[6] = [
                createStaticVNode('<circle cx="12" cy="5" r="3" data-v-169bac8e></circle><circle cx="5" cy="19" r="3" data-v-169bac8e></circle><circle cx="19" cy="19" r="3" data-v-169bac8e></circle><line x1="12" y1="8" x2="5" y2="16" data-v-169bac8e></line><line x1="12" y1="8" x2="19" y2="16" data-v-169bac8e></line>', 5)
              ])])) : item.icon === "listener" ? (openBlock(), createElementBlock("svg", _hoisted_13$c, [..._cache[7] || (_cache[7] = [
                createBaseVNode("path", { d: "M4.93 4.93a10 10 0 0 1 14.14 0" }, null, -1),
                createBaseVNode("path", { d: "M7.76 7.76a6 6 0 0 1 8.48 0" }, null, -1),
                createBaseVNode("circle", {
                  cx: "12",
                  cy: "12",
                  r: "2",
                  fill: "currentColor"
                }, null, -1),
                createBaseVNode("line", {
                  x1: "12",
                  y1: "14",
                  x2: "12",
                  y2: "22"
                }, null, -1)
              ])])) : item.icon === "client" ? (openBlock(), createElementBlock("svg", _hoisted_14$b, [..._cache[8] || (_cache[8] = [
                createBaseVNode("rect", {
                  x: "2",
                  y: "3",
                  width: "20",
                  height: "14",
                  rx: "2"
                }, null, -1),
                createBaseVNode("line", {
                  x1: "8",
                  y1: "21",
                  x2: "16",
                  y2: "21"
                }, null, -1),
                createBaseVNode("line", {
                  x1: "12",
                  y1: "17",
                  x2: "12",
                  y2: "21"
                }, null, -1)
              ])])) : item.icon === "keylogger" ? (openBlock(), createElementBlock("svg", _hoisted_15$b, [..._cache[9] || (_cache[9] = [
                createStaticVNode('<rect x="2" y="4" width="20" height="16" rx="2" ry="2" data-v-169bac8e></rect><line x1="6" y1="8" x2="6.01" y2="8" data-v-169bac8e></line><line x1="10" y1="8" x2="10.01" y2="8" data-v-169bac8e></line><line x1="14" y1="8" x2="14.01" y2="8" data-v-169bac8e></line><line x1="18" y1="8" x2="18.01" y2="8" data-v-169bac8e></line><line x1="8" y1="12" x2="8.01" y2="12" data-v-169bac8e></line><line x1="12" y1="12" x2="12.01" y2="12" data-v-169bac8e></line><line x1="16" y1="12" x2="16.01" y2="12" data-v-169bac8e></line><line x1="7" y1="16" x2="17" y2="16" data-v-169bac8e></line>', 9)
              ])])) : item.icon === "proxy" ? (openBlock(), createElementBlock("svg", _hoisted_16$9, [..._cache[10] || (_cache[10] = [
                createStaticVNode('<path d="M12 20h9" data-v-169bac8e></path><path d="M16.5 14c-2 0-3.5 1-3.5 2s1.5 2 3.5 2h5v-4h-5z" data-v-169bac8e></path><path d="M2.5 10c2 0 3.5-1 3.5-2s-1.5-2-3.5-2h-1v4h1z" data-v-169bac8e></path><path d="M12 14c-1.5 0-2.5-1.5-2.5-3s1-3 2.5-3 2.5 1.5 2.5 3-1 3-2.5 3z" data-v-169bac8e></path><path d="M5.5 8l4 2.5" data-v-169bac8e></path><path d="M14.5 10.5l4 2.5" data-v-169bac8e></path>', 6)
              ])])) : item.icon === "screenshots" ? (openBlock(), createElementBlock("svg", _hoisted_17$7, [..._cache[11] || (_cache[11] = [
                createBaseVNode("rect", {
                  x: "3",
                  y: "3",
                  width: "18",
                  height: "18",
                  rx: "2",
                  ry: "2"
                }, null, -1),
                createBaseVNode("circle", {
                  cx: "8.5",
                  cy: "8.5",
                  r: "1.5"
                }, null, -1),
                createBaseVNode("polyline", { points: "21 15 16 10 5 21" }, null, -1)
              ])])) : item.icon === "downloads" ? (openBlock(), createElementBlock("svg", _hoisted_18$7, [..._cache[12] || (_cache[12] = [
                createBaseVNode("path", { d: "M12 3v12" }, null, -1),
                createBaseVNode("path", { d: "M7 10l5 5 5-5" }, null, -1),
                createBaseVNode("path", { d: "M4 17v3h16v-3" }, null, -1)
              ])])) : item.icon === "plugins" ? (openBlock(), createElementBlock("svg", _hoisted_19$7, [..._cache[13] || (_cache[13] = [
                createBaseVNode("path", { d: "M12 2l2.2 4.7 5.1.7-3.7 3.6.9 5.1L12 14.8 7.5 16.1l.9-5.1L4.7 7.4l5.1-.7L12 2z" }, null, -1),
                createBaseVNode("path", { d: "M12 14.8V22" }, null, -1),
                createBaseVNode("path", { d: "M7.5 16.1l-2.9 2.9" }, null, -1),
                createBaseVNode("path", { d: "M16.5 16.1l2.9 2.9" }, null, -1)
              ])])) : item.icon === "credentials" ? (openBlock(), createElementBlock("svg", _hoisted_20$7, [..._cache[14] || (_cache[14] = [
                createBaseVNode("path", { d: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" }, null, -1)
              ])])) : item.icon === "help" ? (openBlock(), createElementBlock("svg", _hoisted_21$6, [..._cache[15] || (_cache[15] = [
                createBaseVNode("circle", {
                  cx: "12",
                  cy: "12",
                  r: "10"
                }, null, -1),
                createBaseVNode("path", { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" }, null, -1),
                createBaseVNode("circle", {
                  cx: "12",
                  cy: "17",
                  r: "0.5",
                  fill: "currentColor"
                }, null, -1)
              ])])) : createCommentVNode("", true),
              createBaseVNode("span", null, toDisplayString(item.label), 1),
              _cache[16] || (_cache[16] = createBaseVNode("span", { class: "active-indicator" }, null, -1))
            ], 10, _hoisted_10$c);
          }), 64))
        ]),
        createBaseVNode("div", _hoisted_22$6, [
          createBaseVNode("div", {
            class: "status-badge",
            title: connectionStatus.value.label
          }, [
            createBaseVNode("span", {
              class: normalizeClass(["status-dot", connectionStatus.value.class])
            }, null, 2),
            createBaseVNode("span", _hoisted_24$6, toDisplayString(connectionStatus.value.label), 1)
          ], 8, _hoisted_23$6)
        ])
      ]);
    };
  }
};
const Sidebar = /* @__PURE__ */ _export_sfc(_sfc_main$i, [["__scopeId", "data-v-169bac8e"]]);
const _hoisted_1$f = { class: "toast-container" };
const _hoisted_2$e = { class: "toast-icon" };
const _hoisted_3$e = { class: "toast-message" };
const _hoisted_4$e = ["onClick"];
const _sfc_main$h = {
  __name: "ToastContainer",
  setup(__props) {
    const notificationStore = useNotificationStore();
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$f, [
        createVNode(TransitionGroup, { name: "toast" }, {
          default: withCtx(() => [
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(notificationStore).notifications, (n) => {
              return openBlock(), createElementBlock("div", {
                key: n.id,
                class: normalizeClass(["toast-item glass-card", n.type])
              }, [
                createBaseVNode("span", _hoisted_2$e, [
                  n.type === "success" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                    createTextVNode("✅")
                  ], 64)) : n.type === "error" ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                    createTextVNode("🚨")
                  ], 64)) : n.type === "warn" ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                    createTextVNode("⚠️")
                  ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 3 }, [
                    createTextVNode("ℹ️")
                  ], 64))
                ]),
                createBaseVNode("span", _hoisted_3$e, toDisplayString(n.message), 1),
                createBaseVNode("button", {
                  class: "toast-close",
                  onClick: ($event) => unref(notificationStore).remove(n.id)
                }, "×", 8, _hoisted_4$e)
              ], 2);
            }), 128))
          ]),
          _: 1
        })
      ]);
    };
  }
};
const ToastContainer = /* @__PURE__ */ _export_sfc(_sfc_main$h, [["__scopeId", "data-v-81c5c3e7"]]);
const TUNNEL_REASON_LABELS = {
  error_1: "未知错误",
  error_3: "Beacon 侧网络不可达",
  error_4: "Beacon 连接目标超时",
  error_5: "Beacon 侧目标端口拒绝连接",
  error_6: "Beacon 侧 DNS 解析失败",
  error_7: "Beacon 侧网关失败",
  error_8: "Beacon 侧连接被取消",
  error_9: "Beacon 隧道队列已满",
  error_10: "Beacon 不支持的协议",
  error_11: "Beacon 侧通道重复",
  error_12: "Beacon 侧远端连接已关闭",
  error_13: "Beacon 侧连接被重置",
  error_14: "Beacon 侧写入失败",
  error_15: "Beacon 侧连接被中止",
  "local connection closed": "本地连接已关闭",
  "remote connection closed": "远端连接已关闭",
  "tunnel paused": "Tunnel 已暂停",
  "tunnel cleared": "Tunnel 已清除",
  "beacon tunnel connect timeout": "Beacon 连接目标超时",
  "connection timeout": "Beacon 连接目标超时",
  "connection refused": "Beacon 侧目标端口拒绝连接",
  "network unreachable": "Beacon 侧网络不可达",
  "dns failed": "Beacon 侧 DNS 解析失败",
  "gateway failed": "Beacon 侧网关失败",
  "connection reset": "Beacon 侧连接被重置",
  "write failed": "Beacon 侧写入失败",
  "connection aborted": "Beacon 侧连接被中止",
  "unsupported protocol": "Beacon 不支持的协议",
  "unsupported proto": "Beacon 不支持的协议",
  "duplicate channel": "Beacon 侧通道重复"
};
function formatTunnelReason(reason) {
  if (reason === void 0 || reason === null) return "";
  const raw = String(reason).trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase().replace(/\s+/g, " ");
  if (TUNNEL_REASON_LABELS[normalized]) {
    return TUNNEL_REASON_LABELS[normalized];
  }
  const numericMatch = normalized.match(/^(\d+)$/);
  if (numericMatch) {
    const codeKey = `error_${numericMatch[1]}`;
    return TUNNEL_REASON_LABELS[codeKey] || raw;
  }
  return raw;
}
function normalizeType(type) {
  const normalized = String(type || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return normalized.startsWith("EVENT") ? normalized.slice(5) : normalized;
}
function pickArray(data, keys, fallback = []) {
  if (!data || typeof data !== "object") return fallback;
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }
  return fallback;
}
function unwrapPayload$1(data) {
  if (!data || typeof data !== "object") return data;
  const payload = pick(data, ["data", "Data", "result", "Result", "content", "Content", "payload", "Payload"], void 0);
  return payload === void 0 ? data : payload;
}
function getTextContent(payload) {
  if (payload === void 0 || payload === null) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    const text = pick(payload, ["text", "Text", "value", "Value"], "");
    if (text !== "") return String(text);
  }
  return "";
}
function getCommandName(commandId) {
  if (commandId === void 0 || commandId === null || commandId === "") return "";
  const name = COMMAND_NAME[String(commandId)];
  return name || `command_${String(commandId)}`;
}
function stringifyPreview(value, limit = 220) {
  if (value === void 0 || value === null) return "";
  let text = "";
  if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
function compactOneLine(value, limit = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
function limitSummary(value, limit = 120) {
  return compactOneLine(value, limit) || "事件已接收";
}
function summarizeLs(text) {
  const match = String(text || "").match(/Listing directory:\s*([^\r\n]+?)(?:\s+Mode\b|\r?\n|$)/i);
  const path = compactOneLine((match == null ? void 0 : match[1]) || "", 60);
  return path ? `目录列表已回传: ${path}` : "目录列表已回传";
}
function summarizeCommandText(commandName, text, status = "") {
  const name = String(commandName || "").toLowerCase();
  const compact = compactOneLine(text, 80);
  if (String(status || "").toLowerCase() === "error") {
    return compact ? `任务失败: ${name || "命令"} - ${compact}` : `任务失败: ${name || "命令"}`;
  }
  switch (name) {
    case "ls":
      return summarizeLs(text);
    case "pwd":
      return compact ? `当前目录: ${compact}` : "当前目录已回传";
    case "whoami":
      return compact ? `用户信息: ${compact}` : "用户信息已回传";
    case "shell":
      return "Shell 命令已回传";
    case "powershell":
      return "PowerShell 命令已回传";
    case "execution_bof":
    case "exec-bof":
    case "bof":
      return "BOF 执行已回传";
    default:
      return name ? `任务回传: ${name}` : "任务回传";
  }
}
function formatSummary(type, data, raw = null, commandId = "", phase = "", status = "", resultType = "") {
  const bid = pick(data, ["beacon_id", "beaconId", "BeaconId", "BeaconID"]) || pick(raw, ["beacon_id", "beaconId", "BeaconId", "BeaconID"]);
  const envelope = data && typeof data === "object" ? data : raw && typeof raw === "object" ? raw : {};
  const detail = unwrapPayload$1(envelope);
  const detailSource = detail && typeof detail === "object" ? detail : envelope;
  const normalizedPhase = String(phase || pick(envelope, ["phase", "Phase"], pick(raw, ["phase", "Phase"], ""))).toLowerCase();
  const normalizedStatus = String(status || pick(envelope, ["status", "Status"], pick(raw, ["status", "Status"], ""))).toLowerCase();
  const normalizedResultType = String(resultType || pick(envelope, ["result_type", "resultType", "ResultType", "type", "Type"], pick(raw, ["result_type", "resultType", "ResultType"], ""))).toLowerCase();
  const totalChunks = pick(detailSource, ["total_chunks", "totalChunks", "TotalChunks"], pick(envelope, ["total_chunks", "totalChunks", "TotalChunks"], ""));
  const receivedChunks = pick(detailSource, ["received_chunks", "receivedChunks", "ReceivedChunks", "chunk_index", "chunkIndex"], pick(envelope, ["received_chunks", "receivedChunks", "ReceivedChunks", "chunk_index", "chunkIndex"], ""));
  const error = pick(detailSource, ["error", "Error", "error_message", "errorMessage", "message", "Message"], pick(envelope, ["error", "Error", "error_message", "errorMessage", "message", "Message"], ""));
  const fileName = pick(detailSource, ["file_name", "fileName", "FileName", "name", "Name"], pick(envelope, ["file_name", "fileName", "FileName", "name", "Name"], ""));
  const tunnelMode = pick(detailSource, ["mode", "Mode", "type", "Type"], pick(envelope, ["mode", "Mode", "type", "Type"], ""));
  const bindHost = pick(detailSource, ["bind_host", "bindHost", "BindHost"], pick(envelope, ["bind_host", "bindHost", "BindHost"], ""));
  const bindPort = pick(detailSource, ["bind_port", "bindPort", "BindPort"], pick(envelope, ["bind_port", "bindPort", "BindPort"], ""));
  const targetAddress = pick(detailSource, ["target_address", "targetAddress", "TargetAddress"], pick(envelope, ["target_address", "targetAddress", "TargetAddress"], ""));
  const recycledCount = pick(detailSource, ["recycled_count", "recycledCount", "RecycledCount"], pick(envelope, ["recycled_count", "recycledCount", "RecycledCount"], ""));
  const reason = pick(detailSource, ["reason", "Reason"], pick(envelope, ["reason", "Reason"], ""));
  const textContent = getTextContent(detailSource);
  const netInfoCount = pickArray(detailSource, ["interfaces", "Interfaces"], pickArray(envelope, ["interfaces", "Interfaces"], [])).length;
  const netstatCount = pickArray(detailSource, ["connections", "Connections"], pickArray(envelope, ["connections", "Connections"], [])).length;
  const rawCommandId = commandId || pick(envelope, ["command_id", "commandId", "CommandID", "CommandId"]) || pick(raw, ["command_id", "commandId", "CommandID", "CommandId"]);
  const commandName = getCommandName(rawCommandId);
  const receivedNum = Number(receivedChunks);
  const totalNum = Number(totalChunks);
  const progress = Number.isFinite(receivedNum) && Number.isFinite(totalNum) && totalNum > 0 ? `${receivedNum} / ${totalNum} chunks` : "传输进行中";
  switch (type) {
    case "BEACONREGISTERED":
      return bid ? `Beacon ${bid} 已上线` : "Beacon 已上线";
    case "BEACONREMOVED":
      return bid ? `Beacon ${bid} 已下线` : "Beacon 已下线";
    case "COMMANDEVENT":
      if (normalizedResultType === "text") {
        return summarizeCommandText(commandName, textContent, normalizedStatus);
      }
      if (["download", "upload"].includes(normalizedResultType)) {
        const actionLabel = normalizedResultType === "upload" ? "上传" : "下载";
        if (normalizedStatus === "error") {
          return error ? `${actionLabel}失败: ${error}` : `${actionLabel}失败`;
        }
        if (normalizedStatus === "queued") {
          return fileName ? `${actionLabel}排队: ${fileName}` : `${actionLabel}排队`;
        }
        if (normalizedStatus === "completed" || normalizedPhase === "result") {
          return fileName ? `${actionLabel}完成: ${fileName}` : `${actionLabel}完成`;
        }
        return fileName ? `${actionLabel} ${fileName} - ${progress}` : `${actionLabel} - ${progress}`;
      }
      if (normalizedStatus === "error") {
        return error ? `任务失败: ${commandName} - ${error}` : `任务失败: ${commandName}`;
      }
      if (normalizedResultType === "net_info" || normalizedResultType === "netinfo" || commandName === "netinfo") {
        return netInfoCount > 0 ? `网络信息: ${netInfoCount} 个接口` : "网络信息";
      }
      if (normalizedResultType === "netstat" || commandName === "netstat") {
        return netstatCount > 0 ? `网络连接: ${netstatCount} 条记录` : "网络连接";
      }
      if (commandName) return `任务回传: ${commandName}`;
      if (normalizedResultType) return `任务回传: ${normalizedResultType}`;
      return "任务回传";
    case "LISTENERSTATECHANGE":
    case "LISTENERSTATECHANGED":
      return "监听器状态变更";
    case "TUNNELSTARTED":
      return tunnelMode || bindHost || bindPort ? `Tunnel 已启动: ${[tunnelMode, [bindHost, bindPort].filter(Boolean).join(":")].filter(Boolean).join(" · ")}` : "Tunnel 已启动";
    case "TUNNELPAUSED":
      return tunnelMode || bindHost || bindPort ? `Tunnel 已暂停: ${[tunnelMode, [bindHost, bindPort].filter(Boolean).join(":")].filter(Boolean).join(" · ")}` : "Tunnel 已暂停";
    case "TUNNELRESUMED":
      return tunnelMode || bindHost || bindPort ? `Tunnel 已恢复: ${[tunnelMode, [bindHost, bindPort].filter(Boolean).join(":")].filter(Boolean).join(" · ")}` : "Tunnel 已恢复";
    case "TUNNELUPDATED":
      return tunnelMode || bindHost || bindPort ? `Tunnel 已更新: ${[tunnelMode, [bindHost, bindPort].filter(Boolean).join(":")].filter(Boolean).join(" · ")}` : "Tunnel 已更新";
    case "TUNNELCLEARED":
      return tunnelMode || bindHost || bindPort ? `Tunnel 已清除: ${[tunnelMode, [bindHost, bindPort].filter(Boolean).join(":")].filter(Boolean).join(" · ")}` : "Tunnel 已清除";
    case "TUNNELSTOPPED":
      return error ? `Tunnel 已停止: ${error}` : "Tunnel 已停止";
    case "TUNNELCHANNELOPEN":
      return targetAddress ? `Tunnel 连接已打开: ${targetAddress}` : "Tunnel 连接已打开";
    case "TUNNELCHANNELCLOSE":
      return targetAddress ? `Tunnel 连接已关闭: ${targetAddress}${reason ? ` (${formatTunnelReason(reason)})` : ""}` : "Tunnel 连接已关闭";
    case "TUNNELCHANNELRECYCLED":
      return recycledCount ? `Tunnel 已回收 ${recycledCount} 个终态 channel` : "Tunnel 连接已回收";
    case "TUNNELERROR":
      return error ? `Tunnel 异常: ${error}` : "Tunnel 异常";
    case "SYSTEMLOG":
      return stringifyPreview(pick(data, ["content", "Content"], data), 180) || "系统日志";
    case "PLUGINNOTIFY": {
      const pluginMessage = pick(detailSource, ["message", "Message", "msg", "Msg"], pick(envelope, ["message", "Message", "msg", "Msg"], ""));
      return pluginMessage ? `插件通知: ${pluginMessage}` : "插件通知";
    }
    default:
      return stringifyPreview(data, 180) || "事件已接收";
  }
}
function getTone(type, status = "") {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "error" || type === "TUNNELERROR") return "error";
  if (normalizedStatus === "warn") return "warn";
  if (normalizedStatus === "success") return "success";
  if (type === "BEACONREMOVED" || type === "TUNNELSTOPPED" || type === "TUNNELCLEARED" || type === "TUNNELCHANNELCLOSE" || type === "TUNNELCHANNELRECYCLED") return "warn";
  if (type === "BEACONREGISTERED" || type === "TUNNELSTARTED" || type === "TUNNELRESUMED" || type === "TUNNELCHANNELOPEN") return "success";
  if (type === "TUNNELPAUSED") return "info";
  if (type === "TUNNELUPDATED") return "success";
  if (type === "COMMANDEVENT" && normalizedStatus === "completed") return "success";
  return "info";
}
const useEventPanelStore = /* @__PURE__ */ defineStore("eventPanel", {
  state: () => ({
    visible: true,
    events: [],
    maxEvents: 80,
    nextId: 1,
    width: 420,
    rightOffset: 24,
    collapsedWidth: 48
  }),
  getters: {
    latest: (state) => state.events[0] || null,
    effectiveWidth: (state) => state.visible ? state.width + state.rightOffset : state.collapsedWidth
  },
  actions: {
    toggleVisible() {
      this.visible = !this.visible;
    },
    setWidth(w) {
      this.width = w;
    },
    clear() {
      this.events = [];
      this.nextId = 1;
    },
    recordEvent({ rawType = "", type = "", data = null, raw = null, commandId = "", phase = "", status = "", resultType = "" }) {
      const normalizedType = normalizeType(type || rawType);
      if (!normalizedType || normalizedType === "BEACONTICK") return;
      if (["TUNNELCHANNELOPEN", "TUNNELCHANNELCLOSE", "TUNNELCHANNELRECYCLED", "TUNNELSTATS"].includes(normalizedType)) return;
      const commandName = getCommandName(commandId);
      const entry = {
        id: this.nextId++,
        rawType: String(rawType || normalizedType),
        type: normalizedType,
        tone: getTone(normalizedType, status),
        beaconId: String(pick(data, ["beacon_id", "beaconId", "BeaconId", "BeaconID"], "")),
        commandId: commandId ? String(commandId) : String(pick(data, ["command_id", "commandId", "CommandID", "CommandId"], "")),
        commandName,
        phase: String(phase || pick(data, ["phase", "Phase"], "")),
        status: String(status || pick(data, ["status", "Status"], "")),
        resultType: String(resultType || pick(data, ["result_type", "resultType", "ResultType", "type", "Type"], "")),
        summary: limitSummary(formatSummary(normalizedType, data, raw, commandId, phase, status, resultType)),
        data,
        raw: raw ?? data,
        receivedAt: Date.now()
      };
      this.events.unshift(entry);
      if (this.events.length > this.maxEvents) {
        this.events.length = this.maxEvents;
      }
    }
  }
});
const eventPanel = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  useEventPanelStore
}, Symbol.toStringTag, { value: "Module" }));
const _hoisted_1$e = { class: "event-panel-header" };
const _hoisted_2$d = { class: "panel-count" };
const _hoisted_3$d = { class: "panel-actions" };
const _hoisted_4$d = { class: "event-panel-body" };
const _hoisted_5$d = {
  key: 0,
  class: "event-empty"
};
const _hoisted_6$c = {
  key: 1,
  class: "event-list"
};
const _hoisted_7$c = { class: "event-item-header" };
const _hoisted_8$b = { class: "event-item-type" };
const _hoisted_9$b = { class: "event-item-time" };
const _hoisted_10$b = { class: "event-item-meta" };
const _hoisted_11$b = {
  key: 0,
  class: "event-tag"
};
const _hoisted_12$b = {
  key: 1,
  class: "event-tag"
};
const _hoisted_13$b = {
  key: 2,
  class: "event-tag muted"
};
const _hoisted_14$a = { class: "event-item-summary" };
const _hoisted_15$a = ["aria-label", "title"];
const _hoisted_16$8 = { class: "collapsed-count" };
const PANEL_STORAGE_KEY = "c2.event-panel.width";
const PANEL_RIGHT_OFFSET = 24;
const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_WIDTH = 640;
const PANEL_DEFAULT_WIDTH = 420;
const PANEL_COLLAPSED_WIDTH = 48;
const _sfc_main$g = {
  __name: "EventPanel",
  setup(__props) {
    const eventPanel2 = useEventPanelStore();
    const latest = computed(() => eventPanel2.latest);
    const panelWidth = /* @__PURE__ */ ref(PANEL_DEFAULT_WIDTH);
    const resizing2 = /* @__PURE__ */ ref(false);
    function clampWidth(value) {
      if (typeof window === "undefined") return value;
      const safeMax = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, window.innerWidth - 160));
      return Math.min(safeMax, Math.max(PANEL_MIN_WIDTH, value));
    }
    function loadWidth() {
      if (typeof window === "undefined") return PANEL_DEFAULT_WIDTH;
      const raw = Number(window.localStorage.getItem(PANEL_STORAGE_KEY));
      return clampWidth(Number.isFinite(raw) && raw > 0 ? raw : PANEL_DEFAULT_WIDTH);
    }
    function persistWidth() {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(PANEL_STORAGE_KEY, String(panelWidth.value));
      eventPanel2.setWidth(panelWidth.value);
    }
    function syncWidthToViewport() {
      panelWidth.value = clampWidth(panelWidth.value);
    }
    function startResize(event) {
      if (!eventPanel2.visible) return;
      resizing2.value = true;
      event.preventDefault();
      event.stopPropagation();
      document.body.style.userSelect = "none";
    }
    function onMouseMove2(event) {
      if (!resizing2.value) return;
      const nextWidth = window.innerWidth - PANEL_RIGHT_OFFSET - event.clientX;
      panelWidth.value = clampWidth(nextWidth);
    }
    function stopResize() {
      if (!resizing2.value) return;
      resizing2.value = false;
      document.body.style.userSelect = "";
      persistWidth();
    }
    function formatTime(ts) {
      if (!ts) return "--:--:--";
      return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });
    }
    function formatTypeLabel(type) {
      const labels = {
        BEACONREGISTERED: "Beacon 上线",
        BEACONREMOVED: "Beacon 下线",
        COMMANDEVENT: "命令事件",
        LISTENERSTATECHANGE: "监听器状态",
        LISTENERSTATECHANGED: "监听器状态",
        TUNNELSTARTED: "Tunnel 启动",
        TUNNELSTOPPED: "Tunnel 停止",
        TUNNELCHANNELOPEN: "Tunnel 连接打开",
        TUNNELCHANNELCLOSE: "Tunnel 连接关闭",
        TUNNELERROR: "Tunnel 异常",
        PLUGINNOTIFY: "插件通知",
        SYSTEMLOG: "系统日志"
      };
      return labels[type] || type;
    }
    function shortBeaconId(value) {
      if (!value) return "";
      return value.length > 12 ? `${value.slice(0, 12)}…` : value;
    }
    function toneClass(tone) {
      return tone || "info";
    }
    function togglePanel() {
      eventPanel2.toggleVisible();
      if (eventPanel2.visible) {
        syncWidthToViewport();
      }
    }
    watch(
      () => eventPanel2.visible,
      (visible) => {
        if (visible) syncWidthToViewport();
      }
    );
    watch(panelWidth, (w) => {
      eventPanel2.setWidth(w);
    });
    onMounted(() => {
      panelWidth.value = loadWidth();
      eventPanel2.setWidth(panelWidth.value);
      syncWidthToViewport();
      window.addEventListener("mousemove", onMouseMove2);
      window.addEventListener("mouseup", stopResize);
      window.addEventListener("resize", syncWidthToViewport);
    });
    onUnmounted(() => {
      stopResize();
      window.removeEventListener("mousemove", onMouseMove2);
      window.removeEventListener("mouseup", stopResize);
      window.removeEventListener("resize", syncWidthToViewport);
    });
    return (_ctx, _cache) => {
      var _a2, _b;
      return openBlock(), createElementBlock("aside", {
        class: normalizeClass(["event-panel-shell", { collapsed: !unref(eventPanel2).visible, resizing: resizing2.value }]),
        style: normalizeStyle({ width: unref(eventPanel2).visible ? `${panelWidth.value}px` : `${PANEL_COLLAPSED_WIDTH}px` })
      }, [
        createBaseVNode("div", {
          class: normalizeClass(["event-panel glass-card", { collapsed: !unref(eventPanel2).visible, resizing: resizing2.value }])
        }, [
          unref(eventPanel2).visible ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            createBaseVNode("div", {
              class: "resize-handle",
              onMousedown: startResize
            }, null, 32),
            createBaseVNode("header", _hoisted_1$e, [
              createBaseVNode("button", {
                class: "panel-title",
                type: "button",
                onClick: togglePanel
              }, [
                _cache[1] || (_cache[1] = createBaseVNode("span", { class: "panel-icon" }, "🧾", -1)),
                _cache[2] || (_cache[2] = createBaseVNode("span", { class: "panel-name" }, "事件面板", -1)),
                createBaseVNode("span", _hoisted_2$d, toDisplayString(unref(eventPanel2).events.length), 1)
              ]),
              createBaseVNode("div", _hoisted_3$d, [
                createBaseVNode("button", {
                  type: "button",
                  class: "panel-action",
                  onClick: _cache[0] || (_cache[0] = ($event) => unref(eventPanel2).clear())
                }, "清空"),
                createBaseVNode("button", {
                  type: "button",
                  class: "panel-action",
                  onClick: togglePanel
                }, "收起")
              ])
            ]),
            createBaseVNode("div", _hoisted_4$d, [
              unref(eventPanel2).events.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_5$d, " 等待 TeamServer 事件... ")) : (openBlock(), createElementBlock("div", _hoisted_6$c, [
                (openBlock(true), createElementBlock(Fragment, null, renderList(unref(eventPanel2).events, (entry) => {
                  return openBlock(), createElementBlock("article", {
                    key: entry.id,
                    class: normalizeClass(["event-item", toneClass(entry.tone)])
                  }, [
                    createBaseVNode("div", _hoisted_7$c, [
                      createBaseVNode("span", _hoisted_8$b, toDisplayString(formatTypeLabel(entry.type)), 1),
                      createBaseVNode("span", _hoisted_9$b, toDisplayString(formatTime(entry.receivedAt)), 1)
                    ]),
                    createBaseVNode("div", _hoisted_10$b, [
                      entry.beaconId ? (openBlock(), createElementBlock("span", _hoisted_11$b, "Beacon " + toDisplayString(shortBeaconId(entry.beaconId)), 1)) : createCommentVNode("", true),
                      entry.commandName ? (openBlock(), createElementBlock("span", _hoisted_12$b, "命令 " + toDisplayString(entry.commandName), 1)) : createCommentVNode("", true),
                      entry.rawType && entry.rawType !== entry.type ? (openBlock(), createElementBlock("span", _hoisted_13$b, toDisplayString(entry.rawType), 1)) : createCommentVNode("", true)
                    ]),
                    createBaseVNode("div", _hoisted_14$a, toDisplayString(entry.summary), 1)
                  ], 2);
                }), 128))
              ]))
            ])
          ], 64)) : (openBlock(), createElementBlock("button", {
            key: 1,
            class: "event-panel-collapsed-tab",
            type: "button",
            onClick: togglePanel,
            "aria-label": ((_a2 = latest.value) == null ? void 0 : _a2.summary) || "展开事件面板",
            title: ((_b = latest.value) == null ? void 0 : _b.summary) || "等待 TeamServer 事件..."
          }, [
            _cache[3] || (_cache[3] = createBaseVNode("span", { class: "collapsed-icon" }, "🧾", -1)),
            createBaseVNode("span", _hoisted_16$8, toDisplayString(unref(eventPanel2).events.length), 1),
            _cache[4] || (_cache[4] = createBaseVNode("span", { class: "collapsed-label" }, "事件面板", -1)),
            _cache[5] || (_cache[5] = createBaseVNode("span", { class: "collapsed-hint" }, "展开", -1))
          ], 8, _hoisted_15$a))
        ], 2)
      ], 6);
    };
  }
};
const EventPanel = /* @__PURE__ */ _export_sfc(_sfc_main$g, [["__scopeId", "data-v-6ab06f3d"]]);
const _hoisted_1$d = {
  key: 0,
  class: "confirm-overlay"
};
const _hoisted_2$c = { class: "confirm-header" };
const _hoisted_3$c = { class: "type-icon" };
const _hoisted_4$c = { class: "confirm-body" };
const _hoisted_5$c = { class: "confirm-footer" };
const _sfc_main$f = {
  __name: "ConfirmModal",
  setup(__props) {
    const modalStore = useModalStore();
    function handleConfirm() {
      if (modalStore.confirm.onConfirm) {
        modalStore.confirm.onConfirm();
      }
    }
    function handleCancel() {
      if (modalStore.confirm.onCancel) {
        modalStore.confirm.onCancel();
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        createVNode(Transition, { name: "confirm-fade" }, {
          default: withCtx(() => [
            unref(modalStore).confirm.visible ? (openBlock(), createElementBlock("div", _hoisted_1$d, [
              createBaseVNode("div", {
                class: normalizeClass(["confirm-card glass-card", unref(modalStore).confirm.type])
              }, [
                _cache[0] || (_cache[0] = createBaseVNode("div", { class: "card-glow" }, null, -1)),
                createBaseVNode("div", _hoisted_2$c, [
                  createBaseVNode("span", _hoisted_3$c, [
                    unref(modalStore).confirm.type === "danger" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                      createTextVNode("⚠️")
                    ], 64)) : unref(modalStore).confirm.type === "warning" ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                      createTextVNode("⚡")
                    ], 64)) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [
                      createTextVNode("💡")
                    ], 64))
                  ]),
                  createBaseVNode("h3", null, toDisplayString(unref(modalStore).confirm.title), 1)
                ]),
                createBaseVNode("div", _hoisted_4$c, [
                  createBaseVNode("p", null, toDisplayString(unref(modalStore).confirm.message), 1)
                ]),
                createBaseVNode("div", _hoisted_5$c, [
                  createBaseVNode("button", {
                    class: "btn btn-ghost",
                    onClick: handleCancel
                  }, toDisplayString(unref(modalStore).confirm.cancelText || "取消"), 1),
                  createBaseVNode("button", {
                    class: normalizeClass(["btn", unref(modalStore).confirm.type === "danger" ? "btn-danger" : "btn-primary"]),
                    onClick: handleConfirm
                  }, toDisplayString(unref(modalStore).confirm.confirmText || "继续操作"), 3)
                ])
              ], 2)
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        })
      ]);
    };
  }
};
const ConfirmModal = /* @__PURE__ */ _export_sfc(_sfc_main$f, [["__scopeId", "data-v-d8dccdc5"]]);
const _hoisted_1$c = {
  key: 0,
  class: "prompt-overlay"
};
const _hoisted_2$b = { class: "prompt-card glass-card" };
const _hoisted_3$b = { class: "prompt-header" };
const _hoisted_4$b = { class: "prompt-body" };
const _hoisted_5$b = { key: 0 };
const _hoisted_6$b = { class: "input-wrapper" };
const _hoisted_7$b = ["placeholder"];
const _sfc_main$e = {
  __name: "PromptModal",
  setup(__props) {
    const modalStore = useModalStore();
    const inputRef = /* @__PURE__ */ ref(null);
    const inputValue = /* @__PURE__ */ ref("");
    watch(() => modalStore.prompt.visible, async (visible) => {
      var _a2, _b;
      if (visible) {
        inputValue.value = modalStore.prompt.value || "";
        await nextTick();
        (_a2 = inputRef.value) == null ? void 0 : _a2.focus();
        (_b = inputRef.value) == null ? void 0 : _b.select();
      }
    });
    function handleConfirm() {
      if (modalStore.prompt.onConfirm) {
        modalStore.prompt.onConfirm(inputValue.value);
      }
    }
    function handleCancel() {
      if (modalStore.prompt.onCancel) {
        modalStore.prompt.onCancel();
      }
    }
    function handleKeydown(e) {
      if (e.key === "Enter") {
        handleConfirm();
      } else if (e.key === "Escape") {
        handleCancel();
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        createVNode(Transition, { name: "prompt-fade" }, {
          default: withCtx(() => [
            unref(modalStore).prompt.visible ? (openBlock(), createElementBlock("div", _hoisted_1$c, [
              createBaseVNode("div", _hoisted_2$b, [
                _cache[2] || (_cache[2] = createBaseVNode("div", { class: "card-glow" }, null, -1)),
                createBaseVNode("div", _hoisted_3$b, [
                  _cache[1] || (_cache[1] = createBaseVNode("span", { class: "type-icon" }, "📝", -1)),
                  createBaseVNode("h3", null, toDisplayString(unref(modalStore).prompt.title), 1)
                ]),
                createBaseVNode("div", _hoisted_4$b, [
                  unref(modalStore).prompt.message ? (openBlock(), createElementBlock("p", _hoisted_5$b, toDisplayString(unref(modalStore).prompt.message), 1)) : createCommentVNode("", true),
                  createBaseVNode("div", _hoisted_6$b, [
                    withDirectives(createBaseVNode("input", {
                      ref_key: "inputRef",
                      ref: inputRef,
                      "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => inputValue.value = $event),
                      type: "text",
                      placeholder: unref(modalStore).prompt.placeholder,
                      class: "prompt-input",
                      spellcheck: "false",
                      onKeydown: handleKeydown
                    }, null, 40, _hoisted_7$b), [
                      [vModelText, inputValue.value]
                    ])
                  ])
                ]),
                createBaseVNode("div", { class: "prompt-footer" }, [
                  createBaseVNode("button", {
                    class: "btn btn-ghost",
                    onClick: handleCancel
                  }, "取消"),
                  createBaseVNode("button", {
                    class: "btn btn-primary",
                    onClick: handleConfirm
                  }, "确认")
                ])
              ])
            ])) : createCommentVNode("", true)
          ]),
          _: 1
        })
      ]);
    };
  }
};
const PromptModal = /* @__PURE__ */ _export_sfc(_sfc_main$e, [["__scopeId", "data-v-6aa58d2e"]]);
const _hoisted_1$b = {
  key: 0,
  class: "modal-overlay"
};
const _hoisted_2$a = { class: "plugin-action-modal" };
const _hoisted_3$a = { class: "modal-header" };
const _hoisted_4$a = { class: "header-info" };
const _hoisted_5$a = { class: "titles" };
const _hoisted_6$a = { class: "subtitle" };
const _hoisted_7$a = { class: "modal-body" };
const _hoisted_8$a = { class: "summary" };
const _hoisted_9$a = {
  key: 0,
  class: "summary-line"
};
const _hoisted_10$a = {
  key: 1,
  class: "summary-line dim"
};
const _hoisted_11$a = {
  key: 2,
  class: "summary-line dim"
};
const _hoisted_12$a = {
  key: 3,
  class: "summary-line dim"
};
const _hoisted_13$a = { class: "field-label" };
const _hoisted_14$9 = ["value", "placeholder", "onInput"];
const _hoisted_15$9 = ["value", "placeholder", "onInput"];
const _hoisted_16$7 = ["value", "onChange"];
const _hoisted_17$6 = ["value"];
const _hoisted_18$6 = {
  key: 3,
  class: "checkbox-row"
};
const _hoisted_19$6 = ["checked", "onChange"];
const _hoisted_20$6 = {
  key: 4,
  class: "help-text"
};
const _hoisted_21$5 = {
  key: 5,
  class: "help-text required"
};
const _hoisted_22$5 = {
  key: 6,
  class: "help-text type"
};
const _hoisted_23$5 = {
  key: 1,
  class: "empty-hint"
};
const _hoisted_24$5 = { class: "modal-footer" };
const _hoisted_25$5 = ["disabled"];
const _sfc_main$d = {
  __name: "PluginActionModal",
  setup(__props) {
    const modalStore = useModalStore();
    const notificationStore = useNotificationStore();
    const agentStore = useAgentStore();
    const pluginStore = usePluginStore();
    const formValues = /* @__PURE__ */ reactive({});
    const submitting = computed(() => pluginStore.invoking);
    const visible = computed(() => modalStore.pluginActionVisible);
    const activeAction = computed(() => {
      var _a2;
      return ((_a2 = modalStore.activePluginAction) == null ? void 0 : _a2.action) || null;
    });
    const activePluginId = computed(() => {
      var _a2;
      return ((_a2 = modalStore.activePluginAction) == null ? void 0 : _a2.pluginId) || "";
    });
    const activePluginName = computed(() => {
      var _a2;
      return ((_a2 = modalStore.activePluginAction) == null ? void 0 : _a2.pluginName) || "";
    });
    const activeBeaconId = computed(() => {
      var _a2;
      return ((_a2 = modalStore.activePluginAction) == null ? void 0 : _a2.beaconid) || "";
    });
    const activeAgent = computed(() => agentStore.getAgentById(activeBeaconId.value) || null);
    const TEXT_FIELD_TYPES = /* @__PURE__ */ new Set(["string", "int8", "int16", "int32", "int64", "short", "bytes", "text", "input"]);
    const BOOL_FIELD_TYPES = /* @__PURE__ */ new Set(["bool", "boolean", "checkbox"]);
    function getFieldType(field) {
      return String((field == null ? void 0 : field.type) || (field == null ? void 0 : field.Type) || "string").trim().toLowerCase();
    }
    function isTextField(field) {
      return TEXT_FIELD_TYPES.has(getFieldType(field));
    }
    function isBooleanField(field) {
      return BOOL_FIELD_TYPES.has(getFieldType(field));
    }
    function normalizeBooleanDefault(value) {
      if (value === true || value === false) return value;
      const text = String(value ?? "").trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(text)) return true;
      return false;
    }
    function normalizeFieldDefault(field) {
      if (isBooleanField(field)) {
        return normalizeBooleanDefault(field.defaultValue ?? field.default ?? false);
      }
      const defaultValue = field.defaultValue ?? field.default ?? "";
      return defaultValue === void 0 || defaultValue === null ? "" : defaultValue;
    }
    function normalizedAction() {
      const action = activeAction.value || {};
      return {
        id: String(action.id || "").trim(),
        label: String(action.label || action.id || "插件动作").trim(),
        description: String(action.description || ""),
        os: Array.isArray(action.os) ? action.os : [],
        arch: Array.isArray(action.arch) ? action.arch : [],
        artifact: String(action.artifact || ""),
        artifactByArch: action.artifactByArch || action.artifact_by_arch || {},
        commandId: Number(action.commandId || action.command_id || 0) || 0,
        requiresInput: Boolean(action.requiresInput || action.requires_input || false),
        fields: Array.isArray(action.fields) ? action.fields : []
      };
    }
    function resetValues() {
      Object.keys(formValues).forEach((key) => {
        delete formValues[key];
      });
      const action = normalizedAction();
      for (const field of action.fields) {
        const fieldName = String(field.name || "").trim();
        if (!fieldName) continue;
        formValues[fieldName] = normalizeFieldDefault(field);
      }
    }
    watch(
      visible,
      (open) => {
        if (open) {
          resetValues();
        }
      },
      { immediate: true }
    );
    watch(activeAction, () => {
      if (visible.value) {
        resetValues();
      }
    });
    function close() {
      modalStore.closePluginAction();
    }
    function updateField(fieldId, value) {
      if (!fieldId) return;
      formValues[fieldId] = value;
    }
    function validateFields(action) {
      for (const field of action.fields) {
        const fieldName = String(field.name || "").trim();
        if (!fieldName) continue;
        if (isBooleanField(field)) continue;
        if (field.required && String(formValues[fieldName] ?? "").trim() === "") {
          notificationStore.warn(`请填写 ${field.label || fieldName}`);
          return false;
        }
      }
      return true;
    }
    function serializeValues(values) {
      const result = {};
      Object.entries(values).forEach(([key, value]) => {
        if (typeof value === "boolean") {
          result[key] = value ? "true" : "false";
          return;
        }
        if (value === void 0 || value === null) {
          result[key] = "";
          return;
        }
        result[key] = String(value);
      });
      return result;
    }
    function makeStringArg(value) {
      return { kind: "string", value: String(value ?? "") };
    }
    function buildComFileopArgs(values) {
      const op = String(values.op || "").trim();
      const src = String(values.src || "").trim();
      const dst = String(values.dst || "").trim();
      const taskName = String(values.task_name || "").trim();
      if (!["cp", "mv", "taskcp", "taskmv"].includes(op)) {
        throw new Error("COM 文件操作只支持 cp、mv、taskcp、taskmv");
      }
      if (!src) {
        throw new Error("请填写源路径");
      }
      if (!dst) {
        throw new Error("请填写目标路径");
      }
      const args = [makeStringArg(op), makeStringArg(src), makeStringArg(dst)];
      if (op.startsWith("task") && taskName) {
        args.push(makeStringArg(taskName));
      }
      return args;
    }
    async function submit() {
      var _a2, _b;
      const action = normalizedAction();
      if (!activePluginId.value) {
        notificationStore.warn("缺少插件标识");
        return;
      }
      if (!action.id) {
        notificationStore.warn("缺少动作标识");
        return;
      }
      if (!activeBeaconId.value) {
        notificationStore.warn("请先选择 Beacon");
        return;
      }
      if (!validateFields(action)) return;
      try {
        const values = serializeValues(formValues);
        const explicitArgs = action.id === "com_fileop" ? buildComFileopArgs(values) : void 0;
        await pluginStore.invokePluginAction(activePluginId.value, action.id, {
          beacon_id: activeBeaconId.value,
          plugin_id: activePluginId.value,
          plugin_name: activePluginName.value,
          action_id: action.id,
          action_label: action.label,
          command_id: action.commandId,
          artifact: action.artifact,
          artifact_data: action.artifactData || "",
          beacon_os: normalizeBeaconPlatform((_a2 = activeAgent.value) == null ? void 0 : _a2.os),
          beacon_arch: normalizeBeaconArch((_b = activeAgent.value) == null ? void 0 : _b.arch),
          values,
          ...explicitArgs ? { args: explicitArgs } : {}
        });
        close();
      } catch (err) {
        notificationStore.error(err.message || "插件动作执行失败");
        console.error("[PluginActionModal] 执行动作失败:", err);
      }
    }
    return (_ctx, _cache) => {
      var _a2;
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        visible.value ? (openBlock(), createElementBlock("div", _hoisted_1$b, [
          createBaseVNode("div", _hoisted_2$a, [
            createBaseVNode("header", _hoisted_3$a, [
              createBaseVNode("div", _hoisted_4$a, [
                _cache[0] || (_cache[0] = createBaseVNode("span", { class: "icon" }, "🧩", -1)),
                createBaseVNode("div", _hoisted_5$a, [
                  createBaseVNode("h3", null, toDisplayString(normalizedAction().label), 1),
                  createBaseVNode("span", _hoisted_6$a, toDisplayString(activePluginName.value || "插件") + " · " + toDisplayString(activeBeaconId.value || "未选择 Beacon"), 1)
                ])
              ]),
              createBaseVNode("button", {
                class: "close-btn",
                type: "button",
                onClick: close
              }, "×")
            ]),
            createBaseVNode("div", _hoisted_7$a, [
              createBaseVNode("div", _hoisted_8$a, [
                normalizedAction().description ? (openBlock(), createElementBlock("div", _hoisted_9$a, toDisplayString(normalizedAction().description), 1)) : createCommentVNode("", true),
                normalizedAction().artifact ? (openBlock(), createElementBlock("div", _hoisted_10$a, "BOF 文件：" + toDisplayString(normalizedAction().artifact), 1)) : createCommentVNode("", true),
                ((_a2 = activeAction.value) == null ? void 0 : _a2.artifactData) ? (openBlock(), createElementBlock("div", _hoisted_11$a, "BOF 已由宿主预加载")) : createCommentVNode("", true),
                normalizedAction().commandId ? (openBlock(), createElementBlock("div", _hoisted_12$a, "命令 ID：" + toDisplayString(normalizedAction().commandId), 1)) : createCommentVNode("", true)
              ]),
              normalizedAction().fields.length ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(normalizedAction().fields, (field) => {
                return openBlock(), createElementBlock("div", {
                  key: field.name,
                  class: "form-group"
                }, [
                  createBaseVNode("label", _hoisted_13$a, toDisplayString(field.label || field.name), 1),
                  isTextField(field) ? (openBlock(), createElementBlock("input", {
                    key: 0,
                    class: "form-control",
                    value: formValues[field.name] ?? field.defaultValue ?? "",
                    placeholder: field.placeholder || "",
                    onInput: ($event) => updateField(field.name, $event.target.value)
                  }, null, 40, _hoisted_14$9)) : String(field.type).toLowerCase() === "textarea" ? (openBlock(), createElementBlock("textarea", {
                    key: 1,
                    class: "form-control textarea",
                    value: formValues[field.name] ?? field.defaultValue ?? "",
                    placeholder: field.placeholder || "",
                    onInput: ($event) => updateField(field.name, $event.target.value)
                  }, null, 40, _hoisted_15$9)) : String(field.type).toLowerCase() === "select" ? (openBlock(), createElementBlock("select", {
                    key: 2,
                    class: "form-control",
                    value: formValues[field.name] ?? field.defaultValue ?? "",
                    onChange: ($event) => updateField(field.name, $event.target.value)
                  }, [
                    _cache[1] || (_cache[1] = createBaseVNode("option", { value: "" }, "请选择", -1)),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(field.options || [], (option) => {
                      return openBlock(), createElementBlock("option", {
                        key: option,
                        value: option
                      }, toDisplayString(option), 9, _hoisted_17$6);
                    }), 128))
                  ], 40, _hoisted_16$7)) : isBooleanField(field) ? (openBlock(), createElementBlock("label", _hoisted_18$6, [
                    createBaseVNode("input", {
                      type: "checkbox",
                      checked: Boolean(formValues[field.name] ?? field.defaultValue),
                      onChange: ($event) => updateField(field.name, $event.target.checked)
                    }, null, 40, _hoisted_19$6),
                    createBaseVNode("span", null, toDisplayString(field.help || field.placeholder || "启用"), 1)
                  ])) : createCommentVNode("", true),
                  field.help ? (openBlock(), createElementBlock("p", _hoisted_20$6, toDisplayString(field.help), 1)) : field.required ? (openBlock(), createElementBlock("p", _hoisted_21$5, "必填")) : createCommentVNode("", true),
                  field.type ? (openBlock(), createElementBlock("p", _hoisted_22$5, "类型：" + toDisplayString(String(field.type)), 1)) : createCommentVNode("", true)
                ]);
              }), 128)) : (openBlock(), createElementBlock("div", _hoisted_23$5, " 该动作不需要额外参数，确认后将直接执行。 "))
            ]),
            createBaseVNode("footer", _hoisted_24$5, [
              createBaseVNode("button", {
                class: "btn btn-secondary",
                type: "button",
                onClick: close
              }, "取消"),
              createBaseVNode("button", {
                class: "btn btn-primary",
                type: "button",
                onClick: submit,
                disabled: submitting.value
              }, toDisplayString(submitting.value ? "执行中..." : "执行"), 9, _hoisted_25$5)
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const PluginActionModal = /* @__PURE__ */ _export_sfc(_sfc_main$d, [["__scopeId", "data-v-118f223e"]]);
async function generatePayload({ listener_id, os, arch, format, stage_mode = "stagerless", beacon_type = "go" }) {
  const normalizedArch = String(arch).trim().toLowerCase();
  if (!["amd64", "x86", "arm"].includes(normalizedArch)) {
    throw new Error("Payload arch 只允许 amd64、x86 或 arm");
  }
  const normalizedFormat = String(format).trim().toLowerCase();
  const normalizedStageMode = String(stage_mode || "stagerless").trim().toLowerCase();
  if (normalizedFormat === "c" && normalizedStageMode !== "stager") {
    throw new Error("Payload format=c 仅支持 stager 模式");
  }
  const payload = {
    listener_id: String(listener_id),
    os: String(os),
    arch: normalizedArch,
    format: normalizedFormat,
    stage_mode: normalizedStageMode,
    beacon_type: String(beacon_type || "go").trim().toLowerCase()
  };
  return await request("POST", "/api/v1/payload/generate", payload);
}
async function generateShellcode({ mode = "front", pe_base64, loader_name = "ReflectiveLoader" }) {
  const payload = {
    mode: String(mode),
    pe_base64: String(pe_base64 || "")
  };
  if (loader_name !== void 0 && loader_name !== null && String(loader_name).trim()) {
    payload.loader_name = String(loader_name);
  }
  return await request("POST", "/api/v1/payload/shellcode", payload);
}
const _hoisted_1$a = { class: "modal-overlay" };
const _hoisted_2$9 = { class: "modal-container glass-card animate-slide-up" };
const _hoisted_3$9 = { class: "modal-header" };
const _hoisted_4$9 = { class: "modal-body" };
const _hoisted_5$9 = { class: "form-group" };
const _hoisted_6$9 = ["value"];
const _hoisted_7$9 = {
  key: 0,
  class: "info-banner"
};
const _hoisted_8$9 = { class: "info-content" };
const _hoisted_9$9 = { class: "value" };
const _hoisted_10$9 = {
  key: 1,
  class: "config-sections"
};
const _hoisted_11$9 = { class: "form-group" };
const _hoisted_12$9 = { class: "os-grid" };
const _hoisted_13$9 = ["onClick"];
const _hoisted_14$8 = { class: "os-icon" };
const _hoisted_15$8 = { class: "os-label" };
const _hoisted_16$6 = { class: "form-row" };
const _hoisted_17$5 = { class: "form-group flex-1" };
const _hoisted_18$5 = ["disabled"];
const _hoisted_19$5 = ["value"];
const _hoisted_20$5 = { class: "form-group flex-1" };
const _hoisted_21$4 = ["disabled"];
const _hoisted_22$4 = ["value"];
const _hoisted_23$4 = { class: "form-group flex-1" };
const _hoisted_24$4 = ["disabled"];
const _hoisted_25$4 = ["value"];
const _hoisted_26$4 = { class: "field-hint" };
const _hoisted_27$4 = {
  key: 0,
  class: "internal-hint"
};
const _hoisted_28$4 = {
  key: 1,
  class: "internal-hint"
};
const _hoisted_29$4 = {
  key: 2,
  class: "internal-hint"
};
const _hoisted_30$4 = {
  key: 3,
  class: "form-group stage-mode-group"
};
const _hoisted_31$4 = ["value", "disabled"];
const _hoisted_32$4 = { class: "help-text" };
const _hoisted_33$4 = {
  key: 0,
  class: "help-text warning-text"
};
const _hoisted_34$4 = {
  key: 1,
  class: "help-text warning-text"
};
const _hoisted_35$3 = {
  key: 2,
  class: "config-sections"
};
const _hoisted_36$3 = { class: "form-group" };
const _hoisted_37$3 = ["value"];
const _hoisted_38$3 = { class: "help-text" };
const _hoisted_39$3 = { class: "form-group" };
const _hoisted_40$2 = { class: "path-input-group" };
const _hoisted_41$2 = ["value"];
const _hoisted_42$2 = {
  key: 0,
  class: "form-group"
};
const _hoisted_43$2 = { class: "warning-section" };
const _hoisted_44$2 = { class: "modal-footer" };
const _hoisted_45$1 = ["disabled"];
const _hoisted_46$1 = ["disabled"];
const _hoisted_47$1 = { key: 1 };
const _sfc_main$c = {
  __name: "GenerateBeaconModal",
  setup(__props) {
    const modalStore = useModalStore();
    const listenerStore = useListenerStore();
    const notificationStore = useNotificationStore();
    const generationMode = /* @__PURE__ */ ref("beacon");
    const os = /* @__PURE__ */ ref("windows");
    const arch = /* @__PURE__ */ ref("amd64");
    const format = /* @__PURE__ */ ref("exe");
    const stageMode = /* @__PURE__ */ ref("stagerless");
    const beaconType = /* @__PURE__ */ ref("go");
    const generating = /* @__PURE__ */ ref(false);
    const generatingShellcode = /* @__PURE__ */ ref(false);
    const shellcodeFileInputRef = /* @__PURE__ */ ref(null);
    const shellcodeFilePath = /* @__PURE__ */ ref("");
    const shellcodeSelectedFile = /* @__PURE__ */ ref(null);
    const shellcodeMode = /* @__PURE__ */ ref("front");
    const shellcodeLoaderName = /* @__PURE__ */ ref("ReflectiveLoader");
    const activeListener = computed(() => {
      return listenerStore.listeners.find((l) => l.id === modalStore.activeGenerateBeaconListenerId);
    });
    const activeListenerConfig = computed(() => {
      var _a2;
      const config = (_a2 = activeListener.value) == null ? void 0 : _a2.config;
      if (!config) return {};
      if (typeof config === "string") {
        try {
          return JSON.parse(config);
        } catch {
          return {};
        }
      }
      return typeof config === "object" && !Array.isArray(config) ? config : {};
    });
    const activeListenerProtocol = computed(() => {
      var _a2;
      return String(((_a2 = activeListener.value) == null ? void 0 : _a2.protocol) || "").toLowerCase();
    });
    const activeListenerType = computed(() => {
      var _a2, _b;
      return String(((_a2 = activeListener.value) == null ? void 0 : _a2.listener_type) || ((_b = activeListenerConfig.value) == null ? void 0 : _b.listener_type) || "external").toLowerCase();
    });
    const activeListenerStatus = computed(() => {
      var _a2;
      return String(((_a2 = activeListener.value) == null ? void 0 : _a2.status) || "").toLowerCase();
    });
    const activeListenerStagerConfig = computed(() => {
      var _a2;
      const stager = (_a2 = activeListenerConfig.value) == null ? void 0 : _a2.stager;
      return stager && typeof stager === "object" && !Array.isArray(stager) ? stager : null;
    });
    const activeListenerStagerEnabled = computed(() => {
      const stager = activeListenerStagerConfig.value;
      if (!stager) return false;
      if (typeof stager.enabled === "boolean") return stager.enabled;
      return true;
    });
    const activeListenerHasStagerConfig = computed(() => {
      const stager = activeListenerStagerConfig.value;
      if (!stager) return false;
      return Boolean(
        stager.bind_host || stager.bind_port || stager.callback_host || stager.callback_port || stager.base_uri
      );
    });
    const activeListenerSupportsHttpStager = computed(() => {
      return activeListenerType.value === "external" && ["http", "https"].includes(activeListenerProtocol.value) && activeListenerStagerEnabled.value && activeListenerHasStagerConfig.value;
    });
    const osOptions = computed(() => {
      if (isInternal.value) {
        return [{ label: "Windows", value: "windows", icon: "🪟" }];
      }
      return [
        { label: "Windows", value: "windows", icon: "🪟" },
        { label: "Linux", value: "linux", icon: "🐧" }
      ];
    });
    const windowsArchOptions = [
      { label: "amd64 (64位)", value: "amd64" },
      { label: "x86 (32位)", value: "x86" }
    ];
    const linuxArchOptions = [
      { label: "amd64 (64位)", value: "amd64" }
    ];
    const macArchOptions = [
      { label: "arm (Apple Silicon)", value: "arm" }
    ];
    const generationModeOptions = [
      { label: "生成 Beacon 客户端", value: "beacon" },
      { label: "生成 Shellcode", value: "shellcode" }
    ];
    const stageModeOptions = [
      { label: "Stagerless（完整 Payload）", value: "stagerless", description: "生成完整 Beacon payload，行为与旧版本一致。" },
      { label: "Stager（分阶段）", value: "stager", description: "生成 stager payload，并由 Listener HTTP Stager 下载完整 stage。" }
    ];
    const beaconTypeOptions = [
      { label: "Go-Beacon", value: "go", description: "Go 实现，支持 Windows / Linux / macOS" },
      { label: "C-Beacon", value: "c", description: "C 实现，仅支持 Windows" }
    ];
    const shellcodeModeOptions = [
      { label: "front", value: "front", description: "在 PE 前拼接 bootstrap 和 RDI shellcode，再追加 PE 内容" },
      { label: "post", value: "post", description: "将 bootstrap 写入 PE 起始位置，并在 PE 后追加 RDI shellcode" },
      { label: "embed", value: "embed", description: "查找 DLL 导出的 loader 函数，将 DOS 头替换为跳转 stub" }
    ];
    const isInternal = computed(() => activeListenerType.value === "internal");
    const isShellcodeMode = computed(() => generationMode.value === "shellcode");
    const needsShellcodeLoaderName = computed(() => shellcodeMode.value === "embed");
    const currentShellcodeModeMeta = computed(() => {
      return shellcodeModeOptions.find((item) => item.value === shellcodeMode.value) || shellcodeModeOptions[0];
    });
    const currentStageModeMeta = computed(() => {
      return stageModeOptions.find((item) => item.value === stageMode.value) || stageModeOptions[0];
    });
    const availableArchOptions = computed(() => {
      if (isInternal.value) return [{ label: "amd64 (64位)", value: "amd64" }];
      if (os.value === "mac") return macArchOptions;
      if (os.value === "linux") return linuxArchOptions;
      return windowsArchOptions;
    });
    const availableStageModeOptions = computed(() => {
      return stageModeOptions.map((item) => ({
        ...item,
        disabled: item.value === "stager" && (os.value !== "windows" || isInternal.value)
      }));
    });
    const availableBeaconTypes = computed(() => {
      if (isInternal.value) return [{ label: "C-Beacon", value: "c", description: "C 实现，Internal 监听器固定使用" }];
      if (os.value === "mac" || os.value === "linux") return [{ label: "Go-Beacon", value: "go", description: "Go 实现，当前 OS 固定使用" }];
      return beaconTypeOptions;
    });
    const modalTitle = computed(() => isShellcodeMode.value ? "生成 Shellcode" : "生成 Beacon 客户端");
    const primaryButtonLabel = computed(() => {
      if (isShellcodeMode.value) {
        return generatingShellcode.value ? "生成中..." : "💾 生成并保存";
      }
      return generating.value ? "编译中..." : "🚀 编译并保存";
    });
    const isBusy = computed(() => generating.value || generatingShellcode.value);
    const generateDisabled = computed(() => {
      return isBusy.value;
    });
    const warningText = computed(() => {
      if (isShellcodeMode.value) {
        return `前端会把你选择的本地 PE 文件编码后发送给后端，以 ${currentShellcodeModeMeta.value.label} 模式生成 shellcode，再保存到本地。`;
      }
      if (isInternal.value) {
        return "Internal Cascade Beacon 仅支持 Windows，由父级 Beacon 承载并转发通信。后端将自动注入级联配置（加密密钥、协议特征）到模板中。";
      }
      if (activeListener.value && activeListenerStatus.value !== "started") {
        return "生成前要求 Listener 状态为 started；paused、stopped、error 等状态都会被后端拒绝。";
      }
      if (stageMode.value === "stager") {
        if (os.value !== "windows") {
          return "Stager 模板当前支持 Windows amd64 和 Windows 32 位；Linux 请使用 Stagerless。";
        }
        if (!activeListenerSupportsHttpStager.value) {
          if (!["http", "https"].includes(activeListenerProtocol.value) || activeListenerType.value !== "external") {
            return "Stager 模式要求 Listener 类型为 external http/https。";
          }
          if (!activeListenerStagerEnabled.value) {
            return "当前选择了 Stager 模式，但目标 Listener 的 C2 Profile 未启用 HTTP Stager。";
          }
          return "当前选择了 Stager 模式，但目标 Listener 缺少 HTTP Stager 端点配置。";
        }
        if (arch.value === "x86") {
          return "当前选择了 32 位 Stager；后端使用 stager_windows_32.*，完整 stage 需要匹配 beacon_windows_x86.dll，并写入 static/stages/<stage_id>/stage.bin。";
        }
        if (format.value === "c") {
          return "当前选择了 Stager C 数组格式；后端返回 base64 编码的 C 源码文本，保存后为 .c 文件，完整 stage 会写入 TeamServer 的 static/stages/<stage_id>/stage.bin。";
        }
        return "当前选择了 Stager 模式；format=exe 返回 PE stager，format=bin 返回 shellcode stager，format=c 返回 C 数组源码，完整 stage 会写入 TeamServer 的 static/stages/<stage_id>/stage.bin。";
      }
      return "生成过程将根据监听模式自动注入加密密钥与传输协议特征。format=exe 返回 PE，format=bin 返回 shellcode。";
    });
    const availableFormats = computed(() => {
      if (isInternal.value) {
        return [{ label: "Executable (.exe)", value: "exe" }];
      }
      if (beaconType.value === "c") {
        return [{ label: "Executable (.exe)", value: "exe" }];
      }
      switch (os.value) {
        case "windows": {
          const formats = [
            { label: "Executable (.exe)", value: "exe" },
            { label: "Shellcode (.bin)", value: "bin" }
          ];
          if (stageMode.value === "stager") {
            formats.push({ label: "C Array Source (.c)", value: "c" });
          }
          return formats;
        }
        case "linux":
          return [
            { label: "ELF Executable", value: "elf" }
          ];
        case "mac":
          return [
            { label: "Mach-O Executable", value: "macho" }
          ];
        default:
          return [{ label: "Executable (.exe)", value: "exe" }];
      }
    });
    watch(os, (newOs) => {
      var _a2;
      if (newOs === "mac") {
        beaconType.value = "go";
        arch.value = "arm";
        format.value = "macho";
      } else if (newOs === "linux") {
        beaconType.value = "go";
        format.value = "elf";
      } else {
        format.value = "exe";
      }
      if (!availableArchOptions.value.some((item) => item.value === arch.value)) {
        arch.value = ((_a2 = availableArchOptions.value[0]) == null ? void 0 : _a2.value) || "amd64";
      }
      if (newOs !== "windows" && stageMode.value === "stager") {
        stageMode.value = "stagerless";
      }
    });
    watch(stageMode, (mode) => {
      if (mode !== "stager") {
        if (format.value === "c") {
          if (os.value === "windows") format.value = "exe";
          else if (os.value === "mac") format.value = "macho";
          else format.value = "elf";
        }
        return;
      }
      os.value = "windows";
      if (!["exe", "bin", "c"].includes(format.value)) {
        format.value = "exe";
      }
      if (!windowsArchOptions.some((item) => item.value === arch.value)) {
        arch.value = "amd64";
      }
    });
    watch(isInternal, (val) => {
      if (val) {
        beaconType.value = "c";
        os.value = "windows";
        arch.value = "amd64";
        format.value = "exe";
        stageMode.value = "stagerless";
      }
    }, { immediate: true });
    watch(beaconType, (type) => {
      if (type === "c") {
        if (os.value === "mac" || os.value === "linux") os.value = "windows";
        format.value = "exe";
      }
    });
    function readFileAsBase642(file) {
      return new Promise((resolve2, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || "");
          resolve2(result.includes(",") ? result.split(",")[1] : result);
        };
        reader.onerror = () => reject(reader.error || new Error("读取本地文件失败"));
        reader.readAsDataURL(file);
      });
    }
    function buildShellcodeDefaultName(fileName) {
      const sourceName = String(fileName || "shellcode");
      const trimmed = sourceName.replace(/\.(exe|dll)$/i, "");
      return `${trimmed || "shellcode"}.bin`;
    }
    function triggerShellcodeFileInput() {
      if (generating.value || generatingShellcode.value) return;
      if (shellcodeFileInputRef.value) {
        shellcodeFileInputRef.value.click();
      }
    }
    async function generateShellcodeFromFile(file) {
      var _a2;
      generatingShellcode.value = true;
      try {
        const peBase64 = await readFileAsBase642(file);
        const result = await generateShellcode({
          mode: shellcodeMode.value,
          pe_base64: peBase64,
          loader_name: needsShellcodeLoaderName.value ? String(shellcodeLoaderName.value || "ReflectiveLoader") : void 0
        });
        const shellcode = (result == null ? void 0 : result.shellcode) ?? ((_a2 = result == null ? void 0 : result.data) == null ? void 0 : _a2.shellcode);
        if (!shellcode) {
          throw new Error((result == null ? void 0 : result.message) || (result == null ? void 0 : result.error) || "生成 shellcode 失败");
        }
        const savePath = await SaveFile({
          Title: "保存生成的 Shellcode",
          Filename: buildShellcodeDefaultName(file == null ? void 0 : file.name),
          Filters: [
            { Name: "Shellcode Files", Pattern: "*.bin" }
          ]
        });
        if (!savePath) {
          notificationStore.info("已取消保存");
          return;
        }
        await WriteBinaryFile(savePath, shellcode);
        notificationStore.success("Shellcode 生成成功并已保存到本地");
      } catch (err) {
        console.error("Shellcode generation failed:", err);
        notificationStore.error(`生成 Shellcode 失败: ${err.message || err}`);
      } finally {
        generatingShellcode.value = false;
      }
    }
    async function handleShellcodeFileSelected(event) {
      var _a2;
      const file = (_a2 = event.target.files) == null ? void 0 : _a2[0];
      event.target.value = "";
      if (!file) return;
      shellcodeSelectedFile.value = file;
      shellcodeFilePath.value = file.name;
    }
    async function handleGenerateShellcode() {
      if (!shellcodeSelectedFile.value) {
        notificationStore.warn("请先选择待转换的 PE 文件");
        return;
      }
      await generateShellcodeFromFile(shellcodeSelectedFile.value);
    }
    async function handleGenerateBeacon() {
      var _a2, _b, _c, _d, _e;
      if (!activeListener.value) {
        notificationStore.warn("请先选择 Listener");
        return;
      }
      if (activeListenerStatus.value !== "started") {
        notificationStore.warn("生成前请先启动 Listener");
        return;
      }
      if (stageMode.value === "stager") {
        if (os.value !== "windows") {
          notificationStore.warn("Stager 当前仅支持 Windows amd64 / 32 位");
          return;
        }
        if (!activeListenerSupportsHttpStager.value) {
          if (!["http", "https"].includes(activeListenerProtocol.value) || activeListenerType.value !== "external") {
            notificationStore.warn("Stager 模式要求 Listener 类型为 external http/https");
            return;
          }
          if (!activeListenerStagerEnabled.value) {
            notificationStore.warn("当前 Listener 的 C2 Profile 未启用 HTTP Stager，请编辑 Listener 并选择启用了 stager 的 profile");
            return;
          }
          notificationStore.warn("当前 Listener 缺少 HTTP Stager 端点配置，请编辑 Listener 后再生成");
          return;
        }
      } else if (format.value === "c") {
        notificationStore.warn("C 数组格式仅支持 Stager 模式");
        return;
      }
      generating.value = true;
      try {
        const result = await generatePayload({
          listener_id: activeListener.value.id,
          os: os.value,
          arch: arch.value,
          format: format.value,
          stage_mode: stageMode.value,
          beacon_type: beaconType.value
        });
        const payload = (result == null ? void 0 : result.payload) ?? ((_a2 = result == null ? void 0 : result.data) == null ? void 0 : _a2.payload);
        if (!payload) {
          throw new Error((result == null ? void 0 : result.message) || (result == null ? void 0 : result.error) || "生成失败");
        }
        const ext = format.value === "c" ? "c" : format.value;
        const responseFileName = (result == null ? void 0 : result.file_name) ?? ((_b = result == null ? void 0 : result.data) == null ? void 0 : _b.file_name) ?? "";
        const defaultName = responseFileName || `${stageMode.value === "stager" ? "stager" : "beacon"}_${os.value}_${arch.value}_${activeListener.value.name}.${ext}`;
        const filterName = format.value === "c" ? "C Source Files" : "Payload Files";
        const savePath = await SaveFile({
          Title: stageMode.value === "stager" ? "保存生成的 Stager" : "保存生成的 Beacon",
          Filename: defaultName,
          Filters: [
            { Name: filterName, Pattern: `*.${ext}` }
          ]
        });
        if (!savePath) {
          notificationStore.info("已取消保存");
          return;
        }
        await WriteBinaryFile(savePath, payload);
        const responseStageMode = (result == null ? void 0 : result.stage_mode) ?? ((_c = result == null ? void 0 : result.data) == null ? void 0 : _c.stage_mode) ?? stageMode.value;
        const stageId = (result == null ? void 0 : result.stage_id) ?? ((_d = result == null ? void 0 : result.data) == null ? void 0 : _d.stage_id) ?? "";
        const stageUrl = (result == null ? void 0 : result.stage_url) ?? ((_e = result == null ? void 0 : result.data) == null ? void 0 : _e.stage_url) ?? "";
        notificationStore.success(
          stageUrl ? `${format.value === "c" ? "Stager C 源码" : "Stager"} 生成成功并已保存到本地，Stage ID: ${stageId || "-"}，Stage URL: ${stageUrl}` : `Beacon 生成成功并已保存到本地 (${responseStageMode})`
        );
        modalStore.closeGenerateBeacon();
      } catch (err) {
        console.error("Payload generation failed:", err);
        notificationStore.error(`生成失败: ${err.message}`);
      } finally {
        generating.value = false;
      }
    }
    async function handleGenerate() {
      if (isShellcodeMode.value) {
        await handleGenerateShellcode();
        return;
      }
      await handleGenerateBeacon();
    }
    watch(generationMode, (mode) => {
      if (mode !== "shellcode") return;
      shellcodeFilePath.value = "";
      shellcodeSelectedFile.value = null;
      shellcodeMode.value = "front";
      shellcodeLoaderName.value = "ReflectiveLoader";
    });
    watch(generationMode, (mode) => {
      if (mode === "beacon") {
        stageMode.value = "stagerless";
      }
    });
    return (_ctx, _cache) => {
      var _a2;
      return openBlock(), createElementBlock("div", _hoisted_1$a, [
        createBaseVNode("div", _hoisted_2$9, [
          createBaseVNode("div", _hoisted_3$9, [
            _cache[10] || (_cache[10] = createBaseVNode("div", { class: "header-tag" }, "PAYLOAD GENERATOR", -1)),
            createBaseVNode("h2", null, toDisplayString(modalTitle.value), 1),
            createBaseVNode("button", {
              class: "close-btn",
              onClick: _cache[0] || (_cache[0] = ($event) => unref(modalStore).closeGenerateBeacon())
            }, "×")
          ]),
          createBaseVNode("div", _hoisted_4$9, [
            createBaseVNode("div", _hoisted_5$9, [
              _cache[11] || (_cache[11] = createBaseVNode("label", null, "生成类型", -1)),
              withDirectives(createBaseVNode("select", {
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => generationMode.value = $event),
                class: "glass-select"
              }, [
                (openBlock(), createElementBlock(Fragment, null, renderList(generationModeOptions, (item) => {
                  return createBaseVNode("option", {
                    key: item.value,
                    value: item.value
                  }, toDisplayString(item.label), 9, _hoisted_6$9);
                }), 64))
              ], 512), [
                [vModelSelect, generationMode.value]
              ])
            ]),
            !isShellcodeMode.value && activeListener.value ? (openBlock(), createElementBlock("div", _hoisted_7$9, [
              _cache[13] || (_cache[13] = createBaseVNode("span", { class: "icon" }, "📡", -1)),
              createBaseVNode("div", _hoisted_8$9, [
                _cache[12] || (_cache[12] = createBaseVNode("label", null, "目标监听器", -1)),
                createBaseVNode("div", _hoisted_9$9, toDisplayString(activeListener.value.name) + " (" + toDisplayString(activeListener.value.protocol.toUpperCase()) + ")", 1)
              ])
            ])) : createCommentVNode("", true),
            !isShellcodeMode.value ? (openBlock(), createElementBlock("div", _hoisted_10$9, [
              createBaseVNode("div", _hoisted_11$9, [
                _cache[14] || (_cache[14] = createBaseVNode("label", null, "目标操作系统 (OS)", -1)),
                createBaseVNode("div", _hoisted_12$9, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(osOptions.value, (opt) => {
                    return openBlock(), createElementBlock("div", {
                      key: opt.value,
                      class: normalizeClass(["os-card", { active: os.value === opt.value, disabled: osOptions.value.length === 1 }]),
                      onClick: ($event) => osOptions.value.length > 1 && (os.value = opt.value)
                    }, [
                      createBaseVNode("div", _hoisted_14$8, toDisplayString(opt.icon), 1),
                      createBaseVNode("div", _hoisted_15$8, toDisplayString(opt.label), 1)
                    ], 10, _hoisted_13$9);
                  }), 128))
                ])
              ]),
              createBaseVNode("div", _hoisted_16$6, [
                createBaseVNode("div", _hoisted_17$5, [
                  _cache[15] || (_cache[15] = createBaseVNode("label", null, "处理器架构 (Arch)", -1)),
                  withDirectives(createBaseVNode("select", {
                    "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => arch.value = $event),
                    class: "glass-select",
                    disabled: availableArchOptions.value.length === 1
                  }, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(availableArchOptions.value, (a) => {
                      return openBlock(), createElementBlock("option", {
                        key: a.value,
                        value: a.value
                      }, toDisplayString(a.label), 9, _hoisted_19$5);
                    }), 128))
                  ], 8, _hoisted_18$5), [
                    [vModelSelect, arch.value]
                  ])
                ]),
                createBaseVNode("div", _hoisted_20$5, [
                  _cache[16] || (_cache[16] = createBaseVNode("label", null, "输出格式 (Format)", -1)),
                  withDirectives(createBaseVNode("select", {
                    "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => format.value = $event),
                    class: "glass-select",
                    disabled: availableFormats.value.length === 1
                  }, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(availableFormats.value, (f) => {
                      return openBlock(), createElementBlock("option", {
                        key: f.value,
                        value: f.value
                      }, toDisplayString(f.label), 9, _hoisted_22$4);
                    }), 128))
                  ], 8, _hoisted_21$4), [
                    [vModelSelect, format.value]
                  ])
                ]),
                createBaseVNode("div", _hoisted_23$4, [
                  _cache[17] || (_cache[17] = createBaseVNode("label", null, "Beacon 类型", -1)),
                  withDirectives(createBaseVNode("select", {
                    "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => beaconType.value = $event),
                    class: "glass-select",
                    disabled: availableBeaconTypes.value.length === 1
                  }, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(availableBeaconTypes.value, (bt) => {
                      return openBlock(), createElementBlock("option", {
                        key: bt.value,
                        value: bt.value
                      }, toDisplayString(bt.label), 9, _hoisted_25$4);
                    }), 128))
                  ], 8, _hoisted_24$4), [
                    [vModelSelect, beaconType.value]
                  ]),
                  createBaseVNode("p", _hoisted_26$4, toDisplayString((_a2 = availableBeaconTypes.value.find((bt) => bt.value === beaconType.value)) == null ? void 0 : _a2.description), 1)
                ])
              ]),
              isInternal.value ? (openBlock(), createElementBlock("div", _hoisted_27$4, [..._cache[18] || (_cache[18] = [
                createBaseVNode("span", { class: "hint-icon" }, "🔗", -1),
                createBaseVNode("div", null, [
                  createBaseVNode("strong", null, "Cascade Internal Beacon"),
                  createBaseVNode("p", null, "固定使用 C-Beacon (Windows / amd64 / exe)，由父级 Beacon 承载并转发通信，不支持 Stager 模式。")
                ], -1)
              ])])) : createCommentVNode("", true),
              !isInternal.value && os.value === "mac" ? (openBlock(), createElementBlock("div", _hoisted_28$4, [..._cache[19] || (_cache[19] = [
                createBaseVNode("span", { class: "hint-icon" }, "🍎", -1),
                createBaseVNode("div", null, [
                  createBaseVNode("strong", null, "macOS Beacon"),
                  createBaseVNode("p", null, "macOS 仅支持 Go-Beacon (arm / macho)。")
                ], -1)
              ])])) : createCommentVNode("", true),
              !isInternal.value && os.value === "linux" ? (openBlock(), createElementBlock("div", _hoisted_29$4, [..._cache[20] || (_cache[20] = [
                createBaseVNode("span", { class: "hint-icon" }, "🐧", -1),
                createBaseVNode("div", null, [
                  createBaseVNode("strong", null, "Linux Beacon"),
                  createBaseVNode("p", null, "Linux 仅支持 Go-Beacon (amd64 / elf)。")
                ], -1)
              ])])) : createCommentVNode("", true),
              !isInternal.value ? (openBlock(), createElementBlock("div", _hoisted_30$4, [
                _cache[21] || (_cache[21] = createBaseVNode("label", null, "Stage 模式", -1)),
                withDirectives(createBaseVNode("select", {
                  "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => stageMode.value = $event),
                  class: "glass-select"
                }, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(availableStageModeOptions.value, (item) => {
                    return openBlock(), createElementBlock("option", {
                      key: item.value,
                      value: item.value,
                      disabled: item.disabled
                    }, toDisplayString(item.label), 9, _hoisted_31$4);
                  }), 128))
                ], 512), [
                  [vModelSelect, stageMode.value]
                ]),
                createBaseVNode("p", _hoisted_32$4, toDisplayString(currentStageModeMeta.value.description), 1),
                stageMode.value === "stager" && !activeListenerStagerEnabled.value ? (openBlock(), createElementBlock("p", _hoisted_33$4, " 当前 Listener 的 C2 Profile 未启用 HTTP Stager，请编辑 Listener 并选择启用了 stager 的 profile。 ")) : stageMode.value === "stager" && !activeListenerSupportsHttpStager.value ? (openBlock(), createElementBlock("p", _hoisted_34$4, " Stager 要求 external http/https Listener，并配置 HTTP Stager 端点。 ")) : createCommentVNode("", true)
              ])) : createCommentVNode("", true)
            ])) : (openBlock(), createElementBlock("div", _hoisted_35$3, [
              createBaseVNode("div", _hoisted_36$3, [
                _cache[22] || (_cache[22] = createBaseVNode("label", null, "Shellcode 模式", -1)),
                withDirectives(createBaseVNode("select", {
                  "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => shellcodeMode.value = $event),
                  class: "glass-select"
                }, [
                  (openBlock(), createElementBlock(Fragment, null, renderList(shellcodeModeOptions, (item) => {
                    return createBaseVNode("option", {
                      key: item.value,
                      value: item.value
                    }, toDisplayString(item.label), 9, _hoisted_37$3);
                  }), 64))
                ], 512), [
                  [vModelSelect, shellcodeMode.value]
                ]),
                createBaseVNode("p", _hoisted_38$3, toDisplayString(currentShellcodeModeMeta.value.description), 1)
              ]),
              createBaseVNode("div", _hoisted_39$3, [
                _cache[23] || (_cache[23] = createBaseVNode("label", null, "PE 文件", -1)),
                createBaseVNode("div", _hoisted_40$2, [
                  createBaseVNode("input", {
                    type: "text",
                    value: shellcodeFilePath.value,
                    class: "form-control",
                    placeholder: "请选择本地 PE 文件（.exe / .dll）...",
                    readonly: "",
                    onClick: triggerShellcodeFileInput
                  }, null, 8, _hoisted_41$2),
                  createBaseVNode("button", {
                    class: "browse-btn",
                    type: "button",
                    onClick: triggerShellcodeFileInput
                  }, "选择文件")
                ]),
                _cache[24] || (_cache[24] = createBaseVNode("p", { class: "help-text" }, "支持的后缀类型: .exe, .dll", -1))
              ]),
              needsShellcodeLoaderName.value ? (openBlock(), createElementBlock("div", _hoisted_42$2, [
                _cache[25] || (_cache[25] = createBaseVNode("label", null, "Loader 名称", -1)),
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => shellcodeLoaderName.value = $event),
                  type: "text",
                  class: "form-control",
                  placeholder: "请输入导出的 Loader 名称..."
                }, null, 512), [
                  [vModelText, shellcodeLoaderName.value]
                ]),
                _cache[26] || (_cache[26] = createBaseVNode("p", { class: "help-text" }, "仅 embed 模式需要。默认值为 ReflectiveLoader。", -1))
              ])) : createCommentVNode("", true)
            ])),
            createBaseVNode("div", _hoisted_43$2, [
              _cache[27] || (_cache[27] = createBaseVNode("span", { class: "icon" }, "🛡️", -1)),
              createBaseVNode("p", null, toDisplayString(warningText.value), 1)
            ])
          ]),
          createBaseVNode("div", _hoisted_44$2, [
            createBaseVNode("input", {
              ref_key: "shellcodeFileInputRef",
              ref: shellcodeFileInputRef,
              type: "file",
              accept: ".exe,.dll",
              style: { "display": "none" },
              onChange: handleShellcodeFileSelected
            }, null, 544),
            createBaseVNode("button", {
              class: "btn btn-ghost",
              onClick: _cache[8] || (_cache[8] = ($event) => unref(modalStore).closeGenerateBeacon()),
              disabled: isBusy.value
            }, " 取消 ", 8, _hoisted_45$1),
            createBaseVNode("button", {
              class: "btn btn-primary btn-generate",
              onClick: _cache[9] || (_cache[9] = ($event) => handleGenerate()),
              disabled: generateDisabled.value
            }, [
              isBusy.value ? (openBlock(), createElementBlock("span", {
                key: 0,
                class: normalizeClass(["loader", { "shellcode-loader": isShellcodeMode.value }])
              }, null, 2)) : (openBlock(), createElementBlock("span", _hoisted_47$1, toDisplayString(primaryButtonLabel.value), 1))
            ], 8, _hoisted_46$1)
          ])
        ])
      ]);
    };
  }
};
const GenerateBeaconModal = /* @__PURE__ */ _export_sfc(_sfc_main$c, [["__scopeId", "data-v-d9d0581b"]]);
function useModalDragResize(options = {}) {
  const {
    defaultWidth = 800,
    defaultHeight = 600,
    minWidth = 600,
    minHeight = 400,
    sidebarWidth = 260,
    onBeforeDrag = null,
    onBeforeResize = null
  } = options;
  const winPos = /* @__PURE__ */ ref({ x: 0, y: 0 });
  const winSize = /* @__PURE__ */ ref({ w: defaultWidth, h: defaultHeight });
  const isDragging = /* @__PURE__ */ ref(false);
  const isResizing = /* @__PURE__ */ ref(false);
  const resizeType = /* @__PURE__ */ ref("");
  const dragOffset = /* @__PURE__ */ ref({ x: 0, y: 0 });
  const resizeSnapshot = /* @__PURE__ */ ref({ x: 0, y: 0, w: 0, h: 0, mouseX: 0, mouseY: 0 });
  function initWindowPosition() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const mainWidth = Math.max(0, viewportWidth - sidebarWidth);
    winPos.value = {
      x: sidebarWidth + Math.max(20, (mainWidth - winSize.value.w) / 2),
      y: Math.max(20, (viewportHeight - winSize.value.h) / 2)
    };
  }
  function startDrag(event) {
    if (event.target.closest(".close-btn")) return;
    onBeforeDrag == null ? void 0 : onBeforeDrag();
    isDragging.value = true;
    dragOffset.value = {
      x: event.clientX - winPos.value.x,
      y: event.clientY - winPos.value.y
    };
    document.addEventListener("mousemove", handleDrag);
    document.addEventListener("mouseup", stopDrag);
  }
  function handleDrag(event) {
    if (!isDragging.value) return;
    winPos.value = {
      x: event.clientX - dragOffset.value.x,
      y: event.clientY - dragOffset.value.y
    };
  }
  function stopDrag() {
    isDragging.value = false;
    document.removeEventListener("mousemove", handleDrag);
    document.removeEventListener("mouseup", stopDrag);
  }
  function startResize(type, event) {
    event.stopPropagation();
    onBeforeResize == null ? void 0 : onBeforeResize();
    isResizing.value = true;
    resizeType.value = type;
    resizeSnapshot.value = {
      x: winPos.value.x,
      y: winPos.value.y,
      w: winSize.value.w,
      h: winSize.value.h,
      mouseX: event.clientX,
      mouseY: event.clientY
    };
    document.addEventListener("mousemove", handleResize);
    document.addEventListener("mouseup", stopResize);
  }
  function handleResize(event) {
    if (!isResizing.value) return;
    const dx = event.clientX - resizeSnapshot.value.mouseX;
    const dy = event.clientY - resizeSnapshot.value.mouseY;
    const type = resizeType.value;
    let nextX = resizeSnapshot.value.x;
    let nextY = resizeSnapshot.value.y;
    let nextW = resizeSnapshot.value.w;
    let nextH = resizeSnapshot.value.h;
    if (type.includes("e")) {
      nextW = Math.max(minWidth, resizeSnapshot.value.w + dx);
    } else if (type.includes("w")) {
      const attemptedW = resizeSnapshot.value.w - dx;
      if (attemptedW > minWidth) {
        nextW = attemptedW;
        nextX = resizeSnapshot.value.x + dx;
      }
    }
    if (type.includes("s")) {
      nextH = Math.max(minHeight, resizeSnapshot.value.h + dy);
    } else if (type.includes("n")) {
      const attemptedH = resizeSnapshot.value.h - dy;
      if (attemptedH > minHeight) {
        nextH = attemptedH;
        nextY = resizeSnapshot.value.y + dy;
      }
    }
    winPos.value = { x: nextX, y: nextY };
    winSize.value = { w: nextW, h: nextH };
  }
  function stopResize() {
    isResizing.value = false;
    document.removeEventListener("mousemove", handleResize);
    document.removeEventListener("mouseup", stopResize);
  }
  return {
    winPos,
    winSize,
    isDragging,
    isResizing,
    resizeType,
    initWindowPosition,
    startDrag,
    startResize,
    stopDrag,
    stopResize
  };
}
function calcProgress(receivedBytes, size, receivedChunks, totalChunks, status) {
  if (status === "completed" || status === "success") return 100;
  if (size > 0 && receivedBytes >= 0) {
    const p2 = Math.floor(receivedBytes / size * 100);
    return Math.min(99, p2);
  }
  if (totalChunks > 0 && receivedChunks >= 0) {
    const p2 = Math.floor(receivedChunks / totalChunks * 100);
    return Math.min(99, p2);
  }
  return 0;
}
function pickBeaconId(current, next) {
  if (current.status === "queued" && current.beaconId) return current.beaconId;
  if (next.status === "queued" && next.beaconId) return next.beaconId;
  return next.beaconId || current.beaconId;
}
function normalizePath(path) {
  if (!path) return "";
  return String(path).trim().replace(/\//g, "\\").replace(/\\+/g, "\\").toLowerCase();
}
function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}
function normalizeTransfer(data, fallbackStatus = "running") {
  const totalChunksRaw = pick(data, [
    "total_chunks",
    "total_chunk",
    "totalChunks",
    "totalChunk",
    "TotalChunks",
    "TotalChunk",
    "chunk_count",
    "chunkCount",
    "ChunkCount",
    "chunks_total",
    "chunksTotal",
    "ChunksTotal"
  ]);
  const size = toNumber(pick(data, ["size", "Size"]));
  let totalChunks = toNumber(totalChunksRaw);
  if (!totalChunks && size > 0) {
    totalChunks = Math.ceil(size / 524288);
  }
  const rawReceivedChunks = pick(data, ["received_chunks", "receivedChunks", "ReceivedChunks", "acked_chunks", "queued_chunks"], null);
  const chunkIndex = pick(data, ["chunk_index", "chunkIndex", "ChunkIndex"], null);
  const receivedChunks = rawReceivedChunks !== null ? toNumber(rawReceivedChunks) : chunkIndex !== null ? toNumber(chunkIndex) + 1 : 0;
  const status = String(pick(data, ["status", "Status"], fallbackStatus));
  const pickId = (keys) => {
    const val = pick(data, keys);
    return val === void 0 || val === null || val === "" ? "" : String(val);
  };
  const res = {
    taskId: pickId(["task_id", "taskId", "TaskID", "TaskId"]),
    direction: String(pick(data, ["direction", "Direction"], "download")).toLowerCase(),
    beaconId: pickId(["beacon_id", "becon_id", "beaconid", "beaconId", "BeaconID", "BeaconId"]),
    fileId: pickId(["file_id", "fileId", "FileID", "FileId"]),
    fileName: String(pick(data, ["file_name", "fileName", "FileName"])),
    remotePath: String(pick(data, ["remote_path", "remotePath", "RemotePath"])),
    totalChunks,
    receivedChunks,
    receivedBytes: toNumber(pick(data, ["received_bytes", "receivedBytes", "ReceivedBytes", "acked_bytes", "queued_bytes"])),
    size,
    status,
    error: String(pick(data, ["error", "Error", "error_message", "errorMessage", "message", "Message"])),
    updatedAt: Date.now()
  };
  if (res.status === "queued" && (res.receivedChunks > 0 || res.receivedBytes > 0)) {
    res.status = res.direction === "upload" ? "uploading" : "running";
  }
  res.progress = calcProgress(res.receivedBytes, res.size, res.receivedChunks, res.totalChunks, res.status);
  return res;
}
function sameTransfer(left, right) {
  if (left.taskId && right.taskId && left.taskId === right.taskId) return true;
  if (left.fileId && right.fileId && left.fileId === right.fileId) return true;
  if (left.direction !== right.direction) return false;
  const sameBeacon = left.beaconId && right.beaconId && (left.beaconId === right.beaconId || left.beaconId.startsWith(right.beaconId) || right.beaconId.startsWith(left.beaconId));
  const compatibleBeacon = sameBeacon || !left.beaconId || !right.beaconId || left.status === "queued" || right.status === "queued";
  if (!compatibleBeacon) return false;
  if (left.remotePath && right.remotePath && normalizePath(left.remotePath) === normalizePath(right.remotePath)) return true;
  return Boolean(left.fileName && right.fileName && normalizeName(left.fileName) === normalizeName(right.fileName));
}
const useFileTransferStore = /* @__PURE__ */ defineStore("fileTransfer", {
  state: () => ({
    transfers: []
  }),
  getters: {
    getTransfers: (state) => (beaconid) => {
      return state.transfers.filter((item) => item.beaconId === String(beaconid)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
    }
  },
  actions: {
    startDownload({ beaconid, taskId = "", remotePath, fileName, size = 0 }) {
      this.upsert({
        task_id: taskId,
        direction: "download",
        beacon_id: String(beaconid),
        remote_path: remotePath,
        file_name: fileName,
        size,
        status: "queued"
      }, "queued");
    },
    startUpload({ beaconid, taskId = "", remotePath, fileName, size = 0 }) {
      this.upsert({
        task_id: taskId,
        direction: "upload",
        beacon_id: String(beaconid),
        remote_path: remotePath,
        file_name: fileName,
        size,
        status: "queued"
      }, "queued");
    },
    handleTransferEvent(data, status = "running") {
      this.upsert(data, status);
    },
    unshift(next) {
      this.transfers.unshift(next);
    },
    /**
     * 检查是否已存在活跃的传输任务（避免重复点击）
     */
    hasActiveTransfer(beaconId, remotePath, direction = "download") {
      const normPath = normalizePath(remotePath);
      const bid = String(beaconId);
      return this.transfers.some((t) => {
        if (t.direction !== direction) return false;
        const idMatch = t.beaconId === bid || t.beaconId.startsWith(bid) || bid.startsWith(t.beaconId);
        if (!idMatch) return false;
        if (normalizePath(t.remotePath) !== normPath) return false;
        return ["queued", "running"].includes(t.status);
      });
    },
    upsert(data, fallbackStatus = "running") {
      const next = normalizeTransfer(data, fallbackStatus);
      const index2 = this.transfers.findIndex((item) => sameTransfer(item, next));
      if (index2 >= 0) {
        const current = this.transfers[index2];
        const mergedStatus = next.status && next.status !== "running" ? next.status : current.status === "queued" ? "running" : current.status;
        this.transfers.splice(index2, 1, {
          ...current,
          ...next,
          taskId: next.taskId || current.taskId,
          fileId: next.fileId || current.fileId,
          fileName: next.fileName || current.fileName,
          remotePath: next.remotePath || current.remotePath,
          beaconId: pickBeaconId(current, next),
          size: next.size || current.size,
          totalChunks: next.totalChunks || current.totalChunks,
          receivedChunks: next.receivedChunks !== void 0 ? next.receivedChunks : current.receivedChunks,
          status: mergedStatus,
          progress: calcProgress(
            next.receivedChunks !== void 0 ? next.receivedChunks : current.receivedChunks,
            next.totalChunks || current.totalChunks,
            mergedStatus
          ),
          updatedAt: Date.now()
        });
      } else {
        this.transfers.unshift(next);
      }
    }
  }
});
const fileTransfer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  normalizePath,
  useFileTransferStore
}, Symbol.toStringTag, { value: "Module" }));
const _hoisted_1$9 = { class: "attribute-dialog-header" };
const _hoisted_2$8 = ["title"];
const _hoisted_3$8 = { class: "attribute-dialog-body" };
const _hoisted_4$8 = { class: "attribute-field" };
const _hoisted_5$8 = ["value"];
const _hoisted_6$8 = { class: "attribute-field" };
const _hoisted_7$8 = { class: "attribute-toggle" };
const _hoisted_8$8 = ["disabled"];
const _hoisted_9$8 = { class: "attribute-field" };
const _hoisted_10$8 = { class: "attribute-toggle" };
const _hoisted_11$8 = { class: "attribute-time-grid" };
const _hoisted_12$8 = ["onUpdate:modelValue", "disabled"];
const _hoisted_13$8 = { class: "attribute-time-preview" };
const _hoisted_14$7 = { class: "attribute-field" };
const _hoisted_15$7 = { class: "attribute-toggle" };
const _hoisted_16$5 = { class: "attribute-time-grid" };
const _hoisted_17$4 = ["onUpdate:modelValue", "disabled"];
const _hoisted_18$4 = { class: "attribute-time-preview" };
const _hoisted_19$4 = {
  key: 0,
  class: "attribute-field"
};
const _hoisted_20$4 = { class: "attribute-toggle" };
const _hoisted_21$3 = { class: "attribute-time-grid" };
const _hoisted_22$3 = ["onUpdate:modelValue", "disabled"];
const _hoisted_23$3 = { class: "attribute-time-preview" };
const _hoisted_24$3 = {
  key: 1,
  class: "attribute-field"
};
const _hoisted_25$3 = { class: "attribute-field split" };
const _hoisted_26$3 = {
  key: 0,
  class: "attribute-section"
};
const _hoisted_27$3 = { class: "attribute-toggle" };
const _hoisted_28$3 = { class: "checkbox-grid" };
const _hoisted_29$3 = ["onUpdate:modelValue", "disabled"];
const _hoisted_30$3 = { class: "attribute-time-preview" };
const _hoisted_31$3 = {
  key: 1,
  class: "attribute-section"
};
const _hoisted_32$3 = { class: "attribute-toggle" };
const _hoisted_33$3 = { class: "linux-perm-grid" };
const _hoisted_34$3 = { class: "linux-perm-row-label" };
const _hoisted_35$2 = { class: "linux-perm-check" };
const _hoisted_36$2 = ["onUpdate:modelValue", "disabled"];
const _hoisted_37$2 = { class: "linux-perm-check" };
const _hoisted_38$2 = ["onUpdate:modelValue", "disabled"];
const _hoisted_39$2 = { class: "linux-perm-check" };
const _hoisted_40$1 = ["onUpdate:modelValue", "disabled"];
const _hoisted_41$1 = { class: "attribute-time-preview" };
const _hoisted_42$1 = { class: "attribute-preview-hint" };
const _hoisted_43$1 = { class: "attribute-dialog-footer" };
const _hoisted_44$1 = ["disabled"];
const _sfc_main$b = {
  __name: "FileAttributeDialog",
  props: {
    visible: { type: Boolean, default: false },
    target: { type: Object, default: null },
    isWindowsTarget: { type: Boolean, default: true }
  },
  emits: ["close", "submit"],
  setup(__props, { expose: __expose, emit: __emit }) {
    const props = __props;
    const emit2 = __emit;
    const submitting = /* @__PURE__ */ ref(false);
    const form = /* @__PURE__ */ ref(createEmptyAttributeForm());
    const WINDOWS_ATTRIBUTE_OPTIONS = [
      { key: "readonly", label: "Read-Only", hint: "FILE_ATTRIBUTE_READONLY" },
      { key: "hidden", label: "Hidden", hint: "FILE_ATTRIBUTE_HIDDEN" },
      { key: "system", label: "System", hint: "FILE_ATTRIBUTE_SYSTEM" },
      { key: "archive", label: "Archive", hint: "FILE_ATTRIBUTE_ARCHIVE" }
    ];
    const LINUX_PERMISSION_ROWS = [
      { label: "Owner", read: "ownerRead", write: "ownerWrite", execute: "ownerExecute" },
      { label: "Group", read: "groupRead", write: "groupWrite", execute: "groupExecute" },
      { label: "Other", read: "otherRead", write: "otherWrite", execute: "otherExecute" }
    ];
    function createTimeParts(date) {
      return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        second: date.getSeconds()
      };
    }
    function toDateFromMaybeTimestamp(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) return /* @__PURE__ */ new Date();
      return numeric < 1e12 ? new Date(numeric * 1e3) : new Date(numeric);
    }
    function createEmptyAttributeForm(target = null) {
      const file = (target == null ? void 0 : target.file) || null;
      const now = /* @__PURE__ */ new Date();
      return {
        targetPath: String((file == null ? void 0 : file.path) || (target == null ? void 0 : target.path) || ""),
        sourceName: String((file == null ? void 0 : file.name) || ""),
        newNameEnabled: false,
        newName: "",
        mtimeEnabled: false,
        mtime: createTimeParts(toDateFromMaybeTimestamp(file == null ? void 0 : file.mod_time)),
        atimeEnabled: false,
        atime: createTimeParts(now),
        ctimeEnabled: false,
        ctime: createTimeParts(now),
        winAttrEnabled: false,
        winAttr: { readonly: false, hidden: Boolean(file == null ? void 0 : file.is_hidden), system: false, archive: false },
        linuxModeEnabled: false,
        linuxMode: parseLinuxModeSelection(String((file == null ? void 0 : file.permission) || ""))
      };
    }
    function parseLinuxModeSelection(permission) {
      const text = String(permission || "");
      const selected = {
        ownerRead: false,
        ownerWrite: false,
        ownerExecute: false,
        groupRead: false,
        groupWrite: false,
        groupExecute: false,
        otherRead: false,
        otherWrite: false,
        otherExecute: false
      };
      if (text.length < 10) return selected;
      const chars = text.slice(1, 10).split("");
      const keys = [
        "ownerRead",
        "ownerWrite",
        "ownerExecute",
        "groupRead",
        "groupWrite",
        "groupExecute",
        "otherRead",
        "otherWrite",
        "otherExecute"
      ];
      chars.forEach((ch, index2) => {
        if (ch !== "-" && keys[index2]) selected[keys[index2]] = true;
      });
      return selected;
    }
    function isValidTimeParts(parts) {
      const year = Number(parts.year);
      const month = Number(parts.month);
      const day = Number(parts.day);
      const hour = Number(parts.hour);
      const minute = Number(parts.minute);
      const second = Number(parts.second);
      if (![year, month, day, hour, minute, second].every(Number.isInteger)) return false;
      const date = new Date(year, month - 1, day, hour, minute, second);
      return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date.getHours() === hour && date.getMinutes() === minute && date.getSeconds() === second;
    }
    function toUnixTimestampString(parts) {
      if (!isValidTimeParts(parts)) return null;
      const date = new Date(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second)
      );
      return String(Math.floor(date.getTime() / 1e3));
    }
    function buildWindowsAttributeValue(selection) {
      let value = 0;
      if (selection.readonly) value |= 1;
      if (selection.hidden) value |= 2;
      if (selection.system) value |= 4;
      if (selection.archive) value |= 32;
      return String(value);
    }
    function buildLinuxModeValue(selection) {
      const digits = [
        (selection.ownerRead ? 4 : 0) + (selection.ownerWrite ? 2 : 0) + (selection.ownerExecute ? 1 : 0),
        (selection.groupRead ? 4 : 0) + (selection.groupWrite ? 2 : 0) + (selection.groupExecute ? 1 : 0),
        (selection.otherRead ? 4 : 0) + (selection.otherWrite ? 2 : 0) + (selection.otherExecute ? 1 : 0)
      ];
      if (digits.every((d) => d === 0)) return "";
      return digits.join("");
    }
    function formatWindowsAttributes(selection) {
      const labels = [];
      if (selection.readonly) labels.push("Read-Only");
      if (selection.hidden) labels.push("Hidden");
      if (selection.system) labels.push("System");
      if (selection.archive) labels.push("Archive");
      return labels.length > 0 ? labels.join(" / ") : "未选择";
    }
    function formatLinuxMode(selection) {
      const parts = [
        `${selection.ownerRead ? "r" : "-"}${selection.ownerWrite ? "w" : "-"}${selection.ownerExecute ? "x" : "-"}`,
        `${selection.groupRead ? "r" : "-"}${selection.groupWrite ? "w" : "-"}${selection.groupExecute ? "x" : "-"}`,
        `${selection.otherRead ? "r" : "-"}${selection.otherWrite ? "w" : "-"}${selection.otherExecute ? "x" : "-"}`
      ];
      return parts.join(" ");
    }
    function buildSetAttrArgs2(data) {
      const args = [String(data.targetPath || "")];
      let modifyFlag = 0;
      if (data.newNameEnabled) {
        const value = String(data.newName || "").trim();
        if (!value) throw new Error("已启用的新文件名不能为空");
        modifyFlag |= 1;
        args.push(value);
      }
      if (data.mtimeEnabled) {
        const timestamp = toUnixTimestampString(data.mtime);
        if (!timestamp) throw new Error("修改时间填写无效，请检查年月日时分秒");
        modifyFlag |= 2;
        args.push(timestamp);
      }
      if (data.atimeEnabled) {
        const timestamp = toUnixTimestampString(data.atime);
        if (!timestamp) throw new Error("访问时间填写无效，请检查年月日时分秒");
        modifyFlag |= 4;
        args.push(timestamp);
      }
      if (data.ctimeEnabled) {
        const timestamp = toUnixTimestampString(data.ctime);
        if (!timestamp) throw new Error("创建时间填写无效，请检查年月日时分秒");
        modifyFlag |= 8;
        args.push(timestamp);
      }
      if (data.winAttrEnabled) {
        const winAttrValue = buildWindowsAttributeValue(data.winAttr);
        if (winAttrValue === "0") throw new Error("Windows 属性已启用时，请至少勾选一个属性");
        modifyFlag |= 16;
        args.push(winAttrValue);
      }
      if (data.linuxModeEnabled) {
        const linuxModeValue = buildLinuxModeValue(data.linuxMode);
        if (!linuxModeValue) throw new Error("Linux 权限已启用时，请至少勾选一个权限位");
        modifyFlag |= 32;
        args.push(linuxModeValue);
      }
      if (modifyFlag === 0) throw new Error("请至少选择一个要修改的属性");
      args.splice(1, 0, String(modifyFlag));
      return args;
    }
    const hasChanges = computed(() => {
      const f = form.value;
      return Boolean(
        f.newNameEnabled || f.mtimeEnabled || f.atimeEnabled || props.isWindowsTarget && f.ctimeEnabled || props.isWindowsTarget && f.winAttrEnabled || !props.isWindowsTarget && f.linuxModeEnabled
      );
    });
    watch(() => props.visible, (val) => {
      if (val && props.target) {
        form.value = createEmptyAttributeForm(props.target);
        submitting.value = false;
      }
    });
    function close() {
      submitting.value = false;
      emit2("close");
    }
    async function handleSubmit() {
      if (submitting.value) return;
      try {
        submitting.value = true;
        const payload = { ...form.value, winAttr: { ...form.value.winAttr }, linuxMode: { ...form.value.linuxMode } };
        if (props.isWindowsTarget) {
          payload.linuxModeEnabled = false;
        } else {
          payload.ctimeEnabled = false;
          payload.winAttrEnabled = false;
        }
        const args = buildSetAttrArgs2(payload);
        emit2("submit", args);
      } catch (err) {
        throw err;
      } finally {
        submitting.value = false;
      }
    }
    __expose({ form, submitting });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        createVNode(Transition, { name: "fade-scale" }, {
          default: withCtx(() => {
            var _a2, _b;
            return [
              __props.visible ? (openBlock(), createElementBlock("div", {
                key: 0,
                class: "attribute-dialog-overlay",
                onClick: close
              }, [
                createBaseVNode("div", {
                  class: "attribute-dialog",
                  onClick: _cache[7] || (_cache[7] = withModifiers(() => {
                  }, ["stop"]))
                }, [
                  createBaseVNode("div", _hoisted_1$9, [
                    createBaseVNode("div", null, [
                      _cache[8] || (_cache[8] = createBaseVNode("div", { class: "attribute-dialog-title" }, "修改属性", -1)),
                      createBaseVNode("div", {
                        class: "attribute-dialog-subtitle",
                        title: form.value.targetPath
                      }, toDisplayString(((_b = (_a2 = __props.target) == null ? void 0 : _a2.file) == null ? void 0 : _b.name) || form.value.sourceName || "目标对象"), 9, _hoisted_2$8)
                    ]),
                    createBaseVNode("button", {
                      class: "attribute-dialog-close",
                      onClick: close
                    }, "×")
                  ]),
                  createBaseVNode("div", _hoisted_3$8, [
                    createBaseVNode("div", _hoisted_4$8, [
                      _cache[9] || (_cache[9] = createBaseVNode("label", { class: "attribute-label" }, "目标路径", -1)),
                      createBaseVNode("input", {
                        class: "attribute-input readonly",
                        value: form.value.targetPath,
                        readonly: ""
                      }, null, 8, _hoisted_5$8)
                    ]),
                    createBaseVNode("div", _hoisted_6$8, [
                      createBaseVNode("label", _hoisted_7$8, [
                        withDirectives(createBaseVNode("input", {
                          type: "checkbox",
                          "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.value.newNameEnabled = $event)
                        }, null, 512), [
                          [vModelCheckbox, form.value.newNameEnabled]
                        ]),
                        _cache[10] || (_cache[10] = createBaseVNode("span", null, "修改文件名 / 文件夹名", -1))
                      ]),
                      withDirectives(createBaseVNode("input", {
                        class: "attribute-input",
                        "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.value.newName = $event),
                        disabled: !form.value.newNameEnabled,
                        placeholder: "请输入新名称"
                      }, null, 8, _hoisted_8$8), [
                        [vModelText, form.value.newName]
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_9$8, [
                      createBaseVNode("label", _hoisted_10$8, [
                        withDirectives(createBaseVNode("input", {
                          type: "checkbox",
                          "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.value.mtimeEnabled = $event)
                        }, null, 512), [
                          [vModelCheckbox, form.value.mtimeEnabled]
                        ]),
                        _cache[11] || (_cache[11] = createBaseVNode("span", null, "修改修改时间 (MTime)", -1))
                      ]),
                      createBaseVNode("div", _hoisted_11$8, [
                        (openBlock(), createElementBlock(Fragment, null, renderList(["year", "month", "day", "hour", "minute", "second"], (field) => {
                          return createBaseVNode("label", {
                            key: "mtime-" + field
                          }, [
                            createBaseVNode("span", null, toDisplayString({ year: "年", month: "月", day: "日", hour: "时", minute: "分", second: "秒" }[field]), 1),
                            withDirectives(createBaseVNode("input", {
                              type: "number",
                              "onUpdate:modelValue": ($event) => form.value.mtime[field] = $event,
                              disabled: !form.value.mtimeEnabled
                            }, null, 8, _hoisted_12$8), [
                              [
                                vModelText,
                                form.value.mtime[field],
                                void 0,
                                { number: true }
                              ]
                            ])
                          ]);
                        }), 64))
                      ]),
                      createBaseVNode("div", _hoisted_13$8, " Unix: " + toDisplayString(form.value.mtimeEnabled ? toUnixTimestampString(form.value.mtime) || "无效时间" : "未启用"), 1)
                    ]),
                    createBaseVNode("div", _hoisted_14$7, [
                      createBaseVNode("label", _hoisted_15$7, [
                        withDirectives(createBaseVNode("input", {
                          type: "checkbox",
                          "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.value.atimeEnabled = $event)
                        }, null, 512), [
                          [vModelCheckbox, form.value.atimeEnabled]
                        ]),
                        _cache[12] || (_cache[12] = createBaseVNode("span", null, "修改访问时间 (ATime)", -1))
                      ]),
                      createBaseVNode("div", _hoisted_16$5, [
                        (openBlock(), createElementBlock(Fragment, null, renderList(["year", "month", "day", "hour", "minute", "second"], (field) => {
                          return createBaseVNode("label", {
                            key: "atime-" + field
                          }, [
                            createBaseVNode("span", null, toDisplayString({ year: "年", month: "月", day: "日", hour: "时", minute: "分", second: "秒" }[field]), 1),
                            withDirectives(createBaseVNode("input", {
                              type: "number",
                              "onUpdate:modelValue": ($event) => form.value.atime[field] = $event,
                              disabled: !form.value.atimeEnabled
                            }, null, 8, _hoisted_17$4), [
                              [
                                vModelText,
                                form.value.atime[field],
                                void 0,
                                { number: true }
                              ]
                            ])
                          ]);
                        }), 64))
                      ]),
                      createBaseVNode("div", _hoisted_18$4, " Unix: " + toDisplayString(form.value.atimeEnabled ? toUnixTimestampString(form.value.atime) || "无效时间" : "未启用"), 1)
                    ]),
                    __props.isWindowsTarget ? (openBlock(), createElementBlock("div", _hoisted_19$4, [
                      createBaseVNode("label", _hoisted_20$4, [
                        withDirectives(createBaseVNode("input", {
                          type: "checkbox",
                          "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => form.value.ctimeEnabled = $event)
                        }, null, 512), [
                          [vModelCheckbox, form.value.ctimeEnabled]
                        ]),
                        _cache[13] || (_cache[13] = createBaseVNode("span", null, "修改创建时间 (CTime)", -1))
                      ]),
                      createBaseVNode("div", _hoisted_21$3, [
                        (openBlock(), createElementBlock(Fragment, null, renderList(["year", "month", "day", "hour", "minute", "second"], (field) => {
                          return createBaseVNode("label", {
                            key: "ctime-" + field
                          }, [
                            createBaseVNode("span", null, toDisplayString({ year: "年", month: "月", day: "日", hour: "时", minute: "分", second: "秒" }[field]), 1),
                            withDirectives(createBaseVNode("input", {
                              type: "number",
                              "onUpdate:modelValue": ($event) => form.value.ctime[field] = $event,
                              disabled: !form.value.ctimeEnabled
                            }, null, 8, _hoisted_22$3), [
                              [
                                vModelText,
                                form.value.ctime[field],
                                void 0,
                                { number: true }
                              ]
                            ])
                          ]);
                        }), 64))
                      ]),
                      createBaseVNode("div", _hoisted_23$3, " Unix: " + toDisplayString(form.value.ctimeEnabled ? toUnixTimestampString(form.value.ctime) || "无效时间" : "未启用"), 1)
                    ])) : (openBlock(), createElementBlock("div", _hoisted_24$3, [..._cache[14] || (_cache[14] = [
                      createBaseVNode("label", { class: "attribute-label" }, "创建时间 (CTime)", -1),
                      createBaseVNode("div", { class: "attribute-unsupported-note" }, "Linux 当前不支持修改创建时间", -1)
                    ])])),
                    createBaseVNode("div", _hoisted_25$3, [
                      __props.isWindowsTarget ? (openBlock(), createElementBlock("div", _hoisted_26$3, [
                        createBaseVNode("label", _hoisted_27$3, [
                          withDirectives(createBaseVNode("input", {
                            type: "checkbox",
                            "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.value.winAttrEnabled = $event)
                          }, null, 512), [
                            [vModelCheckbox, form.value.winAttrEnabled]
                          ]),
                          _cache[15] || (_cache[15] = createBaseVNode("span", null, "修改 Windows 属性", -1))
                        ]),
                        createBaseVNode("div", _hoisted_28$3, [
                          (openBlock(), createElementBlock(Fragment, null, renderList(WINDOWS_ATTRIBUTE_OPTIONS, (option) => {
                            return createBaseVNode("label", {
                              key: option.key,
                              class: "check-option"
                            }, [
                              withDirectives(createBaseVNode("input", {
                                type: "checkbox",
                                "onUpdate:modelValue": ($event) => form.value.winAttr[option.key] = $event,
                                disabled: !form.value.winAttrEnabled
                              }, null, 8, _hoisted_29$3), [
                                [vModelCheckbox, form.value.winAttr[option.key]]
                              ]),
                              createBaseVNode("span", null, [
                                createBaseVNode("strong", null, toDisplayString(option.label), 1),
                                createBaseVNode("small", null, toDisplayString(option.hint), 1)
                              ])
                            ]);
                          }), 64))
                        ]),
                        createBaseVNode("div", _hoisted_30$3, " 已选择: " + toDisplayString(formatWindowsAttributes(form.value.winAttr)), 1)
                      ])) : (openBlock(), createElementBlock("div", _hoisted_31$3, [
                        createBaseVNode("label", _hoisted_32$3, [
                          withDirectives(createBaseVNode("input", {
                            type: "checkbox",
                            "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => form.value.linuxModeEnabled = $event)
                          }, null, 512), [
                            [vModelCheckbox, form.value.linuxModeEnabled]
                          ]),
                          _cache[16] || (_cache[16] = createBaseVNode("span", null, "修改 Linux 权限", -1))
                        ]),
                        createBaseVNode("div", _hoisted_33$3, [
                          _cache[17] || (_cache[17] = createBaseVNode("div", { class: "linux-perm-head" }, null, -1)),
                          _cache[18] || (_cache[18] = createBaseVNode("div", { class: "linux-perm-head" }, "R", -1)),
                          _cache[19] || (_cache[19] = createBaseVNode("div", { class: "linux-perm-head" }, "W", -1)),
                          _cache[20] || (_cache[20] = createBaseVNode("div", { class: "linux-perm-head" }, "X", -1)),
                          (openBlock(), createElementBlock(Fragment, null, renderList(LINUX_PERMISSION_ROWS, (row) => {
                            return openBlock(), createElementBlock(Fragment, {
                              key: row.label
                            }, [
                              createBaseVNode("div", _hoisted_34$3, toDisplayString(row.label), 1),
                              createBaseVNode("label", _hoisted_35$2, [
                                withDirectives(createBaseVNode("input", {
                                  type: "checkbox",
                                  "onUpdate:modelValue": ($event) => form.value.linuxMode[row.read] = $event,
                                  disabled: !form.value.linuxModeEnabled
                                }, null, 8, _hoisted_36$2), [
                                  [vModelCheckbox, form.value.linuxMode[row.read]]
                                ])
                              ]),
                              createBaseVNode("label", _hoisted_37$2, [
                                withDirectives(createBaseVNode("input", {
                                  type: "checkbox",
                                  "onUpdate:modelValue": ($event) => form.value.linuxMode[row.write] = $event,
                                  disabled: !form.value.linuxModeEnabled
                                }, null, 8, _hoisted_38$2), [
                                  [vModelCheckbox, form.value.linuxMode[row.write]]
                                ])
                              ]),
                              createBaseVNode("label", _hoisted_39$2, [
                                withDirectives(createBaseVNode("input", {
                                  type: "checkbox",
                                  "onUpdate:modelValue": ($event) => form.value.linuxMode[row.execute] = $event,
                                  disabled: !form.value.linuxModeEnabled
                                }, null, 8, _hoisted_40$1), [
                                  [vModelCheckbox, form.value.linuxMode[row.execute]]
                                ])
                              ])
                            ], 64);
                          }), 64))
                        ]),
                        createBaseVNode("div", _hoisted_41$1, [
                          createTextVNode(" 结果: " + toDisplayString(buildLinuxModeValue(form.value.linuxMode) || "未选择") + " ", 1),
                          createBaseVNode("span", _hoisted_42$1, "(" + toDisplayString(formatLinuxMode(form.value.linuxMode)) + ")", 1)
                        ])
                      ]))
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_43$1, [
                    createBaseVNode("button", {
                      class: "attribute-btn secondary",
                      onClick: close
                    }, "取消"),
                    createBaseVNode("button", {
                      class: "attribute-btn primary",
                      disabled: submitting.value || !hasChanges.value,
                      onClick: handleSubmit
                    }, toDisplayString(submitting.value ? "提交中..." : "提交任务"), 9, _hoisted_44$1)
                  ])
                ])
              ])) : createCommentVNode("", true)
            ];
          }),
          _: 1
        })
      ]);
    };
  }
};
const FileAttributeDialog = /* @__PURE__ */ _export_sfc(_sfc_main$b, [["__scopeId", "data-v-f1848424"]]);
const _hoisted_1$8 = { class: "zip-header" };
const _hoisted_2$7 = ["title"];
const _hoisted_3$7 = { class: "zip-body" };
const _hoisted_4$7 = { class: "zip-field" };
const _hoisted_5$7 = ["value"];
const _hoisted_6$7 = { class: "zip-field" };
const _hoisted_7$7 = { class: "zip-field split" };
const _hoisted_8$7 = { class: "zip-section" };
const _hoisted_9$7 = { class: "zip-toggle" };
const _hoisted_10$7 = { class: "zip-section" };
const _hoisted_11$7 = { class: "zip-toggle" };
const _hoisted_12$7 = ["disabled"];
const _hoisted_13$7 = { class: "zip-hint" };
const _hoisted_14$6 = { class: "zip-footer" };
const _hoisted_15$6 = ["disabled"];
const _sfc_main$a = {
  __name: "FileZipDialog",
  props: {
    visible: { type: Boolean, default: false },
    target: { type: Object, default: null }
  },
  emits: ["close", "submit"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit2 = __emit;
    const submitting = /* @__PURE__ */ ref(false);
    const form = /* @__PURE__ */ ref(createEmptyForm());
    function buildZipOutputPath(file) {
      const sourcePath = String((file == null ? void 0 : file.path) || "").trim();
      if (!sourcePath) return "";
      if (sourcePath.toLowerCase().endsWith(".zip")) {
        return `${sourcePath}_copy.zip`;
      }
      return `${sourcePath}.zip`;
    }
    function createEmptyForm(target = null) {
      const file = (target == null ? void 0 : target.file) || null;
      return {
        sourcePath: String((file == null ? void 0 : file.path) || (target == null ? void 0 : target.path) || ""),
        sourceName: String((file == null ? void 0 : file.name) || ""),
        zipPath: buildZipOutputPath(file),
        overwrite: false,
        includeRoot: true,
        isDir: Boolean(file == null ? void 0 : file.is_dir)
      };
    }
    function resetForm(target = null) {
      form.value = createEmptyForm(target);
    }
    function close() {
      submitting.value = false;
      emit2("close");
    }
    async function submit() {
      if (submitting.value) return;
      const sourcePath = String(form.value.sourcePath || "").trim();
      const zipPath = String(form.value.zipPath || "").trim();
      if (!sourcePath || !zipPath) return;
      try {
        submitting.value = true;
        const overwrite = form.value.overwrite ? 1 : 0;
        const includeRoot = form.value.isDir ? form.value.includeRoot ? 1 : 0 : 1;
        emit2("submit", { sourcePath, zipPath, overwrite, includeRoot });
        close();
      } catch {
        submitting.value = false;
      }
    }
    watch(() => props.visible, (visible) => {
      if (!visible) {
        submitting.value = false;
        return;
      }
      resetForm(props.target);
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        createVNode(Transition, { name: "fade-scale" }, {
          default: withCtx(() => {
            var _a2, _b;
            return [
              __props.visible ? (openBlock(), createElementBlock("div", {
                key: 0,
                class: "zip-overlay",
                onClick: withModifiers(close, ["self"])
              }, [
                createBaseVNode("div", {
                  class: "zip-dialog",
                  onClick: _cache[3] || (_cache[3] = withModifiers(() => {
                  }, ["stop"]))
                }, [
                  createBaseVNode("div", _hoisted_1$8, [
                    createBaseVNode("div", null, [
                      _cache[4] || (_cache[4] = createBaseVNode("div", { class: "zip-title" }, "压缩为 ZIP", -1)),
                      createBaseVNode("div", {
                        class: "zip-subtitle",
                        title: form.value.sourcePath
                      }, toDisplayString(((_b = (_a2 = __props.target) == null ? void 0 : _a2.file) == null ? void 0 : _b.name) || form.value.sourceName || "目标对象"), 9, _hoisted_2$7)
                    ]),
                    createBaseVNode("button", {
                      class: "zip-close",
                      onClick: close
                    }, "×")
                  ]),
                  createBaseVNode("div", _hoisted_3$7, [
                    createBaseVNode("div", _hoisted_4$7, [
                      _cache[5] || (_cache[5] = createBaseVNode("label", { class: "zip-label" }, "源路径", -1)),
                      createBaseVNode("input", {
                        class: "zip-input readonly",
                        value: form.value.sourcePath,
                        readonly: ""
                      }, null, 8, _hoisted_5$7)
                    ]),
                    createBaseVNode("div", _hoisted_6$7, [
                      _cache[6] || (_cache[6] = createBaseVNode("label", { class: "zip-label" }, "输出 ZIP 路径", -1)),
                      withDirectives(createBaseVNode("input", {
                        class: "zip-input",
                        "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => form.value.zipPath = $event),
                        placeholder: "请输入输出 zip 路径"
                      }, null, 512), [
                        [vModelText, form.value.zipPath]
                      ])
                    ]),
                    createBaseVNode("div", _hoisted_7$7, [
                      createBaseVNode("div", _hoisted_8$7, [
                        createBaseVNode("label", _hoisted_9$7, [
                          withDirectives(createBaseVNode("input", {
                            type: "checkbox",
                            "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.value.overwrite = $event)
                          }, null, 512), [
                            [vModelCheckbox, form.value.overwrite]
                          ]),
                          _cache[7] || (_cache[7] = createBaseVNode("span", null, "覆盖已存在 ZIP", -1))
                        ]),
                        _cache[8] || (_cache[8] = createBaseVNode("div", { class: "zip-hint" }, "勾选后 overwrite 将发送为 1，否则发送为 0。", -1))
                      ]),
                      createBaseVNode("div", _hoisted_10$7, [
                        createBaseVNode("label", _hoisted_11$7, [
                          withDirectives(createBaseVNode("input", {
                            type: "checkbox",
                            "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => form.value.includeRoot = $event),
                            disabled: !form.value.isDir
                          }, null, 8, _hoisted_12$7), [
                            [vModelCheckbox, form.value.includeRoot]
                          ]),
                          _cache[9] || (_cache[9] = createBaseVNode("span", null, "包含根目录名", -1))
                        ]),
                        createBaseVNode("div", _hoisted_13$7, toDisplayString(form.value.isDir ? "目录压缩时勾选表示保留根目录名。" : "目标是文件，include_root 固定发送为 1。"), 1)
                      ])
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_14$6, [
                    createBaseVNode("button", {
                      class: "zip-btn secondary",
                      onClick: close
                    }, "取消"),
                    createBaseVNode("button", {
                      class: "zip-btn primary",
                      disabled: submitting.value || !form.value.zipPath.trim(),
                      onClick: submit
                    }, toDisplayString(submitting.value ? "提交中..." : "提交压缩任务"), 9, _hoisted_15$6)
                  ])
                ])
              ])) : createCommentVNode("", true)
            ];
          }),
          _: 1
        })
      ]);
    };
  }
};
const FileZipDialog = /* @__PURE__ */ _export_sfc(_sfc_main$a, [["__scopeId", "data-v-854320bc"]]);
const _hoisted_1$7 = {
  key: 0,
  class: "modal-overlay"
};
const _hoisted_2$6 = { class: "file-browser-modal" };
const _hoisted_3$6 = { class: "title-left" };
const _hoisted_4$6 = { class: "nav-bar" };
const _hoisted_5$6 = ["disabled"];
const _hoisted_6$6 = { class: "path-input-wrapper" };
const _hoisted_7$6 = ["placeholder", "disabled"];
const _hoisted_8$6 = ["disabled"];
const _hoisted_9$6 = ["disabled"];
const _hoisted_10$6 = { class: "toolbar" };
const _hoisted_11$6 = { class: "toolbar-left" };
const _hoisted_12$6 = ["disabled"];
const _hoisted_13$6 = {
  key: 0,
  class: "toolbar-right"
};
const _hoisted_14$5 = { class: "info-tag" };
const _hoisted_15$5 = { class: "main-layout" };
const _hoisted_16$4 = { class: "side-nav" };
const _hoisted_17$3 = { class: "nav-group" };
const _hoisted_18$3 = {
  key: 0,
  class: "nav-group"
};
const _hoisted_19$3 = ["onClick"];
const _hoisted_20$3 = {
  key: 0,
  class: "loading-state"
};
const _hoisted_21$2 = {
  key: 1,
  class: "error-state"
};
const _hoisted_22$2 = {
  key: 2,
  class: "empty-state"
};
const _hoisted_23$2 = {
  key: 3,
  class: "empty-state"
};
const _hoisted_24$2 = {
  key: 4,
  class: "file-table"
};
const _hoisted_25$2 = ["onDblclick", "onContextmenu"];
const _hoisted_26$2 = { class: "icon-cell" };
const _hoisted_27$2 = { key: 0 };
const _hoisted_28$2 = { key: 1 };
const _hoisted_29$2 = { class: "name-cell" };
const _hoisted_30$2 = ["title"];
const _hoisted_31$2 = { class: "size-cell" };
const _hoisted_32$2 = { class: "date-cell" };
const _hoisted_33$2 = { class: "action-cell" };
const _hoisted_34$2 = { class: "action-wrapper" };
const _hoisted_35$1 = ["onClick"];
const _hoisted_36$1 = {
  key: 0,
  class: "transfer-panel-compact shadow-lg"
};
const _hoisted_37$1 = { class: "transfer-compact-header" };
const _hoisted_38$1 = { class: "count" };
const _hoisted_39$1 = { class: "transfer-compact-list" };
const _hoisted_40 = { class: "item-main" };
const _hoisted_41 = { class: "icon" };
const _hoisted_42 = ["title"];
const _hoisted_43 = { class: "status-text" };
const _hoisted_44 = { class: "item-progress" };
const _hoisted_45 = { class: "item-side" };
const _hoisted_46 = {
  key: 0,
  class: "bytes"
};
const _hoisted_47 = { class: "chunks" };
const _hoisted_48 = ["title"];
const MENU_WIDTH = 168;
const MENU_HEIGHT = 286;
const _sfc_main$9 = {
  __name: "FileBrowserModal",
  props: {
    visible: { type: Boolean, default: false },
    beaconid: { type: String, required: true }
  },
  emits: ["close"],
  setup(__props, { emit: __emit }) {
    const agentStore = useAgentStore();
    const modalStore = useModalStore();
    const explorerStore = useExplorerStore();
    const fileTransferStore = useFileTransferStore();
    const notificationStore = useNotificationStore();
    const props = __props;
    const emit2 = __emit;
    const errorMsg = /* @__PURE__ */ ref("");
    const currentPath = /* @__PURE__ */ ref("");
    const uploadInputRef = /* @__PURE__ */ ref(null);
    const uploadTarget = /* @__PURE__ */ ref(null);
    const isUploading = /* @__PURE__ */ ref(false);
    const downloadCooldowns = /* @__PURE__ */ ref(/* @__PURE__ */ new Map());
    const activeMenuTarget = /* @__PURE__ */ ref(null);
    const menuPos = /* @__PURE__ */ ref({ x: 0, y: 0 });
    const menuRef = /* @__PURE__ */ ref(null);
    const attributeDialogVisible = /* @__PURE__ */ ref(false);
    const attributeDialogTarget = /* @__PURE__ */ ref(null);
    const zipDialogVisible = /* @__PURE__ */ ref(false);
    const zipDialogTarget = /* @__PURE__ */ ref(null);
    const {
      winPos,
      winSize,
      isDragging,
      initWindowPosition,
      startDrag,
      startResize,
      stopDrag,
      stopResize
    } = useModalDragResize({
      defaultWidth: 900,
      defaultHeight: 800,
      minWidth: 600,
      minHeight: 400
    });
    function placeMenu(x, y) {
      let nextX = x;
      let nextY = y;
      if (nextX + MENU_WIDTH > window.innerWidth) nextX -= MENU_WIDTH;
      if (nextY + MENU_HEIGHT > window.innerHeight) nextY -= MENU_HEIGHT;
      menuPos.value = {
        x: Math.max(10, nextX),
        y: Math.max(10, nextY)
      };
    }
    function closeMenu() {
      activeMenuTarget.value = null;
    }
    function openMenu(target, x, y) {
      activeMenuTarget.value = target;
      placeMenu(x, y);
      nextTick(adjustMenuPosition);
    }
    function adjustMenuPosition() {
      if (!menuRef.value) return;
      const rect = menuRef.value.getBoundingClientRect();
      const padding = 10;
      let nextX = menuPos.value.x;
      let nextY = menuPos.value.y;
      if (rect.right > window.innerWidth - padding) {
        nextX -= rect.right - (window.innerWidth - padding);
      }
      if (rect.bottom > window.innerHeight - padding) {
        nextY -= rect.bottom - (window.innerHeight - padding);
      }
      menuPos.value = {
        x: Math.max(padding, nextX),
        y: Math.max(padding, nextY)
      };
    }
    function getMenuTarget(file) {
      if (!file) {
        return {
          type: "blank",
          path: currentPath.value || ""
        };
      }
      return {
        type: file.is_dir ? "folder" : "file",
        file
      };
    }
    function toggleMenu(file, event) {
      var _a2, _b;
      if (event) event.stopPropagation();
      if (((_b = (_a2 = activeMenuTarget.value) == null ? void 0 : _a2.file) == null ? void 0 : _b.path) === file.path) {
        closeMenu();
        return;
      }
      if (event == null ? void 0 : event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        openMenu(getMenuTarget(file), rect.right - MENU_WIDTH, rect.bottom + 8);
      }
    }
    function onRowContextMenu(file, event) {
      event.preventDefault();
      event.stopPropagation();
      openMenu(getMenuTarget(file), event.clientX, event.clientY);
    }
    function onContainerContextMenu(event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.target.closest(".file-row")) return;
      openMenu(getMenuTarget(null), event.clientX, event.clientY);
    }
    function triggerUpload(target = activeMenuTarget.value) {
      var _a2;
      uploadTarget.value = target || getMenuTarget(null);
      closeMenu();
      (_a2 = uploadInputRef.value) == null ? void 0 : _a2.click();
    }
    function buildCopyName(file) {
      const name = String((file == null ? void 0 : file.name) || "").trim();
      if (!name) return "Copy";
      if (file == null ? void 0 : file.is_dir) return `${name}_copy`;
      const dotIndex = name.lastIndexOf(".");
      if (dotIndex <= 0) return `${name}_copy`;
      return `${name.slice(0, dotIndex)}_copy${name.slice(dotIndex)}`;
    }
    function resolveDestinationPath(basePath, inputPath) {
      const trimmed = String(inputPath || "").trim();
      if (!trimmed) return "";
      if (/^[a-zA-Z]:[\\/]/.test(trimmed) || /^\\\\/.test(trimmed) || trimmed.startsWith("/")) {
        return normalizePathKey(trimmed);
      }
      return joinPaths(basePath, trimmed);
    }
    function openAttributeDialog(target) {
      if (!(target == null ? void 0 : target.file) || !target.file.path) {
        notificationStore.error("未找到可修改属性的目标路径");
        return;
      }
      closeMenu();
      attributeDialogTarget.value = target;
      attributeDialogVisible.value = true;
    }
    function openZipDialog(target) {
      if (!(target == null ? void 0 : target.file) || !target.file.path) {
        notificationStore.error("未找到可压缩的目标路径");
        return;
      }
      closeMenu();
      zipDialogTarget.value = target;
      zipDialogVisible.value = true;
    }
    function closeAttributeDialog() {
      attributeDialogVisible.value = false;
      attributeDialogTarget.value = null;
    }
    function closeZipDialog() {
      zipDialogVisible.value = false;
      zipDialogTarget.value = null;
    }
    async function handleAttributeSubmit(args) {
      var _a2, _b;
      const targetName = ((_b = (_a2 = attributeDialogTarget.value) == null ? void 0 : _a2.file) == null ? void 0 : _b.name) || "目标文件";
      try {
        notificationStore.info(`正在下发属性修改任务: ${targetName}`);
        await sendSetAttrCommand(props.beaconid, args);
        notificationStore.success(`属性修改任务已提交: ${targetName}`);
        closeAttributeDialog();
        await new Promise((resolve2) => setTimeout(resolve2, 300));
        await loadDirectory(currentPath.value, true);
      } catch (err) {
        notificationStore.error(`属性修改失败: ${err.message || err}`);
      }
    }
    async function handleZipSubmit({ sourcePath, zipPath, overwrite, includeRoot }) {
      var _a2, _b;
      const sourceName = ((_b = (_a2 = zipDialogTarget.value) == null ? void 0 : _a2.file) == null ? void 0 : _b.name) || sourcePath;
      try {
        notificationStore.info(`正在下发压缩任务: ${sourceName}`);
        await sendZipCommand(props.beaconid, sourcePath, zipPath, overwrite, includeRoot);
        notificationStore.success(`压缩任务已提交: ${sourceName}`);
        closeZipDialog();
      } catch (err) {
        notificationStore.error(`压缩任务下发失败: ${err.message || err}`);
      }
    }
    async function handleDownload(file) {
      if (!file || file.is_dir) return;
      const cooldownKey = `${props.beaconid}:${file.path}`;
      const now = Date.now();
      const lastTime = downloadCooldowns.value.get(cooldownKey) || 0;
      if (now - lastTime < 5e3) {
        const remaining = Math.ceil((5e3 - (now - lastTime)) / 1e3);
        notificationStore.info(`操作太快，请 ${remaining} 秒后再试: ${file.name}`);
        closeMenu();
        return;
      }
      downloadCooldowns.value.set(cooldownKey, now);
      try {
        const result = await sendDownloadCommand(props.beaconid, file.path, 524288, 3);
        fileTransferStore.startDownload({
          beaconid: props.beaconid,
          taskId: (result == null ? void 0 : result.task_id) || (result == null ? void 0 : result.taskId) || (result == null ? void 0 : result.id) || "",
          remotePath: file.path,
          fileName: file.name,
          size: file.size
        });
        notificationStore.success(`下载任务已下发: ${file.name}`);
      } catch (err) {
        notificationStore.error(`下载任务下发失败: ${err.message || err}`);
      } finally {
        closeMenu();
      }
    }
    async function handleDelete(target) {
      const file = target == null ? void 0 : target.file;
      if (!file) return;
      closeMenu();
      const confirmed = await modalStore.showConfirm({
        title: `确认删除${file.is_dir ? "目录" : "文件"}`,
        message: `你确定要删除 [${file.name}] 吗？
警告：此操作不可撤销且会物理抹除数据。`,
        type: "danger"
      });
      if (!confirmed) return;
      try {
        notificationStore.info(`正在下发删除指令: ${file.name}`);
        await sendRemoveFileCommand(props.beaconid, file.path);
        notificationStore.success(`删除任务已提交: ${file.name}`);
      } catch (err) {
        notificationStore.error(`删除指令发送失败: ${err.message || err}`);
      }
    }
    async function handleMoveCopy(action, target) {
      const file = target == null ? void 0 : target.file;
      const basePath = currentPath.value || "";
      if (!file) return;
      closeMenu();
      if (!basePath) {
        notificationStore.error("请先进入具体目录后再执行移动或复制");
        return;
      }
      const isMove = action === "move";
      const nextName = await modalStore.showPrompt({
        title: isMove ? "移动文件/文件夹" : "复制文件/文件夹",
        message: `当前目录: [${basePath}]
可输入目标名称，也可直接输入完整路径。`,
        placeholder: isMove ? "请输入目标名称或完整路径..." : "请输入副本名称或完整路径...",
        defaultValue: isMove ? file.name : buildCopyName(file)
      });
      const trimmedName = String(nextName || "").trim();
      if (!trimmedName) return;
      const destinationPath = resolveDestinationPath(basePath, trimmedName);
      if (destinationPath === file.path) {
        notificationStore.info("源路径与目标路径一致，未执行操作");
        return;
      }
      try {
        notificationStore.info(`正在${isMove ? "移动" : "复制"}: ${file.name}`);
        const sendFileCommand = isMove ? sendMoveFileCommand : sendCopyFileCommand;
        await sendFileCommand(props.beaconid, file.path, destinationPath);
        notificationStore.success(`${isMove ? "移动" : "复制"}任务已提交: ${file.name}`);
        await new Promise((resolve2) => setTimeout(resolve2, 300));
        await loadDirectory(basePath, true);
      } catch (err) {
        notificationStore.error(`${isMove ? "移动" : "复制"}指令发送失败: ${err.message || err}`);
      }
    }
    async function handleZip(target) {
      openZipDialog(target);
    }
    async function handleMkdir() {
      var _a2;
      const target = activeMenuTarget.value;
      const basePath = (target == null ? void 0 : target.type) === "folder" ? ((_a2 = target.file) == null ? void 0 : _a2.path) || currentPath.value : (target == null ? void 0 : target.path) || currentPath.value;
      closeMenu();
      if (!basePath) {
        notificationStore.error("请先进入目标目录后再创建文件夹");
        return;
      }
      const folderName = await modalStore.showPrompt({
        title: "新建文件夹",
        message: `将在目录 [${basePath}] 下创建新文件夹`,
        placeholder: "请输入文件夹名称...",
        defaultValue: "New Folder"
      });
      if (!folderName || !folderName.trim()) return;
      const fullPath = joinPaths(basePath, folderName.trim());
      try {
        notificationStore.info(`正在下发创建指令: ${folderName}`);
        await sendMkdirCommand(props.beaconid, fullPath);
        notificationStore.success(`创建任务已提交: ${folderName}`);
        await new Promise((resolve2) => setTimeout(resolve2, 300));
        await loadDirectory(basePath, true);
      } catch (err) {
        notificationStore.error(`创建指令发送失败: ${err.message || err}`);
      }
    }
    async function handleUploadFile(event) {
      var _a2, _b;
      const file = (_a2 = event.target.files) == null ? void 0 : _a2[0];
      const target = uploadTarget.value;
      event.target.value = "";
      if (!file || isUploading.value) {
        uploadTarget.value = null;
        return;
      }
      const basePath = (target == null ? void 0 : target.type) === "folder" ? ((_b = target.file) == null ? void 0 : _b.path) || currentPath.value : (target == null ? void 0 : target.path) || currentPath.value;
      if (!basePath) {
        notificationStore.error("请先进入目标目录，或右键目标文件夹后再上传");
        uploadTarget.value = null;
        return;
      }
      const remotePath = joinPaths(basePath, file.name);
      const cooldownKey = `upload:${props.beaconid}:${remotePath}`;
      const now = Date.now();
      const lastTime = downloadCooldowns.value.get(cooldownKey) || 0;
      if (now - lastTime < 5e3) {
        notificationStore.info(`文件正在上传中，请稍候: ${file.name}`);
        uploadTarget.value = null;
        return;
      }
      downloadCooldowns.value.set(cooldownKey, now);
      isUploading.value = true;
      try {
        notificationStore.info(`准备上传: ${file.name}`);
        const uploaded = await uploadFile(file);
        const fileId = uploaded.file_id;
        if (!fileId) {
          throw new Error("服务器未返回有效的 file_id，请检查后端 API 对齐情况");
        }
        const result = await sendUploadCommand(props.beaconid, fileId, remotePath, 524288);
        fileTransferStore.startUpload({
          beaconid: props.beaconid,
          taskId: (result == null ? void 0 : result.task_id) || (result == null ? void 0 : result.taskId) || (result == null ? void 0 : result.id) || "",
          remotePath,
          fileName: file.name,
          size: file.size
        });
        notificationStore.success(`上传任务已下发: ${file.name}`);
      } catch (err) {
        notificationStore.error(`上传任务失败: ${err.message || err}`);
      } finally {
        isUploading.value = false;
        uploadTarget.value = null;
      }
    }
    const handleDocumentClick = () => closeMenu();
    onMounted(() => {
      initWindowPosition();
      window.addEventListener("click", handleDocumentClick);
    });
    onUnmounted(() => {
      window.removeEventListener("click", handleDocumentClick);
      stopDrag();
      stopResize();
    });
    const currentNode = computed(() => {
      return explorerStore.getCacheNode(props.beaconid, currentPath.value);
    });
    const files = computed(() => {
      var _a2;
      return ((_a2 = currentNode.value) == null ? void 0 : _a2.items) || [];
    });
    const activeTransfers = computed(() => {
      return fileTransferStore.getTransfers(props.beaconid);
    });
    const targetAgent = computed(() => agentStore.getAgentById(props.beaconid));
    const isWindowsTarget = computed(() => {
      var _a2;
      return String(((_a2 = targetAgent.value) == null ? void 0 : _a2.os) || "").toLowerCase().includes("windows");
    });
    const rootShortcutLabel = computed(() => isWindowsTarget.value ? "我的电脑" : "当前目录");
    const pathPlaceholder = computed(() => isWindowsTarget.value ? "输入路径回车..." : "输入绝对路径回车，例如 /etc");
    const emptyStateText = computed(() => isWindowsTarget.value ? "请在上方输入路径或选择盘符开始预览" : "请在上方输入绝对路径，或点击当前目录开始预览");
    const workingDirectory = computed(() => explorerStore.workingDirectories[props.beaconid] || "");
    const rootShortcutActive = computed(() => {
      if (isWindowsTarget.value) return currentPath.value === "";
      return normalizePathKey(currentPath.value) === normalizePathKey(workingDirectory.value);
    });
    const isGlobalLoading = computed(() => explorerStore.isPathLoading(props.beaconid, currentPath.value));
    const storeErrorMsg = computed(() => {
      var _a2;
      return ((_a2 = currentNode.value) == null ? void 0 : _a2.errorMessage) || "";
    });
    const drives = computed(() => explorerStore.drives[props.beaconid] || []);
    const hasCache = computed(() => {
      const node = explorerStore.getCacheNode(props.beaconid, currentPath.value);
      return !!(node && node.isLoaded);
    });
    function formatSize(bytes) {
      if (!bytes || bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB", "TB"];
      const i = Math.floor(Math.log(Number(bytes)) / Math.log(k));
      return parseFloat((Number(bytes) / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }
    function formatDate(timestamp) {
      if (!timestamp || timestamp === 0) return "-";
      const numeric = Number(timestamp);
      if (!Number.isFinite(numeric)) return "-";
      const d = new Date(numeric < 1e12 ? numeric * 1e3 : numeric);
      return d.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    }
    async function loadDirectory(path, force = false) {
      currentPath.value = normalizePathKey(path);
      errorMsg.value = "";
      await explorerStore.loadDirectory(props.beaconid, path, force);
    }
    function navigateToPath() {
      if (currentPath.value && currentPath.value.trim() !== "") {
        loadDirectory(currentPath.value);
      }
    }
    function handleRefresh() {
      loadDirectory(currentPath.value, true);
    }
    function handleDoubleClick(file) {
      if (file.is_dir) {
        const nextPath = file.path ? normalizePathKey(file.path) : joinPaths(currentPath.value, file.name);
        loadDirectory(nextPath);
      }
    }
    function goUp() {
      const norm = normalizePathKey(currentPath.value);
      if (!norm || norm === "") return;
      if (/^[a-z]:\\$/.test(norm)) {
        loadDirectory("");
        return;
      }
      if (norm === "/") {
        loadDirectory("");
        return;
      }
      if (norm.startsWith("/")) {
        const parts2 = norm.split("/").filter((p2) => p2 !== "");
        if (parts2.length <= 1) {
          loadDirectory("/");
        } else {
          parts2.pop();
          loadDirectory(`/${parts2.join("/")}`);
        }
        return;
      }
      const parts = norm.split("\\").filter((p2) => p2 !== "");
      if (parts.length <= 1) {
        loadDirectory("");
      } else {
        parts.pop();
        loadDirectory(parts.join("\\"));
      }
    }
    onMounted(() => {
      if (props.visible && props.beaconid) {
        loadDirectory(currentPath.value || "");
      }
    });
    watch(() => props.visible, (val) => {
      if (val) {
        initWindowPosition();
        if (props.beaconid) {
          loadDirectory(currentPath.value || "");
        }
      }
    });
    watch(() => explorerStore.uiCurrentPath[props.beaconid], (newPath) => {
      if (newPath !== void 0 && normalizePathKey(newPath) !== normalizePathKey(currentPath.value)) {
        currentPath.value = newPath;
      }
    });
    return (_ctx, _cache) => {
      var _a2, _b;
      return __props.visible ? (openBlock(), createElementBlock("div", _hoisted_1$7, [
        createBaseVNode("div", {
          class: normalizeClass(["modal-window", { "is-dragging": unref(isDragging) }]),
          style: normalizeStyle({
            left: unref(winPos).x + "px",
            top: unref(winPos).y + "px",
            width: unref(winSize).w + "px",
            height: unref(winSize).h + "px"
          })
        }, [
          createBaseVNode("div", {
            class: "resize-handle resizer-n",
            onMousedown: _cache[0] || (_cache[0] = ($event) => unref(startResize)("n", $event))
          }, null, 32),
          createBaseVNode("div", {
            class: "resize-handle resizer-s",
            onMousedown: _cache[1] || (_cache[1] = ($event) => unref(startResize)("s", $event))
          }, null, 32),
          createBaseVNode("div", {
            class: "resize-handle resizer-e",
            onMousedown: _cache[2] || (_cache[2] = ($event) => unref(startResize)("e", $event))
          }, null, 32),
          createBaseVNode("div", {
            class: "resize-handle resizer-w",
            onMousedown: _cache[3] || (_cache[3] = ($event) => unref(startResize)("w", $event))
          }, null, 32),
          createBaseVNode("div", {
            class: "resize-handle resizer-nw",
            onMousedown: _cache[4] || (_cache[4] = ($event) => unref(startResize)("nw", $event))
          }, null, 32),
          createBaseVNode("div", {
            class: "resize-handle resizer-ne",
            onMousedown: _cache[5] || (_cache[5] = ($event) => unref(startResize)("ne", $event))
          }, null, 32),
          createBaseVNode("div", {
            class: "resize-handle resizer-sw",
            onMousedown: _cache[6] || (_cache[6] = ($event) => unref(startResize)("sw", $event))
          }, null, 32),
          createBaseVNode("div", {
            class: "resize-handle resizer-se",
            onMousedown: _cache[7] || (_cache[7] = ($event) => unref(startResize)("se", $event))
          }, null, 32),
          createBaseVNode("div", _hoisted_2$6, [
            createBaseVNode("div", {
              class: "modal-title",
              onMousedown: _cache[9] || (_cache[9] = (...args) => unref(startDrag) && unref(startDrag)(...args))
            }, [
              createBaseVNode("div", _hoisted_3$6, [
                _cache[24] || (_cache[24] = createBaseVNode("span", { class: "icon" }, "📁", -1)),
                createBaseVNode("span", null, "文件浏览器 - " + toDisplayString((_a2 = unref(agentStore).getAgentById(__props.beaconid)) == null ? void 0 : _a2.beaconid.substring(0, 8)) + "@" + toDisplayString(((_b = unref(agentStore).getAgentById(__props.beaconid)) == null ? void 0 : _b.hostname) || __props.beaconid.substring(0, 8)), 1)
              ]),
              createBaseVNode("button", {
                class: "close-btn",
                onClick: _cache[8] || (_cache[8] = ($event) => emit2("close"))
              }, "×")
            ], 32),
            createBaseVNode("input", {
              ref_key: "uploadInputRef",
              ref: uploadInputRef,
              type: "file",
              class: "hidden-file-input",
              onChange: handleUploadFile
            }, null, 544),
            createBaseVNode("div", _hoisted_4$6, [
              createBaseVNode("button", {
                class: "nav-action-btn",
                onClick: goUp,
                title: "返回上一级",
                disabled: isGlobalLoading.value
              }, [..._cache[25] || (_cache[25] = [
                createBaseVNode("svg", {
                  width: "14",
                  height: "14",
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  "stroke-width": "2"
                }, [
                  createBaseVNode("path", { d: "M19 12H5M12 19l-7-7 7-7" })
                ], -1)
              ])], 8, _hoisted_5$6),
              createBaseVNode("div", _hoisted_6$6, [
                withDirectives(createBaseVNode("input", {
                  "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => currentPath.value = $event),
                  class: "input path-input",
                  onKeyup: withKeys(navigateToPath, ["enter"]),
                  placeholder: pathPlaceholder.value,
                  disabled: isGlobalLoading.value
                }, null, 40, _hoisted_7$6), [
                  [vModelText, currentPath.value]
                ])
              ]),
              createBaseVNode("button", {
                class: "nav-action-btn primary",
                onClick: navigateToPath,
                disabled: isGlobalLoading.value,
                title: "跳转"
              }, [..._cache[26] || (_cache[26] = [
                createBaseVNode("svg", {
                  width: "14",
                  height: "14",
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  "stroke-width": "2"
                }, [
                  createBaseVNode("path", { d: "M3 12h18M21 12l-6-6M21 12l-6 6" })
                ], -1)
              ])], 8, _hoisted_8$6),
              createBaseVNode("button", {
                class: normalizeClass(["nav-action-btn refresh", { spinning: isGlobalLoading.value }]),
                onClick: handleRefresh,
                title: "强制刷新 (绕过缓存)",
                disabled: isGlobalLoading.value
              }, [..._cache[27] || (_cache[27] = [
                createBaseVNode("svg", {
                  width: "14",
                  height: "14",
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "currentColor",
                  "stroke-width": "2"
                }, [
                  createBaseVNode("path", { d: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" })
                ], -1)
              ])], 10, _hoisted_9$6)
            ]),
            createBaseVNode("div", _hoisted_10$6, [
              createBaseVNode("div", _hoisted_11$6, [
                createBaseVNode("button", {
                  class: "toolbar-btn",
                  onClick: _cache[11] || (_cache[11] = ($event) => handleMkdir()),
                  disabled: isGlobalLoading.value || !currentPath.value,
                  title: "新建文件夹"
                }, [..._cache[28] || (_cache[28] = [
                  createBaseVNode("span", { class: "toolbar-icon" }, "📁+", -1),
                  createTextVNode(" 新建文件夹 ", -1)
                ])], 8, _hoisted_12$6)
              ]),
              files.value.length ? (openBlock(), createElementBlock("div", _hoisted_13$6, [
                createBaseVNode("span", _hoisted_14$5, toDisplayString(files.value.length) + " 个项目", 1)
              ])) : createCommentVNode("", true)
            ]),
            createBaseVNode("div", _hoisted_15$5, [
              createBaseVNode("div", _hoisted_16$4, [
                createBaseVNode("div", _hoisted_17$3, [
                  _cache[30] || (_cache[30] = createBaseVNode("div", { class: "group-title" }, "快捷入口", -1)),
                  createBaseVNode("div", {
                    onClick: _cache[12] || (_cache[12] = ($event) => loadDirectory("")),
                    class: normalizeClass(["nav-item", { active: rootShortcutActive.value }])
                  }, [
                    _cache[29] || (_cache[29] = createBaseVNode("span", { class: "icon" }, "💻", -1)),
                    createTextVNode(" " + toDisplayString(rootShortcutLabel.value), 1)
                  ], 2)
                ]),
                isWindowsTarget.value && drives.value.length ? (openBlock(), createElementBlock("div", _hoisted_18$3, [
                  _cache[32] || (_cache[32] = createBaseVNode("div", { class: "group-title" }, "磁盘驱动器", -1)),
                  (openBlock(true), createElementBlock(Fragment, null, renderList(drives.value, (drive) => {
                    return openBlock(), createElementBlock("div", {
                      key: drive,
                      onClick: ($event) => loadDirectory(drive),
                      class: normalizeClass(["nav-item", { active: unref(normalizePathKey)(currentPath.value) === unref(normalizePathKey)(drive) }])
                    }, [
                      _cache[31] || (_cache[31] = createBaseVNode("span", { class: "icon" }, "💽", -1)),
                      createTextVNode(" 本地磁盘 (" + toDisplayString(drive) + ") ", 1)
                    ], 10, _hoisted_19$3);
                  }), 128))
                ])) : createCommentVNode("", true)
              ]),
              createBaseVNode("div", {
                class: "file-list-container",
                onContextmenu: onContainerContextMenu
              }, [
                isGlobalLoading.value && !files.value.length ? (openBlock(), createElementBlock("div", _hoisted_20$3, [..._cache[33] || (_cache[33] = [
                  createBaseVNode("div", { class: "spinner" }, null, -1),
                  createBaseVNode("span", null, "正在检索文件系统...", -1)
                ])])) : errorMsg.value || storeErrorMsg.value ? (openBlock(), createElementBlock("div", _hoisted_21$2, [
                  createBaseVNode("span", null, "❌ " + toDisplayString(errorMsg.value || storeErrorMsg.value), 1)
                ])) : hasCache.value && files.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_22$2, [..._cache[34] || (_cache[34] = [
                  createBaseVNode("span", { class: "icon" }, "📭", -1),
                  createBaseVNode("span", null, "该目录为空", -1)
                ])])) : !hasCache.value && !isGlobalLoading.value ? (openBlock(), createElementBlock("div", _hoisted_23$2, [
                  createBaseVNode("span", null, toDisplayString(emptyStateText.value), 1)
                ])) : (openBlock(), createElementBlock("table", _hoisted_24$2, [
                  _cache[36] || (_cache[36] = createBaseVNode("thead", null, [
                    createBaseVNode("tr", null, [
                      createBaseVNode("th", { width: "40" }),
                      createBaseVNode("th", null, "名称"),
                      createBaseVNode("th", { width: "100" }, "大小"),
                      createBaseVNode("th", { width: "180" }, "修改日期"),
                      createBaseVNode("th", {
                        width: "50",
                        style: { "text-align": "center" }
                      }, "操作")
                    ])
                  ], -1)),
                  createBaseVNode("tbody", null, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(files.value, (file) => {
                      var _a3, _b2;
                      return openBlock(), createElementBlock("tr", {
                        key: file.path,
                        onDblclick: ($event) => handleDoubleClick(file),
                        onContextmenu: withModifiers(($event) => onRowContextMenu(file, $event), ["prevent"]),
                        class: normalizeClass(["file-row", { "menu-active": ((_b2 = (_a3 = activeMenuTarget.value) == null ? void 0 : _a3.file) == null ? void 0 : _b2.path) === file.path }])
                      }, [
                        createBaseVNode("td", _hoisted_26$2, [
                          file.is_dir ? (openBlock(), createElementBlock("span", _hoisted_27$2, "🗂️")) : (openBlock(), createElementBlock("span", _hoisted_28$2, "📄"))
                        ]),
                        createBaseVNode("td", _hoisted_29$2, [
                          createBaseVNode("span", {
                            class: "copyable-name",
                            title: file.name,
                            onClick: _cache[13] || (_cache[13] = withModifiers(() => {
                            }, ["stop"])),
                            onDblclick: _cache[14] || (_cache[14] = withModifiers(() => {
                            }, ["stop"]))
                          }, toDisplayString(file.name), 41, _hoisted_30$2)
                        ]),
                        createBaseVNode("td", _hoisted_31$2, toDisplayString(file.is_dir ? "-" : formatSize(file.size)), 1),
                        createBaseVNode("td", _hoisted_32$2, toDisplayString(formatDate(file.mod_time)), 1),
                        createBaseVNode("td", _hoisted_33$2, [
                          createBaseVNode("div", _hoisted_34$2, [
                            createBaseVNode("button", {
                              class: "row-action-btn",
                              onClick: withModifiers(($event) => toggleMenu(file, $event), ["stop"]),
                              title: "更多操作"
                            }, [..._cache[35] || (_cache[35] = [
                              createBaseVNode("svg", {
                                width: "16",
                                height: "16",
                                viewBox: "0 0 24 24",
                                fill: "none",
                                stroke: "currentColor",
                                "stroke-width": "2.5"
                              }, [
                                createBaseVNode("circle", {
                                  cx: "12",
                                  cy: "5",
                                  r: "1"
                                }),
                                createBaseVNode("circle", {
                                  cx: "12",
                                  cy: "12",
                                  r: "1"
                                }),
                                createBaseVNode("circle", {
                                  cx: "12",
                                  cy: "19",
                                  r: "1"
                                })
                              ], -1)
                            ])], 8, _hoisted_35$1)
                          ])
                        ])
                      ], 42, _hoisted_25$2);
                    }), 128))
                  ])
                ]))
              ], 32),
              activeTransfers.value.length ? (openBlock(), createElementBlock("div", _hoisted_36$1, [
                createBaseVNode("div", _hoisted_37$1, [
                  _cache[37] || (_cache[37] = createBaseVNode("span", { class: "title" }, "传输监控", -1)),
                  createBaseVNode("span", _hoisted_38$1, toDisplayString(activeTransfers.value.length) + " 个任务进行中", 1)
                ]),
                createBaseVNode("div", _hoisted_39$1, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(activeTransfers.value, (transfer) => {
                    return openBlock(), createElementBlock("div", {
                      key: transfer.taskId,
                      class: normalizeClass(["compact-item", [transfer.status, transfer.direction]])
                    }, [
                      createBaseVNode("div", _hoisted_40, [
                        createBaseVNode("span", _hoisted_41, toDisplayString(transfer.direction === "upload" ? "📤" : "📥"), 1),
                        createBaseVNode("span", {
                          class: "name",
                          title: transfer.remotePath
                        }, toDisplayString(transfer.fileName || transfer.remotePath), 9, _hoisted_42),
                        createBaseVNode("span", _hoisted_43, toDisplayString(transfer.status === "completed" ? "完成" : transfer.status === "error" ? "失败" : transfer.progress + "%"), 1)
                      ]),
                      createBaseVNode("div", _hoisted_44, [
                        createBaseVNode("div", {
                          class: "progress-fill",
                          style: normalizeStyle({ width: transfer.progress + "%" })
                        }, null, 4)
                      ]),
                      createBaseVNode("div", _hoisted_45, [
                        transfer.size > 0 ? (openBlock(), createElementBlock("span", _hoisted_46, toDisplayString(formatSize(transfer.receivedBytes || 0)) + "/" + toDisplayString(formatSize(transfer.size)), 1)) : createCommentVNode("", true),
                        createBaseVNode("span", _hoisted_47, toDisplayString(transfer.receivedChunks) + "/" + toDisplayString(transfer.totalChunks) + " chks", 1)
                      ]),
                      transfer.error ? (openBlock(), createElementBlock("div", {
                        key: 0,
                        class: "error-msg",
                        title: transfer.error
                      }, [..._cache[38] || (_cache[38] = [
                        createBaseVNode("i", { class: "fas fa-exclamation-circle" }, null, -1)
                      ])], 8, _hoisted_48)) : createCommentVNode("", true)
                    ], 2);
                  }), 128))
                ])
              ])) : createCommentVNode("", true)
            ])
          ]),
          (openBlock(), createBlock(Teleport, { to: "body" }, [
            createVNode(Transition, { name: "fade-scale" }, {
              default: withCtx(() => [
                activeMenuTarget.value ? (openBlock(), createElementBlock("div", {
                  key: 0,
                  class: "glass-menu",
                  ref_key: "menuRef",
                  ref: menuRef,
                  style: normalizeStyle({ left: menuPos.value.x + "px", top: menuPos.value.y + "px" }),
                  onClick: _cache[23] || (_cache[23] = withModifiers(() => {
                  }, ["stop"]))
                }, [
                  activeMenuTarget.value.type !== "file" ? (openBlock(), createElementBlock("div", {
                    key: 0,
                    class: normalizeClass(["menu-item", { disabled: isUploading.value }]),
                    onClick: _cache[15] || (_cache[15] = ($event) => !isUploading.value && triggerUpload(activeMenuTarget.value))
                  }, [
                    _cache[39] || (_cache[39] = createBaseVNode("span", { class: "m-icon" }, "📤", -1)),
                    createTextVNode(" " + toDisplayString(isUploading.value ? "上传中..." : "上传"), 1)
                  ], 2)) : createCommentVNode("", true),
                  activeMenuTarget.value.type === "blank" ? (openBlock(), createElementBlock("div", {
                    key: 1,
                    class: "menu-item",
                    onClick: _cache[16] || (_cache[16] = ($event) => handleMkdir())
                  }, [..._cache[40] || (_cache[40] = [
                    createBaseVNode("span", { class: "m-icon" }, "📁", -1),
                    createTextVNode(" 创建文件夹 ", -1)
                  ])])) : createCommentVNode("", true),
                  activeMenuTarget.value.type === "file" ? (openBlock(), createElementBlock("div", {
                    key: 2,
                    class: "menu-item",
                    onClick: _cache[17] || (_cache[17] = ($event) => handleDownload(activeMenuTarget.value.file))
                  }, [..._cache[41] || (_cache[41] = [
                    createBaseVNode("span", { class: "m-icon" }, "📥", -1),
                    createTextVNode(" 下载", -1)
                  ])])) : createCommentVNode("", true),
                  activeMenuTarget.value.type !== "blank" ? (openBlock(), createElementBlock(Fragment, { key: 3 }, [
                    createBaseVNode("div", {
                      class: "menu-item",
                      onClick: _cache[18] || (_cache[18] = ($event) => handleZip(activeMenuTarget.value))
                    }, [..._cache[42] || (_cache[42] = [
                      createBaseVNode("span", { class: "m-icon" }, "🗜️", -1),
                      createTextVNode(" 压缩为 ZIP", -1)
                    ])]),
                    createBaseVNode("div", {
                      class: "menu-item",
                      onClick: _cache[19] || (_cache[19] = ($event) => handleMoveCopy("move", activeMenuTarget.value))
                    }, [..._cache[43] || (_cache[43] = [
                      createBaseVNode("span", { class: "m-icon" }, "✂️", -1),
                      createTextVNode(" 移动", -1)
                    ])]),
                    createBaseVNode("div", {
                      class: "menu-item",
                      onClick: _cache[20] || (_cache[20] = ($event) => handleMoveCopy("copy", activeMenuTarget.value))
                    }, [..._cache[44] || (_cache[44] = [
                      createBaseVNode("span", { class: "m-icon" }, "📋", -1),
                      createTextVNode(" 复制", -1)
                    ])]),
                    createBaseVNode("div", {
                      class: "menu-item",
                      onClick: _cache[21] || (_cache[21] = ($event) => openAttributeDialog(activeMenuTarget.value))
                    }, [..._cache[45] || (_cache[45] = [
                      createBaseVNode("span", { class: "m-icon" }, "🛠️", -1),
                      createTextVNode(" 修改属性", -1)
                    ])]),
                    _cache[47] || (_cache[47] = createBaseVNode("div", { class: "menu-divider" }, null, -1)),
                    createBaseVNode("div", {
                      class: "menu-item delete",
                      onClick: _cache[22] || (_cache[22] = ($event) => handleDelete(activeMenuTarget.value))
                    }, [..._cache[46] || (_cache[46] = [
                      createBaseVNode("span", { class: "m-icon" }, "🗑️", -1),
                      createTextVNode(" 删除 ", -1)
                    ])])
                  ], 64)) : createCommentVNode("", true)
                ], 4)) : createCommentVNode("", true)
              ]),
              _: 1
            })
          ])),
          createVNode(FileZipDialog, {
            visible: zipDialogVisible.value,
            target: zipDialogTarget.value,
            onClose: closeZipDialog,
            onSubmit: handleZipSubmit
          }, null, 8, ["visible", "target"]),
          createVNode(FileAttributeDialog, {
            visible: attributeDialogVisible.value,
            target: attributeDialogTarget.value,
            "is-windows-target": isWindowsTarget.value,
            onClose: closeAttributeDialog,
            onSubmit: handleAttributeSubmit
          }, null, 8, ["visible", "target", "is-windows-target"])
        ], 6)
      ])) : createCommentVNode("", true);
    };
  }
};
const FileBrowserModal = /* @__PURE__ */ _export_sfc(_sfc_main$9, [["__scopeId", "data-v-b2bf44e8"]]);
const REQUEST_TIMEOUT$1 = 15e3;
function parseMaybeJson$1(value) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}
function unwrapProcessPayload(payload) {
  let value = parseMaybeJson$1(payload);
  if (!value || typeof value !== "object") return value;
  value = value.processes || value.Processes || value.process_list || value.processList || value.ProcessList || value.ps_list || value.psList || value.PSList || value.items || value.Items || value.data || value.Data || value.result || value.Result || value;
  return parseMaybeJson$1(value);
}
function normalizeArch(value) {
  switch (Number(value)) {
    case 0:
      return "x86";
    case 1:
      return "x64";
    case 2:
      return "arm64";
    default:
      return value ? String(value) : "unk";
  }
}
function normalizeProcessInfo(process) {
  if (!process || typeof process !== "object") return null;
  const pid = process.pid ?? process.PID ?? process.process_id ?? process.processId ?? process.ProcessID;
  const name = process.name ?? process.Name ?? process.image ?? process.Image ?? process.image_name ?? process.ImageName;
  if (pid === void 0 && !name) return null;
  return {
    pid: String(pid ?? ""),
    ppid: String(process.ppid ?? process.PPID ?? process.parent_pid ?? process.parentPid ?? process.ParentPID ?? "-"),
    arch: String(process.arch_name ?? process.ArchName ?? process.Arch_Name ?? "") || normalizeArch(process.arch ?? process.Arch ?? process.architecture ?? process.Architecture),
    session: String(process.session_id ?? process.sessionId ?? process.SessionID ?? process.session ?? process.Session ?? "-"),
    user: String(process.user ?? process.User ?? process.username ?? process.Username ?? "-"),
    name: String(name ?? "Unknown"),
    path: String(process.path ?? process.Path ?? process.exe ?? process.Exe ?? process.command_line ?? process.commandLine ?? process.CommandLine ?? "-")
  };
}
function normalizeProcessList(payload) {
  const value = unwrapProcessPayload(payload);
  if (!Array.isArray(value)) return [];
  return value.map(normalizeProcessInfo).filter(Boolean);
}
const useProcessBrowserStore = /* @__PURE__ */ defineStore("processBrowser", {
  state: () => ({
    processes: {},
    loading: {},
    errorMessages: {},
    lastUpdated: {},
    timers: {},
    pendingRefreshAfterKill: {},
    pendingRefreshTimers: {}
  }),
  getters: {
    getProcesses: (state) => (beaconid) => state.processes[beaconid] || [],
    isLoading: (state) => (beaconid) => Boolean(state.loading[beaconid]),
    getError: (state) => (beaconid) => state.errorMessages[beaconid] || "",
    getLastUpdated: (state) => (beaconid) => state.lastUpdated[beaconid] || null
  },
  actions: {
    setLoading(beaconid, status) {
      if (this.timers[beaconid]) {
        clearTimeout(this.timers[beaconid]);
        delete this.timers[beaconid];
      }
      this.loading[beaconid] = status;
      if (status) {
        this.timers[beaconid] = setTimeout(() => {
          this.loading[beaconid] = false;
          this.errorMessages[beaconid] = "等待 ps 结果超时，请稍后重试";
          delete this.timers[beaconid];
        }, REQUEST_TIMEOUT$1);
      }
    },
    markRefreshAfterKill(beaconid) {
      const key = String(beaconid || "");
      if (!key) return;
      if (this.pendingRefreshTimers[key]) {
        clearTimeout(this.pendingRefreshTimers[key]);
        delete this.pendingRefreshTimers[key];
      }
      this.pendingRefreshAfterKill[key] = true;
      this.pendingRefreshTimers[key] = setTimeout(() => {
        delete this.pendingRefreshAfterKill[key];
        delete this.pendingRefreshTimers[key];
      }, 12e4);
    },
    consumeRefreshAfterKill(beaconid) {
      const key = String(beaconid || "");
      if (!key) return false;
      const shouldRefresh = Boolean(this.pendingRefreshAfterKill[key]);
      if (this.pendingRefreshTimers[key]) {
        clearTimeout(this.pendingRefreshTimers[key]);
        delete this.pendingRefreshTimers[key];
      }
      delete this.pendingRefreshAfterKill[key];
      return shouldRefresh;
    },
    clearRefreshAfterKill(beaconid) {
      const key = String(beaconid || "");
      if (!key) return;
      if (this.pendingRefreshTimers[key]) {
        clearTimeout(this.pendingRefreshTimers[key]);
        delete this.pendingRefreshTimers[key];
      }
      delete this.pendingRefreshAfterKill[key];
    },
    async requestProcesses(beaconid) {
      if (!beaconid) return;
      this.errorMessages[beaconid] = "";
      this.setLoading(beaconid, true);
      try {
        await sendProcessListCommand(beaconid);
      } catch (err) {
        this.setLoading(beaconid, false);
        this.errorMessages[beaconid] = err.message || "下发 ps 指令失败";
      }
    },
    handleProcessResponse(beaconid, payload) {
      const list = normalizeProcessList(payload);
      this.processes[beaconid] = list;
      this.errorMessages[beaconid] = list.length ? "" : "未获取到进程数据";
      this.lastUpdated[beaconid] = (/* @__PURE__ */ new Date()).toISOString();
      this.setLoading(beaconid, false);
    },
    clear(beaconid) {
      if (this.timers[beaconid]) {
        clearTimeout(this.timers[beaconid]);
        delete this.timers[beaconid];
      }
      this.clearRefreshAfterKill(beaconid);
      this.loading[beaconid] = false;
      this.errorMessages[beaconid] = "";
    }
  }
});
const processBrowser = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  useProcessBrowserStore
}, Symbol.toStringTag, { value: "Module" }));
const _hoisted_1$6 = {
  key: 0,
  class: "modal-overlay"
};
const _hoisted_2$5 = { class: "browser-modal" };
const _hoisted_3$5 = { class: "header-info" };
const _hoisted_4$5 = { class: "titles" };
const _hoisted_5$5 = { class: "subtitle" };
const _hoisted_6$5 = { class: "toolbar" };
const _hoisted_7$5 = ["disabled"];
const _hoisted_8$5 = { class: "search-box" };
const _hoisted_9$5 = { class: "sync-time" };
const _hoisted_10$5 = { class: "content-area" };
const _hoisted_11$5 = {
  key: 0,
  class: "loading-state"
};
const _hoisted_12$5 = {
  key: 1,
  class: "error-state"
};
const _hoisted_13$5 = {
  key: 2,
  class: "process-table"
};
const _hoisted_14$4 = { class: "th-content" };
const _hoisted_15$4 = { class: "th-content" };
const _hoisted_16$3 = { class: "th-content" };
const _hoisted_17$2 = { class: "th-content" };
const _hoisted_18$2 = { class: "th-content" };
const _hoisted_19$2 = { class: "th-content" };
const _hoisted_20$2 = { class: "col-path" };
const _hoisted_21$1 = { class: "th-content" };
const _hoisted_22$1 = ["onContextmenu"];
const _hoisted_23$1 = { class: "cell-pid copyable-cell" };
const _hoisted_24$1 = { class: "cell-ppid copyable-cell" };
const _hoisted_25$1 = { class: "copyable-cell" };
const _hoisted_26$1 = { class: "session-tag copyable-tag" };
const _hoisted_27$1 = { class: "cell-session copyable-cell" };
const _hoisted_28$1 = ["title"];
const _hoisted_29$1 = { class: "cell-name copyable-cell" };
const _hoisted_30$1 = ["title"];
const _hoisted_31$1 = { key: 0 };
const _hoisted_32$1 = { class: "modal-footer" };
const _hoisted_33$1 = { class: "status-text" };
const _hoisted_34$1 = { class: "process-menu-title" };
const _sfc_main$8 = {
  __name: "ProcessBrowserModal",
  props: {
    visible: { type: Boolean, default: false },
    beaconid: { type: String, required: true }
  },
  emits: ["close"],
  setup(__props, { emit: __emit }) {
    const agentStore = useAgentStore();
    const modalStore = useModalStore();
    const notificationStore = useNotificationStore();
    const processStore = useProcessBrowserStore();
    const props = __props;
    const emit2 = __emit;
    const searchQuery = /* @__PURE__ */ ref("");
    const sortBy = /* @__PURE__ */ ref("pid");
    const sortDesc = /* @__PURE__ */ ref(false);
    const contextMenu = /* @__PURE__ */ ref({ visible: false, x: 0, y: 0, process: null });
    const contextMenuRef = /* @__PURE__ */ ref(null);
    const adjustedMenuX = /* @__PURE__ */ ref(0);
    const adjustedMenuY = /* @__PURE__ */ ref(0);
    const columnWidths = /* @__PURE__ */ ref({
      pid: 88,
      ppid: 88,
      arch: 92,
      session: 100,
      user: 180,
      name: 220,
      path: 360
    });
    const resizingColumn = /* @__PURE__ */ ref("");
    const resizeStart = /* @__PURE__ */ ref({ x: 0, width: 0 });
    const MIN_COLUMN_WIDTH = {
      pid: 72,
      ppid: 72,
      arch: 84,
      session: 88,
      user: 140,
      name: 160,
      path: 220
    };
    const {
      winPos,
      winSize,
      isDragging,
      initWindowPosition,
      startDrag,
      startResize,
      stopDrag,
      stopResize
    } = useModalDragResize({
      defaultWidth: 800,
      defaultHeight: 600,
      minWidth: 600,
      minHeight: 400,
      onBeforeDrag: () => closeContextMenu(),
      onBeforeResize: () => closeContextMenu()
    });
    function startColumnResize(column, event) {
      event.preventDefault();
      event.stopPropagation();
      closeContextMenu();
      resizingColumn.value = column;
      resizeStart.value = {
        x: event.clientX,
        width: columnWidths.value[column]
      };
      document.addEventListener("mousemove", handleColumnResize);
      document.addEventListener("mouseup", stopColumnResize);
    }
    function handleColumnResize(event) {
      if (!resizingColumn.value) return;
      const column = resizingColumn.value;
      const delta = event.clientX - resizeStart.value.x;
      columnWidths.value[column] = Math.max(
        MIN_COLUMN_WIDTH[column] || 80,
        resizeStart.value.width + delta
      );
    }
    function stopColumnResize() {
      resizingColumn.value = "";
      document.removeEventListener("mousemove", handleColumnResize);
      document.removeEventListener("mouseup", stopColumnResize);
    }
    async function fetchProcesses() {
      if (!props.beaconid) return;
      await processStore.requestProcesses(props.beaconid);
    }
    function handleSort(key) {
      if (sortBy.value === key) {
        sortDesc.value = !sortDesc.value;
      } else {
        sortBy.value = key;
        sortDesc.value = false;
      }
    }
    function compareValue(a, b) {
      if (sortBy.value === "pid" || sortBy.value === "ppid" || sortBy.value === "session") {
        const left = parseInt(a[sortBy.value], 10) || 0;
        const right = parseInt(b[sortBy.value], 10) || 0;
        return left - right;
      }
      return String(a[sortBy.value] || "").localeCompare(String(b[sortBy.value] || ""));
    }
    const loading = computed(() => processStore.isLoading(props.beaconid));
    const error = computed(() => processStore.getError(props.beaconid));
    const processes = computed(() => processStore.getProcesses(props.beaconid));
    const lastUpdated = computed(() => processStore.getLastUpdated(props.beaconid));
    const filteredProcesses = computed(() => {
      const q = searchQuery.value.trim().toLowerCase();
      const filtered = q ? processes.value.filter(
        (p2) => p2.pid.toLowerCase().includes(q) || p2.ppid.toLowerCase().includes(q) || p2.name.toLowerCase().includes(q) || p2.user.toLowerCase().includes(q) || p2.path.toLowerCase().includes(q)
      ) : processes.value;
      return [...filtered].sort((a, b) => {
        const result = compareValue(a, b);
        return sortDesc.value ? -result : result;
      });
    });
    function closeContextMenu() {
      contextMenu.value.visible = false;
    }
    function handleProcessContextMenu(event, process) {
      event.preventDefault();
      event.stopPropagation();
      contextMenu.value = {
        visible: true,
        x: event.clientX,
        y: event.clientY,
        process
      };
      nextTick(() => adjustContextMenuPosition());
    }
    function adjustContextMenuPosition() {
      adjustedMenuX.value = contextMenu.value.x;
      adjustedMenuY.value = contextMenu.value.y;
      if (!contextMenuRef.value) return;
      const rect = contextMenuRef.value.getBoundingClientRect();
      const padding = 10;
      if (adjustedMenuX.value + rect.width > window.innerWidth - padding) {
        adjustedMenuX.value = Math.max(padding, adjustedMenuX.value - rect.width);
      }
      if (adjustedMenuY.value + rect.height > window.innerHeight - padding) {
        adjustedMenuY.value = Math.max(padding, adjustedMenuY.value - rect.height);
      }
    }
    async function handleKill() {
      const process = contextMenu.value.process;
      if (!process) return;
      closeContextMenu();
      const confirmed = await modalStore.showConfirm({
        title: "结束进程",
        message: `你确定要强制结束进程 [${process.name}] (PID: ${process.pid}) 吗？
警告：这可能会导致目标机器系统不稳定或数据丢失。`,
        type: "danger"
      });
      if (!confirmed) return;
      try {
        notificationStore.info(`正在尝试强杀进程: ${process.name} [${process.pid}]`);
        processStore.markRefreshAfterKill(props.beaconid);
        await sendKillProcessCommand(props.beaconid, process.pid);
        notificationStore.success(`强杀指令已发送: ${process.name}`);
      } catch (err) {
        processStore.clearRefreshAfterKill(props.beaconid);
        notificationStore.error(`强杀指令发送失败: ${err.message || err}`);
      }
    }
    function handlePlaceholderAction(action) {
      const process = contextMenu.value.process;
      console.info(`[ProcessBrowser] 占位操作: ${action}`, process);
      closeContextMenu();
    }
    function handleDocumentClick() {
      closeContextMenu();
    }
    function formatTime(iso) {
      if (!iso) return "尚未同步";
      return new Date(iso).toLocaleTimeString("zh-CN", { hour12: false });
    }
    watch(() => props.visible, (val) => {
      if (val) {
        fetchProcesses();
        setTimeout(() => document.addEventListener("click", handleDocumentClick), 0);
      } else {
        searchQuery.value = "";
        closeContextMenu();
        stopDrag();
        stopResize();
        stopColumnResize();
        processStore.clear(props.beaconid);
        document.removeEventListener("click", handleDocumentClick);
      }
    });
    onMounted(() => {
      initWindowPosition();
    });
    onUnmounted(() => {
      document.removeEventListener("click", handleDocumentClick);
      stopDrag();
      stopResize();
      stopColumnResize();
    });
    function close() {
      emit2("close");
    }
    return (_ctx, _cache) => {
      var _a2, _b, _c, _d;
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        __props.visible ? (openBlock(), createElementBlock("div", _hoisted_1$6, [
          createBaseVNode("div", {
            class: normalizeClass(["modal-window", { "is-dragging": unref(isDragging) }]),
            style: normalizeStyle({
              left: unref(winPos).x + "px",
              top: unref(winPos).y + "px",
              width: unref(winSize).w + "px",
              height: unref(winSize).h + "px"
            })
          }, [
            createBaseVNode("div", {
              class: "resize-handle resizer-n",
              onMousedown: _cache[0] || (_cache[0] = ($event) => unref(startResize)("n", $event))
            }, null, 32),
            createBaseVNode("div", {
              class: "resize-handle resizer-s",
              onMousedown: _cache[1] || (_cache[1] = ($event) => unref(startResize)("s", $event))
            }, null, 32),
            createBaseVNode("div", {
              class: "resize-handle resizer-e",
              onMousedown: _cache[2] || (_cache[2] = ($event) => unref(startResize)("e", $event))
            }, null, 32),
            createBaseVNode("div", {
              class: "resize-handle resizer-w",
              onMousedown: _cache[3] || (_cache[3] = ($event) => unref(startResize)("w", $event))
            }, null, 32),
            createBaseVNode("div", {
              class: "resize-handle resizer-nw",
              onMousedown: _cache[4] || (_cache[4] = ($event) => unref(startResize)("nw", $event))
            }, null, 32),
            createBaseVNode("div", {
              class: "resize-handle resizer-ne",
              onMousedown: _cache[5] || (_cache[5] = ($event) => unref(startResize)("ne", $event))
            }, null, 32),
            createBaseVNode("div", {
              class: "resize-handle resizer-sw",
              onMousedown: _cache[6] || (_cache[6] = ($event) => unref(startResize)("sw", $event))
            }, null, 32),
            createBaseVNode("div", {
              class: "resize-handle resizer-se",
              onMousedown: _cache[7] || (_cache[7] = ($event) => unref(startResize)("se", $event))
            }, null, 32),
            createBaseVNode("div", _hoisted_2$5, [
              createBaseVNode("header", {
                class: "modal-header",
                onMousedown: _cache[8] || (_cache[8] = (...args) => unref(startDrag) && unref(startDrag)(...args))
              }, [
                createBaseVNode("div", _hoisted_3$5, [
                  _cache[28] || (_cache[28] = createBaseVNode("span", { class: "icon" }, "🔍", -1)),
                  createBaseVNode("div", _hoisted_4$5, [
                    _cache[27] || (_cache[27] = createBaseVNode("h3", null, "进程浏览器", -1)),
                    createBaseVNode("span", _hoisted_5$5, "Agent: " + toDisplayString((_a2 = unref(agentStore).getAgentById(__props.beaconid)) == null ? void 0 : _a2.beaconid.substring(0, 8)) + "@" + toDisplayString(((_b = unref(agentStore).getAgentById(__props.beaconid)) == null ? void 0 : _b.hostname) || __props.beaconid.substring(0, 8)), 1)
                  ])
                ]),
                createBaseVNode("button", {
                  class: "close-btn",
                  onClick: close
                }, "×")
              ], 32),
              createBaseVNode("div", _hoisted_6$5, [
                createBaseVNode("button", {
                  class: normalizeClass(["nav-action-btn refresh", { spinning: loading.value }]),
                  onClick: fetchProcesses,
                  disabled: loading.value,
                  title: "刷新进程列表"
                }, [..._cache[29] || (_cache[29] = [
                  createBaseVNode("svg", {
                    width: "14",
                    height: "14",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    "stroke-width": "2"
                  }, [
                    createBaseVNode("path", { d: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" })
                  ], -1)
                ])], 10, _hoisted_7$5),
                createBaseVNode("div", _hoisted_8$5, [
                  _cache[30] || (_cache[30] = createBaseVNode("span", { class: "search-icon" }, "🔍", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => searchQuery.value = $event),
                    type: "text",
                    placeholder: "搜索 PID 或进程名...",
                    spellcheck: "false"
                  }, null, 512), [
                    [vModelText, searchQuery.value]
                  ])
                ]),
                createBaseVNode("span", _hoisted_9$5, "同步: " + toDisplayString(formatTime(lastUpdated.value)), 1)
              ]),
              createBaseVNode("div", _hoisted_10$5, [
                loading.value ? (openBlock(), createElementBlock("div", _hoisted_11$5, [..._cache[31] || (_cache[31] = [
                  createBaseVNode("div", { class: "spinner" }, null, -1),
                  createBaseVNode("span", null, "正在获取进程数据...", -1)
                ])])) : error.value ? (openBlock(), createElementBlock("div", _hoisted_12$5, [
                  _cache[32] || (_cache[32] = createBaseVNode("span", { class: "error-icon" }, "⚠️", -1)),
                  createBaseVNode("span", null, toDisplayString(error.value), 1),
                  createBaseVNode("button", {
                    onClick: fetchProcesses,
                    class: "retry-btn"
                  }, "重试")
                ])) : (openBlock(), createElementBlock("table", _hoisted_13$5, [
                  createBaseVNode("colgroup", null, [
                    createBaseVNode("col", {
                      style: normalizeStyle({ width: columnWidths.value.pid + "px" })
                    }, null, 4),
                    createBaseVNode("col", {
                      style: normalizeStyle({ width: columnWidths.value.ppid + "px" })
                    }, null, 4),
                    createBaseVNode("col", {
                      style: normalizeStyle({ width: columnWidths.value.arch + "px" })
                    }, null, 4),
                    createBaseVNode("col", {
                      style: normalizeStyle({ width: columnWidths.value.session + "px" })
                    }, null, 4),
                    createBaseVNode("col", {
                      style: normalizeStyle({ width: columnWidths.value.user + "px" })
                    }, null, 4),
                    createBaseVNode("col", {
                      style: normalizeStyle({ width: columnWidths.value.name + "px" })
                    }, null, 4),
                    createBaseVNode("col", {
                      style: normalizeStyle({ width: columnWidths.value.path + "px" })
                    }, null, 4)
                  ]),
                  createBaseVNode("thead", null, [
                    createBaseVNode("tr", null, [
                      createBaseVNode("th", {
                        class: "col-pid",
                        onClick: _cache[11] || (_cache[11] = ($event) => handleSort("pid"))
                      }, [
                        createBaseVNode("div", _hoisted_14$4, [
                          createBaseVNode("span", null, [
                            _cache[33] || (_cache[33] = createTextVNode("PID ", -1)),
                            withDirectives(createBaseVNode("span", null, toDisplayString(sortDesc.value ? "↓" : "↑"), 513), [
                              [vShow, sortBy.value === "pid"]
                            ])
                          ]),
                          createBaseVNode("span", {
                            class: "col-resize-handle",
                            onMousedown: _cache[10] || (_cache[10] = ($event) => startColumnResize("pid", $event))
                          }, null, 32)
                        ])
                      ]),
                      createBaseVNode("th", {
                        class: "col-ppid",
                        onClick: _cache[13] || (_cache[13] = ($event) => handleSort("ppid"))
                      }, [
                        createBaseVNode("div", _hoisted_15$4, [
                          createBaseVNode("span", null, [
                            _cache[34] || (_cache[34] = createTextVNode("PPID ", -1)),
                            withDirectives(createBaseVNode("span", null, toDisplayString(sortDesc.value ? "↓" : "↑"), 513), [
                              [vShow, sortBy.value === "ppid"]
                            ])
                          ]),
                          createBaseVNode("span", {
                            class: "col-resize-handle",
                            onMousedown: _cache[12] || (_cache[12] = ($event) => startColumnResize("ppid", $event))
                          }, null, 32)
                        ])
                      ]),
                      createBaseVNode("th", {
                        class: "col-arch",
                        onClick: _cache[15] || (_cache[15] = ($event) => handleSort("arch"))
                      }, [
                        createBaseVNode("div", _hoisted_16$3, [
                          createBaseVNode("span", null, [
                            _cache[35] || (_cache[35] = createTextVNode("Arch ", -1)),
                            withDirectives(createBaseVNode("span", null, toDisplayString(sortDesc.value ? "↓" : "↑"), 513), [
                              [vShow, sortBy.value === "arch"]
                            ])
                          ]),
                          createBaseVNode("span", {
                            class: "col-resize-handle",
                            onMousedown: _cache[14] || (_cache[14] = ($event) => startColumnResize("arch", $event))
                          }, null, 32)
                        ])
                      ]),
                      createBaseVNode("th", {
                        class: "col-session",
                        onClick: _cache[17] || (_cache[17] = ($event) => handleSort("session"))
                      }, [
                        createBaseVNode("div", _hoisted_17$2, [
                          createBaseVNode("span", null, [
                            _cache[36] || (_cache[36] = createTextVNode("Session ", -1)),
                            withDirectives(createBaseVNode("span", null, toDisplayString(sortDesc.value ? "↓" : "↑"), 513), [
                              [vShow, sortBy.value === "session"]
                            ])
                          ]),
                          createBaseVNode("span", {
                            class: "col-resize-handle",
                            onMousedown: _cache[16] || (_cache[16] = ($event) => startColumnResize("session", $event))
                          }, null, 32)
                        ])
                      ]),
                      createBaseVNode("th", {
                        class: "col-user",
                        onClick: _cache[19] || (_cache[19] = ($event) => handleSort("user"))
                      }, [
                        createBaseVNode("div", _hoisted_18$2, [
                          createBaseVNode("span", null, [
                            _cache[37] || (_cache[37] = createTextVNode("User ", -1)),
                            withDirectives(createBaseVNode("span", null, toDisplayString(sortDesc.value ? "↓" : "↑"), 513), [
                              [vShow, sortBy.value === "user"]
                            ])
                          ]),
                          createBaseVNode("span", {
                            class: "col-resize-handle",
                            onMousedown: _cache[18] || (_cache[18] = ($event) => startColumnResize("user", $event))
                          }, null, 32)
                        ])
                      ]),
                      createBaseVNode("th", {
                        class: "col-name",
                        onClick: _cache[21] || (_cache[21] = ($event) => handleSort("name"))
                      }, [
                        createBaseVNode("div", _hoisted_19$2, [
                          createBaseVNode("span", null, [
                            _cache[38] || (_cache[38] = createTextVNode("Name ", -1)),
                            withDirectives(createBaseVNode("span", null, toDisplayString(sortDesc.value ? "↓" : "↑"), 513), [
                              [vShow, sortBy.value === "name"]
                            ])
                          ]),
                          createBaseVNode("span", {
                            class: "col-resize-handle",
                            onMousedown: _cache[20] || (_cache[20] = ($event) => startColumnResize("name", $event))
                          }, null, 32)
                        ])
                      ]),
                      createBaseVNode("th", _hoisted_20$2, [
                        createBaseVNode("div", _hoisted_21$1, [
                          _cache[39] || (_cache[39] = createBaseVNode("span", null, "Path", -1)),
                          createBaseVNode("span", {
                            class: "col-resize-handle",
                            onMousedown: _cache[22] || (_cache[22] = ($event) => startColumnResize("path", $event))
                          }, null, 32)
                        ])
                      ])
                    ])
                  ]),
                  createBaseVNode("tbody", null, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(filteredProcesses.value, (proc) => {
                      return openBlock(), createElementBlock("tr", {
                        key: `${proc.pid}-${proc.name}`,
                        onContextmenu: ($event) => handleProcessContextMenu($event, proc)
                      }, [
                        createBaseVNode("td", _hoisted_23$1, toDisplayString(proc.pid), 1),
                        createBaseVNode("td", _hoisted_24$1, toDisplayString(proc.ppid), 1),
                        createBaseVNode("td", _hoisted_25$1, [
                          createBaseVNode("span", _hoisted_26$1, toDisplayString(proc.arch), 1)
                        ]),
                        createBaseVNode("td", _hoisted_27$1, toDisplayString(proc.session), 1),
                        createBaseVNode("td", {
                          class: "cell-user copyable-cell",
                          title: proc.user
                        }, toDisplayString(proc.user), 9, _hoisted_28$1),
                        createBaseVNode("td", _hoisted_29$1, toDisplayString(proc.name), 1),
                        createBaseVNode("td", {
                          class: "cell-path copyable-cell",
                          title: proc.path
                        }, toDisplayString(proc.path), 9, _hoisted_30$1)
                      ], 40, _hoisted_22$1);
                    }), 128)),
                    filteredProcesses.value.length === 0 ? (openBlock(), createElementBlock("tr", _hoisted_31$1, [..._cache[40] || (_cache[40] = [
                      createBaseVNode("td", {
                        colspan: "7",
                        class: "empty-state"
                      }, "没有找到匹配的进程", -1)
                    ])])) : createCommentVNode("", true)
                  ])
                ]))
              ]),
              createBaseVNode("footer", _hoisted_32$1, [
                createBaseVNode("span", _hoisted_33$1, toDisplayString(filteredProcesses.value.length) + " 个进程 " + toDisplayString(searchQuery.value ? "(过滤后)" : ""), 1)
              ]),
              (openBlock(), createBlock(Teleport, { to: "body" }, [
                contextMenu.value.visible ? (openBlock(), createElementBlock("div", {
                  key: 0,
                  ref_key: "contextMenuRef",
                  ref: contextMenuRef,
                  class: "process-context-menu",
                  style: normalizeStyle({ left: adjustedMenuX.value + "px", top: adjustedMenuY.value + "px" }),
                  onClick: _cache[25] || (_cache[25] = withModifiers(() => {
                  }, ["stop"])),
                  onContextmenu: _cache[26] || (_cache[26] = withModifiers(() => {
                  }, ["stop", "prevent"]))
                }, [
                  createBaseVNode("div", _hoisted_34$1, toDisplayString((_c = contextMenu.value.process) == null ? void 0 : _c.name) + " [" + toDisplayString((_d = contextMenu.value.process) == null ? void 0 : _d.pid) + "] ", 1),
                  _cache[44] || (_cache[44] = createBaseVNode("div", { class: "divider" }, null, -1)),
                  createBaseVNode("button", {
                    class: "process-menu-item danger",
                    onClick: handleKill
                  }, [..._cache[41] || (_cache[41] = [
                    createBaseVNode("span", null, "结束进程", -1),
                    createBaseVNode("small", null, "kill", -1)
                  ])]),
                  createBaseVNode("button", {
                    class: "process-menu-item",
                    onClick: _cache[23] || (_cache[23] = ($event) => handlePlaceholderAction("inject"))
                  }, [..._cache[42] || (_cache[42] = [
                    createBaseVNode("span", null, "Inject", -1),
                    createBaseVNode("small", null, "inject", -1)
                  ])]),
                  createBaseVNode("button", {
                    class: "process-menu-item",
                    onClick: _cache[24] || (_cache[24] = ($event) => handlePlaceholderAction("steal-token"))
                  }, [..._cache[43] || (_cache[43] = [
                    createBaseVNode("span", null, "窃取令牌", -1),
                    createBaseVNode("small", null, "token", -1)
                  ])])
                ], 36)) : createCommentVNode("", true)
              ]))
            ])
          ], 6)
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const ProcessBrowserModal = /* @__PURE__ */ _export_sfc(_sfc_main$8, [["__scopeId", "data-v-2e75cdb5"]]);
const REQUEST_TIMEOUT = 15e3;
function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}
function unwrapPayload(payload, arrayKeys = []) {
  let value = parseMaybeJson(payload);
  if (!value || typeof value !== "object") return value;
  for (const key of arrayKeys) {
    if (Array.isArray(value[key])) return value[key];
  }
  return parseMaybeJson(
    value.data || value.Data || value.result || value.Result || value.items || value.Items || value
  );
}
function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(lowered)) return true;
    if (["false", "0", "no", "n", "off"].includes(lowered)) return false;
  }
  return null;
}
function normalizeInterface(item) {
  if (!item || typeof item !== "object") return null;
  return {
    index: Number(item.index ?? item.Index ?? 0) || 0,
    name: String(item.name ?? item.Name ?? "Unknown"),
    mtu: Number(item.mtu ?? item.MTU ?? 0) || 0,
    flags: Array.isArray(item.flags ?? item.Flags) ? [...item.flags ?? item.Flags] : String(item.flags ?? item.Flags ?? "").split(",").map((flag) => flag.trim()).filter(Boolean),
    hardwareAddr: String(item.hardware_addr ?? item.hardwareAddr ?? item.HardwareAddr ?? item.mac ?? "-"),
    addrs: Array.isArray(item.addrs ?? item.Addrs) ? [...item.addrs ?? item.Addrs] : String(item.addrs ?? item.Addrs ?? "").split(",").map((addr) => addr.trim()).filter(Boolean),
    isUp: normalizeBoolean(item.is_up ?? item.isUp ?? item.IsUp),
    isLoopback: normalizeBoolean(item.is_loopback ?? item.isLoopback ?? item.IsLoopback),
    isMulticast: normalizeBoolean(item.is_multicast ?? item.isMulticast ?? item.IsMulticast)
  };
}
function normalizeConnection(item) {
  if (!item || typeof item !== "object") return null;
  const localAddress = String(item.local_address ?? item.localAddress ?? item.LocalAddress ?? "-");
  const remoteAddress = String(item.remote_address ?? item.remoteAddress ?? item.RemoteAddress ?? "-");
  return {
    protocol: String(item.protocol ?? item.proto ?? item.Protocol ?? item.Proto ?? "unk").toUpperCase(),
    localAddress,
    localPort: Number(item.local_port ?? item.localPort ?? item.LocalPort ?? 0) || 0,
    remoteAddress,
    remotePort: Number(item.remote_port ?? item.remotePort ?? item.RemotePort ?? 0) || 0,
    state: String(item.state ?? item.State ?? "-"),
    pid: String(item.pid ?? item.PID ?? "-")
  };
}
function normalizeInterfaces(payload) {
  const value = unwrapPayload(payload, ["interfaces", "Interfaces"]);
  if (!Array.isArray(value)) return [];
  return value.map(normalizeInterface).filter(Boolean).sort((a, b) => a.index - b.index);
}
function normalizeConnections(payload) {
  const value = unwrapPayload(payload, ["connections", "Connections"]);
  if (!Array.isArray(value)) return [];
  return value.map(normalizeConnection).filter(Boolean).sort((a, b) => {
    const protoCmp = a.protocol.localeCompare(b.protocol);
    if (protoCmp !== 0) return protoCmp;
    const localCmp = `${a.localAddress}:${a.localPort}`.localeCompare(`${b.localAddress}:${b.localPort}`);
    if (localCmp !== 0) return localCmp;
    return `${a.remoteAddress}:${a.remotePort}`.localeCompare(`${b.remoteAddress}:${b.remotePort}`);
  });
}
const useNetworkBrowserStore = /* @__PURE__ */ defineStore("networkBrowser", {
  state: () => ({
    interfaces: {},
    connections: {},
    loading: {},
    errorMessages: {},
    lastUpdated: {},
    timers: {},
    pending: {}
  }),
  getters: {
    getInterfaces: (state) => (beaconid) => state.interfaces[beaconid] || [],
    getConnections: (state) => (beaconid) => state.connections[beaconid] || [],
    isLoading: (state) => (beaconid) => Boolean(state.loading[beaconid]),
    getError: (state) => (beaconid) => state.errorMessages[beaconid] || "",
    getLastUpdated: (state) => (beaconid) => state.lastUpdated[beaconid] || null
  },
  actions: {
    setLoading(beaconid, status) {
      if (this.timers[beaconid]) {
        clearTimeout(this.timers[beaconid]);
        delete this.timers[beaconid];
      }
      this.loading[beaconid] = status;
      if (!status) return;
      this.timers[beaconid] = setTimeout(() => {
        this.loading[beaconid] = false;
        this.errorMessages[beaconid] = "等待网络信息结果超时，请稍后重试";
        delete this.timers[beaconid];
      }, REQUEST_TIMEOUT);
    },
    async requestAll(beaconid) {
      if (!beaconid) return;
      this.errorMessages[beaconid] = "";
      this.pending[beaconid] = {
        netinfo: true,
        netstat: true
      };
      this.setLoading(beaconid, true);
      try {
        await sendNetworkBrowserCommands(beaconid);
      } catch (err) {
        this.setLoading(beaconid, false);
        this.errorMessages[beaconid] = err.message || "下发网络浏览器指令失败";
      }
    },
    handleNetInfoResponse(beaconid, payload) {
      this.interfaces[beaconid] = normalizeInterfaces(payload);
      this.lastUpdated[beaconid] = (/* @__PURE__ */ new Date()).toISOString();
      this.errorMessages[beaconid] = "";
      this.pending[beaconid] = {
        ...this.pending[beaconid] || { netinfo: true, netstat: true },
        netinfo: false
      };
      if (!this.pending[beaconid].netinfo && !this.pending[beaconid].netstat) {
        this.setLoading(beaconid, false);
      }
    },
    handleNetstatResponse(beaconid, payload) {
      this.connections[beaconid] = normalizeConnections(payload);
      this.lastUpdated[beaconid] = (/* @__PURE__ */ new Date()).toISOString();
      this.errorMessages[beaconid] = "";
      this.pending[beaconid] = {
        ...this.pending[beaconid] || { netinfo: true, netstat: true },
        netstat: false
      };
      if (!this.pending[beaconid].netinfo && !this.pending[beaconid].netstat) {
        this.setLoading(beaconid, false);
      }
    },
    clear(beaconid) {
      if (this.timers[beaconid]) {
        clearTimeout(this.timers[beaconid]);
        delete this.timers[beaconid];
      }
      this.loading[beaconid] = false;
      this.errorMessages[beaconid] = "";
      delete this.pending[beaconid];
    }
  }
});
const networkBrowser = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  useNetworkBrowserStore
}, Symbol.toStringTag, { value: "Module" }));
const _hoisted_1$5 = {
  key: 0,
  class: "modal-overlay"
};
const _hoisted_2$4 = { class: "browser-modal" };
const _hoisted_3$4 = { class: "header-info" };
const _hoisted_4$4 = { class: "titles" };
const _hoisted_5$4 = { class: "subtitle" };
const _hoisted_6$4 = { class: "toolbar" };
const _hoisted_7$4 = { class: "tab-switcher" };
const _hoisted_8$4 = { class: "search-box" };
const _hoisted_9$4 = ["placeholder"];
const _hoisted_10$4 = ["disabled"];
const _hoisted_11$4 = { class: "sync-time" };
const _hoisted_12$4 = { class: "content-area" };
const _hoisted_13$4 = {
  key: 0,
  class: "loading-state"
};
const _hoisted_14$3 = {
  key: 1,
  class: "error-state"
};
const _hoisted_15$3 = {
  key: 2,
  class: "interfaces-view"
};
const _hoisted_16$2 = { class: "card-header" };
const _hoisted_17$1 = { class: "card-subtitle" };
const _hoisted_18$1 = { class: "badges" };
const _hoisted_19$1 = {
  key: 0,
  class: "state-tag subtle"
};
const _hoisted_20$1 = {
  key: 1,
  class: "state-tag subtle"
};
const _hoisted_21 = { class: "interface-grid" };
const _hoisted_22 = { class: "info-item" };
const _hoisted_23 = { class: "mono" };
const _hoisted_24 = { class: "info-item" };
const _hoisted_25 = { class: "mono" };
const _hoisted_26 = { class: "info-item full" };
const _hoisted_27 = { class: "info-item full" };
const _hoisted_28 = { class: "mono" };
const _hoisted_29 = {
  key: 0,
  class: "empty-state"
};
const _hoisted_30 = {
  key: 3,
  class: "connection-table"
};
const _hoisted_31 = { class: "copyable-cell" };
const _hoisted_32 = { class: "protocol-tag" };
const _hoisted_33 = { class: "copyable-cell mono" };
const _hoisted_34 = { class: "copyable-cell mono" };
const _hoisted_35 = { class: "copyable-cell" };
const _hoisted_36 = { class: "copyable-cell mono" };
const _hoisted_37 = { key: 0 };
const _hoisted_38 = { class: "modal-footer" };
const _hoisted_39 = { class: "status-text" };
const _sfc_main$7 = {
  __name: "NetworkBrowserModal",
  props: {
    visible: { type: Boolean, default: false },
    beaconid: { type: String, required: true }
  },
  emits: ["close"],
  setup(__props, { emit: __emit }) {
    const agentStore = useAgentStore();
    const networkStore = useNetworkBrowserStore();
    const props = __props;
    const emit2 = __emit;
    const activeTab = /* @__PURE__ */ ref("interfaces");
    const searchQuery = /* @__PURE__ */ ref("");
    const {
      winPos,
      winSize,
      isDragging,
      initWindowPosition,
      startDrag,
      startResize,
      stopDrag,
      stopResize
    } = useModalDragResize({
      defaultWidth: 980,
      defaultHeight: 680,
      minWidth: 720,
      minHeight: 460
    });
    function close() {
      emit2("close");
    }
    function fetchAll() {
      if (!props.beaconid) return;
      networkStore.requestAll(props.beaconid);
    }
    function formatTime(value) {
      if (!value) return "--:--:--";
      const time = new Date(value);
      if (Number.isNaN(time.getTime())) return "--:--:--";
      return time.toLocaleTimeString("zh-CN", { hour12: false });
    }
    function formatFlags(flags) {
      if (!Array.isArray(flags) || !flags.length) return "-";
      return flags.join(", ");
    }
    function formatAddresses(addrs) {
      if (!Array.isArray(addrs) || !addrs.length) return "-";
      return addrs.join(", ");
    }
    const loading = computed(() => networkStore.isLoading(props.beaconid));
    const error = computed(() => networkStore.getError(props.beaconid));
    const interfaces = computed(() => networkStore.getInterfaces(props.beaconid));
    const connections = computed(() => networkStore.getConnections(props.beaconid));
    const lastUpdated = computed(() => networkStore.getLastUpdated(props.beaconid));
    const agent2 = computed(() => agentStore.getAgentById(props.beaconid));
    const filteredInterfaces = computed(() => {
      const q = searchQuery.value.trim().toLowerCase();
      if (!q) return interfaces.value;
      return interfaces.value.filter((iface) => {
        const text = [
          iface.name,
          iface.hardwareAddr,
          formatFlags(iface.flags),
          formatAddresses(iface.addrs),
          String(iface.index),
          String(iface.mtu)
        ].join(" ").toLowerCase();
        return text.includes(q);
      });
    });
    const filteredConnections = computed(() => {
      const q = searchQuery.value.trim().toLowerCase();
      if (!q) return connections.value;
      return connections.value.filter((conn) => {
        const text = [
          conn.protocol,
          conn.localAddress,
          conn.localPort,
          conn.remoteAddress,
          conn.remotePort,
          conn.state,
          conn.pid
        ].join(" ").toLowerCase();
        return text.includes(q);
      });
    });
    watch(() => props.visible, (visible) => {
      if (!visible) {
        searchQuery.value = "";
        activeTab.value = "interfaces";
        networkStore.clear(props.beaconid);
        return;
      }
      initWindowPosition();
      fetchAll();
    });
    watch(() => props.beaconid, (next, prev) => {
      if (!props.visible || !next || next === prev) return;
      searchQuery.value = "";
      activeTab.value = "interfaces";
      fetchAll();
    });
    onMounted(() => {
      if (props.visible) {
        initWindowPosition();
      }
    });
    onUnmounted(() => {
      stopDrag();
      stopResize();
    });
    return (_ctx, _cache) => {
      var _a2, _b, _c;
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        __props.visible ? (openBlock(), createElementBlock("div", _hoisted_1$5, [
          createBaseVNode("div", {
            class: normalizeClass(["modal-window", { "is-dragging": unref(isDragging) }]),
            style: normalizeStyle({
              left: unref(winPos).x + "px",
              top: unref(winPos).y + "px",
              width: unref(winSize).w + "px",
              height: unref(winSize).h + "px"
            })
          }, [
            createBaseVNode("div", {
              class: "resize-handle resizer-n",
              onMousedown: _cache[0] || (_cache[0] = ($event) => unref(startResize)("n", $event))
            }, null, 32),
            createBaseVNode("div", {
              class: "resize-handle resizer-s",
              onMousedown: _cache[1] || (_cache[1] = ($event) => unref(startResize)("s", $event))
            }, null, 32),
            createBaseVNode("div", {
              class: "resize-handle resizer-e",
              onMousedown: _cache[2] || (_cache[2] = ($event) => unref(startResize)("e", $event))
            }, null, 32),
            createBaseVNode("div", {
              class: "resize-handle resizer-w",
              onMousedown: _cache[3] || (_cache[3] = ($event) => unref(startResize)("w", $event))
            }, null, 32),
            createBaseVNode("div", {
              class: "resize-handle resizer-nw",
              onMousedown: _cache[4] || (_cache[4] = ($event) => unref(startResize)("nw", $event))
            }, null, 32),
            createBaseVNode("div", {
              class: "resize-handle resizer-ne",
              onMousedown: _cache[5] || (_cache[5] = ($event) => unref(startResize)("ne", $event))
            }, null, 32),
            createBaseVNode("div", {
              class: "resize-handle resizer-sw",
              onMousedown: _cache[6] || (_cache[6] = ($event) => unref(startResize)("sw", $event))
            }, null, 32),
            createBaseVNode("div", {
              class: "resize-handle resizer-se",
              onMousedown: _cache[7] || (_cache[7] = ($event) => unref(startResize)("se", $event))
            }, null, 32),
            createBaseVNode("div", _hoisted_2$4, [
              createBaseVNode("header", {
                class: "modal-header",
                onMousedown: _cache[8] || (_cache[8] = (...args) => unref(startDrag) && unref(startDrag)(...args))
              }, [
                createBaseVNode("div", _hoisted_3$4, [
                  _cache[13] || (_cache[13] = createBaseVNode("span", { class: "icon" }, "🌐", -1)),
                  createBaseVNode("div", _hoisted_4$4, [
                    _cache[12] || (_cache[12] = createBaseVNode("h3", null, "网络浏览器", -1)),
                    createBaseVNode("span", _hoisted_5$4, " Agent: " + toDisplayString(((_b = (_a2 = agent2.value) == null ? void 0 : _a2.beaconid) == null ? void 0 : _b.substring(0, 8)) || __props.beaconid.substring(0, 8)) + "@" + toDisplayString(((_c = agent2.value) == null ? void 0 : _c.hostname) || __props.beaconid.substring(0, 8)), 1)
                  ])
                ]),
                createBaseVNode("button", {
                  class: "close-btn",
                  onClick: close
                }, "×")
              ], 32),
              createBaseVNode("div", _hoisted_6$4, [
                createBaseVNode("div", _hoisted_7$4, [
                  createBaseVNode("button", {
                    class: normalizeClass(["tab-btn", { active: activeTab.value === "interfaces" }]),
                    onClick: _cache[9] || (_cache[9] = ($event) => activeTab.value = "interfaces")
                  }, " 网络接口 ", 2),
                  createBaseVNode("button", {
                    class: normalizeClass(["tab-btn", { active: activeTab.value === "connections" }]),
                    onClick: _cache[10] || (_cache[10] = ($event) => activeTab.value = "connections")
                  }, " 网络连接 ", 2)
                ]),
                createBaseVNode("div", _hoisted_8$4, [
                  _cache[14] || (_cache[14] = createBaseVNode("span", { class: "search-icon" }, "🔍", -1)),
                  withDirectives(createBaseVNode("input", {
                    "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => searchQuery.value = $event),
                    type: "text",
                    placeholder: activeTab.value === "interfaces" ? "搜索网卡名、MAC 或地址..." : "搜索协议、地址、状态或 PID...",
                    spellcheck: "false"
                  }, null, 8, _hoisted_9$4), [
                    [vModelText, searchQuery.value]
                  ])
                ]),
                createBaseVNode("button", {
                  class: normalizeClass(["nav-action-btn refresh", { spinning: loading.value }]),
                  onClick: fetchAll,
                  disabled: loading.value,
                  title: "刷新网络数据"
                }, [..._cache[15] || (_cache[15] = [
                  createBaseVNode("svg", {
                    width: "14",
                    height: "14",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    "stroke-width": "2"
                  }, [
                    createBaseVNode("path", { d: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" })
                  ], -1)
                ])], 10, _hoisted_10$4),
                createBaseVNode("span", _hoisted_11$4, "同步: " + toDisplayString(formatTime(lastUpdated.value)), 1)
              ]),
              createBaseVNode("div", _hoisted_12$4, [
                loading.value ? (openBlock(), createElementBlock("div", _hoisted_13$4, [..._cache[16] || (_cache[16] = [
                  createBaseVNode("div", { class: "spinner" }, null, -1),
                  createBaseVNode("span", null, "正在获取网络数据...", -1)
                ])])) : error.value ? (openBlock(), createElementBlock("div", _hoisted_14$3, [
                  _cache[17] || (_cache[17] = createBaseVNode("span", { class: "error-icon" }, "⚠️", -1)),
                  createBaseVNode("span", null, toDisplayString(error.value), 1),
                  createBaseVNode("button", {
                    onClick: fetchAll,
                    class: "retry-btn"
                  }, "重试")
                ])) : activeTab.value === "interfaces" ? (openBlock(), createElementBlock("div", _hoisted_15$3, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(filteredInterfaces.value, (iface) => {
                    return openBlock(), createElementBlock("article", {
                      key: `${iface.index}-${iface.name}`,
                      class: "interface-card"
                    }, [
                      createBaseVNode("div", _hoisted_16$2, [
                        createBaseVNode("div", null, [
                          createBaseVNode("h4", null, toDisplayString(iface.name), 1),
                          createBaseVNode("span", _hoisted_17$1, "索引 #" + toDisplayString(iface.index), 1)
                        ]),
                        createBaseVNode("div", _hoisted_18$1, [
                          createBaseVNode("span", {
                            class: normalizeClass(["state-tag", { up: iface.isUp === true, down: iface.isUp === false }])
                          }, toDisplayString(iface.isUp === true ? "UP" : iface.isUp === false ? "DOWN" : "UNKNOWN"), 3),
                          iface.isLoopback ? (openBlock(), createElementBlock("span", _hoisted_19$1, "LOOPBACK")) : createCommentVNode("", true),
                          iface.isMulticast ? (openBlock(), createElementBlock("span", _hoisted_20$1, "MULTICAST")) : createCommentVNode("", true)
                        ])
                      ]),
                      createBaseVNode("div", _hoisted_21, [
                        createBaseVNode("div", _hoisted_22, [
                          _cache[18] || (_cache[18] = createBaseVNode("label", null, "MAC", -1)),
                          createBaseVNode("span", _hoisted_23, toDisplayString(iface.hardwareAddr || "-"), 1)
                        ]),
                        createBaseVNode("div", _hoisted_24, [
                          _cache[19] || (_cache[19] = createBaseVNode("label", null, "MTU", -1)),
                          createBaseVNode("span", _hoisted_25, toDisplayString(iface.mtu || "-"), 1)
                        ]),
                        createBaseVNode("div", _hoisted_26, [
                          _cache[20] || (_cache[20] = createBaseVNode("label", null, "Flags", -1)),
                          createBaseVNode("span", null, toDisplayString(formatFlags(iface.flags)), 1)
                        ]),
                        createBaseVNode("div", _hoisted_27, [
                          _cache[21] || (_cache[21] = createBaseVNode("label", null, "地址", -1)),
                          createBaseVNode("span", _hoisted_28, toDisplayString(formatAddresses(iface.addrs)), 1)
                        ])
                      ])
                    ]);
                  }), 128)),
                  filteredInterfaces.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_29, " 没有找到匹配的网络接口 ")) : createCommentVNode("", true)
                ])) : (openBlock(), createElementBlock("table", _hoisted_30, [
                  _cache[23] || (_cache[23] = createBaseVNode("thead", null, [
                    createBaseVNode("tr", null, [
                      createBaseVNode("th", null, "协议"),
                      createBaseVNode("th", null, "本地地址"),
                      createBaseVNode("th", null, "远端地址"),
                      createBaseVNode("th", null, "状态"),
                      createBaseVNode("th", null, "PID")
                    ])
                  ], -1)),
                  createBaseVNode("tbody", null, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(filteredConnections.value, (conn) => {
                      return openBlock(), createElementBlock("tr", {
                        key: `${conn.protocol}-${conn.localAddress}:${conn.localPort}-${conn.remoteAddress}:${conn.remotePort}-${conn.pid}`
                      }, [
                        createBaseVNode("td", _hoisted_31, [
                          createBaseVNode("span", _hoisted_32, toDisplayString(conn.protocol), 1)
                        ]),
                        createBaseVNode("td", _hoisted_33, toDisplayString(conn.localAddress) + ":" + toDisplayString(conn.localPort || "-"), 1),
                        createBaseVNode("td", _hoisted_34, toDisplayString(conn.remoteAddress) + ":" + toDisplayString(conn.remotePort || "-"), 1),
                        createBaseVNode("td", _hoisted_35, toDisplayString(conn.state || "-"), 1),
                        createBaseVNode("td", _hoisted_36, toDisplayString(conn.pid || "-"), 1)
                      ]);
                    }), 128)),
                    filteredConnections.value.length === 0 ? (openBlock(), createElementBlock("tr", _hoisted_37, [..._cache[22] || (_cache[22] = [
                      createBaseVNode("td", {
                        colspan: "5",
                        class: "empty-row"
                      }, "没有找到匹配的网络连接", -1)
                    ])])) : createCommentVNode("", true)
                  ])
                ]))
              ]),
              createBaseVNode("footer", _hoisted_38, [
                createBaseVNode("span", _hoisted_39, toDisplayString(activeTab.value === "interfaces" ? `${filteredInterfaces.value.length} 个网络接口` : `${filteredConnections.value.length} 条网络连接`) + " " + toDisplayString(searchQuery.value ? "(过滤后)" : ""), 1)
              ])
            ])
          ], 6)
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const NetworkBrowserModal = /* @__PURE__ */ _export_sfc(_sfc_main$7, [["__scopeId", "data-v-08b79fb6"]]);
const _hoisted_1$4 = {
  key: 0,
  class: "modal-overlay"
};
const _hoisted_2$3 = { class: "execute-modal" };
const _hoisted_3$3 = { class: "modal-header" };
const _hoisted_4$3 = { class: "header-info" };
const _hoisted_5$3 = { class: "titles" };
const _hoisted_6$3 = { class: "subtitle" };
const _hoisted_7$3 = { class: "modal-body" };
const _hoisted_8$3 = { class: "form-group" };
const _hoisted_9$3 = { class: "path-input-group" };
const _hoisted_10$3 = ["placeholder"];
const _hoisted_11$3 = { class: "help-text" };
const _hoisted_12$3 = {
  key: 0,
  class: "form-group"
};
const _hoisted_13$3 = {
  key: 0,
  class: "help-text"
};
const _hoisted_14$2 = {
  key: 1,
  class: "help-text error"
};
const _hoisted_15$2 = {
  key: 2,
  class: "arg-preview"
};
const _hoisted_16$1 = { class: "arg-preview-title" };
const _hoisted_17 = { class: "arg-chip-list" };
const _hoisted_18 = { class: "modal-footer" };
const _hoisted_19 = ["disabled"];
const _hoisted_20 = ["disabled"];
const _sfc_main$6 = {
  __name: "ExecuteTaskModal",
  props: {
    visible: { type: Boolean, default: false },
    beaconid: { type: String, required: true },
    executionType: { type: String, required: true }
    // 'assembly', 'bof', 'shellcode', 'pe'
  },
  emits: ["close"],
  setup(__props, { emit: __emit }) {
    const consoleStore = useConsoleStore();
    const notificationStore = useNotificationStore();
    const props = __props;
    const emit2 = __emit;
    const filePath = /* @__PURE__ */ ref("");
    const selectedFile = /* @__PURE__ */ ref(null);
    const parameters = /* @__PURE__ */ ref("");
    const isExecuting = /* @__PURE__ */ ref(false);
    const titleMap = {
      "assembly": "执行 .NET Assembly (execute-assembly)",
      "bof": "执行 Beacon Object File (execute-bof)",
      "shellcode": "生成 Shellcode (payload/shellcode)",
      "pe": "执行 PE 文件 (execute-pe)"
    };
    const fileFilterMap = {
      "assembly": ".exe, .dll",
      "bof": ".o, .obj",
      "shellcode": ".exe, .dll",
      "pe": ".exe, .dll"
    };
    const displayTitle = computed(() => titleMap[props.executionType] || "执行任务");
    const acceptFilter = computed(() => fileFilterMap[props.executionType] || "*");
    const actionButtonLabel = computed(() => props.executionType === "shellcode" ? "生成并保存" : "发起执行 🚀");
    const fileInputLabel = computed(() => props.executionType === "shellcode" ? "待转换 PE 文件 (Host Local Path)" : "待执行文件载荷路径 (Host Local Path)");
    const fileInputPlaceholder = computed(() => props.executionType === "shellcode" ? "请选择本地 PE 文件，发送给后端生成 shellcode..." : "请选择或输入本地 Payload 文件路径...");
    const showParametersInput = computed(() => props.executionType !== "shellcode");
    const parsedBofArguments = computed(() => {
      if (props.executionType !== "bof") return [];
      try {
        return parseTypedBofArguments(parameters.value);
      } catch {
        return [];
      }
    });
    const bofArgumentParseError = computed(() => {
      if (props.executionType !== "bof") return "";
      try {
        parseTypedBofArguments(parameters.value);
        return "";
      } catch (err) {
        return (err == null ? void 0 : err.message) || "参数解析失败";
      }
    });
    const FILE_FILTERS = {
      assembly: { DisplayName: "Assembly 文件", Pattern: "*.exe;*.dll" },
      bof: { DisplayName: "BOF 文件", Pattern: "*.o;*.obj" },
      shellcode: { DisplayName: "PE 文件", Pattern: "*.exe;*.dll" },
      pe: { DisplayName: "PE 文件", Pattern: "*.exe;*.dll" }
    };
    async function browseFile() {
      try {
        const filter = FILE_FILTERS[props.executionType] || { DisplayName: "所有文件", Pattern: "*" };
        const picked = await OpenFile({
          Title: "选择文件",
          Message: `请选择 ${filter.DisplayName}`,
          CanChooseFiles: true,
          AllowsMultipleSelection: false,
          Filters: [filter]
        });
        const sourcePath = Array.isArray(picked) ? picked[0] : picked;
        if (!sourcePath) return;
        filePath.value = sourcePath;
        selectedFile.value = sourcePath;
      } catch (err) {
        notificationStore.error(err.message || "文件选择失败");
      }
    }
    function buildShellcodeDefaultName(fileName) {
      const sourceName = String(fileName || "shellcode");
      const trimmed = sourceName.replace(/\.(exe|dll)$/i, "");
      return `${trimmed || "shellcode"}.bin`;
    }
    function parseBofArguments(input) {
      const text = String(input || "");
      const args = [];
      let current = "";
      let quote = "";
      let tokenStarted = false;
      for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (quote) {
          if (ch === quote) {
            quote = "";
            continue;
          }
          if (ch === "\\" && text[i + 1] === quote) {
            current += quote;
            i += 1;
            continue;
          }
          current += ch;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          tokenStarted = true;
          continue;
        }
        if (/\s/.test(ch)) {
          if (tokenStarted) {
            args.push(current);
            current = "";
            tokenStarted = false;
          }
          continue;
        }
        current += ch;
        tokenStarted = true;
      }
      if (quote) {
        throw new Error(`BOF 参数存在未闭合的 ${quote} 引号`);
      }
      if (tokenStarted) {
        args.push(current);
      }
      return args;
    }
    function parseInteger(value, label, min, max) {
      const text = String(value ?? "").trim();
      if (!text) throw new Error(`${label} 不能为空`);
      const numeric = Number(text);
      if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
        throw new Error(`${label} 必须是整数`);
      }
      if (numeric < min || numeric > max) {
        throw new Error(`${label} 超出范围`);
      }
      return numeric;
    }
    function parseBofArgumentToken(token) {
      const text = String(token ?? "");
      const separator = text.indexOf(":");
      if (separator <= 0) {
        return { kind: "string", value: text };
      }
      const kind = text.slice(0, separator).trim().toLowerCase();
      const value = text.slice(separator + 1);
      switch (kind) {
        case "int32":
          return { kind: "int32", value: parseInteger(value, "int32 参数", -2147483648, 2147483647) };
        case "short":
        case "int16":
          return { kind: "short", value: parseInteger(value, "short 参数", -32768, 32767) };
        case "bytes":
          return { kind: "bytes", value: String(value || "").trim() };
        case "string":
          return { kind: "string", value };
        default:
          return { kind: "string", value: text };
      }
    }
    function parseTypedBofArguments(input) {
      return parseBofArguments(input).map(parseBofArgumentToken);
    }
    function formatBofPreviewArg(arg) {
      return `${arg.kind}:${arg.value}`;
    }
    async function executeTask() {
      var _a2, _b;
      if (!filePath.value) {
        notificationStore.warn("请先选择待执行的文件路径");
        return;
      }
      isExecuting.value = true;
      if (props.executionType === "bof") {
        if (!selectedFile.value) {
          notificationStore.warn("请先选择待执行的 BOF / OBJ 文件");
          isExecuting.value = false;
          return;
        }
        try {
          consoleStore.openConsole(props.beaconid);
          const displayCommand = `bof "${filePath.value}" ${String(parameters.value || "").trim()}`.trim();
          consoleStore.appendToConsole(props.beaconid, "input", displayCommand);
          consoleStore.appendToConsole(props.beaconid, "output", "正在推送 BOF 工件并准备执行...");
          const artifactData = await ReadBinaryFileBase64(selectedFile.value);
          const extraArgs = parseTypedBofArguments(parameters.value);
          const args = [{ kind: "bytes", value: artifactData }, ...extraArgs];
          await sendExecutionBofCommand(props.beaconid, args);
          consoleStore.appendToConsole(props.beaconid, "output", "注入成功 / 执行完成。");
          consoleStore.appendToConsole(props.beaconid, "output", "截获返回信息:");
          close();
        } catch (err) {
          const message = (err == null ? void 0 : err.message) || "执行 BOF 失败";
          consoleStore.appendToConsole(props.beaconid, "error", `BOF 执行失败: ${message}`);
          notificationStore.error(message);
          console.error("[ExecuteTaskModal] 执行 BOF 失败:", err);
        } finally {
          isExecuting.value = false;
        }
        return;
      }
      if (props.executionType === "shellcode") {
        if (!selectedFile.value) {
          notificationStore.warn("请先选择待转换的 PE 文件");
          isExecuting.value = false;
          return;
        }
        try {
          const peBase64 = await ReadBinaryFileBase64(selectedFile.value);
          const result = await generateShellcode({
            mode: "front",
            pe_base64: peBase64,
            loader_name: "ReflectiveLoader"
          });
          const shellcode = (result == null ? void 0 : result.shellcode) ?? ((_a2 = result == null ? void 0 : result.data) == null ? void 0 : _a2.shellcode);
          if (!shellcode) {
            throw new Error((result == null ? void 0 : result.message) || (result == null ? void 0 : result.error) || "shellcode 生成失败");
          }
          const savePath = await SaveFile({
            Title: "保存生成的 Shellcode",
            Filename: buildShellcodeDefaultName((_b = selectedFile.value) == null ? void 0 : _b.name),
            Filters: [
              { Name: "Shellcode Files", Pattern: "*.bin" }
            ]
          });
          if (!savePath) {
            notificationStore.info("已取消保存");
            return;
          }
          await WriteBinaryFile(savePath, shellcode);
          notificationStore.success("Shellcode 生成成功并已保存到本地");
          close();
        } catch (err) {
          const message = (err == null ? void 0 : err.message) || "生成 Shellcode 失败";
          notificationStore.error(message);
          console.error("[ExecuteTaskModal] 生成 Shellcode 失败:", err);
        } finally {
          isExecuting.value = false;
        }
        return;
      }
      consoleStore.openConsole(props.beaconid);
      consoleStore.appendToConsole(
        props.beaconid,
        "input",
        `${props.executionType} "${filePath.value}" ${parameters.value}`.trim()
      );
      consoleStore.appendToConsole(
        props.beaconid,
        "output",
        `正在推送 Payload 并准备执行 ${props.executionType}...`
      );
      setTimeout(() => {
        isExecuting.value = false;
        consoleStore.appendToConsole(
          props.beaconid,
          "output",
          `注入成功 / 执行完成。
截获返回信息: 

Target Agent: ${props.beaconid.substring(0, 8)}
Status: Payload Execution Simulated Successfully.`
        );
        close();
      }, 1e3);
    }
    watch(() => props.visible, (newVal) => {
      if (newVal) {
        filePath.value = "";
        selectedFile.value = null;
        parameters.value = "";
        isExecuting.value = false;
      }
    });
    function close() {
      emit2("close");
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        __props.visible ? (openBlock(), createElementBlock("div", _hoisted_1$4, [
          createBaseVNode("div", _hoisted_2$3, [
            createBaseVNode("header", _hoisted_3$3, [
              createBaseVNode("div", _hoisted_4$3, [
                _cache[2] || (_cache[2] = createBaseVNode("span", { class: "icon" }, "⚡", -1)),
                createBaseVNode("div", _hoisted_5$3, [
                  createBaseVNode("h3", null, toDisplayString(displayTitle.value), 1),
                  createBaseVNode("span", _hoisted_6$3, "目标 Agent: " + toDisplayString(__props.beaconid.substring(0, 8)), 1)
                ])
              ]),
              createBaseVNode("button", {
                class: "close-btn",
                onClick: close
              }, "×")
            ]),
            createBaseVNode("div", _hoisted_7$3, [
              createBaseVNode("div", _hoisted_8$3, [
                createBaseVNode("label", null, toDisplayString(fileInputLabel.value), 1),
                createBaseVNode("div", _hoisted_9$3, [
                  withDirectives(createBaseVNode("input", {
                    type: "text",
                    "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => filePath.value = $event),
                    class: "form-control",
                    placeholder: fileInputPlaceholder.value
                  }, null, 8, _hoisted_10$3), [
                    [vModelText, filePath.value]
                  ]),
                  createBaseVNode("button", {
                    class: "browse-btn",
                    onClick: browseFile
                  }, "选择文件")
                ]),
                createBaseVNode("p", _hoisted_11$3, "支持的后缀类型: " + toDisplayString(acceptFilter.value), 1)
              ]),
              showParametersInput.value ? (openBlock(), createElementBlock("div", _hoisted_12$3, [
                _cache[3] || (_cache[3] = createBaseVNode("label", null, "执行参数 (Arguments / Optional)", -1)),
                withDirectives(createBaseVNode("textarea", {
                  "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => parameters.value = $event),
                  class: normalizeClass(["form-control", { invalid: bofArgumentParseError.value }]),
                  rows: "3",
                  placeholder: 'BOF 参数按空格分隔；类型用 kind:value。例如：int32:1234 short:77 "hello-elf-bof"'
                }, null, 2), [
                  [vModelText, parameters.value]
                ]),
                __props.executionType === "bof" ? (openBlock(), createElementBlock("p", _hoisted_13$3, " BOF 参数会按 shell-like 规则拆分；支持 int32、short/int16、string、bytes 前缀，未带前缀时按 string 发送。 ")) : createCommentVNode("", true),
                bofArgumentParseError.value ? (openBlock(), createElementBlock("p", _hoisted_14$2, toDisplayString(bofArgumentParseError.value), 1)) : createCommentVNode("", true),
                __props.executionType === "bof" && parsedBofArguments.value.length ? (openBlock(), createElementBlock("div", _hoisted_15$2, [
                  createBaseVNode("div", _hoisted_16$1, "解析预览：" + toDisplayString(parsedBofArguments.value.length) + " 个参数", 1),
                  createBaseVNode("div", _hoisted_17, [
                    (openBlock(true), createElementBlock(Fragment, null, renderList(parsedBofArguments.value, (arg, index2) => {
                      return openBlock(), createElementBlock("span", {
                        key: index2,
                        class: "arg-chip"
                      }, " #" + toDisplayString(index2 + 1) + " " + toDisplayString(formatBofPreviewArg(arg)), 1);
                    }), 128))
                  ])
                ])) : createCommentVNode("", true)
              ])) : createCommentVNode("", true)
            ]),
            createBaseVNode("footer", _hoisted_18, [
              createBaseVNode("button", {
                class: "btn btn-secondary",
                onClick: close,
                disabled: isExecuting.value
              }, "取消", 8, _hoisted_19),
              createBaseVNode("button", {
                class: "btn btn-danger",
                onClick: executeTask,
                disabled: isExecuting.value || Boolean(bofArgumentParseError.value)
              }, toDisplayString(isExecuting.value ? "执行中..." : actionButtonLabel.value), 9, _hoisted_20)
            ])
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
};
const ExecuteTaskModal = /* @__PURE__ */ _export_sfc(_sfc_main$6, [["__scopeId", "data-v-25aa21c8"]]);
const _hoisted_1$3 = {
  key: 0,
  class: "modal-overlay"
};
const _hoisted_2$2 = { class: "modal-content glass-card" };
const _hoisted_3$2 = { class: "modal-header" };
const _hoisted_4$2 = { class: "input-group" };
const _hoisted_5$2 = { class: "label-row" };
const _hoisted_6$2 = { class: "unit" };
const _hoisted_7$2 = { class: "input-with-limit" };
const _hoisted_8$2 = { class: "input-group" };
const _hoisted_9$2 = { class: "label-row" };
const _hoisted_10$2 = { class: "unit" };
const _hoisted_11$2 = { class: "input-with-limit" };
const _hoisted_12$2 = { class: "modal-actions" };
const _hoisted_13$2 = ["disabled"];
const _hoisted_14$1 = { key: 0 };
const _hoisted_15$1 = {
  key: 1,
  class: "loader sm"
};
const _sfc_main$5 = {
  __name: "SleepConfigModal",
  props: {
    visible: Boolean,
    beaconid: String
  },
  emits: ["close"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit2 = __emit;
    const agentStore = useAgentStore();
    const consoleStore = useConsoleStore();
    const notificationStore = useNotificationStore();
    const sleeptime = /* @__PURE__ */ ref(5e3);
    const jitter = /* @__PURE__ */ ref(10);
    const isSubmitting = /* @__PURE__ */ ref(false);
    watch(() => props.visible, (newVal) => {
      if (newVal) {
        sleeptime.value = 5e3;
        jitter.value = 10;
      }
    });
    async function handleSubmit() {
      if (sleeptime.value > 6e4) {
        notificationStore.warning("SleepTime 已被修正至上限 60,000ms");
        sleeptime.value = 6e4;
      }
      if (jitter.value > 200) {
        notificationStore.warning("Jitter 已被修正至上限 200%");
        jitter.value = 200;
      }
      isSubmitting.value = true;
      try {
        consoleStore.openConsole(props.beaconid);
        consoleStore.appendToConsole(props.beaconid, "input", `sleep ${sleeptime.value} ${jitter.value}`.trim());
        consoleStore.appendToConsole(props.beaconid, "output", "正在下发 SleepTime 配置...");
        await sendSleepCommand(props.beaconid, sleeptime.value, jitter.value);
        consoleStore.appendToConsole(props.beaconid, "output", "SleepTime 已下发。");
        agentStore.updateAgent(props.beaconid, { sleep: sleeptime.value / 1e3, jitter: jitter.value });
        notificationStore.success(`指令已下发: Sleep ${sleeptime.value}ms (Jitter: ${jitter.value}%)`);
        emit2("close");
      } catch (err) {
        consoleStore.appendToConsole(props.beaconid, "error", `下发 SleepTime 失败: ${err.message || err}`);
        console.error("[SleepModal] Failed to send command:", err);
      } finally {
        isSubmitting.value = false;
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Transition, { name: "modal-fade" }, {
        default: withCtx(() => [
          __props.visible ? (openBlock(), createElementBlock("div", _hoisted_1$3, [
            createBaseVNode("div", _hoisted_2$2, [
              createBaseVNode("header", _hoisted_3$2, [
                _cache[6] || (_cache[6] = createBaseVNode("div", { class: "title-area" }, [
                  createBaseVNode("span", { class: "icon" }, "⏰"),
                  createBaseVNode("h3", null, "心跳频率配置")
                ], -1)),
                createBaseVNode("button", {
                  class: "close-btn",
                  onClick: _cache[0] || (_cache[0] = ($event) => emit2("close"))
                }, "×")
              ]),
              createBaseVNode("form", {
                onSubmit: withModifiers(handleSubmit, ["prevent"]),
                class: "modal-body"
              }, [
                _cache[11] || (_cache[11] = createBaseVNode("p", { class: "description" }, "调整 Beacon 与服务器通信的频率及波差。过于频繁的通信会增加被发现的风险。", -1)),
                createBaseVNode("div", _hoisted_4$2, [
                  createBaseVNode("div", _hoisted_5$2, [
                    _cache[7] || (_cache[7] = createBaseVNode("label", null, "睡眠时间 (Sleeptime)", -1)),
                    createBaseVNode("span", _hoisted_6$2, toDisplayString(sleeptime.value) + " ms", 1)
                  ]),
                  withDirectives(createBaseVNode("input", {
                    type: "range",
                    "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => sleeptime.value = $event),
                    min: "100",
                    max: "60000",
                    step: "100",
                    class: "range-slider"
                  }, null, 512), [
                    [
                      vModelText,
                      sleeptime.value,
                      void 0,
                      { number: true }
                    ]
                  ]),
                  createBaseVNode("div", _hoisted_7$2, [
                    withDirectives(createBaseVNode("input", {
                      type: "number",
                      "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => sleeptime.value = $event),
                      placeholder: "毫秒",
                      max: "60000"
                    }, null, 512), [
                      [
                        vModelText,
                        sleeptime.value,
                        void 0,
                        { number: true }
                      ]
                    ]),
                    _cache[8] || (_cache[8] = createBaseVNode("span", { class: "limit-hint" }, "MAX: 60,000", -1))
                  ])
                ]),
                createBaseVNode("div", _hoisted_8$2, [
                  createBaseVNode("div", _hoisted_9$2, [
                    _cache[9] || (_cache[9] = createBaseVNode("label", null, "波动比例 (Jitter)", -1)),
                    createBaseVNode("span", _hoisted_10$2, toDisplayString(jitter.value) + " %", 1)
                  ]),
                  withDirectives(createBaseVNode("input", {
                    type: "range",
                    "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => jitter.value = $event),
                    min: "0",
                    max: "200",
                    step: "1",
                    class: "range-slider jitter"
                  }, null, 512), [
                    [
                      vModelText,
                      jitter.value,
                      void 0,
                      { number: true }
                    ]
                  ]),
                  createBaseVNode("div", _hoisted_11$2, [
                    withDirectives(createBaseVNode("input", {
                      type: "number",
                      "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => jitter.value = $event),
                      placeholder: "百分比",
                      max: "200"
                    }, null, 512), [
                      [
                        vModelText,
                        jitter.value,
                        void 0,
                        { number: true }
                      ]
                    ]),
                    _cache[10] || (_cache[10] = createBaseVNode("span", { class: "limit-hint" }, "MAX: 200%", -1))
                  ])
                ]),
                createBaseVNode("footer", _hoisted_12$2, [
                  createBaseVNode("button", {
                    type: "button",
                    class: "btn-cancel",
                    onClick: _cache[5] || (_cache[5] = ($event) => emit2("close"))
                  }, "取消"),
                  createBaseVNode("button", {
                    type: "submit",
                    class: "btn-confirm",
                    disabled: isSubmitting.value
                  }, [
                    !isSubmitting.value ? (openBlock(), createElementBlock("span", _hoisted_14$1, "下发配置")) : (openBlock(), createElementBlock("div", _hoisted_15$1))
                  ], 8, _hoisted_13$2)
                ])
              ], 32)
            ])
          ])) : createCommentVNode("", true)
        ]),
        _: 1
      });
    };
  }
};
const SleepConfigModal = /* @__PURE__ */ _export_sfc(_sfc_main$5, [["__scopeId", "data-v-11ea94a9"]]);
const _hoisted_1$2 = {
  key: 0,
  class: "modal-overlay"
};
const _hoisted_2$1 = { class: "modal-content glass-card" };
const _hoisted_3$1 = { class: "modal-header" };
const _hoisted_4$1 = { class: "title-area" };
const _hoisted_5$1 = { class: "description" };
const _hoisted_6$1 = { class: "input-group" };
const _hoisted_7$1 = { class: "input-group" };
const _hoisted_8$1 = { class: "input-group" };
const _hoisted_9$1 = {
  key: 1,
  class: "input-group"
};
const _hoisted_10$1 = { class: "modal-actions" };
const _hoisted_11$1 = ["disabled"];
const _hoisted_12$1 = { key: 0 };
const _hoisted_13$1 = {
  key: 1,
  class: "loader sm"
};
const _sfc_main$4 = {
  __name: "CascadeConnectModal",
  setup(__props) {
    const modalStore = useModalStore();
    const consoleStore = useConsoleStore();
    const notificationStore = useNotificationStore();
    const visible = computed(() => modalStore.cascadeConnectModalVisible);
    const beaconid = computed(() => modalStore.cascadeConnectBeaconId);
    const mode = computed(() => modalStore.cascadeConnectMode);
    const childId = /* @__PURE__ */ ref("");
    const host = /* @__PURE__ */ ref("");
    const port = /* @__PURE__ */ ref(4444);
    const pipeName = /* @__PURE__ */ ref("");
    const isSubmitting = /* @__PURE__ */ ref(false);
    const title = computed(() => mode.value === "tcp" ? "Connect TCP Child" : "Link SMB Child");
    watch(visible, (newVal) => {
      if (newVal) {
        childId.value = "";
        host.value = "";
        port.value = 4444;
        pipeName.value = "";
        isSubmitting.value = false;
      }
    });
    async function handleSubmit() {
      if (mode.value === "tcp") {
        if (!host.value.trim()) {
          notificationStore.warn("请输入目标主机地址");
          return;
        }
        if (!port.value || port.value < 1 || port.value > 65535) {
          notificationStore.warn("端口范围必须在 1-65535 之间");
          return;
        }
      } else {
        if (!pipeName.value.trim()) {
          notificationStore.warn("请输入 Pipe 名称");
          return;
        }
      }
      isSubmitting.value = true;
      try {
        consoleStore.openConsole(beaconid.value);
        const args = mode.value === "tcp" ? [childId.value.trim(), host.value.trim(), Number(port.value)] : [childId.value.trim(), pipeName.value.trim()];
        const displayCommand = mode.value === "tcp" ? `connect ${childId.value} ${host.value} ${port.value}` : `link ${childId.value} ${pipeName.value}`;
        consoleStore.appendToConsole(beaconid.value, "input", displayCommand);
        consoleStore.appendToConsole(beaconid.value, "output", "正在下发级联连接指令...");
        await sendCascadeConnectCommand(beaconid.value, mode.value, args);
        consoleStore.appendToConsole(beaconid.value, "output", "级联连接指令已下发。");
        notificationStore.success(`指令已下发: ${displayCommand}`);
        modalStore.closeCascadeConnectModal();
      } catch (err) {
        const message = (err == null ? void 0 : err.message) || "下发级联连接指令失败";
        consoleStore.appendToConsole(beaconid.value, "error", `级联连接失败: ${message}`);
        notificationStore.error(message);
        console.error("[CascadeConnectModal] Failed:", err);
      } finally {
        isSubmitting.value = false;
      }
    }
    function close() {
      modalStore.closeCascadeConnectModal();
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Transition, { name: "modal-fade" }, {
        default: withCtx(() => [
          visible.value ? (openBlock(), createElementBlock("div", _hoisted_1$2, [
            createBaseVNode("div", _hoisted_2$1, [
              createBaseVNode("header", _hoisted_3$1, [
                createBaseVNode("div", _hoisted_4$1, [
                  _cache[4] || (_cache[4] = createBaseVNode("span", { class: "icon" }, "🔗", -1)),
                  createBaseVNode("h3", null, toDisplayString(title.value), 1)
                ]),
                createBaseVNode("button", {
                  class: "close-btn",
                  onClick: close
                }, "×")
              ]),
              createBaseVNode("form", {
                onSubmit: withModifiers(handleSubmit, ["prevent"]),
                class: "modal-body"
              }, [
                createBaseVNode("p", _hoisted_5$1, toDisplayString(mode.value === "tcp" ? "通过 TCP 连接到子 Beacon，建立级联拓扑。" : "通过 SMB 管道连接到子 Beacon，建立级联拓扑。"), 1),
                createBaseVNode("div", _hoisted_6$1, [
                  _cache[5] || (_cache[5] = createBaseVNode("label", null, [
                    createTextVNode("Child ID "),
                    createBaseVNode("span", { class: "optional" }, "(可选)")
                  ], -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "text",
                    "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => childId.value = $event),
                    placeholder: "留空则由服务端自动分配",
                    class: "form-input"
                  }, null, 512), [
                    [vModelText, childId.value]
                  ])
                ]),
                mode.value === "tcp" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
                  createBaseVNode("div", _hoisted_7$1, [
                    _cache[6] || (_cache[6] = createBaseVNode("label", null, "目标主机 (Host)", -1)),
                    withDirectives(createBaseVNode("input", {
                      type: "text",
                      "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => host.value = $event),
                      placeholder: "例如: 192.168.1.100",
                      class: "form-input"
                    }, null, 512), [
                      [vModelText, host.value]
                    ])
                  ]),
                  createBaseVNode("div", _hoisted_8$1, [
                    _cache[7] || (_cache[7] = createBaseVNode("label", null, "端口 (Port)", -1)),
                    withDirectives(createBaseVNode("input", {
                      type: "number",
                      "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => port.value = $event),
                      placeholder: "例如: 4444",
                      min: "1",
                      max: "65535",
                      class: "form-input"
                    }, null, 512), [
                      [
                        vModelText,
                        port.value,
                        void 0,
                        { number: true }
                      ]
                    ])
                  ])
                ], 64)) : (openBlock(), createElementBlock("div", _hoisted_9$1, [
                  _cache[8] || (_cache[8] = createBaseVNode("label", null, "Pipe 名称", -1)),
                  withDirectives(createBaseVNode("input", {
                    type: "text",
                    "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => pipeName.value = $event),
                    placeholder: "例如: \\\\.\\pipe\\beacon_internal",
                    class: "form-input"
                  }, null, 512), [
                    [vModelText, pipeName.value]
                  ])
                ])),
                createBaseVNode("footer", _hoisted_10$1, [
                  createBaseVNode("button", {
                    type: "button",
                    class: "btn-cancel",
                    onClick: close
                  }, "取消"),
                  createBaseVNode("button", {
                    type: "submit",
                    class: "btn-confirm",
                    disabled: isSubmitting.value
                  }, [
                    !isSubmitting.value ? (openBlock(), createElementBlock("span", _hoisted_12$1, "下发指令")) : (openBlock(), createElementBlock("div", _hoisted_13$1))
                  ], 8, _hoisted_11$1)
                ])
              ], 32)
            ])
          ])) : createCommentVNode("", true)
        ]),
        _: 1
      });
    };
  }
};
const CascadeConnectModal = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["__scopeId", "data-v-37a22098"]]);
const _sfc_main$3 = {
  __name: "GlobalModalHost",
  setup(__props) {
    const modalStore = useModalStore();
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        createVNode(ConfirmModal),
        createVNode(PromptModal),
        createVNode(PluginActionModal),
        unref(modalStore).generateBeaconVisible ? (openBlock(), createBlock(GenerateBeaconModal, { key: 0 })) : createCommentVNode("", true),
        createVNode(FileBrowserModal, {
          visible: unref(modalStore).fileBrowserVisible,
          beaconid: unref(modalStore).activeFileBrowserBeaconId || "",
          onClose: _cache[0] || (_cache[0] = ($event) => unref(modalStore).closeFileBrowser())
        }, null, 8, ["visible", "beaconid"]),
        createVNode(ProcessBrowserModal, {
          visible: unref(modalStore).processBrowserVisible,
          beaconid: unref(modalStore).activeProcessBrowserBeaconId || "",
          onClose: _cache[1] || (_cache[1] = ($event) => unref(modalStore).closeProcessBrowser())
        }, null, 8, ["visible", "beaconid"]),
        createVNode(NetworkBrowserModal, {
          visible: unref(modalStore).networkBrowserVisible,
          beaconid: unref(modalStore).activeNetworkBrowserBeaconId || "",
          onClose: _cache[2] || (_cache[2] = ($event) => unref(modalStore).closeNetworkBrowser())
        }, null, 8, ["visible", "beaconid"]),
        createVNode(ExecuteTaskModal, {
          visible: unref(modalStore).executeModalVisible,
          beaconid: unref(modalStore).activeExecuteModal.beaconid || "",
          "execution-type": unref(modalStore).activeExecuteModal.executionType || "",
          onClose: _cache[3] || (_cache[3] = ($event) => unref(modalStore).closeExecuteModal())
        }, null, 8, ["visible", "beaconid", "execution-type"]),
        createVNode(SleepConfigModal, {
          visible: unref(modalStore).sleepModalVisible,
          beaconid: unref(modalStore).activeSleepBeaconId || "",
          onClose: _cache[4] || (_cache[4] = ($event) => unref(modalStore).closeSleepModal())
        }, null, 8, ["visible", "beaconid"]),
        createVNode(CascadeConnectModal)
      ], 64);
    };
  }
};
const _hoisted_1$1 = { class: "console-tabs" };
const _hoisted_2 = { class: "tabs-left" };
const _hoisted_3 = ["onClick"];
const _hoisted_4 = { class: "tab-label" };
const _hoisted_5 = ["onClick"];
const _hoisted_6 = {
  key: 0,
  class: "console-body"
};
const _hoisted_7 = { class: "console-welcome" };
const _hoisted_8 = { class: "console-prompt-text" };
const _hoisted_9 = { class: "line-time" };
const _hoisted_10 = {
  key: 0,
  class: "line-prompt"
};
const _hoisted_11 = {
  key: 1,
  class: "line-prompt error"
};
const _hoisted_12 = {
  key: 2,
  class: "line-prompt output"
};
const _hoisted_13 = { class: "line-content" };
const _hoisted_14 = { class: "console-input-bar" };
const _hoisted_15 = ["disabled"];
const _hoisted_16 = {
  key: 1,
  class: "console-empty"
};
const _sfc_main$2 = {
  __name: "ConsolePanel",
  setup(__props) {
    const agentStore = useAgentStore();
    const consoleStore = useConsoleStore();
    const modalStore = useModalStore();
    const commandInput = /* @__PURE__ */ ref("");
    const outputRef = /* @__PURE__ */ ref(null);
    const currentConsole = computed(() => consoleStore.currentConsole);
    const activeBeacon = computed(() => agentStore.getAgentById(consoleStore.activeBeaconId));
    const activeBeaconOs = computed(() => {
      var _a2;
      return String(((_a2 = activeBeacon.value) == null ? void 0 : _a2.os) || "");
    });
    const historyIndex = /* @__PURE__ */ ref(-1);
    const historyTemp = /* @__PURE__ */ ref("");
    const lastTabPrefix = /* @__PURE__ */ ref("");
    const lastTabIndex = /* @__PURE__ */ ref(-1);
    function isCommandAllowed(command) {
      return isCommandSupportedForOS(command, activeBeaconOs.value);
    }
    const panelHeight = /* @__PURE__ */ ref(350);
    let isDragging = false;
    let startY = 0;
    let startHeight = 0;
    function startDrag(e) {
      isDragging = true;
      startY = e.clientY;
      startHeight = panelHeight.value;
      document.addEventListener("mousemove", onDrag);
      document.addEventListener("mouseup", stopDrag);
      document.body.style.userSelect = "none";
    }
    function onDrag(e) {
      if (!isDragging) return;
      const delta = startY - e.clientY;
      let newHeight = startHeight + delta;
      const minHeight = 200;
      const maxHeight = window.innerHeight * 0.8;
      if (newHeight < minHeight) newHeight = minHeight;
      if (newHeight > maxHeight) newHeight = maxHeight;
      panelHeight.value = newHeight;
    }
    function stopDrag() {
      if (isDragging) {
        isDragging = false;
        document.removeEventListener("mousemove", onDrag);
        document.removeEventListener("mouseup", stopDrag);
        document.body.style.userSelect = "";
      }
    }
    onUnmounted(() => {
      stopDrag();
    });
    watch(
      () => {
        var _a2, _b;
        return (_b = (_a2 = consoleStore.currentConsole) == null ? void 0 : _a2.history) == null ? void 0 : _b.length;
      },
      async () => {
        await nextTick();
        if (outputRef.value) {
          outputRef.value.scrollTop = outputRef.value.scrollHeight;
        }
      }
    );
    function parseCommandLine(input) {
      const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
      const parts = [];
      let match;
      while ((match = regex.exec(input)) !== null) {
        parts.push(match[1] || match[2] || match[0]);
      }
      if (parts.length === 0) return null;
      const cmdName = parts[0];
      const args = parts.slice(1);
      const cmdId = getCommandId(cmdName);
      return {
        cmdName,
        cmdId,
        args
      };
    }
    function getRawCommandAfterName(input, cmdName) {
      return String(input || "").slice(String(cmdName || "").length).replace(/^\s+/, "");
    }
    function handleKeyDown(e) {
      const history2 = consoleStore.commandHistory;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (history2.length === 0) return;
        if (historyIndex.value === -1) {
          historyTemp.value = commandInput.value;
        }
        if (historyIndex.value < history2.length - 1) {
          historyIndex.value++;
          commandInput.value = history2[history2.length - 1 - historyIndex.value];
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIndex.value > -1) {
          historyIndex.value--;
          if (historyIndex.value === -1) {
            commandInput.value = historyTemp.value;
          } else {
            commandInput.value = history2[history2.length - 1 - historyIndex.value];
          }
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (lastTabIndex.value === -1) {
          const input = commandInput.value.trim();
          if (!input || input.includes(" ")) return;
          lastTabPrefix.value = input.toLowerCase();
        }
        const commands = [
          ...getSupportedCommandNamesForOS(activeBeaconOs.value),
          ...getSupportedLocalCommandNamesForOS(activeBeaconOs.value)
        ];
        const prefix = lastTabPrefix.value;
        const matches = commands.filter((c) => c.startsWith(prefix)).sort();
        if (matches.length > 0) {
          lastTabIndex.value = (lastTabIndex.value + 1) % matches.length;
          commandInput.value = matches[lastTabIndex.value];
        }
      } else if (!["ArrowUp", "ArrowDown", "Tab", "Enter", "Shift", "Control", "Alt"].includes(e.key)) {
        historyIndex.value = -1;
        lastTabIndex.value = -1;
      }
    }
    function showHelp(specificCmd = null) {
      const bid = consoleStore.activeBeaconId;
      if (!bid) return;
      const getVisualWidth = (str) => {
        let width = 0;
        for (let i = 0; i < str.length; i++) {
          width += str.charCodeAt(i) > 255 ? 2 : 1;
        }
        return width;
      };
      const visualPadEnd = (str, target) => {
        const current = getVisualWidth(str);
        return str + (target > current ? " ".repeat(target - current) : "");
      };
      let helpContent = "\n--- 核心指令帮助 (Core Commands Help) ---\n";
      if (specificCmd) {
        const upperCmd = specificCmd.toUpperCase();
        const resolvedCmd = COMMAND_HELP_ALIASES[upperCmd] || upperCmd;
        const help = COMMAND_HELP[resolvedCmd] || LOCAL_COMMAND_HELP[upperCmd];
        if (help) {
          if (!isCommandAllowed(specificCmd)) {
            consoleStore.appendToConsole(bid, "error", getUnsupportedCommandMessage(specificCmd, activeBeaconOs.value));
            return;
          }
          helpContent += `用法: ${help.usage}
描述: ${help.desc}
注意: ${help.notes}
`;
        } else {
          consoleStore.appendToConsole(bid, "error", `未找到指令 "${specificCmd}" 的详细说明。`);
          return;
        }
      } else {
        getSupportedCommandHelpEntriesForOS(activeBeaconOs.value).forEach(([key, info]) => {
          const usage = visualPadEnd(info.usage, 45);
          helpContent += `  ${usage} - ${info.desc}
`;
        });
        getSupportedLocalCommandHelpEntriesForOS(activeBeaconOs.value).forEach(([key, info]) => {
          const usage = visualPadEnd(info.usage, 45);
          helpContent += `  ${usage} - ${info.desc}
`;
        });
        helpContent += "\n用法指引: 输入 help <command> 查看特定指令。";
      }
      helpContent += "\n-----------------------------------------\n";
      consoleStore.appendToConsole(bid, "output", helpContent);
    }
    function sendCommand2() {
      const rawInput = commandInput.value.trim();
      if (!rawInput || !consoleStore.activeBeaconId) return;
      const parsed = parseCommandLine(rawInput);
      if (!parsed) return;
      historyIndex.value = -1;
      if (["HELP", "帮助", "查看帮助"].includes(parsed.cmdName.toUpperCase())) {
        consoleStore.appendToConsole(consoleStore.activeBeaconId, "input", rawInput);
        showHelp(parsed.args[0]);
        commandInput.value = "";
        return;
      }
      if (parsed.cmdName.toLowerCase() === "exec-bof") {
        consoleStore.appendToConsole(consoleStore.activeBeaconId, "input", rawInput);
        if (!isCommandAllowed("exec-bof")) {
          consoleStore.appendToConsole(consoleStore.activeBeaconId, "error", getUnsupportedCommandMessage(parsed.cmdName, activeBeaconOs.value));
          commandInput.value = "";
          return;
        }
        modalStore.openExecuteModal(consoleStore.activeBeaconId, "bof");
        consoleStore.appendToConsole(consoleStore.activeBeaconId, "output", "已打开 BOF 执行窗口。");
        if (rawInput && consoleStore.commandHistory[consoleStore.commandHistory.length - 1] !== rawInput) {
          consoleStore.commandHistory.push(rawInput);
          if (consoleStore.commandHistory.length > 100) consoleStore.commandHistory.shift();
        }
        commandInput.value = "";
        historyIndex.value = -1;
        lastTabPrefix.value = "";
        lastTabIndex.value = -1;
        return;
      }
      if (parsed.cmdId === null) {
        consoleStore.appendToConsole(
          consoleStore.activeBeaconId,
          "error",
          `未知指令: "${parsed.cmdName}"。请检查输入或查看帮助。`
        );
        commandInput.value = "";
        return;
      }
      if (!isCommandAllowed(parsed.cmdId)) {
        consoleStore.appendToConsole(consoleStore.activeBeaconId, "input", rawInput);
        consoleStore.appendToConsole(consoleStore.activeBeaconId, "error", getUnsupportedCommandMessage(parsed.cmdName, activeBeaconOs.value));
        commandInput.value = "";
        return;
      }
      let finalArgs = parsed.args;
      if (parsed.cmdId === COMMAND_ID.SLEEP) {
        const timeRaw = parsed.args[0];
        const jitterRaw = parsed.args[1];
        if (!timeRaw) {
          consoleStore.appendToConsole(consoleStore.activeBeaconId, "input", rawInput);
          consoleStore.appendToConsole(consoleStore.activeBeaconId, "error", "【指令校验失败】sleep 指令至少需要一个时间参数 (ms)。用法: sleep <ms> [jitter]");
          commandInput.value = "";
          return;
        }
        const time = parseInt(timeRaw);
        if (isNaN(time) || time <= 0 || time > 6e4) {
          consoleStore.appendToConsole(consoleStore.activeBeaconId, "input", rawInput);
          consoleStore.appendToConsole(consoleStore.activeBeaconId, "error", `【指令校验失败】非法的时间参数 "${timeRaw}"，必须为 1-60000 之间的整数。`);
          commandInput.value = "";
          return;
        }
        let jitter = 0;
        if (jitterRaw) {
          jitter = parseInt(jitterRaw);
          if (isNaN(jitter) || jitter < 0 || jitter > 200) {
            consoleStore.appendToConsole(consoleStore.activeBeaconId, "input", rawInput);
            consoleStore.appendToConsole(consoleStore.activeBeaconId, "error", `【指令校验失败】非法的抖动比例 "${jitterRaw}"，必须在 0-200 之间。`);
            commandInput.value = "";
            return;
          }
        }
        finalArgs = [time, jitter];
      } else if ([COMMAND_ID.SHELL, COMMAND_ID.POWERSHELL].includes(parsed.cmdId)) {
        const rawCommand = getRawCommandAfterName(rawInput, parsed.cmdName);
        if (!rawCommand.trim()) {
          const cmdName = parsed.cmdName.toLowerCase();
          consoleStore.appendToConsole(consoleStore.activeBeaconId, "input", rawInput);
          consoleStore.appendToConsole(
            consoleStore.activeBeaconId,
            "error",
            `【指令校验失败】${cmdName} 指令需要提供一整条原始命令字符串。用法: ${cmdName} <raw_command>`
          );
          commandInput.value = "";
          return;
        }
        finalArgs = [rawCommand];
      } else if ([COMMAND_ID.KILLJOB, COMMAND_ID.KILL, COMMAND_ID.STEAL_TOKEN].includes(parsed.cmdId)) {
        const targetRaw = parsed.args[0];
        const targetId = parseInt(targetRaw);
        if (!targetRaw || isNaN(targetId) || targetId <= 0) {
          const cmdName = parsed.cmdName.toLowerCase();
          const label = parsed.cmdId === COMMAND_ID.KILLJOB ? "后台 job ID" : "目标进程 PID";
          const placeholder = parsed.cmdId === COMMAND_ID.KILLJOB ? "job_id" : "PID";
          consoleStore.appendToConsole(consoleStore.activeBeaconId, "input", rawInput);
          consoleStore.appendToConsole(
            consoleStore.activeBeaconId,
            "error",
            `【指令校验失败】${cmdName} 指令需要提供有效的${label}。用法: ${cmdName} <${placeholder}>`
          );
          commandInput.value = "";
          return;
        }
        finalArgs = [targetId];
      } else if (parsed.cmdId === COMMAND_ID.ZIP) {
        const sourcePath = String(parsed.args[0] || "").trim();
        const zipPath = String(parsed.args[1] || "").trim();
        const overwriteRaw = parsed.args[2];
        const includeRootRaw = parsed.args[3];
        if (!sourcePath || !zipPath) {
          consoleStore.appendToConsole(consoleStore.activeBeaconId, "input", rawInput);
          consoleStore.appendToConsole(
            consoleStore.activeBeaconId,
            "error",
            "【指令校验失败】zip 指令至少需要 source_path 和 zip_path。用法: zip <source_path> <zip_path> [overwrite] [include_root]"
          );
          commandInput.value = "";
          return;
        }
        const parseBinaryFlag = (value, fallback, label) => {
          if (value === void 0 || value === null || String(value).trim() === "") {
            return fallback;
          }
          const numeric = parseInt(String(value).trim(), 10);
          if (!Number.isInteger(numeric) || ![0, 1].includes(numeric)) {
            throw new Error(`【指令校验失败】${label} 只能是 0 或 1。`);
          }
          return numeric;
        };
        try {
          finalArgs = [
            sourcePath,
            zipPath,
            parseBinaryFlag(overwriteRaw, 0, "overwrite"),
            parseBinaryFlag(includeRootRaw, 1, "include_root")
          ];
        } catch (err) {
          consoleStore.appendToConsole(consoleStore.activeBeaconId, "input", rawInput);
          consoleStore.appendToConsole(consoleStore.activeBeaconId, "error", err.message || String(err));
          commandInput.value = "";
          return;
        }
      }
      consoleStore.sendCommand(
        consoleStore.activeBeaconId,
        parsed.cmdId,
        finalArgs,
        rawInput
      );
      commandInput.value = "";
    }
    function closeTab(e, beaconid) {
      e.stopPropagation();
      consoleStore.closeConsole(beaconid);
    }
    function getAgentLabel(beaconid) {
      if (!beaconid) return "Unknown";
      const agent2 = agentStore.getAgentById(beaconid);
      if (!agent2) return beaconid.substring(0, 8);
      return `${agent2.beaconid.substring(0, 8)}@${agent2.hostname}`;
    }
    function formatTimestamp(iso) {
      if (!iso) return "";
      const d = new Date(iso);
      return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
    return (_ctx, _cache) => {
      return unref(consoleStore).consolePanelVisible ? (openBlock(), createElementBlock("div", {
        key: 0,
        class: "console-panel",
        style: normalizeStyle({ height: panelHeight.value + "px" })
      }, [
        createBaseVNode("div", {
          class: "resize-handle",
          onMousedown: startDrag
        }, [..._cache[2] || (_cache[2] = [
          createBaseVNode("div", { class: "resize-indicator" }, null, -1)
        ])], 32),
        createBaseVNode("div", _hoisted_1$1, [
          createBaseVNode("div", _hoisted_2, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(unref(consoleStore).activeConsoles, (tab) => {
              return openBlock(), createElementBlock("div", {
                key: tab.beaconid,
                class: normalizeClass(["tab", { active: unref(consoleStore).activeBeaconId === tab.beaconid }]),
                onClick: ($event) => unref(consoleStore).setActiveConsole(tab.beaconid)
              }, [
                _cache[4] || (_cache[4] = createBaseVNode("span", {
                  class: "status-dot online",
                  style: { "width": "6px", "height": "6px" }
                }, null, -1)),
                createBaseVNode("span", _hoisted_4, toDisplayString(getAgentLabel(tab.beaconid)), 1),
                createBaseVNode("button", {
                  class: "tab-close",
                  onClick: ($event) => closeTab($event, tab.beaconid)
                }, [..._cache[3] || (_cache[3] = [
                  createBaseVNode("svg", {
                    width: "10",
                    height: "10",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    "stroke-width": "3"
                  }, [
                    createBaseVNode("line", {
                      x1: "18",
                      y1: "6",
                      x2: "6",
                      y2: "18"
                    }),
                    createBaseVNode("line", {
                      x1: "6",
                      y1: "6",
                      x2: "18",
                      y2: "18"
                    })
                  ], -1)
                ])], 8, _hoisted_5)
              ], 10, _hoisted_3);
            }), 128))
          ]),
          createBaseVNode("button", {
            class: "console-collapse",
            onClick: _cache[0] || (_cache[0] = ($event) => unref(consoleStore).consolePanelVisible = false),
            title: "收起控制台"
          }, [..._cache[5] || (_cache[5] = [
            createBaseVNode("svg", {
              width: "14",
              height: "14",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              "stroke-width": "2"
            }, [
              createBaseVNode("polyline", { points: "6 15 12 9 18 15" })
            ], -1)
          ])])
        ]),
        currentConsole.value ? (openBlock(), createElementBlock("div", _hoisted_6, [
          createBaseVNode("div", {
            class: "console-output user-select-text",
            ref_key: "outputRef",
            ref: outputRef
          }, [
            createBaseVNode("div", _hoisted_7, [
              createBaseVNode("span", _hoisted_8, "[ " + toDisplayString(getAgentLabel(unref(consoleStore).activeBeaconId)) + " ] 控制台已连接", 1)
            ]),
            (openBlock(true), createElementBlock(Fragment, null, renderList(currentConsole.value.history, (line, idx) => {
              return openBlock(), createElementBlock("div", {
                key: idx,
                class: normalizeClass(["console-line", "line-" + line.type])
              }, [
                createBaseVNode("span", _hoisted_9, toDisplayString(formatTimestamp(line.timestamp)), 1),
                line.type === "input" ? (openBlock(), createElementBlock("span", _hoisted_10, "❯")) : line.type === "error" ? (openBlock(), createElementBlock("span", _hoisted_11, "[!]")) : (openBlock(), createElementBlock("span", _hoisted_12, "[*]")),
                createBaseVNode("span", _hoisted_13, toDisplayString(line.content), 1)
              ], 2);
            }), 128))
          ], 512),
          createBaseVNode("div", _hoisted_14, [
            _cache[7] || (_cache[7] = createBaseVNode("span", { class: "input-prompt" }, "❯", -1)),
            withDirectives(createBaseVNode("input", {
              "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => commandInput.value = $event),
              class: "console-input",
              type: "text",
              placeholder: "输入命令 (Tab 补全, ↑↓ 历史, help 查看帮助)...",
              autocomplete: "off",
              spellcheck: "false",
              onKeydown: [
                withKeys(sendCommand2, ["enter"]),
                handleKeyDown
              ]
            }, null, 544), [
              [vModelText, commandInput.value]
            ]),
            createBaseVNode("button", {
              class: "send-btn",
              onClick: sendCommand2,
              disabled: !commandInput.value.trim()
            }, [..._cache[6] || (_cache[6] = [
              createBaseVNode("svg", {
                width: "14",
                height: "14",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                "stroke-width": "2.5"
              }, [
                createBaseVNode("line", {
                  x1: "22",
                  y1: "2",
                  x2: "11",
                  y2: "13"
                }),
                createBaseVNode("polygon", { points: "22 2 15 22 11 13 2 9 22 2" })
              ], -1)
            ])], 8, _hoisted_15)
          ])
        ])) : (openBlock(), createElementBlock("div", _hoisted_16, [..._cache[8] || (_cache[8] = [
          createBaseVNode("span", null, "选择一个标签查看控制台", -1)
        ])]))
      ], 4)) : createCommentVNode("", true);
    };
  }
};
const ConsolePanel = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-ee48e558"]]);
const _sfc_main$1 = {
  __name: "GlobalConsoleDock",
  setup(__props) {
    const consoleStore = useConsoleStore();
    const eventPanelStore = useEventPanelStore();
    const visible = computed(() => consoleStore.consolePanelVisible && consoleStore.activeConsoles.length > 0);
    const dockRight = computed(() => `${eventPanelStore.effectiveWidth}px`);
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        visible.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "global-console-dock",
          style: normalizeStyle({ right: dockRight.value })
        }, [
          createVNode(ConsolePanel)
        ], 4)) : createCommentVNode("", true)
      ]);
    };
  }
};
const GlobalConsoleDock = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-5c3cbfe4"]]);
const _hoisted_1 = { class: "root" };
const _sfc_main = {
  __name: "App",
  setup(__props) {
    const authStore = useAuthStore();
    const wsStore = useWSStore();
    const listenerStore = useListenerStore();
    const agentStore = useAgentStore();
    const pluginStore = usePluginStore();
    const themeStore = useThemeStore();
    const route = useRoute();
    themeStore.initTheme();
    watch(() => authStore.token, (newToken) => {
      if (newToken) {
        wsStore.connect();
        setTimeout(() => {
          listenerStore.fetchListeners().catch(() => {
          });
          agentStore.fetchAgents().catch(() => {
          });
          pluginStore.fetchPlugins().catch(() => {
          });
        }, 100);
      } else {
        wsStore.disconnect();
      }
    }, { immediate: true });
    const isLoginPage = computed(() => route.name === "Login");
    return (_ctx, _cache) => {
      const _component_RouterView = resolveComponent("RouterView");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(ToastContainer),
        createVNode(_sfc_main$3),
        !isLoginPage.value ? (openBlock(), createBlock(GlobalConsoleDock, { key: 0 })) : createCommentVNode("", true),
        _cache[0] || (_cache[0] = createBaseVNode("div", { class: "liquid-bg" }, [
          createBaseVNode("div", { class: "blob blob-1" }),
          createBaseVNode("div", { class: "blob blob-2" }),
          createBaseVNode("div", { class: "blob blob-3" })
        ], -1)),
        !isLoginPage.value ? (openBlock(), createBlock(Sidebar, { key: 1 })) : createCommentVNode("", true),
        createBaseVNode("div", {
          class: normalizeClass(["workspace", { "full-width": isLoginPage.value }])
        }, [
          createBaseVNode("main", {
            class: normalizeClass(["content", { "full-width": isLoginPage.value }])
          }, [
            (openBlock(), createBlock(_component_RouterView, {
              key: unref(route).fullPath
            }))
          ], 2),
          !isLoginPage.value ? (openBlock(), createBlock(EventPanel, { key: 0 })) : createCommentVNode("", true)
        ], 2)
      ]);
    };
  }
};
const App = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-87b5a165"]]);
const routes = [
  {
    path: "/",
    redirect: "/login"
  },
  {
    path: "/login",
    name: "Login",
    component: () => __vitePreload(() => import("./LoginPage-d_-LKDn_.js"), true ? __vite__mapDeps([0,1]) : void 0)
  },
  {
    path: "/dashboard",
    name: "Dashboard",
    component: () => __vitePreload(() => import("./DashboardPage-B_VDltEI.js"), true ? __vite__mapDeps([2,3,4,5]) : void 0)
  },
  {
    path: "/topology",
    name: "Topology",
    component: () => __vitePreload(() => import("./TopologyPage-B63-G9CB.js"), true ? __vite__mapDeps([6,3,4,7]) : void 0)
  },
  {
    path: "/listener",
    name: "Listener",
    component: () => __vitePreload(() => import("./ListenerPage-B4cdmFem.js"), true ? __vite__mapDeps([8,9]) : void 0)
  },
  {
    path: "/keylogger",
    redirect: "/dashboard"
  },
  {
    path: "/proxy",
    name: "ProxyPivot",
    component: () => __vitePreload(() => import("./ProxyPivotPage-BYOT3Q2p.js"), true ? __vite__mapDeps([10,11,12]) : void 0)
  },
  {
    path: "/screenshots",
    name: "Screenshots",
    component: () => __vitePreload(() => import("./ScreenshotsPage-7eJUhfpR.js"), true ? __vite__mapDeps([13,14,15]) : void 0)
  },
  {
    path: "/downloads",
    name: "Downloads",
    component: () => __vitePreload(() => import("./DownloadsPage-B88WwlX2.js"), true ? __vite__mapDeps([16,17]) : void 0)
  },
  {
    path: "/plugins",
    name: "Plugins",
    component: () => __vitePreload(() => import("./PluginsPage-CWy930a3.js"), true ? __vite__mapDeps([18,19]) : void 0)
  },
  {
    path: "/credentials",
    redirect: "/dashboard"
  },
  {
    path: "/help",
    name: "Help",
    component: () => __vitePreload(() => import("./HelpPage-jZqoSAtw.js"), true ? __vite__mapDeps([20,21]) : void 0)
  }
];
const router = createRouter({
  history: createWebHashHistory(),
  routes
});
router.beforeEach((to) => {
  const authStore = useAuthStore();
  if (to.name !== "Login" && !authStore.isLoggedIn) {
    return { name: "Login" };
  } else if (to.name === "Login" && authStore.isLoggedIn) {
    return { name: "Dashboard" };
  }
});
const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
export {
  COMMAND_HELP as $,
  reactive as A,
  watch as B,
  nextTick as C,
  isMenuActionSupportedForOS as D,
  normalizeBeaconArch as E,
  Fragment as F,
  normalizeBeaconPlatform as G,
  useModalStore as H,
  usePluginStore as I,
  sendExitCommand as J,
  useListenerStore as K,
  useNotificationStore as L,
  vModelSelect as M,
  GenerateBeaconModal as N,
  OpenURL as O,
  PLUGIN_COMMAND_ID as P,
  vModelCheckbox as Q,
  formatTunnelReason as R,
  SaveFile as S,
  Teleport as T,
  listDownloads as U,
  downloadFileBase64 as V,
  WriteBinaryFile as W,
  OpenFile as X,
  useThemeStore as Y,
  Browser as Z,
  _export_sfc as _,
  useWSStore as a,
  sendCommand as a0,
  request as a1,
  downloadBinaryBase64 as a2,
  defineStore as a3,
  pick as a4,
  toNumber as a5,
  createBaseVNode as b,
  createElementBlock as c,
  withDirectives as d,
  createTextVNode as e,
  createCommentVNode as f,
  unref as g,
  useRouter as h,
  useAgentStore as i,
  useConsoleStore as j,
  onMounted as k,
  login as l,
  onUnmounted as m,
  normalizeClass as n,
  openBlock as o,
  renderList as p,
  createBlock as q,
  ref as r,
  computed as s,
  toDisplayString as t,
  useAuthStore as u,
  vModelText as v,
  withModifiers as w,
  normalizeStyle as x,
  createVNode as y,
  createStaticVNode as z
};
