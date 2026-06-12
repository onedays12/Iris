<script setup>
defineProps({
  name: { type: String, default: 'dashboard' },
  size: { type: [Number, String], default: 28 },
  strokeWidth: { type: [Number, String], default: 2 },
})
</script>

<template>
  <svg
    class="page-title-icon"
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    aria-hidden="true"
  >
    <g v-if="name === 'dashboard'">
      <path d="M6.5 7.5h19c1.4 0 2.5 1 2.5 2.4v10.2c0 1.4-1.1 2.4-2.5 2.4h-19C5.1 22.5 4 21.5 4 20.1V9.9c0-1.4 1.1-2.4 2.5-2.4Z" />
      <path d="M12 26h8" />
      <path d="M16 22.5V26" />
      <path d="M8 11.5h16" />
    </g>

    <g v-else-if="name === 'topology'">
      <circle cx="16" cy="6.5" r="3.2" />
      <circle cx="7.5" cy="25" r="3.2" />
      <circle cx="24.5" cy="25" r="3.2" />
      <path d="M14.7 9.6C12.4 14.8 10.3 19 8.9 22" />
      <path d="M17.3 9.6c2.4 5.2 4.4 9.4 5.8 12.4" />
    </g>

    <g v-else-if="name === 'listener'">
      <path d="M8.5 11.5c4.1-4.2 10.9-4.2 15 0" />
      <path d="M11.8 15c2.3-2.3 6.1-2.3 8.4 0" />
      <circle cx="16" cy="20" r="2.8" />
      <path d="M16 22.8v5" />
      <path d="M12.5 28h7" />
    </g>

    <g v-else-if="name === 'proxy'">
      <path d="M5 10h7.5c3.1 0 5.2 1.9 5.2 4.7s-2.1 4.7-5.2 4.7H9.8" />
      <path d="M27 22h-7.5c-3.1 0-5.2-1.9-5.2-4.7s2.1-4.7 5.2-4.7h2.7" />
      <path d="M10.5 19.3 21.5 12.7" />
      <circle cx="5" cy="10" r="2.2" />
      <circle cx="27" cy="22" r="2.2" />
    </g>

    <g v-else-if="name === 'screenshots'">
      <rect x="5" y="7" width="22" height="18" rx="3" />
      <circle cx="12" cy="13" r="2" />
      <path d="M6.5 22 13 16.2l4.4 3.6 3.2-2.8L26 22" />
    </g>

    <g v-else-if="name === 'downloads'">
      <path d="M16 4.5v15" />
      <path d="m10.5 14.5 5.5 5.7 5.5-5.7" />
      <path d="M6.5 23.5v4h19v-4" />
    </g>

    <g v-else-if="name === 'plugins'">
      <path d="M15 5.5h5.5v6h3.2c2.3 0 4.1 1.8 4.1 4s-1.8 4-4.1 4h-3.2v7H12v-7H8.5c-2.3 0-4.1-1.8-4.1-4s1.8-4 4.1-4H12v-6h3Z" />
    </g>

    <g v-else-if="name === 'help'">
      <circle cx="16" cy="16" r="11" />
      <path d="M11.8 12.5c.7-2.7 2.9-4.1 5.5-3.5 2.3.5 3.9 2.4 3.5 4.7-.3 2-1.8 3-3.4 4-1.1.8-1.6 1.4-1.6 2.8" />
      <path d="M16 24.4h.1" />
    </g>

    <g v-else>
      <path d="M16 4.5c4.2 4.2 8.5 8.5 8.5 12.5S20.2 25.5 16 29.5C11.8 25.5 7.5 21.2 7.5 17S11.8 8.7 16 4.5Z" />
      <circle cx="16" cy="16" r="2.5" class="icon-fill" />
    </g>
  </svg>
</template>

<style scoped>
.page-title-icon {
  flex: 0 0 auto;
  color: var(--color-primary);
  overflow: visible;
}

.page-title-icon * {
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.icon-fill {
  fill: currentColor;
  opacity: 0.18;
}
</style>
