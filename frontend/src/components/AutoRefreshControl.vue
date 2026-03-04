<template>
  <v-chip
    :color="paused ? 'grey' : 'success'"
    variant="tonal"
    size="small"
    class="mr-2 cursor-pointer"
    @click="toggle"
  >
    <v-icon start :icon="paused ? 'mdi-pause-circle' : 'mdi-refresh'"/>
    {{ paused ? 'Auto-refresh pausé' : `Auto-refresh ${intervalSec}s` }}
  </v-chip>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  intervalSec: { type: Number, default: 10 },
})

const emit = defineEmits(['refresh'])

const paused = ref(false)
let timer = null

function startTimer() {
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    if (!paused.value) emit('refresh')
  }, props.intervalSec * 1000)
}

function toggle() {
  paused.value = !paused.value
}

onMounted(startTimer)
onUnmounted(() => clearInterval(timer))
watch(() => props.intervalSec, startTimer)
</script>
