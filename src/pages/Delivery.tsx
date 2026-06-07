import { useState, useEffect } from 'react'
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
} from 'lucide-react'
import { api } from '@/utils/api'
import {
  formatDateTime,
  formatOrderStatus,
  formatTemperature,
  formatTemperatureZone,
} from '@/utils/format'
import type { DeliveryTask, NodeUpdateRequest } from '@shared/types'
import clsx from 'clsx'

interface NodeUpdateForm {
  taskId: string
  nodeId: string
  status: 'completed' | 'exception'
  locationText: string
  exceptionDescription: string
  temperature: string
}

function Delivery() {
  const [tasks, setTasks] = useState<DeliveryTask[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [updateForm, setUpdateForm] = useState<NodeUpdateForm | null>(null)

  useEffect(() => {
    loadTasks()
  }, [])

  async function loadTasks() {
    try {
      const data = await api.get<DeliveryTask[]>('/delivery/tasks/driver')
      setTasks(data)
    } catch (error) {
      console.error('Failed to load delivery tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  function openUpdateModal(task: DeliveryTask) {
    const currentNode = task.nodes?.find((n) => n.status === 'in_progress' || n.status === 'pending')
    if (!currentNode) return

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

  async function handleUpdateNode() {
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

      await api.patch(
        `/delivery/nodes/${updateForm.nodeId}`,
        request
      )

      setShowUpdateModal(false)
      setUpdateForm(null)
      loadTasks()
    } catch (error) {
      console.error('Failed to update node:', error)
      alert(error instanceof Error ? error.message : '更新失败')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  const activeTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
  const completedTasks = tasks.filter((t) => t.status === 'completed')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">配送执行</h1>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
            进行中: {activeTasks.length}
          </span>
          <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
            已完成: {completedTasks.length}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-800">进行中的任务</h2>
          {activeTasks.length > 0 ? (
            activeTasks.map((task) => {
              const statusInfo = formatOrderStatus(task.status)
              const tempZoneInfo = task.order ? formatTemperatureZone(task.order.temperatureZone) : null
              const currentNode = task.nodes?.find((n) => n.status === 'in_progress')
              const nextNode = task.nodes?.find((n) => n.status === 'pending')

              return (
                <div key={task.id} className="card">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-800">
                          {task.order?.orderNo}
                        </h3>
                        <span className={clsx('status-badge', statusInfo.color)}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {task.order?.goodsName}
                      </p>
                    </div>
                    {tempZoneInfo && (
                      <span className={clsx('status-badge', tempZoneInfo.color)}>
                        {tempZoneInfo.label}
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="flex items-start gap-3 text-sm">
                      <MapPin size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-600">
                        {task.order?.deliveryAddress}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Truck size={16} className="text-gray-400 flex-shrink-0" />
                      <span className="text-gray-600">
                        {task.vehicle?.plateNo} · {task.driver?.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Clock size={16} className="text-gray-400 flex-shrink-0" />
                      <span className="text-gray-600">
                        预计送达: {formatDateTime(task.order?.scheduledDeliveryTime || '')}
                      </span>
                    </div>
                  </div>

                  {task.nodes && task.nodes.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">配送节点</h4>
                      <div className="space-y-2">
                        {task.nodes.map((node) => {
                          const isActive = node.status === 'in_progress'
                          const isCompleted = node.status === 'completed'
                          const isException = node.status === 'exception'

                          return (
                            <div
                              key={node.id}
                              className={clsx(
                                'flex items-center gap-3 p-2 rounded-lg',
                                isActive && 'bg-blue-50 border border-blue-200',
                                isCompleted && 'bg-green-50',
                                isException && 'bg-red-50',
                                !isActive && !isCompleted && !isException && 'bg-gray-50'
                              )}
                            >
                              <div
                                className={clsx(
                                  'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                                  isActive && 'bg-blue-500',
                                  isCompleted && 'bg-green-500',
                                  isException && 'bg-red-500',
                                  !isActive && !isCompleted && !isException && 'bg-gray-300'
                                )}
                              >
                                {isCompleted ? (
                                  <CheckCircle size={12} className="text-white" />
                                ) : isException ? (
                                  <AlertCircle size={12} className="text-white" />
                                ) : (
                                  <span className="text-white text-xs font-medium">
                                    {task.nodes!.indexOf(node) + 1}
                                  </span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p
                                  className={clsx(
                                    'text-sm font-medium truncate',
                                    isActive && 'text-blue-800',
                                    isCompleted && 'text-green-800',
                                    isException && 'text-red-800',
                                    !isActive && !isCompleted && !isException && 'text-gray-600'
                                  )}
                                >
                                  {node.nodeName}
                                </p>
                                {node.recordedAt && (
                                  <p className="text-xs text-gray-500">
                                    {formatDateTime(node.recordedAt)}
                                  </p>
                                )}
                              </div>
                              {node.temperature !== undefined && node.temperature !== null && (
                                <span className="text-sm font-medium text-gray-600">
                                  {formatTemperature(node.temperature)}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {currentNode && (
                      <button
                        onClick={() => openUpdateModal(task)}
                        className="flex-1 btn-primary flex items-center justify-center gap-2"
                      >
                        <Send size={16} />
                        更新 {currentNode.nodeName}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="card text-center py-12 text-gray-500">暂无进行中的配送任务</div>
          )}
        </div>

        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-800">已完成的任务</h2>
          {completedTasks.length > 0 ? (
            completedTasks.slice(0, 10).map((task) => {
              const statusInfo = formatOrderStatus(task.status)
              return (
                <div key={task.id} className="card">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-gray-800">{task.order?.orderNo}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {task.order?.goodsName}
                      </p>
                    </div>
                    <span className={clsx('status-badge', statusInfo.color)}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    <p>完成时间: {formatDateTime(task.nodes?.slice(-1)[0]?.recordedAt || '')}</p>
                    <p className="mt-1">
                      {task.vehicle?.plateNo} · {task.driver?.name}
                    </p>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="card text-center py-12 text-gray-500">暂无已完成的配送任务</div>
          )}
        </div>
      </div>

      {showUpdateModal && updateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-800">更新节点状态</h3>
              <button
                onClick={() => {
                  setShowUpdateModal(false)
                  setUpdateForm(null)
                }}
                className="p-2 hover:bg-gray-100 rounded-md"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="completed"
                    checked={updateForm.status === 'completed'}
                    onChange={(e) =>
                      setUpdateForm({ ...updateForm, status: e.target.value as 'completed' })
                    }
                    className="w-4 h-4 text-green-600"
                  />
                  <span className="flex items-center gap-1 text-gray-700">
                    <CheckCircle size={16} className="text-green-500" />
                    正常完成
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="exception"
                    checked={updateForm.status === 'exception'}
                    onChange={(e) =>
                      setUpdateForm({ ...updateForm, status: e.target.value as 'exception' })
                    }
                    className="w-4 h-4 text-red-600"
                  />
                  <span className="flex items-center gap-1 text-gray-700">
                    <AlertCircle size={16} className="text-red-500" />
                    异常
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Map size={14} className="inline mr-1" />
                  位置信息 *
                </label>
                <input
                  type="text"
                  value={updateForm.locationText}
                  onChange={(e) =>
                    setUpdateForm({ ...updateForm, locationText: e.target.value })
                  }
                  placeholder="例如：北京市朝阳区xxx路xxx号"
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Thermometer size={14} className="inline mr-1" />
                  当前温度 (°C)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={updateForm.temperature}
                  onChange={(e) =>
                    setUpdateForm({ ...updateForm, temperature: e.target.value })
                  }
                  placeholder="例如：2.5"
                  className="input-field"
                />
              </div>

              {updateForm.status === 'exception' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <AlertCircle size={14} className="inline mr-1 text-red-500" />
                    异常说明 *
                  </label>
                  <textarea
                    value={updateForm.exceptionDescription}
                    onChange={(e) =>
                      setUpdateForm({ ...updateForm, exceptionDescription: e.target.value })
                    }
                    placeholder="请详细描述异常情况，例如：温度异常、交通延误、客户拒收等"
                    rows={3}
                    className="input-field"
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['温度异常', '交通延误', '客户拒收', '地址错误', '其他'].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() =>
                          setUpdateForm({ ...updateForm, exceptionDescription: type })
                        }
                        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowUpdateModal(false)
                  setUpdateForm(null)
                }}
                className="btn-secondary"
              >
                取消
              </button>
              <button onClick={handleUpdateNode} className="btn-primary">
                确认更新
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Delivery
