<template>
  <v-app>
    <v-app-bar color="primary" elevation="0">
      <v-app-bar-title>
        <router-link to="/" class="text-white text-decoration-none font-weight-bold">
          DEMAF
        </router-link>
        <span class="text-caption ml-2 opacity-70">Supervision des flux asynchrones</span>
      </v-app-bar-title>
      <template #append>
        <v-chip size="small" color="white" variant="tonal" class="mr-4">
          <v-icon start icon="mdi-circle" color="success" size="x-small"/>
          MSW actif
        </v-chip>
      </template>
    </v-app-bar>

    <v-main>
      <router-view/>
    </v-main>
  </v-app>
</template>
