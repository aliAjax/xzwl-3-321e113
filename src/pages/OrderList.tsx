import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Filter, Eye, Calendar } from 'lucide-react'
import { api } from '@/utils/api'
import {
  formatDateTime,
  formatOrderStatus,
  formatTemperatureZone,
  formatWeight,
} from '@/utils/format'
import type { Order, OrderStatus } from '@shared/types'
import clsx from 'clsx'

function OrderList() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [dateFilter, setDateFilter] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    loadOrders()
  }, [])

  async function loadOrders() {
    try {
      const data = await api.get<Order[]>('/orders')
      setOrders(data)
    } catch (error) {
      console.error('Failed to load orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.orderNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.goodsName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.deliveryAddress.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = !statusFilter || order.status === statusFilter

    const matchesDate =
      !dateFilter || order.scheduledDeliveryTime.startsWith(dateFilter)

    return matchesSearch && matchesStatus && matchesDate
  })

  const statusOptions: { value: OrderStatus | ''; label: string }[] = [
    { value: '', label: '全部状态' },
    { value: 'created', label: '已创建' },
    { value: 'warehoused', label: '已入仓' },
    { value: 'loading', label: '装车中' },
    { value: 'in_transit', label: '运输中' },
    { value: 'delivered', label: '已送达' },
    { value: 'completed', label: '已完成' },
    { value: 'cancelled', label: '已取消' },
  ]

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800">订单管理</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => {}}>
          <Plus size={18} />
          新建订单
        </button>
      </div>

      <div className="card">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索订单号、商品名称、配送地址..."
              className="input-field pl-10"
            />
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <Calendar size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="input-field pl-10"
              />
            </div>
            <div className="relative">
              <Filter size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as OrderStatus | '')}
                className="input-field pl-10 pr-8 appearance-none bg-white"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="table-header">订单号</th>
                <th className="table-header">客户</th>
                <th className="table-header">商品</th>
                <th className="table-header">温区</th>
                <th className="table-header">重量</th>
                <th className="table-header">配送地址</th>
                <th className="table-header">预计送达</th>
                <th className="table-header">状态</th>
                <th className="table-header">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => {
                  const statusInfo = formatOrderStatus(order.status)
                  const tempZoneInfo = formatTemperatureZone(order.temperatureZone)
                  return (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium text-[#2563eb]">
                        {order.orderNo}
                      </td>
                      <td className="table-cell">{order.customer?.name}</td>
                      <td className="table-cell">{order.goodsName}</td>
                      <td className="table-cell">
                        <span className={clsx('status-badge', tempZoneInfo.color)}>
                          {tempZoneInfo.label}
                        </span>
                      </td>
                      <td className="table-cell">{formatWeight(order.weight)}</td>
                      <td className="table-cell max-w-[200px] truncate">
                        {order.deliveryAddress}
                      </td>
                      <td className="table-cell">
                        {formatDateTime(order.scheduledDeliveryTime)}
                      </td>
                      <td className="table-cell">
                        <span className={clsx('status-badge', statusInfo.color)}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="table-cell">
                        <button
                          onClick={() => navigate(`/orders/${order.id}`)}
                          className="p-2 text-[#2563eb] hover:bg-blue-50 rounded-md transition-colors"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-500">
                    暂无订单数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default OrderList
