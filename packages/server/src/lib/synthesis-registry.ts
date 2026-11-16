type ActiveSynthesis = {
  controller: AbortController;
  finished: Promise<void>;
  finish: () => void;
};

const active = new Map<string, Set<ActiveSynthesis>>();

export function registerSynthesisAbort(chapterId: string): AbortController {
  const controller = new AbortController();
  let finish: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const runs = active.get(chapterId) ?? new Set<ActiveSynthesis>();
  runs.add({ controller, finished, finish });
  active.set(chapterId, runs);
  return controller;
}

export function clearSynthesisAbort(chapterId: string, controller: AbortController): void {
  const runs = active.get(chapterId);
  const run = runs && [...runs].find((entry) => entry.controller === controller);
  if (!runs || !run) return;
  runs.delete(run);
  run.finish();
  if (runs.size === 0) active.delete(chapterId);
}

export async function abortSynthesis(chapterId: string): Promise<void> {
  const runs = [...(active.get(chapterId) ?? [])];
  for (const run of runs) run.controller.abort();
  await Promise.all(runs.map((run) => run.finished));
}

export function synthesisRunning(chapterId: string): boolean {
  return (active.get(chapterId)?.size ?? 0) > 0;
}
