export type MobileMarkdownInlineToken =
  | {
      readonly kind: "text";
      readonly text: string;
    }
  | {
      readonly kind: "code";
      readonly text: string;
    }
  | {
      readonly kind: "link";
      readonly text: string;
      readonly href: string;
    };

export type MobileMarkdownBlock =
  | {
      readonly kind: "paragraph";
      readonly id: string;
      readonly text: string;
    }
  | {
      readonly kind: "heading";
      readonly id: string;
      readonly level: 1 | 2 | 3;
      readonly text: string;
    }
  | {
      readonly kind: "list";
      readonly id: string;
      readonly ordered: boolean;
      readonly items: readonly string[];
    }
  | {
      readonly kind: "quote";
      readonly id: string;
      readonly text: string;
    }
  | {
      readonly kind: "code";
      readonly id: string;
      readonly language: string | null;
      readonly code: string;
    }
  | {
      readonly kind: "rule";
      readonly id: string;
    };

export function parseMobileMarkdown(input: string): readonly MobileMarkdownBlock[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const blocks: MobileMarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  let code: { language: string | null; lines: string[] } | null = null;

  const pushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({
      id: `paragraph-${blocks.length}`,
      kind: "paragraph",
      text: paragraph.join("\n").trim(),
    });
    paragraph = [];
  };
  const pushList = () => {
    if (!list) return;
    blocks.push({
      id: `list-${blocks.length}`,
      items: list.items,
      kind: "list",
      ordered: list.ordered,
    });
    list = null;
  };
  const pushQuote = () => {
    if (quote.length === 0) return;
    blocks.push({
      id: `quote-${blocks.length}`,
      kind: "quote",
      text: quote.join("\n").trim(),
    });
    quote = [];
  };
  const pushOpenTextBlocks = () => {
    pushParagraph();
    pushList();
    pushQuote();
  };

  for (const rawLine of lines) {
    const fence = /^```([\w.+-]*)\s*$/.exec(rawLine.trim());
    if (fence) {
      if (code) {
        blocks.push({
          code: code.lines.join("\n"),
          id: `code-${blocks.length}`,
          kind: "code",
          language: code.language,
        });
        code = null;
      } else {
        pushOpenTextBlocks();
        code = {
          language: fence[1]?.trim() || null,
          lines: [],
        };
      }
      continue;
    }

    if (code) {
      code.lines.push(rawLine);
      continue;
    }

    const line = rawLine.trimEnd();
    if (line.trim().length === 0) {
      pushOpenTextBlocks();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      pushOpenTextBlocks();
      blocks.push({
        id: `heading-${blocks.length}`,
        kind: "heading",
        level: Math.min(heading[1]?.length ?? 1, 3) as 1 | 2 | 3,
        text: heading[2]?.trim() ?? "",
      });
      continue;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      pushOpenTextBlocks();
      blocks.push({ id: `rule-${blocks.length}`, kind: "rule" });
      continue;
    }

    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    const listItem = unordered ?? ordered;
    if (listItem) {
      pushParagraph();
      pushQuote();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        pushList();
        list = { items: [], ordered: isOrdered };
      }
      list.items.push(listItem[1]?.trim() ?? "");
      continue;
    }

    const quoted = /^\s*>\s?(.*)$/.exec(line);
    if (quoted) {
      pushParagraph();
      pushList();
      quote.push(quoted[1] ?? "");
      continue;
    }

    pushList();
    pushQuote();
    paragraph.push(line);
  }

  if (code) {
    blocks.push({
      code: code.lines.join("\n"),
      id: `code-${blocks.length}`,
      kind: "code",
      language: code.language,
    });
  }
  pushOpenTextBlocks();

  return blocks.length > 0
    ? blocks
    : [
        {
          id: "paragraph-empty",
          kind: "paragraph",
          text: "",
        },
      ];
}

export function parseMobileMarkdownInline(input: string): readonly MobileMarkdownInlineToken[] {
  const tokens: MobileMarkdownInlineToken[] = [];
  const pattern = /(`[^`\n]+`)|(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let cursor = 0;
  for (const match of input.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      tokens.push({ kind: "text", text: input.slice(cursor, index) });
    }
    if (match[1]) {
      tokens.push({ kind: "code", text: match[1].slice(1, -1) });
    } else if (match[3] && match[4]) {
      tokens.push({ href: match[4], kind: "link", text: match[3] });
    }
    cursor = index + match[0].length;
  }
  if (cursor < input.length) {
    tokens.push({ kind: "text", text: input.slice(cursor) });
  }
  return tokens;
}
