<template>
  <ion-page>
    <ion-header class="chat-header">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button aria-label="Open navigation">
            <ion-icon slot="icon-only" :icon="menuOutline" />
          </ion-menu-button>
        </ion-buttons>
        <ion-title>
          <span class="chat-title">Mobile UI rebuild</span>
          <span class="chat-subtitle">t3code-remote</span>
        </ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="New chat" @click="setEmptyChat(true)">
            <ion-icon slot="icon-only" :icon="addOutline" />
          </ion-button>
          <ion-button aria-label="Open tools" @click="setToolsOpen(true)">
            <ion-icon slot="icon-only" :icon="ellipsisHorizontalOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="chat-content" :fullscreen="true">
      <main class="chat-thread" aria-label="Chat thread">
        <section class="thread-status" aria-label="Current project status">
          <div>
            <p class="eyebrow">Working</p>
            <h1>T3 Code</h1>
            <p>Private backend discovery is not connected yet.</p>
          </div>
          <ion-badge color="medium">Local</ion-badge>
        </section>

        <section class="thread-controls" aria-label="Chat controls">
          <ion-button fill="outline" size="small" shape="round" @click="setModelModalOpen(true)">
            <ion-icon slot="start" :icon="hardwareChipOutline" />
            GPT-5.5
            <ion-icon slot="end" :icon="chevronDownOutline" />
          </ion-button>
          <ion-button fill="outline" size="small" shape="round" @click="setModelModalOpen(true)">
            <ion-icon slot="start" :icon="codeSlashOutline" />
            Build
          </ion-button>
          <ion-button fill="outline" size="small" shape="round" @click="openTool('diff')">
            Diff
          </ion-button>
          <ion-button fill="outline" size="small" shape="round" @click="openTool('git')">
            Git
          </ion-button>
        </section>

        <section v-if="emptyChat" class="empty-chat" aria-label="Empty chat">
          <h1>T3 Code</h1>
          <p>Start a project chat once a backend is paired.</p>
          <ion-button fill="outline" shape="round" @click="setEmptyChat(false)">
            View sample thread
          </ion-button>
        </section>

        <section v-else class="message-list" aria-label="Messages">
          <article
            v-for="message in messages"
            :key="message.id"
            class="message"
            :class="`message-${message.role}`"
          >
            <div class="avatar" aria-hidden="true">{{ message.avatar }}</div>
            <div class="message-body">
              <p class="message-author">{{ message.author }}</p>
              <p>{{ message.text }}</p>
            </div>
          </article>
        </section>
      </main>
    </ion-content>

    <ion-footer class="chat-footer">
      <ion-toolbar>
        <div class="composer-shell">
          <ion-textarea
            aria-label="Message"
            auto-grow
            class="composer-input"
            placeholder="Message"
            :rows="1"
          />
          <ion-button shape="round" aria-label="Send message">
            <ion-icon slot="icon-only" :icon="arrowUpOutline" />
          </ion-button>
          <ion-button fill="clear" class="stop-button" aria-label="Stop current run">
            <ion-icon slot="icon-only" :icon="stopCircleOutline" />
          </ion-button>
        </div>
      </ion-toolbar>
    </ion-footer>

    <ion-action-sheet
      :is-open="toolsOpen"
      header="Thread tools"
      :buttons="toolActionButtons"
      @didDismiss="setToolsOpen(false)"
    />

    <ion-modal :is-open="modelModalOpen" @didDismiss="setModelModalOpen(false)">
      <ion-header>
        <ion-toolbar>
          <ion-title>Model and mode</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="setModelModalOpen(false)">Done</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="sheet-content">
        <ion-list lines="full">
          <ion-item>
            <ion-label>
              <h2>Model</h2>
              <p>GPT-5.5</p>
            </ion-label>
            <ion-badge color="primary">Active</ion-badge>
          </ion-item>
          <ion-item>
            <ion-label>
              <h2>Runtime mode</h2>
              <p>Build</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              <h2>Interaction</h2>
              <p>High - Normal</p>
            </ion-label>
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-modal>

    <ion-modal :is-open="Boolean(activeTool)" @didDismiss="activeTool = null">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ activeToolDetails.title }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="activeTool = null">Done</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="sheet-content">
        <section v-if="activeTool === 'diff'" class="tool-workspace">
          <div class="tool-summary">
            <ion-badge color="primary">3 files</ion-badge>
            <span>Unified preview</span>
          </div>
          <pre
            class="diff-preview"
          ><code><span class="diff-file">apps/mobile/src/views/ChatPage.vue</span>
<span class="diff-add">+ &lt;ion-modal&gt;Thread tools&lt;/ion-modal&gt;</span>
<span class="diff-add">+ &lt;section class="terminal-preview"&gt;</span>
<span class="diff-del">- Static placeholder until /ws compatibility</span>
<span class="diff-context">  Composer remains pinned above navigation.</span></code></pre>
        </section>

        <section v-else-if="activeTool === 'git'" class="tool-workspace">
          <div class="status-grid">
            <div class="status-card">
              <strong>Modified</strong>
              <span>4</span>
            </div>
            <div class="status-card">
              <strong>Branch</strong>
              <span>main</span>
            </div>
          </div>
          <ion-list lines="full">
            <ion-item>
              <ion-label>
                <h2>Commit mobile UI polish</h2>
                <p>Ready once validation passes.</p>
              </ion-label>
            </ion-item>
            <ion-item>
              <ion-label>
                <h2>Push to origin/main</h2>
                <p>Runs after each completed TODO task.</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </section>

        <section v-else-if="activeTool === 'files'" class="tool-workspace">
          <div class="path-bar">/home/kellhect/Projects/t3code-remote/apps/mobile</div>
          <ion-list lines="full">
            <ion-item v-for="entry in fileEntries" :key="entry.path">
              <ion-icon slot="start" :icon="entry.icon" />
              <ion-label>
                <h2>{{ entry.name }}</h2>
                <p>{{ entry.path }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </section>

        <section v-else-if="activeTool === 'terminal'" class="tool-workspace">
          <pre class="terminal-preview"><code>$ bun --cwd apps/mobile build
✓ vue-tsc --noEmit
✓ vite build
$ capacitor sync android
✓ copied web assets
$ adb install -r app-debug.apk
Success</code></pre>
          <div class="terminal-input">
            <span>$</span>
            <p>Type command after backend terminal support is connected.</p>
          </div>
        </section>

        <section v-else class="tool-workspace">
          <ion-list lines="full">
            <ion-item v-for="entry in activeToolDetails.entries" :key="entry">
              <ion-label>{{ entry }}</ion-label>
            </ion-item>
          </ion-list>
          <p class="sheet-note">{{ activeToolDetails.note }}</p>
        </section>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  IonActionSheet,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonModal,
  IonPage,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import {
  addOutline,
  arrowUpOutline,
  chevronDownOutline,
  codeSlashOutline,
  documentTextOutline,
  ellipsisHorizontalOutline,
  folderOpenOutline,
  hardwareChipOutline,
  menuOutline,
  stopCircleOutline,
} from "ionicons/icons";

const messages = [
  {
    id: "m1",
    role: "user",
    avatar: "K",
    author: "You",
    text: "Use Ionic Vue and make the mobile app feel like a clean chat client first.",
  },
  {
    id: "m2",
    role: "assistant",
    avatar: "T3",
    author: "T3 Code",
    text: "I am replacing the starter tabs with a chat-first shell and keeping project tools behind mobile controls.",
  },
  {
    id: "m3",
    role: "assistant",
    avatar: "T3",
    author: "T3 Code",
    text: "Next steps are history navigation, settings, and contextual sheets before backend discovery starts.",
  },
] as const;

const fileEntries = [
  {
    name: "src",
    path: "views, router, theme",
    icon: folderOpenOutline,
  },
  {
    name: "ChatPage.vue",
    path: "chat, composer, tool sheets",
    icon: documentTextOutline,
  },
  {
    name: "SettingsPage.vue",
    path: "connection, pairing, dark mode",
    icon: documentTextOutline,
  },
] as const;

type ToolId = "diff" | "git" | "files" | "terminal" | "approvals" | "connection";

const toolDetails: Record<ToolId, { title: string; entries: readonly string[]; note: string }> = {
  diff: {
    title: "Diff",
    entries: ["Unified diff", "Changed files", "Full thread diff"],
    note: "Static placeholder until existing /ws compatibility is implemented.",
  },
  git: {
    title: "Git",
    entries: ["Status", "Commit", "Push", "Commit and push"],
    note: "Git actions will stay attached to the selected project/thread.",
  },
  files: {
    title: "Files",
    entries: ["Browse project", "Add project", "Clone repository"],
    note: "The desktop backend remains the filesystem authority.",
  },
  terminal: {
    title: "Terminal",
    entries: ["Open terminal", "Scrollback", "Input", "Resize"],
    note: "Terminal sessions will be backend-owned and streamed into this sheet.",
  },
  approvals: {
    title: "Approvals",
    entries: ["Pending decisions", "User input prompts", "Run permissions"],
    note: "Approval flows must preserve the existing T3 backend boundaries.",
  },
  connection: {
    title: "Connection diagnostics",
    entries: ["Backend discovery", "Pairing status", "Probe failures"],
    note: "Discovery starts in P1; this sheet owns the mobile diagnostics surface.",
  },
};

const modelModalOpen = ref(false);
const toolsOpen = ref(false);
const activeTool = ref<ToolId | null>(null);
const emptyChat = ref(false);

const activeToolDetails = computed(() => {
  if (!activeTool.value) {
    return {
      title: "Thread tools",
      entries: [],
      note: "",
    };
  }

  return toolDetails[activeTool.value];
});

const setModelModalOpen = (open: boolean) => {
  modelModalOpen.value = open;
};

const setToolsOpen = (open: boolean) => {
  toolsOpen.value = open;
};

const setEmptyChat = (empty: boolean) => {
  emptyChat.value = empty;
};

const openTool = (tool: ToolId) => {
  activeTool.value = tool;
  toolsOpen.value = false;
};

const toolActionButtons = [
  {
    text: "Diff",
    handler: () => openTool("diff"),
  },
  {
    text: "Git",
    handler: () => openTool("git"),
  },
  {
    text: "Files",
    handler: () => openTool("files"),
  },
  {
    text: "Terminal",
    handler: () => openTool("terminal"),
  },
  {
    text: "Approvals",
    handler: () => openTool("approvals"),
  },
  {
    text: "Connection diagnostics",
    handler: () => openTool("connection"),
  },
  {
    text: "Cancel",
    role: "cancel",
  },
];
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

.chat-thread {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: var(--t3-page-padding) var(--t3-page-padding) 1.5rem;
}

.thread-status {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 1.25rem;
}

.thread-status > div {
  min-width: 0;
}

.thread-status ion-badge {
  flex-shrink: 0;
}

.thread-status h1,
.thread-status p {
  margin: 0;
}

.thread-status h1 {
  font-size: 1.8rem;
  font-weight: 720;
}

.thread-status p {
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

.thread-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-bottom: 0.25rem;
}

.thread-controls ion-button {
  margin: 0;
  min-height: 2.25rem;
  white-space: nowrap;
}

.message-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1.1rem;
  padding: 0.5rem 0 1rem;
}

.empty-chat {
  display: grid;
  flex: 1;
  align-content: center;
  justify-items: center;
  gap: 0.75rem;
  min-height: 20rem;
  padding: 2rem 1rem;
  text-align: center;
}

.empty-chat h1,
.empty-chat p {
  margin: 0;
}

.empty-chat h1 {
  font-size: 2rem;
  line-height: 1.1;
}

.empty-chat p {
  color: var(--ion-color-medium);
  line-height: 1.45;
}

.message {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr);
  gap: 0.75rem;
}

.message-user {
  grid-template-columns: minmax(0, 1fr) 2rem;
}

.message-user .avatar {
  grid-column: 2;
  grid-row: 1;
}

.message-user .message-body {
  grid-column: 1;
  grid-row: 1;
  justify-self: end;
}

.avatar {
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--ion-color-light);
  color: var(--ion-color-dark);
  font-size: 0.72rem;
  font-weight: 750;
}

.message-body {
  max-width: min(100%, 34rem);
}

.message-user .message-body {
  padding: 0.75rem 0.9rem;
  border-radius: 1.1rem;
  background: var(--t3-muted-surface);
}

.message-author,
.message-body p {
  margin: 0;
}

.message-author {
  margin-bottom: 0.25rem;
  color: var(--ion-color-medium);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
}

.message-body p:last-child {
  line-height: 1.5;
}

.sheet-content {
  --padding-bottom: 1rem;
}

.sheet-note {
  margin: 1rem;
  color: var(--ion-color-medium);
  line-height: 1.45;
}

.tool-workspace {
  display: grid;
  gap: 1rem;
  padding: 1rem;
}

.tool-summary {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  color: var(--ion-color-medium);
  font-size: 0.9rem;
}

.diff-preview,
.terminal-preview {
  overflow: auto;
  margin: 0;
  border: 1px solid var(--t3-panel-border);
  border-radius: var(--t3-panel-radius);
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.78rem;
  line-height: 1.55;
}

.diff-preview {
  padding: 0.9rem;
  background: var(--t3-panel-background);
}

.diff-preview code {
  display: grid;
  gap: 0.1rem;
}

.diff-file {
  color: var(--ion-color-primary);
  font-weight: 700;
}

.diff-add {
  color: var(--ion-color-success);
}

.diff-del {
  color: var(--ion-color-danger);
}

.diff-context {
  color: var(--ion-color-medium);
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.status-card {
  display: grid;
  gap: 0.35rem;
  padding: 0.85rem;
  border: 1px solid var(--t3-panel-border);
  border-radius: var(--t3-panel-radius);
  background: var(--t3-panel-background);
}

.status-card span {
  color: var(--ion-color-medium);
}

.path-bar,
.terminal-input {
  border: 1px solid var(--t3-panel-border);
  border-radius: 0.8rem;
  background: var(--t3-muted-surface);
  color: var(--ion-color-medium);
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.78rem;
  padding: 0.75rem;
}

.terminal-preview {
  min-height: 16rem;
  padding: 1rem;
  background: var(--t3-terminal-background, #050607);
  color: var(--t3-terminal-color, #d4f7d4);
}

.terminal-input {
  display: flex;
  gap: 0.5rem;
}

.terminal-input p {
  margin: 0;
}

.chat-footer {
  padding-bottom: env(safe-area-inset-bottom);
}

.composer-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: end;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
}

.composer-shell ion-textarea {
  min-height: 2.75rem;
}

.composer-shell ion-button {
  width: 2.75rem;
  height: 2.75rem;
  margin: 0;
}

.composer-shell .stop-button {
  --color: var(--ion-color-medium);
}
</style>
