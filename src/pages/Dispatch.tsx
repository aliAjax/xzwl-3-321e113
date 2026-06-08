import { useState, useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
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
  Eye,
  XCircle,
  Lightbulb,
  Scale,
  MapPin,
  ChevronRight,
  ArrowRight,
  Layers,
} from 'lucide-react'
import { api } from '@/utils/api'
import {
  formatDateTime,
  formatOrderStatus,
  formatTemperatureZone,
  formatDurationMinutes,
} from '@/utils/format'
import type {
  Order,
  Vehicle,
  Driver,
  Route,
  DispatchMatchResult,
  DispatchRequest,
  DispatchPreviewResult,
  DispatchPreviewConflict,
  DispatchPreviewSuggestion,
  TemperatureZone,
} from '@shared/types'
import clsx from 'clsx'

function Dispatch() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
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
  const [previewing, setPreviewing] = useState(false)
  const [showConflict, setShowConflict] = useState(false)
  const [conflictInfo, setConflictInfo] = useState<string[]>([])
  const [previewResult, setPreviewResult] = useState<DispatchPreviewResult | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [fromSandbox, setFromSandbox] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (loading || orders.length === 0 || vehicles.length === 0 || drivers.length === 0 || routes.length === 0) {
      return
    }

    const orderIdsParam = searchParams.get('orderIds')
    const vehicleIdParam = searchParams.get('vehicleId')
    const driverIdParam = searchParams.get('driverId')
    const routeIdParam = searchParams.get('routeId')
    const scheduledTimeParam = searchParams.get('scheduledDepartureTime')
    const fromSandboxParam = searchParams.get('fromSandbox')

    if (fromSandboxParam === 'true') {
      setFromSandbox(true)

      if (orderIdsParam) {
        const orderIds = orderIdsParam.split(',')
        const validOrderIds = orderIds.filter(id => orders.some(o => o.id === id))
        if (validOrderIds.length > 0) {
          setSelectedOrders(validOrderIds)
        }
      }

      if (vehicleIdParam && vehicles.some(v => v.id === vehicleIdParam)) {
        setSelectedVehicle(vehicleIdParam)
      }

      if (driverIdParam && drivers.some(d => d.id === driverIdParam)) {
        setSelectedDriver(driverIdParam)
      }

      if (routeIdParam && routes.some(r => r.id === routeIdParam)) {
        setSelectedRoute(routeIdParam)
      }

      if (scheduledTimeParam) {
        setScheduledTime(scheduledTimeParam)
      }
    }
  }, [loading, orders, vehicles, drivers, routes, searchParams])

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
      const results = await api.post<DispatchMatchResult[]>('/dispatch/matches', {
        orderIds: selectedOrders,
        scheduledTime: scheduledTime || new Date().toISOString(),
      })
      setMatchResults(results)
    } catch (error) {
      console.error('Match failed:', error)
    } finally {
      setMatching(false)
    }
  }

  async function handlePreview() {
    if (selectedOrders.length === 0 || !selectedVehicle || !selectedDriver || !selectedRoute || !scheduledTime) {
      alert('请完善调度信息')
      return
    }

    setPreviewing(true)
    setPreviewResult(null)
    try {
      const result = await api.post<DispatchPreviewResult>('/dispatch/preview', {
        orderIds: selectedOrders,
        vehicleId: selectedVehicle,
        driverId: selectedDriver,
        routeId: selectedRoute,
        scheduledDepartureTime: scheduledTime,
      })
      setPreviewResult(result)
      setShowPreview(true)
    } catch (error) {
      console.error('Preview failed:', error)
      alert(error instanceof Error ? error.message : '预演失败')
    } finally {
      setPreviewing(false)
    }
  }

  function toggleOrderSelection(orderId: string) {
    setSelectedOrders((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    )
    setPreviewResult(null)
    setShowPreview(false)
  }

  function selectMatchResult(result: DispatchMatchResult) {
    if (!result.temperatureMatch || !result.timeAvailable) {
      setConflictInfo(result.conflicts)
      setShowConflict(true)
      return
    }
    setSelectedVehicle(result.vehicleId)
    setSelectedDriver(result.driverId)
    setPreviewResult(null)
    setShowPreview(false)
  }

  function applySuggestion(suggestion: DispatchPreviewSuggestion) {
    if (suggestion.type === 'alternative_vehicle' && suggestion.details?.vehicleIds) {
      const vehicleIds = suggestion.details.vehicleIds as string[]
      if (vehicleIds.length > 0) {
        setSelectedVehicle(vehicleIds[0])
      }
    } else if (suggestion.type === 'alternative_driver' && suggestion.details?.driverIds) {
      const driverIds = suggestion.details.driverIds as string[]
      if (driverIds.length > 0) {
        setSelectedDriver(driverIds[0])
      }
    } else if (suggestion.type === 'alternative_driver' && suggestion.details?.driverId) {
      setSelectedDriver(suggestion.details.driverId as string)
    }
    setShowPreview(false)
    setPreviewResult(null)
  }

  async function handleDispatch() {
    if (!previewResult) {
      alert('请先进行调度预演')
      return
    }

    if (!previewResult.canDispatch) {
      const confirmDispatch = confirm('存在调度冲突，确定要继续创建吗？')
      if (!confirmDispatch) return
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
      resetForm()
      loadData()
    } catch (error) {
      console.error('Dispatch failed:', error)
      alert(error instanceof Error ? error.message : '调度失败')
    }
  }

  function resetForm() {
    setSelectedOrders([])
    setSelectedVehicle('')
    setSelectedDriver('')
    setSelectedRoute('')
    setScheduledTime('')
    setMatchResults([])
    setPreviewResult(null)
    setShowPreview(false)
    setFromSandbox(false)
  }

  function getConflictIcon(type: DispatchPreviewConflict['type']) {
    switch (type) {
      case 'vehicle': return <Truck size={14} />
      case 'driver': return <User size={14} />
      case 'order': return <Package size={14} />
      case 'temperature': return <Thermometer size={14} />
      case 'capacity': return <Scale size={14} />
      case 'time': return <Clock size={14} />
      case 'route': return <MapPin size={14} />
      default: return <AlertTriangle size={14} />
    }
  }

  function getSuggestionIcon(type: DispatchPreviewSuggestion['type']) {
    switch (type) {
      case 'alternative_vehicle': return <Truck size={16} />
      case 'alternative_driver': return <User size={16} />
      case 'split_batch': return <Package size={16} />
      case 'adjust_time': return <Clock size={16} />
      case 'change_route': return <MapPin size={16} />
      default: return <Lightbulb size={16} />
    }
  }

  function getTemperatureZoneColor(zone: TemperatureZone) {
    switch (zone) {
      case 'frozen': return 'bg-blue-500'
      case 'chilled': return 'bg-cyan-500'
      case 'ambient': return 'bg-orange-500'
      default: return 'bg-gray-500'
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {fromSandbox && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Layers size={20} className="text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-purple-800">已从调度沙盘带入方案</p>
                <p className="text-sm text-purple-600">系统已自动填充车辆、司机、线路和时间信息，请确认后执行调度</p>
              </div>
            </div>
            <button
              onClick={() => setFromSandbox(false)}
              className="text-sm text-purple-600 hover:text-purple-800"
            >
              知道了
            </button>
          </div>
        )}
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
                              {order.goodsName} · {order.quantity}件 · {order.weight}kg
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
                  onChange={(e) => {
                    setSelectedVehicle(e.target.value)
                    setPreviewResult(null)
                    setShowPreview(false)
                  }}
                  className="input-field"
                >
                  <option value="">请选择车辆</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plateNo} ({v.vehicleType}, {v.capacity}kg)
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
                  onChange={(e) => {
                    setSelectedDriver(e.target.value)
                    setPreviewResult(null)
                    setShowPreview(false)
                  }}
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
                  onChange={(e) => {
                    setSelectedRoute(e.target.value)
                    setPreviewResult(null)
                    setShowPreview(false)
                  }}
                  className="input-field"
                >
                  <option value="">请选择线路</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.stops.length}站)
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
                  onChange={(e) => {
                    setScheduledTime(e.target.value)
                    setPreviewResult(null)
                    setShowPreview(false)
                  }}
                  className="input-field"
                />
              </div>

              <button
                onClick={handlePreview}
                disabled={
                  selectedOrders.length === 0 ||
                  !selectedVehicle ||
                  !selectedDriver ||
                  !selectedRoute ||
                  !scheduledTime ||
                  previewing
                }
                className="w-full btn-secondary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Eye size={18} />
                {previewing ? '预演中...' : '调度预演'}
              </button>

              {previewResult && (
                <button
                  onClick={handleDispatch}
                  disabled={!previewResult}
                  className={clsx(
                    'w-full flex items-center justify-center gap-2',
                    previewResult.canDispatch
                      ? 'btn-success'
                      : 'btn-warning'
                  )}
                >
                  {previewResult.canDispatch ? (
                    <><CheckCircle size={18} /> 确认调度</>
                  ) : (
                    <><AlertTriangle size={18} /> 强制调度</>
                  )}
                </button>
              )}
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

      {showPreview && previewResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'w-12 h-12 rounded-full flex items-center justify-center',
                    previewResult.canDispatch ? 'bg-green-100' : 'bg-red-100'
                  )}>
                    {previewResult.canDispatch ? (
                      <CheckCircle size={24} className="text-green-500" />
                    ) : (
                      <XCircle size={24} className="text-red-500" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">
                      调度预演结果
                    </h3>
                    <p className={clsx(
                      'text-sm',
                      previewResult.canDispatch ? 'text-green-600' : 'text-red-600'
                    )}>
                      {previewResult.canDispatch
                        ? '可以正常调度'
                        : '存在调度冲突，请检查后重试或强制调度'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle size={24} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-600 mb-1">总重量</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {previewResult.totalWeight}
                    <span className="text-sm font-normal ml-1">kg</span>
                  </p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-sm text-purple-600 mb-1">总件数</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {previewResult.totalQuantity}
                    <span className="text-sm font-normal ml-1">件</span>
                  </p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <p className="text-sm text-orange-600 mb-1">预计耗时</p>
                  <p className="text-2xl font-bold text-orange-700">
                    {formatDurationMinutes(previewResult.estimatedDurationMinutes)}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-green-600 mb-1">车辆容量</p>
                  <p className="text-2xl font-bold text-green-700">
                    {previewResult.vehicleCapacityPercent}
                    <span className="text-sm font-normal ml-1">%</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Thermometer size={16} />
                    涉及温区
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {previewResult.temperatureZones.map((zone) => {
                      const info = formatTemperatureZone(zone)
                      return (
                        <span
                          key={zone}
                          className={clsx('status-badge', info.color)}
                        >
                          {info.label}
                        </span>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Truck size={16} />
                    车辆信息
                  </h4>
                  {previewResult.vehicle ? (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="font-medium text-gray-800">
                        {previewResult.vehicle.plateNo} ({previewResult.vehicle.vehicleType})
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        载重：{previewResult.vehicle.capacity}kg · 可用：{previewResult.vehicle.availableStartTime}-{previewResult.vehicle.availableEndTime}
                      </p>
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>容量使用</span>
                          <span>{previewResult.vehicleCapacityUsed}kg / {previewResult.vehicle.capacity}kg</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={clsx(
                              'h-2 rounded-full transition-all',
                              previewResult.vehicleCapacityPercent > 100
                                ? 'bg-red-500'
                                : previewResult.vehicleCapacityPercent > 90
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                            )}
                            style={{ width: `${Math.min(previewResult.vehicleCapacityPercent, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500">未选择车辆</p>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <User size={16} />
                    司机信息
                  </h4>
                  {previewResult.driver ? (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="font-medium text-gray-800">
                        {previewResult.driver.name}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {previewResult.driver.phone} · 状态：{previewResult.driver.status}
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-500">未选择司机</p>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <MapPin size={16} />
                    线路信息
                  </h4>
                  {previewResult.route ? (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="font-medium text-gray-800">
                        {previewResult.route.name}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        共 {previewResult.route.stopCount} 个站点
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-500">未选择线路</p>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Clock size={16} />
                    时间信息
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 w-20">发车时间</span>
                      <ArrowRight size={14} className="text-gray-400" />
                      <span className="text-sm font-medium text-gray-800">
                        {formatDateTime(previewResult.scheduledDepartureTime)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 w-20">预计到达</span>
                      <ArrowRight size={14} className="text-gray-400" />
                      <span className="text-sm font-medium text-gray-800">
                        {formatDateTime(previewResult.estimatedArrivalTime)}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Package size={16} />
                    涉及订单 ({previewResult.orders.length})
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto space-y-1">
                    {previewResult.orders.map((order) => (
                      <div key={order.id} className="flex items-center gap-2 text-sm">
                        <div className={clsx(
                          'w-2 h-2 rounded-full flex-shrink-0',
                          getTemperatureZoneColor(order.temperatureZone)
                        )} />
                        <span className="font-medium text-gray-800">{order.orderNo}</span>
                        <span className="text-gray-500">·</span>
                        <span className="text-gray-600 truncate">{order.goodsName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {previewResult.conflicts.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-500" />
                    冲突信息
                  </h4>
                  <div className="space-y-2">
                    {previewResult.conflicts.map((conflict, index) => (
                      <div
                        key={index}
                        className={clsx(
                          'p-3 rounded-lg flex items-start gap-3',
                          conflict.severity === 'error'
                            ? 'bg-red-50 border border-red-200'
                            : 'bg-yellow-50 border border-yellow-200'
                        )}
                      >
                        <div className={clsx(
                          'mt-0.5',
                          conflict.severity === 'error' ? 'text-red-500' : 'text-yellow-600'
                        )}>
                          {conflict.severity === 'error' ? <XCircle size={16} /> : <AlertTriangle size={16} />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {getConflictIcon(conflict.type)}
                            <span className={clsx(
                              'text-xs font-medium uppercase',
                              conflict.severity === 'error' ? 'text-red-600' : 'text-yellow-600'
                            )}>
                              {conflict.type}
                            </span>
                          </div>
                          <p className={clsx(
                            'text-sm mt-1',
                            conflict.severity === 'error' ? 'text-red-700' : 'text-yellow-700'
                          )}>
                            {conflict.message}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {previewResult.warnings.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-yellow-500" />
                    注意事项
                  </h4>
                  <div className="space-y-2">
                    {previewResult.warnings.map((warning, index) => (
                      <div
                        key={index}
                        className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700 flex items-start gap-2"
                      >
                        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                        {warning}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {previewResult.suggestions.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Lightbulb size={16} className="text-blue-500" />
                    优化建议
                  </h4>
                  <div className="space-y-2">
                    {previewResult.suggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-blue-500">
                            {getSuggestionIcon(suggestion.type)}
                          </div>
                          <div>
                            <p className="text-sm text-blue-700">
                              {suggestion.message}
                            </p>
                          </div>
                        </div>
                        {(suggestion.type === 'alternative_vehicle' || suggestion.type === 'alternative_driver') && (
                          <button
                            onClick={() => applySuggestion(suggestion)}
                            className="btn-primary text-xs py-1 px-3 flex items-center gap-1"
                          >
                            应用
                            <ChevronRight size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  * 预演仅用于验证调度可行性，不会实际创建批次或修改订单状态
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowPreview(false)}
                    className="btn-secondary"
                  >
                    返回修改
                  </button>
                  <button
                    onClick={handleDispatch}
                    className={clsx(
                      'flex items-center gap-2',
                      previewResult.canDispatch ? 'btn-success' : 'btn-warning'
                    )}
                  >
                    {previewResult.canDispatch ? (
                      <><CheckCircle size={16} /> 确认调度</>
                    ) : (
                      <><AlertTriangle size={16} /> 强制调度</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
