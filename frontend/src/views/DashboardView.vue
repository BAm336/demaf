<template>
  <v-container fluid class="pa-6">
    <!-- Titre + contrôles partagés -->
    <div class="d-flex align-center mb-4 flex-wrap ga-3">
      <div class="flex-grow-1">
        <div class="text-h5 font-weight-bold">Tableau de bord</div>
        <div class="text-caption text-medium-emphasis">Supervision des flux asynchrones inbox / outbox</div>
      </div>

      <AutoRefreshControl :interval-sec="10" @refresh="load"/>

      <!-- Toggle colonnes (commun aux deux onglets) -->
      <v-menu :close-on-content-click="false">
        <template #activator="{ props: menuProps }">
          <v-btn v-bind="menuProps" variant="tonal" density="compact" prepend-icon="mdi-table-column" size="small">
            Colonnes
          </v-btn>
        </template>
        <v-list density="compact" min-width="200">
          <v-list-subheader>Afficher les statuts</v-list-subheader>
          <v-list-item v-for="col in STATUS_COLS" :key="col.key">
            <v-checkbox
              v-model="visibleStatuses"
              :value="col.key"
              :label="col.label"
              density="compact"
              hide-details
            />
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <!-- Onglets -->
    <v-tabs v-model="activeTab" class="mb-4" color="primary">
      <v-tab value="apps" prepend-icon="mdi-apps">Par application</v-tab>
      <v-tab value="types" prepend-icon="mdi-swap-horizontal">Par type de message</v-tab>
    </v-tabs>

    <v-window v-model="activeTab">

      <!-- ── Onglet Par application ────────────────────────────────────────── -->
      <v-window-item value="apps">
        <div class="d-flex justify-end mb-3">
          <v-select
            v-model="selectedApp"
            :items="appItems"
            item-title="displayName"
            item-value="name"
            label="Filtrer par application"
            clearable
            density="compact"
            style="max-width:260px"
            hide-details
            @update:model-value="load"
          />
        </div>

        <v-card border>
          <v-data-table
            :headers="appHeaders"
            :items="tableItems"
            :loading="loading"
            item-value="application"
            density="comfortable"
            hide-default-footer
            hover
            @click:row="(_, { item }) => navigateToMessages(item.application)"
          >
            <template v-if="loading && !tableItems.length" #body>
              <tr v-for="n in 6" :key="n">
                <td v-for="h in appHeaders" :key="h.key" class="py-3">
                  <v-skeleton-loader type="text" width="80%"/>
                </td>
              </tr>
            </template>

            <template #item.application="{ item }">
              <div class="font-weight-medium">{{ item.application }}</div>
              <div class="text-caption text-medium-emphasis">{{ ROLE_LABELS[item.role] }}</div>
            </template>

            <!-- Inbox -->
            <template #item.inbox_A_TRAITER="{ item }">
              <CounterCell :value="item.inbox_A_TRAITER" status="A_TRAITER" :connection-error="item.connectionError" :app-name="item.application"/>
            </template>
            <template #item.inbox_EN_TRAITEMENT="{ item }">
              <CounterCell :value="item.inbox_EN_TRAITEMENT" status="EN_TRAITEMENT" :connection-error="item.connectionError" :app-name="item.application"/>
            </template>
            <template #item.inbox_TRAITE="{ item }">
              <CounterCell :value="item.inbox_TRAITE" status="TRAITE" :connection-error="item.connectionError" :app-name="item.application"/>
            </template>
            <template #item.inbox_EN_ERREUR="{ item }">
              <CounterCell :value="item.inbox_EN_ERREUR" status="EN_ERREUR" :connection-error="item.connectionError" :app-name="item.application"/>
            </template>

            <!-- Outbox -->
            <template #item.outbox_A_TRAITER="{ item }">
              <CounterCell :value="item.outbox_A_TRAITER" status="A_TRAITER" :connection-error="item.connectionError" :app-name="item.application"/>
            </template>
            <template #item.outbox_EN_TRAITEMENT="{ item }">
              <CounterCell :value="item.outbox_EN_TRAITEMENT" status="EN_TRAITEMENT" :connection-error="item.connectionError" :app-name="item.application"/>
            </template>
            <template #item.outbox_TRAITE="{ item }">
              <CounterCell :value="item.outbox_TRAITE" status="TRAITE" :connection-error="item.connectionError" :app-name="item.application"/>
            </template>
            <template #item.outbox_EN_ERREUR="{ item }">
              <CounterCell :value="item.outbox_EN_ERREUR" status="EN_ERREUR" :connection-error="item.connectionError" :app-name="item.application"/>
            </template>
          </v-data-table>
        </v-card>
      </v-window-item>

      <!-- ── Onglet Par type de message ────────────────────────────────────── -->
      <v-window-item value="types">
        <v-card border>
          <v-data-table
            :headers="typeHeaders"
            :items="messageTypeItems"
            :loading="loading"
            item-value="type"
            density="comfortable"
            hide-default-footer
            hover
            @click:row="(_, { item }) => navigateToType(item.type)"
          >
            <template v-if="loading && !messageTypeItems.length" #body>
              <tr v-for="n in 8" :key="n">
                <td v-for="h in typeHeaders" :key="h.key" class="py-3">
                  <v-skeleton-loader type="text" width="80%"/>
                </td>
              </tr>
            </template>

            <template #item.type="{ item }">
              <span class="font-weight-medium font-mono text-body-2">{{ item.type }}</span>
            </template>
            <template #item.A_TRAITER="{ item }">
              <v-chip size="x-small" :color="item.A_TRAITER > 0 ? 'info' : undefined" label variant="flat">
                {{ item.A_TRAITER }}
              </v-chip>
            </template>
            <template #item.EN_TRAITEMENT="{ item }">
              <v-chip size="x-small" :color="item.EN_TRAITEMENT > 0 ? 'warning' : undefined" label variant="flat">
                {{ item.EN_TRAITEMENT }}
              </v-chip>
            </template>
            <template #item.TRAITE="{ item }">
              <v-chip size="x-small" :color="item.TRAITE > 0 ? 'success' : undefined" label variant="flat">
                {{ item.TRAITE }}
              </v-chip>
            </template>
            <template #item.EN_ERREUR="{ item }">
              <v-chip size="x-small" :color="item.EN_ERREUR > 0 ? 'error' : undefined" label variant="flat">
                {{ item.EN_ERREUR }}
              </v-chip>
            </template>
          </v-data-table>
        </v-card>
      </v-window-item>

    </v-window>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchApplications, fetchSummary, fetchMessageTypesSummary } from '../services/api.js'
import AutoRefreshControl from '../components/AutoRefreshControl.vue'
import CounterCell from '../components/CounterCell.vue'

// ── Constantes ────────────────────────────────────────────────────────────────
const STATUS_COLS = [
  { key: 'A_TRAITER',     label: 'À traiter'    },
  { key: 'EN_TRAITEMENT', label: 'En traitement' },
  { key: 'TRAITE',        label: 'Traité'        },
  { key: 'EN_ERREUR',     label: 'En erreur'     },
]

const ROLE_LABELS = {
  producer: 'Producteur (outbox)',
  consumer: 'Consommateur (inbox)',
  both:     'Producteur & consommateur',
}

// ── Colonnes visibles — par défaut : TRAITE et EN_ERREUR ──────────────────────
const visibleStatuses = ref(['TRAITE', 'EN_ERREUR'])

// ── En-têtes onglet "Par application" ─────────────────────────────────────────
const ALL_APP_HEADERS = [
  { title: 'Application',              key: 'application',        sortable: true, alwaysVisible: true },
  { title: 'Inbox — À traiter',        key: 'inbox_A_TRAITER',     align: 'center', status: 'A_TRAITER'     },
  { title: 'Inbox — En traitement',    key: 'inbox_EN_TRAITEMENT', align: 'center', status: 'EN_TRAITEMENT'  },
  { title: 'Inbox — Traité',           key: 'inbox_TRAITE',        align: 'center', status: 'TRAITE'         },
  { title: 'Inbox — En erreur',        key: 'inbox_EN_ERREUR',     align: 'center', status: 'EN_ERREUR'      },
  { title: 'Outbox — À traiter',       key: 'outbox_A_TRAITER',    align: 'center', status: 'A_TRAITER'      },
  { title: 'Outbox — En traitement',   key: 'outbox_EN_TRAITEMENT',align: 'center', status: 'EN_TRAITEMENT'  },
  { title: 'Outbox — Traité',          key: 'outbox_TRAITE',       align: 'center', status: 'TRAITE'         },
  { title: 'Outbox — En erreur',       key: 'outbox_EN_ERREUR',    align: 'center', status: 'EN_ERREUR'      },
]

const appHeaders = computed(() =>
  ALL_APP_HEADERS.filter(h => h.alwaysVisible || visibleStatuses.value.includes(h.status))
)

// ── En-têtes onglet "Par type de message" ─────────────────────────────────────
const typeHeaders = computed(() => [
  { title: 'Type de message', key: 'type', sortable: true },
  ...STATUS_COLS
    .filter(c => visibleStatuses.value.includes(c.key))
    .map(c => ({ title: c.label, key: c.key, align: 'center', sortable: false })),
])

// ── State ─────────────────────────────────────────────────────────────────────
const router           = useRouter()
const activeTab        = ref('apps')
const applications     = ref([])
const summaries        = ref([])
const messageTypeItems = ref([])
const loading          = ref(false)
const selectedApp      = ref(null)

const appItems = computed(() => [
  { name: null, displayName: 'Toutes les applications' },
  ...applications.value,
])

const tableItems = computed(() =>
  summaries.value.map(s => ({
    application:          s.application,
    role:                 s.role ?? 'both',
    connectionError:      !!s.connectionError,
    inbox_A_TRAITER:      s.inbox  ? s.inbox.A_TRAITER     : null,
    inbox_EN_TRAITEMENT:  s.inbox  ? s.inbox.EN_TRAITEMENT  : null,
    inbox_TRAITE:         s.inbox  ? s.inbox.TRAITE         : null,
    inbox_EN_ERREUR:      s.inbox  ? s.inbox.EN_ERREUR      : null,
    outbox_A_TRAITER:     s.outbox ? s.outbox.A_TRAITER     : null,
    outbox_EN_TRAITEMENT: s.outbox ? s.outbox.EN_TRAITEMENT : null,
    outbox_TRAITE:        s.outbox ? s.outbox.TRAITE        : null,
    outbox_EN_ERREUR:     s.outbox ? s.outbox.EN_ERREUR     : null,
  }))
)

// ── Navigation ────────────────────────────────────────────────────────────────
function navigateToMessages(appName) {
  router.push({ name: 'messages', params: { appName }, query: { status: 'EN_ERREUR' } })
}

function navigateToType(type) {
  router.push({ name: 'message-type-detail', params: { type } })
}

// ── Chargement ────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  try {
    const [apps, sums, types] = await Promise.all([
      fetchApplications(),
      fetchSummary(selectedApp.value),
      fetchMessageTypesSummary(),
    ])
    applications.value     = apps
    summaries.value        = sums
    messageTypeItems.value = types
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
