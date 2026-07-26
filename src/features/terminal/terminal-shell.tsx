"use client";

import { useEffect } from "react";

import { type MobilePanel, type Workspace, useTerminalUi } from "./store";

const workspaces: Workspace[] = [
  "Dashboard",
  "Trade",
  "Markets",
  "Watchlist",
  "Journal",
  "Analytics",
];
const mobilePanels: { id: MobilePanel; label: string }[] = [
  { id: "challenge", label: "Challenge" },
  { id: "workspace", label: "Workspace" },
  { id: "activity", label: "Activity" },
];

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
    </span>
  );
}

function ChallengePanel() {
  return (
    <aside
      className="terminal-panel challenge-panel"
      aria-label="Challenge overview"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Evaluation</span>
          <h2>Axiom One</h2>
        </div>
        <span className="status-pill">Active</span>
      </div>
      <div className="account-value">
        <span>Starting balance</span>
        <strong>$50,000.00</strong>
      </div>
      <div className="progress-block">
        <div className="progress-label">
          <span>Profit target</span>
          <span>0 / 10%</span>
        </div>
        <div className="progress-track">
          <span style={{ width: "2%" }} />
        </div>
      </div>
      <dl className="metric-grid">
        <div>
          <dt>Daily loss</dt>
          <dd>5.0%</dd>
        </div>
        <div>
          <dt>Overall loss</dt>
          <dd>10.0%</dd>
        </div>
        <div>
          <dt>Trading days</dt>
          <dd>0 / 3</dd>
        </div>
        <div>
          <dt>Timezone</dt>
          <dd>UTC</dd>
        </div>
      </dl>
      <div className="panel-divider" />
      <div className="empty-compact">
        <span className="empty-icon">↗</span>
        <strong>No trades yet</strong>
        <p>Your verified trading activity will appear here.</p>
      </div>
    </aside>
  );
}

function WorkspacePanel({ workspace }: { workspace: Workspace }) {
  if (workspace !== "Trade") {
    return (
      <main
        className="terminal-panel workspace-panel centered-state"
        id="main-content"
        tabIndex={-1}
      >
        <span className="state-kicker">{workspace}</span>
        <h1>{workspace} workspace</h1>
        <p>
          This workspace has no data to display yet. Trade remains the active
          terminal workspace.
        </p>
        <button
          className="primary-button"
          onClick={() => useTerminalUi.getState().setWorkspace("Trade")}
        >
          Return to Trade
        </button>
      </main>
    );
  }
  return (
    <main
      className="terminal-panel workspace-panel"
      id="main-content"
      tabIndex={-1}
    >
      <div className="instrument-row">
        <div className="asset-badge">₿</div>
        <div>
          <span className="eyebrow">Selected market</span>
          <h1>BTC / USD</h1>
        </div>
        <div className="market-stat positive">
          <span>Mark price</span>
          <strong>$67,500.00</strong>
        </div>
        <div className="market-stat">
          <span>24h volume</span>
          <strong>N/A</strong>
        </div>
        <span className="demo-badge">Demo data</span>
      </div>
      <section className="market-canvas" aria-labelledby="market-canvas-title">
        <div className="canvas-toolbar">
          <div>
            <span className="live-dot" />
            <span>Demo feed connected</span>
          </div>
          <span>Chart provider not configured</span>
        </div>
        <div className="chart-empty">
          <div className="chart-glyph" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <h2 id="market-canvas-title">Market canvas ready</h2>
          <p>
            Historical and real-time chart rendering will attach here without
            changing the terminal layout.
          </p>
        </div>
      </section>
      <section
        className="terminal-empty"
        aria-label="Order workspace empty state"
      >
        <div>
          <span className="eyebrow">Order workspace</span>
          <h2>No draft order</h2>
        </div>
        <p>
          Order controls remain hidden until the verified order-ticket stage.
        </p>
      </section>
    </main>
  );
}

function ActivityPanel() {
  const activityView = useTerminalUi((state) => state.activityView);
  const setActivityView = useTerminalUi((state) => state.setActivityView);
  const emptyCopy = {
    Positions: [
      "No open positions",
      "Positions and live PnL will appear after a simulated order executes.",
    ],
    Orders: [
      "No working orders",
      "Pending Limit and Stop Limit orders will appear here.",
    ],
    Risk: [
      "No risk violations",
      "This account is currently clear to place simulated orders.",
    ],
  } as const;
  return (
    <aside
      className="terminal-panel activity-panel"
      aria-label="Trading activity"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Account</span>
          <h2>Activity</h2>
        </div>
        <span className="count-badge">0</span>
      </div>
      <div
        className="segmented-control"
        role="tablist"
        aria-label="Activity view"
      >
        {(["Positions", "Orders", "Risk"] as const).map((view) => (
          <button
            key={view}
            role="tab"
            aria-selected={activityView === view}
            onClick={() => setActivityView(view)}
          >
            {view}
          </button>
        ))}
      </div>
      <div className="empty-activity" role="tabpanel">
        <span className="rings" aria-hidden="true" />
        <strong>{emptyCopy[activityView][0]}</strong>
        <p>{emptyCopy[activityView][1]}</p>
      </div>
      <div className="risk-footer">
        <div>
          <span>Daily drawdown</span>
          <strong>0.00%</strong>
        </div>
        <div className="progress-track">
          <span style={{ width: "0%" }} />
        </div>
        <small>5.00% available</small>
      </div>
    </aside>
  );
}

export function TerminalShell() {
  const ui = useTerminalUi();
  useEffect(() => {
    document.documentElement.dataset.theme = ui.theme;
  }, [ui.theme]);
  return (
    <div className="terminal-app">
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      <header className="topbar">
        <a
          className="brand"
          href="#main-content"
          aria-label="Axiom terminal home"
        >
          <BrandMark />
          <span>
            <strong>AXIOM</strong>
            <small>PROP TERMINAL</small>
          </span>
        </a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {workspaces.map((item) => (
            <button
              key={item}
              className={ui.workspace === item ? "active" : ""}
              aria-current={ui.workspace === item ? "page" : undefined}
              onClick={() => ui.setWorkspace(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="topbar-actions">
          <span className="simulation-label">
            <span />
            Simulation
          </span>
          <button
            className="icon-button theme-toggle"
            onClick={ui.toggleTheme}
            aria-label={`Switch to ${ui.theme === "dark" ? "light" : "dark"} theme`}
          >
            {ui.theme === "dark" ? "☼" : "☾"}
          </button>
          <div className="popover-anchor">
            <button
              className="icon-button"
              onClick={ui.toggleNotifications}
              aria-expanded={ui.notificationsOpen}
              aria-label="Notifications"
            >
              ◌
            </button>
            {ui.notificationsOpen && (
              <div className="popover" role="status">
                <strong>All clear</strong>
                <span>No new notifications.</span>
              </div>
            )}
          </div>
          <div className="popover-anchor">
            <button
              className="profile-button"
              onClick={ui.toggleProfile}
              aria-expanded={ui.profileOpen}
            >
              <span>DT</span>
              <span className="profile-copy">
                <strong>Demo Trader</strong>
                <small>Evaluation account</small>
              </span>
            </button>
            {ui.profileOpen && (
              <div className="popover profile-popover">
                <strong>Demo Trader</strong>
                <span>demo@axiom.local</span>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="mobile-tabs" role="tablist" aria-label="Terminal panels">
        {mobilePanels.map((panel) => (
          <button
            key={panel.id}
            role="tab"
            aria-selected={ui.mobilePanel === panel.id}
            onClick={() => ui.setMobilePanel(panel.id)}
          >
            {panel.label}
          </button>
        ))}
      </div>
      <div className="terminal-grid">
        <div
          className={
            ui.mobilePanel === "challenge" ? "mobile-visible" : "mobile-hidden"
          }
        >
          <ChallengePanel />
        </div>
        <div
          className={
            ui.mobilePanel === "workspace" ? "mobile-visible" : "mobile-hidden"
          }
        >
          <WorkspacePanel workspace={ui.workspace} />
        </div>
        <div
          className={
            ui.mobilePanel === "activity" ? "mobile-visible" : "mobile-hidden"
          }
        >
          <ActivityPanel />
        </div>
      </div>
      <footer className="statusbar">
        <span>
          <i className="live-dot" />
          Demo feed
        </span>
        <span>Server time · UTC</span>
        <span className="statusbar-right">Execution: simulated</span>
      </footer>
    </div>
  );
}
