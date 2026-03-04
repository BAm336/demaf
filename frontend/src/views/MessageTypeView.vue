<template>
  <v-container fluid class="pa-6">
    <!-- Breadcrumb -->
    <v-breadcrumbs :items="breadcrumbs" class="pa-0 mb-4"/>

    <!-- En-tête -->
    <div class="d-flex align-center mb-6 flex-wrap ga-3">
      <div class="flex-grow-1">
        <div class="text-h5 font-weight-bold font-mono">{{ props.type }}</div>
        <div class="text-caption text-medium-emphasis">Flux de messages dans le SI</div>
      </div>
      <AutoRefreshControl :interval-sec="10" @refresh="load"/>
    </div>

    <v-row>
      <!-- Producteurs (OUTBOX) -->
      <v-col cols="12" md="6">
        <v-card border>
          <v-card-title class="d-flex align-center ga-2 text-body-1 font-weight-medium pa-4 pb-2">
            <v-icon color="primary" size="small">mdi-inbox-arrow-up</v-icon>
            Producteurs — OUTBOX
          </v-card-title>
          <v-data-table
            :headers="appHeaders"
            :items="summary?.producers ?? []"
            :loading="loading"
            item-value="application"
            density="comfortable"
            hide-default-footer
            hover
            @click:row="(_, { item }) => navigate(item.application)"
          >
            <template #no-data>
              <span class="text-caption text-medium-emphasis">Aucune application productrice pour ce type</span>
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
              <v-chip
                size="x-small"
                :color="item.EN_ERREUR > 0 ? 'error' : undefined"
                label
                variant="flat"
                :style="item.EN_ERREUR > 0 ? 'cursor:pointer' : ''"
                @click.stop="item.EN_ERREUR > 0 && navigate(item.application, 'EN_ERREUR')"
              >
                {{ item.EN_ERREUR }}
              </v-chip>
            </template>
          </v-data-table>
        </v-card>
      </v-col>

      <!-- Consommateurs (INBOX) -->
      <v-col cols="12" md="6">
        <v-card border>
          <v-card-title class="d-flex align-center ga-2 text-body-1 font-weight-medium pa-4 pb-2">
            <v-icon color="secondary" size="small">mdi-inbox-arrow-down</v-icon>
            Consommateurs — INBOX
          </v-card-title>
          <v-data-table
            :headers="appHeaders"
            :items="summary?.consumers ?? []"
            :loading="loading"
            item-value="application"
            density="comfortable"
            hide-default-footer
            hover
            @click:row="(_, { item }) => navigate(item.application)"
          >
            <template #no-data>
              <span class="text-caption text-medium-emphasis">Aucune application consommatrice pour ce type</span>
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
              <v-chip
                size="x-small"
                :color="item.EN_ERREUR > 0 ? 'error' : undefined"
                label
                variant="flat"
                :style="item.EN_ERREUR > 0 ? 'cursor:pointer' : ''"
                @click.stop="item.EN_ERREUR > 0 && navigate(item.application, 'EN_ERREUR')"
              >
                {{ item.EN_ERREUR }}
              </v-chip>
            </template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchMessageTypeSummary } from '../services/api.js'
import AutoRefreshControl from '../components/AutoRefreshControl.vue'

const props = defineProps({
  type: { type: String, required: true },
})

const router  = useRouter()
const loading = ref(false)
const summary = ref(null)

const breadcrumbs = computed(() => [
  { title: 'Accueil', to: '/' },
  { title: 'Types de messages' },
  { title: props.type },
])

const appHeaders = [
  { title: 'Application',   key: 'application',   sortable: false },
  { title: 'À traiter',     key: 'A_TRAITER',     align: 'center', sortable: false },
  { title: 'En traitement', key: 'EN_TRAITEMENT', align: 'center', sortable: false },
  { title: 'Traité',        key: 'TRAITE',        align: 'center', sortable: false },
  { title: 'En erreur',     key: 'EN_ERREUR',     align: 'center', sortable: false },
]

function navigate(appName, status = null) {
  const query = { type: props.type }
  if (status) query.status = status
  router.push({ name: 'messages', params: { appName }, query })
}

async function load() {
  loading.value = true
  try {
    summary.value = await fetchMessageTypeSummary(props.type)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
