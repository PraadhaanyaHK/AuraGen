# Accessibility and synthetic IFS pilot

## Scope and interpretation

This is a deterministic, synthetic interaction pilot, not a participant study.
The task times below are scripted scenario durations, not measured human
completion times. No personal or financial data is used. IFS is a heuristic
estimate of interaction friction for UX research; it is not a psychological
diagnosis, measure of emotion, probability, or lending decision.

Each scored scenario is replayed as two consecutive 30-second telemetry
windows. The score is constant in both windows. Counts in the table are totals
across the two windows; each window contains half the displayed event totals.
Completion time is the scripted end-to-end task clock, not the sum of those
two scoring windows.

## Provisional weights retained

No filter or threshold was changed in this pilot. The experiment retains the
original provisional weights and normalization counts:

| Feature | Weight | Normalization count |
|---|---:|---:|
| Validation errors | 0.30 | 2 |
| Repeated clicks | 0.20 | 2 |
| Prolonged unchanged hesitations | 0.20 | 2 |
| Backtracks | 0.15 | 2 |
| Field switches | 0.10 | 8 |
| Pointer corrections | 0.05 | 10 |

Pointer corrections remain excluded unless at least 10 mouse samples are
available; the remaining weights are then renormalized. Automatic adaptation
still requires two consecutive high (at least 60) windows, an independent
task signal, and all existing cooldown/restore/opt-out guards.

## Reproducible scenarios and outcomes

The scenarios and expectations are executable in `tests/pilot.test.ts`.

| Scenario | Scripted completion | Validation errors | Repeated clicks | Backtracks | Score per window | Auto adaptations |
|---|---:|---:|---:|---:|---:|---:|
| Normal (one unchanged 12-second pause per window) | 2:40 | 0 | 0 | 0 | 11 (low) | 0 / 2 |
| Moderate friction | 4:15 | 2 | 2 | 2 | 50 (moderate) | 0 / 2 |
| High friction | 7:10 | 4 | 4 | 4 | 100 (high) | 1 / 2 |

The moderate scenario also has one hesitation and four field switches per
window. The high scenario has two hesitations and backtracks plus eight field
switches per window. The high scenario requests adaptation only on its second
consecutive high window; the cooldown prevents a second adaptation in this
two-window replay.

Two negative controls are covered separately:

- Pointer-only movement with 10 samples and 10 corrections scores 5 and does
  not trigger; pointer activity is not an independent task signal.
- A prolonged unchanged pause alone scores 11 and does not trigger. A shorter
  ordinary pause is below the 12-second event threshold and contributes no
  scored hesitation.

The test fixtures also record scenario task duration, validation-error count,
repeated-click count, backtracks, and adaptation frequency so the same
comparison can be rerun after a future policy proposal.

## Accessibility, motion, and responsive interaction checks

- Original and wizard forms use the same local form state. Keyboard users can
  focus and activate layout/step controls, correct validation errors, and
  move forward/back without pointer input.
- Failed original-form submission focuses the first invalid field. Layout
  changes focus the presentation heading; wizard step changes focus the new
  step heading and announce its number/title through a polite live region.
- Field labels, instructions, `aria-invalid`, described validation errors,
  visible focus styling, and named wizard progress are retained.
- Framer Motion uses a short layout/step transition without an exit-wait state
  or input-blocking overlay. Motion is disabled for the reduced-motion
  preference. Mobile styles stack fields and controls; buttons and presentation
  switches have 44px minimum height and the adaptation toggle has an enlarged
  label/checkbox target.

Automated DOM tests verify keyboard interaction, validation association,
focus restoration, progress announcements, and scenario trigger outcomes.
They do not replace manual testing with screen readers, browser zoom, a
keyboard-only audit, or real touch devices. The integrated browser used for
viewport verification did not provide touch emulation, so touch target sizes
were measured rather than exercised on touch hardware.

## Limitations and optional participant follow-up

These fixtures prove deterministic policy behavior, not that the score
correlates with a person's workload. Scripted times and event counts are
assumptions; the pilot has no recruited participants, observed completion-time
distribution, false-positive rate estimate, or statistical power. Two-window
adaptation frequency is a scenario outcome, not a population rate.

If a later, consented usability study is practical, ask one optional
post-task workload question (for example, “How mentally demanding was this
task?” on a 1–7 scale) and allow participants to skip it. Treat the response
as qualitative study data only: it must never be collected by telemetry or
used as an automatic adaptation trigger.
