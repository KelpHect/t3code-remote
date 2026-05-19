<template>
  <div class="mobile-markdown" :class="{ streaming }">
    <template v-for="block in blocks" :key="block.id">
      <component :is="headingTag(block)" v-if="block.kind === 'heading'" class="md-heading">
        <InlineMarkdown :text="block.text" />
      </component>

      <p v-else-if="block.kind === 'paragraph'" class="md-paragraph">
        <InlineMarkdown :text="block.text" />
      </p>

      <ol v-else-if="block.kind === 'list' && block.ordered" class="md-list">
        <li v-for="(item, index) in block.items" :key="`${block.id}-${index}`">
          <InlineMarkdown :text="item" />
        </li>
      </ol>

      <ul v-else-if="block.kind === 'list'" class="md-list">
        <li v-for="(item, index) in block.items" :key="`${block.id}-${index}`">
          <InlineMarkdown :text="item" />
        </li>
      </ul>

      <blockquote v-else-if="block.kind === 'quote'" class="md-quote">
        <InlineMarkdown :text="block.text" />
      </blockquote>

      <section v-else-if="block.kind === 'code'" class="md-code-block">
        <header>
          <span>{{ block.language ?? "text" }}</span>
          <ion-button fill="clear" size="small" @click="copyBlock(block.id, block.code)">
            <ion-icon
              slot="icon-only"
              :icon="copiedBlockId === block.id ? checkmarkOutline : copyOutline"
            />
          </ion-button>
        </header>
        <pre><code>{{ block.code }}</code></pre>
      </section>

      <hr v-else class="md-rule" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import { checkmarkOutline, copyOutline } from "ionicons/icons";

import {
  parseMobileMarkdown,
  parseMobileMarkdownInline,
  type MobileMarkdownBlock,
} from "@/client/mobileMarkdown";

const props = defineProps<{
  readonly text: string;
  readonly streaming?: boolean;
}>();

const copiedBlockId = ref<string | null>(null);
const blocks = computed(() => parseMobileMarkdown(props.text));

const headingTag = (block: MobileMarkdownBlock) =>
  block.kind === "heading" ? (`h${block.level}` as const) : "p";

const copyBlock = async (id: string, text: string) => {
  try {
    await globalThis.navigator?.clipboard?.writeText(text);
    copiedBlockId.value = id;
    globalThis.setTimeout(() => {
      if (copiedBlockId.value === id) copiedBlockId.value = null;
    }, 1200);
  } catch {
    copiedBlockId.value = null;
  }
};

const InlineMarkdown = defineComponent({
  name: "InlineMarkdown",
  props: {
    text: {
      required: true,
      type: String,
    },
  },
  setup(inlineProps) {
    return () =>
      h(
        "span",
        { class: "md-inline" },
        parseMobileMarkdownInline(inlineProps.text).map((token, index) => {
          if (token.kind === "code") {
            return h("code", { key: index, class: "md-inline-code" }, token.text);
          }
          if (token.kind === "link") {
            return h(
              "a",
              {
                key: index,
                href: token.href,
                rel: "noreferrer",
                target: "_blank",
              },
              token.text,
            );
          }
          return token.text;
        }),
      );
  },
});
</script>

<style scoped>
.mobile-markdown {
  display: grid;
  gap: 0.55rem;
  overflow-wrap: anywhere;
}

.mobile-markdown.streaming::after {
  width: 0.5rem;
  height: 1rem;
  display: inline-block;
  border-radius: 999px;
  background: currentColor;
  content: "";
  opacity: 0.42;
  animation: cursorBlink 1s infinite;
}

.md-heading,
.md-paragraph,
.md-list,
.md-quote {
  margin: 0;
  line-height: 1.55;
}

.md-heading {
  font-weight: 760;
  line-height: 1.25;
}

h1.md-heading {
  font-size: 1.25rem;
}

h2.md-heading {
  font-size: 1.08rem;
}

h3.md-heading {
  font-size: 0.98rem;
}

.md-list {
  display: grid;
  gap: 0.35rem;
  padding-inline-start: 1.25rem;
}

.md-quote {
  border-left: 3px solid var(--ion-color-primary);
  padding-left: 0.75rem;
  color: var(--ion-color-medium);
}

.md-code-block {
  overflow: hidden;
  border: 1px solid var(--t3-panel-border);
  border-radius: 0.9rem;
  background: var(--t3-code-background, var(--t3-panel-background));
}

.md-code-block header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 2.2rem;
  border-bottom: 1px solid var(--t3-panel-border);
  padding: 0.25rem 0.45rem 0.25rem 0.75rem;
  color: var(--ion-color-medium);
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.72rem;
}

.md-code-block ion-button {
  width: 2rem;
  height: 2rem;
  margin: 0;
}

.md-code-block pre {
  overflow: auto;
  margin: 0;
  padding: 0.8rem;
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.8rem;
  line-height: 1.55;
}

.md-rule {
  width: 100%;
  border: 0;
  border-top: 1px solid var(--t3-panel-border);
}

:deep(.md-inline-code) {
  border: 1px solid var(--t3-panel-border);
  border-radius: 0.35rem;
  background: var(--t3-muted-surface);
  padding: 0.06rem 0.28rem;
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.88em;
}

:deep(.md-inline a) {
  color: var(--ion-color-primary);
  text-decoration: none;
}

@keyframes cursorBlink {
  0%,
  45% {
    opacity: 0.42;
  }
  46%,
  100% {
    opacity: 0;
  }
}
</style>
