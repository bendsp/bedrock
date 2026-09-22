const pending = new WeakMap<HTMLImageElement, () => void>();
const disposers = new WeakMap<HTMLElement, () => void>();

export function disposeMarkdownImages(element: HTMLElement): void {
  disposers.get(element)?.();
  disposers.delete(element);
}
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const image = entry.target as HTMLImageElement;
    if (!entry.isIntersecting && image.isConnected) continue;
    observer.unobserve(image);
    const load = pending.get(image);
    pending.delete(image);
    if (image.isConnected) load?.();
  }
});
const queue: Array<() => Promise<void>> = [];
let running = 0;
function schedule(job: () => Promise<void>) {
  queue.push(job);
  drain();
}
function drain() {
  while (running < 3 && queue.length) {
    const job = queue.shift();
    if (!job) break;
    running++;
    void job().finally(() => {
      running--;
      drain();
    });
  }
}
// Only concurrent reads are shared; a changed file or Save As resolves afresh.
const requests = new WeakMap<object, Map<string, Promise<string | null>>>();
function resolve(source: string, scope: object) {
  const inFlight =
    requests.get(scope) ?? new Map<string, Promise<string | null>>();
  requests.set(scope, inFlight);
  let result = inFlight.get(source);
  if (!result) {
    result = window.electronAPI.resolveImage(source);
    inFlight.set(source, result);
    void result
      .finally(() => inFlight.delete(source))
      .catch((): undefined => undefined);
  }
  return result;
}

/** Resolve visible note-relative images with bounded IPC concurrency. */
export function hydrateMarkdownImages(
  element: HTMLElement,
  measured: () => void,
  scope: object,
): void {
  disposeMarkdownImages(element);
  let disposed = false;
  const cleanup: Array<() => void> = [];
  disposers.set(element, () => {
    disposed = true;
    for (const dispose of cleanup) dispose();
  });
  for (const image of element.querySelectorAll("img")) {
    const source = image.getAttribute("src");
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    const unavailable = () => {
      if (disposed) return;
      image.classList.add("cm-md-image-error");
      image.title = "Image unavailable. Check its relative path.";
    };
    if (source && !/^https:\/\//i.test(source)) {
      image.removeAttribute("src");
      pending.set(image, () =>
        schedule(async () => {
          if (disposed || !image.isConnected) return;
          try {
            const data = await resolve(source, scope);
            if (disposed || !image.isConnected) return;
            if (data) image.src = data;
            else unavailable();
          } catch {
            unavailable();
          }
        }),
      );
      observer.observe(image);
    }
    image.addEventListener("load", measured);
    image.addEventListener("error", unavailable);
    cleanup.push(() => {
      observer.unobserve(image);
      pending.delete(image);
      image.removeEventListener("load", measured);
      image.removeEventListener("error", unavailable);
    });
  }
}
