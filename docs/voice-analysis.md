# Voice analysis of the DEV call recordings

This analysis covers the five voice calls in the DEV set (`p4-ru-001` … `p4-ru-005`, RU, 16 kHz mono MP3, 5–10 min each). It measures the sound itself, not the transcript. The findings shaped the voice criteria V1–V4 added to the checklist (v3). In v4, V1 was rewritten so that a steady, calm voice scores best.

## Method

- **Who speaks when.** The recording is mono, so the transcript-aligned spans (`audioStart`/`audioEnd`, see `alignToAudio`) say who is speaking. Only voiced frames inside those spans are measured. Bot (phone-menu) speech is excluded.
- **Reference tools (one-off offline cross-check, not part of the project):** Praat/parselmouth for pitch, voice quality and intensity; ffmpeg for silence detection; the pretrained Russian emotion model `Aniemore/wav2vec2-emotion-russian-resd` (7 emotions). These ran once in a throwaway Python environment, which has since been deleted. The app itself contains no Python and no emotion model.
- **In-app implementation:** `src/lib/audio/prosody.ts` (TypeScript, WASM mp3 decoder). It was validated against Praat:

  | Measure | Agreement with Praat |
  |---|---|
  | Median pitch | within 1–3 % for all 10 voices |
  | Intonation variation | about 0.4 semitones higher, same ordering of operators |

## Per-call results (in-app measurements)

| Call | Operator pitch | Operator pitch variation within phrases | Response latency, median / p90 | Dead air the operator owes | Operator over client | Notes |
|---|---|---|---|---|---|---|
| p4-ru-001 | 93 Hz | 2.58 st (some swings) | 1.9 / 2.7 s | none | none | calm call |
| p4-ru-002 | 96 Hz | **2.06 st (steady)** | 0.4 / 4.5 s | none* | none | client on hold about 7 min while the operator consults a colleague |
| p4-ru-003 | 98 Hz | 2.49 st (some swings) | 1.9 / 5.2 s | **8.6 s** after the client dictated a code (#57 → #58) | apology "перебил вас" (#21) | client frustrated: order stuck "почти час" (almost an hour) (#16) |
| p4-ru-004 | 124 Hz | **3.68 st (strong swings)** | 0.55 / 3.3 s | none | **#37 over #36, 2.9 s** | widest pitch range (14 st) |
| p4-ru-005 | 96 Hz | 2.76 st (some swings) | 0.22 / 3.0 s | none | none | fastest responses |

\* In `p4-ru-002`, the long silences either fall during the hold or come after the client said they would try something in the app. In both cases the operator didn't owe a reply, so they don't count.

## Emotion

- **The emotion model is indicative only.** It was trained on studio speech and is over-confident on phone audio. For example, it labelled calm lines in `p4-ru-005` ("меня Эльмар…") as anger.
- **Where it agrees with the content:**
  - the `p4-ru-003` client: disgust/sadness while describing the stuck order;
  - the `p4-ru-004` client: frequent fear/worry.
- **Operators sounded mostly neutral.** No operator raised their voice at an upset client.
- **Single loud phrases are not reliable upset signals.** A loud greeting and a phone-menu keypress both produced spikes. The in-app rule therefore needs a sustained episode (≥ 2 agitated phrases within 30 s after the operator joins) or a verbal complaint.

## Voice quality

- **Values:** jitter 2–3 %, shimmer 12–15 %, HNR 8–18 dB.
- **They are not used for scoring.** The 64 kbps phone codec dominates these measures, and the operator line has systematically lower HNR than the client line (a channel effect, not the voice).

## Criteria derived from this (section «Голос и интонация (звонки)»)

| Code | Criterion | Type | Weight | Measured by |
|---|---|---|---|---|
| V1 | Ровный, спокойный голос | 0–2 | 5 | pitch variation within phrases: < 2.2 st → 2 (steady), 2.2–3 → 1, ≥ 3 → 0 (strong swings) |
| V2 | Не перебивает клиента | Yes/No | 5 | operator speech starting over the client's (≥ 1 s), or the operator apologising for interrupting |
| V3 | Темп разговора и паузы | Yes/No | 5 | dead air ≥ 5 s that the operator owes (holds and warned waits excluded), median latency ≤ 3 s |
| V4 | Спокойный тон и реакция на эмоции клиента | Yes/No/N/A | 5 | client agitation (pitch and loudness vs own baseline, or a complaint); the operator mustn't raise their voice (+6 dB and +3 st) and must respond with empathy |

All four are N/A for chats, so chat scores don't change. Thresholds are in `VOICE_THRESHOLDS` (`src/lib/evaluator/mock.ts`). They were calibrated on 5 calls only, so revisit them when the control set arrives.

Rule-based results (V1 from checklist v4, where V1 rewards a steady voice; V2–V4 unchanged since v3):

| Call | V1 | V2 | V3 | V4 |
|---|---|---|---|---|
| p4-ru-001 | 1 | Yes | Yes | N/A |
| p4-ru-002 | 2 | Yes | Yes | N/A |
| p4-ru-003 | 1 | No | No | No |
| p4-ru-004 | 0 | No | Yes | N/A |
| p4-ru-005 | 1 | Yes | Yes | N/A |
