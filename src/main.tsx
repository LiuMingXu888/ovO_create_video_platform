import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

if (import.meta.env.DEV) {
  // standalone react-devtools 默认监听 8097;开发期连上后可看组件树。
  // 该分支仅在 dev 下保留,build 时 import.meta.env.DEV 为 false 被 tree-shake。
  const script = document.createElement("script");
  script.src = "http://localhost:8097";
  document.head.appendChild(script);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
