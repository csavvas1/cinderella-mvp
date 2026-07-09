import { useStore } from "../context/AppStore";
import NotificationBell from "./NotificationBell";

export default function AppBar() {
  const { role, setRole, agentActivated, agentProfile, accountOpen, openAccount, agentBadge, customerBadge } = useStore();
  const agent = role === "agent";
  return (
    <div className="appbar">
      <div className="appbar__row">
        <button
          className={"profilebtn" + (accountOpen ? " active" : "")}
          onClick={openAccount}
          title="Account"
          aria-label="Account"
        >
          {agentProfile.photoUrl ? (
            <img className="profilebtn__img" src={agentProfile.photoUrl} alt="Account" />
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-3.9 3.6-6.5 8-6.5s8 2.6 8 6.5" />
            </svg>
          )}
        </button>
        <NotificationBell />
      </div>
      {agentActivated && (
        <div className="roletoggle">
          <button className={"roletoggle__cust" + (!agent ? " active" : "")} onClick={() => setRole("customer")}>
            <span>Customer</span>
            {/* only when AWAY (agent view) — in customer view the Calendar pill shows it */}
            {agent && customerBadge > 0 && <span className="notifbadge">{customerBadge > 9 ? "9+" : customerBadge}</span>}
          </button>
          <button className={"roletoggle__agent" + (agent ? " active agent" : "")} onClick={() => setRole("agent")}>
            <span>Agent</span>
            {/* Only surface the count here when the agent is AWAY (customer view).
                On the agent side the Jobs pill already shows it, so showing both
                would duplicate the number — one badge, on the side you're not in. */}
            {!agent && agentBadge > 0 && <span className="notifbadge">{agentBadge > 9 ? "9+" : agentBadge}</span>}
          </button>
        </div>
      )}
    </div>
  );
}
