import { EditorSelection, ChangeSpec } from "@codemirror/state";
import { KeyBinding } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

export const createSnippetCommand =
  (snippet: string, cursorOffset: number) =>
  (view: import("@codemirror/view").EditorView): boolean => {
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: snippet },
      selection: { anchor: from + cursorOffset },
      scrollIntoView: true,
    });
    return true;
  };

type WrapSelectionOptions = {
  before: string;
  after: string;
  /**
   * Optional node name to check for toggling (e.g. "StrongEmphasis").
   */
  nodeName?: string;
  /**
   * Inserted when there's no selection. Defaults to `${before}${after}`.
   */
  emptySnippet?: string;
  /**
   * Cursor position (relative to `from`) after inserting `emptySnippet`.
   * Defaults to `before.length`.
   */
  emptyCursorOffset?: number;
};

const findNodeInRange = (
  view: import("@codemirror/view").EditorView,
  from: number,
  to: number,
  name: string,
): SyntaxNode | null => {
  let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(
    from === to ? from : from + 1,
    1,
  );
  while (node) {
    if (node.name === name && node.from <= from && node.to >= to) return node;
    node = node.parent;
  }
  return null;
};

const wrap =
  (options: WrapSelectionOptions, word: boolean) =>
  (view: import("@codemirror/view").EditorView): boolean => {
    const state = view.state;
    let { from, to } = state.selection.main;
    const node = options.nodeName
      ? findNodeInRange(view, from, to, options.nodeName)
      : null;
    if (node) {
      const first = node.firstChild,
        last = node.lastChild;
      if (
        first &&
        last &&
        first !== last &&
        /Mark$/.test(first.name) &&
        /Mark$/.test(last.name)
      ) {
        const content = state.doc.sliceString(first.to, last.from);
        const padding =
          options.nodeName === "InlineCode" &&
          content.startsWith(" ") &&
          content.endsWith(" ") &&
          content.trim()
            ? 1
            : 0;
        const changes = state.changes([
          { from: first.from, to: first.to + padding },
          { from: last.from - padding, to: last.to },
        ]);
        view.dispatch({
          changes,
          selection: state.selection.map(changes),
          scrollIntoView: true,
          userEvent: "input.format",
        });
        return true;
      }
    }
    if (from === to && word) {
      const range =
        state.wordAt(from) ?? (from ? state.wordAt(from - 1) : null);
      if (range) {
        from = range.from;
        to = range.to;
      }
    }
    if (from === to) {
      const snippet =
        options.emptySnippet ?? `${options.before}${options.after}`;
      view.dispatch({
        changes: { from, to, insert: snippet },
        selection: {
          anchor: from + (options.emptyCursorOffset ?? options.before.length),
        },
        scrollIntoView: true,
        userEvent: "input.format",
      });
      return true;
    }
    let text = state.doc.sliceString(from, to);
    if (text.trim()) {
      from += text.length - text.trimStart().length;
      to -= text.length - text.trimEnd().length;
      text = text.trim();
    }
    let before = options.before,
      after = options.after;
    if (options.nodeName === "InlineCode") {
      const longest = Math.max(
        0,
        ...(text.match(/`+/g) ?? []).map((run) => run.length),
      );
      const fence = "`".repeat(longest + 1);
      const pad =
        /^`|`$/.test(text) ||
        (text.startsWith(" ") && text.endsWith(" ") && text.trim())
          ? " "
          : "";
      before = fence + pad;
      after = pad + fence;
    }
    view.dispatch({
      changes: { from, to, insert: `${before}${text}${after}` },
      selection: {
        anchor: from + before.length,
        head: from + before.length + text.length,
      },
      scrollIntoView: true,
      userEvent: "input.format",
    });
    return true;
  };
export const createWrapSelectionCommand = (options: WrapSelectionOptions) =>
  wrap(options, false);
export const createWrapSelectionOrWordCommand = (
  options: WrapSelectionOptions & { wrapWordWhenEmpty?: boolean },
) => wrap(options, options.wrapWordWhenEmpty !== false);

export const createMarkdownLinkCommand = (
  view: import("@codemirror/view").EditorView,
): boolean => {
  let { from, to } = view.state.selection.main;
  const urlPlaceholder = "https://";

  if (from === to) {
    const snippet = `[](${urlPlaceholder})`;
    view.dispatch({
      changes: { from, to, insert: snippet },
      selection: { anchor: from + 1 },
      scrollIntoView: true,
    });
    return true;
  }

  let selectedText = view.state.doc.sliceString(from, to);

  // Trim whitespace from the selection so that markers "stick" to the text.
  const trimmedStart = selectedText.length - selectedText.trimStart().length;
  const trimmedEnd = selectedText.length - selectedText.trimEnd().length;

  // Only apply trimming if there's actual text remaining
  if (trimmedStart + trimmedEnd < selectedText.length) {
    from += trimmedStart;
    to -= trimmedEnd;
    selectedText = selectedText.trim();
  }

  const insert = `[${selectedText}](${urlPlaceholder})`;
  const urlStart = from + 1 + selectedText.length + 2; // "[" + text + "]("

  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlStart + urlPlaceholder.length },
    scrollIntoView: true,
  });
  return true;
};

export const insertHorizontalRuleCommand = (
  view: import("@codemirror/view").EditorView,
): boolean => {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const isLastLine = line.number === view.state.doc.lines;

  let insert = "";
  let fromPos = 0;
  let toPos = 0;

  // If we're on an empty line, check if the previous line is also blank.
  if (line.text.trim() === "") {
    const isFirstLine = line.number === 1;
    const prevLineBlank =
      isFirstLine || view.state.doc.line(line.number - 1).text.trim() === "";

    fromPos = line.from;
    toPos = line.to;

    if (prevLineBlank) {
      insert = "---";
    } else {
      // Need a blank line before
      insert = "\n---";
    }
  } else {
    // Insert on a new line after the current line, ensuring a blank line before the rule
    fromPos = line.to;
    toPos = line.to;
    insert = "\n\n---";
  }

  // If it's the last line, we MUST add a newline to move the cursor to a new line after the rule
  if (isLastLine) {
    insert += "\n";
  }

  // The anchor should be at the start of the next line.
  // If we added a newline (isLastLine), it's at the end of the insertion.
  // If we didn't (not last line), we move past the existing newline.
  const anchor = fromPos + insert.length + (isLastLine ? 0 : 1);

  view.dispatch({
    changes: { from: fromPos, to: toPos, insert },
    selection: { anchor },
    scrollIntoView: true,
  });

  return true;
};

type LinePrefixOptions = {
  match: RegExp;
  prefixForLine: (lineIndex: number) => string;
};

const getSelectedLineNumbers = (
  view: import("@codemirror/view").EditorView,
) => {
  const { from, to } = view.state.selection.main;
  return {
    start: view.state.doc.lineAt(from).number,
    end: view.state.doc.lineAt(to > from ? to - 1 : to).number,
  };
};

function dispatchLineChanges(
  view: import("@codemirror/view").EditorView,
  specs: ChangeSpec,
) {
  const changes = view.state.changes(specs);
  const selection = EditorSelection.create(
    view.state.selection.ranges.map((range) =>
      EditorSelection.range(
        changes.mapPos(range.anchor, 1),
        changes.mapPos(range.head, 1),
      ),
    ),
    view.state.selection.mainIndex,
  );
  view.dispatch({
    changes,
    selection,
    scrollIntoView: true,
    userEvent: "input.format",
  });
}

/** Container markers belong to the quote/list, not to the text being formatted. */
function lineContentStart(
  view: import("@codemirror/view").EditorView,
  number: number,
  includeList = true,
): number {
  const line = view.state.doc.line(number);
  let start = line.from + (line.text.match(/^[ \t]*/)?.[0].length ?? 0);
  syntaxTree(view.state).iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      if (
        node.from >= line.from &&
        node.to <= line.to &&
        (node.name === "QuoteMark" || (includeList && node.name === "ListMark"))
      )
        start = Math.max(start, node.to);
    },
  });
  while (
    start < line.to &&
    /[ \t]/.test(view.state.doc.sliceString(start, start + 1))
  )
    start++;
  return start;
}

const toggleLinePrefix = (
  view: import("@codemirror/view").EditorView,
  options: LinePrefixOptions,
): boolean => {
  const { start, end } = getSelectedLineNumbers(view);
  const quote = options.prefixForLine(0) === "> ";
  const lines = [];
  for (let n = start; n <= end; n++) {
    const line = view.state.doc.line(n);
    let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(
      line.to,
      -1,
    );
    while (
      node &&
      !["FencedCode", "CodeBlock", "Frontmatter"].includes(node.name)
    )
      node = node.parent;
    if (node) continue;
    // Quote toggles operate on the outermost quote; lists keep all quote markers.
    const from = quote
      ? line.from + (line.text.match(/^[ \t]*/)?.[0].length ?? 0)
      : lineContentStart(view, n, false);
    if (line.text.trim() || start === end)
      lines.push({
        line,
        from,
        text: view.state.doc.sliceString(from, line.to),
      });
  }
  if (!lines.length) return false;
  const remove = lines.every((item) => options.match.test(item.text));
  dispatchLineChanges(
    view,
    lines.map((item, index) => {
      const marker = remove
        ? item.text.match(options.match)
        : quote
          ? null
          : item.text.match(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/);
      return {
        from: item.from,
        to: item.from + (marker?.[0].length ?? 0),
        insert: remove ? "" : options.prefixForLine(index),
      };
    }),
  );
  return true;
};

export const toggleUnorderedListCommand = (
  view: import("@codemirror/view").EditorView,
): boolean =>
  toggleLinePrefix(view, {
    match: /^\s*(?:[-*+]\s+)(?!\[[ xX]\]\s)/,
    prefixForLine: () => "- ",
  });

export const toggleOrderedListCommand = (
  view: import("@codemirror/view").EditorView,
): boolean =>
  toggleLinePrefix(view, {
    match: /^\s*(?:\d+[.)]\s+)/,
    prefixForLine: (lineIndex) => `${lineIndex + 1}. `,
  });

export const toggleTaskListCommand = (
  view: import("@codemirror/view").EditorView,
): boolean =>
  toggleLinePrefix(view, {
    match: /^\s*(?:[-*+]\s+\[[ xX]\]\s+)/,
    prefixForLine: () => "- [ ] ",
  });

export const toggleTaskCheckCommand = (
  view: import("@codemirror/view").EditorView,
  from?: number,
  to = from,
): boolean => {
  const { start, end } =
    from === undefined
      ? getSelectedLineNumbers(view)
      : {
          start: view.state.doc.lineAt(from).number,
          end: view.state.doc.lineAt(to ?? from).number,
        };
  const markers: Array<{ from: number; to: number; checked: boolean }> = [];
  syntaxTree(view.state).iterate({
    from: view.state.doc.line(start).from,
    to: view.state.doc.line(end).to,
    enter(node) {
      if (node.name === "TaskMarker")
        markers.push({
          from: node.from + 1,
          to: node.to - 1,
          checked: /[xX]/.test(view.state.doc.sliceString(node.from, node.to)),
        });
    },
  });
  if (!markers.length) return false;
  const checked = !markers.every((marker) => marker.checked);
  view.dispatch({
    changes: markers.map((marker) => ({
      from: marker.from,
      to: marker.to,
      insert: checked ? "x" : " ",
    })),
    userEvent: "input.format",
  });
  return true;
};

export const toggleBlockquoteCommand = (
  view: import("@codemirror/view").EditorView,
): boolean =>
  toggleLinePrefix(view, {
    match: /^\s*(?:>\s?)/,
    prefixForLine: () => "> ",
  });

export const toggleFencedCodeBlockCommand = (
  view: import("@codemirror/view").EditorView,
): boolean => {
  const { from, to } = view.state.selection.main;
  let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(from, 1);
  while (node && node.name !== "FencedCode") node = node.parent;
  const doc = view.state.doc;
  if (node && node.to >= to) {
    const marks = node.getChildren("CodeMark");
    if (marks.length === 2) {
      const first = doc.lineAt(marks[0].from),
        last = doc.lineAt(marks[1].from);
      const innerFrom = Math.min(first.to + 1, doc.length),
        innerTo = Math.max(innerFrom, last.from - 1);
      const firstPrefix = doc.sliceString(first.from, marks[0].from);
      const lastPrefix = doc.sliceString(last.from, marks[1].from);
      const lines = doc.sliceString(innerFrom, innerTo).split("\n");
      if (lines[0]?.startsWith(lastPrefix))
        lines[0] = firstPrefix + lines[0].slice(lastPrefix.length);
      else if (firstPrefix) lines[0] = firstPrefix + lines[0];
      const inner = lines.join("\n");
      view.dispatch({
        changes: { from: first.from, to: last.to, insert: inner },
        selection: { anchor: first.from, head: first.from + inner.length },
        scrollIntoView: true,
        userEvent: "input.format",
      });
      return true;
    }
  }
  const { start, end } = getSelectedLineNumbers(view);
  const first = doc.line(start),
    last = doc.line(end);
  const text = doc.sliceString(first.from, last.to);
  const size = Math.max(
    3,
    ...(text.match(/`+/g) ?? []).map((run) => run.length + 1),
  );
  const fence = "`".repeat(size);
  const indent = first.text.match(/^\s*/)?.[0] ?? "";
  const content = text.trim() ? text : indent;
  const before = `${indent}${fence}\n`;
  const insert = `${before}${content}\n${indent}${fence}`;
  view.dispatch({
    changes: { from: first.from, to: last.to, insert },
    selection: {
      anchor: first.from + before.length + (text.trim() ? 0 : indent.length),
    },
    scrollIntoView: true,
    userEvent: "input.format",
  });
  return true;
};

export const snippetKeyBinding = (
  key: string,
  snippet: string,
  cursorOffset: number,
): KeyBinding => ({
  key,
  preventDefault: true,
  run: createSnippetCommand(snippet, cursorOffset),
});

export const wrapSelectionKeyBinding = (
  key: string,
  options: WrapSelectionOptions,
): KeyBinding => ({
  key,
  preventDefault: true,
  run: createWrapSelectionCommand(options),
});

export const headingCommand =
  (level: 0 | 1 | 2 | 3 | 4 | 5 | 6) =>
  (view: import("@codemirror/view").EditorView): boolean => {
    const { start, end } = getSelectedLineNumbers(view);
    const doc = view.state.doc;
    const changes: ChangeSpec[] = [];
    const handled = new Set<number>();
    for (let n = start; n <= end; n++) {
      const line = doc.line(n);
      let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(
        line.to,
        -1,
      );
      while (
        node &&
        !/^(?:ATX|Setext)Heading|^(?:Paragraph|FencedCode|CodeBlock|Frontmatter)$/.test(
          node.name,
        )
      )
        node = node.parent;
      if (
        node?.name === "FencedCode" ||
        node?.name === "CodeBlock" ||
        node?.name === "Frontmatter"
      )
        continue;
      if (node && /^(ATX|Setext)Heading/.test(node.name)) {
        if (handled.has(node.from)) continue;
        handled.add(node.from);
        const newLevel = Number(node.name.slice(-1)) === level ? 0 : level;
        const prefix = newLevel ? "#".repeat(newLevel) + " " : "";
        const marks = node.getChildren("HeaderMark");
        if (node.name.startsWith("Setext")) {
          const first = doc.lineAt(node.from),
            underline = doc.lineAt(marks[0].from);
          const parts: string[] = [];
          for (let row = first.number; row < underline.number; row++)
            parts.push(
              doc.sliceString(lineContentStart(view, row), doc.line(row).to),
            );
          changes.push({
            from: node.from,
            to: node.to,
            insert: prefix + parts.join(" "),
          });
        } else {
          let to = marks[0].to;
          while (to < line.to && /[ \t]/.test(doc.sliceString(to, to + 1)))
            to++;
          changes.push({ from: node.from, to, insert: prefix });
          if (marks.length > 1) {
            let from = marks[1].from;
            while (from > to && /[ \t]/.test(doc.sliceString(from - 1, from)))
              from--;
            changes.push({ from, to: marks[1].to, insert: "" });
          }
        }
      } else if (level) {
        const from = lineContentStart(view, n);
        changes.push({ from, to: from, insert: "#".repeat(level) + " " });
      }
    }
    if (!changes.length) return false;
    dispatchLineChanges(view, changes);
    return true;
  };
export const insertImageCommand = createSnippetCommand(
  "![Image description](image.png)",
  2,
);
export const insertFootnoteCommand = (
  view: import("@codemirror/view").EditorView,
): boolean => {
  const doc = view.state.doc.toString();
  let id = 1;
  while (doc.includes(`[^${id}]`)) id++;
  const { from, to } = view.state.selection.main;
  const reference = `[^${id}]`;
  const suffix = `\n\n${reference}: Footnote text\n`;
  const changes = view.state.changes([
    { from, to, insert: reference },
    { from: doc.length, insert: suffix },
  ]);
  const start = changes.newLength - "Footnote text\n".length;
  view.dispatch({
    changes,
    selection: { anchor: start, head: start + 13 },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
};
