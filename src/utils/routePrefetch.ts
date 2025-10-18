const routeLoaders = {
  "/clipboard": () => import("@/pages/Clipboard.vue"),
  "/history": () => import("@/pages/History.vue"),
  "/ai": () => import("@/pages/AiTools.vue"),
  "/settings": () => import("@/pages/Settings.vue"),
} as const;

export type RoutePrefetchKey = keyof typeof routeLoaders;

const warmedRoutes = new Map<RoutePrefetchKey, Promise<unknown>>();

function runLoader(path: RoutePrefetchKey) {
  const loader = routeLoaders[path];
  const task = loader()
    .catch(error => {
      console.warn(`[route-prefetch] failed to warm route ${path}`, error);
      warmedRoutes.delete(path);
      throw error;
    })
    .then(result => {
      return result;
    });
  warmedRoutes.set(path, task);
  return task;
}

export function prefetchRoute(path: RoutePrefetchKey) {
  const existing = warmedRoutes.get(path);
  if (existing) {
    return existing;
  }
  return runLoader(path);
}

const defaultTargets = Object.keys(routeLoaders) as RoutePrefetchKey[];

export function warmRoutes(paths: RoutePrefetchKey[] = defaultTargets) {
  const tasks = paths
    .map(path => prefetchRoute(path))
    .filter((task): task is Promise<unknown> => Boolean(task));
  return Promise.all(tasks);
}

type IdleScheduler = (
  callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
  options?: { timeout?: number }
) => number;

export function scheduleWarmRoutes(paths: RoutePrefetchKey[] = defaultTargets) {
  if (typeof window === "undefined") {
    return warmRoutes(paths);
  }
  const idle = (window as typeof window & { requestIdleCallback?: IdleScheduler }).requestIdleCallback;
  const runner = () => {
    void warmRoutes(paths);
  };
  if (typeof idle === "function") {
    idle(
      () => {
        runner();
      },
      { timeout: 1200 }
    );
    return;
  }
  window.setTimeout(runner, 240);
}
