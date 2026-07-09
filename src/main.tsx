import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { AppStoreProvider } from "./context/AppStore";
import "./theme.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <AppStoreProvider>
        <App />
      </AppStoreProvider>
    </HashRouter>
  </React.StrictMode>
);
