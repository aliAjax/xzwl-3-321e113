import { useState, useEffect, useMemo } from 'react'
import {
  AlertTriangle,
  Search,
  RefreshCw,
  Eye,
  CheckCircle,
  Clock,
  XCircle,
  Thermometer,
  MapPin,
  Send,
  Filter,
  X,
  Package,
  Truck,
  User as UserIcon,
  ChevronDown,
  MessageSquare,
  ArrowUp,
  Check,
  RotateCcw,
  UserPlus,
  Lock,
  Unlock,
  History,
  Zap,
  ListTodo,
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
  formatEscalationLevel,
  formatActionType,
  formatUserRole,
} from '@/utils/format'
import clsx from 'clsx'
import { useAuthStore } from '@/store/authStore'
import type {
  ExceptionHandlingWithDetails,
  ExceptionHandlingQueryParams,
  ExceptionHandlingListResponse,
  ExceptionHandlingUpdateRequest,
  ExceptionProcessingNote,
  Driver,
  DeliveryNode,
  TemperatureZone,
  OrderStatus,
  ExceptionHandlingStatus,
  ExceptionHandlingResult,
  EscalationLevel,
  User,
  ExceptionHandlingWorkorderStats,
} from '@shared/types'

type QuickViewType = 'all' | 'my_pending' | 'high_priority_unclosed'

interface TemperatureRecord {
  recordedAt: string
  temperature: number
  locationText: string
  nodeName: string
  status: string
}

interface ExceptionDetailResponse {
  exception: ExceptionHandlingWithDetails & { processingNotes?: ExceptionProcessingNote[] }
  nodes: DeliveryNode[]
  temperatureRecords: TemperatureRecord[]
}

function getLocalDayBoundary(date: string, boundary: 'start' | 'end'): string {
  const [year, month, day] = date.split('-').map(Number)
  const localDate = boundary === 'start'
    ? new Date(year, month - 1, day, 0, 0, 0, 0)
    : new Date(year, month - 1, day, 23, 59, 59, 999)

  return localDate.toISOString()
}

function ExceptionHandling() {
  const { user } = useAuthStore()
  const [exceptions, setExceptions] = useState<ExceptionHandlingListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailData, setDetailData] = useState<ExceptionDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [processing, setProcessing] = useState(false)
  const [stats, setStats] = useState<ExceptionHandlingWorkorderStats | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeQuickView, setActiveQuickView] = useState<QuickViewType>('all')

  const [filters, setFilters] = useState<{
    startDate: string
    endDate: string
    temperatureZone: TemperatureZone | ''
    driverId: string
    orderStatus: OrderStatus | ''
    handlingStatus: ExceptionHandlingStatus | ''
    escalationLevel: EscalationLevel | ''
    assigneeId: string
    isClosed: '' | 'true' | 'false'
    page: number
    pageSize: number
  }>({
    startDate: '',
    endDate: '',
    temperatureZone: '',
    driverId: '',
    orderStatus: '',
    handlingStatus: '',
    escalationLevel: '',
    assigneeId: '',
    isClosed: '',
    page: 1,
    pageSize: 20,
  })

  const [handleForm, setHandleForm] = useState<ExceptionHandlingUpdateRequest>({
    handlingStatus: 'resolved',
    handlingResult: 'recovered',
    handlingNotes: '',
  })

  const [noteForm, setNoteForm] = useState('')
  const [assignForm, setAssignForm] = useState({ assigneeId: '', note: '' })
  const [escalateForm, setEscalateForm] = useState({ escalationLevel: 'level_2' as EscalationLevel, note: '' })
  const [closeForm, setCloseForm] = useState({ handlingResult: 'recovered' as ExceptionHandlingResult, note: '' })
  const [reopenForm, setReopenForm] = useState({ note: '' })

  useEffect(() => {
    loadDrivers()
    loadUsers()
    loadStats()
    syncExceptions()
  }, [])

  useEffect(() => {
    loadExceptions()
    loadStats()
  }, [filters])

  async function loadDrivers() {
    try {
      const data = await api.get<Driver[]>('/exceptions/drivers')
      setDrivers(data)
    } catch (error) {
      console.error('Failed to load drivers:', error)
    }
  }

  async function loadUsers() {
    try {
      const data = await api.get<User[]>('/exceptions/dispatchers')
      setUsers(data)
    } catch (error) {
      console.error('Failed to load users:', error)
    }
  }

  async function loadStats(overrideFilters?: Partial<typeof filters>) {
    try {
      const currentFilters = overrideFilters || filters
      const params: Record<string, string> = {}
      if (currentFilters.startDate) params.startDate = getLocalDayBoundary(currentFilters.startDate, 'start')
      if (currentFilters.endDate) params.endDate = getLocalDayBoundary(currentFilters.endDate, 'end')
      if (currentFilters.temperatureZone) params.temperatureZone = currentFilters.temperatureZone
      if (currentFilters.driverId) params.driverId = currentFilters.driverId
      if (currentFilters.orderStatus) params.orderStatus = currentFilters.orderStatus
      if (currentFilters.handlingStatus) params.handlingStatus = currentFilters.handlingStatus
      if (currentFilters.escalationLevel) params.escalationLevel = currentFilters.escalationLevel
      if (currentFilters.assigneeId) params.assigneeId = currentFilters.assigneeId
      if (currentFilters.isClosed !== '') params.isClosed = currentFilters.isClosed as string

      const queryString = new URLSearchParams(params).toString()
      const data = await api.get<ExceptionHandlingWorkorderStats>(`/exceptions/workorder-stats?${queryString}`)
      setStats(data)
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  function applyQuickView(view: QuickViewType) {
    setActiveQuickView(view)

    const baseFilters: typeof filters = {
      startDate: '',
      endDate: '',
      temperatureZone: '',
      driverId: '',
      orderStatus: '',
      handlingStatus: '',
      escalationLevel: '',
      assigneeId: '',
      isClosed: '',
      page: 1,
      pageSize: 20,
    }

    let newFilters = { ...baseFilters }

    if (view === 'my_pending') {
      newFilters = {
        ...baseFilters,
        assigneeId: user?.id || '',
        handlingStatus: 'pending',
        isClosed: 'false',
      }
    } else if (view === 'high_priority_unclosed') {
      newFilters = {
        ...baseFilters,
        escalationLevel: 'level_3',
        isClosed: 'false',
      }
    }

    setFilters(newFilters)
    loadStats(newFilters)
  }

  function updateFilters(updates: Partial<typeof filters>) {
    setActiveQuickView(prev => prev !== 'all' ? 'all' : prev)
    setFilters({ ...filters, ...updates })
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
      if (filters.startDate) params.startDate = getLocalDayBoundary(filters.startDate, 'start')
      if (filters.endDate) params.endDate = getLocalDayBoundary(filters.endDate, 'end')
      if (filters.temperatureZone) params.temperatureZone = filters.temperatureZone
      if (filters.driverId) params.driverId = filters.driverId
      if (filters.orderStatus) params.orderStatus = filters.orderStatus
      if (filters.handlingStatus) params.handlingStatus = filters.handlingStatus
      if (filters.escalationLevel) params.escalationLevel = filters.escalationLevel
      if (filters.assigneeId) params.assigneeId = filters.assigneeId
      if (filters.isClosed !== '') params.isClosed = filters.isClosed === 'true'
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
    setDrawerOpen(true)
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
    setDrawerOpen(false)
    setHandleForm({
      handlingStatus: 'resolved',
      handlingResult: 'recovered',
      handlingNotes: '',
    })
    setNoteForm('')
    setAssignForm({ assigneeId: '', note: '' })
    setEscalateForm({ escalationLevel: 'level_2', note: '' })
    setCloseForm({ handlingResult: 'recovered', note: '' })
    setReopenForm({ note: '' })
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
      await loadStats(filters)
      await loadDetail(detailId)
      alert('处理成功')
    } catch (error) {
        console.error('Failed to handle exception:', error)
        alert('处理失败')
      } finally {
        setProcessing(false)
      }
    }

  async function addNote() {
    if (!detailId || !noteForm.trim()) {
      alert('请填写备注内容')
      return
    }

    setProcessing(true)
    try {
      await api.post(`/exceptions/${detailId}/note`, { note: noteForm })
      await loadDetail(detailId)
      setNoteForm('')
    } catch (error) {
      console.error('Failed to add note:', error)
      alert('添加备注失败')
    } finally {
      setProcessing(false)
    }
  }

  async function assignException() {
    if (!detailId || !assignForm.assigneeId) {
      alert('请选择处理人')
      return
    }

    setProcessing(true)
    try {
      await api.post(`/exceptions/${detailId}/assign`, assignForm)
      await loadExceptions()
      await loadDetail(detailId)
      setAssignForm({ assigneeId: '', note: '' })
      alert('分配成功')
    } catch (error) {
      console.error('Failed to assign:', error)
      alert('分配失败')
    } finally {
      setProcessing(false)
    }
  }

  async function escalateException() {
    if (!detailId) return

    setProcessing(true)
    try {
      await api.post(`/exceptions/${detailId}/escalate`, escalateForm)
      await loadExceptions()
      await loadDetail(detailId)
      setEscalateForm({ escalationLevel: 'level_2', note: '' })
      alert('升级成功')
    } catch (error) {
      console.error('Failed to escalate:', error)
      alert('升级失败')
    } finally {
      setProcessing(false)
    }
  }

  async function closeException() {
    if (!detailId || !closeForm.note.trim()) {
      alert('请填写关闭备注')
      return
    }

    setProcessing(true)
    try {
      await api.post(`/exceptions/${detailId}/close`, closeForm)
      await loadExceptions()
      await loadStats(filters)
      await loadDetail(detailId)
      setCloseForm({ handlingResult: 'recovered', note: '' })
      alert('关闭成功')
    } catch (error) {
      console.error('Failed to close:', error)
      alert('关闭失败')
    } finally {
      setProcessing(false)
    }
  }

  async function reopenException() {
    if (!detailId || !reopenForm.note.trim()) {
      alert('请填写重开备注')
      return
    }

    setProcessing(true)
    try {
      await api.post(`/exceptions/${detailId}/reopen`, reopenForm)
      await loadExceptions()
      await loadStats(filters)
      await loadDetail(detailId)
      setReopenForm({ note: '' })
      alert('重开成功')
    } catch (error) {
      console.error('Failed to reopen:', error)
      alert('重开失败')
    } finally {
      setProcessing(false)
    }
  }

  function resetFilters() {
    setActiveQuickView('all')
    const newFilters: typeof filters = {
      startDate: '',
      endDate: '',
      temperatureZone: '',
      driverId: '',
      handlingStatus: '',
      orderStatus: '',
      escalationLevel: '',
      assigneeId: '',
      isClosed: '',
      page: 1,
      pageSize: 20,
    }
    setFilters(newFilters)
    loadStats(newFilters)
  }

  const totalPages = exceptions ? Math.ceil(exceptions.total / exceptions.pageSize) : 0

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
              <p className="text-sm text-gray-500">已闭环</p>
              <p className="text-2xl font-bold text-green-600">{stats?.closed || 0}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle size={24} className="text-green-500" />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">处理中</p>
              <p className="text-2xl font-bold text-blue-600">{stats?.open || 0}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Truck size={24} className="text-blue-500" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">一级（普通）</p>
              <p className="text-xl font-bold text-blue-600">{stats?.level1 || 0}</p>
            </div>
            <span className="status-badge bg-blue-100 text-blue-800">L1</span>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">二级（紧急）</p>
              <p className="text-xl font-bold text-orange-600">{stats?.level2 || 0}</p>
            </div>
            <span className="status-badge bg-orange-100 text-orange-800">L2</span>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">三级（严重）</p>
              <p className="text-xl font-bold text-red-600">{stats?.level3 || 0}</p>
            </div>
            <span className="status-badge bg-red-100 text-red-800">L3</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">快捷视图</h3>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => applyQuickView('all')}
            className={clsx(
              'px-4 py-2 rounded-lg flex items-center gap-2 transition-colors',
              activeQuickView === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            <ListTodo size={18} />
            全部工单
          </button>
          <button
            onClick={() => applyQuickView('my_pending')}
            className={clsx(
              'px-4 py-2 rounded-lg flex items-center gap-2 transition-colors',
              activeQuickView === 'my_pending'
                ? 'bg-yellow-600 text-white'
                : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
            )}
          >
            <Clock size={18} />
            我的待处理
          </button>
          <button
            onClick={() => applyQuickView('high_priority_unclosed')}
            className={clsx(
              'px-4 py-2 rounded-lg flex items-center gap-2 transition-colors',
              activeQuickView === 'high_priority_unclosed'
                ? 'bg-red-600 text-white'
                : 'bg-red-50 text-red-700 hover:bg-red-100'
            )}
          >
            <Zap size={18} />
            高优先级未关闭
          </button>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => updateFilters({ startDate: e.target.value, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => updateFilters({ endDate: e.target.value, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">温区</label>
            <select
              value={filters.temperatureZone}
              onChange={(e) => updateFilters({ temperatureZone: e.target.value as any, page: 1 })}
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
              onChange={(e) => updateFilters({ driverId: e.target.value, page: 1 })}
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
              onChange={(e) => updateFilters({ orderStatus: e.target.value as any, page: 1 })}
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
              onChange={(e) => updateFilters({ handlingStatus: e.target.value as any, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="pending">待处理</option>
              <option value="resolved">已解决</option>
              <option value="escalated">已升级</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">升级级别</label>
            <select
              value={filters.escalationLevel}
              onChange={(e) => updateFilters({ escalationLevel: e.target.value as any, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="level_1">一级（普通）</option>
              <option value="level_2">二级（紧急）</option>
              <option value="level_3">三级（严重）</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">处理人</label>
            <select
              value={filters.assigneeId}
              onChange={(e) => updateFilters({ assigneeId: e.target.value, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="">未分配</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">闭环状态</label>
            <select
              value={filters.isClosed}
              onChange={(e) => updateFilters({ isClosed: e.target.value as any, page: 1 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="false">未闭环</option>
              <option value="true">已闭环</option>
            </select>
          </div>
        </div>
        <div className="flex items-end mt-4">
          <button
            onClick={() => {
              loadExceptions()
              loadStats(filters)
            }}
            className="btn btn-primary flex items-center gap-2"
          >
            <Search size={18} />
            查询
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">异常工单列表</h3>
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
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">升级级别</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">处理人</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">处理状态</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">闭环状态</th>
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
                        <span className={clsx('status-badge', formatEscalationLevel(item.escalationLevel).color)}>
                          {formatEscalationLevel(item.escalationLevel).label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <UserIcon size={14} className="text-gray-400" />
                          <span className="text-sm text-gray-600">
                            {item.assignee?.name || '未分配'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={clsx('status-badge', formatHandlingStatus(item.handlingStatus).color)}>
                          {formatHandlingStatus(item.handlingStatus).label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {item.isClosed ? (
                          <span className="status-badge bg-green-100 text-green-800 flex items-center gap-1">
                            <CheckCircle size={12} />
                            已闭环
                          </span>
                        ) : (
                          <span className="status-badge bg-yellow-100 text-yellow-800 flex items-center gap-1">
                            <Clock size={12} />
                            未闭环
                          </span>
                        )}
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

      {drawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={closeDetail} />
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">异常工单详情</h2>
                <button onClick={closeDetail} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X size={20} />
                </button>
              </div>

              {detailLoading ? (
                <div className="flex items-center justify-center h-64">加载中...</div>
              ) : detailData ? (
                <div className="space-y-6">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={clsx(
                          'w-12 h-12 rounded-lg flex items-center justify-center',
                          detailData.exception.isClosed ? 'bg-green-100' : 'bg-red-100'
                        )}>
                          {detailData.exception.isClosed ? (
                            <CheckCircle size={24} className="text-green-500" />
                          ) : (
                            <AlertTriangle size={24} className="text-red-500" />
                          )}
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
                      <div className="flex items-center gap-2">
                        {detailData.exception.isClosed ? (
                          <span className="status-badge bg-green-100 text-green-800">已闭环</span>
                        ) : (
                          <span className="status-badge bg-yellow-100 text-yellow-800">未闭环</span>
                        )}
                        <span className={clsx(
                          'status-badge',
                          formatHandlingStatus(detailData.exception.handlingStatus).color
                        )}>
                          {formatHandlingStatus(detailData.exception.handlingStatus).label}
                        </span>
                      </div>
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
                      <div>
                        <p className="text-xs text-gray-500 mb-1">订单号</p>
                        <p className="font-medium text-gray-800">{detailData.exception.order?.orderNo}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">升级级别</p>
                        <span className={clsx('status-badge', formatEscalationLevel(detailData.exception.escalationLevel).color)}>
                          {formatEscalationLevel(detailData.exception.escalationLevel).label}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">处理人</p>
                        <p className="font-medium text-gray-800">
                          {detailData.exception.assignee?.name || '未分配'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">订单状态</p>
                        {detailData.exception.order?.status && (
                          <span className={clsx('status-badge', formatOrderStatus(detailData.exception.order.status).color)}>
                            {formatOrderStatus(detailData.exception.order.status).label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!detailData.exception.isClosed && (
                    <div className="space-y-4">
                      <div className="card">
                        <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                          <UserPlus size={18} />
                          分配处理人
                        </h4>
                        <div className="flex gap-2">
                          <select
                            value={assignForm.assigneeId}
                            onChange={(e) => setAssignForm({ ...assignForm, assigneeId: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">请选择处理人</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name} ({formatUserRole(user.role).label})
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="备注（可选）"
                            value={assignForm.note}
                            onChange={(e) => setAssignForm({ ...assignForm, note: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={assignException}
                            disabled={processing || !assignForm.assigneeId}
                            className="btn btn-primary flex items-center gap-1"
                          >
                            <Send size={16} />
                            分配
                          </button>
                        </div>
                      </div>

                      <div className="card">
                        <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                          <ArrowUp size={18} />
                          升级级别
                        </h4>
                        <div className="flex gap-2">
                          <select
                            value={escalateForm.escalationLevel}
                            onChange={(e) => setEscalateForm({ ...escalateForm, escalationLevel: e.target.value as EscalationLevel })}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="level_1">一级（普通）</option>
                            <option value="level_2">二级（紧急）</option>
                            <option value="level_3">三级（严重）</option>
                          </select>
                          <input
                            type="text"
                            placeholder="升级原因（可选）"
                            value={escalateForm.note}
                            onChange={(e) => setEscalateForm({ ...escalateForm, note: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={escalateException}
                            disabled={processing}
                            className="btn btn-secondary flex items-center gap-1"
                          >
                            <ArrowUp size={16} />
                            升级
                          </button>
                        </div>
                      </div>

                      <div className="card">
                        <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                          <MessageSquare size={18} />
                          添加备注
                        </h4>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="输入备注内容..."
                            value={noteForm}
                            onChange={(e) => setNoteForm(e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={addNote}
                            disabled={processing || !noteForm.trim()}
                            className="btn btn-secondary flex items-center gap-1"
                          >
                            <Send size={16} />
                            发送
                          </button>
                        </div>
                      </div>

                      <div className="card">
                        <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                          <Check size={18} />
                          更新处理状态
                        </h4>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">处理状态</label>
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
                              <label className="block text-sm font-medium text-gray-700 mb-1">处理结果</label>
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
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">处理备注</label>
                            <textarea
                              value={handleForm.handlingNotes}
                              onChange={(e) =>
                                setHandleForm({
                                  ...handleForm,
                                  handlingNotes: e.target.value,
                                })
                              }
                              rows={2}
                              placeholder="请填写处理备注..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            />
                          </div>
                          <button
                            onClick={handleException}
                            disabled={processing || !handleForm.handlingNotes.trim()}
                            className="w-full btn btn-primary flex items-center justify-center gap-2"
                          >
                            <Send size={18} />
                            {processing ? '处理中...' : '提交处理'}
                          </button>
                        </div>
                      </div>

                      <div className="card">
                        <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                          <Lock size={18} />
                          关闭工单
                        </h4>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">最终处理结果</label>
                            <select
                              value={closeForm.handlingResult}
                              onChange={(e) =>
                                setCloseForm({
                                  ...closeForm,
                                  handlingResult: e.target.value as ExceptionHandlingResult,
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">关闭备注</label>
                            <textarea
                              value={closeForm.note}
                              onChange={(e) =>
                                setCloseForm({
                                  ...closeForm,
                                  note: e.target.value,
                                })
                              }
                              rows={2}
                              placeholder="请填写关闭备注..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            />
                          </div>
                          <button
                            onClick={closeException}
                            disabled={processing || !closeForm.note.trim()}
                            className="w-full btn bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
                          >
                            <Check size={18} />
                            {processing ? '关闭中...' : '关闭工单（闭环）'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {detailData.exception.isClosed && (
                    <div className="card">
                      <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                        <Unlock size={18} />
                        重新开启工单
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">重开原因</label>
                          <textarea
                            value={reopenForm.note}
                            onChange={(e) =>
                              setReopenForm({
                                ...reopenForm,
                                note: e.target.value,
                              })
                            }
                            rows={2}
                            placeholder="请填写重开原因..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          />
                        </div>
                        <button
                          onClick={reopenException}
                          disabled={processing || !reopenForm.note.trim()}
                          className="w-full btn bg-yellow-600 hover:bg-yellow-700 text-white flex items-center justify-center gap-2"
                        >
                          <RotateCcw size={18} />
                          {processing ? '重开中...' : '重新开启工单'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="card">
                    <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                      <History size={18} />
                      处理记录
                    </h4>
                    {detailData.exception.processingNotes && detailData.exception.processingNotes.length > 0 ? (
                      <div className="space-y-3">
                        {detailData.exception.processingNotes.map((note) => {
                          const actionInfo = formatActionType(note.actionType)
                          return (
                            <div key={note.id} className="p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className={clsx('status-badge text-xs', actionInfo.color)}>
                                    {actionInfo.label}
                                  </span>
                                  <span className="text-sm font-medium text-gray-800">
                                    {note.createdByName || '系统'}
                                  </span>
                                </div>
                                <span className="text-xs text-gray-400">
                                  {formatDateTime(note.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600">{note.note}</p>
                              {note.oldValue && note.newValue && (
                                <p className="text-xs text-gray-400 mt-1">
                                  {note.oldValue} → {note.newValue}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-500">暂无处理记录</div>
                    )}
                  </div>

                  <div className="card">
                    <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                      <Package size={18} />
                      订单信息
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">商品名称</span>
                        <span className="font-medium text-gray-800">{detailData.exception.order?.goodsName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">配送地址</span>
                        <span className="text-gray-600 text-right max-w-[60%]">{detailData.exception.order?.deliveryAddress}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">温区</span>
                        <span className={clsx('status-badge', formatTemperatureZone(detailData.exception.temperatureZone).color)}>
                          {formatTemperatureZone(detailData.exception.temperatureZone).label}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">温度要求</span>
                        <span className="text-gray-800">
                          {detailData.exception.order &&
                            `${formatTemperature(detailData.exception.order.minTemp)} ~ ${formatTemperature(detailData.exception.order.maxTemp)}`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">司机</span>
                        <span className="font-medium text-gray-800">{detailData.exception.driver?.name}</span>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                      <Clock size={18} />
                      配送节点
                    </h4>
                    <div className="space-y-2">
                      {detailData.nodes.map((node, index) => {
                        const statusInfo = formatNodeStatus(node.status)
                        const isException = node.status === 'exception'
                        return (
                          <div
                            key={node.id}
                            className={clsx(
                              'p-3 border rounded-lg',
                              isException
                                ? 'bg-red-50 border-red-200'
                                : 'bg-white border-gray-200'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div
                                  className={clsx(
                                    'w-6 h-6 rounded-full flex items-center justify-center',
                                    statusInfo.color
                                  )}
                                >
                                  {isException ? (
                                    <AlertTriangle size={12} className="text-white" />
                                  ) : node.status === 'completed' ? (
                                    <CheckCircle size={12} className="text-white" />
                                  ) : (
                                    <Clock size={12} className="text-white" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{node.nodeName}</p>
                                  <p className="text-xs text-gray-500">{node.locationText}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className={clsx('status-badge text-xs', statusInfo.color.replace('bg-', 'bg-opacity-20 text-').replace('500', '700'))}>
                                  {statusInfo.label}
                                </span>
                                <p className="text-xs text-gray-400 mt-1">
                                  {node.recordedAt ? formatDateTime(node.recordedAt) : '-'}
                                </p>
                              </div>
                            </div>
                            {node.temperature !== undefined && node.temperature !== null && (
                              <div className="mt-2 pt-2 border-t border-gray-100">
                                <div className="flex items-center gap-2 text-xs">
                                  <Thermometer size={12} className="text-gray-400" />
                                  <span className="text-gray-600">
                                    温度: {formatTemperature(node.temperature)}
                                  </span>
                                </div>
                              </div>
                            )}
                            {node.exceptionDescription && (
                              <div className="mt-2 pt-2 border-t border-gray-100">
                                <p className="text-xs text-red-600">
                                  <AlertTriangle size={12} className="inline mr-1" />
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
                    <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                      <Thermometer size={18} />
                      温度记录
                    </h4>
                    {detailData.temperatureRecords.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">时间</th>
                              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">节点</th>
                              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">温度</th>
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
                                  <td className="py-2 px-3 text-gray-800">
                                    {formatDateTime(record.recordedAt)}
                                  </td>
                                  <td className="py-2 px-3 text-gray-600">{record.nodeName}</td>
                                  <td className={clsx(
                                    'py-2 px-3 font-medium',
                                    isAbnormal ? 'text-red-500' : 'text-gray-800'
                                  )}>
                                    {formatTemperature(record.temperature)}
                                    {isAbnormal && <span className="text-xs ml-1">(异常)</span>}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-500 text-sm">暂无温度记录</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ExceptionHandling
