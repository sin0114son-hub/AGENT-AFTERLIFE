"use client";
import { useCallback, useRef, useState } from "react";
import { api } from "./api";
import type { AgentEvent, RunStatus, PolicyMode } from "./types";

export interface SimulationState {
  status: RunStatus | "idle" | "DISCONNECTED";
  runId: string | null;
  events: AgentEvent[];
  error: string | null;
}
export function useSimulation() {
  const [state, setState] = useState<SimulationState>({status: "idle", runId: null, events: [], error: null});
  const current = useRef<AbortController | null>(null);
  const start = useCallback((scenarioId: string, mode: PolicyMode) => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setState({status: "RUNNING", runId: null, events: [], error: null});
    void api.startRun(scenarioId, mode, controller.signal, (event) => {
      if (current.current !== controller) return;
      setState(prev => ({...prev, runId: event.run_id, events: [...prev.events, event]}));
    }).then(({run, events}) => {
      if (current.current === controller) setState({status: run.status, runId: run.run_id, events, error: null});
    }).catch((error: unknown) => {
      if (current.current !== controller) return;
      if (controller.signal.aborted) {
        setState(prev => ({...prev, status: "CANCELLED", error: "Cancelled locally; server status may differ."}));
      } else {
        const message = error instanceof Error ? error.message : String(error);
        setState(prev => ({...prev, status: prev.runId ? "DISCONNECTED" : "ERROR", error: message}));
      }
    });
  }, []);
  const abort = useCallback(() => current.current?.abort(), []);
  return [state, {start, abort}] as const;
}
