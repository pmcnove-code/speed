# Flow v3.3 contract

The user-supplied v3.3 template is the canonical generated-clip prompt. Only its final quoted spoken text changes. The audited template is frozen in `infra/flow-worker/fixtures/v33-prompt.txt`.

| Rule | Enforcement |
| --- | --- |
| One character | Character/image and matching voice are attached and checked separately. No casting or voice-description text is added to the prompt. |
| Verbatim | Source words, case, punctuation and inner quotes survive partitioning. Only inter-word whitespace is normalized. Existing hook/CTA assembly avoids duplicating separately supplied fields already present in the script. |
| Exact prompt | Both DOM and RPC submission paths use `strictClipPrompt`. Incoming custom prompt text is discarded. No scene rewrite, gender prefix or live-name substitution reaches dispatch. |
| Voice attachment | DOM checks the attached voice; RPC requires a resolved voice ingredient ID rather than inventing one. |
| No repeated junction words | First try moving the split; if that fails, repartition while retaining all words. Impossible partitions fail before generation. |
| 35 syllables | Shared app/worker count uses maximum listed pronunciation counts, known contextual exceptions and conservative unknown-token handling. |
| Duration | Syllables / 3.5 plus 0.25s per comma/semicolon and 0.40s per period/question/exclamation. Uncertain tokens trigger the slower words / 2 fallback when needed. Allowed durations are 4/6/8/10 seconds; near-boundary promotion remains in place. Oversized text throws instead of silently returning 10 seconds. |
| Consolidation | Consecutive sentences are packed until either independent hard limit would be exceeded. Caller-supplied short clip plans are rebuilt from the source; no synthetic holds are added. |
| Long sentences | Prefer comma/semicolon pauses, then word boundaries within limits. |
| Numbering | Consecutive C01, C02, …; junction metadata identifies split-sentence joins. |

Scene descriptions now remain planning metadata. To change the setting, supply a reference image depicting it; the generated scene must match that image. Transition choices and subtitles are applied during editing after generation, so the generated-clip prompt retains its “No subtitles” and fixed-scene instructions.

Syllable counts and speaking time remain pronunciation estimates, not guarantees of Flow's delivery. The pinned [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict) data, derivation details and license are under `shared/flow/data`. Ambiguous dictionary pronunciations use the largest count; unknown forms use conservative fallback. Actual generated footage still goes through the existing speech and media checks.

Regression checks cover exact template equality at dispatch, scene/casting injection, incoming over-fragmentation, inner quotes/case, one-word dialogue, invalid durations, long-sentence coverage, conservative counts and impossible repeated-word boundaries. No paid Flow generation is needed to test these invariants.
