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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="temperature-zone" element={<TemperatureZoneDashboard />} />
        <Route path="orders" element={<OrderList />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="warehouse" element={<WarehouseIn />} />
        <Route path="dispatch" element={<Dispatch />} />
        <Route path="delivery" element={<Delivery />} />
        <Route path="loading" element={<Loading />} />
        <Route path="vehicles" element={<VehicleManagement />} />
        <Route path="drivers" element={<DriverManagement />} />
        <Route path="customers" element={<CustomerManagement />} />
        <Route path="routes" element={<RouteManagement />} />
        <Route path="exceptions" element={<ExceptionHandling />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
