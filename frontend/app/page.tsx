import Link from "next/link";

export default function Home() {
  return <div className="home">
    <section className="home-intro">
      <div>
        <p className="home-context">Agent Afterlife / security laboratory</p>
        <h1>Bring an agent run back to life.</h1>
        <p className="home-lede">Replay synthetic attacks and see where policy changes the outcome.</p>
        <div className="home-actions">
          <Link className="primary-link" href="/attack-lab">Start a guided scenario</Link>
          <Link href="/playground">Try your own input</Link>
          <Link href="/time-machine">Time Machine</Link>
        </div>
      </div>
      <section className="home-protocol" aria-labelledby="flow-title">
        <h2 id="flow-title">Guided experiment</h2>
        <ol>
          <li><strong>Choose a scenario</strong><span>Start with a synthetic attack and mock tools.</span></li>
          <li><strong>Run the policy</strong><span>Watch proposed actions and policy decisions.</span></li>
          <li><strong>Examine the record</strong><span>Compare runs and inspect their evidence.</span></li>
        </ol>
      </section>
    </section>
    <section className="home-paths" aria-label="Ways to explore">
      <div><h2>Guided scenarios</h2><p>Replay fixture-driven agent runs in Attack Lab, then compare the first difference and the key policy decision in Time Machine and inspect the audit record in Evidence.</p></div>
      <div><h2>Your experiment</h2><p>Choose a mock action and trust level for a deterministic policy illustration. Your text does not determine the decision.</p></div>
      <div><h2>Gemini live</h2><p>A separate, optional model response. Live mode is disabled unless an operator enables it; model output is not a defense verdict.</p></div>
    </section>
    <p className="home-note">Guided mode uses synthetic agents, tools and scenarios. No real model, credentials or external services are used there. Results are fixture-driven.</p>
  </div>;
}
