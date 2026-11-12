"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { api } from "../lib/api";
import { useSimulation } from "../lib/useSimulation";
import { buildGraph } from "../lib/graphUtils";
import type { ScenarioSummary, Report, PolicyMode } from "../lib/types";

// React Flow must be dynamically imported (no SSR) due to browser-only APIs
const ReactFlowGraph = dynamic(() => import("../components/ReactFlowGraph"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: "var(--text-muted)", fontSize: 14 }}>
      Loading graph…
    </div>
  ),
});

const VERDICT_COLOR: Record<string, string> = {
  DEFENDED: "var(--defense)",
  VULNERABLE: "var(--attack)",
  ERROR: "var(--warning)",
  INCONCLUSIVE: "var(--text-muted)",
};

const VERDICT_ICON: Record<string, string> = {
  DEFENDED: "🛡",
  VULNERABLE: "⚠️",
  ERROR: "💥",
  INCONCLUSIVE: "❓",
};

export default function AttackLabPage() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const [mode, setMode] = useState<PolicyMode>("defended");
  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [scenariosError, setScenariosError] = useState<string | null>(null);

  const [sim, controls] = useSimulation();

  // Load scenarios on mount
  useEffect(() => {
    api
      .listScenarios()
      .then((list) => {
        setScenarios(list);
        if (list.length > 0) setSelectedScenario(list[0].scenario_id);
      })
      .catch((e: Error) => setScenariosError(e.message));
  }, []);

  // Fetch report when run completes
  useEffect(() => {
    if (sim.status !== "COMPLETE" || !sim.runId) return;
    let active = true;
    api
      .getReport(sim.runId)
      .then((value) => { if (active) setReport(value); })
      .catch((error: Error) => { if (active) setReportError(error.message); });
    return () => { active = false; };
  }, [sim.status, sim.runId]);

  const handleStart = useCallback(() => {
    if (!selectedScenario) return;
    setReport(null);
    setReportError(null);
    controls.start(selectedScenario, mode);
  }, [selectedScenario, mode, controls]);

  const { nodes, edges } = buildGraph(sim.events);

  const currentScenario = scenarios.find((s) => s.scenario_id === selectedScenario);

  const reportLoading = sim.status === "COMPLETE" && !report && !reportError;
  const isRunning = sim.status === "RUNNING";
  const canStart = !isRunning && !!selectedScenario && !scenariosError;

  return (
    <div style={{ padding: "2rem", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "0.25rem" }}>
          🔴 Attack Lab
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Select a scenario, choose a policy mode, and observe real-time agent behavior.
        </p>
      </div>

      {/* Controls row */}
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
        {/* Scenario selector */}
        <div style={{ flex: "2 1 240px" }}>
          <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.4rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Scenario
          </label>
          {scenariosError ? (
            <p style={{ color: "var(--attack)", fontSize: 13 }}>⚠ Backend unavailable — start FastAPI first</p>
          ) : (
            <select
              value={selectedScenario}
              onChange={(e) => setSelectedScenario(e.target.value)}
              disabled={isRunning}
              aria-label="Select scenario"
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text)",
                fontSize: 14,
                cursor: isRunning ? "not-allowed" : "pointer",
              }}
            >
              {scenarios.map((s) => (
                <option key={s.scenario_id} value={s.scenario_id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Mode selector */}
        <div style={{ flex: "1 1 180px" }}>
          <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.4rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Policy Mode
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {(["defended", "undefended"] as PolicyMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={isRunning}
                aria-pressed={mode === m}
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  borderRadius: 6,
                  border: `1px solid ${mode === m ? (m === "defended" ? "var(--defense)" : "var(--attack)") : "var(--border)"}`,
                  background: mode === m ? (m === "defended" ? "rgba(52,211,153,0.15)" : "rgba(251,113,133,0.15)") : "transparent",
                  color: mode === m ? (m === "defended" ? "var(--defense)" : "var(--attack)") : "var(--text-dim)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isRunning ? "not-allowed" : "pointer",
                  textTransform: "capitalize",
                }}
              >
                {m === "defended" ? "🛡 Defended" : "⚠️ Undefended"}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "0.5rem", alignSelf: "flex-end" }}>
          <button
            onClick={handleStart}
            disabled={!canStart}
            aria-label="Start simulation"
            style={{
              padding: "0.5rem 1.5rem",
              borderRadius: 6,
              background: canStart ? "var(--agent)" : "var(--border)",
              color: canStart ? "#0B1020" : "var(--text-muted)",
              fontWeight: 700,
              fontSize: 14,
              border: "none",
              cursor: canStart ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
            }}
          >
            {isRunning ? "Running…" : "▶ Run"}
          </button>
          {isRunning && (
            <button
              onClick={controls.abort}
              aria-label="Cancel simulation"
              style={{
                padding: "0.5rem 1rem",
                borderRadius: 6,
                background: "transparent",
                border: "1px solid var(--attack)",
                color: "var(--attack)",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              ✕ Cancel
            </button>
          )}
        </div>
      </div>

      {/* Scenario metadata */}
      {currentScenario && (
        <div
          style={{
            padding: "0.875rem 1.25rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            marginBottom: "1.5rem",
            display: "flex",
            gap: "2rem",
            flexWrap: "wrap",
            fontSize: 13,
          }}
        >
          <span><span style={{ color: "var(--text-muted)" }}>ID: </span><code style={{ color: "var(--agent)" }}>{currentScenario.scenario_id}</code></span>
          <span><span style={{ color: "var(--text-muted)" }}>Attack: </span><span style={{ color: "var(--attack)" }}>{currentScenario.attack_category}</span></span>
          <span><span style={{ color: "var(--text-muted)" }}>Steps: </span>{currentScenario.step_count}</span>
          <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>{currentScenario.description}</span>
        </div>
      )}

      {/* Status bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          overflowWrap: "anywhere",
          gap: "0.75rem",
          padding: "0.625rem 1rem",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          marginBottom: "1rem",
          fontSize: 13,
        }}
      >
        {isRunning && (
          <span
            className="pulse-dot"
            style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--agent)", display: "inline-block", flexShrink: 0 }}
            aria-hidden
          />
        )}
        <span style={{ color: "var(--text-dim)" }}>
          Status:{" "}
          <strong
            style={{
              color:
                sim.status === "COMPLETE" ? "var(--defense)"
                : sim.status === "RUNNING" ? "var(--agent)"
                : sim.status === "ERROR" ? "var(--attack)"
                : sim.status === "CANCELLED" ? "var(--warning)"
                : "var(--text-muted)",
            }}
          >
            {sim.status.toUpperCase()}
          </strong>
        </span>
        <span style={{ color: "var(--text-muted)" }}>·</span>
        <span style={{ color: "var(--text-dim)" }}>Events: {sim.events.length}</span>
        {sim.runId && (
          <>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span style={{ color: "var(--text-muted)" }}>
              Run: <code style={{ color: "var(--text-dim)", fontSize: 11 }}>{sim.runId}</code>
            </span>
          </>
        )}
        {sim.error && (
          <span style={{ color: "var(--attack)", marginLeft: "auto" }}>⚠ {sim.error}</span>
        )}
      </div>

      {/* Main layout: graph + event list */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "1rem", alignItems: "start" }}>
        {/* Graph */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
            height: 480,
            background: "var(--surface)",
          }}
        >
          <ReactFlowGraph nodes={nodes} edges={edges} />
        </div>

        {/* Event timeline */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--surface)",
            height: 480,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Event Timeline
          </div>
          <div style={{ overflowY: "auto", flex: 1, padding: "0.5rem" }}>
            {sim.events.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13, padding: "1rem", textAlign: "center" }}>
                {sim.status === "idle" ? "Press ▶ Run to start" : "Waiting for events…"}
              </p>
            ) : (
              sim.events.map((ev) => {
                const isDeny = ev.event_type === "TOOL_CALL_DENIED" || ev.event_type === "TRUST_CHECK_FAILED" || ev.event_type === "INJECTION_DETECTED";
                const isAllow = ev.event_type === "TOOL_CALL_EXECUTED";
                const color = isDeny ? "var(--attack)" : isAllow ? "var(--defense)" : "var(--text-dim)";
                return (
                  <div
                    key={ev.event_id}
                    style={{
                      padding: "0.5rem 0.75rem",
                      marginBottom: "0.375rem",
                      borderRadius: 6,
                      border: `1px solid ${isDeny ? "rgba(251,113,133,0.3)" : isAllow ? "rgba(52,211,153,0.3)" : "var(--border)"}`,
                      background: isDeny ? "rgba(251,113,133,0.05)" : isAllow ? "rgba(52,211,153,0.05)" : "transparent",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <span style={{ color, fontWeight: 600 }}>
                        #{ev.sequence_number} {ev.event_type.replace(/_/g, " ")}
                      </span>
                      {ev.policy_outcome && (
                        <span style={{ fontSize: 10, color: isDeny ? "var(--attack)" : "var(--defense)", fontWeight: 700 }}>
                          {ev.policy_outcome}
                        </span>
                      )}
                    </div>
                    {ev.tool_name && (
                      <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                        tool: <code style={{ color: "var(--warning)" }}>{ev.tool_name}</code>
                      </div>
                    )}
                    {ev.policy_reason_code && (
                      <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                        reason: {ev.policy_reason_code}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {reportError && <p role="alert">Report unavailable: {reportError}</p>}
      <p>These are synthetic scenarios using mock tools; no real agent actions occur.</p>
      {/* Report */}
      {(reportLoading || report) && (
        <div
          style={{
            marginTop: "1.5rem",
            padding: "1.25rem",
            background: "var(--surface)",
            border: `1px solid ${report ? VERDICT_COLOR[report.verdict] ?? "var(--border)" : "var(--border)"}`,
            borderRadius: 10,
          }}
        >
          {reportLoading && <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading report…</p>}
          {report && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
                <span style={{ fontSize: "2rem" }}>{VERDICT_ICON[report.verdict]}</span>
                <div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: VERDICT_COLOR[report.verdict] }}>
                    {report.verdict}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{report.verdict_evidence}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", fontSize: 13 }}>
                {[
                  ["Proposed", report.summary.tool_calls_proposed],
                  ["Allowed", report.summary.tool_calls_allowed],
                  ["Denied", report.summary.tool_calls_denied],
                  ["Injections", report.summary.injections_detected],
                  ["Trust Violations", report.summary.trust_violations],
                ].map(([label, val]) => (
                  <div key={String(label)}>
                    <span style={{ color: "var(--text-muted)" }}>{label}: </span>
                    <strong style={{ color: "var(--text)" }}>{val}</strong>
                  </div>
                ))}
              </div>
              <p style={{ marginTop: "0.75rem", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                ⚠ Mode A: These results are fixture-driven synthetic simulations.
                They do not represent real AI model behavior.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
