import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./features/auth/LoginPage";
import { PlayerPage } from "./features/player/PlayerPage";
import { SetupPage } from "./features/setup/SetupPage";
import { PhoneFrame } from "./shared/PhoneFrame";
import { ProtectedRoute } from "./shared/ProtectedRoute";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <PhoneFrame />
            </ProtectedRoute>
          }
        >
          <Route index element={<PlayerPage />} />
          <Route path="setup" element={<SetupPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
