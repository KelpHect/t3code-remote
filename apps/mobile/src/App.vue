<template>
  <ion-app>
    <ion-menu content-id="main-content" type="overlay">
      <ion-header>
        <ion-toolbar>
          <ion-title>T3 Code</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="menu-content">
        <ion-searchbar aria-label="Search chats" class="menu-search" placeholder="Search" />

        <ion-list class="menu-list" lines="none">
          <ion-item button :detail="false">
            <ion-icon slot="start" :icon="addOutline" />
            <ion-label>New chat</ion-label>
          </ion-item>
          <ion-item button :detail="false" router-link="/settings" router-direction="forward">
            <ion-icon slot="start" :icon="settingsOutline" />
            <ion-label>Settings</ion-label>
          </ion-item>
          <ion-item>
            <ion-icon slot="start" :icon="wifiOutline" />
            <ion-label>
              <h2>Connection</h2>
              <p>{{ statusDetail }}</p>
            </ion-label>
            <ion-badge :color="selectedBackend ? 'success' : 'medium'">{{ statusText }}</ion-badge>
          </ion-item>
        </ion-list>

        <ion-list
          v-for="project in projects"
          :key="project.id"
          class="menu-list project-list"
          lines="none"
        >
          <ion-item-divider>
            <ion-label>{{ project.name }}</ion-label>
            <ion-badge color="primary">{{ project.threads.length }}</ion-badge>
          </ion-item-divider>
          <ion-item
            v-for="thread in project.threads"
            :key="thread.id"
            button
            :detail="false"
            class="thread-item"
          >
            <ion-icon slot="start" :icon="chatbubbleOutline" />
            <ion-label>
              <h2>{{ thread.title }}</h2>
              <p>{{ thread.summary }}</p>
            </ion-label>
            <ion-badge v-if="thread.active" color="success">Working</ion-badge>
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-menu>

    <ion-router-outlet id="main-content" />
  </ion-app>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import {
  IonApp,
  IonBadge,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonMenu,
  IonRouterOutlet,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import { addOutline, chatbubbleOutline, settingsOutline, wifiOutline } from "ionicons/icons";

import { useConnectionState } from "@/client/connectionState";
import { defaultSecretStore, loadAuthSession } from "@/client/secretStore";

const {
  selectedBackend,
  setAuthSession,
  startDiscoveryLoop,
  statusDetail,
  statusText,
  stopDiscoveryLoop,
} = useConnectionState();

onMounted(() => {
  void loadAuthSession(defaultSecretStore).then((session) => {
    if (!session) return;
    setAuthSession({
      backendUrl: session.backendUrl,
      bearerSession: session.bearerSession,
      webSocketToken: session.webSocketToken,
    });
  });
  startDiscoveryLoop();
});

onUnmounted(() => {
  stopDiscoveryLoop();
});

const projects = [
  {
    id: "t3code-remote",
    name: "t3code-remote",
    threads: [
      {
        id: "mobile-ui",
        title: "Mobile UI rebuild",
        summary: "Ionic Vue shell and chat surface",
        active: true,
      },
      {
        id: "backend-discovery",
        title: "Backend discovery",
        summary: "Emulator and private-network probes",
        active: false,
      },
    ],
  },
  {
    id: "lockwell",
    name: "lockwell",
    threads: [
      {
        id: "investigate-backend",
        title: "Investigate backend compatibility",
        summary: "Read-only protocol audit",
        active: false,
      },
    ],
  },
] as const;
</script>

<style scoped>
.menu-content {
  --padding-bottom: 1rem;
}

.menu-search {
  padding: 0.75rem;
}

.menu-list {
  padding: 0.25rem 0.75rem 0.75rem;
  background: transparent;
}

.menu-list ion-item {
  --border-radius: 0.8rem;
  --min-height: 3rem;
  margin-bottom: 0.25rem;
}

.project-list {
  padding-top: 0;
}

ion-item-divider {
  --background: transparent;
  --color: var(--ion-color-medium);
  --padding-start: 0.5rem;
  min-height: 2rem;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
}

.thread-item h2,
.thread-item p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
