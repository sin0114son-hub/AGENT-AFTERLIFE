# Agent Afterlife

Agent Afterlife is a security lab for replaying synthetic AI agent runs. The Attack Lab records proposed mock actions, policy decisions, and their reasons. Time Machine compares the two policies, and Evidence shows the saved audit events behind the result.

## Try the lab

1. Open Attack Lab and choose a scenario. Run it once with **Undefended** and once with **Defended**.
2. Open **Compare undefended and defended runs**. Read the first event difference and the key policy decision. Search-result injection and trust escalation each have a different decision to inspect.
3. Open **Evidence** from the run to read the decision reason, actor trust level, and audit timeline.

Playground has a deterministic simulation where the chosen action and trust level drive the policy decision. The input text does not affect that decision. The optional Gemini experiment displays a model reply and fixed text checks separately. Gemini starts disabled, requires operator setup and consent, and never runs a tool.

## Run locally

Use Python 3.12 and Node.js 24. From the repository root, in PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
cd frontend
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open [the local lab](http://127.0.0.1:3000). For a production build, set `API_ORIGIN` before `npm run build` if the backend is on a different address. [Test deployment setup](docs/TEST_DEPLOYMENT.md) explains the protected proxy. Use a [test environment](docs/GEMINI_OPERATIONS.md) for Gemini.

## Kiro and verification

The Kiro specs cover [Playground experiments](.kiro/specs/playground-experiments/requirements.md) and [Guided evidence explanations](.kiro/specs/guided-evidence-explanations/requirements.md). See the [Kiro usage record](docs/KIRO_USAGE.md) for the project workflow. Run `python -m pytest` from the root and `node --test *.test.mjs` from `frontend`.
