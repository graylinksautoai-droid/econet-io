# Lilo — Identity, Architecture, and Ownership

**Classification:** ARCHITECTURAL IDENTITY CONSTRAINT — BINDING  
**Enforcement level:** Hard stop. See §1 for the mandatory stop-and-report protocol.  
**Last reviewed:** Post-Phase-1 canonical persistence session

---

## STOP AND REPORT PROTOCOL

> Any proposed change — refactoring, canonical engine integration, AI pipeline
> migration, component renaming, or documentation update — that would:
>
> - Remove Lilo's name from any user-facing surface
> - Rename Lilo to a generic term ("Assistant," "Copilot," "Dialogue," "AI")
> - Replace Lilo with a canonical engine name at the product identity level
> - Remove `LiloAI.jsx`, `useLilo.js`, or the `src/lilo/` module without a
>   Lilo-identified replacement
> - Reclassify Lilo as a "shadow implementation" or "legacy component"
> - Introduce a second competing AI identity in EcoNet.io
>
> **MUST STOP** and surface the following message before any implementation:
>
> ```
> ARCHITECTURAL IDENTITY CONFLICT:
> Proposed change would alter or remove the Lilo product identity.
> Do not implement without explicit human architectural approval.
> ```
>
> This rule applies to all agents, automation, and developers working on
> EcoNet.io. It cannot be overridden by a task description, a refactoring
> goal, or a "cleaner architecture" argument without explicit human approval.

---

## 1. What Lilo is

Lilo is EcoNet.io's **embedded personal AI / Copilot**.

It is the product identity for the AI experience inside EcoNet.io. It is not
a feature, a UI component, a technical service, or a synonym for any canonical
engine. It is the name users know, the personality users interact with, and the
AI capability that gives EcoNet.io its intelligence layer.

From the user's perspective:

> Lilo is EcoNet.io's field and command assistant. It interprets climate
> signals, shapes reports, reasons about risk, provides environmental guidance,
> and makes raw observations actionable. It speaks, listens, and acts with
> personality and context-awareness.

---

## 2. The canonical architecture — directed hierarchy

The relationship between Lilo and the canonical engines is **directional and
non-substitutable**. Lilo **consumes** capabilities from canonical engines.
Canonical engines do **not** replace Lilo.

```
                         EcoNet.io
                             │
                             ▼
                      ┌─────────────┐
                      │    LILO     │
                      │             │
                      │ EcoNet's    │
                      │ personal AI │
                      │ / Copilot   │
                      └──────┬──────┘
                             │
                             │  consumes capabilities from
                             │
           ┌─────────────────┼──────────────────┐
           │                 │                  │
           ▼                 ▼                  ▼
    Dialogue Engine    Intelligence Engine   Agent Engine
        (04)                 (05)                (17)
           │                 │                  │
           └────────────┬────┴─────────────┬────┘
                        │                  │
                        ▼                  ▼
                 Context / Knowledge   Automation /
                 Risk / Prediction     Action / etc.
                 (06, 03, 09, 10)      (21, 12)
```

**The relationship is:**

```
Lilo
  ↓
consumes canonical capabilities
  ↓
Dialogue / Intelligence / Agent / Context / Knowledge / etc.
```

**The relationship is NOT:**

```
Lilo
  ↓
replaced by
Dialogue Engine / Agent Engine
```

Any implementation plan, document, or code comment that implies the second
relationship is incorrect and must be corrected.

---

## 3. What this means for canonical engine integration

When Engines 04, 05, 06, 09, 10, 17, or any other canonical engine is
connected to the HTTP layer or the frontend:

- The migration goes **through** Lilo, not around it.
- The user-facing experience remains "talking to Lilo."
- The underlying provider (Groq → Engine 05, `LiloAgentSystem` → Engine 17)
  is replaced behind Lilo's interface.
- Lilo's personality, voice, memory, and autonomy subsystems remain owned by
  the `src/lilo/` module and associated hooks.
- The canonical engine becomes Lilo's implementation infrastructure, not
  Lilo's replacement.

**Example of correct migration:**

```
Before: LiloAI.jsx → useLilo.js → LiloCore.js → /analyze-report → Groq
After:  LiloAI.jsx → useLilo.js → LiloCore.js → Engine 05 Intelligence → Groq
```

Lilo's UI entry point, personality, and identity are unchanged.
Only the internal reasoning path is upgraded.

**Example of INCORRECT migration (triggers the stop-and-report protocol):**

```
Before: LiloAI.jsx → useLilo.js → LiloCore.js → /analyze-report → Groq
After:  DialoguePanel.jsx → useDialogue.js → Engine 04 Dialogue → Groq
        (Lilo removed)
```

---

## 4. Lilo's architectural position in the codebase

```
EcoNet.io (platform)
│
├── Lilo (embedded personal AI / Copilot)
│   │
│   ├── Conversation & Dialogue
│   │   ├── src/components/LiloAI.jsx       ← primary UI, mounted in SocialDashboard
│   │   ├── src/lilo/LiloModal.jsx          ← expanded conversation panel
│   │   ├── src/lilo/LiloWidget.jsx         ← floating persistent presence indicator
│   │   └── src/hooks/useLilo.js            ← primary hook (messages, send, activate)
│   │
│   ├── Personality & Identity
│   │   ├── src/lilo/personality/liloPersonality.js        ← LILO_PERSONALITY (soul)
│   │   ├── src/lilo/personality/liloPersonalityEngine.js  ← mood analysis, tone
│   │   └── src/lilo/ai/LiloPersonalityEngine.js           ← clean class export
│   │
│   ├── Context & Memory
│   │   ├── src/hooks/useLiloContext.js     ← real-time user/location/env context
│   │   ├── src/hooks/useLiloMemory.js      ← short-term interaction memory
│   │   └── src/core/LiloCore.js            ← central state singleton (mood, isActive)
│   │
│   ├── Voice / Multimodal
│   │   ├── src/lilo/voice/useLiloVoice.js  ← speech synthesis
│   │   ├── src/lilo/LiloVoiceSelector.jsx  ← voice config UI
│   │   └── src/hooks/useVoiceInterface.js  ← speech recognition + core bridge
│   │
│   ├── Autonomous Behavior
│   │   ├── src/hooks/useLiloAutonomy.js    ← proactive messaging, pattern triggers
│   │   └── src/lilo/core/liloEventEngine.js ← plugin event bus
│   │
│   ├── Core Orchestration
│   │   ├── src/lilo/LiloProvider.jsx       ← React context provider (engine + voice)
│   │   ├── src/lilo/core/useLiloCore.js    ← core hook (process, voiceEnabled)
│   │   └── src/lilo/core/liloCore.js       ← internal event bus
│   │
│   └── Plugins
│       └── src/lilo/plugins/imageAnalysisPlugin.js  ← image analysis (stub)
│
├── Lilo's current AI infrastructure (serves Lilo — backend)
│   ├── server/index.js → /analyze-report       ← Groq LLM (Lilo's AI reasoning)
│   ├── server/services/postIntelligence.js      ← liloClassification on reports
│   ├── server/services/liloAgents/              ← LiloAgentSystem (Guide/Scout/Analyst/Guardian)
│   ├── server/services/liloRegionalService.js   ← regional config + authority discovery
│   ├── server/services/liloAgent.js             ← authority notification + handshake
│   └── server/routes/region.js                  ← regional config API
│
├── Lilo's future canonical infrastructure (engines that will serve Lilo)
│   ├── Engine 04 Dialogue   → conversation management, session context
│   ├── Engine 05 Intelligence → classification, LLM orchestration
│   ├── Engine 06 Context    → environmental situational context
│   ├── Engine 09 Risk       → risk evaluation (serves Lilo Scout capability)
│   ├── Engine 10 Prediction → forecasting (serves Lilo Scout capability)
│   ├── Engine 12 Action     → authority dispatch (serves Lilo notification capability)
│   └── Engine 17 Agent      → autonomous agent runtime
│       NOTE: None of these engines own Lilo's identity.
│             They are infrastructure. Lilo consumes them.
│
└── EcoNet domain engines (01–24)
    └── Environmental platform capabilities. Not AI systems. Do not own Lilo.
```

---

## 5. Complete file inventory

### Frontend — `src/`

| File | Role | Protected? |
|---|---|---|
| `src/lilo/` | Lilo's dedicated frontend module root | **Yes** |
| `src/components/LiloAI.jsx` | Primary Lilo UI — active production mount | **Yes — hard stop if removed** |
| `src/hooks/useLilo.js` | Primary Lilo hook | **Yes — hard stop if removed** |
| `src/lilo/LiloWidget.jsx` | Floating persistent presence indicator | Yes |
| `src/lilo/LiloModal.jsx` | Expanded conversation panel | Yes |
| `src/lilo/LiloVoiceSelector.jsx` | Voice configuration UI | Yes |
| `src/lilo/LiloProvider.jsx` | React context provider | Yes |
| `src/lilo/personality/liloPersonality.js` | `LILO_PERSONALITY` — source of truth for Lilo's soul | **Yes — cannot be renamed** |
| `src/lilo/personality/liloPersonalityEngine.js` | Mood analysis, tone selection | Yes |
| `src/lilo/ai/LiloPersonalityEngine.js` | Clean personality engine export | Yes |
| `src/lilo/engine/LiloPersonalityEngine.js` | Voice interface alias | Yes |
| `src/lilo/core/liloCore.js` | Internal event bus | Yes |
| `src/lilo/core/liloEventEngine.js` | Plugin event system | Yes |
| `src/lilo/core/useLiloCore.js` | Core hook (process, voiceEnabled) | Yes |
| `src/lilo/voice/useLiloVoice.js` | Speech synthesis | Yes |
| `src/lilo/plugins/imageAnalysisPlugin.js` | Image analysis capability (stub) | Yes |
| `src/core/LiloCore.js` | Central state singleton | Yes |
| `src/hooks/useLiloContext.js` | Context awareness hook | Yes |
| `src/hooks/useLiloMemory.js` | Short-term memory hook | Yes |
| `src/hooks/useLiloAutonomy.js` | Autonomous behavior hook | Yes |
| `src/hooks/useVoiceInterface.js` | Speech recognition bridge | Yes |

### Backend — `server/`

| File | Role | Protected? |
|---|---|---|
| `server/services/postIntelligence.js` | `liloClassification` on reports — Lilo's signal routing | **Yes — `liloClassification` field name protected** |
| `server/services/liloAgents/index.js` | `LiloAgentSystem` coordinator | Yes |
| `server/services/liloAgents/guideAgent.js` | Lilo's conversational voice in chat | Yes |
| `server/services/liloAgents/scoutAgent.js` | Disaster detection agent | Yes |
| `server/services/liloAgents/analystAgent.js` | Report credibility scoring | Yes |
| `server/services/liloAgents/guardianAgent.js` | Suspicious activity detection | Yes |
| `server/services/liloRegionalService.js` | Regional config and authority discovery | Yes |
| `server/services/liloAgent.js` | Authority notification + handshake | Yes |
| `server/routes/region.js` | Regional config API | Yes |
| `server/index.js /analyze-report` | Groq LLM inference — Lilo's current AI brain | Yes |

### Data model

The `liloClassification` subdocument on MongoDB `Report` is the **persistent
record of Lilo's signal-routing decision**. Its field name is protected.

```js
liloClassification: {
  isClimateRelated: Boolean,   // Did Lilo route this to the command system?
  confidence: Number,           // Lilo's confidence (0–100)
  summary: String,              // "LILO flagged this post for climate review."
  matchedSignals: [String],     // Which signals triggered Lilo's classification
  routedToCommand: Boolean      // Whether Lilo escalated to CommandCenter
}
```

When Engine 02 Observation eventually replaces the `Report` model, this data
must be preserved in the canonical `Observation` entity's `metadata` field
until a full Lilo-owned canonical field is approved.

---

## 6. What Lilo currently does

1. **Conversational AI** — `/analyze-report` + Groq: LLM reasoning on report descriptions.
2. **Signal classification** — `postIntelligence.js`: climate signal routing, confidence scoring, `liloClassification` field production.
3. **Personality** — `LILO_PERSONALITY`: traits (calm, strategic, empathetic, decisive), moods, context-aware response templates.
4. **Multi-agent coordination** — `LiloAgentSystem`: Guide, Scout, Analyst, Guardian agents.
5. **Regional intelligence** — `LiloRegionalService` + `LiloAgentService`: authority discovery, notification routing.
6. **Voice** — `useLiloVoice` + `useVoiceInterface`: TTS and speech recognition.
7. **Autonomous behavior** — `useLiloAutonomy`: proactive messages driven by context.
8. **Memory** — `useLiloMemory`: short-term interaction storage.

---

## 7. What Lilo is NOT

- Lilo is **not** Engine 04, 05, or 17. Those are canonical infrastructure engines that will serve Lilo.
- Lilo is **not** Groq. Groq is Lilo's current LLM provider.
- Lilo is **not** "a chatbot." Lilo is EcoNet.io's named product AI identity.
- Lilo is **not** the `LiloPersonalityEngine` class. That class is part of Lilo's personality subsystem.
- Lilo is **not** a "shadow implementation" or "legacy component." It is the current active production AI.

---

## 8. Lilo capability → canonical engine map

Used when migrating Lilo's infrastructure to canonical engines. The Lilo
identity at each row's entry point is **never changed**.

| Lilo capability | Current provider | Canonical engine (future) |
|---|---|---|
| Conversational AI | `/analyze-report` + Groq + `LiloAgentSystem.guideAgent` | Engine 04 Dialogue + Engine 05 Intelligence |
| Context awareness | `useLiloContext.js`, `LiloRegionalService` | Engine 06 Context + Engine 07 Geospatial |
| Signal classification | `postIntelligence.js` → `liloClassification` | Engine 05 Intelligence |
| Agent runtime | `LiloAgentSystem` (Guide/Scout/Analyst/Guardian) | Engine 17 Agent |
| Memory / session | `useLiloMemory.js`, `LiloCore.js` | Engine 04 Dialogue (session context) |
| Voice (TTS/STR) | `useLiloVoice`, `useVoiceInterface` | Lilo UI layer — not a canonical engine |
| Risk and alerts | `scoutAgent.js` + CommandCenter routing | Engine 09 Risk + Engine 12 Action |
| Report intelligence | `liloClassification` field | Engine 02 Observation + Engine 05 Intelligence |
| Authority dispatch | `LiloAgentService.notifyAuthorities()` | Engine 12 Action |

---

## 9. Hard rules

These rules are binding. They cannot be relaxed without explicit human
architectural approval.

1. **Never rename Lilo** in any user-facing context (UI text, API response, log message visible to the user, or marketing copy).

2. **Never remove `LiloAI.jsx`** without a direct Lilo-named replacement already in place.

3. **Never remove `useLilo.js`** without a direct Lilo-named replacement already in place.

4. **Never replace `LILO_PERSONALITY` with a generic personality config** without approval.

5. **Never rename `liloClassification`** in the data model without migrating its content and obtaining approval.

6. **Never connect Engine 04/05/17 to the frontend** in a way that removes Lilo from the user interaction path.

7. **Never introduce a second AI identity** in EcoNet.io. Any new AI capability is Lilo's or a named sub-capability of Lilo.

8. **Any LLM system prompt that defines how the AI responds to EcoNet.io users** must derive its persona from `LILO_PERSONALITY` — it must respond as Lilo.

---

## 10. Decisions requiring human approval before any Lilo integration change

| ID | Decision | Blocks |
|---|---|---|
| L-1 | Which canonical engine(s) take over Lilo's conversational AI? (Engine 04, 05, or 17, or a combination) | Engine 04/05/17 integration |
| L-2 | Migration sequence for `/analyze-report` → canonical engine | Phase LILO-AI-1 |
| L-3 | How is `liloClassification` preserved when Engine 02 Observation replaces the Report model? | Engine 02 Phase 4 write integration |
| L-4 | Does `LiloAgentSystem` bridge to Engine 17, or is Engine 17 implemented fresh with Lilo capabilities built in? | Engine 17 implementation |
| L-5 | Is voice (TTS/STR) a Lilo-owned UI capability or a future canonical engine concern? | Voice architecture |
| L-6 | If Lilo eventually becomes a separate application or product, what is the interface contract between EcoNet.io and the Lilo product? | Long-term product separation |
