import type MarkdownIt from "markdown-it";
import { renderToString } from "katex";

/** The same dollar-delimited notation used by the editor, rendered with trust disabled. */
export function mathPlugin(md: MarkdownIt) {
  md.inline.ruler.before("escape", "math", (state, silent) => {
    const start = state.pos;
    if (
      state.src[start] !== "$" ||
      state.src[start + 1] === "$" ||
      /\s/.test(state.src[start + 1] ?? "")
    )
      return false;
    for (let end = start + 1; end < state.posMax; end++) {
      if (state.src[end] === "\\") {
        end++;
        continue;
      }
      if (state.src[end] !== "$") continue;
      if (/\s/.test(state.src[end - 1]) || /\d/.test(state.src[end + 1] ?? ""))
        return false;
      if (!silent) {
        const token = state.push("math_inline", "math", 0);
        token.content = state.src.slice(start + 1, end);
      }
      state.pos = end + 1;
      return true;
    }
    return false;
  });
  md.block.ruler.before("fence", "math_block", (state, start, end, silent) => {
    const from = state.bMarks[start] + state.tShift[start];
    if (!state.src.slice(from, state.eMarks[start]).startsWith("$$"))
      return false;
    let last = start;
    let source = state.src.slice(from + 2, state.eMarks[start]);
    if (source.trimEnd().endsWith("$$")) source = source.trimEnd().slice(0, -2);
    else {
      let closed = false;
      for (last = start + 1; last < end; last++) {
        const line = state.src.slice(
          state.bMarks[last] + state.tShift[last],
          state.eMarks[last],
        );
        if (line.trim() === "$$") {
          closed = true;
          break;
        }
        source += "\n" + line;
      }
      if (!closed) return false;
    }
    if (silent) return true;
    const token = state.push("math_block", "math", 0);
    token.block = true;
    token.content = source;
    token.map = [start, last + 1];
    state.line = last + 1;
    return true;
  });
  // Native MathML keeps exported documents self-contained, without KaTeX font assets.
  for (const type of ["math_inline", "math_block"])
    md.renderer.rules[type] = (tokens, index) =>
      renderToString(tokens[index].content, {
        output: "mathml",
        displayMode: type === "math_block",
        trust: false,
        throwOnError: false,
        maxExpand: 1000,
      });
}
