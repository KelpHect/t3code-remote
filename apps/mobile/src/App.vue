<template>
  <ion-app>
    <ion-menu content-id="main-content" type="overlay" class="t3-menu">
      <ion-header class="menu-header">
        <ion-toolbar>
          <ion-title>
            <span class="brand-mark">T3</span>
            <span class="brand-muted">Code</span>
            <span class="nightly-pill">Nightly</span>
          </ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="menu-content">
        <ion-searchbar aria-label="Search chats" class="menu-search" placeholder="Search" />

        <ion-list class="menu-actions" lines="none">
          <ion-item button :detail="false" class="action-row">
            <ion-icon slot="start" :icon="addOutline" />
            <ion-label>New chat</ion-label>
          </ion-item>
          <ion-item
            button
            :detail="false"
            class="action-row"
            router-link="/settings"
            router-direction="forward"
          >
            <ion-icon slot="start" :icon="settingsOutline" />
            <ion-label>Settings</ion-label>
          </ion-item>
          <ion-item class="connection-row">
            <ion-icon slot="start" :icon="wifiOutline" />
            <ion-label>
              <h2>Connection</h2>
              <p>{{ statusDetail }}</p>
            </ion-label>
            <span class="connection-state" :class="{ online: selectedBackend }">
              {{ statusText }}
            </span>
          </ion-item>
        </ion-list>

        <ion-list v-for="project in projects" :key="project.id" class="project-list" lines="none">
          <div class="project-heading">
            <ion-icon :icon="chevronDownOutline" />
            <ion-icon :icon="folderOutline" />
            <span>{{ project.name }}</span>
            <span class="thread-count">{{ project.threads.length }}</span>
          </div>
          <ion-item
            v-for="thread in project.threads"
            :key="thread.id"
            button
            :detail="false"
            class="thread-item"
            :class="{ active: thread.active }"
          >
            <span class="thread-rail" :class="{ working: thread.active }" aria-hidden="true" />
            <ion-label>
              <span class="thread-title-row">
                <span class="thread-title">{{ thread.title }}</span>
                <span class="thread-time">{{ thread.time }}</span>
              </span>
              <span class="thread-summary">{{ thread.summary }}</span>
            </ion-label>
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
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonRouterOutlet,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import {
  addOutline,
  chevronDownOutline,
  folderOutline,
  settingsOutline,
  wifiOutline,
} from "ionicons/icons";

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
        time: "now",
      },
      {
        id: "backend-discovery",
        title: "Backend discovery",
        summary: "Emulator and private-network probes",
        active: false,
        time: "12m",
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
        time: "29m",
      },
    ],
  },
] as const;
</script>

<style scoped>
.t3-menu {
  --background: #202020;
  --width: min(19.5rem, 86vw);
}

.menu-header ion-toolbar {
  --background: #202020;
  --border-color: rgba(255, 255, 255, 0.06);
  --color: #f4f4f5;
  --min-height: 3.65rem;
}

.menu-header ion-title {
  font-size: 0.95rem;
  letter-spacing: 0;
}

.brand-mark {
  color: #ffffff;
  font-weight: 760;
}

.brand-muted {
  color: #a1a1aa;
  font-weight: 650;
  margin-left: 0.15rem;
}

.nightly-pill {
  display: inline-grid;
  place-items: center;
  margin-left: 0.45rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: #71717a;
  font-size: 0.52rem;
  font-weight: 750;
  height: 1rem;
  padding: 0 0.4rem;
  text-transform: uppercase;
}

.menu-content {
  --background: #202020;
  --padding-bottom: 1rem;
}

.menu-search {
  --background: #1b1b1b;
  --box-shadow: none;
  --border-radius: 0.55rem;
  --color: #d4d4d8;
  --icon-color: #71717a;
  --placeholder-color: #71717a;
  --placeholder-opacity: 1;
  padding: 0.75rem 0.85rem 0.5rem;
}

.menu-actions,
.project-list {
  padding: 0.25rem 0.85rem 0.65rem;
  background: transparent;
}

.menu-actions ion-item,
.project-list ion-item {
  --background: transparent;
  --background-activated: rgba(255, 255, 255, 0.06);
  --background-focused: rgba(255, 255, 255, 0.06);
  --background-hover: rgba(255, 255, 255, 0.05);
  --border-radius: 0.45rem;
  --color: #d7d7dc;
  --inner-padding-end: 0.35rem;
  --min-height: 2.3rem;
  --padding-end: 0.35rem;
  --padding-start: 0.45rem;
  margin-bottom: 0.05rem;
}

.action-row ion-icon,
.connection-row ion-icon {
  width: 1.05rem;
  height: 1.05rem;
  color: #8a8a92;
  margin-right: 0.65rem;
}

.action-row {
  font-size: 0.86rem;
}

.connection-row {
  --min-height: 3.45rem;
  align-items: flex-start;
}

.connection-row h2,
.connection-row p {
  margin: 0;
}

.connection-row h2 {
  color: #e6e6ea;
  font-size: 0.83rem;
  font-weight: 650;
}

.connection-row p {
  display: -webkit-box;
  overflow: hidden;
  color: #8e8e96;
  font-size: 0.72rem;
  line-height: 1.25;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.connection-state {
  align-self: center;
  flex-shrink: 0;
  border-radius: 0.35rem;
  background: #3f3f46;
  color: #d4d4d8;
  font-size: 0.58rem;
  font-weight: 800;
  line-height: 1;
  padding: 0.28rem 0.35rem;
}

.connection-state.online {
  background: #16a34a;
  color: #ffffff;
}

.project-heading {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 1.65rem;
  padding: 0.15rem 0.25rem 0.15rem 0.05rem;
  color: #9ca3af;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.project-heading ion-icon {
  width: 0.85rem;
  height: 0.85rem;
  color: #71717a;
}

.project-heading span:not(.thread-count) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-count {
  display: inline-grid;
  place-items: center;
  min-width: 1rem;
  height: 1rem;
  border-radius: 0.25rem;
  background: #2563eb;
  color: #ffffff;
  font-size: 0.65rem;
  line-height: 1;
}

.thread-item {
  position: relative;
}

.thread-item.active {
  --background: #2a2a2d;
}

.thread-rail {
  width: 0.35rem;
  height: 0.35rem;
  align-self: center;
  border-radius: 999px;
  background: transparent;
  box-shadow: 0 0 0 1px #63636b;
  margin: 0 0.65rem 0 0.05rem;
}

.thread-rail.working {
  background: #38bdf8;
  box-shadow: 0 0 0 0.2rem rgba(56, 189, 248, 0.14);
}

.thread-title-row,
.thread-summary {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.45rem;
}

.thread-title {
  min-width: 0;
  flex: 1;
  color: #ececef;
  font-size: 0.78rem;
  font-weight: 650;
}

.thread-time {
  flex-shrink: 0;
  color: #74747c;
  font-size: 0.64rem;
}

.thread-summary {
  display: block;
  color: #8f8f97;
  font-size: 0.69rem;
  line-height: 1.25;
}

.thread-title,
.thread-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
