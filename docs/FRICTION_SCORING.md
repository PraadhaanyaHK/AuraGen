# Provisional Interaction Friction Score

The Interaction Friction Score (IFS) is a deterministic UX research indicator.
It is **not a probability, a creditworthiness measure, or a direct measure of
emotion**. The weight and trigger policy is centralized in
`src/frictionPolicy.ts`; its values are provisional and must be reviewed before
being treated as product policy.

## Features and formula

For each usable feature, normalize its event count as
`min(count / normalizationCount, 1)`. Compute:

`round(100 * sum(weight * normalizedFeature) / sum(usableFeatureWeights))`

| Feature | Provisional weight | Normalization count | Count source |
|---|---:|---:|---|
| Validation errors | 0.30 | 2 | `validationErrors` |
| Repeated clicks | 0.20 | 2 | Same-target clicks within 1.2 seconds |
| Hesitations | 0.20 | 2 | Focus lasting at least 12 seconds with no value change before blur |
| Backtracking | 0.15 | 2 | Wizard backward-navigation events |
| Field switching | 0.10 | 8 | Switches between approved fields |
| Mouse direction corrections | 0.05 | 10 | Direction reversals from mouse movement samples |

Pointer corrections contribute only when correction data is available and the
window has at least ten usable mouse samples. Otherwise that feature is
excluded and the remaining weights are renormalized. Pointer speed is not
recorded or scored.

Scores use these bands: 0–34 low, 35–59 moderate, and 60–100 high. The response
includes normalized feature values, per-feature counts and weighted
contributions, explanations, and automatic/manual trigger eligibility.

## Automatic trigger

Automatic simplification requires all of the following:

1. Two consecutive, non-overlapping 30-second windows score at least 60.
2. At least one window contains an independent task signal: validation error,
   repeated click, or backtrack.
3. The 90-second cooldown has expired.
4. Automatic adaptation has not been overridden by the user.
5. The current window has not been restored/undone.

Overlapping rolling summaries are not counted as separate windows. Selecting **Simplify now** explicitly requests the wizard and starts the
cooldown without requiring automatic-trigger gates. Restoring the original
presentation suppresses that window so it cannot immediately trigger again.
Automatic adaptation can be separately overridden with the user control.

All aggregation and scoring remain local. No field values, typed characters,
or raw pointer coordinates are added to the score response or sent to a
provider.
