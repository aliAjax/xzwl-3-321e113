import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package,
  Truck,
  User,
  Thermometer,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Play,
  Eye,
  ArrowRight,
  ChevronRight,
  MapPin,
  Scale,
  Lightbulb,
  Layers,
  Zap,
  Filter,
} from 'lucide-react'
import { api } from '@/utils/api'
import {
  formatDateTime,
  formatDateOnly,
  formatOrderStatus,
  formatTemperatureZone,
  formatDurationMinutes,
} from '@/utils/format'
import type {
  Order,
  DispatchSandboxResult,
  DispatchSandboxPlan,
  DispatchSandboxPlanDetail,
  DispatchSandboxFilteredOrder,
  DispatchPreviewConflict,
  DispatchPreviewSuggestion,
  TemperatureZone,
  RouteStop,
  Customer,
  OrderStatus,
} from '@shared/types'
import clsx from 'clsx'

function DispatchSandbox() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedOrders, setSelectedOrders] = useState<string[]>([])
  const [scheduledTime, setScheduledTime] = useState('')
  const [maxPlans, setMaxPlans] = useState(10)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [sandboxResult, setSandboxResult] = useState<DispatchSandboxResult | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<DispatchSandboxPlan | null>(null)
  const [planDetail, setPlanDetail] = useState<DispatchSandboxPlanDetail | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [filteredOrders, setFilteredOrders] = useState<DispatchSandboxFilteredOrder[]>([])
  const [showFilteredOrders, setShowFilteredOrders] = useState(false)
  const [filterCustomerId, setFilterCustomerId] = useState<string>('')
  const [filterTemperatureZone, setFilterTemperatureZone] = useState<TemperatureZone | ''>('')
  const [filterStatus, setFilterStatus] = useState<OrderStatus | ''>('')
  const [filterDeliveryDate, setFilterDeliveryDate] = useState<string>('')

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (hasActiveFilters) {
      setSandboxResult(null)
      setPlanDetail(null)
      setShowDetail(false)
    }
  }, [filterCustomerId, filterTemperatureZone, filterStatus, filterDeliveryDate])

  async function loadData() {
    try {
      const [ordersResponse, customersResponse] = await Promise.all([
        api.get<{ total: number; orders: Order[] }>('/dispatch/orders/dispatchable'),
        api.get<Customer[]>('/customers'),
      ])
      setOrders(ordersResponse.orders)
      setCustomers(customersResponse)
    } catch (error) {
      console.error('Failed to load sandbox data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleGeneratePlans() {
    if (effectiveSelectedOrderIds.length === 0) {
      alert(hasActiveFilters ? '请在筛选结果中选择要模拟的订单' : '请选择要模拟的订单')
      return
    }

    setGenerating(true)
    setSandboxResult(null)
    setFilteredOrders([])
    setShowFilteredOrders(false)
    try {
      const result = await api.post<DispatchSandboxResult>('/dispatch/sandbox/generate', {
        orderIds: effectiveSelectedOrderIds,
        scheduledDepartureTime: scheduledTime || new Date().toISOString(),
        maxPlans,
      })
      setSandboxResult(result)
      setFilteredOrders(result.filteredOrders)
      if (result.filteredOrders.length > 0) {
        setShowFilteredOrders(true)
      }
    } catch (error) {
      console.error('Generate plans failed:', error)
      alert(error instanceof Error ? error.message : '生成方案失败')
    } finally {
      setGenerating(false)
    }
  }

  async function handleViewDetail(plan: DispatchSandboxPlan) {
    setSelectedPlan(plan)
    setLoadingDetail(true)
    setShowDetail(true)
    try {
      const dispatchableSelectedOrders = orders
        .filter(o => effectiveSelectedOrderIds.includes(o.id) && ['created', 'warehoused'].includes(o.status))
        .map(o => o.id)

      const detail = await api.post<DispatchSandboxPlanDetail>('/dispatch/sandbox/detail', {
        orderIds: dispatchableSelectedOrders,
        vehicleId: plan.vehicleId,
        driverId: plan.driverId,
        routeId: plan.routeId,
        scheduledDepartureTime: plan.scheduledDepartureTime,
        planId: plan.planId,
        planName: plan.planName,
      })
      setPlanDetail(detail)
    } catch (error) {
      console.error('Get plan detail failed:', error)
      alert(error instanceof Error ? error.message : '获取方案详情失败')
    } finally {
      setLoadingDetail(false)
    }
  }

  function handleApplyToDispatch(plan: DispatchSandboxPlan) {
    const dispatchableSelectedOrders = orders
      .filter(o => effectiveSelectedOrderIds.includes(o.id) && ['created', 'warehoused'].includes(o.status))
      .map(o => o.id)

    if (dispatchableSelectedOrders.length === 0) {
      alert('没有可调度的订单，无法带入正式调度')
      return
    }

    const params = new URLSearchParams({
      orderIds: dispatchableSelectedOrders.join(','),
      vehicleId: plan.vehicleId,
      driverId: plan.driverId,
      routeId: plan.routeId,
      scheduledDepartureTime: plan.scheduledDepartureTime,
      fromSandbox: 'true',
    })
    navigate(`/dispatch?${params.toString()}`)
  }

  const filteredOrdersList = orders.filter((order) => {
    if (filterCustomerId && order.customerId !== filterCustomerId) {
      return false
    }
    if (filterTemperatureZone && order.temperatureZone !== filterTemperatureZone) {
      return false
    }
    if (filterStatus && order.status !== filterStatus) {
      return false
    }
    if (filterDeliveryDate) {
      const orderDate = formatDateOnly(order.scheduledDeliveryTime)
      if (orderDate !== filterDeliveryDate) {
        return false
      }
    }
    return true
  })

  const hasActiveFilters = filterCustomerId || filterTemperatureZone || filterStatus || filterDeliveryDate

  const selectedOrdersInFilter = filteredOrdersList.filter((o) => selectedOrders.includes(o.id))

  const selectedOrdersInFilterIds = selectedOrdersInFilter.map((o) => o.id)

  const selectedOrdersData = orders.filter((o) => selectedOrders.includes(o.id))

  const effectiveSelectedOrders = hasActiveFilters ? selectedOrdersInFilter : selectedOrdersData

  const effectiveSelectedOrderIds = hasActiveFilters ? selectedOrdersInFilterIds : selectedOrders

  const selectedOrdersSummary = {
    totalOrders: effectiveSelectedOrders.length,
    dispatchableOrders: effectiveSelectedOrders.filter((o) => ['created', 'warehoused'].includes(o.status)).length,
    totalWeight: effectiveSelectedOrders.reduce((sum, o) => sum + o.weight, 0),
    totalQuantity: effectiveSelectedOrders.reduce((sum, o) => sum + o.quantity, 0),
    requiredTemperatureZones: Array.from(new Set(effectiveSelectedOrders.map((o) => o.temperatureZone))),
  }

  function clearFilters() {
    setFilterCustomerId('')
    setFilterTemperatureZone('')
    setFilterStatus('')
    setFilterDeliveryDate('')
  }

  function toggleOrderSelection(orderId: string) {
    setSelectedOrders((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    )
    setSandboxResult(null)
    setPlanDetail(null)
    setShowDetail(false)
  }

  function toggleSelectAll() {
    const allFilteredSelected = selectedOrdersInFilter.length === filteredOrdersList.length
    if (allFilteredSelected) {
      setSelectedOrders((prev) => prev.filter((id) => !filteredOrdersList.some((o) => o.id === id)))
    } else {
      const filteredOrderIds = filteredOrdersList.map((o) => o.id)
      setSelectedOrders((prev) => Array.from(new Set([...prev, ...filteredOrderIds])))
    }
    setSandboxResult(null)
  }

  function getTemperatureZoneColor(zone: TemperatureZone) {
    switch (zone) {
      case 'frozen':
        return 'bg-blue-500'
      case 'chilled':
        return 'bg-cyan-500'
      case 'ambient':
        return 'bg-orange-500'
      default:
        return 'bg-gray-500'
    }
  }

  function getConflictIcon(type: DispatchPreviewConflict['type']) {
    switch (type) {
      case 'vehicle':
        return <Truck size={14} />
      case 'driver':
        return <User size={14} />
      case 'order':
        return <Package size={14} />
      case 'temperature':
        return <Thermometer size={14} />
      case 'capacity':
        return <Scale size={14} />
      case 'time':
        return <Clock size={14} />
      case 'route':
        return <MapPin size={14} />
      default:
        return <AlertTriangle size={14} />
    }
  }

  function getSuggestionIcon(type: DispatchPreviewSuggestion['type']) {
    switch (type) {
      case 'alternative_vehicle':
        return <Truck size={16} />
      case 'alternative_driver':
        return <User size={16} />
      case 'split_batch':
        return <Package size={16} />
      case 'adjust_time':
        return <Clock size={16} />
      case 'change_route':
        return <MapPin size={16} />
      default:
        return <Lightbulb size={16} />
    }
  }

  function getCapacityColor(percent: number) {
    if (percent > 100) return 'text-red-600'
    if (percent > 90) return 'text-yellow-600'
    return 'text-green-600'
  }

  function getCapacityBgColor(percent: number) {
    if (percent > 100) return 'bg-red-500'
    if (percent > 90) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">加载中...</div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">调度沙盘</h1>
          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
            模拟调度 · 不产生实际数据
          </span>
        </div>
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
                待模拟订单
              </h2>
              <div className="flex items-center gap-4">
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1">
                  <CheckCircle size={12} />
                  仅显示可调度订单
                </span>
                <button
                  onClick={toggleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  {selectedOrdersInFilter.length === filteredOrdersList.length && filteredOrdersList.length > 0
                    ? '取消全选'
                    : '全选'}
                </button>
                <span className="text-sm text-gray-500">
                  已选择 {selectedOrdersInFilter.length} / {filteredOrdersList.length}
                  {hasActiveFilters && (
                    <span className="ml-1 text-blue-600">(筛选中)</span>
                  )}
                </span>
              </div>
            </div>

            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Filter size={14} className="text-gray-500" />
                <span className="text-xs font-medium text-gray-600">筛选条件</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">客户</label>
                  <select
                    value={filterCustomerId}
                    onChange={(e) => setFilterCustomerId(e.target.value)}
                    className="input-field text-sm py-1.5"
                  >
                    <option value="">全部客户</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">温区</label>
                  <select
                    value={filterTemperatureZone}
                    onChange={(e) => setFilterTemperatureZone(e.target.value as TemperatureZone | '')}
                    className="input-field text-sm py-1.5"
                  >
                    <option value="">全部温区</option>
                    <option value="frozen">冷冻</option>
                    <option value="chilled">冷藏</option>
                    <option value="ambient">常温</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">订单状态</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as OrderStatus | '')}
                    className="input-field text-sm py-1.5"
                  >
                    <option value="">全部状态</option>
                    <option value="created">已创建</option>
                    <option value="warehoused">已入仓</option>
                    <option value="loading">装车中</option>
                    <option value="in_transit">运输中</option>
                    <option value="delivered">已送达</option>
                    <option value="completed">已完成</option>
                    <option value="cancelled">已取消</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">计划送达日期</label>
                  <input
                    type="date"
                    value={filterDeliveryDate}
                    onChange={(e) => setFilterDeliveryDate(e.target.value)}
                    className="input-field text-sm py-1.5"
                  />
                </div>
              </div>
              {hasActiveFilters && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      筛选结果：{filteredOrdersList.length} 个订单
                    </span>
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      概览和生成方案仅基于筛选结果
                    </span>
                  </div>
                  <button
                    onClick={clearFilters}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <XCircle size={12} />
                    清空筛选
                  </button>
                </div>
              )}
            </div>

            {showFilteredOrders && filteredOrders.length > 0 && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-yellow-600" />
                    <span className="font-medium text-yellow-800">
                      以下 {filteredOrders.length} 个订单因状态不正确已被过滤
                    </span>
                  </div>
                  <button
                    onClick={() => setShowFilteredOrders(false)}
                    className="text-yellow-600 hover:text-yellow-800"
                  >
                    <XCircle size={16} />
                  </button>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {filteredOrders.map((fo) => (
                    <div
                      key={fo.id}
                      className="flex items-center justify-between text-sm p-2 bg-yellow-100/50 rounded"
                    >
                      <span className="text-yellow-800">{fo.orderNo}</span>
                      <span className="text-yellow-600 text-xs">{fo.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {filteredOrdersList.length > 0 ? (
                filteredOrdersList.map((order) => {
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
                <div className="text-center py-12 text-gray-500">
                  {hasActiveFilters ? '没有符合筛选条件的订单' : '暂无待调度订单'}
                </div>
              )}
            </div>
          </div>

          {sandboxResult && sandboxResult.plans.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <Layers size={20} className="text-purple-500" />
                  可行方案 ({sandboxResult.plans.length})
                </h2>
                <div className="text-sm text-gray-500">
                  按可行性和匹配度排序
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sandboxResult.plans.map((plan) => (
                  <div
                    key={plan.planId}
                    className={clsx(
                      'p-4 rounded-xl border-2 transition-all',
                      plan.canDispatch
                        ? 'border-green-200 bg-green-50/50 hover:border-green-300'
                        : 'border-yellow-200 bg-yellow-50/50 hover:border-yellow-300'
                    )}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={clsx(
                            'w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm',
                            plan.canDispatch ? 'bg-green-500' : 'bg-yellow-500'
                          )}
                        >
                          {plan.planName.replace('方案 ', '')}
                        </span>
                        <div>
                          <p className="font-semibold text-gray-800">{plan.planName}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {plan.canDispatch ? (
                              <span className="text-xs text-green-600 flex items-center gap-1">
                                <CheckCircle size={12} />
                                可调度
                              </span>
                            ) : (
                              <span className="text-xs text-yellow-600 flex items-center gap-1">
                                <AlertTriangle size={12} />
                                存在冲突
                              </span>
                            )}
                            <span className="text-xs text-gray-400">·</span>
                            <span className="text-xs text-gray-500">
                              匹配度 {plan.score}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 flex items-center gap-1">
                          <Truck size={12} />
                          车辆
                        </span>
                        <span className="font-medium text-gray-800">
                          {plan.plateNo} ({plan.vehicleType})
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 flex items-center gap-1">
                          <User size={12} />
                          司机
                        </span>
                        <span className="font-medium text-gray-800">{plan.driverName}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 flex items-center gap-1">
                          <MapPin size={12} />
                          线路
                        </span>
                        <span className="font-medium text-gray-800">
                          {plan.routeName} ({plan.stopCount}站)
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 flex items-center gap-1">
                          <Scale size={12} />
                          载重
                        </span>
                        <span className={clsx('font-medium', getCapacityColor(plan.vehicleCapacityPercent))}>
                          {plan.vehicleCapacityUsed}/{plan.vehicleCapacity}kg ({plan.vehicleCapacityPercent}%)
                        </span>
                      </div>

                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>容量使用</span>
                          <span>{plan.vehicleCapacityPercent}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={clsx('h-2 rounded-full transition-all', getCapacityBgColor(plan.vehicleCapacityPercent))}
                            style={{ width: `${Math.min(plan.vehicleCapacityPercent, 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-gray-500 text-xs flex items-center gap-1">
                          <Thermometer size={10} />
                          温区
                        </span>
                        <div className="flex gap-1">
                          {plan.temperatureZones.map((zone) => {
                            const info = formatTemperatureZone(zone)
                            const isMatch = plan.vehicleTemperatureZones.includes(zone)
                            return (
                              <span
                                key={zone}
                                className={clsx(
                                  'status-badge text-xs',
                                  isMatch ? info.color : 'bg-red-100 text-red-700'
                                )}
                              >
                                {info.label}
                                {!isMatch && ' (不匹配)'}
                              </span>
                            )
                          })}
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
                        <div className="flex items-center gap-1">
                          <Clock size={12} className="text-gray-400" />
                          <span className="text-xs text-gray-500">
                            预计 {formatDurationMinutes(plan.estimatedDurationMinutes)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {plan.conflictCount > 0 && (
                            <span className="text-xs text-red-500 flex items-center gap-1">
                              <XCircle size={12} />
                              {plan.conflictCount}个冲突
                            </span>
                          )}
                          {plan.warningCount > 0 && (
                            <span className="text-xs text-yellow-500 flex items-center gap-1">
                              <AlertTriangle size={12} />
                              {plan.warningCount}个警告
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200">
                      <button
                        onClick={() => handleViewDetail(plan)}
                        className="flex-1 btn-secondary text-sm py-1.5 flex items-center justify-center gap-1"
                      >
                        <Eye size={14} />
                        查看详情
                      </button>
                      <button
                        onClick={() => handleApplyToDispatch(plan)}
                        className={clsx(
                          'flex-1 text-sm py-1.5 flex items-center justify-center gap-1',
                          plan.canDispatch ? 'btn-primary' : 'btn-warning'
                        )}
                      >
                        <ArrowRight size={14} />
                        带入调度
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sandboxResult && sandboxResult.plans.length === 0 && (
            <div className="card text-center py-12">
              <AlertTriangle size={48} className="mx-auto text-yellow-500 mb-4" />
              <p className="text-gray-600 mb-2">未找到可行的调度方案</p>
              <p className="text-sm text-gray-500">请尝试减少订单数量或调整发车时间</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">沙盘操作</h2>
            <div className="space-y-4">
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  最大方案数
                </label>
                <select
                  value={maxPlans}
                  onChange={(e) => setMaxPlans(Number(e.target.value))}
                  className="input-field"
                >
                  <option value={5}>5 个方案</option>
                  <option value={10}>10 个方案</option>
                  <option value={15}>15 个方案</option>
                  <option value={20}>20 个方案</option>
                </select>
              </div>

              <button
                onClick={handleGeneratePlans}
                disabled={effectiveSelectedOrderIds.length === 0 || generating}
                className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap size={18} />
                {generating ? '生成方案中...' : '生成模拟方案'}
              </button>

              <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
                <p className="font-medium mb-1 flex items-center gap-1">
                  <Lightbulb size={12} />
                  沙盘说明
                </p>
                <ul className="space-y-1 text-blue-600">
                  <li>• 选择多个订单后，系统将自动组合车辆、司机、线路</li>
                  <li>• 每个方案展示容量占用、温区覆盖、预计时间等信息</li>
                  <li>• 选择满意的方案可一键带入正式调度</li>
                  <li>• 沙盘模拟不会创建实际批次或修改订单状态</li>
                </ul>
              </div>
            </div>
          </div>

          {(sandboxResult || effectiveSelectedOrders.length > 0) && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Layers size={16} />
                选中订单概览
                {hasActiveFilters && (
                  <span className="text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    筛选结果中
                  </span>
                )}
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-sm text-gray-600">选中订单</span>
                  <span className="font-semibold text-gray-800">
                    {sandboxResult ? sandboxResult.totalOrders : selectedOrdersSummary.totalOrders} 单
                  </span>
                </div>
                <div className="flex justify-between items-center p-2 bg-green-50 rounded">
                  <span className="text-sm text-green-700 flex items-center gap-1">
                    <CheckCircle size={14} />
                    可调度订单
                  </span>
                  <span className="font-semibold text-green-700">
                    {sandboxResult ? sandboxResult.dispatchableOrders : selectedOrdersSummary.dispatchableOrders} 单
                  </span>
                </div>
                {sandboxResult && sandboxResult.filteredOrders.length > 0 && (
                  <div className="flex justify-between items-center p-2 bg-yellow-50 rounded">
                    <span className="text-sm text-yellow-700 flex items-center gap-1">
                      <AlertTriangle size={14} />
                      已过滤
                    </span>
                    <span className="font-semibold text-yellow-700">{sandboxResult.filteredOrders.length} 单</span>
                  </div>
                )}
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-sm text-gray-600">总重量</span>
                  <span className="font-semibold text-gray-800">
                    {sandboxResult ? sandboxResult.totalWeight : selectedOrdersSummary.totalWeight} kg
                  </span>
                </div>
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                  <span className="text-sm text-gray-600">总件数</span>
                  <span className="font-semibold text-gray-800">
                    {sandboxResult ? sandboxResult.totalQuantity : selectedOrdersSummary.totalQuantity} 件
                  </span>
                </div>
                <div>
                  <span className="text-sm text-gray-600 mb-2 block">涉及温区</span>
                  <div className="flex flex-wrap gap-1">
                    {(sandboxResult ? sandboxResult.requiredTemperatureZones : selectedOrdersSummary.requiredTemperatureZones).map((zone) => {
                      const info = formatTemperatureZone(zone)
                      return (
                        <span key={zone} className={clsx('status-badge text-xs', info.color)}>
                          {info.label}
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showDetail && planDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={clsx(
                      'w-12 h-12 rounded-full flex items-center justify-center',
                      planDetail.canDispatch ? 'bg-green-100' : 'bg-yellow-100'
                    )}
                  >
                    {planDetail.canDispatch ? (
                      <CheckCircle size={24} className="text-green-500" />
                    ) : (
                      <AlertTriangle size={24} className="text-yellow-500" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">
                      {planDetail.planName} · 方案详情
                    </h3>
                    <p className={clsx(
                      'text-sm',
                      planDetail.canDispatch ? 'text-green-600' : 'text-yellow-600'
                    )}>
                      匹配度 {planDetail.score}% · {planDetail.canDispatch ? '可以正常调度' : '存在调度冲突'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetail(false)}
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
                    {planDetail.totalWeight}
                    <span className="text-sm font-normal ml-1">kg</span>
                  </p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-sm text-purple-600 mb-1">总件数</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {planDetail.totalQuantity}
                    <span className="text-sm font-normal ml-1">件</span>
                  </p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <p className="text-sm text-orange-600 mb-1">预计耗时</p>
                  <p className="text-2xl font-bold text-orange-700">
                    {formatDurationMinutes(planDetail.estimatedDurationMinutes)}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-green-600 mb-1">车辆容量</p>
                  <p className="text-2xl font-bold text-green-700">
                    {planDetail.vehicleCapacityPercent}
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
                    {planDetail.temperatureZones.map((zone) => {
                      const info = formatTemperatureZone(zone)
                      return (
                        <span key={zone} className={clsx('status-badge', info.color)}>
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
                  {planDetail.vehicle ? (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="font-medium text-gray-800">
                        {planDetail.vehicle.plateNo} ({planDetail.vehicle.vehicleType})
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        载重：{planDetail.vehicle.capacity}kg · 可用：{planDetail.vehicle.availableStartTime}-{planDetail.vehicle.availableEndTime}
                      </p>
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>容量使用</span>
                          <span>{planDetail.vehicleCapacityUsed}kg / {planDetail.vehicle.capacity}kg</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={clsx(
                              'h-2 rounded-full transition-all',
                              planDetail.vehicleCapacityPercent > 100
                                ? 'bg-red-500'
                                : planDetail.vehicleCapacityPercent > 90
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                            )}
                            style={{ width: `${Math.min(planDetail.vehicleCapacityPercent, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {planDetail.vehicle.temperatureZones.map((zone) => {
                          const info = formatTemperatureZone(zone as TemperatureZone)
                          return (
                            <span key={zone} className={clsx('status-badge text-xs', info.color)}>
                              {info.label}
                            </span>
                          )
                        })}
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
                  {planDetail.driver ? (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="font-medium text-gray-800">
                        {planDetail.driver.name}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {planDetail.driver.phone} · 状态：{planDetail.driver.status}
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
                  {planDetail.route ? (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="font-medium text-gray-800">
                        {planDetail.route.name}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        共 {planDetail.route.stopCount} 个站点
                      </p>
                      <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                        {(planDetail.route.stops as RouteStop[]).map((stop, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-gray-600">
                            <span className="w-4 h-4 bg-gray-200 rounded-full flex items-center justify-center text-gray-600">
                              {stop.order}
                            </span>
                            <span className="truncate">{stop.address}</span>
                            <span className="text-gray-400 ml-auto">
                              {stop.estimatedTime}分钟
                            </span>
                          </div>
                        ))}
                      </div>
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
                        {formatDateTime(planDetail.scheduledDepartureTime)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 w-20">预计到达</span>
                      <ArrowRight size={14} className="text-gray-400" />
                      <span className="text-sm font-medium text-gray-800">
                        {formatDateTime(planDetail.estimatedArrivalTime)}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Package size={16} />
                    涉及订单 ({planDetail.orders.length})
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto space-y-1">
                    {planDetail.orders.map((order) => (
                      <div key={order.id} className="flex items-center gap-2 text-sm">
                        <div
                          className={clsx(
                            'w-2 h-2 rounded-full flex-shrink-0',
                            getTemperatureZoneColor(order.temperatureZone)
                          )}
                        />
                        <span className="font-medium text-gray-800">{order.orderNo}</span>
                        <span className="text-gray-500">·</span>
                        <span className="text-gray-600 truncate">{order.goodsName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {planDetail.conflicts.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-500" />
                    冲突信息
                  </h4>
                  <div className="space-y-2">
                    {planDetail.conflicts.map((conflict, index) => (
                      <div
                        key={index}
                        className={clsx(
                          'p-3 rounded-lg flex items-start gap-3',
                          conflict.severity === 'error'
                            ? 'bg-red-50 border border-red-200'
                            : 'bg-yellow-50 border border-yellow-200'
                        )}
                      >
                        <div
                          className={clsx(
                            'mt-0.5',
                            conflict.severity === 'error' ? 'text-red-500' : 'text-yellow-600'
                          )}
                        >
                          {conflict.severity === 'error' ? (
                            <XCircle size={16} />
                          ) : (
                            <AlertTriangle size={16} />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {getConflictIcon(conflict.type)}
                            <span
                              className={clsx(
                                'text-xs font-medium uppercase',
                                conflict.severity === 'error'
                                  ? 'text-red-600'
                                  : 'text-yellow-600'
                              )}
                            >
                              {conflict.type}
                            </span>
                          </div>
                          <p
                            className={clsx(
                              'text-sm mt-1',
                              conflict.severity === 'error'
                                ? 'text-red-700'
                                : 'text-yellow-700'
                            )}
                          >
                            {conflict.message}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {planDetail.warnings.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-yellow-500" />
                    注意事项
                  </h4>
                  <div className="space-y-2">
                    {planDetail.warnings.map((warning, index) => (
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

              {planDetail.suggestions.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Lightbulb size={16} className="text-blue-500" />
                    优化建议
                  </h4>
                  <div className="space-y-2">
                    {planDetail.suggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-blue-500">
                            {getSuggestionIcon(suggestion.type)}
                          </div>
                          <div>
                            <p className="text-sm text-blue-700">{suggestion.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  * 沙盘模拟仅用于验证调度可行性，不会实际创建批次或修改订单状态
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDetail(false)}
                    className="btn-secondary"
                  >
                    关闭
                  </button>
                  {selectedPlan && (
                    <button
                      onClick={() => handleApplyToDispatch(selectedPlan)}
                      className={clsx(
                        'flex items-center gap-2',
                        planDetail.canDispatch ? 'btn-primary' : 'btn-warning'
                      )}
                    >
                      <Play size={16} />
                      一键带入正式调度
                      <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDetail && loadingDetail && !planDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 text-center">
            <RefreshCw size={32} className="mx-auto text-blue-500 animate-spin mb-4" />
            <p className="text-gray-600">加载方案详情中...</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default DispatchSandbox
