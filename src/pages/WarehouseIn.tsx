import { useState, useEffect } from 'react'
import {
  Package,
  Search,
  Filter,
  Thermometer,
  MapPin,
  User,
  Calendar,
  CheckCircle,
  X,
  ClipboardList,
  ArrowRight,
} from 'lucide-react'
import { api } from '@/utils/api'
import {
  formatDateTime,
  formatTemperatureZone,
  formatTemperatureRange,
  formatTemperature,
  formatWeight,
} from '@/utils/format'
import { useAuthStore } from '@/store/authStore'
import type {
  Order,
  Customer,
  TemperatureZone,
  WarehouseInRegisterRequest,
} from '@shared/types'
import clsx from 'clsx'

interface WarehouseInForm {
  orderId: string
  locationText: string
  temperature: number
  remarks: string
}

function WarehouseIn() {
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [form, setForm] = useState<WarehouseInForm>({
    orderId: '',
    locationText: '',
    temperature: 0,
    remarks: '',
  })
  const [filters, setFilters] = useState({
    orderNo: '',
    customerId: '',
    temperatureZone: '' as TemperatureZone | '',
  })
  const [stats, setStats] = useState({
    pendingCount: 0,
    warehousedCount: 0,
    todayWarehoused: 0,
  })
  const user = useAuthStore((state) => state.user)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (showModal && selectedOrder) {
      setForm({
        orderId: selectedOrder.id,
        locationText: '',
        temperature: (selectedOrder.minTemp + selectedOrder.maxTemp) / 2,
        remarks: '',
      })
    }
  }, [showModal, selectedOrder])

  async function loadData() {
    try {
      const [ordersData, customersData, statsData] = await Promise.all([
        api.get<Order[]>('/warehouse/pending-orders'),
        api.get<Customer[]>('/warehouse/customers'),
        api.get<{ pendingCount: number; warehousedCount: number; todayWarehoused: number }>('/warehouse/stats'),
      ])
      setOrders(ordersData)
      setCustomers(customersData)
      setStats(statsData)
    } catch (error) {
      console.error('Failed to load warehouse data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadFilteredOrders() {
    try {
      const params = new URLSearchParams()
      if (filters.orderNo) params.append('orderNo', filters.orderNo)
      if (filters.customerId) params.append('customerId', filters.customerId)
      if (filters.temperatureZone) params.append('temperatureZone', filters.temperatureZone)

      const url = `/warehouse/pending-orders${params.toString() ? `?${params.toString()}` : ''}`
      const ordersData = await api.get<Order[]>(url)
      setOrders(ordersData)
    } catch (error) {
      console.error('Failed to load filtered orders:', error)
    }
  }

  function handleFilterChange(key: keyof typeof filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function handleSearch() {
    loadFilteredOrders()
  }

  function handleReset() {
    setFilters({
      orderNo: '',
      customerId: '',
      temperatureZone: '',
    })
    loadData()
  }

  function openRegisterModal(order: Order) {
    setSelectedOrder(order)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setSelectedOrder(null)
  }

  async function handleRegister() {
    if (!form.locationText.trim()) {
      alert('请填写仓库位置')
      return
    }
    if (form.temperature === null || form.temperature === undefined) {
      alert('请填写实测温度')
      return
    }

    try {
      const request: WarehouseInRegisterRequest = {
        orderId: form.orderId,
        locationText: form.locationText.trim(),
        temperature: Number(form.temperature),
        remarks: form.remarks.trim() || undefined,
      }

      await api.post('/warehouse/register', request)
      alert('入仓登记成功！')
      closeModal()
      loadData()
    } catch (error) {
      console.error('Failed to register warehouse in:', error)
      alert(error instanceof Error ? error.message : '入仓登记失败')
    }
  }

  const filteredOrders = orders

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">入仓登记</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">待入仓订单</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{stats.pendingCount}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <ClipboardList size={24} className="text-yellow-600" />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">已入仓订单</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{stats.warehousedCount}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <CheckCircle size={24} className="text-blue-600" />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">今日入仓</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{stats.todayWarehoused}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <Calendar size={24} className="text-green-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} className="text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-800">筛选条件</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              订单号
            </label>
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={filters.orderNo}
                onChange={(e) => handleFilterChange('orderNo', e.target.value)}
                placeholder="请输入订单号"
                className="input-field pl-10"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              客户
            </label>
            <select
              value={filters.customerId}
              onChange={(e) => handleFilterChange('customerId', e.target.value)}
              className="input-field"
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              温区
            </label>
            <select
              value={filters.temperatureZone}
              onChange={(e) => handleFilterChange('temperatureZone', e.target.value as TemperatureZone | '')}
              className="input-field"
            >
              <option value="">全部温区</option>
              <option value="frozen">冷冻</option>
              <option value="chilled">冷藏</option>
              <option value="ambient">常温</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handleSearch}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <Search size={16} />
              查询
            </button>
            <button
              onClick={handleReset}
              className="btn-secondary flex-1"
            >
              重置
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">待入仓订单列表</h2>
        {filteredOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">订单号</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">客户</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">商品</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">温区</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">温度要求</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">数量/重量</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">创建时间</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const tempZoneInfo = formatTemperatureZone(order.temperatureZone)
                  return (
                    <tr
                      key={order.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-4 px-4">
                        <span className="font-medium text-gray-800">{order.orderNo}</span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <User size={14} className="text-gray-400" />
                          <span className="text-gray-700">{order.customer?.name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <Package size={14} className="text-gray-400" />
                          <span className="text-gray-700">{order.goodsName}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={clsx('status-badge', tempZoneInfo.color)}>
                          {tempZoneInfo.label}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-gray-700">
                          {formatTemperatureRange(order.minTemp, order.maxTemp)}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-gray-700">
                          {order.quantity} 件 / {formatWeight(order.weight)}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-gray-500 text-sm">
                          {formatDateTime(order.createdAt)}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <button
                          onClick={() => openRegisterModal(order)}
                          className="btn-primary btn-sm flex items-center gap-1"
                        >
                          <ArrowRight size={14} />
                          登记入仓
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Package size={48} className="mx-auto mb-4 text-gray-300" />
            <p>暂无待入仓的订单</p>
          </div>
        )}
      </div>

      {showModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 my-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-800">入仓登记</h3>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-blue-800 mb-3">订单信息</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-blue-600">订单号：</span>
                  <span className="text-blue-900 font-medium">{selectedOrder.orderNo}</span>
                </div>
                <div>
                  <span className="text-blue-600">客户：</span>
                  <span className="text-blue-900 font-medium">{selectedOrder.customer?.name}</span>
                </div>
                <div>
                  <span className="text-blue-600">商品：</span>
                  <span className="text-blue-900 font-medium">{selectedOrder.goodsName}</span>
                </div>
                <div>
                  <span className="text-blue-600">温区：</span>
                  <span className={clsx('status-badge text-xs', formatTemperatureZone(selectedOrder.temperatureZone).color)}>
                    {formatTemperatureZone(selectedOrder.temperatureZone).label}
                  </span>
                </div>
                <div>
                  <span className="text-blue-600">温度要求：</span>
                  <span className="text-blue-900 font-medium">
                    {formatTemperatureRange(selectedOrder.minTemp, selectedOrder.maxTemp)}
                  </span>
                </div>
                <div>
                  <span className="text-blue-600">数量/重量：</span>
                  <span className="text-blue-900 font-medium">
                    {selectedOrder.quantity} 件 / {formatWeight(selectedOrder.weight)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <MapPin size={14} className="inline mr-1" />
                  仓库位置 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.locationText}
                  onChange={(e) => setForm({ ...form, locationText: e.target.value })}
                  placeholder="请输入仓库位置，如：A区-03号货架"
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Thermometer size={14} className="inline mr-1" />
                  实测温度 (°C) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })}
                  placeholder="请输入实测温度"
                  className="input-field"
                />
                {selectedOrder && (
                  <p className="text-xs text-gray-500 mt-1">
                    温度范围：{formatTemperature(selectedOrder.minTemp)} ~ {formatTemperature(selectedOrder.maxTemp)}
                    {form.temperature !== null && form.temperature !== undefined && (
                      <span className={clsx(
                        'ml-2',
                        form.temperature >= selectedOrder.minTemp && form.temperature <= selectedOrder.maxTemp
                          ? 'text-green-600'
                          : 'text-red-600'
                      )}>
                        {form.temperature >= selectedOrder.minTemp && form.temperature <= selectedOrder.maxTemp
                          ? '✓ 温度正常'
                          : '⚠ 温度超出范围'}
                      </span>
                    )}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <ClipboardList size={14} className="inline mr-1" />
                  备注
                </label>
                <textarea
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  placeholder="请输入备注信息（可选）"
                  rows={3}
                  className="input-field resize-none"
                />
              </div>

              <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3">
                <User size={16} className="text-gray-500" />
                <span className="text-sm text-gray-600">
                  操作人：<span className="font-medium text-gray-800">{user?.name}</span>
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeModal}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleRegister}
                disabled={!form.locationText.trim()}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <CheckCircle size={16} />
                确认入仓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WarehouseIn
