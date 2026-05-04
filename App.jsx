import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import ProjectHub from "./pages/ProjectHub.jsx";
import Help from "./pages/Help.jsx";
import Settings from "./pages/Settings.jsx";
import ThreatModelerWizard from "./threatModeler/ThreatModelerWizard.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/hub" element={<ProjectHub />} />
      <Route path="/help" element={<Help />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/project/:projectId" element={<ThreatModelerWizard />} />
    </Routes>
  );
}
