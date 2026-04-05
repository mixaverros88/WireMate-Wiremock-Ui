<script setup lang="ts">
withDefaults(defineProps<{
  size?: number
}>(), {
  size: 32
})
</script>

<template>
  <svg
    :width="size * (102 / 64)"
    :height="size"
    viewBox="0 0 102 64"
    xmlns="http://www.w3.org/2000/svg"
    class="wiremate-logo"
    aria-hidden="true"
    focusable="false"
  >
    <!-- Wire -->
    <line x1="6" y1="32" x2="20" y2="32" stroke="#34d399" stroke-width="4.5" stroke-linecap="round" class="wire wire-draw" style="--len:14"/>
    <circle cx="6" cy="32" r="6" fill="#34d399" class="node" style="--delay:0s"/>

    <!-- Connector body -->
    <rect x="20" y="0" width="56" height="64" rx="11" fill="none" stroke="#34d399" stroke-width="3.5" class="wire wire-draw" style="--len:240;--delay:0.1s"/>

    <!-- Inner status dot -->
    <circle cx="38" cy="32" r="8" fill="#34d399" opacity="0.2" class="node" style="--delay:0.3s"/>
    <circle cx="38" cy="32" r="3.8" fill="#34d399" class="node" style="--delay:0.35s"/>

    <!-- Pins -->
    <rect x="76" y="13" width="26" height="10" rx="4.5" fill="#34d399" class="node" style="--delay:0.45s"/>
    <rect x="76" y="41" width="26" height="10" rx="4.5" fill="#34d399" class="node" style="--delay:0.55s"/>
  </svg>
</template>

<style scoped>
.wire-draw {
  stroke-dasharray: calc(var(--len) * 1px);
  stroke-dashoffset: calc(var(--len) * 1px);
  animation: draw 0.6s ease-out forwards;
  animation-delay: var(--delay, 0s);
}

@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}

.node {
  opacity: 0;
  animation: pop 0.3s ease-out forwards;
  animation-delay: var(--delay, 0s);
}

@keyframes pop {
  0% {
    opacity: 0;
    transform: scale(0);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
