import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app";
import "./styles/admin.css";

const root = document.getElementById("wp-agent-admin-root");

if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
