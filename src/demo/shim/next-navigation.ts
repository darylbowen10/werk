// Browser demo: minimal router. Routes are views inside the single page.
export const nav = new EventTarget();
export let currentRoute = "/signup";
export function go(path: string) { currentRoute = path.split("?")[0]; nav.dispatchEvent(new Event("change")); }
export function useRouter() { return { push: go, replace: go, refresh: () => {}, back: () => {} }; }
export function redirect(path: string): never { go(path); throw new Error("redirect"); }
