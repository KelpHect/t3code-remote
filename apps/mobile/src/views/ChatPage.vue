<template>
  <ion-page>
    <ion-header class="chat-header">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button aria-label="Open navigation">
            <ion-icon slot="icon-only" :icon="menuOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>
          <span class="chat-title">T3 Code</span>
          <span class="chat-subtitle">Local mobile client</span>
        </ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="New chat">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="chat-content" :fullscreen="true">
      <main class="chat-empty-state">
        <p class="eyebrow">Not paired</p>
        <h1>T3 Code</h1>
        <p>Connect to your desktop backend, then continue project chats from this device.</p>
      </main>
    </ion-content>

    <ion-footer class="chat-footer">
      <ion-toolbar>
        <div class="composer-shell">
          <ion-textarea aria-label="Message" auto-grow placeholder="Message" :rows="1" />
          <ion-button shape="round" aria-label="Send message">
            <ion-icon slot="icon-only" :icon="arrowUpOutline" />
          </ion-button>
        </div>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonPage,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import { addOutline, arrowUpOutline, menuOutline } from "ionicons/icons";
</script>

<style scoped>
.chat-header ion-title {
  padding-inline: 0;
}

.chat-title,
.chat-subtitle {
  display: block;
  line-height: 1.2;
}

.chat-title {
  font-size: 1rem;
  font-weight: 650;
}

.chat-subtitle {
  color: var(--ion-color-medium);
  font-size: 0.72rem;
  font-weight: 500;
}

.chat-content {
  --background: var(--ion-background-color);
}

.chat-empty-state {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem 1.5rem;
  text-align: center;
}

.chat-empty-state h1,
.chat-empty-state p {
  margin: 0;
}

.chat-empty-state h1 {
  font-size: 2rem;
  font-weight: 720;
}

.chat-empty-state p {
  max-width: 20rem;
  color: var(--ion-color-medium);
  line-height: 1.45;
}

.eyebrow {
  color: var(--ion-color-primary) !important;
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: 0;
  text-transform: uppercase;
}

.chat-footer {
  padding-bottom: env(safe-area-inset-bottom);
}

.composer-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
}

.composer-shell ion-textarea {
  --background: var(--ion-color-light);
  --border-radius: 1.25rem;
  --padding-bottom: 0.55rem;
  --padding-end: 0.9rem;
  --padding-start: 0.9rem;
  --padding-top: 0.55rem;
  min-height: 2.75rem;
}

.composer-shell ion-button {
  width: 2.75rem;
  height: 2.75rem;
  margin: 0;
}
</style>
