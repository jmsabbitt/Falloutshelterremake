// Pixi's ticker only asks for the next animation frame after every listener
// returns, so one exception inside a frame would stop the game for good (a
// frozen screen, and no more autosaves). Each stage of a frame runs through
// this instead: an error is logged and the next frame still comes.

/** Errors already logged, by stage and message, so a stage that fails every frame doesn't flood the console. */
const seen = new Set<string>();
const MAX_SEEN = 50;

/** Run one stage of a frame. Returns false (after logging) if it threw. */
export function runStage(stage: string, fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch (err) {
    const key = `${stage}: ${err instanceof Error ? err.message : String(err)}`;
    if (!seen.has(key) && seen.size < MAX_SEEN) {
      seen.add(key);
      console.error(`Frame error in ${stage}:`, err);
    }
    return false;
  }
}

/** For tests: forget which errors were logged. */
export function resetFrameGuardForTests(): void {
  seen.clear();
}
