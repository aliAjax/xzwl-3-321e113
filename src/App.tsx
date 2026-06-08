import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import TemperatureZoneDashboard from '@/pages/TemperatureZoneDashboard'
import OrderList from '@/pages/OrderList'
import OrderDetail from '@/pages/OrderDetail'
import Dispatch from '@/pages/Dispatch'
import Delivery from '@/pages/Delivery'
import Loading from '@/pages/Loading'
import WarehouseIn from '@/pages/WarehouseIn'
import VehicleManagement from '@/pages/VehicleManagement'
import DriverManagement from '@/pages/DriverManagement'
import CustomerManagement from '@/pages/CustomerManagement'
import RouteManagement from '@/pages/RouteManagement'
import ExceptionHandling from '@/pages/ExceptionHandling'
import TemperatureRecordImport from '@/pages/TemperatureRecordImport'
import BatchOrderCreate from '@/pages/BatchOrderCreate'
import DriverMobile from '@/pages/DriverMobile'
import type { UserRole } from '@shared/types'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function DriverRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.role !== 'driver') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function RoleRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode
  allowedRoles: UserRole[]
}) {
  const user = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!user || !allowedRoles.includes(user.role)) {
    if (user?.role === 'driver') {
      return <Navigate to="/driver-mobile" replace />
    }
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/driver-mobile"
        element={
          <DriverRoute>
            <DriverMobile />
          </DriverRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route
          path="dashboard"
          element={
            <RoleRoute allowedRoles={['admin', 'dispatcher']}>
              <Dashboard />
            </RoleRoute>
          }
        />
        <Route
          path="temperature-zone"
          element={
            <RoleRoute allowedRoles={['admin', 'dispatcher']}>
              <TemperatureZoneDashboard />
            </RoleRoute>
          }
        />
        <Route
          path="temperature-import"
          element={
            <RoleRoute allowedRoles={['admin', 'dispatcher']}>
              <TemperatureRecordImport />
            </RoleRoute>
          }
        />
        <Route
          path="orders"
          element={
            <RoleRoute allowedRoles={['admin', 'dispatcher']}>
              <OrderList />
            </RoleRoute>
          }
        />
        <Route
          path="orders/batch"
          element={
            <RoleRoute allowedRoles={['admin', 'dispatcher']}>
              <BatchOrderCreate />
            </RoleRoute>
          }
        />
        <Route
          path="orders/:id"
          element={
            <RoleRoute allowedRoles={['admin', 'dispatcher']}>
              <OrderDetail />
            </RoleRoute>
          }
        />
        <Route
          path="warehouse"
          element={
            <RoleRoute allowedRoles={['admin', 'dispatcher']}>
              <WarehouseIn />
            </RoleRoute>
          }
        />
        <Route
          path="dispatch"
          element={
            <RoleRoute allowedRoles={['admin', 'dispatcher']}>
              <Dispatch />
            </RoleRoute>
          }
        />
        <Route
          path="delivery"
          element={
            <RoleRoute allowedRoles={['admin', 'dispatcher']}>
              <Delivery />
            </RoleRoute>
          }
        />
        <Route
          path="loading"
          element={
            <RoleRoute allowedRoles={['admin', 'dispatcher']}>
              <Loading />
            </RoleRoute>
          }
        />
        <Route
          path="vehicles"
          element={
            <RoleRoute allowedRoles={['admin', 'dispatcher']}>
              <VehicleManagement />
            </RoleRoute>
          }
        />
        <Route
          path="drivers"
          element={
            <RoleRoute allowedRoles={['admin', 'dispatcher']}>
              <DriverManagement />
            </RoleRoute>
          }
        />
        <Route
          path="customers"
          element={
            <RoleRoute allowedRoles={['admin', 'dispatcher']}>
              <CustomerManagement />
            </RoleRoute>
          }
        />
        <Route
          path="routes"
          element={
            <RoleRoute allowedRoles={['admin', 'dispatcher']}>
              <RouteManagement />
            </RoleRoute>
          }
        />
        <Route
          path="exceptions"
          element={
            <RoleRoute allowedRoles={['admin', 'dispatcher']}>
              <ExceptionHandling />
            </RoleRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
