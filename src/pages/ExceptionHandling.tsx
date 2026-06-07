import { useState, useEffect, useMemo } from 'react'
import {
  AlertTriangle,
  Search,
  RefreshCw,
  Eye,
  CheckCircle,
  Clock,
  XCircle,
  ChevronLeft,
  Thermometer,
  User,
  MapPin,
  Calendar,
  Send,
  Filter,
  X,
  Package,
  Truck,
  User as UserIcon,
} from 'lucide-react'
import { api } from '@/utils/api'
import {
  formatDateTime,
  formatTemperature,
  formatTemperatureZone,
  formatOrderStatus,
  formatHandlingStatus,
  formatHandlingResult,
  formatNodeStatus,
} from '@/utils/format'
import clsx from 'clsx'
import type {
  ExceptionHandlingWithDetails,
  ExceptionHandlingQueryParams,
  ExceptionHandlingListResponse,
  ExceptionHandlingUpdateRequest,
  Driver,
  DeliveryNode,
  TemperatureZone,
  OrderStatus,
  ExceptionHandlingStatus,
} from '@shared/types'

interface TemperatureRecord {
  recordedAt: string
  temperature: number
  locationText: string
  nodeName: string
  status: string
}

interface ExceptionDetailResponse {
  exception: ExceptionHandlingWithDetails
  nodes: DeliveryNode[]
  temperatureRecords: TemperatureRecord[]
}

function ExceptionHandling() {
  const [exceptions, setExceptions] = useState<ExceptionHandlingListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailData, setDetailData] = useState<ExceptionDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [processing, setProcessing] = useState(false)
  const [stats, setStats] = useState<{ pending: number; resolved: number; escalated: number; total: number } | null>(null)

  const [filters, setFilters] = useState<{
    startDate: string
    endDate: string
    temperatureZone: TemperatureZone | ''
    driverId: string
    orderStatus: OrderStatus | ''
    handlingStatus: ExceptionHandlingStatus | ''
    page: number
    pageSize: number
  }>({
    startDate: '',
    endDate: '',
    temperatureZone: '',
    driverId: '',
    orderStatus: '',
    handlingStatus: '',
    page: 1,
    pageSize: 20,
  })

  const [handleForm, setHandleForm] = useState<ExceptionHandlingUpdateRequest>({
    handlingStatus: 'resolved',
    handlingResult: 'recovered',
    handlingNotes: '',
  })

  useEffect(() => {
    loadDrivers()
    loadStats()
    syncExceptions()
  }, [])

  useEffect(() => {
    loadExceptions()
  }, [filters])

  async function loadDrivers() {
    try {
      const data = await api.get<Driver[]>('/exceptions/drivers')
      setDrivers(data)
    } catch (error) {
      console.error('Failed to load drivers:', error)
    }
  }

  async function loadStats() {
    try {
      const data = await api.get<{ pending: number; resolved: number; escalated: number; total: number }>('/exceptions/stats')
      setStats(data)
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  async function syncExceptions() {
    try {
      await api.get('/exceptions/sync')
    } catch (error) {
      console.error('Failed to sync exceptions:', error)
    }
  }

  async function loadExceptions() {
    setLoading(true)
    try {
      const params: ExceptionHandlingQueryParams = {}
      if (filters.startDate) params.startDate = `${filters.startDate}T00:00:00.000Z`
      if (filters.endDate) params.endDate = `${filters.endDate}T23:59:59.999Z`
      if (filters.temperatureZone) params.temperatureZone = filters.temperatureZone
      if (filters.driverId) params.driverId = filters.driverId
      if (filters.orderStatus) params.orderStatus = filters.orderStatus
      if (filters.handlingStatus) params.handlingStatus = filters.handlingStatus
      params.page = filters.page
      params.pageSize = filters.pageSize

      const queryString = new URLSearchParams(params as Record<string, string>).toString()
      const data = await api.get<ExceptionHandlingListResponse>(`/exceptions?${queryString}`)
      setExceptions(data)
    } catch (error) {
        console.error('Failed to load exceptions:', error)
      } finally {
        setLoading(false)
      }
    }

  async function loadDetail(id: string) {
    setDetailId(id)
    setDetailLoading(true)
    try {
      const data = await api.get<ExceptionDetailResponse>(`/exceptions/${id}`)
      setDetailData(data)
      if (data.exception.handlingStatus !== 'pending') {
        setHandleForm({
          handlingStatus: data.exception.handlingStatus,
          handlingResult: data.exception.handlingResult || 'recovered',
          handlingNotes: data.exception.handlingNotes || '',
        })
      }
    } catch (error) {
      console.error('Failed to load detail:', error)
    } finally {
      setDetailLoading(false)
    }
  }

  function closeDetail() {
    setDetailId(null)
    setDetailData(null)
    setHandleForm({
      handlingStatus: 'resolved',
      handlingResult: 'recovered',
      handlingNotes: '',
    })
  }

  async function handleException() {
    if (!detailId) return
    if (!handleForm.handlingNotes.trim()) {
      alert('请填写处理备注')
      return
    }

    setProcessing(true)
    try {
      await api.put(`/exceptions/${detailId}`, handleForm)
      await loadExceptions()
      await loadStats()
      await loadDetail(detailId)
      alert('处理成功')
    } catch (error) {
        console.error('Failed to handle exception:', error)
        alert('处理失败')
      } finally {
        setProcessing(false)
      }
    }

  function resetFilters() {
    setFilters({
      startDate: '',
      endDate: '',
      temperatureZone: '',
      driverId: '',
      handlingStatus: '',
      orderStatus: '',
      page: 1,
      pageSize: 20,
    })
  }

  const totalPages = exceptions ? Math.ceil(exceptions.total / exceptions.pageSize) : 0

  if (detailId) {
    return (
      <div className="space-y-6">
        <button
          onClick={closeDetail}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
        >
          <ChevronLeft size={20} />
          <span>返回列表</span>
        </button>

        {detailLoading ? (
          <div className="flex items-center justify-center h-64">加载中...</div>
        ) : detailData ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="card">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                        <AlertTriangle size={24} className="text-red-500" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800">
                          {detailData.exception.node?.nodeName}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {detailData.exception.node?.nodeType}
                        </p>
                      </div>
                    </div>
                    {detailData.exception.handlingStatus && (
                      <span
                        className={clsx(
                          'status-badge',
                          formatHandlingStatus(detailData.exception.handlingStatus).color
                        )}
                      >
                        {formatHandlingStatus(detailData.exception.handlingStatus).label}
                      </span>
                    )}
                  </div>

                  <div className="bg-red-50 border border-red-100 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-red-800">异常描述</p>
                        <p className="text-red-600 mt-1">
                          {detailData.exception.exceptionDescription}
                        </p>
                        <p className="text-xs text-red-400 mt-2">
                          {formatDateTime(detailData.exception.exceptionTime)} · {detailData.exception.node?.operatorName}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <Package size={18} className="text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">订单号</p>
                        <p className="font-medium text-gray-800">{detailData.exception.order?.orderNo}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Thermometer size={18} className="text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">温区</p>
                        <span className={clsx('status-badge', formatTemperatureZone(detailData.exception.temperatureZone).color)}>
                          {formatTemperatureZone(detailData.exception.temperatureZone).label}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <UserIcon size={18} className="text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">司机</p>
                        <p className="font-medium text-gray-800">{detailData.exception.driver?.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <MapPin size={18} className="text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">订单状态</p>
                        {detailData.exception.order?.status && (
                          <span className={clsx('status-badge', formatOrderStatus(detailData.exception.order.status).color)}>
                            {formatOrderStatus(detailData.exception.order.status).label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">配送节点</h3>
                  <div className="space-y-3">
                    {detailData.nodes.map((node, index) => {
                      const statusInfo = formatNodeStatus(node.status)
                      const isException = node.status === 'exception'
                      return (
                        <div
                          key={node.id}
                          className={clsx(
                            'p-4 border rounded-lg',
                            isException
                              ? 'bg-red-50 border-red-200'
                              : 'bg-white border-gray-200'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <div
                                  className={clsx(
                                    'w-8 h-8 rounded-full flex items-center justify-center',
                                    statusInfo.color
                                  )}
                                >
                                  {isException ? (
                                    <AlertTriangle size={14} className="text-white" />
                                  ) : node.status === 'completed' ? (
                                    <CheckCircle size={14} className="text-white" />
                                  ) : (
                                    <Clock size={14} className="text-white" />
                                  )}
                                </div>
                                {index < detailData.nodes.length - 1 && (
                                  <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-8 bg-gray-200 top-full" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">{node.nodeName}</p>
                                <p className="text-sm text-gray-500">{node.locationText}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className={clsx('status-badge', statusInfo.color.replace('bg-', 'bg-opacity-20 text-').replace('500', '700'))}>
                                {statusInfo.label}
                              </span>
                              <p className="text-xs text-gray-400 mt-1">
                                {node.recordedAt ? formatDateTime(node.recordedAt) : '-'}
                              </p>
                            </div>
                          </div>
                          {node.temperature !== undefined && node.temperature !== null && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <div className="flex items-center gap-2 text-sm">
                                <Thermometer size={14} className="text-gray-400" />
                                <span className="text-gray-600">
                                  温度: {formatTemperature(node.temperature)}
                                </span>
                              </div>
                            </div>
                          )}
                          {node.exceptionDescription && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <p className="text-sm text-red-600">
                                <AlertTriangle size={14} className="inline mr-1" />
                                {node.exceptionDescription}
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="card">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">温度记录</h3>
                  {detailData.temperatureRecords.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">时间</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">节点</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">位置</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">温度</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailData.temperatureRecords.map((record, index) => {
                            const order = detailData.exception.order
                            const isAbnormal = order && (
                              record.temperature < order.minTemp || record.temperature > order.maxTemp
                            )
                            return (
                              <tr key={index} className="border-b last:border-b-0">
                                <td className="py-3 px-4 text-sm text-gray-800">
                                  {formatDateTime(record.recordedAt)}
                                </td>
                                <td className="py-3 px-4 text-sm text-gray-600">{record.nodeName}</td>
                                <td className="py-3 px-4 text-sm text-gray-600">{record.locationText}</td>
                                <td className={clsx(
                                  'py-3 px-4 text-sm font-medium',
                                  isAbnormal ? 'text-red-500' : 'text-gray-800'
                                )}>
                                  <Thermometer size={14} className="inline mr-1" />
                                  {formatTemperature(record.temperature)}
                                  {isAbnormal && (
                                    <span className="text-xs ml-1">(异常)</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">暂无温度记录</div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="card">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">订单信息</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500">商品名称</p>
                      <p className="font-medium text-gray-800">
                        {detailData.exception.order?.goodsName}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">配送地址</p>
                      <p className="text-sm text-gray-600">
                        {detailData.exception.order?.deliveryAddress}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">温度要求</p>
                      <p className="text-sm text-gray-600">
                        {detailData.exception.order &&
                          `${formatTemperature(detailData.exception.order.minTemp)} ~ ${formatTemperature(detailData.exception.order.maxTemp)}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">预计送达</p>
                      <p className="text-sm text-gray-600">
                        {detailData.exception.order?.scheduledDeliveryTime
                          ? formatDateTime(detailData.exception.order.scheduledDeliveryTime)
                          : '-'}
                      </p>
                    </div>
                  </div>
                </div>

                {detailData.exception.handlingStatus === 'pending' ? (
                  <div className="card">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">异常处理</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          处理状态
                        </label>
                        <select
                          value={handleForm.handlingStatus}
                          onChange={(e) =>
                            setHandleForm({
                              ...handleForm,
                              handlingStatus: e.target.value as any,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="resolved">已解决</option>
                          <option value="escalated">已升级</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          处理结果
                        </label>
                        <select
                          value={handleForm.handlingResult}
                          onChange={(e) =>
                            setHandleForm({
                              ...handleForm,
                              handlingResult: e.target.value as any,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="recovered">已恢复正常</option>
                          <option value="compensated">已赔偿</option>
                          <option value="re_routed">已改派</option>
                          <option value="cancelled">已取消订单</option>
                          <option value="other">其他</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          处理备注
                        </label>
                        <textarea
                          value={handleForm.handlingNotes}
                          onChange={(e) =>
                            setHandleForm({
                              ...handleForm,
                              handlingNotes: e.target.value,
                            })
                          }
                          rows={4}
                          placeholder="请填写处理备注..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                      </div>
                      <button
                        onClick={handleException}
                        disabled={processing}
                        className="w-full btn btn-primary flex items-center justify-center gap-2"
                      >
                        <Send size={18} />
                        {processing ? '处理中...' : '提交处理'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="card">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">处理结果</h3>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-gray-500">处理状态</p>
                        <span
                          className={clsx(
                            'status-badge',
                            formatHandlingStatus(detailData.exception.handlingStatus).color
                          )}
                        >
                          {formatHandlingStatus(detailData.exception.handlingStatus).label}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">处理结果</p>
                        <p className="font-medium text-gray-800">
                          {detailData.exception.handlingResult
                            ? formatHandlingResult(detailData.exception.handlingResult).label
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">处理备注</p>
                        <p className="text-sm text-gray-600">
                          {detailData.exception.handlingNotes || '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">处理时间</p>
                        <p className="text-sm text-gray-600">
                          {detailData.exception.handledAt
                            ? formatDateTime(detailData.exception.handledAt)
                            : '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">异常总数</p>
              <p className="text-2xl font-bold text-gray-800">{stats?.total || 0}</p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <AlertTriangle size={24} className="text-gray-500" />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">待处理</p>
              <p className="text-2xl font-bold text-yellow-600">{stats?.pending || 0}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock size={24} className="text-yellow-500" />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">已解决</p>
              <p className="text-2xl font-bold text-green-600">{stats?.resolved || 0}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle size={24} className="text-green-500" />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">已升级</p>
              <p className="text-2xl font-bold text-red-600">{stats?.escalated || 0}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <XCircle size={24} className="text-red-500" />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">筛选条件</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={resetFilters} className="btn btn-secondary flex items-center gap-2">
              <RefreshCw size={16} />
              重置
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">温区</label>
            <select
              value={filters.temperatureZone}
              onChange={(e) => setFilters({ ...filters, temperatureZone: e.target.value as any, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="frozen">冷冻</option>
              <option value="chilled">冷藏</option>
              <option value="ambient">常温</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">司机</label>
            <select
              value={filters.driverId}
              onChange={(e) => setFilters({ ...filters, driverId: e.target.value, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">订单状态</label>
            <select
              value={filters.orderStatus}
              onChange={(e) => setFilters({ ...filters, orderStatus: e.target.value as any, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">处理状态</label>
            <select
              value={filters.handlingStatus}
              onChange={(e) => setFilters({ ...filters, handlingStatus: e.target.value as any, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="pending">待处理</option>
              <option value="resolved">已解决</option>
              <option value="escalated">已升级</option>
            </select>
          </div>
        </div>
        <div className="flex items-end">
          <button
            onClick={loadExceptions}
            className="btn btn-primary flex items-center gap-2"
          >
            <Search size={18} />
            查询
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">异常列表</h3>
          <span className="text-sm text-gray-500">
            共 {exceptions?.total || 0} 条记录
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">加载中...</div>
        ) : exceptions?.items && exceptions.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">异常时间</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">订单号</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">异常节点</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">温区</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">司机</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">订单状态</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">处理状态</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.items.map((item) => (
                    <tr key={item.id} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="text-sm text-gray-800">
                          {formatDateTime(item.exceptionTime)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm font-medium text-gray-800">
                          {item.order?.orderNo}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.order?.goodsName}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={14} className="text-red-500" />
                          <span className="text-sm text-gray-800">{item.node?.nodeName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={clsx('status-badge', formatTemperatureZone(item.temperatureZone).color)}>
                          {formatTemperatureZone(item.temperatureZone).label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <User size={14} className="text-gray-400" />
                          <span className="text-sm text-gray-600">{item.driver?.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {item.order?.status && (
                          <span className={clsx('status-badge', formatOrderStatus(item.order.status).color)}>
                            {formatOrderStatus(item.order.status).label}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={clsx('status-badge', formatHandlingStatus(item.handlingStatus).color)}>
                          {formatHandlingStatus(item.handlingStatus).label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => loadDetail(item.id)}
                          className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                        >
                          <Eye size={14} />
                          查看
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-500">
                  第 {filters.page} / {totalPages} 页
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                    disabled={filters.page <= 1}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                    disabled={filters.page >= totalPages}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-gray-500">
          暂无异常记录
        </div>
      )}
      </div>
    </div>
  )
}

export default ExceptionHandling
