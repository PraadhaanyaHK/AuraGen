export const PROVISIONAL_FRICTION_POLICY = {
  weights: {
    validationErrors: 0.3,
    repeatedClicks: 0.2,
    hesitations: 0.2,
    backtracks: 0.15,
    fieldSwitches: 0.1,
    pointerCorrections: 0.05,
  },
  normalizationCounts: {
    validationErrors: 2,
    repeatedClicks: 2,
    hesitations: 2,
    backtracks: 2,
    fieldSwitches: 8,
    pointerCorrections: 10,
  },
  repeatedClickWindowMs: 1_200,
  hesitationThresholdMs: 12_000,
  minimumMouseSamples: 10,
  bands: {
    lowMaximum: 34,
    moderateMaximum: 59,
    highMinimum: 60,
  },
  consecutiveHighWindows: 2,
  cooldownMs: 90_000,
  windowContinuityToleranceMs: 5_000,
} as const;
