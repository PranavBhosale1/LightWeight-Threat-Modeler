import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ThreatModeler from "./ThreatModeler.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThreatModeler />
  </StrictMode>
);
