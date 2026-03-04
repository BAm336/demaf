<template>
  <v-container fluid class="pa-6">
    <!-- Breadcrumb -->
    <v-breadcrumbs :items="breadcrumbs" class="pa-0 mb-4"/>

    <!-- Titre + contrôles -->
    <div class="d-flex align-center mb-4 flex-wrap ga-3">
      <div class="flex-grow-1">
        <div class="text-h5 font-weight-bold">{{ props.appName }}</div>
        <div class="text-caption text-medium-emphasis">Supervision des flux asynchrones</div>
      </div>

      <AutoRefreshControl :interval-sec="10" @refresh="load"/>

      <!-- Filtre type (multi-sélection) -->
      <v-select
        v-model="selectedTypes"
        :items="availableTypes"
        label="Types de messages"
        multiple
        clearable
        density="compact"
        style="max-width:260px"
        hide-details
        @update:model-value="() => { page = 1; load() }"
      >
        <template #selection="{ item, index }">
          <v-chip v-if="index < 2" size="x-small" label class="mr-1">{{ item.title }}</v-chip>
          <span v-if="index === 2" class="text-caption text-medium-emphasis">
            +{{ selectedTypes.length - 2 }}
          </span>
        </template>
      </v-select>

      <!-- Rejeu par lot (sélection courante) -->
      <v-btn
        color="warning"
        variant="flat"
        prepend-icon="mdi-replay"
        :disabled="selected.length === 0"
        :loading="replayingBatch"
        @click="batchDialog = true"
      >
        Rejouer la sélection ({{ selected.length }})
      </v-btn>

      <!-- Rejeu par filtre (tous les résultats filtrés) -->
      <v-btn
        v-if="hasActiveFilter && total > 0"
        color="error"
        variant="flat"
        prepend-icon="mdi-replay-all"
        :loading="replayingFilter"
        @click="filterDialog = true"
      >
        Rejouer tous les résultats ({{ total }})
      </v-btn>
    </div>

    <!-- Filtre direction INBOX / OUTBOX — visible uniquement si les deux existent -->
    <div v-if="showDirFilter" class="d-flex align-center ga-3 mb-4">
      <v-btn-toggle
        v-model="selectedDirection"
        color="primary"
        rounded="pill"
        density="comfortable"
        @update:model-value="() => { page = 1; load() }"
      >
        <v-btn value="INBOX" prepend-icon="mdi-inbox-arrow-down" variant="tonal">
          Inbox
        </v-btn>
        <v-btn value="OUTBOX" prepend-icon="mdi-inbox-arrow-up" variant="tonal">
          Outbox
        </v-btn>
      </v-btn-toggle>
      <span v-if="!selectedDirection" class="text-caption text-medium-emphasis">Tous les flux</span>
    </div>

    <!-- Filtre statuts — badges cumulables -->
    <div class="d-flex align-center ga-2 mb-4 flex-wrap">
      <span class="text-caption text-medium-emphasis">Statut :</span>
      <v-chip
        v-for="s in STATUS_OPTIONS"
        :key="s.value"
        :color="selectedStatuses.includes(s.value) ? s.color : undefined"
        :variant="selectedStatuses.includes(s.value) ? 'flat' : 'tonal'"
        size="small"
        label
        style="cursor:pointer"
        @click="toggleStatus(s.value)"
      >
        {{ s.label }}
      </v-chip>
      <v-btn
        v-if="selectedStatuses.length > 0"
        variant="text"
        size="x-small"
        icon="mdi-close"
        @click="clearStatuses"
      />
    </div>

    <!-- Table -->
    <v-card border>
      <v-data-table
        v-model="selected"
        :headers="headers"
        :items="messages"
        :loading="loading"
        item-value="id"
        show-select
        density="comfortable"
        :items-per-page="pageSize"
        :items-length="total"
        @update:page="p => { page = p; load() }"
        @click:row="(_, { item }) => openDrawer(item)"
      >
        <template #item.statut="{ item }">
          <StatusChip :status="item.statut"/>
        </template>
        <template #item.timestamp="{ item }">
          {{ new Date(item.timestamp).toLocaleString('fr-FR') }}
        </template>
        <template #item.nbRejeux="{ item }">
          <v-chip size="x-small" :color="item.nbRejeux > 0 ? 'warning' : 'default'" label>
            {{ item.nbRejeux }}
          </v-chip>
        </template>
      </v-data-table>
    </v-card>

    <!-- Drawer détail -->
    <MessageDetailDrawer
      v-model="drawerOpen"
      :message="selectedMessage"
      @replayed="onReplayed"
    />

    <!-- Dialog rejeu par filtre -->
    <v-dialog v-model="filterDialog" max-width="480">
      <v-card>
        <v-card-title class="text-h6">Rejouer tous les résultats filtrés</v-card-title>
        <v-card-text>
          <p class="mb-3">
            Vous allez rejouer <strong>{{ total }} message(s)</strong> correspondant aux filtres actifs :
          </p>
          <v-chip
            v-for="s in selectedStatuses" :key="s"
            size="small" label class="mr-2 mb-2"
            :color="STATUS_OPTIONS.find(o => o.value === s)?.color"
          >
            {{ STATUS_OPTIONS.find(o => o.value === s)?.label }}
          </v-chip>
          <v-chip v-for="t in selectedTypes" :key="t" size="small" label class="mr-2 mb-2" color="info">
            {{ t }}
          </v-chip>
          <v-alert type="warning" variant="tonal" density="compact" class="mt-3" icon="mdi-alert">
            Cette action s'applique à <strong>tous</strong> les messages correspondants, pas seulement ceux affichés sur cette page.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn variant="text" @click="filterDialog = false">Annuler</v-btn>
          <v-btn color="error" variant="flat" :loading="replayingFilter" @click="doFilterReplay">
            Confirmer ({{ total }})
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog batch -->
    <v-dialog v-model="batchDialog" max-width="420">
      <v-card>
        <v-card-title class="text-h6">Rejouer la sélection</v-card-title>
        <v-card-text>
          Vous allez rejouer <strong>{{ selected.length }}</strong> message(s).
          Leur statut passera à <strong>A_TRAITER</strong>.
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn variant="text" @click="batchDialog = false">Annuler</v-btn>
          <v-btn color="warning" variant="flat" :loading="replayingBatch" @click="doBatchReplay">
            Confirmer
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchMessages, fetchMessageTypes, replayBatch, replayByFilter } from '../services/api.js'
import AutoRefreshControl  from '../components/AutoRefreshControl.vue'
import StatusChip          from '../components/StatusChip.vue'
import MessageDetailDrawer from '../components/MessageDetailDrawer.vue'

const props = defineProps({
  appName:       { type: String, required: true },
  initialStatus: { type: String, default: null },
  initialType:   { type: String, default: null },
})

// ── Constantes ────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'A_TRAITER',     label: 'À traiter',     color: 'info'    },
  { value: 'EN_TRAITEMENT', label: 'En traitement',  color: 'warning' },
  { value: 'TRAITE',        label: 'Traité',         color: 'success' },
  { value: 'EN_ERREUR',     label: 'En erreur',      color: 'error'   },
]

// ── State ─────────────────────────────────────────────────────────────────────
const messages         = ref([])
const total            = ref(0)
const page             = ref(1)
const pageSize         = ref(50)
const loading          = ref(false)
const selected         = ref([])
const selectedStatuses = ref(props.initialStatus ? [props.initialStatus] : [])
const selectedDirection = ref(null)   // null | 'INBOX' | 'OUTBOX'
const selectedTypes    = ref(props.initialType ? [props.initialType] : [])
const availableTypes   = ref([])
const appRole          = ref('both')  // 'both' | 'producer' | 'consumer'

const drawerOpen      = ref(false)
const selectedMessage = ref(null)

const batchDialog    = ref(false)
const replayingBatch = ref(false)

const filterDialog    = ref(false)
const replayingFilter = ref(false)

const hasActiveFilter  = computed(() => selectedStatuses.value.length > 0 || selectedTypes.value.length > 0 || !!selectedDirection.value)
const showDirFilter    = computed(() => appRole.value === 'both')

// ── Static data ───────────────────────────────────────────────────────────────
const breadcrumbs = computed(() => [
  { title: 'Accueil', to: '/' },
  { title: props.appName },
  { title: 'Messages' },
])

const headers = [
  { title: 'ID',          key: 'id',          sortable: false },
  { title: 'Utilisateur', key: 'utilisateur', sortable: false },
  { title: 'Horodatage',  key: 'timestamp',   sortable: false },
  { title: 'Type',        key: 'type',        sortable: false },
  { title: 'Direction',   key: 'direction',   sortable: false },
  { title: 'Statut',      key: 'statut',      sortable: false },
  { title: 'Nb rejeux',   key: 'nbRejeux',    sortable: false, align: 'center' },
]

// ── Actions ───────────────────────────────────────────────────────────────────
function toggleStatus(value) {
  const idx = selectedStatuses.value.indexOf(value)
  if (idx === -1) selectedStatuses.value.push(value)
  else selectedStatuses.value.splice(idx, 1)
  page.value = 1
  load()
}

function clearStatuses() {
  selectedStatuses.value = []
  page.value = 1
  load()
}

async function load() {
  loading.value = true
  try {
    const result = await fetchMessages(props.appName, {
      statuses:  selectedStatuses.value,
      direction: selectedDirection.value,
      types:     selectedTypes.value,
      page:      page.value,
      pageSize:  pageSize.value,
    })
    messages.value = result.items
    total.value    = result.total
    selected.value = []
  } finally {
    loading.value = false
  }
}

function openDrawer(message) {
  selectedMessage.value = message
  drawerOpen.value = true
}

function onReplayed(updated) {
  const idx = messages.value.findIndex(m => m.id === updated.id)
  if (idx !== -1) messages.value[idx] = { ...messages.value[idx], ...updated }
}

async function doFilterReplay() {
  replayingFilter.value = true
  try {
    await replayByFilter(props.appName, {
      statuses: selectedStatuses.value,
      types:    selectedTypes.value,
    })
    filterDialog.value = false
    page.value = 1
    await load()
  } finally {
    replayingFilter.value = false
  }
}

async function doBatchReplay() {
  replayingBatch.value = true
  try {
    const result = await replayBatch(props.appName, selected.value)
    for (const updated of result.messages) {
      const idx = messages.value.findIndex(m => m.id === updated.id)
      if (idx !== -1) messages.value[idx] = { ...messages.value[idx], ...updated }
    }
    batchDialog.value = false
    selected.value    = []
  } finally {
    replayingBatch.value = false
  }
}

onMounted(async () => {
  const meta = await fetchMessageTypes(props.appName)
  availableTypes.value = meta.types
  appRole.value        = meta.role
  await load()
})
</script>
