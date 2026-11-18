"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Theme } from "@astryxdesign/core/theme";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { experimentModeLabel } from "../lib/modeLabel";
import { ApiError, describeApiError } from "../lib/errors";
import ScrollTable from "../components/ScrollTable";
import { labTheme } from "../lib/astryxTheme";
import { PRESETS, describeLiveFailure, presetById, type PresetId } from "../lib/playgroundScenarios";
import { FEEDBACK_SAVED, FEEDBACK_SCOPE, GEMINI_CHECKING, GEMINI_CONSENT, GEMINI_DISCLOSURE, GEMINI_NOT_ENABLED, GEMINI_SCOPE, SIMULATION_DISCLOSURE } from "../lib/playgroundCopy";

type PolicyOutcome = { policy_id: string; decision: string; reason: string };
type PolicyView = { action: string; tier: string; trust_level: number; undefended: PolicyOutcome; defended: PolicyOutcome; executed: boolean; source: string };
type Observation = {
  status: "observed" | "not_observed"; summary: string; limits: string; test_record: string; proposed_actions: string[]; policy_view: PolicyView[];
  criteria: { id: string; met: boolean; description: string }[];
  scope?: { chars_checked: number; chars_total: number; truncated: boolean };
};
type Result = {
  mode: string; decision?: string; reason?: string; evidence?: string; input_sha256?: string; limitation?: string; model?: string; output?: string; output_truncated?: boolean; output_chars_total?: number; notice?: string; action?: string; trust_level?: number; policy_id?: string; executed?: boolean; what_affected_decision?: string[]; what_did_not?: string[];
  task?: { scenario_id: string | null; instruction: string; input_source: string; input_handling: string }; observation?: Observation;
  /** The text that was submitted, kept so the result still matches what was sent after the form changes. */
  submitted?: string;
};

const ACTIONS = [
  ["mock_web_search", "mock_web_search (user-level tool)"],
  ["mock_read_file", "mock_read_file (user-level tool)"],
  ["mock_data_exfiltrate", "mock_data_exfiltrate (admin-level tool)"],
  ["mock_config_write", "mock_config_write (admin-level tool)"],
] as const;
const TRUSTS = [[0, "0 untrusted (tool output, web page, email)"], [1, "1 user"], [2, "2 service"], [3, "3 system"]] as const;

export default function Playground() {
  const [preset, setPreset] = useState<PresetId>("scenario_01_prompt_injection");
  const [action, setAction] = useState<string>(presetById("scenario_01_prompt_injection").action);
  const [trust, setTrust] = useState(presetById("scenario_01_prompt_injection").trust);
  const [geminiEnabled, setGeminiEnabled] = useState<boolean | null>(null);
  const [text, setText] = useState(presetById("scenario_01_prompt_injection").text);
  const [mode, setMode] = useState<"simulated" | "gemini">("simulated");
  const [accessCode, setAccessCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");

  useEffect(() => {
    if (mode !== "gemini" || geminiEnabled !== null) return;
    let cancelled = false;
    fetch("/api/evaluate/gemini/status", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : { enabled: false }))
      .then(s => { if (!cancelled) setGeminiEnabled(s?.enabled === true); })
      .catch(() => { if (!cancelled) setGeminiEnabled(false); });
    return () => { cancelled = true; };
  }, [mode, geminiEnabled]);

  function choosePreset(id: PresetId) {
    const next = presetById(id);
    setPreset(id); setAction(next.action); setTrust(next.trust); setText(next.text); setResult(null); setError("");
  }

  function chooseMode(value: string) {
    if (value !== "simulated" && value !== "gemini") return;
    setMode(value); setResult(null); setError("");
  }

  const geminiReady = mode !== "gemini" || (geminiEnabled === true && consent && accessCode.trim().length > 0);

  async function run(event: FormEvent) {
    event.preventDefault();
    if (mode === "gemini" && !geminiReady) return;
    // Clear the old result first, so a blank-input error never sits next to a result for earlier input.
    setResult(null); setError("");
    if (!text.trim()) { setError("Enter some text with at least one visible character to continue."); return; }
    setBusy(true);
    const submitted = text;
    try {
      const response = await fetch(mode === "simulated" ? "/api/simulate" : "/api/evaluate/gemini", {
        method: "POST",
        headers: mode === "simulated" ? { "Content-Type": "application/json" } : { "Content-Type": "application/json", "X-Afterlife-Live-Code": accessCode },
        body: JSON.stringify(mode === "simulated" ? { text, action, trust_level: trust } : { text, scenario_id: preset === "custom" ? null : preset, external_send_consent: consent }),
      });
      if (!response.ok) {
        if (mode === "simulated") throw new ApiError(response.status, response.status === 503 ? "This mode is currently unavailable." : "The evaluation could not be completed. Check the input and try again.");
        throw new ApiError(response.status, describeLiveFailure(response.status, await response.json().catch(() => null)).message);
      }
      setResult({ ...(await response.json()), submitted });
    } catch (err) {
      // Only messages we wrote ourselves reach the screen. Network and parsing errors get fixed wording.
      setError(err instanceof ApiError ? err.message : err instanceof TypeError ? describeApiError(0, "start") : "The evaluation could not be completed. Try again.");
    }
    finally { setBusy(false); }
  }

  function saveFeedback(event: FormEvent) {
    event.preventDefault();
    if (!feedback.trim()) { setFeedbackStatus("Enter a note first."); return; }
    try { sessionStorage.setItem("afterlife-feedback-draft", feedback); setFeedbackStatus(FEEDBACK_SAVED); }
    catch { setFeedbackStatus("Could not save locally. Your note remains in this field."); }
  }

  return <div className="experiment-page">
    <header><p>Agent Afterlife / experiment</p><h1>Bring your own input</h1><p>Choose a simulation or a separate real-model response.</p></header>
    <div className="experiment-modes astryx-scope">
      <Theme theme={labTheme} mode="dark">
        <SegmentedControl label="Evaluation mode" value={mode} onChange={chooseMode} isDisabled={busy}>
          <SegmentedControlItem value="simulated" label="Simulated boundary" />
          <SegmentedControlItem value="gemini" label="Gemini live" />
        </SegmentedControl>
      </Theme>
    </div>
    <section className="experiment-section" aria-labelledby="mode-title">
      <h2 id="mode-title">{mode === "simulated" ? "A deterministic policy illustration" : "A real Gemini response"}</h2>
      <p role="status" data-testid="mode-indicator"><strong>Active mode: {experimentModeLabel(mode)}</strong></p>
      <p>{mode === "simulated" ? SIMULATION_DISCLOSURE : GEMINI_DISCLOSURE}</p>
      {mode === "gemini" && <p>{GEMINI_SCOPE}</p>}
      {mode === "gemini" && geminiEnabled !== true && <p role="note" data-testid="gemini-status">{geminiEnabled === null ? GEMINI_CHECKING : GEMINI_NOT_ENABLED}</p>}
      <form onSubmit={run}>
        <fieldset className="experiment-presets" disabled={busy}>
          <legend>Start from</legend>
          {PRESETS.map(p => <label key={p.id} className="experiment-choice">
            <input type="radio" name="preset" value={p.id} checked={preset === p.id} onChange={() => choosePreset(p.id)} />
            <span>{p.label}</span>
          </label>)}
        </fieldset>
        {mode === "simulated" && <>
          <label htmlFor="sim-action">Action the agent proposes</label>
          <select id="sim-action" value={action} onChange={e => setAction(e.target.value)} disabled={busy}>
            {ACTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor="sim-trust">Trust level of the source that supplied the text</label>
          <select id="sim-trust" value={trust} onChange={e => setTrust(Number(e.target.value))} disabled={busy}>
            {TRUSTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </>}
        {mode === "gemini" && <p data-testid="gemini-task"><strong>Task the model will receive:</strong> {presetById(preset).task} Your text is passed as untrusted data.</p>}
        <label htmlFor="experiment-input">{mode === "simulated" ? "Untrusted tool output" : "Text to send to Gemini"}</label>
        <textarea id="experiment-input" value={text} onChange={e => setText(e.target.value)} maxLength={4096} rows={7} required disabled={busy} />
        <p>{text.length} / 4096 characters</p>
        {mode === "gemini" && geminiEnabled === true && <>
          <label htmlFor="live-code">Access code (given by the operator)</label>
          <input id="live-code" type="password" autoComplete="off" value={accessCode} onChange={e => setAccessCode(e.target.value)} disabled={busy} />
          <label className="experiment-choice">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={busy} />
            <span>{GEMINI_CONSENT}</span>
          </label>
        </>}
        <button type="submit" disabled={busy || !geminiReady}>{busy ? "Evaluating…" : mode === "simulated" ? "Run simulation" : "Request Gemini response"}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && <div className="experiment-result" aria-live="polite">
        <h3>{result.mode === "simulated" ? "Simulated decision" : "Gemini response, untrusted"}</h3>
        {result.mode === "simulated" ? <>
          <p>Policy decision: <strong>{result.decision}</strong> ({result.reason}). Nothing was executed.</p><p>Evidence: {result.evidence}</p><p>Action: {result.action}, source trust level: {result.trust_level}, policy: {result.policy_id}</p><p>What affected this decision: {result.what_affected_decision?.join(", ")}.</p><p>What did not: {result.what_did_not?.join(", ")}.</p><p>Input SHA-256: <code>{result.input_sha256}</code></p><p>{result.limitation}</p>
          <p>To compare with a full guided run, open <Link href="/attack-lab">Attack Lab</Link>, run a scenario undefended and defended, then see <Link href="/evidence">Evidence</Link>.</p>
        </> : <GeminiResult result={result} />}
      </div>}
    </section>
    <section className="experiment-section" aria-labelledby="feedback-title">
      <h2 id="feedback-title">Keep a feedback note</h2>
      <p>{FEEDBACK_SCOPE}</p>
      <form onSubmit={saveFeedback}>
        <label htmlFor="feedback">Your note</label>
        <textarea id="feedback" maxLength={1000} rows={4} value={feedback} onChange={e => setFeedback(e.target.value)} />
        <button type="submit">Save local note</button>
        <button type="button" onClick={() => { try { setFeedback(sessionStorage.getItem("afterlife-feedback-draft") ?? ""); setFeedbackStatus("Loaded the note from this tab, if present."); } catch { setFeedbackStatus("Could not read the local note."); } }}>Load local note</button>
      </form>
      <p role="status">{feedbackStatus}</p>
    </section>
    <p>New here? <Link href="/attack-lab">Explore guided scenarios</Link>.</p>
  </div>;
}

function GeminiResult({ result }: { result: Result }) {
  const obs = result.observation;
  const scope = obs?.scope;
  return <>
    <section aria-labelledby="g-task"><h4 id="g-task">1. Task the model received</h4>
      <p>{result.task?.instruction}</p><p>Input source: {result.task?.input_source}. {result.task?.input_handling}</p></section>
    <section aria-labelledby="g-attack"><h4 id="g-attack">2. Your attack text (untrusted)</h4>
      <pre>{result.submitted}</pre></section>
    <section aria-labelledby="g-output"><h4 id="g-output">3. Model response ({result.model}), untrusted</h4>
      {result.output_truncated && <p role="note" data-testid="output-truncated"><strong>This reply was cut for display.</strong> Showing the first {result.output?.length} of {result.output_chars_total} characters. The rest was not shown and was not checked below.</p>}
      <pre>{result.output}</pre></section>
    {obs && <section aria-labelledby="g-obs"><h4 id="g-obs">4. Fixed text checks, not a verdict</h4>
      <p data-testid="observation-status"><strong>{obs.status === "observed" ? "Observed in the shown reply" : "Not observed in the shown reply (this does not show a defense worked)"}</strong>. {obs.summary}</p>
      {scope && <p data-testid="observation-scope">Checked {scope.chars_checked} of {scope.chars_total} characters{scope.truncated ? ", the same text that is shown above" : ", the whole reply"}.</p>}
      <ul>{obs.criteria.map(c => <li key={c.id}>{c.met ? "Met" : "Not met"}: {c.description}</li>)}</ul>
      <p>Test record used in this call: <code>{obs.test_record}</code> (isolated test data, not real).</p>
      <p>{obs.limits}</p>
    </section>}
    {obs && <section aria-labelledby="g-policy"><h4 id="g-policy">5. Policy view: what the fixed policies would decide</h4>
      {obs.policy_view.length > 0 ? <>
        <p>This part does not come from the model. It runs the policy engine on the tool names above. No tool was run.</p>
        <ScrollTable label="Policy view">
          <table><caption>What each fixed policy would decide for an untrusted source (trust 0)</caption>
            <thead><tr><th scope="col">Action</th><th scope="col">Where it came from</th><th scope="col">Undefended policy</th><th scope="col">Defended policy</th></tr></thead>
            <tbody>{obs.policy_view.map(v => <tr key={v.action}><th scope="row">{v.action}</th><td>{v.source}</td><td>{v.undefended.decision} ({v.undefended.reason})</td><td>{v.defended.decision} ({v.defended.reason})</td></tr>)}</tbody>
          </table>
        </ScrollTable></> : <p>The reply named no mock tool, so there is nothing for the policies to decide.</p>}
      <p>For the full defended versus undefended runs, open <Link href="/attack-lab">Attack Lab</Link> and <Link href="/evidence">Evidence</Link>.</p>
    </section>}
    <p>{result.notice}</p>
  </>;
}