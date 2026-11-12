"use client";

import { useState } from "react";
import { api } from "../lib/api";
import type { CompareResult, AlignedStep } from "../lib/types";

const DIFF_COLOR: Record<AlignedStep["diff"], string> = {
  SAME: "var(--text-muted)",
  OUTCOME_DIFFERS: "var(--warning)",
  EVENT_MISSING_A: "var(--attack)",
  EVENT_MISSING_B: "var(--agent)",
};

const DIFF_LABEL: Record<AlignedStep["diff"], string> = {
  SAME: "≡ Same",
  OUTCOME_DIFFERS: "≠ Outcome differs",
  EVENT_MISSING_A: "✗ Missing in A",
  EVENT_MISSING_B: "✗ Missing in B",
};

export default function TimeMachinePage() {
  const [runA, setRunA] = useState("");
  const [runB, setRunB] = useState("");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCompare() {
    if (!runA.trim() || !runB.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.compare(runA.trim(), runB.trim());
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "2rem", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>
        ⏮ Time Machine
      </h1>
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
        Compare two runs side-by-side and identify the first divergence point.
      </p>

      {/* Input */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "flex-end",
          flexWrap: "wrap",
          padding: "1.25rem",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          marginBottom: "1.5rem",
        }}
      >
        {[
          { label: "Run A (e.g. undefended)", val: runA, set: setRunA },
          { label: "Run B (e.g. defended)", val: runB, set: setRunB },
        ].map(({ label, val, set }) => (
          <div key={label} style={{ flex: "1 1 220px" }}>
            <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.4rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {label}
            </label>
            <input
              type="text"
              value={val}
              onChange={(e) => set(e.target.value)}
              placeholder="run_id (UUID)"
              aria-label={label}
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text)",
                fontSize: 13,
                fontFamily: "monospace",
              }}
            />
          </div>
        ))}
        <button
          onClick={handleCompare}
          disabled={loading || !runA.trim() || !runB.trim()}
          style={{
            padding: "0.5rem 1.5rem",
            borderRadius: 6,
            background: !loading && runA && runB ? "var(--agent)" : "var(--border)",
            color: !loading && runA && runB ? "#0B1020" : "var(--text-muted)",
            fontWeight: 700,
            fontSize: 14,
            border: "none",
            cursor: !loading && runA && runB ? "pointer" : "not-allowed",
            alignSelf: "flex-end",
          }}
        >
          {loading ? "Comparing…" : "Compare →"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "0.875rem 1rem", background: "rgba(251,113,133,0.1)", border: "1px solid var(--attack)", borderRadius: 8, color: "var(--attack)", fontSize: 13, marginBottom: "1rem" }}>
          ⚠ {error}
        </div>
      )}

      {result && (
        <>
          {/* Summary */}
          <div
            style={{
              padding: "1rem 1.25rem",
              background: "var(--surface)",
              border: `1px solid ${result.first_divergence_sequence != null ? "var(--warning)" : "var(--defense)"}`,
              borderRadius: 10,
              marginBottom: "1.5rem",
              display: "flex",
              gap: "2rem",
              flexWrap: "wrap",
              fontSize: 13,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "1.5rem" }}>
              {result.first_divergence_sequence != null ? "🔀" : "≡"}
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: result.first_divergence_sequence != null ? "var(--warning)" : "var(--defense)" }}>
                {result.first_divergence_sequence != null
                  ? `First divergence at step #${result.first_divergence_sequence}`
                  : "Runs are identical"}
              </div>
              <div style={{ color: "var(--text-muted)", marginTop: 2 }}>
                Scenario: <code style={{ color: "var(--agent)" }}>{result.scenario_id}</code>
                {" · "}Run A: <code style={{ color: "var(--attack)", fontSize: 11 }}>{result.run_a.policy_mode}</code>
                {" · "}Run B: <code style={{ color: "var(--defense)", fontSize: 11 }}>{result.run_b.policy_mode}</code>
              </div>
            </div>
          </div>

          {/* Step table */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "0.625rem 0.875rem", textAlign: "left", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.08em", width: 60 }}>#</th>
                  <th style={{ padding: "0.625rem 0.875rem", textAlign: "left", color: "var(--attack)", fontWeight: 700 }}>Run A ({result.run_a.policy_mode})</th>
                  <th style={{ padding: "0.625rem 0.875rem", textAlign: "left", color: "var(--defense)", fontWeight: 700 }}>Run B ({result.run_b.policy_mode})</th>
                  <th style={{ padding: "0.625rem 0.875rem", textAlign: "left", color: "var(--text-muted)", fontWeight: 700, width: 160 }}>Diff</th>
                </tr>
              </thead>
              <tbody>
                {result.aligned_steps.map((step) => {
                  const isDivergence = step.sequence === result.first_divergence_sequence;
                  return (
                    <tr
                      key={step.sequence}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: isDivergence ? "rgba(251,191,36,0.07)" : "transparent",
                        outline: isDivergence ? "2px solid var(--warning)" : "none",
                      }}
                    >
                      <td style={{ padding: "0.5rem 0.875rem", color: "var(--text-muted)", fontWeight: isDivergence ? 700 : 400 }}>
                        {isDivergence && "⚡"} {step.sequence}
                      </td>
                      <td style={{ padding: "0.5rem 0.875rem" }}>
                        {step.event_a ? (
                          <span>
                            <span style={{ color: "var(--text-dim)" }}>{step.event_a.event_type.replace(/_/g, " ")}</span>
                            {step.event_a.policy_outcome && (
                              <span style={{ marginLeft: 6, fontSize: 10, color: step.event_a.policy_outcome === "DENY" ? "var(--attack)" : "var(--defense)", fontWeight: 700 }}>
                                {step.event_a.policy_outcome}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem 0.875rem" }}>
                        {step.event_b ? (
                          <span>
                            <span style={{ color: "var(--text-dim)" }}>{step.event_b.event_type.replace(/_/g, " ")}</span>
                            {step.event_b.policy_outcome && (
                              <span style={{ marginLeft: 6, fontSize: 10, color: step.event_b.policy_outcome === "DENY" ? "var(--attack)" : "var(--defense)", fontWeight: 700 }}>
                                {step.event_b.policy_outcome}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "0.5rem 0.875rem", color: DIFF_COLOR[step.diff], fontWeight: 600, fontSize: 11 }}>
                        {DIFF_LABEL[step.diff]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p style={{ marginTop: "1rem", fontSize: "0.7rem", color: "var(--text-muted)", padding: "0.75rem", border: "1px solid var(--border)", borderRadius: 6, background: "rgba(23,35,56,0.5)" }}>
            ⚠ Mode A: Comparison is between synthetic fixture runs. First divergence shows the step where policy enforcement changed the outcome.
          </p>
        </>
      )}

      {!result && !loading && !error && (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)", fontSize: 14, border: "1px dashed var(--border)", borderRadius: 10 }}>
          Run two simulations in Attack Lab first, then paste their run IDs above.
        </div>
      )}
    </div>
  );
}
