const dialogLayers: HTMLElement[] = [];

/** Opening order also covers inline confirmations above portalled workbenches. */
export function registerDialog(element: HTMLElement | null): () => void {
  if (!element) return () => {};
  dialogLayers.push(element);
  return () => {
    const index = dialogLayers.lastIndexOf(element);
    if (index >= 0) dialogLayers.splice(index, 1);
  };
}

export function isTopmostDialog(element: HTMLElement | null): boolean {
  return Boolean(element && dialogLayers.at(-1) === element);
}
