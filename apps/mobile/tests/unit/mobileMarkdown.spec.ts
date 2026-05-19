import { describe, expect, test } from "vitest";

import { parseMobileMarkdown, parseMobileMarkdownInline } from "@/client/mobileMarkdown";

describe("mobile markdown parser", () => {
  test("parses headings, paragraphs, lists, quotes, rules, and fenced code", () => {
    const blocks = parseMobileMarkdown(
      [
        "# Summary",
        "",
        "Use `bun run test` before shipping.",
        "",
        "- one",
        "- two",
        "",
        "> quoted",
        "",
        "---",
        "",
        "```ts",
        "const value = 1;",
        "```",
      ].join("\n"),
    );

    expect(blocks).toMatchObject([
      { kind: "heading", level: 1, text: "Summary" },
      { kind: "paragraph", text: "Use `bun run test` before shipping." },
      { items: ["one", "two"], kind: "list", ordered: false },
      { kind: "quote", text: "quoted" },
      { kind: "rule" },
      { code: "const value = 1;", kind: "code", language: "ts" },
    ]);
  });

  test("keeps raw html as text instead of producing renderable markup", () => {
    expect(parseMobileMarkdown("<img src=x onerror=alert(1)>")).toMatchObject([
      {
        kind: "paragraph",
        text: "<img src=x onerror=alert(1)>",
      },
    ]);
  });

  test("parses inline code and http links", () => {
    expect(parseMobileMarkdownInline("Open [docs](https://example.com) and run `test`.")).toEqual([
      { kind: "text", text: "Open " },
      { href: "https://example.com", kind: "link", text: "docs" },
      { kind: "text", text: " and run " },
      { kind: "code", text: "test" },
      { kind: "text", text: "." },
    ]);
  });
});
