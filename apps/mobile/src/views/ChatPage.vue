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
          <span class="chat-title">{{ activeThreadTitle }}</span>
          <span class="chat-subtitle">{{ headerSubtitle }}</span>
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
            <p class="eyebrow">{{ selectedBackend ? "Ready" : "Discovery" }}</p>
            <h1>{{ activeProjectTitle }}</h1>
            <p>{{ shellStatusDetail }}</p>
          </div>
          <ion-badge :color="shellBadgeColor">{{ shellBadgeText }}</ion-badge>
        </section>

        <section class="connection-strip" aria-live="polite">
          <span
            class="live-dot"
            :class="{ active: discoveryState === 'scanning', connected: Boolean(selectedBackend) }"
          />
          <div>
            <strong>{{ statusText }}</strong>
            <p>{{ connectionSummary }}</p>
          </div>
          <ion-spinner v-if="discoveryState === 'scanning'" name="crescent" />
          <ion-button v-else fill="clear" size="small" @click="scanBackends">Scan</ion-button>
        </section>

        <section class="thread-controls" aria-label="Chat controls">
          <ion-button fill="outline" size="small" shape="round" @click="setModelModalOpen(true)">
            <ion-icon slot="start" :icon="hardwareChipOutline" />
            {{ activeModelLabel }}
            <ion-icon slot="end" :icon="chevronDownOutline" />
          </ion-button>
          <ion-button fill="outline" size="small" shape="round" @click="setModelModalOpen(true)">
            <ion-icon slot="start" :icon="codeSlashOutline" />
            {{ activeModeLabel }}
          </ion-button>
          <ion-button fill="outline" size="small" shape="round" @click="continueThread">
            Continue
          </ion-button>
          <ion-button fill="outline" size="small" shape="round" @click="openTool('diff')">
            Diff
          </ion-button>
          <ion-button fill="outline" size="small" shape="round" @click="openTool('git')">
            Git
          </ion-button>
          <ion-button fill="outline" size="small" shape="round" @click="openTool('files')">
            Files
          </ion-button>
          <ion-button fill="outline" size="small" shape="round" @click="openTool('terminal')">
            Terminal
          </ion-button>
        </section>

        <section v-if="showEmptyChat" class="empty-chat" aria-label="Empty chat">
          <div class="empty-logo">T3</div>
          <h1>T3 Code</h1>
          <p>{{ emptyChatCopy }}</p>
          <div class="empty-actions">
            <ion-button shape="round" @click="setEmptyChat(false)">View sample thread</ion-button>
            <ion-button fill="clear" shape="round" @click="openTool('connection')">
              Connection
            </ion-button>
          </div>
        </section>

        <section v-else class="message-list" aria-label="Messages">
          <div
            v-if="pendingApprovals.length > 0 || pendingUserInputs.length > 0"
            class="prompt-stack"
            aria-label="Pending prompts"
          >
            <article
              v-for="approval in pendingApprovals"
              :key="approval.requestId"
              class="prompt-card"
            >
              <ion-badge color="warning">{{ approval.requestKind }}</ion-badge>
              <div>
                <strong>Approval required</strong>
                <p>
                  {{
                    approval.detail ??
                    "Review this request on desktop or continue once actions are wired."
                  }}
                </p>
              </div>
            </article>
            <article
              v-for="userInput in pendingUserInputs"
              :key="userInput.requestId"
              class="prompt-card"
            >
              <ion-badge color="primary">Input</ion-badge>
              <div>
                <strong>{{ userInput.questions[0]?.header ?? "User input needed" }}</strong>
                <p>{{ userInput.questions[0]?.question ?? "Answer requested by the agent." }}</p>
              </div>
            </article>
          </div>

          <p v-if="messages.length === 0" class="empty-thread-note">{{ threadEmptyCopy }}</p>
          <p v-if="commandError" class="command-error" role="alert">{{ commandError }}</p>

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

          <section v-if="visibleActivities.length > 0" class="activity-feed" aria-label="Actions">
            <p class="eyebrow">Actions</p>
            <article v-for="activity in visibleActivities" :key="activity.id" class="activity-row">
              <span class="activity-dot" :class="`activity-${activity.tone ?? 'info'}`" />
              <div>
                <strong>{{ activity.summary }}</strong>
                <p>{{ activity.detail ?? activity.kind }}</p>
              </div>
            </article>
          </section>
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
            :value="composerText"
            @ionInput="onComposerInput"
          />
          <ion-button
            shape="round"
            aria-label="Send message"
            :disabled="commandBusy"
            @click="sendComposerMessage"
          >
            <ion-icon slot="icon-only" :icon="arrowUpOutline" />
          </ion-button>
          <ion-button
            fill="clear"
            class="stop-button"
            aria-label="Stop current run"
            :disabled="commandBusy"
            @click="stopCurrentRun"
          >
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
        <section class="mode-sheet">
          <div class="mode-sheet-head">
            <div>
              <p class="eyebrow">Backend supported</p>
              <h2>{{ activeModelLabel }}</h2>
              <p>{{ modelConfigStatusText }}</p>
            </div>
            <ion-button fill="clear" size="small" @click="refreshProviderModels"
              >Refresh</ion-button
            >
          </div>

          <div class="choice-group">
            <div class="choice-group-title">
              <strong>Model</strong>
              <ion-spinner v-if="modelConfigLoading" name="crescent" />
            </div>
            <ion-list lines="none" class="choice-list">
              <ion-item
                v-for="choice in availableModelChoices"
                :key="choice.id"
                button
                :detail="false"
                :class="{ selected: isActiveModelChoice(choice.selection) }"
                @click="applyModelSelection(choice.selection)"
              >
                <ion-label>
                  <h2>{{ choice.modelLabel }}</h2>
                  <p>{{ choice.providerLabel }}</p>
                </ion-label>
                <ion-badge :color="choice.status === 'ready' ? 'primary' : 'medium'">
                  {{ choice.status }}
                </ion-badge>
              </ion-item>
            </ion-list>
          </div>

          <div class="choice-group">
            <strong>Runtime mode</strong>
            <ion-list lines="none" class="choice-list">
              <ion-item
                v-for="option in mobileRuntimeModeOptions"
                :key="option.value"
                button
                :detail="false"
                :class="{ selected: activeRuntimeMode === option.value }"
                @click="applyRuntimeMode(option.value)"
              >
                <ion-label>
                  <h2>{{ option.label }}</h2>
                  <p>{{ option.detail }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </div>

          <div class="choice-group">
            <strong>Interaction</strong>
            <ion-list lines="none" class="choice-list">
              <ion-item
                v-for="option in mobileInteractionModeOptions"
                :key="option.value"
                button
                :detail="false"
                :class="{ selected: activeInteractionMode === option.value }"
                @click="applyInteractionMode(option.value)"
              >
                <ion-label>
                  <h2>{{ option.label }}</h2>
                  <p>{{ option.detail }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </div>

          <p v-if="commandError" class="command-error" role="alert">{{ commandError }}</p>
        </section>
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
          <div class="diff-toolbar">
            <div>
              <p class="eyebrow">Unified diff</p>
              <h2>{{ diffTitle }}</h2>
              <p>{{ diffStatusText }}</p>
            </div>
            <ion-spinner v-if="diffLoading" name="crescent" />
          </div>
          <div class="diff-actions">
            <ion-button size="small" shape="round" @click="loadFullThreadDiff">
              Full thread
            </ion-button>
            <ion-button fill="outline" size="small" shape="round" @click="loadLatestTurnDiff">
              Latest turn
            </ion-button>
            <ion-item lines="none" class="diff-toggle">
              <ion-label>Ignore whitespace</ion-label>
              <ion-toggle :checked="diffIgnoreWhitespace" @ionChange="onDiffWhitespaceToggle" />
            </ion-item>
          </div>
          <div v-if="activeDiff" class="diff-file-list" aria-label="Changed files">
            <ion-badge color="primary">
              {{ activeDiff.files.length }} file{{ activeDiff.files.length === 1 ? "" : "s" }}
            </ion-badge>
            <span>{{ activeDiff.lineCount }} line{{ activeDiff.lineCount === 1 ? "" : "s" }}</span>
            <span v-if="activeDiff.truncated">Preview truncated</span>
            <span v-if="activeDiff.binary">Binary content</span>
          </div>
          <ion-list v-if="activeDiff?.files.length" lines="full" class="diff-files">
            <ion-item v-for="file in activeDiff.files" :key="file.path">
              <ion-label>
                <h2>{{ file.path }}</h2>
                <p>
                  <span class="diff-add">+{{ file.additions }}</span>
                  <span class="diff-del">-{{ file.deletions }}</span>
                  <span v-if="file.status"> {{ file.status }}</span>
                </p>
              </ion-label>
            </ion-item>
          </ion-list>
          <p v-if="diffError" class="command-error" role="alert">{{ diffError }}</p>
          <p v-else-if="activeDiff?.empty" class="empty-thread-note">
            No diff is available for this checkpoint range.
          </p>
          <pre v-else-if="activeDiff" class="diff-preview"><code>{{ activeDiff.diff }}</code></pre>
          <p v-else class="empty-thread-note">Select a thread with completed checkpoints.</p>
        </section>

        <section v-else-if="activeTool === 'git'" class="tool-workspace">
          <div class="git-toolbar">
            <div>
              <p class="eyebrow">Repository</p>
              <h2>{{ gitBranchLabel }}</h2>
              <p>{{ gitStatusText }}</p>
            </div>
            <ion-spinner v-if="gitLoading || gitActionRunning" name="crescent" />
          </div>
          <div class="status-grid">
            <div class="status-card">
              <strong>Modified</strong>
              <span>{{ gitStatus?.files.length ?? 0 }}</span>
            </div>
            <div class="status-card">
              <strong>Ahead / behind</strong>
              <span>{{ gitStatus?.ahead ?? 0 }} / {{ gitStatus?.behind ?? 0 }}</span>
            </div>
          </div>
          <div class="git-actions">
            <ion-button size="small" shape="round" :disabled="!gitCwd" @click="refreshGitStatus">
              Refresh
            </ion-button>
            <ion-button
              fill="outline"
              size="small"
              shape="round"
              :disabled="!canRunGitAction"
              @click="runGitAction('commit')"
            >
              Commit
            </ion-button>
            <ion-button
              fill="outline"
              size="small"
              shape="round"
              :disabled="!canRunGitAction"
              @click="runGitAction('push')"
            >
              Push
            </ion-button>
            <ion-button
              fill="outline"
              size="small"
              shape="round"
              :disabled="!canRunGitAction"
              @click="runGitAction('commit_push')"
            >
              Commit + push
            </ion-button>
            <ion-button
              fill="outline"
              size="small"
              shape="round"
              :disabled="!canRunGitAction"
              @click="runGitAction('create_pr')"
            >
              PR prep
            </ion-button>
          </div>
          <ion-textarea
            aria-label="Commit message"
            auto-grow
            class="git-commit-message"
            placeholder="Commit message"
            :rows="2"
            :value="gitCommitMessage"
            @ionInput="onGitCommitInput"
          />
          <p v-if="gitError" class="command-error" role="alert">{{ gitError }}</p>
          <ion-list v-if="gitStatus?.files.length" lines="full" class="git-files">
            <ion-item v-for="file in gitStatus.files" :key="file.path">
              <ion-label>
                <h2>{{ file.path }}</h2>
                <p>
                  <span class="diff-add">+{{ file.insertions }}</span>
                  <span class="diff-del">-{{ file.deletions }}</span>
                  <span v-if="file.status"> {{ file.status }}</span>
                </p>
              </ion-label>
            </ion-item>
          </ion-list>
          <p v-else class="empty-thread-note">{{ gitEmptyText }}</p>
          <ion-list v-if="gitProgress.length" lines="full" class="git-progress">
            <ion-item v-for="entry in gitProgress" :key="entry.id">
              <span slot="start" class="activity-dot" :class="`progress-${entry.tone}`" />
              <ion-label>
                <h2>{{ entry.label }}</h2>
                <p v-if="entry.detail">{{ entry.detail }}</p>
                <p v-else>{{ entry.kind }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </section>

        <section v-else-if="activeTool === 'files'" class="tool-workspace">
          <div class="files-toolbar">
            <div>
              <p class="eyebrow">Desktop filesystem</p>
              <h2>{{ filesTitle }}</h2>
              <p>{{ filesStatusText }}</p>
            </div>
            <ion-spinner v-if="filesLoading" name="crescent" />
          </div>
          <div class="path-controls">
            <ion-input
              aria-label="Desktop path"
              class="path-input"
              placeholder="~/Projects"
              :value="filePathInput"
              @ionInput="onFilePathInput"
            />
            <ion-button size="small" shape="round" @click="browseFilePath">Browse</ion-button>
            <ion-button fill="outline" size="small" shape="round" @click="browseParentPath">
              Up
            </ion-button>
          </div>
          <div class="git-actions">
            <ion-button size="small" shape="round" :disabled="!filePathInput" @click="addProject">
              Add project
            </ion-button>
          </div>
          <p v-if="filesError" class="command-error" role="alert">{{ filesError }}</p>
          <ion-list v-if="fileEntries.length" lines="full" class="file-list">
            <ion-item
              v-for="entry in fileEntries"
              :key="entry.fullPath"
              button
              :detail="false"
              @click="browseToEntry(entry.fullPath)"
            >
              <ion-icon slot="start" :icon="folderOpenOutline" />
              <ion-label>
                <h2>{{ entry.name }}</h2>
                <p>{{ entry.fullPath }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
          <p v-else class="empty-thread-note">Browse a desktop path to list directories.</p>

          <div class="clone-panel">
            <p class="eyebrow">Clone repository</p>
            <ion-input
              aria-label="Repository"
              class="path-input"
              placeholder="owner/repo or git URL"
              :value="cloneRepositoryInput"
              @ionInput="onCloneRepositoryInput"
            />
            <ion-input
              aria-label="Clone destination"
              class="path-input"
              placeholder="/home/user/Projects/repo"
              :value="cloneDestinationInput"
              @ionInput="onCloneDestinationInput"
            />
            <div class="git-actions">
              <ion-button
                fill="outline"
                size="small"
                shape="round"
                :disabled="filesLoading"
                @click="lookupCloneRepository"
              >
                Lookup
              </ion-button>
              <ion-button
                size="small"
                shape="round"
                :disabled="filesLoading"
                @click="cloneRepository"
              >
                Clone + add
              </ion-button>
            </div>
            <p v-if="cloneRepositoryInfo" class="sheet-note">
              {{ cloneRepositoryInfo.nameWithOwner }} · {{ cloneRepositoryInfo.sshUrl }}
            </p>
          </div>
        </section>

        <section v-else-if="activeTool === 'terminal'" class="tool-workspace">
          <div class="terminal-toolbar">
            <div>
              <p class="eyebrow">Desktop terminal</p>
              <h2>{{ terminalTitle }}</h2>
              <p>{{ terminalStatusText }}</p>
            </div>
            <ion-spinner v-if="terminalLoading" name="crescent" />
          </div>
          <div class="terminal-actions">
            <ion-button
              size="small"
              shape="round"
              :disabled="!canOpenTerminal"
              @click="openTerminalSession"
            >
              Open
            </ion-button>
            <ion-button
              fill="outline"
              size="small"
              shape="round"
              :disabled="!canUseTerminal"
              @click="clearTerminalSession"
            >
              Clear
            </ion-button>
            <ion-button
              fill="outline"
              size="small"
              shape="round"
              :disabled="!canOpenTerminal"
              @click="restartTerminalSession"
            >
              Restart
            </ion-button>
            <ion-button
              fill="outline"
              size="small"
              shape="round"
              :disabled="!canUseTerminal"
              @click="closeTerminalSession"
            >
              Close
            </ion-button>
          </div>
          <p v-if="terminalError" class="command-error" role="alert">{{ terminalError }}</p>
          <pre class="terminal-preview"><code>{{ terminalScrollback }}</code></pre>
          <div class="terminal-input">
            <span>$</span>
            <ion-input
              aria-label="Terminal input"
              :disabled="!canUseTerminal"
              placeholder="Type a command"
              :value="terminalInput"
              @ionInput="onTerminalInput"
              @keyup.enter="sendTerminalInput"
            />
            <ion-button
              size="small"
              shape="round"
              :disabled="!canUseTerminal || !terminalInput.trim()"
              @click="sendTerminalInput"
            >
              Send
            </ion-button>
          </div>
        </section>

        <section v-else-if="activeTool === 'connection'" class="tool-workspace">
          <div class="connection-tool-head">
            <div>
              <p class="eyebrow">Live discovery</p>
              <h2>{{ statusText }}</h2>
              <p>{{ statusDetail }}</p>
            </div>
            <ion-button fill="outline" size="small" @click="scanBackends">Rescan</ion-button>
          </div>
          <ion-list lines="full">
            <ion-item v-for="result in probeResults" :key="result.candidate.id">
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  IonActionSheet,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonModal,
  IonPage,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
} from "@ionic/vue";
import {
  addOutline,
  arrowUpOutline,
  chevronDownOutline,
  codeSlashOutline,
  ellipsisHorizontalOutline,
  folderOpenOutline,
  hardwareChipOutline,
  menuOutline,
  stopCircleOutline,
} from "ionicons/icons";

import {
  buildInterruptOutboxPayload,
  buildProjectCreateOutboxPayload,
  buildThreadInteractionModeOutboxPayload,
  buildThreadMetaUpdateOutboxPayload,
  buildThreadRuntimeModeOutboxPayload,
  buildTurnStartOutboxPayload,
  createCommandDispatcher,
  createFallbackModelSelection,
  createMobileEntityId,
  createTitleSeed,
  type MobileModelSelection,
} from "@/client/mobileChatCommands";
import { mobileComposerDrafts, type ComposerDraftRef } from "@/client/composerDrafts";
import { mobileCommandOutbox, type NewMobileOutboxCommand } from "@/client/commandOutbox";
import { useConnectionState } from "@/client/connectionState";
import {
  loadMobileFullThreadDiff,
  loadMobileTurnDiff,
  type MobileUnifiedDiff,
} from "@/client/mobileDiff";
import {
  browseMobileFilesystem,
  cloneMobileRepository,
  inferMobileProjectTitle,
  isLikelyRemoteUrl,
  lookupMobileRepository,
  type MobileFilesystemEntry,
  type MobileRepositoryInfo,
} from "@/client/mobileFiles";
import {
  refreshMobileGitStatus,
  runMobileGitAction,
  startMobileGitStatusSubscription,
  type MobileGitAction,
  type MobileGitProgressEntry,
  type MobileGitStatus,
} from "@/client/mobileGit";
import {
  clearMobileTerminal,
  closeMobileTerminal,
  createEmptyMobileTerminalState,
  DEFAULT_MOBILE_TERMINAL_ID,
  MOBILE_TERMINAL_COLS,
  MOBILE_TERMINAL_ROWS,
  openMobileTerminal,
  reduceMobileTerminalState,
  resizeMobileTerminal,
  restartMobileTerminal,
  startMobileTerminalSubscription,
  writeMobileTerminal,
  type MobileTerminalState,
} from "@/client/mobileTerminal";
import {
  formatMobileModelSelection,
  loadMobileModelChoices,
  mobileInteractionModeOptions,
  mobileRuntimeModeOptions,
  normalizeInteractionMode,
  normalizeRuntimeMode,
  refreshMobileModelChoices,
  sameMobileModelSelection,
  type MobileInteractionMode,
  type MobileModelChoice,
  type MobileRuntimeMode,
} from "@/client/mobileModelControls";
import { useMobileShellState } from "@/client/mobileShell";
import { useMobileThreadState } from "@/client/mobileThread";

const {
  bearerSession,
  pairedBackendUrl,
  candidateCount,
  discoveryState,
  probeResults,
  scanBackends,
  selectedBackend,
  statusDetail,
  statusText,
  validBackends,
} = useConnectionState();
const { activeProject, activeThread, activeThreadId, selectThread, shellSync } =
  useMobileShellState();
const {
  activeThreadDetail,
  pendingApprovals,
  pendingUserInputs,
  startThreadSync,
  stopThreadSync,
  threadSync,
  visibleActivities,
  visibleMessages,
} = useMobileThreadState();

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
    note: "Terminal sessions are backend-owned and streamed into this sheet.",
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
const composerText = ref("");
const commandBusy = ref(false);
const commandError = ref<string | null>(null);
const modelConfigLoading = ref(false);
const modelConfigError = ref<string | null>(null);
const modelChoices = ref<readonly MobileModelChoice[]>([]);
const draftModelSelection = ref<MobileModelSelection | null>(null);
const draftRuntimeMode = ref<MobileRuntimeMode | null>(null);
const draftInteractionMode = ref<MobileInteractionMode | null>(null);
const activeDiff = ref<MobileUnifiedDiff | null>(null);
const diffLoading = ref(false);
const diffError = ref<string | null>(null);
const diffMode = ref<"full" | "latest">("full");
const diffIgnoreWhitespace = ref(false);
const gitStatus = ref<MobileGitStatus | null>(null);
const gitProgress = ref<readonly MobileGitProgressEntry[]>([]);
const gitLoading = ref(false);
const gitActionRunning = ref(false);
const gitError = ref<string | null>(null);
const gitCommitMessage = ref("");
const filePathInput = ref("");
const fileEntries = ref<readonly MobileFilesystemEntry[]>([]);
const fileParentPath = ref("");
const filesLoading = ref(false);
const filesError = ref<string | null>(null);
const cloneRepositoryInput = ref("");
const cloneDestinationInput = ref("");
const cloneRepositoryInfo = ref<MobileRepositoryInfo | null>(null);
const terminalState = ref<MobileTerminalState>(createEmptyMobileTerminalState());
const terminalInput = ref("");
const terminalLoading = ref(false);
const terminalError = ref<string | null>(null);
let stopGitStatusSubscription: (() => void) | null = null;
let stopTerminalSubscription: (() => void) | null = null;
const messages = computed(() => visibleMessages.value);

const activeDraftRef = computed<ComposerDraftRef>(() => ({
  backendUrl: pairedBackendUrl.value ?? selectedBackend.value?.candidate.url ?? "unpaired",
  projectId: activeProject.value?.id ?? "no-project",
  threadId: emptyChat.value ? "new-chat" : (activeThread.value?.id ?? "new-thread"),
}));

const showEmptyChat = computed(() => emptyChat.value || !activeThread.value);
const activeThreadTitle = computed(
  () => activeThreadDetail.value.title ?? activeThread.value?.title ?? "T3 Code",
);
const activeProjectTitle = computed(() => activeProject.value?.title ?? "T3 Code");
const activeModelSelection = computed(() => resolveModelSelection());
const activeRuntimeMode = computed<MobileRuntimeMode>(
  () => draftRuntimeMode.value ?? normalizeRuntimeMode(activeThread.value?.runtimeMode),
);
const activeInteractionMode = computed<MobileInteractionMode>(
  () => draftInteractionMode.value ?? normalizeInteractionMode(activeThread.value?.interactionMode),
);
const activeModelLabel = computed(() => formatMobileModelSelection(activeModelSelection.value));
const activeModeLabel = computed(() => {
  const runtimeLabel =
    mobileRuntimeModeOptions.find((option) => option.value === activeRuntimeMode.value)?.label ??
    "Full access";
  return activeInteractionMode.value === "plan" ? `Plan · ${runtimeLabel}` : runtimeLabel;
});
const shellBadgeText = computed(() => {
  if (threadSync.value.status === "synced") return "Live";
  if (threadSync.value.status === "connecting") return "Loading";
  if (shellSync.value.status === "synced") return "Synced";
  if (shellSync.value.status === "connecting") return "Syncing";
  return statusText.value;
});
const shellBadgeColor = computed(() => {
  if (threadSync.value.status === "synced") return "success";
  if (threadSync.value.status === "connecting") return "primary";
  if (shellSync.value.status === "synced") return "success";
  if (shellSync.value.status === "connecting") return "primary";
  return selectedBackend.value ? "success" : "medium";
});
const shellStatusDetail = computed(() => {
  if (threadSync.value.status === "synced" || threadSync.value.status === "connecting") {
    return threadSync.value.message;
  }
  if (shellSync.value.status === "synced" || shellSync.value.status === "connecting") {
    return shellSync.value.message;
  }
  return statusDetail.value;
});

const connectionSummary = computed(() => {
  if (selectedBackend.value) {
    return selectedBackend.value.authenticated
      ? "Bearer session is active for this backend."
      : "Backend is reachable; pair to unlock projects and threads.";
  }
  if (discoveryState.value === "scanning") {
    return `Checking ${candidateCount.value} private-network candidate${candidateCount.value === 1 ? "" : "s"}.`;
  }
  if (validBackends.value.length === 0 && probeResults.value.length > 0) {
    return "No reachable T3 backend yet. Keep desktop T3 running and rescan.";
  }
  return "Discovery runs in the background while the app is open.";
});

const headerSubtitle = computed(() => {
  if (activeThread.value?.branch) return activeThread.value.branch;
  if (selectedBackend.value) return selectedBackend.value.candidate.url;
  if (discoveryState.value === "scanning") return "Scanning for desktop backend";
  return "Private-network mobile client";
});

const emptyChatCopy = computed(() =>
  selectedBackend.value && !activeThread.value
    ? "Backend is reachable. Pair or select an existing project to continue working."
    : "Keep the desktop app running; this screen updates as soon as a reachable backend is found.",
);
const threadEmptyCopy = computed(() => {
  if (threadSync.value.status === "connecting") return "Loading thread messages...";
  if (threadSync.value.status === "failed") return threadSync.value.message;
  return "No messages in this thread yet.";
});
const commandSession = computed(() => {
  if (!pairedBackendUrl.value || !bearerSession.value) return null;
  return {
    backendUrl: pairedBackendUrl.value,
    sessionToken: bearerSession.value.sessionToken,
  };
});
const availableModelChoices = computed(() => {
  const choices = modelChoices.value;
  const currentSelection = activeModelSelection.value;
  if (choices.some((choice) => sameMobileModelSelection(choice.selection, currentSelection))) {
    return choices;
  }
  return [
    {
      id: "current-selection",
      modelLabel: formatMobileModelSelection(currentSelection),
      providerLabel: "Current thread",
      selection: currentSelection,
      status: "ready" as const,
      supportsPlanMode: true,
    },
    ...choices,
  ];
});
const modelConfigStatusText = computed(() => {
  if (modelConfigLoading.value) return "Loading provider models from the paired backend.";
  if (modelConfigError.value) return modelConfigError.value;
  if (modelChoices.value.length > 0) {
    return `${modelChoices.value.length} model option${modelChoices.value.length === 1 ? "" : "s"} from the paired backend.`;
  }
  return "Using the current thread model until backend config loads.";
});
const latestDiffSummary = computed(() => activeThreadDetail.value.turnDiffSummaries.at(-1) ?? null);
const previousDiffSummary = computed(() => {
  const summaries = activeThreadDetail.value.turnDiffSummaries;
  return summaries.length > 1 ? summaries[summaries.length - 2] : null;
});
const diffTitle = computed(() => {
  if (!activeThread.value) return "No thread selected";
  if (diffMode.value === "latest") return "Latest turn";
  return "Full thread";
});
const diffStatusText = computed(() => {
  if (diffLoading.value) return "Loading diff from the desktop backend.";
  if (diffError.value) return diffError.value;
  if (!activeThread.value) return "Select a thread before loading diffs.";
  if (!latestDiffSummary.value) return "No completed checkpoints are available yet.";
  if (!activeDiff.value) return "Load a checkpoint diff for this thread.";
  if (activeDiff.value.empty) return "The selected range has no file changes.";
  return `${activeDiff.value.files.length} changed file${activeDiff.value.files.length === 1 ? "" : "s"}.`;
});
const gitCwd = computed(
  () => activeThread.value?.worktreePath ?? activeProject.value?.workspaceRoot,
);
const gitBranchLabel = computed(() => {
  if (!gitCwd.value) return "No repository selected";
  if (!gitStatus.value) return "Loading status";
  if (!gitStatus.value.isRepo) return "Not a git repository";
  return gitStatus.value.branch ?? "Detached HEAD";
});
const gitStatusText = computed(() => {
  if (!gitCwd.value) return "Select a project or thread with a desktop worktree.";
  if (gitLoading.value) return "Refreshing git status from the desktop backend.";
  if (gitActionRunning.value) return "Git action is running on the desktop backend.";
  if (gitError.value) return gitError.value;
  if (!gitStatus.value) return "Open the git sheet to subscribe to repository status.";
  if (!gitStatus.value.isRepo) return `${gitCwd.value} is not a git repository.`;
  const changeText = gitStatus.value.hasChanges
    ? `${gitStatus.value.files.length} changed file${gitStatus.value.files.length === 1 ? "" : "s"}`
    : "Working tree clean";
  const remoteText = gitStatus.value.hasPrimaryRemote
    ? `${gitStatus.value.ahead} ahead, ${gitStatus.value.behind} behind`
    : "No primary remote";
  return `${changeText}. ${remoteText}.`;
});
const gitEmptyText = computed(() => {
  if (!gitCwd.value) return "No project path is available for git.";
  if (!gitStatus.value) return "Refresh git status to view repository changes.";
  if (!gitStatus.value.isRepo) return "This path is not a git repository.";
  return "Working tree clean.";
});
const canRunGitAction = computed(
  () =>
    Boolean(commandSession.value && gitCwd.value && gitStatus.value?.isRepo) &&
    !gitActionRunning.value,
);
const filesTitle = computed(() => {
  if (fileParentPath.value) return fileParentPath.value;
  if (filePathInput.value.trim()) return filePathInput.value.trim();
  return "Browse paths";
});
const filesStatusText = computed(() => {
  if (!commandSession.value) return "Pair with a backend to browse desktop files.";
  if (filesLoading.value) return "Working on the desktop backend.";
  if (filesError.value) return filesError.value;
  if (fileEntries.value.length > 0) {
    return `${fileEntries.value.length} entr${fileEntries.value.length === 1 ? "y" : "ies"} found.`;
  }
  return "Browse a path, add it as a project, or clone a repository.";
});
const terminalCwd = computed(
  () => activeThread.value?.worktreePath ?? activeProject.value?.workspaceRoot ?? null,
);
const terminalThreadId = computed(() => activeThread.value?.id ?? null);
const terminalTitle = computed(() => {
  if (!terminalThreadId.value) return "No thread selected";
  if (!terminalCwd.value) return "No worktree path";
  if (terminalState.value.status === "idle") return terminalCwd.value;
  return `${terminalState.value.status} · ${terminalState.value.cwd || terminalCwd.value}`;
});
const terminalStatusText = computed(() => {
  if (!commandSession.value) return "Pair with a backend to open a desktop terminal.";
  if (!terminalThreadId.value || !terminalCwd.value) {
    return "Select a synced project thread with a workspace path.";
  }
  if (terminalLoading.value) return "Working on the desktop backend.";
  if (terminalError.value) return terminalError.value;
  if (terminalState.value.status === "idle") return "Open the default terminal for this thread.";
  if (terminalState.value.status === "exited") {
    return `Terminal exited with code ${terminalState.value.exitCode ?? "unknown"}.`;
  }
  if (terminalState.value.hasRunningSubprocess) return "A subprocess is running.";
  return `Terminal ${terminalState.value.status}.`;
});
const terminalScrollback = computed(() =>
  terminalState.value.history.trim().length > 0
    ? terminalState.value.history
    : "No terminal output yet.",
);
const canOpenTerminal = computed(
  () =>
    Boolean(commandSession.value && terminalThreadId.value && terminalCwd.value) &&
    !terminalLoading.value,
);
const canUseTerminal = computed(
  () =>
    canOpenTerminal.value &&
    (terminalState.value.status === "running" || terminalState.value.status === "starting"),
);

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
  if (open) void refreshModelConfig();
};

const setToolsOpen = (open: boolean) => {
  toolsOpen.value = open;
};

const setEmptyChat = (empty: boolean) => {
  emptyChat.value = empty;
  commandError.value = null;
};

const onComposerInput = (event: { detail: { value?: string | null } }) => {
  composerText.value = event.detail.value ?? "";
};

const openTool = (tool: ToolId) => {
  activeTool.value = tool;
  toolsOpen.value = false;
  if (tool === "diff") void loadFullThreadDiff();
  if (tool === "git") void startGitTool();
  if (tool === "files") initializeFilesTool();
  if (tool === "terminal") void startTerminalTool();
};

const sendComposerMessage = async () => {
  const text = composerText.value.trim();
  if (!text) return;
  const sent = await dispatchTurn(text, "send");
  if (sent) {
    composerText.value = "";
    mobileComposerDrafts.save(activeDraftRef.value, "");
  }
};

const continueThread = async () => {
  await dispatchTurn("Continue.", "continue");
};

const stopCurrentRun = async () => {
  const thread = activeThread.value;
  if (!thread) {
    commandError.value = "Select a thread before stopping a run.";
    return;
  }
  await dispatchOutboxCommand({
    intent: "stop",
    payload: buildInterruptOutboxPayload({
      threadId: thread.id,
      turnId: activeThreadDetail.value.session?.activeTurnId,
    }),
    type: "thread.turn.interrupt",
  });
};

const dispatchTurn = async (text: string, intent: "send" | "continue") => {
  const target = resolveTurnTarget(text);
  if (!target) return false;
  const dispatched = await dispatchOutboxCommand({
    intent,
    payload: buildTurnStartOutboxPayload({
      bootstrap: target.bootstrap,
      interactionMode: target.interactionMode,
      messageId: createMobileEntityId("message"),
      modelSelection: target.modelSelection,
      runtimeMode: target.runtimeMode,
      text,
      threadId: target.threadId,
      titleSeed: target.titleSeed,
    }),
    type: "thread.turn.start",
  });
  if (!dispatched) return false;
  if (target.createdThreadId) {
    selectThread(target.createdThreadId);
    emptyChat.value = false;
  }
  return true;
};

const dispatchOutboxCommand = async (command: NewMobileOutboxCommand) => {
  const session = commandSession.value;
  if (!session) {
    commandError.value = "Pair with a backend before dispatching commands.";
    return false;
  }
  commandBusy.value = true;
  commandError.value = null;
  try {
    const dispatch = createCommandDispatcher(session);
    await mobileCommandOutbox.dispatchNew(command, dispatch);
    await mobileCommandOutbox.replay(dispatch);
    return true;
  } catch (error) {
    commandError.value = error instanceof Error ? error.message : "Command dispatch failed.";
    return false;
  } finally {
    commandBusy.value = false;
  }
};

const refreshModelConfig = async () => {
  const session = commandSession.value;
  if (!session) {
    modelConfigError.value = "Pair with a backend to load supported models.";
    return;
  }
  modelConfigLoading.value = true;
  modelConfigError.value = null;
  try {
    modelChoices.value = await loadMobileModelChoices(session);
  } catch (error) {
    modelConfigError.value =
      error instanceof Error ? error.message : "Could not load provider models.";
  } finally {
    modelConfigLoading.value = false;
  }
};

const refreshProviderModels = async () => {
  const session = commandSession.value;
  if (!session) {
    modelConfigError.value = "Pair with a backend to refresh providers.";
    return;
  }
  modelConfigLoading.value = true;
  modelConfigError.value = null;
  try {
    modelChoices.value = await refreshMobileModelChoices(session);
  } catch (error) {
    modelConfigError.value = error instanceof Error ? error.message : "Provider refresh failed.";
  } finally {
    modelConfigLoading.value = false;
  }
};

const loadFullThreadDiff = async () => {
  const session = commandSession.value;
  const thread = activeThread.value;
  const summary = latestDiffSummary.value;
  if (!session || !thread || !summary) {
    diffError.value = "Select a paired thread with completed checkpoints.";
    activeDiff.value = null;
    return;
  }
  diffMode.value = "full";
  diffLoading.value = true;
  diffError.value = null;
  try {
    activeDiff.value = await loadMobileFullThreadDiff({
      ignoreWhitespace: diffIgnoreWhitespace.value,
      session,
      threadId: thread.id,
      toTurnCount: summary.checkpointTurnCount,
    });
  } catch (error) {
    diffError.value = error instanceof Error ? error.message : "Full thread diff failed.";
    activeDiff.value = null;
  } finally {
    diffLoading.value = false;
  }
};

const loadLatestTurnDiff = async () => {
  const session = commandSession.value;
  const thread = activeThread.value;
  const summary = latestDiffSummary.value;
  if (!session || !thread || !summary) {
    diffError.value = "Select a paired thread with completed checkpoints.";
    activeDiff.value = null;
    return;
  }
  diffMode.value = "latest";
  diffLoading.value = true;
  diffError.value = null;
  try {
    activeDiff.value = await loadMobileTurnDiff({
      fromTurnCount: previousDiffSummary.value?.checkpointTurnCount ?? 0,
      ignoreWhitespace: diffIgnoreWhitespace.value,
      session,
      threadId: thread.id,
      toTurnCount: summary.checkpointTurnCount,
    });
  } catch (error) {
    diffError.value = error instanceof Error ? error.message : "Latest turn diff failed.";
    activeDiff.value = null;
  } finally {
    diffLoading.value = false;
  }
};

const onDiffWhitespaceToggle = (event: { detail: { checked?: boolean } }) => {
  diffIgnoreWhitespace.value = event.detail.checked === true;
  if (diffMode.value === "latest") {
    void loadLatestTurnDiff();
    return;
  }
  void loadFullThreadDiff();
};

const onGitCommitInput = (event: { detail: { value?: string | null } }) => {
  gitCommitMessage.value = event.detail.value ?? "";
};

const startGitTool = async () => {
  stopGitTool();
  gitError.value = null;
  gitProgress.value = [];
  const session = commandSession.value;
  const cwd = gitCwd.value;
  if (!session || !cwd) {
    gitStatus.value = null;
    gitError.value = "Select a paired project or thread before using git.";
    return;
  }
  gitLoading.value = true;
  try {
    gitStatus.value = await refreshMobileGitStatus({ cwd, session });
    stopGitStatusSubscription = await startMobileGitStatusSubscription({
      cwd,
      onError: (error) => {
        gitError.value = error.message;
      },
      onStatus: (status) => {
        gitStatus.value = status;
        gitError.value = null;
      },
      session,
    });
  } catch (error) {
    gitError.value = error instanceof Error ? error.message : "Git status failed.";
  } finally {
    gitLoading.value = false;
  }
};

const refreshGitStatus = async () => {
  const session = commandSession.value;
  const cwd = gitCwd.value;
  if (!session || !cwd) {
    gitError.value = "Select a paired project or thread before refreshing git.";
    return;
  }
  gitLoading.value = true;
  gitError.value = null;
  try {
    gitStatus.value = await refreshMobileGitStatus({ cwd, session });
  } catch (error) {
    gitError.value = error instanceof Error ? error.message : "Git status failed.";
  } finally {
    gitLoading.value = false;
  }
};

const runGitAction = async (action: MobileGitAction) => {
  const session = commandSession.value;
  const cwd = gitCwd.value;
  if (!session || !cwd) {
    gitError.value = "Select a paired project or thread before running git.";
    return;
  }
  if ((action === "commit" || action === "commit_push") && !gitCommitMessage.value.trim()) {
    gitError.value = "Enter a commit message before committing.";
    return;
  }
  gitActionRunning.value = true;
  gitError.value = null;
  gitProgress.value = [];
  try {
    const result = await runMobileGitAction({
      action,
      commitMessage: gitCommitMessage.value,
      cwd,
      onProgress: appendGitProgress,
      session,
    });
    appendGitProgress({
      action: result.action,
      actionId: `mobile-result-${Date.now()}`,
      createdAt: new Date().toISOString(),
      detail: result.description ?? result.prUrl,
      id: `mobile-result-${Date.now()}`,
      kind: "action_finished",
      label: result.title,
      tone: "success",
    });
    await refreshGitStatus();
  } catch (error) {
    gitError.value = error instanceof Error ? error.message : "Git action failed.";
  } finally {
    gitActionRunning.value = false;
  }
};

const appendGitProgress = (entry: MobileGitProgressEntry) => {
  gitProgress.value = [...gitProgress.value, entry].slice(-80);
};

const stopGitTool = () => {
  stopGitStatusSubscription?.();
  stopGitStatusSubscription = null;
};

const initializeFilesTool = () => {
  filesError.value = null;
  if (!filePathInput.value.trim()) {
    filePathInput.value =
      activeProject.value?.workspaceRoot ?? activeThread.value?.worktreePath ?? "~/";
  }
  if (!cloneDestinationInput.value.trim()) {
    cloneDestinationInput.value = filePathInput.value.trim();
  }
};

const onFilePathInput = (event: { detail: { value?: string | null } }) => {
  filePathInput.value = event.detail.value ?? "";
};

const onCloneRepositoryInput = (event: { detail: { value?: string | null } }) => {
  cloneRepositoryInput.value = event.detail.value ?? "";
  cloneRepositoryInfo.value = null;
};

const onCloneDestinationInput = (event: { detail: { value?: string | null } }) => {
  cloneDestinationInput.value = event.detail.value ?? "";
};

const browseFilePath = async () => {
  const session = commandSession.value;
  const path = filePathInput.value.trim();
  if (!session || !path) {
    filesError.value = "Pair with a backend and enter a path before browsing.";
    return;
  }
  filesLoading.value = true;
  filesError.value = null;
  try {
    const result = await browseMobileFilesystem({
      cwd: activeProject.value?.workspaceRoot,
      partialPath: path,
      session,
    });
    fileParentPath.value = result.parentPath;
    fileEntries.value = result.entries;
    if (result.parentPath) filePathInput.value = result.parentPath;
  } catch (error) {
    filesError.value = error instanceof Error ? error.message : "Filesystem browse failed.";
    fileEntries.value = [];
  } finally {
    filesLoading.value = false;
  }
};

const browseToEntry = async (path: string) => {
  filePathInput.value = path;
  await browseFilePath();
};

const browseParentPath = async () => {
  if (!fileParentPath.value) return;
  const parent = fileParentPath.value
    .replace(/[/\\]+$/, "")
    .split(/[/\\]/)
    .slice(0, -1)
    .join("/");
  filePathInput.value = parent || "/";
  await browseFilePath();
};

const addProject = async () => {
  const workspaceRoot = filePathInput.value.trim();
  if (!workspaceRoot) {
    filesError.value = "Enter a desktop path before adding a project.";
    return;
  }
  const created = await dispatchOutboxCommand({
    intent: "project",
    payload: buildProjectCreateOutboxPayload({
      modelSelection: resolveModelSelection(),
      projectId: createMobileEntityId("project"),
      title: inferMobileProjectTitle(workspaceRoot),
      workspaceRoot,
    }),
    type: "project.create",
  });
  if (created) {
    filesError.value = null;
  }
};

const lookupCloneRepository = async () => {
  const session = commandSession.value;
  const repository = cloneRepositoryInput.value.trim();
  if (!session || !repository) {
    filesError.value = "Pair with a backend and enter a repository before lookup.";
    return;
  }
  if (isLikelyRemoteUrl(repository)) {
    cloneRepositoryInfo.value = null;
    filesError.value = "Direct URLs can be cloned without lookup.";
    return;
  }
  filesLoading.value = true;
  filesError.value = null;
  try {
    cloneRepositoryInfo.value = await lookupMobileRepository({
      provider: "github",
      repository,
      session,
    });
    if (!cloneDestinationInput.value.trim()) {
      cloneDestinationInput.value = `${filePathInput.value.replace(/[/\\]+$/, "")}/${repository
        .split("/")
        .at(-1)}`;
    }
  } catch (error) {
    filesError.value = error instanceof Error ? error.message : "Repository lookup failed.";
  } finally {
    filesLoading.value = false;
  }
};

const cloneRepository = async () => {
  const session = commandSession.value;
  const repository = cloneRepositoryInput.value.trim();
  const destinationPath = cloneDestinationInput.value.trim();
  if (!session || !repository || !destinationPath) {
    filesError.value = "Enter a repository and destination before cloning.";
    return;
  }
  filesLoading.value = true;
  filesError.value = null;
  try {
    const result = await cloneMobileRepository({
      destinationPath,
      protocol: "auto",
      remoteUrl: isLikelyRemoteUrl(repository) ? repository : cloneRepositoryInfo.value?.sshUrl,
      repository: isLikelyRemoteUrl(repository) ? null : repository,
      session,
    });
    filePathInput.value = result.cwd;
    await addProjectForWorkspace(result.cwd);
    await browseFilePath();
  } catch (error) {
    filesError.value = error instanceof Error ? error.message : "Clone failed.";
  } finally {
    filesLoading.value = false;
  }
};

const addProjectForWorkspace = async (workspaceRoot: string) => {
  await dispatchOutboxCommand({
    intent: "project",
    payload: buildProjectCreateOutboxPayload({
      modelSelection: resolveModelSelection(),
      projectId: createMobileEntityId("project"),
      title: inferMobileProjectTitle(workspaceRoot),
      workspaceRoot,
    }),
    type: "project.create",
  });
};

const onTerminalInput = (event: { detail: { value?: string | null } }) => {
  terminalInput.value = event.detail.value ?? "";
};

const startTerminalTool = async () => {
  stopTerminalTool();
  terminalError.value = null;
  const session = commandSession.value;
  const threadId = terminalThreadId.value;
  const cwd = terminalCwd.value;
  if (!session || !threadId || !cwd) {
    terminalState.value = createEmptyMobileTerminalState(threadId ?? "");
    terminalError.value = "Select a paired project thread before opening terminal.";
    return;
  }
  terminalState.value = createEmptyMobileTerminalState(threadId, DEFAULT_MOBILE_TERMINAL_ID);
  try {
    stopTerminalSubscription = await startMobileTerminalSubscription({
      onError: (error) => {
        terminalError.value = error.message;
      },
      onEvent: (event) => {
        terminalState.value = reduceMobileTerminalState(terminalState.value, event);
        terminalError.value = null;
      },
      session,
      terminalId: DEFAULT_MOBILE_TERMINAL_ID,
      threadId,
    });
    await resizeTerminalSession();
  } catch (error) {
    terminalError.value = error instanceof Error ? error.message : "Terminal stream failed.";
  }
};

const openTerminalSession = async () => {
  const context = resolveTerminalContext();
  if (!context) return;
  terminalLoading.value = true;
  terminalError.value = null;
  try {
    terminalState.value = await openMobileTerminal({
      cols: MOBILE_TERMINAL_COLS,
      cwd: context.cwd,
      rows: MOBILE_TERMINAL_ROWS,
      session: context.session,
      terminalId: DEFAULT_MOBILE_TERMINAL_ID,
      threadId: context.threadId,
      worktreePath: activeThread.value?.worktreePath,
    });
    if (!stopTerminalSubscription) await startTerminalTool();
  } catch (error) {
    terminalError.value = error instanceof Error ? error.message : "Terminal open failed.";
  } finally {
    terminalLoading.value = false;
  }
};

const sendTerminalInput = async () => {
  const context = resolveTerminalContext();
  const command = terminalInput.value;
  if (!context || !command.trim()) return;
  terminalLoading.value = true;
  terminalError.value = null;
  try {
    await writeMobileTerminal({
      data: `${command}\r`,
      session: context.session,
      terminalId: DEFAULT_MOBILE_TERMINAL_ID,
      threadId: context.threadId,
    });
    terminalInput.value = "";
  } catch (error) {
    terminalError.value = error instanceof Error ? error.message : "Terminal write failed.";
  } finally {
    terminalLoading.value = false;
  }
};

const resizeTerminalSession = async () => {
  const context = resolveTerminalContext({ silent: true });
  if (!context) return;
  try {
    await resizeMobileTerminal({
      cols: MOBILE_TERMINAL_COLS,
      rows: MOBILE_TERMINAL_ROWS,
      session: context.session,
      terminalId: DEFAULT_MOBILE_TERMINAL_ID,
      threadId: context.threadId,
    });
  } catch {
    // Resize can fail before the session exists; open/restart remains the visible recovery path.
  }
};

const clearTerminalSession = async () => {
  const context = resolveTerminalContext();
  if (!context) return;
  terminalLoading.value = true;
  terminalError.value = null;
  try {
    await clearMobileTerminal({
      session: context.session,
      terminalId: DEFAULT_MOBILE_TERMINAL_ID,
      threadId: context.threadId,
    });
    terminalState.value = { ...terminalState.value, history: "" };
  } catch (error) {
    terminalError.value = error instanceof Error ? error.message : "Terminal clear failed.";
  } finally {
    terminalLoading.value = false;
  }
};

const restartTerminalSession = async () => {
  const context = resolveTerminalContext();
  if (!context) return;
  terminalLoading.value = true;
  terminalError.value = null;
  try {
    terminalState.value = await restartMobileTerminal({
      cols: MOBILE_TERMINAL_COLS,
      cwd: context.cwd,
      rows: MOBILE_TERMINAL_ROWS,
      session: context.session,
      terminalId: DEFAULT_MOBILE_TERMINAL_ID,
      threadId: context.threadId,
      worktreePath: activeThread.value?.worktreePath,
    });
    if (!stopTerminalSubscription) await startTerminalTool();
  } catch (error) {
    terminalError.value = error instanceof Error ? error.message : "Terminal restart failed.";
  } finally {
    terminalLoading.value = false;
  }
};

const closeTerminalSession = async () => {
  const context = resolveTerminalContext();
  if (!context) return;
  terminalLoading.value = true;
  terminalError.value = null;
  try {
    await closeMobileTerminal({
      session: context.session,
      terminalId: DEFAULT_MOBILE_TERMINAL_ID,
      threadId: context.threadId,
    });
    terminalState.value = createEmptyMobileTerminalState(
      context.threadId,
      DEFAULT_MOBILE_TERMINAL_ID,
    );
  } catch (error) {
    terminalError.value = error instanceof Error ? error.message : "Terminal close failed.";
  } finally {
    terminalLoading.value = false;
  }
};

const stopTerminalTool = () => {
  stopTerminalSubscription?.();
  stopTerminalSubscription = null;
};

const resolveTerminalContext = (options?: { readonly silent?: boolean }) => {
  const session = commandSession.value;
  const threadId = terminalThreadId.value;
  const cwd = terminalCwd.value;
  if (!session || !threadId || !cwd) {
    if (!options?.silent) {
      terminalError.value = "Select a paired project thread before using terminal.";
    }
    return null;
  }
  return { cwd, session, threadId };
};

const applyModelSelection = async (selection: MobileModelSelection) => {
  if (sameMobileModelSelection(selection, activeModelSelection.value)) return;
  draftModelSelection.value = selection;
  const thread = activeThread.value;
  if (!thread || emptyChat.value) return;
  await dispatchOutboxCommand({
    intent: "settings",
    payload: buildThreadMetaUpdateOutboxPayload({
      modelSelection: selection,
      threadId: thread.id,
    }),
    type: "thread.meta.update",
  });
};

const applyRuntimeMode = async (runtimeMode: MobileRuntimeMode) => {
  if (runtimeMode === activeRuntimeMode.value) return;
  draftRuntimeMode.value = runtimeMode;
  const thread = activeThread.value;
  if (!thread || emptyChat.value) return;
  await dispatchOutboxCommand({
    intent: "settings",
    payload: buildThreadRuntimeModeOutboxPayload({
      runtimeMode,
      threadId: thread.id,
    }),
    type: "thread.runtime-mode.set",
  });
};

const applyInteractionMode = async (interactionMode: MobileInteractionMode) => {
  if (interactionMode === activeInteractionMode.value) return;
  draftInteractionMode.value = interactionMode;
  const thread = activeThread.value;
  if (!thread || emptyChat.value) return;
  await dispatchOutboxCommand({
    intent: "settings",
    payload: buildThreadInteractionModeOutboxPayload({
      interactionMode,
      threadId: thread.id,
    }),
    type: "thread.interaction-mode.set",
  });
};

const isActiveModelChoice = (selection: MobileModelSelection) =>
  sameMobileModelSelection(selection, activeModelSelection.value);

const resolveTurnTarget = (text: string) => {
  const thread = activeThread.value;
  const project = activeProject.value;
  const runtimeMode = activeRuntimeMode.value;
  const interactionMode = activeInteractionMode.value;
  const modelSelection = resolveModelSelection();
  const titleSeed = createTitleSeed(text);
  if (thread && !emptyChat.value) {
    return {
      bootstrap: undefined,
      createdThreadId: null,
      interactionMode,
      modelSelection,
      runtimeMode,
      threadId: thread.id,
      titleSeed,
    };
  }
  if (!project) {
    commandError.value = "Select a project before starting a new chat.";
    return null;
  }
  const threadId = createMobileEntityId("thread");
  const createdAt = new Date().toISOString();
  return {
    bootstrap: {
      branch: thread?.branch ?? null,
      createdAt,
      interactionMode,
      modelSelection,
      projectId: project.id,
      runtimeMode,
      title: titleSeed,
      worktreePath: thread?.worktreePath ?? null,
    },
    createdThreadId: threadId,
    interactionMode,
    modelSelection,
    runtimeMode,
    threadId,
    titleSeed,
  };
};

const resolveModelSelection = (): MobileModelSelection => {
  if (draftModelSelection.value) return draftModelSelection.value;
  const threadSelection = activeThread.value?.modelSelection;
  const projectSelection = activeProject.value?.defaultModelSelection;
  if (isModelSelection(threadSelection)) return threadSelection;
  if (isModelSelection(projectSelection)) return projectSelection;
  return createFallbackModelSelection();
};

const loadComposerDraft = (ref: ComposerDraftRef) => {
  composerText.value = mobileComposerDrafts.load(ref)?.text ?? "";
};

const saveComposerDraft = (ref: ComposerDraftRef, text = composerText.value) => {
  mobileComposerDrafts.save(ref, text);
};

const flushComposerDraft = () => {
  saveComposerDraft(activeDraftRef.value);
};

const handleVisibilityChange = () => {
  if (globalThis.document?.visibilityState === "hidden") {
    flushComposerDraft();
  }
};

watch(
  activeDraftRef,
  (nextRef, previousRef) => {
    if (previousRef) saveComposerDraft(previousRef);
    loadComposerDraft(nextRef);
  },
  { immediate: true },
);

watch(
  () =>
    [
      pairedBackendUrl.value,
      bearerSession.value?.sessionToken ?? null,
      activeThreadId.value,
      emptyChat.value,
    ] as const,
  ([backendUrl, sessionToken, threadId, isEmpty]) => {
    if (!backendUrl || !sessionToken || !threadId || isEmpty) {
      stopThreadSync({ keepState: Boolean(threadId) });
      return;
    }
    startThreadSync({
      backendUrl,
      sessionToken,
      threadId,
    });
  },
  { immediate: true },
);

watch(
  () => [activeThreadId.value, emptyChat.value] as const,
  () => {
    draftModelSelection.value = null;
    draftRuntimeMode.value = null;
    draftInteractionMode.value = null;
    activeDiff.value = null;
    diffError.value = null;
    gitStatus.value = null;
    gitProgress.value = [];
    gitError.value = null;
    stopGitTool();
    terminalState.value = createEmptyMobileTerminalState(activeThreadId.value ?? "");
    terminalInput.value = "";
    terminalError.value = null;
    stopTerminalTool();
    commandError.value = null;
  },
);

watch(
  commandSession,
  (session) => {
    modelChoices.value = [];
    modelConfigError.value = null;
    if (session) void refreshModelConfig();
  },
  { immediate: true },
);

watch(composerText, (text) => {
  saveComposerDraft(activeDraftRef.value, text);
});

onMounted(() => {
  if (typeof globalThis.document === "undefined") return;
  globalThis.document.addEventListener("visibilitychange", handleVisibilityChange);
  globalThis.window?.addEventListener("pagehide", flushComposerDraft);
});

onBeforeUnmount(() => {
  stopThreadSync();
  stopGitTool();
  stopTerminalTool();
  flushComposerDraft();
  if (typeof globalThis.document === "undefined") return;
  globalThis.document.removeEventListener("visibilitychange", handleVisibilityChange);
  globalThis.window?.removeEventListener("pagehide", flushComposerDraft);
});

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

function isModelSelection(value: unknown): value is MobileModelSelection {
  return typeof value === "object" && value !== null && "model" in value;
}
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
  width: 100%;
  max-width: var(--t3-page-max-width);
  min-height: 100%;
  margin: 0 auto;
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

.connection-strip {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid var(--t3-panel-border);
  border-radius: 1rem;
  background: var(--t3-panel-background);
  padding: 0.75rem;
}

.connection-strip ion-spinner {
  width: 1.15rem;
  height: 1.15rem;
}

.connection-strip strong,
.connection-strip p {
  margin: 0;
}

.connection-strip p {
  color: var(--ion-color-medium);
  font-size: 0.84rem;
  line-height: 1.35;
}

.live-dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 999px;
  background: var(--ion-color-medium);
}

.live-dot.active {
  background: var(--ion-color-primary);
  box-shadow: 0 0 0 0.35rem rgba(var(--ion-color-primary-rgb), 0.14);
}

.live-dot.connected {
  background: var(--ion-color-success);
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
  flex-wrap: nowrap;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
  scrollbar-width: none;
}

.thread-controls::-webkit-scrollbar {
  display: none;
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

.prompt-stack {
  display: grid;
  gap: 0.65rem;
}

.prompt-card,
.activity-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 0.75rem;
  border: 1px solid var(--t3-panel-border);
  border-radius: 1rem;
  background: var(--t3-panel-background);
  padding: 0.85rem;
}

.prompt-card strong,
.activity-row strong {
  display: block;
  margin-bottom: 0.2rem;
  font-size: 0.9rem;
}

.prompt-card p,
.activity-row p,
.empty-thread-note {
  margin: 0;
  color: var(--ion-color-medium);
  line-height: 1.45;
}

.empty-thread-note {
  padding: 1rem 0;
  text-align: center;
}

.command-error {
  margin: 0;
  border: 1px solid color-mix(in srgb, var(--ion-color-danger) 45%, transparent);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--ion-color-danger) 10%, transparent);
  color: var(--ion-color-danger);
  padding: 0.85rem;
  line-height: 1.45;
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

.empty-logo {
  width: 4rem;
  height: 4rem;
  display: grid;
  place-items: center;
  border: 1px solid var(--t3-panel-border);
  border-radius: 1.25rem;
  background: var(--t3-panel-background);
  font-weight: 800;
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
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
  white-space: pre-wrap;
  line-height: 1.5;
}

.activity-feed {
  display: grid;
  gap: 0.65rem;
  margin-top: 0.5rem;
}

.activity-dot {
  width: 0.65rem;
  height: 0.65rem;
  margin-top: 0.28rem;
  border-radius: 999px;
  background: var(--ion-color-medium);
}

.activity-thinking {
  background: var(--ion-color-primary);
}

.activity-tool {
  background: var(--ion-color-success);
}

.activity-error {
  background: var(--ion-color-danger);
}

.progress-info {
  background: var(--ion-color-primary);
}

.progress-success {
  background: var(--ion-color-success);
}

.progress-warning {
  background: var(--ion-color-warning);
}

.progress-danger {
  background: var(--ion-color-danger);
}

.sheet-content {
  --padding-bottom: 1rem;
}

.mode-sheet {
  display: grid;
  gap: 1rem;
  padding: 1rem;
}

.mode-sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid var(--t3-panel-border);
  border-radius: 1rem;
  background: var(--t3-panel-background);
  padding: 1rem;
}

.mode-sheet-head h2,
.mode-sheet-head p {
  margin: 0;
}

.mode-sheet-head h2 {
  font-size: 1.25rem;
  line-height: 1.2;
}

.mode-sheet-head p:not(.eyebrow) {
  color: var(--ion-color-medium);
  line-height: 1.45;
}

.choice-group {
  display: grid;
  gap: 0.55rem;
}

.choice-group-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.choice-group-title ion-spinner {
  width: 1rem;
  height: 1rem;
}

.choice-list {
  display: grid;
  gap: 0.45rem;
  background: transparent;
}

.choice-list ion-item {
  --background: var(--t3-panel-background);
  --border-radius: 0.9rem;
  --inner-border-width: 0;
  --padding-bottom: 0.45rem;
  --padding-top: 0.45rem;
  border: 1px solid var(--t3-panel-border);
  border-radius: 0.9rem;
}

.choice-list ion-item.selected {
  border-color: var(--ion-color-primary);
  box-shadow: 0 0 0 1px rgba(var(--ion-color-primary-rgb), 0.25);
}

.choice-list h2,
.choice-list p {
  margin: 0;
}

.choice-list h2 {
  font-size: 0.95rem;
  font-weight: 700;
}

.choice-list p {
  color: var(--ion-color-medium);
  font-size: 0.82rem;
  line-height: 1.35;
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

.connection-tool-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid var(--t3-panel-border);
  border-radius: 1rem;
  background: var(--t3-panel-background);
  padding: 1rem;
}

.connection-tool-head h2,
.connection-tool-head p {
  margin: 0;
}

.connection-tool-head h2 {
  font-size: 1.35rem;
}

.connection-tool-head p:not(.eyebrow) {
  color: var(--ion-color-medium);
  line-height: 1.4;
}

.tool-summary {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  color: var(--ion-color-medium);
  font-size: 0.9rem;
}

.diff-toolbar,
.files-toolbar,
.git-toolbar,
.terminal-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid var(--t3-panel-border);
  border-radius: 1rem;
  background: var(--t3-panel-background);
  padding: 1rem;
}

.diff-toolbar h2,
.diff-toolbar p,
.files-toolbar h2,
.files-toolbar p,
.git-toolbar h2,
.git-toolbar p,
.terminal-toolbar h2,
.terminal-toolbar p {
  margin: 0;
}

.diff-toolbar h2,
.files-toolbar h2,
.git-toolbar h2,
.terminal-toolbar h2 {
  font-size: 1.25rem;
  line-height: 1.2;
}

.diff-toolbar p:not(.eyebrow),
.files-toolbar p:not(.eyebrow),
.git-toolbar p:not(.eyebrow),
.terminal-toolbar p:not(.eyebrow) {
  color: var(--ion-color-medium);
  line-height: 1.45;
}

.diff-actions,
.diff-file-list,
.git-actions,
.path-controls,
.terminal-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.diff-actions ion-button,
.git-actions ion-button,
.terminal-actions ion-button {
  margin: 0;
}

.diff-toggle {
  --background: var(--t3-panel-background);
  --border-radius: 999px;
  --inner-border-width: 0;
  --min-height: 2.25rem;
  max-width: 100%;
  border: 1px solid var(--t3-panel-border);
  border-radius: 999px;
}

.diff-file-list {
  color: var(--ion-color-medium);
  font-size: 0.86rem;
}

.diff-files,
.file-list,
.git-files,
.git-progress {
  border: 1px solid var(--t3-panel-border);
  border-radius: var(--t3-panel-radius);
  background: var(--t3-panel-background);
  overflow: hidden;
}

.diff-files h2,
.diff-files p,
.file-list h2,
.file-list p,
.git-files h2,
.git-files p,
.git-progress h2,
.git-progress p {
  margin: 0;
}

.diff-files h2,
.file-list h2,
.git-files h2 {
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.82rem;
}

.git-progress h2 {
  font-size: 0.9rem;
  font-weight: 700;
}

.git-progress p {
  white-space: pre-wrap;
  color: var(--ion-color-medium);
  font-size: 0.78rem;
  line-height: 1.45;
}

.git-commit-message {
  --background: var(--t3-panel-background);
  --border-radius: var(--t3-panel-radius);
  --padding-bottom: 0.75rem;
  --padding-end: 0.85rem;
  --padding-start: 0.85rem;
  --padding-top: 0.75rem;
  border: 1px solid var(--t3-panel-border);
  border-radius: var(--t3-panel-radius);
}

.path-input {
  --background: var(--t3-panel-background);
  --border-radius: 999px;
  --padding-end: 0.85rem;
  --padding-start: 0.85rem;
  border: 1px solid var(--t3-panel-border);
  border-radius: 999px;
  min-height: 2.35rem;
}

.clone-panel {
  display: grid;
  gap: 0.65rem;
  border: 1px solid var(--t3-panel-border);
  border-radius: var(--t3-panel-radius);
  background: var(--t3-panel-background);
  padding: 0.9rem;
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
  align-items: center;
  gap: 0.5rem;
}

.terminal-input ion-input {
  --background: transparent;
  --padding-bottom: 0;
  --padding-end: 0;
  --padding-start: 0;
  --padding-top: 0;
  min-height: 1.75rem;
}

.terminal-input ion-button {
  margin: 0;
}

.chat-footer {
  padding-bottom: env(safe-area-inset-bottom);
}

.composer-shell {
  width: 100%;
  max-width: var(--t3-page-max-width);
  margin: 0 auto;
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
