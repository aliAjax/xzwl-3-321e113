import { useState, useEffect } from 'react'
import {
  Truck,
  User,
  Package,
  Clock,
  CheckCircle,
  AlertTriangle,
  Thermometer,
  RefreshCw,
  Zap,
} from 'lucide-react'
import { api } from '@/utils/api'
import {
  formatDateTime,
  formatOrderStatus,
  formatTemperatureZone,
} from '@/utils/format'
import type {
  Order,
  Vehicle,
  Driver,
  Route,
  DispatchMatchResult,
  DispatchRequest,
} from '@shared/types'
import clsx from 'clsx'

function Dispatch() {
  const [orders, setOrders] = useState<Order[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [selectedOrders, setSelectedOrders] = useState<string[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<string>('')
  const [selectedDriver, setSelectedDriver] = useState<string>('')
  const [selectedRoute, setSelectedRoute] = useState<string>('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [matchResults, setMatchResults] = useState<DispatchMatchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [matching, setMatching] = useState(false)
  const [showConflict, setShowConflict] = useState(false)
  const [conflictInfo, setConflictInfo] = useState<string[]>([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [ordersData, vehiclesData, driversData, routesData] = await Promise.all([
        api.get<Order[]>('/orders?status=created'),
        api.get<Vehicle[]>('/vehicles?status=active'),
        api.get<Driver[]>('/drivers?status=on_duty'),
        api.get<Route[]>('/routes'),
      ])
      setOrders(ordersData)
      setVehicles(vehiclesData)
      setDrivers(driversData)
      setRoutes(routesData)
    } catch (error) {
      console.error('Failed to load dispatch data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleMatch() {
    if (selectedOrders.length === 0) {
      alert('请选择要调度的订单')
      return
    }

    setMatching(true)
    try {
      const results = await api.post<DispatchMatchResult[]>('/dispatch/match', {
        orderIds: selectedOrders,
      })
      setMatchResults(results)
    } catch (error) {
      console.error('Match failed:', error)
    } finally {
      setMatching(false)
    }
  }

  function toggleOrderSelection(orderId: string) {
    setSelectedOrders((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    )
  }

  function selectMatchResult(result: DispatchMatchResult) {
    if (!result.temperatureMatch || !result.timeAvailable) {
      setConflictInfo(result.conflicts)
      setShowConflict(true)
      return
    }
    setSelectedVehicle(result.vehicleId)
    setSelectedDriver(result.driverId)
  }

  async function handleDispatch() {
    if (selectedOrders.length === 0 || !selectedVehicle || !selectedDriver || !selectedRoute || !scheduledTime) {
      alert('请完善调度信息')
      return
    }

    try {
      const request: DispatchRequest = {
        orderIds: selectedOrders,
        vehicleId: selectedVehicle,
        driverId: selectedDriver,
        routeId: selectedRoute,
        scheduledDepartureTime: scheduledTime,
      }
      await api.post('/dispatch', request)
      alert('调度成功')
      setSelectedOrders([])
      setSelectedVehicle('')
      setSelectedDriver('')
      setSelectedRoute('')
      setScheduledTime('')
      setMatchResults([])
      loadData()
    } catch (error) {
      console.error('Dispatch failed:', error)
      alert(error instanceof Error ? error.message : '调度失败')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">调度中心</h1>
        <button
          onClick={loadData}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw size={16} />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Package size={20} />
                待调度订单
              </h2>
              <span className="text-sm text-gray-500">
                已选择 {selectedOrders.length} / {orders.length}
              </span>
            </div>
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {orders.length > 0 ? (
                orders.map((order) => {
                  const isSelected = selectedOrders.includes(order.id)
                  const statusInfo = formatOrderStatus(order.status)
                  const tempZoneInfo = formatTemperatureZone(order.temperatureZone)
                  return (
                    <div
                      key={order.id}
                      onClick={() => toggleOrderSelection(order.id)}
                      className={clsx(
                        'p-4 rounded-lg border-2 cursor-pointer transition-all',
                        isSelected
                          ? 'border-[#2563eb] bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div
                            className={clsx(
                              'w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 flex-shrink-0',
                              isSelected
                                ? 'bg-[#2563eb] border-[#2563eb]'
                                : 'border-gray-300'
                            )}
                          >
                            {isSelected && <CheckCircle size={12} className="text-white" />}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">{order.orderNo}</p>
                            <p className="text-sm text-gray-600 mt-1">
                              {order.goodsName} · {order.quantity}件
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                              配送至：{order.deliveryAddress}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className={clsx('status-badge', tempZoneInfo.color)}>
                                <Thermometer size={12} className="mr-1" />
                                {tempZoneInfo.label}
                              </span>
                              <span className={clsx('status-badge', statusInfo.color)}>
                                {statusInfo.label}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500 flex items-center gap-1">
                            <Clock size={14} />
                            预计送达
                          </p>
                          <p className="text-sm font-medium text-gray-800">
                            {formatDateTime(order.scheduledDeliveryTime)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-12 text-gray-500">暂无待调度订单</div>
              )}
            </div>
          </div>

          {matchResults.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Zap size={20} className="text-yellow-500" />
                智能匹配结果
              </h2>
              <div className="space-y-3">
                {matchResults.map((result, index) => (
                  <div
                    key={index}
                    onClick={() => selectMatchResult(result)}
                    className={clsx(
                      'p-4 rounded-lg border-2 cursor-pointer transition-all',
                      selectedVehicle === result.vehicleId
                        ? 'border-[#2563eb] bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white',
                      (!result.temperatureMatch || !result.timeAvailable) &&
                        'opacity-60'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-800">
                          {result.plateNo} · {result.driverName}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span
                            className={clsx(
                              'status-badge',
                              result.temperatureMatch
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            )}
                          >
                            {result.temperatureMatch ? '温区匹配' : '温区不匹配'}
                          </span>
                          <span
                            className={clsx(
                              'status-badge',
                              result.timeAvailable
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            )}
                          >
                            {result.timeAvailable ? '时间可用' : '时间冲突'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">匹配度</p>
                        <p className="text-lg font-bold text-[#2563eb]">
                          {result.score}%
                        </p>
                      </div>
                    </div>
                    {result.conflicts.length > 0 && (
                      <div className="mt-3 p-2 bg-red-50 rounded-md">
                        {result.conflicts.map((conflict, i) => (
                          <p key={i} className="text-xs text-red-600 flex items-center gap-1">
                            <AlertTriangle size={12} />
                            {conflict}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">调度操作</h2>
            <div className="space-y-4">
              <button
                onClick={handleMatch}
                disabled={selectedOrders.length === 0 || matching}
                className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap size={18} />
                {matching ? '匹配中...' : '智能匹配'}
              </button>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  选择车辆
                </label>
                <select
                  value={selectedVehicle}
                  onChange={(e) => setSelectedVehicle(e.target.value)}
                  className="input-field"
                >
                  <option value="">请选择车辆</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plateNo} ({v.vehicleType})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  选择司机
                </label>
                <select
                  value={selectedDriver}
                  onChange={(e) => setSelectedDriver(e.target.value)}
                  className="input-field"
                >
                  <option value="">请选择司机</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  选择线路
                </label>
                <select
                  value={selectedRoute}
                  onChange={(e) => setSelectedRoute(e.target.value)}
                  className="input-field"
                >
                  <option value="">请选择线路</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  预计发车时间
                </label>
                <input
                  type="datetime-local"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="input-field"
                />
              </div>

              <button
                onClick={handleDispatch}
                disabled={
                  selectedOrders.length === 0 ||
                  !selectedVehicle ||
                  !selectedDriver ||
                  !selectedRoute ||
                  !scheduledTime
                }
                className="w-full btn-success disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认调度
              </button>
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Truck size={16} />
              可用车辆
            </h3>
            <div className="space-y-2">
              {vehicles.slice(0, 5).map((vehicle) => (
                <div
                  key={vehicle.id}
                  className="p-3 bg-gray-50 rounded-lg"
                >
                  <p className="font-medium text-gray-800 text-sm">
                    {vehicle.plateNo}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {vehicle.temperatureZones.map((zone) => {
                      const zoneInfo = formatTemperatureZone(zone)
                      return (
                        <span
                          key={zone}
                          className={clsx('status-badge text-xs', zoneInfo.color)}
                        >
                          {zoneInfo.label}
                        </span>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <User size={16} />
              在岗司机
            </h3>
            <div className="space-y-2">
              {drivers.slice(0, 5).map((driver) => (
                <div
                  key={driver.id}
                  className="p-3 bg-gray-50 rounded-lg"
                >
                  <p className="font-medium text-gray-800 text-sm">{driver.name}</p>
                  <p className="text-xs text-gray-500">{driver.phone}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showConflict && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">调度冲突</h3>
                <p className="text-sm text-gray-500">该车辆/司机存在以下冲突</p>
              </div>
            </div>
            <div className="space-y-2 mb-6">
              {conflictInfo.map((conflict, index) => (
                <div key={index} className="p-3 bg-red-50 rounded-md text-sm text-red-700">
                  {conflict}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowConflict(false)}
                className="btn-secondary"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dispatch
