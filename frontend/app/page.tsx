import Link from "next/link";

export default function Home() {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 120px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "4rem 2rem",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background grid */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(56,189,248,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          pointerEvents: "none",
        }}
      />

      {/* Hero */}
      <div style={{ position: "relative", maxWidth: "800px" }}>
        <p
          style={{
            fontSize: "0.75rem",
            letterSpacing: "0.2em",
            color: "var(--attack)",
            fontWeight: 700,
            marginBottom: "1rem",
            textTransform: "uppercase",
          }}
        >
          Kiroween 2026 · Frankenstein Category
        </p>

        <h1
          style={{
            fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginBottom: "1.5rem",
            background: "linear-gradient(135deg, #E2E8F0 0%, #38BDF8 50%, #34D399 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Agent Afterlife
        </h1>

        <p
          style={{
            fontSize: "1.25rem",
            color: "var(--text-dim)",
            lineHeight: 1.6,
            maxWidth: "600px",
            margin: "0 auto 2.5rem",
          }}
        >
          An interactive AI agent security laboratory. Watch synthetic agents
          attempt attacks, observe policy enforcement in real time, and compare
          vulnerable vs. defended executions side by side.
        </p>

        {/* CTA buttons */}
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/attack-lab"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.875rem 2rem",
              borderRadius: "8px",
              background: "var(--agent)",
              color: "#0B1020",
              fontWeight: 700,
              fontSize: "1rem",
              textDecoration: "none",
              letterSpacing: "0.02em",
            }}
          >
            Launch Attack Lab →
          </Link>
          <Link
            href="/time-machine"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.875rem 2rem",
              borderRadius: "8px",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text)",
              fontWeight: 600,
              fontSize: "1rem",
              textDecoration: "none",
            }}
          >
            Time Machine
          </Link>
        </div>

        {/* Feature cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
            marginTop: "4rem",
            textAlign: "left",
          }}
        >
          {[
            {
              icon: "🔴",
              label: "Attack Lab",
              desc: "Live node graph. Watch the agent propose tool calls and observe policy denials.",
              color: "var(--attack)",
            },
            {
              icon: "⏮",
              label: "Time Machine",
              desc: "Side-by-side before/after comparison with first-divergence detection.",
              color: "var(--agent)",
            },
            {
              icon: "🛡",
              label: "Policy Engine",
              desc: "Independent server-side enforcement. DENY never becomes DEFENDED.",
              color: "var(--defense)",
            },
            {
              icon: "📋",
              label: "Evidence Report",
              desc: "Tamper-proof append-only audit log with structured security outcomes.",
              color: "var(--warning)",
            },
          ].map(({ icon, label, desc, color }) => (
            <div
              key={label}
              style={{
                padding: "1.25rem",
                borderRadius: "10px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>{icon}</div>
              <div style={{ fontWeight: 700, color, marginBottom: "0.375rem", fontSize: "0.9rem" }}>
                {label}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                {desc}
              </div>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <p
          style={{
            marginTop: "3rem",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            padding: "0.75rem 1.25rem",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            background: "rgba(23,35,56,0.5)",
          }}
        >
          ⚠ Mode A: All agents, tools, and attack scenarios are fully synthetic. No real AI models,
          credentials, or external services are used. Attack outcomes are fixture-driven, not fabricated.
        </p>
      </div>
    </div>
  );
}
