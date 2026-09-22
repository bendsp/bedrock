import { safeMarkdownHtml } from "./markdown";
import { MAX_EXPORT_HTML_BYTES } from "../../shared/limits";
export const markdownToHtml = (markdown: string): string =>
  safeMarkdownHtml(markdown);

/** Embed local raster images so moving an exported document cannot break its pictures. */
export async function markdownToExportHtml(markdown: string): Promise<string> {
  const content = document.createElement("div");
  content.innerHTML = markdownToHtml(markdown);
  const encoder = new TextEncoder();
  let bytes = encoder.encode(content.innerHTML).length;
  const checkSize = () => {
    if (bytes > MAX_EXPORT_HTML_BYTES)
      throw new Error(
        "This export exceeds the 25 MB limit. Use smaller images or export fewer sections.",
      );
  };
  checkSize();
  const resolved = new Map<string, string>();
  // Bound disk/IPC work and count each embedded copy before expanding the DOM.
  for (const image of content.querySelectorAll("img")) {
    const source = image.getAttribute("src");
    image.loading = "eager";
    image.referrerPolicy = "no-referrer";
    if (source && !/^https:\/\//i.test(source)) {
      const data =
        resolved.get(source) ?? (await window.electronAPI.resolveImage(source));
      if (!data)
        throw new Error(
          `Cannot export the image "${image.alt || source}". Check its relative path.`,
        );
      bytes += data.length;
      checkSize();
      resolved.set(source, data);
      image.src = data;
    }
  }
  const html = content.innerHTML;
  bytes = encoder.encode(html).length;
  checkSize();
  return html;
}
