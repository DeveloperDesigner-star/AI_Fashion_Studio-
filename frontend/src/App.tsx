import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { StudioHubPage } from '@/pages/StudioHubPage'
import { DesignsPage } from '@/pages/DesignsPage'
import { AvatarPage } from '@/pages/AvatarPage'
import { FavoritesPage } from '@/pages/FavoritesPage'
import { AccessoriesPage } from '@/pages/AccessoriesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { StudioPage } from '@/pages/StudioPage'
import { GarmentPage } from '@/pages/GarmentPage'
import { FittingRoomPage } from '@/pages/FittingRoomPage'
import { OutfitsPage } from '@/pages/OutfitsPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { AssistantPage } from '@/pages/AssistantPage'
import { MarketplacePage } from '@/pages/MarketplacePage'
import { OrdersPage } from '@/pages/OrdersPage'
import { OrderDetailPage } from '@/pages/OrderDetailPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { AdminPage } from '@/pages/AdminPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

const protectedPage = (element: React.ReactNode, requireAdmin = false) => (
  <ProtectedRoute requireAdmin={requireAdmin}>{element}</ProtectedRoute>
)

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="studio" element={<StudioHubPage />} />
        <Route path="studio/accessories" element={<AccessoriesPage />} />
        <Route path="studio/:gender" element={<StudioPage />} />
        <Route path="garment/:slug" element={<GarmentPage />} />
        <Route path="marketplace" element={<MarketplacePage />} />

        <Route path="dashboard" element={protectedPage(<DashboardPage />)} />
        <Route path="designs" element={protectedPage(<DesignsPage />)} />
        <Route path="avatar" element={protectedPage(<AvatarPage />)} />
        <Route path="favorites" element={protectedPage(<FavoritesPage />)} />
        <Route path="settings" element={protectedPage(<SettingsPage />)} />
        <Route path="onboarding" element={protectedPage(<OnboardingPage />)} />
        <Route path="fitting-room" element={protectedPage(<FittingRoomPage />)} />
        <Route path="outfits" element={protectedPage(<OutfitsPage />)} />
        <Route path="profile" element={protectedPage(<ProfilePage />)} />
        <Route path="assistant" element={protectedPage(<AssistantPage />)} />
        <Route path="orders" element={protectedPage(<OrdersPage />)} />
        <Route path="orders/:id" element={protectedPage(<OrderDetailPage />)} />
        <Route path="notifications" element={protectedPage(<NotificationsPage />)} />
        <Route path="admin" element={protectedPage(<AdminPage />, true)} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
