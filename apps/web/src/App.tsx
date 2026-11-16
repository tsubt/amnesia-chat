import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Landing } from "./pages/Landing";
import { Session } from "./pages/Session";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/session/new" element={<Session mode="create" />} />
        <Route
          path="/session/:code"
          element={<Session mode="rejoin" rejoinRole="d" />}
        />
        <Route path="/join/:code" element={<Session mode="join" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
