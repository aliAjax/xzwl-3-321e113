import { useState, useEffect } from 'react'
import {
  Plus,
  Package,
  Truck,
  User,
  CheckCircle,
  Clock,
  Search,
  X,
  Send,
  Warehouse,
} from 'lucide-react'
import { api } from '@/utils/api'
import {
  formatDateTime,
  formatBatchStatus,
  formatWeight,
} from '@/utils/format'
import type {
  LoadingBatch,
  Order,
} from '@shared/types'
import clsx from 'clsx'

interface CreateBatchForm {
  vehicleId: string
  driverId: string
  routeId: string
  orderIds: string[]
}

function Loading() {
  const [batches, setBatches] = useState<LoadingBatch[]>([])
  const [availableOrders, setAvailableOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState<CreateBatchForm>({
    vehicleId: '',
    driverId: '',
    routeId: '',
    orderIds: [],
  })
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [batchesData, ordersData] = await Promise.all([
        api.get<LoadingBatch[]>('/loading/batches'),
        api.get<Order[]>('/orders?status=warehoused'),
      ])
      setBatches(batchesData)
      setAvailableOrders(ordersData)
    } catch (error) {
      console.error('Failed to load loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateBatch() {
    if (createForm.orderIds.length === 0) {
      alert('请选择要装车的订单')
      return
    }
    if (!createForm.vehicleId || !createForm.driverId || !createForm.routeId) {
      alert('请完善批次信息')
      return
    }

    try {
      await api.post('/loading/batches', createForm)
      setShowCreateModal(false)
      setCreateForm({
        vehicleId: '',
        driverId: '',
        routeId: '',
        orderIds: [],
      })
      loadData()
    } catch (error) {
      console.error('Failed to create batch:', error)
      alert(error instanceof Error ? error.message : '创建失败')
    }
  }

  async function handleConfirmBatch(batchId: string) {
    if (!confirm('确认该批次装车完成？')) return

    try {
      await api.post(`/loading/batches/${batchId}/confirm`)
      loadData()
    } catch (error) {
      console.error('Failed to confirm batch:', error)
      alert(error instanceof Error ? error.message : '确认失败')
    }
  }

  async function handleDepartBatch(batchId: string) {
    if (!confirm('确认该批次发车？')) return

    try {
      await api.post(`/loading/batches/${batchId}/depart`)
      loadData()
    } catch (error) {
      console.error('Failed to depart batch:', error)
      alert(error instanceof Error ? error.message : '发车失败')
    }
  }

  function toggleOrderSelection(orderId: string) {
    setCreateForm((prev) => ({
      ...prev,
      orderIds: prev.orderIds.includes(orderId)
        ? prev.orderIds.filter((id) => id !== orderId)
        : [...prev.orderIds, orderId],
    }))
  }

  const filteredOrders = availableOrders.filter(
    (order) =>
      order.orderNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.goodsName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedOrdersData = availableOrders.filter((o) =>
    createForm.orderIds.includes(o.id)
  )
  const totalWeight = selectedOrdersData.reduce((sum, o) => sum + o.weight, 0)

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">装车管理</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          创建装车批次
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {batches.length > 0 ? (
          batches.map((batch) => {
            const statusInfo = formatBatchStatus(batch.status)
            return (
              <div key={batch.id} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-800">{batch.batchNo}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      创建时间: {formatDateTime(batch.createdAt)}
                    </p>
                  </div>
                  <span className={clsx('status-badge', statusInfo.color)}>
                    {statusInfo.label}
                  </span>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-3 text-sm">
                    <Truck size={16} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-600">
                      {batch.vehicle?.plateNo} ({batch.vehicle?.vehicleType})
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <User size={16} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-600">{batch.driver?.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Package size={16} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-600">
                      {batch.orders?.length || 0} 个订单 · {formatWeight(totalWeight)}
                    </span>
                  </div>
                  {batch.departureTime && (
                    <div className="flex items-center gap-3 text-sm">
                      <Send size={16} className="text-gray-400 flex-shrink-0" />
                      <span className="text-gray-600">
                        发车时间: {formatDateTime(batch.departureTime)}
                      </span>
                    </div>
                  )}
                </div>

                {batch.orders && batch.orders.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">装车订单</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {batch.orders.map((order) => (
                        <div
                          key={order.id}
                          className="p-2 bg-gray-50 rounded-md text-sm flex items-center justify-between"
                        >
                          <span className="text-gray-800">{order.orderNo}</span>
                          <span className="text-gray-500">{formatWeight(order.weight)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  {batch.status === 'created' && (
                    <button
                      onClick={() => handleConfirmBatch(batch.id)}
                      className="flex-1 btn-success flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={16} />
                      确认装车
                    </button>
                  )}
                  {batch.status === 'loading' && (
                    <button
                      onClick={() => handleDepartBatch(batch.id)}
                      className="flex-1 btn-primary flex items-center justify-center gap-2"
                    >
                      <Send size={16} />
                      确认发车
                    </button>
                  )}
                  {batch.status === 'departed' && (
                    <div className="flex-1 text-center py-2 text-sm text-gray-500 flex items-center justify-center gap-2">
                      <Clock size={16} />
                      运输中...
                    </div>
                  )}
                  {batch.status === 'completed' && (
                    <div className="flex-1 text-center py-2 text-sm text-green-600 flex items-center justify-center gap-2">
                      <CheckCircle size={16} />
                      已完成
                    </div>
                  )}
                </div>
              </div>
            )
          })
        ) : (
          <div className="lg:col-span-3 card text-center py-12 text-gray-500">
            <Warehouse size={48} className="mx-auto mb-4 text-gray-300" />
            <p>暂无装车批次</p>
            <p className="text-sm mt-1">点击右上角按钮创建新的装车批次</p>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 max-w-4xl w-full mx-4 my-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-800">创建装车批次</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-gray-100 rounded-md"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-gray-800 mb-4">批次信息</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      车辆
                    </label>
                    <select
                      value={createForm.vehicleId}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, vehicleId: e.target.value })
                      }
                      className="input-field"
                    >
                      <option value="">请选择车辆</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      司机
                    </label>
                    <select
                      value={createForm.driverId}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, driverId: e.target.value })
                      }
                      className="input-field"
                    >
                      <option value="">请选择司机</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      线路
                    </label>
                    <select
                      value={createForm.routeId}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, routeId: e.target.value })
                      }
                      className="input-field"
                    >
                      <option value="">请选择线路</option>
                    </select>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      已选择 <strong>{createForm.orderIds.length}</strong> 个订单
                    </p>
                    <p className="text-sm text-blue-600 mt-1">
                      总重量: <strong>{formatWeight(totalWeight)}</strong>
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-800 mb-4">
                  选择订单
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    ({createForm.orderIds.length} 已选)
                  </span>
                </h4>

                <div className="relative mb-4">
                  <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索订单号或商品名称..."
                    className="input-field pl-10"
                  />
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {filteredOrders.length > 0 ? (
                    filteredOrders.map((order) => {
                      const isSelected = createForm.orderIds.includes(order.id)
                      return (
                        <div
                          key={order.id}
                          onClick={() => toggleOrderSelection(order.id)}
                          className={clsx(
                            'p-3 rounded-lg border-2 cursor-pointer transition-all',
                            isSelected
                              ? 'border-[#2563eb] bg-blue-50'
                              : 'border-gray-100 hover:border-gray-200 bg-white'
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
                                {isSelected && (
                                  <CheckCircle size={12} className="text-white" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">
                                  {order.orderNo}
                                </p>
                                <p className="text-sm text-gray-600">
                                  {order.goodsName} · {order.quantity}件
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  配送至: {order.deliveryAddress}
                                </p>
                              </div>
                            </div>
                            <span className="text-sm font-medium text-gray-600">
                              {formatWeight(order.weight)}
                            </span>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      {searchQuery ? '未找到匹配的订单' : '暂无待装车的订单'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleCreateBatch}
                disabled={createForm.orderIds.length === 0}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                创建批次
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Loading
