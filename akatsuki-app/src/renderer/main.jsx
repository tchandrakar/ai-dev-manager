import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { GlobalStyles } from "./components";

// Switch between apps: ?app=kawaiidb in URL or localStorage
const params = new URLSearchParams(window.location.search);
const appParam = params.get("app") || localStorage.getItem("akatsuki:active-app") || "akatsuki";
if (params.get("app")) localStorage.setItem("akatsuki:active-app", params.get("app"));

const KawaiiApp = lazy(() => import("./kawaiidb/KawaiiApp"));

function Root() {
  if (appParam === "kawaiidb") {
    return (
      <StrictMode>
        <GlobalStyles />
        <Suspense fallback={<div style={{ background: "#070B14", width: "100vw", height: "100vh" }} />}>
          <KawaiiApp />
        </Suspense>
      </StrictMode>
    );
  }
  return (
    <StrictMode>
      <App />
    </StrictMode>
  );
}

createRoot(document.getElementById("root")).render(<Root />);
