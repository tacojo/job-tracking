import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { ThemeProvider } from './contexts/ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import AnalyticsPage from './pages/AnalyticsPage'
import ApplicationDetailPage from './pages/ApplicationDetailPage'
import ApplicationsPage from './pages/ApplicationsPage'
import CompaniesPage from './pages/CompaniesPage'
import CompanyDetailPage from './pages/CompanyDetailPage'
import CVVersionsPage from './pages/CVVersionsPage'
import LoginPage from './pages/LoginPage'
import ProspectPage from './pages/ProspectPage'
import RecruiterDetailPage from './pages/RecruiterDetailPage'
import RecruitersPage from './pages/RecruitersPage'
import SettingsPage from './pages/SettingsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <SettingsProvider>
      <BrowserRouter>
        <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/applications" replace />} />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Layout>
                  <AnalyticsPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/applications"
            element={
              <ProtectedRoute>
                <Layout>
                  <ErrorBoundary>
                    <ApplicationsPage />
                  </ErrorBoundary>
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/applications/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <ApplicationDetailPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/recruiters"
            element={
              <ProtectedRoute>
                <Layout>
                  <RecruitersPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/recruiters/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <RecruiterDetailPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies"
            element={
              <ProtectedRoute>
                <Layout>
                  <CompaniesPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <CompanyDetailPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/cvs"
            element={
              <ProtectedRoute>
                <Layout>
                  <CVVersionsPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/prospect"
            element={
              <ProtectedRoute>
                <Layout>
                  <ProspectPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Layout>
                  <SettingsPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/applications" replace />} />
        </Routes>
        </AuthProvider>
      </BrowserRouter>
      </SettingsProvider>
    </ThemeProvider>
    </QueryClientProvider>
  )
}
