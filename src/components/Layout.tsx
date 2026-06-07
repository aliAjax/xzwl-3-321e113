import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  Truck,
  Users,
  Building2,
  Route as RouteIcon,
  ClipboardList,
  MapPin,
  Warehouse,
  Menu,
  X,
  User,
  LogOut,
  ChevronDown,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { formatUserRole } from '@/utils/format'
import clsx from 'clsx'

const menuItems = [
  { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { path: '/orders', label: '订单管理', icon: Package },
  { path: '/dispatch', label: '调度中心', icon: ClipboardList },
  { path: '/loading', label: '装车管理', icon: Warehouse },
  { path: '/delivery', label: '配送执行', icon: MapPin },
  { path: '/vehicles', label: '车辆管理', icon: Truck },
  { path: '/drivers', label: '司机管理', icon: Users },
  { path: '/customers', label: '客户管理', icon: Building2 },
  { path: '/routes', label: '线路管理', icon: RouteIcon },
]

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const roleInfo = user ? formatUserRole(user.role) : null

  return (
    <div className="flex h-screen bg-gray-100">
      <aside
        className={clsx(
          'bg-[#1e3a5f] text-white transition-all duration-300 flex flex-col',
          sidebarOpen ? 'w-64' : 'w-20'
        )}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#2d4a6f]">
          {sidebarOpen && (
            <h1 className="text-lg font-bold">冷链配送管理平台</h1>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-[#2d4a6f] rounded-md transition-colors"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-3">
            {menuItems.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors',
                        isActive
                          ? 'bg-[#2563eb] text-white'
                          : 'text-gray-300 hover:bg-[#2d4a6f] hover:text-white',
                        !sidebarOpen && 'justify-center'
                      )
                    }
                  >
                    <Icon size={20} />
                    {sidebarOpen && <span>{item.label}</span>}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-800">
              {menuItems.find((m) => window.location.pathname.startsWith(m.path))?.label ||
                '冷链配送管理平台'}
            </h2>
          </div>

          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
            >
              <div className="w-8 h-8 bg-[#1e3a5f] rounded-full flex items-center justify-center">
                <User size={16} className="text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-800">{user?.name}</p>
                {roleInfo && (
                  <span className={clsx('status-badge', roleInfo.color)}>
                    {roleInfo.label}
                  </span>
                )}
              </div>
              <ChevronDown size={16} className="text-gray-500" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-800">{user?.name}</p>
                  <p className="text-xs text-gray-500">{user?.username}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <LogOut size={16} />
                  退出登录
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
