import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { LanguageProvider } from './context/LanguageContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import DashboardLayout from './layouts/DashboardLayout'
import DashboardPage from './pages/DashboardPage'
import QueuePage from './pages/QueuePage'
import VerificationPage from './pages/VerificationPage'
import ProduceEntryPage from './pages/ProduceEntryPage'
import ProcurementEntryPage from './pages/ProcurementEntryPage'
import PaymentStatusPage from './pages/PaymentStatusPage'
import FarmersRecordsPage from './pages/FarmersRecordsPage'

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              {/* ── Public Routes ── */}
              <Route path="/acc/login" element={<LoginPage />} />

              {/* ── Protected ACC Routes ── */}
              <Route
                path="/acc"
                element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                {/* Redirect /acc to /acc/dashboard */}
                <Route index element={<Navigate to="dashboard" replace />} />

                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="queue" element={<QueuePage />} />
                <Route path="verification" element={<VerificationPage />} />
                <Route path="verification/:id" element={<VerificationPage />} />
                <Route path="produce" element={<ProduceEntryPage />} />
                <Route path="produce/:id" element={<ProduceEntryPage />} />
                <Route path="procurement" element={<ProcurementEntryPage />} />
                <Route path="procurement/:id" element={<ProcurementEntryPage />} />
                <Route path="farmers" element={<FarmersRecordsPage />} />
                <Route path="payments" element={<PaymentStatusPage />} />
              </Route>

              {/* Redirect root to ACC login */}
              <Route path="/" element={<Navigate to="/acc/login" replace />} />

              {/* Catch-all: redirect unknown paths to login */}
              <Route path="*" element={<Navigate to="/acc/login" replace />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </LanguageProvider>
  )
}
