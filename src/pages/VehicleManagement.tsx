import { useState, useEffect } from 'react'
import { Plus, Search, Filter, Edit2, Trash2, X, Truck } from 'lucide-react'
import { api } from '@/utils/api'
import { formatDateTime, formatTemperatureZone, formatWeight } from '@/utils/format'
import type { Vehicle, TemperatureZone } from '@shared/types'
import clsx from 'clsx'

type VehicleStatus = 'active' | 'maintenance' | 'disabled'

interface VehicleFormData {
  plateNo: string
  vehicleType: string
  temperatureZones: TemperatureZone[]
  capacity: number
  availableStartTime: string
  availableEndTime: string
  status: VehicleStatus
}

const initialFormData: VehicleFormData = {
  plateNo: '',
  vehicleType: '',
  temperatureZones: [],
  capacity: 0,
  availableStartTime: '08:00',
  availableEndTime: '20:00',
  status: 'active',
}

const statusMap: Record<VehicleStatus, { label: string; color: string }> = {
  active: { label: '正常', color: 'bg-green-100 text-green-800' },
  maintenance: { label: '维护中', color: 'bg-yellow-100 text-yellow-800' },
  disabled: { label: '停用', color: 'bg-gray-100 text-gray-800' },
}

const vehicleTypeOptions = [
  { value: '冷藏车', label: '冷藏车' },
  { value: '冷冻车', label: '冷冻车' },
  { value: '保温车', label: '保温车' },
  { value: '普通货车', label: '普通货车' },
]

const temperatureZoneOptions: { value: TemperatureZone; label: string }[] = [
  { value: 'frozen', label: '冷冻' },
  { value: 'chilled', label: '冷藏' },
  { value: 'ambient', label: '常温' },
]

function VehicleManagement() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | ''>('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [formData, setFormData] = useState<VehicleFormData>(initialFormData)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; vehicle: Vehicle | null }>({
    open: false,
    vehicle: null,
  })

  useEffect(() => {
    loadVehicles()
  }, [])

  async function loadVehicles() {
    try {
      const data = await api.get<Vehicle[]>('/vehicles')
      setVehicles(data)
    } catch (error) {
      console.error('Failed to load vehicles:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredVehicles = vehicles.filter((vehicle) => {
    const matchesSearch =
      vehicle.plateNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.vehicleType.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = !statusFilter || vehicle.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const statusOptions: { value: VehicleStatus | ''; label: string }[] = [
    { value: '', label: '全部状态' },
    { value: 'active', label: '正常' },
    { value: 'maintenance', label: '维护中' },
    { value: 'disabled', label: '停用' },
  ]

  function openCreateModal() {
    setEditingVehicle(null)
    setFormData(initialFormData)
    setIsModalOpen(true)
  }

  function openEditModal(vehicle: Vehicle) {
    setEditingVehicle(vehicle)
    setFormData({
      plateNo: vehicle.plateNo,
      vehicleType: vehicle.vehicleType,
      temperatureZones: vehicle.temperatureZones,
      capacity: vehicle.capacity,
      availableStartTime: vehicle.availableStartTime,
      availableEndTime: vehicle.availableEndTime,
      status: vehicle.status as VehicleStatus,
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingVehicle(null)
    setFormData(initialFormData)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      if (editingVehicle) {
        await api.put(`/vehicles/${editingVehicle.id}`, formData)
      } else {
        await api.post('/vehicles', formData)
      }
      closeModal()
      loadVehicles()
    } catch (error) {
      console.error('Failed to save vehicle:', error)
      alert('保存失败，请重试')
    }
  }

  function handleDelete(vehicle: Vehicle) {
    setDeleteConfirm({ open: true, vehicle })
  }

  async function confirmDelete() {
    if (!deleteConfirm.vehicle) return
    try {
      await api.delete(`/vehicles/${deleteConfirm.vehicle.id}`)
      setDeleteConfirm({ open: false, vehicle: null })
      loadVehicles()
    } catch (error) {
      console.error('Failed to delete vehicle:', error)
      alert('删除失败，请重试')
    }
  }

  function handleTemperatureZoneChange(zone: TemperatureZone, checked: boolean) {
    if (checked) {
      setFormData({ ...formData, temperatureZones: [...formData.temperatureZones, zone] })
    } else {
      setFormData({
        ...formData,
        temperatureZones: formData.temperatureZones.filter((z) => z !== zone),
      })
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800">车辆管理</h1>
        <button className="btn-primary flex items-center gap-2" onClick={openCreateModal}>
          <Plus size={18} />
          新建车辆
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
              placeholder="搜索车牌号、车型..."
              className="input-field pl-10"
            />
          </div>
          <div className="relative">
            <Filter size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as VehicleStatus | '')}
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

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="table-header">车牌号</th>
                <th className="table-header">车型</th>
                <th className="table-header">温区</th>
                <th className="table-header">载重</th>
                <th className="table-header">可用时间</th>
                <th className="table-header">状态</th>
                <th className="table-header">创建时间</th>
                <th className="table-header">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredVehicles.length > 0 ? (
                filteredVehicles.map((vehicle) => {
                  const statusInfo = statusMap[vehicle.status as VehicleStatus]
                  return (
                    <tr key={vehicle.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium">
                        <div className="flex items-center gap-2">
                          <Truck size={16} className="text-gray-400" />
                          {vehicle.plateNo}
                        </div>
                      </td>
                      <td className="table-cell">{vehicle.vehicleType}</td>
                      <td className="table-cell">
                        <div className="flex flex-wrap gap-1">
                          {vehicle.temperatureZones.map((zone) => {
                            const zoneInfo = formatTemperatureZone(zone)
                            return (
                              <span key={zone} className={clsx('status-badge', zoneInfo.color)}>
                                {zoneInfo.label}
                              </span>
                            )
                          })}
                        </div>
                      </td>
                      <td className="table-cell">{formatWeight(vehicle.capacity)}</td>
                      <td className="table-cell">
                        {vehicle.availableStartTime} - {vehicle.availableEndTime}
                      </td>
                      <td className="table-cell">
                        <span className={clsx('status-badge', statusInfo.color)}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="table-cell">{formatDateTime(vehicle.createdAt)}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(vehicle)}
                            className="p-2 text-[#2563eb] hover:bg-blue-50 rounded-md transition-colors"
                            title="编辑"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(vehicle)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="删除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-500">
                    暂无车辆数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-800">
                {editingVehicle ? '编辑车辆' : '新建车辆'}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">车牌号 *</label>
                <input
                  type="text"
                  value={formData.plateNo}
                  onChange={(e) => setFormData({ ...formData, plateNo: e.target.value })}
                  placeholder="请输入车牌号"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">车型 *</label>
                <select
                  value={formData.vehicleType}
                  onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
                  className="input-field"
                  required
                >
                  <option value="">请选择车型</option>
                  {vehicleTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">载重 (kg) *</label>
                <input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                  placeholder="请输入载重"
                  className="input-field"
                  min="0"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">温控区域 *</label>
                <div className="flex flex-wrap gap-4">
                  {temperatureZoneOptions.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.temperatureZones.includes(option.value)}
                        onChange={(e) => handleTemperatureZoneChange(option.value, e.target.checked)}
                        className="w-4 h-4 text-[#2563eb] rounded focus:ring-[#2563eb]"
                      />
                      <span className="text-sm text-gray-700">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">可用开始时间 *</label>
                  <input
                    type="time"
                    value={formData.availableStartTime}
                    onChange={(e) => setFormData({ ...formData, availableStartTime: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">可用结束时间 *</label>
                  <input
                    type="time"
                    value={formData.availableEndTime}
                    onChange={(e) => setFormData({ ...formData, availableEndTime: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">状态 *</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as VehicleStatus })}
                  className="input-field"
                  required
                >
                  {statusOptions
                    .filter((o) => o.value !== '')
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={closeModal} className="btn-secondary">
                  取消
                </button>
                <button type="submit" className="btn-primary">
                  {editingVehicle ? '保存修改' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm.open && deleteConfirm.vehicle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">确认删除</h2>
            <p className="text-gray-600 mb-6">
              确定要删除车辆 <span className="font-medium">{deleteConfirm.vehicle.plateNo}</span> 吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm({ open: false, vehicle: null })}
                className="btn-secondary"
              >
                取消
              </button>
              <button onClick={confirmDelete} className="btn-danger">
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VehicleManagement
