import { useState, useEffect, useCallback } from 'react'
import {
  MapPin,
  Package,
  Truck,
  Clock,
  CheckCircle,
  AlertCircle,
  Thermometer,
  Map,
  Send,
  X,
  Phone,
  Copy,
  Check,
  LogOut,
  RefreshCw,
  ChevronRight,
  PackageCheck,
  Navigation,
  Home,
  CheckCheck,
  User,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/utils/api'
import {
  formatDateTime,
  formatOrderStatus,
  formatTemperature,
  formatTemperatureZone,
} from '@/utils/format'
import { useAuthStore } from '@/store/authStore'
import type { DeliveryTask, DeliveryNode, NodeUpdateRequest, NodeType } from '@shared/types'
import clsx from 'clsx'

interface NodeUpdateForm {
  taskId: string
  nodeId: string
  status: 'completed' | 'exception'
  locationText: string
  exceptionDescription: string
  temperature: string
}

const DRIVER_NODE_TYPES: NodeType[] = ['loading', 'departure', 'arrival', 'delivery', 'signature']

const NODE_LABELS: Record<NodeType, { label: string; shortLabel: string }> = {
  warehouse_in: { label: '入库', shortLabel: '入库' },
  loading: { label: '装车', shortLabel: '装车' },
  departure: { label: '出发', shortLabel: '出发' },
  arrival: { label: '到达', shortLabel: '到达' },
  delivery: { label: '配送', shortLabel: '配送' },
  signature: { label: '签收', shortLabel: '签收' },
}

function DriverMobile() {
  const [tasks, setTasks] = useState<DeliveryTask[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [updateForm, setUpdateForm] = useState<NodeUpdateForm | null>(null)
  const [selectedTask, setSelectedTask] = useState<DeliveryTask | null>(null)
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active')
  const [copiedAddressId, setCopiedAddressId] = useState<string | null>(null)

  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()

  const loadTasks = useCallback(async () => {
    try {
      const data = await api.get<DeliveryTask[]>('/delivery/tasks/driver')
      setTasks(data)
    } catch (error) {
      console.error('Failed to load delivery tasks:', error)
      alert('加载任务失败，请下拉刷新重试')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const handleRefresh = () => {
    setRefreshing(true)
    loadTasks()
  }

  const handleLogout = () => {
    if (confirm('确定要退出登录吗？')) {
      logout()
      navigate('/login')
    }
  }

  const getDriverNodes = (task: DeliveryTask): DeliveryNode[] => {
    if (!task.nodes) return []
    return task.nodes
      .filter((n) => DRIVER_NODE_TYPES.includes(n.nodeType))
      .sort((a, b) => DRIVER_NODE_TYPES.indexOf(a.nodeType) - DRIVER_NODE_TYPES.indexOf(b.nodeType))
  }

  const getCurrentNode = (task: DeliveryTask): DeliveryNode | undefined => {
    const nodes = getDriverNodes(task)
    return nodes.find((n) => n.status === 'in_progress') || nodes.find((n) => n.status === 'pending')
  }

  const getNextNode = (task: DeliveryTask): DeliveryNode | undefined => {
    const nodes = getDriverNodes(task)
    const currentIndex = nodes.findIndex((n) => n.status === 'in_progress' || n.status === 'pending')
    if (currentIndex >= 0) return nodes[currentIndex]
    return undefined
  }

  const getNodeProgress = (task: DeliveryTask): { completed: number; total: number } => {
    const nodes = getDriverNodes(task)
    const completed = nodes.filter((n) => n.status === 'completed' || n.status === 'exception').length
    return { completed, total: nodes.length }
  }

  const openUpdateModal = async (task: DeliveryTask) => {
    const currentNode = getCurrentNode(task)
    if (!currentNode) return

    if (currentNode.status === 'pending') {
      try {
        await api.post(`/delivery/nodes/${currentNode.id}/start`)
        await loadTasks()
        const refreshedTask = tasks.find((t) => t.id === task.id)
        if (refreshedTask) {
          const updatedNode = getCurrentNode(refreshedTask)
          if (updatedNode) {
            setUpdateForm({
              taskId: task.id,
              nodeId: updatedNode.id,
              status: 'completed',
              locationText: '',
              exceptionDescription: '',
              temperature: '',
            })
            setShowUpdateModal(true)
            return
          }
        }
      } catch (error) {
        console.error('Failed to start node:', error)
        alert(error instanceof Error ? error.message : '开始节点失败')
        return
      }
    }

    setUpdateForm({
      taskId: task.id,
      nodeId: currentNode.id,
      status: 'completed',
      locationText: '',
      exceptionDescription: '',
      temperature: '',
    })
    setShowUpdateModal(true)
  }

  const handleUpdateNode = async () => {
    if (!updateForm) return

    if (!updateForm.locationText.trim()) {
      alert('请输入位置信息')
      return
    }

    if (updateForm.status === 'exception' && !updateForm.exceptionDescription.trim()) {
      alert('请输入异常说明')
      return
    }

    try {
      const request: NodeUpdateRequest = {
        status: updateForm.status,
        locationText: updateForm.locationText,
        exceptionDescription: updateForm.status === 'exception' ? updateForm.exceptionDescription : undefined,
        temperature: updateForm.temperature ? parseFloat(updateForm.temperature) : undefined,
      }

      await api.patch(`/delivery/nodes/${updateForm.nodeId}`, request)

      setShowUpdateModal(false)
      setUpdateForm(null)
      setSelectedTask(null)
      loadTasks()
    } catch (error) {
      console.error('Failed to update node:', error)
      alert(error instanceof Error ? error.message : '更新失败')
    }
  }

  const getLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords
            const response = await fetch(
              `https://api.map.baidu.com/geocoder?location=${latitude},${longitude}&output=json&ak=YOUR_AK`
            )
            if (response.ok) {
              const data = await response.json()
              if (data.result?.formatted_address) {
                setUpdateForm((prev) => prev ? { ...prev, locationText: data.result.formatted_address } : null)
              } else {
                setUpdateForm((prev) => prev ? { ...prev, locationText: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` } : null)
              }
            }
          } catch {
            setUpdateForm((prev) => {
              if (!prev) return null
              const { latitude, longitude } = position.coords
              return { ...prev, locationText: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` }
            })
          }
        },
        (error) => {
          console.warn('Geolocation error:', error)
          alert('获取位置失败，请手动输入位置信息')
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    } else {
      alert('您的浏览器不支持定位功能，请手动输入位置信息')
    }
  }

  const handleCallPhone = (phone: string) => {
    if (!phone) {
      alert('电话号码不存在')
      return
    }
    window.location.href = `tel:${phone}`
  }

  const handleCopyAddress = async (taskId: string, address: string) => {
    if (!address) {
      alert('地址不存在')
      return
    }
    try {
      await navigator.clipboard.writeText(address)
      setCopiedAddressId(taskId)
      setTimeout(() => setCopiedAddressId(null), 2000)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = address
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopiedAddressId(taskId)
      setTimeout(() => setCopiedAddressId(null), 2000)
    }
  }

  const getNextStepHint = (node: DeliveryNode | undefined): string => {
    if (!node) return ''
    const hints: Record<NodeType, string> = {
      warehouse_in: '请前往仓库完成货物入库',
      loading: '请在仓库完成货物装车，检查数量和温度',
      departure: '请确认车辆状态，开始运输',
      arrival: '请前往配送地址，到达后确认位置',
      delivery: '请联系客户进行配送，测量并记录温度',
      signature: '请让客户签收确认，完成配送',
    }
    return hints[node.nodeType] || `请完成${NODE_LABELS[node.nodeType]?.label || node.nodeName}操作`
  }

  const activeTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
  const completedTasks = tasks.filter((t) => t.status === 'completed')

  const stats = {
    active: activeTasks.length,
    completed: completedTasks.length,
    inProgress: activeTasks.filter((t) => t.status === 'in_transit').length,
    pending: activeTasks.filter((t) => ['created', 'warehoused', 'loading'].includes(t.status)).length,
  }

  const renderTaskCard = (task: DeliveryTask, isActive: boolean) => {
    const statusInfo = formatOrderStatus(task.status)
    const tempZoneInfo = task.order ? formatTemperatureZone(task.order.temperatureZone) : null
    const currentNode = getCurrentNode(task)
    const progress = getNodeProgress(task)
    const nodes = getDriverNodes(task)

    return (
      <div
        key={task.id}
        className={clsx(
          'bg-white rounded-xl shadow-sm border border-gray-100 mb-4 overflow-hidden',
          selectedTask?.id === task.id && 'ring-2 ring-blue-500'
        )}
      >
        <div
          className="p-4 cursor-pointer"
          onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base font-semibold text-gray-800 truncate">
                  {task.order?.orderNo}
                </span>
                <span className={clsx('status-badge text-xs', statusInfo.color)}>
                  {statusInfo.label}
                </span>
              </div>
              <p className="text-sm text-gray-600 truncate">{task.order?.goodsName}</p>
            </div>
            <div className="flex items-center gap-2">
              {tempZoneInfo && (
                <span className={clsx('status-badge text-xs', tempZoneInfo.color)}>
                  {tempZoneInfo.label}
                </span>
              )}
              <ChevronRight
                size={20}
                className={clsx(
                  'text-gray-400 transition-transform flex-shrink-0',
                  selectedTask?.id === task.id && 'rotate-90'
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <MapPin size={14} className="text-gray-400 flex-shrink-0" />
              <span className="text-gray-600 truncate">{task.order?.deliveryAddress}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Package size={14} className="text-gray-400 flex-shrink-0" />
              <span className="text-gray-600">
                {task.order?.quantity}件 · {task.order?.weight}kg
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock size={14} className="text-gray-400 flex-shrink-0" />
              <span className="text-gray-600">
                预计: {formatDateTime(task.order?.scheduledDeliveryTime || '')}
              </span>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>进度 {progress.completed}/{progress.total}</span>
              {currentNode && (
                <span className="text-blue-600 font-medium">
                  下一步: {NODE_LABELS[currentNode.nodeType]?.label || currentNode.nodeName}
                </span>
              )}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {selectedTask?.id === task.id && (
          <div className="border-t border-gray-100 bg-gray-50">
            <div className="p-4 space-y-4">
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <User size={16} className="text-blue-500" />
                  客户信息
                </h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <User size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">联系人</p>
                      <p className="text-sm text-gray-800 font-medium">
                        {task.order?.customer?.contactName || task.order?.customer?.name || '暂无联系人信息'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Phone size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">联系电话</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-800 font-medium">
                          {task.order?.customer?.phone || '暂无电话信息'}
                        </p>
                        {task.order?.customer?.phone && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCallPhone(task.order!.customer!.phone)
                            }}
                            className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-600 rounded-md text-xs font-medium hover:bg-green-100 transition-colors"
                          >
                            <Phone size={12} />
                            拨号
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">配送地址</p>
                      <div className="flex items-start gap-2">
                        <p className="text-sm text-gray-800 flex-1">
                          {task.order?.deliveryAddress || '暂无地址信息'}
                        </p>
                        {task.order?.deliveryAddress && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCopyAddress(task.id, task.order!.deliveryAddress)
                            }}
                            className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded-md text-xs font-medium hover:bg-blue-100 transition-colors flex-shrink-0"
                          >
                            {copiedAddressId === task.id ? (
                              <>
                                <Check size={12} />
                                已复制
                              </>
                            ) : (
                              <>
                                <Copy size={12} />
                                复制
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {currentNode && (
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <h4 className="text-sm font-medium text-blue-700 mb-1 flex items-center gap-2">
                    <Navigation size={16} />
                    下一步操作提示
                  </h4>
                  <p className="text-sm text-blue-600">
                    {getNextStepHint(currentNode)}
                  </p>
                </div>
              )}

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">配送节点</h4>
              <div className="space-y-1">
                {nodes.map((node, index) => {
                  const isActive = node.status === 'in_progress'
                  const isCompleted = node.status === 'completed'
                  const isException = node.status === 'exception'
                  const isPending = node.status === 'pending'

                  return (
                    <div key={node.id} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={clsx(
                            'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10',
                            isActive && 'bg-blue-500 ring-4 ring-blue-100',
                            isCompleted && 'bg-green-500',
                            isException && 'bg-red-500',
                            isPending && 'bg-gray-300'
                          )}
                        >
                          {isCompleted ? (
                            <CheckCircle size={14} className="text-white" />
                          ) : isException ? (
                            <AlertCircle size={14} className="text-white" />
                          ) : (
                            <span className="text-white text-xs font-medium">
                              {index + 1}
                            </span>
                          )}
                        </div>
                        {index < nodes.length - 1 && (
                          <div
                            className={clsx(
                              'w-0.5 flex-1 min-h-6',
                              isCompleted || isException ? 'bg-green-400' : 'bg-gray-200'
                            )}
                          />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <p
                          className={clsx(
                            'text-sm font-medium',
                            isActive && 'text-blue-700',
                            isCompleted && 'text-green-700',
                            isException && 'text-red-700',
                            isPending && 'text-gray-500'
                          )}
                        >
                          {NODE_LABELS[node.nodeType]?.label || node.nodeName}
                        </p>
                        {node.recordedAt && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {formatDateTime(node.recordedAt)}
                          </p>
                        )}
                        {node.locationText && (
                          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <Map size={10} />
                            {node.locationText}
                          </p>
                        )}
                        {node.temperature !== undefined && node.temperature !== null && (
                          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <Thermometer size={10} />
                            {formatTemperature(node.temperature)}
                          </p>
                        )}
                        {node.exceptionDescription && (
                          <p className="text-xs text-red-600 mt-0.5 flex items-center gap-1">
                            <AlertCircle size={10} />
                            {node.exceptionDescription}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {isActive && currentNode && (
              <div className="p-4 pt-0">
                <button
                  onClick={() => openUpdateModal(task)}
                  className="w-full btn-primary py-3 text-base font-medium flex items-center justify-center gap-2"
                >
                  <Send size={18} />
                  {currentNode.status === 'pending' ? (
                    <>开始 {NODE_LABELS[currentNode.nodeType]?.label || currentNode.nodeName}</>
                  ) : (
                    <>更新 {NODE_LABELS[currentNode.nodeType]?.label || currentNode.nodeName}</>
                  )}
                </button>
              </div>
            )}
          </div>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw size={32} className="text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto">
      <header className="bg-gradient-to-r from-[#1e3a5f] to-[#2563eb] text-white sticky top-0 z-40 shadow-lg">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Truck size={20} />
              </div>
              <div>
                <h1 className="text-lg font-bold">司机任务台</h1>
                <p className="text-xs text-blue-100">{user?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <RefreshCw size={20} className={clsx(refreshing && 'animate-spin')} />
              </button>
              <button
                onClick={handleLogout}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-4">
            <div className="bg-white/15 rounded-lg p-2 text-center">
              <p className="text-2xl font-bold">{stats.active}</p>
              <p className="text-xs text-blue-100">进行中</p>
            </div>
            <div className="bg-white/15 rounded-lg p-2 text-center">
              <p className="text-2xl font-bold">{stats.pending}</p>
              <p className="text-xs text-blue-100">待执行</p>
            </div>
            <div className="bg-white/15 rounded-lg p-2 text-center">
              <p className="text-2xl font-bold">{stats.inProgress}</p>
              <p className="text-xs text-blue-100">运输中</p>
            </div>
            <div className="bg-white/15 rounded-lg p-2 text-center">
              <p className="text-2xl font-bold">{stats.completed}</p>
              <p className="text-xs text-blue-100">已完成</p>
            </div>
          </div>
        </div>

        <div className="flex bg-white/10">
          <button
            onClick={() => setActiveTab('active')}
            className={clsx(
              'flex-1 py-3 text-sm font-medium transition-colors',
              activeTab === 'active'
                ? 'text-white border-b-2 border-white'
                : 'text-blue-200'
            )}
          >
            <div className="flex items-center justify-center gap-1">
              <Navigation size={16} />
              进行中 ({activeTasks.length})
            </div>
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={clsx(
              'flex-1 py-3 text-sm font-medium transition-colors',
              activeTab === 'completed'
                ? 'text-white border-b-2 border-white'
                : 'text-blue-200'
            )}
          >
            <div className="flex items-center justify-center gap-1">
              <CheckCheck size={16} />
              已完成 ({completedTasks.length})
            </div>
          </button>
        </div>
      </header>

      <main className="p-4 pb-20">
        {activeTab === 'active' ? (
          activeTasks.length > 0 ? (
            activeTasks.map((task) => renderTaskCard(task, true))
          ) : (
            <div className="text-center py-16">
              <Home size={48} className="text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">暂无进行中的配送任务</p>
              <p className="text-gray-400 text-sm mt-1">下拉刷新获取最新任务</p>
            </div>
          )
        ) : (
          completedTasks.length > 0 ? (
            completedTasks.map((task) => renderTaskCard(task, false))
          ) : (
            <div className="text-center py-16">
              <PackageCheck size={48} className="text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">暂无已完成的配送任务</p>
            </div>
          )
        )}
      </main>

      {showUpdateModal && updateForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                更新{updateForm.status === 'exception' ? '异常' : '节点'}状态
              </h3>
              <button
                onClick={() => {
                  setShowUpdateModal(false)
                  setUpdateForm(null)
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-5">
              <div className="flex gap-3">
                <label
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all',
                    updateForm.status === 'completed'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <input
                    type="radio"
                    name="status"
                    value="completed"
                    checked={updateForm.status === 'completed'}
                    onChange={(e) =>
                      setUpdateForm({ ...updateForm, status: e.target.value as 'completed' })
                    }
                    className="sr-only"
                  />
                  <CheckCircle size={20} />
                  <span className="font-medium">正常完成</span>
                </label>
                <label
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all',
                    updateForm.status === 'exception'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <input
                    type="radio"
                    name="status"
                    value="exception"
                    checked={updateForm.status === 'exception'}
                    onChange={(e) =>
                      setUpdateForm({ ...updateForm, status: e.target.value as 'exception' })
                    }
                    className="sr-only"
                  />
                  <AlertCircle size={20} />
                  <span className="font-medium">异常</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  位置信息 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Map size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={updateForm.locationText}
                    onChange={(e) =>
                      setUpdateForm({ ...updateForm, locationText: e.target.value })
                    }
                    placeholder="请输入或获取当前位置"
                    className="input-field pl-10 pr-20"
                  />
                  <button
                    type="button"
                    onClick={getLocation}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
                  >
                    定位
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  当前温度 (°C)
                </label>
                <div className="relative">
                  <Thermometer size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    step="0.1"
                    value={updateForm.temperature}
                    onChange={(e) =>
                      setUpdateForm({ ...updateForm, temperature: e.target.value })
                    }
                    placeholder="例如：2.5"
                    className="input-field pl-10"
                  />
                </div>
              </div>

              {updateForm.status === 'exception' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    异常说明 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <AlertCircle size={18} className="absolute left-3 top-3 text-red-500" />
                    <textarea
                      value={updateForm.exceptionDescription}
                      onChange={(e) =>
                        setUpdateForm({ ...updateForm, exceptionDescription: e.target.value })
                      }
                      placeholder="请详细描述异常情况"
                      rows={3}
                      className="input-field pl-10"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {['温度异常', '交通延误', '客户拒收', '地址错误', '车辆故障', '其他'].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() =>
                          setUpdateForm({ ...updateForm, exceptionDescription: type })
                        }
                        className={clsx(
                          'px-3 py-1.5 text-sm rounded-full transition-colors',
                          updateForm.exceptionDescription === type
                            ? 'bg-red-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        )}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowUpdateModal(false)
                    setUpdateForm(null)
                  }}
                  className="flex-1 btn-secondary py-3"
                >
                  取消
                </button>
                <button
                  onClick={handleUpdateNode}
                  className={clsx(
                    'flex-1 py-3 font-medium rounded-md transition-colors',
                    updateForm.status === 'exception'
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'btn-primary'
                  )}
                >
                  确认提交
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}

export default DriverMobile
