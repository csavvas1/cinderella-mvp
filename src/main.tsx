import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { AppStoreProvider } from "./context/AppStore";
import "./theme.css";

// When a new service worker takes control (a fresh deploy), reload once so the
// installed PWA on the phone picks up the update without a manual kill/reopen.
if ("serviceWorker" in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <AppStoreProvider>
        <App />
      </AppStoreProvider>
    </HashRouter>
  </React.StrictMode>
);
