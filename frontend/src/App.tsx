import { lazy, type ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AsyncBoundary } from '@/components/layout/AsyncBoundary'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'

// Each route is a separate chunk: a phone opening the landing page never downloads the 3D
// fitting room or the admin dashboard. Vendor and Three.js are still shared chunks.
const LandingPage = lazy(() => import('@/pages/LandingPage').then((m) => ({ default: m.LandingPage })))
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('@/pages/RegisterPage').then((m) => ({ default: m.RegisterPage })))
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })))
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const StudioHubPage = lazy(() => import('@/pages/StudioHubPage').then((m) => ({ default: m.StudioHubPage })))
const DesignsPage = lazy(() => import('@/pages/DesignsPage').then((m) => ({ default: m.DesignsPage })))
const AvatarPage = lazy(() => import('@/pages/AvatarPage').then((m) => ({ default: m.AvatarPage })))
const FavoritesPage = lazy(() => import('@/pages/FavoritesPage').then((m) => ({ default: m.FavoritesPage })))
const AccessoriesPage = lazy(() => import('@/pages/AccessoriesPage').then((m) => ({ default: m.AccessoriesPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const StudioPage = lazy(() => import('@/pages/StudioPage').then((m) => ({ default: m.StudioPage })))
const GarmentPage = lazy(() => import('@/pages/GarmentPage').then((m) => ({ default: m.GarmentPage })))
const DesignEditorPage = lazy(() => import('@/pages/DesignEditorPage').then((m) => ({ default: m.DesignEditorPage })))
const FittingRoomPage = lazy(() => import('@/pages/FittingRoomPage').then((m) => ({ default: m.FittingRoomPage })))
const TryOnPage = lazy(() => import('@/pages/TryOnPage').then((m) => ({ default: m.TryOnPage })))
const OutfitsPage = lazy(() => import('@/pages/OutfitsPage').then((m) => ({ default: m.OutfitsPage })))
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const AssistantPage = lazy(() => import('@/pages/AssistantPage').then((m) => ({ default: m.AssistantPage })))
const CataloguePage = lazy(() => import('@/pages/CataloguePage').then((m) => ({ default: m.CataloguePage })))
const InspirationPage = lazy(() => import('@/pages/InspirationPage').then((m) => ({ default: m.InspirationPage })))
const MarketplacePage = lazy(() => import('@/pages/MarketplacePage').then((m) => ({ default: m.MarketplacePage })))
const BusinessPage = lazy(() => import('@/pages/BusinessPage').then((m) => ({ default: m.BusinessPage })))
const BusinessDashboardPage = lazy(() => import('@/pages/BusinessDashboardPage').then((m) => ({ default: m.BusinessDashboardPage })))
const PrintPackagesPage = lazy(() => import('@/pages/PrintPackagesPage').then((m) => ({ default: m.PrintPackagesPage })))
const PrintPackagePage = lazy(() => import('@/pages/PrintPackagePage').then((m) => ({ default: m.PrintPackagePage })))
const OrdersPage = lazy(() => import('@/pages/OrdersPage').then((m) => ({ default: m.OrdersPage })))
const OrderDetailPage = lazy(() => import('@/pages/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const AdminPage = lazy(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

const page = (element: ReactNode) => <AsyncBoundary>{element}</AsyncBoundary>

const protectedPage = (element: ReactNode, requireAdmin = false) => (
  <ProtectedRoute requireAdmin={requireAdmin}>{page(element)}</ProtectedRoute>
)

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={page(<LandingPage />)} />
        <Route path="login" element={page(<LoginPage />)} />
        <Route path="register" element={page(<RegisterPage />)} />
        <Route path="catalogue" element={page(<CataloguePage />)} />
        <Route path="inspiration" element={page(<InspirationPage />)} />
        <Route path="studio" element={page(<StudioHubPage />)} />
        <Route path="studio/accessories" element={page(<AccessoriesPage />)} />
        <Route path="studio/:gender" element={page(<StudioPage />)} />
        <Route path="garment/:slug" element={page(<GarmentPage />)} />
        <Route path="marketplace" element={page(<MarketplacePage />)} />
        <Route path="marketplace/:slug" element={page(<BusinessPage />)} />

        <Route path="dashboard" element={protectedPage(<DashboardPage />)} />
        <Route path="designs" element={protectedPage(<DesignsPage />)} />
        <Route path="editor/:designId" element={protectedPage(<DesignEditorPage />)} />
        <Route path="avatar" element={protectedPage(<AvatarPage />)} />
        <Route path="favorites" element={protectedPage(<FavoritesPage />)} />
        <Route path="settings" element={protectedPage(<SettingsPage />)} />
        <Route path="onboarding" element={protectedPage(<OnboardingPage />)} />
        <Route path="fitting-room" element={protectedPage(<FittingRoomPage />)} />
        <Route path="try-on" element={protectedPage(<TryOnPage />)} />
        <Route path="outfits" element={protectedPage(<OutfitsPage />)} />
        <Route path="profile" element={protectedPage(<ProfilePage />)} />
        <Route path="assistant" element={protectedPage(<AssistantPage />)} />
        <Route path="business" element={protectedPage(<BusinessDashboardPage />)} />
        <Route path="print" element={protectedPage(<PrintPackagesPage />)} />
        <Route path="print/:id" element={protectedPage(<PrintPackagePage />)} />
        <Route path="orders" element={protectedPage(<OrdersPage />)} />
        <Route path="orders/:id" element={protectedPage(<OrderDetailPage />)} />
        <Route path="notifications" element={protectedPage(<NotificationsPage />)} />
        <Route path="admin" element={protectedPage(<AdminPage />, true)} />

        <Route path="*" element={page(<NotFoundPage />)} />
      </Route>
    </Routes>
  )
}
