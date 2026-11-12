"use client";

import { useState } from "react";
import { api } from "../lib/api";
import type { Report } from "../lib/types";

const VERDICT_COLOR: Record<string, string> = {
  DEFENDED: "var(--defense)",
  VULNERABLE: "var(--attack)",
  ERROR: "var(--warning)",
  INCONCLUSIVE: "var(--text-muted)",
};

export default function EvidencePage() {
  const [runId, setRunId] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFetch() {
    if (!runId.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const r = await api.getReport(runId.trim());
      setReport(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "2rem", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>
        📋 Evidence Report
      </h1>
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
        Retrieve the structured security evidence for any completed run.
      </p>

      {/* Input */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "flex-end",
          padding: "1.25rem",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.4rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Run ID
          </label>
          <input
            type="text"
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            placeholder="Paste a run UUID from Attack Lab"
            aria-label="Run ID"
            onKeyDown={(e) => e.key === "Enter" && handleFetch()}
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
        <button
          onClick={handleFetch}
          disabled={loading || !runId.trim()}
          style={{
            padding: "0.5rem 1.25rem",
            borderRadius: 6,
            background: !loading && runId.trim() ? "var(--agent)" : "var(--border)",
            color: !loading && runId.trim() ? "#0B1020" : "var(--text-muted)",
            fontWeight: 700,
            fontSize: 14,
            border: "none",
            cursor: !loading && runId.trim() ? "pointer" : "not-allowed",
            alignSelf: "flex-end",
          }}
        >
          {loading ? "Loading…" : "Fetch"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "0.875rem", background: "rgba(251,113,133,0.1)", border: "1px solid var(--attack)", borderRadius: 8, color: "var(--attack)", fontSize: 13, marginBottom: "1rem" }}>
          ⚠ {error}
        </div>
      )}

      {report && (
        <>
          {/* Verdict card */}
          <div
            style={{
              padding: "1.25rem",
              background: "var(--surface)",
              border: `2px solid ${VERDICT_COLOR[report.verdict] ?? "var(--border)"}`,
              borderRadius: 10,
              marginBottom: "1.5rem",
              display: "flex",
              gap: "1.25rem",
              alignItems: "flex-start",
            }}
          >
            <div style={{ fontSize: "2.5rem", lineHeight: 1 }}>
              {report.verdict === "DEFENDED" ? "🛡" : report.verdict === "VULNERABLE" ? "⚠️" : report.verdict === "ERROR" ? "💥" : "❓"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: VERDICT_COLOR[report.verdict] }}>
                {report.verdict}
              </div>
              <div style={{ color: "var(--text-dim)", fontSize: 14, marginTop: "0.25rem" }}>{report.verdict_evidence}</div>
              <div style={{ display: "flex", gap: "1.5rem", marginTop: "0.75rem", flexWrap: "wrap", fontSize: 13 }}>
                {[
                  ["Scenario", report.scenario_id],
                  ["Mode", report.policy_mode],
                  ["Total events", report.summary.total_events],
                  ["Proposed", report.summary.tool_calls_proposed],
                  ["Allowed", report.summary.tool_calls_allowed],
                  ["Denied", report.summary.tool_calls_denied],
                  ["Injections", report.summary.injections_detected],
                ].map(([label, val]) => (
                  <div key={String(label)}>
                    <span style={{ color: "var(--text-muted)" }}>{label}: </span>
                    <strong style={{ color: "var(--text)" }}>{val}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Event log */}
          <h2 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
            Audit Log ({report.events.length} events)
          </h2>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                  {["#", "Type", "Tool", "Policy", "Reason", "Provenance"].map((h) => (
                    <th key={h} style={{ padding: "0.625rem 0.75rem", textAlign: "left", color: "var(--text-muted)", fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.events.map((ev) => {
                  const isDeny = ev.policy_outcome === "DENY";
                  return (
                    <tr key={ev.event_id} style={{ borderBottom: "1px solid var(--border)", background: isDeny ? "rgba(251,113,133,0.04)" : "transparent" }}>
                      <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)" }}>{ev.sequence_number}</td>
                      <td style={{ padding: "0.5rem 0.75rem", color: isDeny ? "var(--attack)" : ev.event_type === "TOOL_CALL_EXECUTED" ? "var(--defense)" : "var(--text-dim)", fontWeight: 600 }}>
                        {ev.event_type.replace(/_/g, " ")}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>
                        {ev.tool_name ? <code style={{ color: "var(--warning)", fontSize: 11 }}>{ev.tool_name}</code> : <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>
                        {ev.policy_outcome ? (
                          <span style={{ color: isDeny ? "var(--attack)" : "var(--defense)", fontWeight: 700, fontSize: 11 }}>
                            {ev.policy_outcome}
                          </span>
                        ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)", fontSize: 11 }}>
                        {ev.policy_reason_code ?? "—"}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)", fontSize: 11 }}>
                        {ev.content_provenance ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p style={{ marginTop: "1rem", fontSize: "0.7rem", color: "var(--text-muted)", padding: "0.75rem", border: "1px solid var(--border)", borderRadius: 6, background: "rgba(23,35,56,0.5)" }}>
            ⚠ Mode A: This evidence log is generated from deterministic synthetic fixtures.
            It does not represent real AI model behavior or real network activity.
          </p>
        </>
      )}

      {!report && !loading && !error && (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)", fontSize: 14, border: "1px dashed var(--border)", borderRadius: 10 }}>
          Run a simulation in Attack Lab and paste the run ID here.
        </div>
      )}
    </div>
  );
}
