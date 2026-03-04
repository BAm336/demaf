<template>
  <span v-if="connectionError" class="text-medium-emphasis text-caption">N/A</span>
  <span v-else-if="value === null" class="text-medium-emphasis text-caption">—</span>
  <v-chip
    v-else
    :color="value > 0 ? color : undefined"
    size="x-small"
    label
    variant="flat"
    :style="isClickable ? 'cursor:pointer' : ''"
    @click.stop="navigate"
  >{{ value }}</v-chip>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  value:           { default: null }, // Number | null (null = direction non applicable)
  status:          { type: String, required: true },
  connectionError: { type: Boolean, default: false },
  appName:         { type: String, required: true },
})

const router = useRouter()

const colorMap = {
  EN_ERREUR: 'error', EN_TRAITEMENT: 'warning', A_TRAITER: 'info', TRAITE: 'success',
}

const color       = computed(() => colorMap[props.status] ?? 'grey')
const isClickable = computed(() => props.status === 'EN_ERREUR' && !props.connectionError && props.value > 0)

function navigate() {
  if (!isClickable.value) return
  router.push({ name: 'messages', params: { appName: props.appName }, query: { status: props.status } })
}
</script>
