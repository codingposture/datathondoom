# TEAM NAME: Covenant

Prototype for the Freedom Broker CQA hackathon: configure a checklist, evaluate operator dialogs (RU / KZ / EN chats and calls), review the score with evidence, file an appeal, and let a reviewer confirm or change the score.

- **Stack:** Next.js 15 (App Router) + React 19, API routes as the backend, SQLite via Prisma, plain CSS (design tokens), Recharts.
- **No login.** Submitting an appeal and reviewing it are separate screens.
- **Interface languages:** RU / ҚАЗ / EN (switch at the bottom of the sidebar).

## Quick start

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env      # then set ORGANIZER_API_URL (see below)
npm run setup             # creates prisma/dev.db and seeds the default checklist
npm run checklist:add-voice   # optional: adds the voice criteria V1–V4 (calls) as a new checklist version
npm run dev               # http://localhost:3000
```

Production mode: `npm run build && npm start`.

### Loading dialogs

There are three ways to load dialogs, and all of them upsert by `conversation_id`:

- **From the organizer API:** on **Dialogs**, type a `group_id` and press **Импорт по group_id**.
- **From a JSON file in the UI:** press **Загрузить JSON** and pick a file. The dialog previews how many dialogs and recordings the file has before importing.
- **From a JSON file on the command line:** `npm run import:file -- problem/invoke.json [groupId]`.

**Accepted file formats:**
- the organizer API response (like `invoke.json`: `{ isSuccess, data: { dataset_group_id, records: [...] } }`);
- a bare array of records;
- a single record.

The dataset group comes from the field you type, else `data.dataset_group_id`, else `UPLOAD`.

**Recordings.** A record's `audio_url` (an http(s) link) is optional.
- With it, the dialog card shows the audio panel: speaker lanes, play/seek, and jump-to-fragment.
- Without it, the panel is hidden and the card shows only the transcript and the score.

The link can be a direct audio file or the organizers' player page; the server resolves the page to the mp3.

**Transcript ↔ audio alignment.** Call timestamps are wall-clock time, but the recording differs from that clock in three ways. At import, `alignToAudio` (`src/lib/time.ts`) corrects for them and stores each message's `audioStart`/`audioEnd`. The original timestamps are kept as they are.
- The audio begins at the "recording started" system event, so messages logged before it are marked "нет в записи" (not in the recording).
- "Recording paused … resumed" spans are cut out of the audio.
- Each timestamp marks the end of an utterance, not its start.

The constants were fitted against speech detected in the DEV recordings, and every call fits the same rule. Overlap between predicted and real speech rose from 18–62% to 76–88%. The player is built on wavesurfer.js (waveform, playback, regions, timeline).
Unit tests (scoring, rounding, N/A redistribution, timestamps): `npm test`.

### Environment

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | SQLite file, default `file:./dev.db` (inside `prisma/`) |
| `ORGANIZER_API_URL` | Organizer GET URL **without** `&group_id=…`. It is the link behind the "Открыть GET для DEV" button in the student guide. |
| `EVALUATOR` | `mock` (default). See [Evaluator](#evaluator). |
| `NEXT_PUBLIC_API_BASE` | Optional. API origin, if the UI is hosted separately (e.g. inside Dynamics 365). |

## Demo script (5 minutes)

1. **Dialogs.** Type `DEV` and press **Импорт по group_id** (65 dialogs). Press **Оценить все в списке**.
2. **Dialog card.** Open the call `p4-ru-003`.
   - The top panel is the recording with Client / Operator lanes. The transcript is on the left and **Оценка качества** on the right.
   - Click a criterion to see its answer, points, weight, explanation and evidence message. **Перейти к фрагменту** scrolls to the message and seeks the audio.
   - Examples:
     - N/A with a reason: "Предупреждение об ожидании" or "Завершение диалога" in calls where the client hung up.
     - Critical error: `p1-ru-022` (operator asks for money to be sent to their own card).
     - Rude tone: `p1-ru-029`.
3. **Appeal.** Press **Оспорить оценку**, choose a criterion, write a comment and save.
   - Go to **Апелляции**, open the appeal, choose **Изменить оценку**, pick a new answer and give a reason.
   - The total is recalculated (original → final). The dialog card shows both values and the appeal history.
4. **Checklist change.** Go to **Чек-листы → Редактировать** and replace a criterion: wording, weight, type or scale, N/A rule, auto-check, keywords.
   - Press **Сохранить как новую версию** (versions are immutable; old evaluations keep their snapshot).
   - Press **Применить к набору** with the control `group_id`.
5. **Аналитика.** Average score, critical errors, appeals, compliance per criterion, scores by language and channel, and score distribution.

**Control set (hour 23):** type the new `group_id` on **Dialogs**, import it, then evaluate it there or via **Применить к набору**.

## Scoring rules (`src/lib/scoring.ts`)

1. **Normalize each answer:**
   - Yes/No gives 1 or 0.
   - A scale gives `(v − min) / (max − min)`.
   - N/A is excluded.
2. **Redistribute weight over N/A.** Each applicable criterion's effective weight is `w / Σw(applicable) × 100`, so the total is always out of 100.
3. **Points** for each criterion are `effective weight × normalized answer`. Section results use the same formula within each section.
4. **Rounding** comes from the checklist: decimals and mode (half-up / down / up). The total is computed from unrounded values and rounded once.
5. **Critical error.** A failed criterion marked critical is flagged separately. With the checklist policy *Обнулять итог* it also sets the total to 0.
6. **Appeal decisions** re-run the same scoring with the reviewer's answer. `originalTotal` is kept and `finalTotal` is updated.

## Voice criteria (calls)

For calls, the server measures the operator's voice from the recording itself. The code is in `src/lib/audio/`. It decodes the mp3 in WASM and needs no native tools.

**What it measures:**
- pitch level and intonation variation;
- loudness;
- dead air;
- response latency;
- the operator talking over the client;
- moments when the client sounds agitated or the operator raises their voice.

**How the results are used:**
- They are cached per call in `Conversation.audioMetrics` and cleared on re-import.
- Evaluators get them as `audio.metrics`.
- The Gemini evaluator also receives the real mp3. `audio_url` is resolved from the organizers' player page.

`npm run checklist:add-voice` adds criteria V1–V4 to the active checklist. They are N/A for chats. The analysis behind them is in [docs/voice-analysis.md](docs/voice-analysis.md).

## Evaluator

- **Interface:** `src/lib/evaluator/types.ts`. Only operator messages are scored; bot and system events are context.
- **Current implementation:** `mock-heuristic-v1`, a deterministic multilingual (RU/KZ/EN) rule-based evaluator.
  - It returns an answer, an explanation (stored in all three UI languages), evidence message indices, and the checked range when an action was missing.
  - It also returns an N/A reason. Cost per evaluation: $0, about 15 ms.
- **Criteria created in the UI** use the *Оператор должен / не должен сказать…* auto-check with per-language keywords.
- **To plug in an LLM,** add `src/lib/evaluator/<provider>.ts` that implements the same interface, register it in `src/lib/evaluator/index.ts`, and set `EVALUATOR`. Nothing else changes.

## Placeholder checklist

The official checklist PDF was not available, so `src/lib/defaultChecklist.ts` seeds 8 criteria (weights sum to 100) in 4 sections:

| # | Criterion | Type | Weight | Notes |
|---|---|---|---|---|
| C1 | Приветствие и представление | Yes/No | 10 | |
| C2 | Выявление потребности | scale 0–2 | 15 | |
| C3 | Корректность и полнота консультации | scale 0–3 | 20 | |
| C4 | Безопасность данных | Yes/No | 10 | critical |
| C5 | Вежливость и тон | scale 0–2 | 15 | |
| C6 | Предупреждение об ожидании | Yes/No | 10 | N/A allowed |
| C7 | Передача вопроса по регламенту | Yes/No | 10 | N/A allowed |
| C8 | Завершение диалога | Yes/No | 10 | N/A allowed |

Replace it through the UI, or edit the seed file and run `rm prisma/dev.db && npm run setup`.

## API

| Method & path | Purpose |
|---|---|
| `POST /api/datasets/import {groupId}` | Fetch from the organizer API on the server (no CORS) and upsert |
| `POST /api/conversations/upload {groupId?, data}` | Manual JSON upload: API envelope, an array of records, or one record |
| `GET /api/conversations?groupId&language&channel&evaluated&q` | List with the latest score |
| `GET /api/conversations/:id` | Messages and the latest evaluation (results and appeals) |
| `GET /api/audio/:id` | Streams the call recording. It resolves the organizer player page to the signed mp3 and supports Range. |
| `GET / POST /api/checklists`, `GET / PUT / DELETE /api/checklists/:id` | A PUT creates a new version |
| `POST /api/checklists/:id/activate`, `POST /api/checklists/:id/duplicate` | |
| `POST /api/evaluations {conversationId, checklistId?}` | Evaluate one dialog |
| `POST /api/evaluations/batch {checklistId?, groupId? \| conversationIds?}` | Apply a checklist to a dataset |
| `POST /api/appeals {criterionResultId, comment}`, `GET /api/appeals?status=open\|resolved` | |
| `GET /api/appeals/:id` | Reviewer view: disputed result, comment, transcript fragment |
| `POST /api/appeals/:id/decision {action: confirm\|change, newAnswer?, reason}` | Re-scores the evaluation |
| `GET /api/analytics?groupId&checklistId` | Aggregates |

## Dynamics 365 embedding

- `/embed/dialogs/:id` renders the dialog card without the sidebar and allows framing (`frame-ancestors *`).
- Styling is plain CSS with custom properties in `src/app/globals.css`, with no UI-kit dependency.
- `NEXT_PUBLIC_API_BASE` points the UI at a separately hosted API.

## Deep links

- `/dialogs/<id>#msg-12` opens the dialog card at message #12.
- `/dialogs/<id>?criterion=C3` opens the card with criterion C3 selected.

## Project layout

```
prisma/schema.prisma, prisma/seed.ts
src/lib/        scoring, time, services, evaluator/, organizerApi, mappers, i18n/
src/app/api/    route handlers
src/app/(app)/  dialogs, checklists, appeals, analytics pages
src/components/ ConversationView, ConversationPlayer, Transcript, QualityPanel, ChecklistEditor, …
tests/          vitest unit tests
```
