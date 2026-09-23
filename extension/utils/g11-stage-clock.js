// Exclusive wall spans for the G11 Option C harness.
// Records only intervals this service worker actually ran. A stage that did
// not run stays null plus a reason. Never fills a guessed duration.

const STAGE_KEYS = [
  'perceive',
  'strip',
  'plan',
  'validate',
  'f17_local_tier',
  'execute',
  'total',
];

function emptyStages() {
  return {
    perceive: null,
    strip: null,
    plan: null,
    validate: null,
    f17_local_tier: null,
    execute: null,
    total: null,
  };
}

export function createG11Trace() {
  let run = null;

  function ensure() {
    if (!run) {
      run = {
        clockSource: 'extension',
        timingModel: 'exclusive',
        wallStart: null,
        stagesMs: emptyStages(),
        reasons: {},
        f17Steps: [],
        terminal: null,
      };
    }
    return run;
  }

  return {
    beginRun() {
      run = null;
      ensure();
    },
    markWallStart() {
      const current = ensure();
      if (current.wallStart == null) current.wallStart = performance.now();
    },
    add(stage, elapsedMs) {
      const current = ensure();
      if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
        current.stagesMs[stage] = null;
        current.reasons[stage] = 'stage clock returned a non-finite duration';
        return;
      }
      const prev = current.stagesMs[stage];
      current.stagesMs[stage] = (typeof prev === 'number' ? prev : 0) + elapsedMs;
      delete current.reasons[stage];
    },
    missing(stage, reason) {
      const current = ensure();
      if (current.stagesMs[stage] == null) {
        current.reasons[stage] = reason;
      }
    },
    recordF17(entry) {
      const current = ensure();
      current.f17Steps.push(entry);
    },
    patchLatestF17(patch) {
      const current = ensure();
      const last = current.f17Steps[current.f17Steps.length - 1];
      if (!last) return;
      Object.assign(last, patch);
    },
    setTerminal(terminal) {
      const current = ensure();
      current.terminal = terminal;
    },
    finish(terminal) {
      const current = ensure();
      if (terminal) current.terminal = terminal;
      if (current.wallStart == null) {
        current.stagesMs.total = null;
        current.reasons.total = 'perceive wall start was not marked';
      } else {
        current.stagesMs.total = performance.now() - current.wallStart;
      }
      for (const key of STAGE_KEYS) {
        if (current.stagesMs[key] == null && !current.reasons[key]) {
          current.reasons[key] = `${key} did not run`;
        }
      }
      return this.snapshot();
    },
    snapshot() {
      const current = ensure();
      return {
        clockSource: current.clockSource,
        timingModel: current.timingModel,
        stagesMs: { ...current.stagesMs },
        reasons: { ...current.reasons },
        f17Steps: current.f17Steps.map((step) => ({ ...step })),
        terminal: current.terminal,
      };
    },
  };
}
