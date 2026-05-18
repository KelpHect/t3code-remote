<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button aria-label="Open navigation">
            <ion-icon slot="icon-only" :icon="menuOutline" />
          </ion-menu-button>
        </ion-buttons>
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="settings-content" :fullscreen="true">
      <main class="settings-shell" aria-label="Settings and connection">
        <section class="settings-hero">
          <p class="eyebrow">Private network</p>
          <h1>Connect to T3 Code</h1>
          <p>Pair with an existing desktop backend over emulator host networking, LAN, or VPN.</p>
          <ion-badge :color="selectedBackend ? 'success' : 'medium'">{{ statusText }}</ion-badge>
        </section>

        <ion-list class="settings-list" lines="full">
          <ion-item-divider>
            <ion-label>Discovery</ion-label>
          </ion-item-divider>
          <ion-item>
            <ion-icon slot="start" :icon="scanOutline" />
            <ion-label>
              <h2>Auto-discover local backends</h2>
              <p>{{ statusDetail }}</p>
            </ion-label>
            <ion-toggle slot="end" :checked="true" aria-label="Auto-discover backends" />
          </ion-item>
          <ion-item>
            <ion-icon slot="start" :icon="linkOutline" />
            <ion-input
              label="Manual backend URL"
              label-placement="stacked"
              placeholder="http://10.0.2.2:3773"
              :value="manualUrl"
              @ionInput="setManualUrl(String($event.detail.value ?? ''))"
            />
          </ion-item>
          <ion-item>
            <ion-icon slot="start" :icon="analyticsOutline" />
            <ion-label>
              <h2>Diagnostics</h2>
              <p>{{ diagnosticsText }}</p>
            </ion-label>
            <ion-spinner v-if="discoveryState === 'scanning'" name="crescent" />
            <ion-button v-else fill="outline" size="small" @click="scanBackends">Scan</ion-button>
          </ion-item>
          <ion-item v-for="result in probeResults" :key="result.candidate.id" class="probe-item">
            <ion-label>
              <h2>{{ result.candidate.label }}</h2>
              <p>{{ result.candidate.url }}</p>
              <p>{{ result.message }}</p>
            </ion-label>
            <ion-badge
              :color="
                result.status === 'valid'
                  ? 'success'
                  : result.status === 'probing'
                    ? 'primary'
                    : 'medium'
              "
            >
              {{ result.status }}
            </ion-badge>
          </ion-item>
        </ion-list>

        <ion-list class="settings-list" lines="full">
          <ion-item-divider>
            <ion-label>Pairing</ion-label>
          </ion-item-divider>
          <ion-item>
            <ion-icon slot="start" :icon="keyOutline" />
            <ion-textarea
              auto-grow
              label="Pairing token or URL"
              label-placement="stacked"
              placeholder="Paste pairing token"
              :rows="2"
              :value="pairingInput"
              @ionInput="pairingInput = String($event.detail.value ?? '')"
            />
          </ion-item>
          <ion-item v-if="pairingMessage">
            <ion-icon slot="start" :icon="pairingMessageIcon" />
            <ion-label>
              <h2>{{ pairingMessageTitle }}</h2>
              <p>{{ pairingMessage }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
            <ion-label>
              <h2>Use VPN/private network only</h2>
              <p>Cleartext HTTP is allowed only for paired local endpoints.</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-button
              expand="block"
              class="primary-action"
              :disabled="pairingState === 'pairing'"
              @click="pairBackend"
            >
              <ion-spinner v-if="pairingState === 'pairing'" name="crescent" />
              <span v-else>Pair backend</span>
            </ion-button>
          </ion-item>
        </ion-list>

        <ion-list class="settings-list" lines="full">
          <ion-item-divider>
            <ion-label>App</ion-label>
          </ion-item-divider>
          <ion-item>
            <ion-icon slot="start" :icon="moonOutline" />
            <ion-label>
              <h2>Theme</h2>
              <p>{{ darkMode ? "Dark" : "System light" }}</p>
            </ion-label>
            <ion-toggle
              slot="end"
              :checked="darkMode"
              aria-label="Use dark appearance"
              @ionChange="setDarkMode"
            />
          </ion-item>
          <ion-item>
            <ion-icon slot="start" :icon="phonePortraitOutline" />
            <ion-label>
              <h2>T3 Code mobile</h2>
              <p>Ionic Vue beta shell</p>
            </ion-label>
            <ion-note slot="end">0.0.1</ion-note>
          </ion-item>
        </ion-list>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonMenuButton,
  IonNote,
  IonPage,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
} from "@ionic/vue";
import {
  analyticsOutline,
  checkmarkCircleOutline,
  keyOutline,
  linkOutline,
  menuOutline,
  moonOutline,
  phonePortraitOutline,
  scanOutline,
  shieldCheckmarkOutline,
  warningOutline,
} from "ionicons/icons";

import { bootstrapBearerSession, issueWebSocketToken } from "@/client/auth";
import { useConnectionState } from "@/client/connectionState";
import { clearAuthSession, defaultSecretStore, saveAuthSession } from "@/client/secretStore";

const {
  candidateCount,
  discoveryState,
  manualUrl,
  probeResults,
  scanBackends,
  selectedBackend,
  clearAuthState,
  setAuthSession,
  setManualUrl,
  statusDetail,
  statusText,
} = useConnectionState();

const darkMode = ref(document.body.classList.contains("dark"));
const pairingInput = ref("");
const pairingState = ref<"idle" | "pairing" | "paired" | "failed">("idle");
const pairingMessage = ref("");

const diagnosticsText = computed(() => {
  if (discoveryState.value === "scanning") {
    return `Scanning ${candidateCount.value} backend candidate${candidateCount.value === 1 ? "" : "s"}.`;
  }
  if (selectedBackend.value) {
    return `Selected ${selectedBackend.value.candidate.url}.`;
  }
  if (probeResults.value.length > 0) {
    return "No reachable backend found. Check desktop T3 and private-network access.";
  }
  return "Discovery will run automatically while the app is open.";
});

const pairingMessageTitle = computed(() =>
  pairingState.value === "paired" ? "Backend paired" : "Pairing failed",
);

const pairingMessageIcon = computed(() =>
  pairingState.value === "paired" ? checkmarkCircleOutline : warningOutline,
);

const pairBackend = async () => {
  const backendUrl = selectedBackend.value?.candidate.url ?? manualUrl.value;
  pairingState.value = "pairing";
  pairingMessage.value = "";

  try {
    const session = await bootstrapBearerSession({
      backendUrl,
      pairingInput: pairingInput.value,
    });
    const webSocketToken = await issueWebSocketToken({
      backendUrl,
      sessionToken: session.sessionToken,
    });
    await saveAuthSession(defaultSecretStore, {
      backendUrl,
      bearerSession: session,
      webSocketToken,
      storedAt: new Date().toISOString(),
    });
    setAuthSession({
      backendUrl,
      bearerSession: session,
      webSocketToken,
    });
    pairingInput.value = "";
    pairingState.value = "paired";
    pairingMessage.value = "Bearer session and WebSocket token are ready.";
  } catch (error) {
    clearAuthState();
    await clearAuthSession(defaultSecretStore);
    pairingState.value = "failed";
    pairingMessage.value = error instanceof Error ? error.message : "Pairing failed.";
  }
};

const setDarkMode = (event: { detail: { checked: boolean } }) => {
  darkMode.value = event.detail.checked;
  document.body.classList.toggle("dark", darkMode.value);
  document.body.classList.toggle("light", !darkMode.value);
  window.localStorage.setItem("t3-mobile-theme", darkMode.value ? "dark" : "light");
};
</script>

<style scoped>
.settings-content {
  --padding-bottom: calc(1rem + env(safe-area-inset-bottom));
}

.settings-shell {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 42rem;
  min-height: 100%;
  margin: 0 auto;
  padding: calc(var(--t3-page-padding) + var(--t3-safe-top)) var(--t3-page-padding) 1.5rem;
}

.settings-hero {
  display: grid;
  gap: 0.5rem;
  padding: 0.75rem 0.25rem 0.25rem;
}

.settings-hero h1,
.settings-hero p {
  margin: 0;
}

.settings-hero h1 {
  font-size: 1.75rem;
  line-height: 1.12;
}

.settings-hero p {
  color: var(--ion-color-medium);
  line-height: 1.45;
}

.eyebrow {
  color: var(--ion-color-primary);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.settings-list {
  overflow: hidden;
  border: 1px solid var(--t3-panel-border);
  border-radius: var(--t3-panel-radius);
  background: var(--t3-panel-background);
}

.settings-list ion-item {
  --min-height: 4rem;
}

.settings-list ion-icon {
  color: var(--ion-color-medium);
}

.probe-item h2,
.probe-item p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

ion-item-divider {
  --background: transparent;
  --color: var(--ion-color-primary);
  min-height: 2.4rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
}

.primary-action {
  width: 100%;
}
</style>
