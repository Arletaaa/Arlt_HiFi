import React from "react";
import ReactDOM from "react-dom/client";
import "@arlt-hifi/ui/styles.css";
import "./styles/base.css";
import "./styles/scene.css";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 网页预览 / 静态演示：补齐 preload API 并注入示例曲库。先渲染再注入，避免首帧被动态导入阻塞。
if (import.meta.env.DEV || import.meta.env.MODE === "demo") {
  void import("./dev/demo").then((module) => {
    module.installDemoDesktopApi();
  });
}
