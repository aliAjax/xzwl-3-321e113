import { useState, useEffect } from 'react'
import { Plus, Search, Filter, Edit2, Trash2, X, User, Phone } from 'lucide-react'
import { api } from '@/utils/api'
import { formatDateTime, formatPhone } from '@/utils/format'
import type { Driver } from '@shared/types'
import clsx from 'clsx'

type DriverStatus = 'on_duty' | 'off_duty' | 'on_leave'

interface DriverFormData {
  name: string
  phone: string
  licenseNo: string
  licenseType: string
  status: DriverStatus
}

const initialFormData: DriverFormData = {
  name: '',
  phone: '',
  licenseNo: '',
  licenseType: 'C1',
  status: 'on_duty',
}

const statusMap: Record<DriverStatus, { label: string; color: string }> = {
  on_duty: { label: '在岗', color: 'bg-green-100 text-green-800' },
  off_duty: { label: '离岗', color: 'bg-gray-100 text-gray-800' },
  on_leave: { label: '休假', color: 'bg-yellow-100 text-yellow-800' },
}

const licenseTypeOptions = [
  { value: 'C1', label: 'C1 - 小型汽车' },
  { value: 'C2', label: 'C2 - 小型自动挡汽车' },
  { value: 'B1', label: 'B1 - 中型客车' },
  { value: 'B2', label: 'B2 - 大型货车' },
  { value: 'A1', label: 'A1 - 大型客车' },
  { value: 'A2', label: 'A2 - 牵引车' },
  { value: 'A3', label: 'A3 - 城市公交车' },
]

function DriverManagement() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<DriverStatus | ''>('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null)
  const [formData, setFormData] = useState<DriverFormData>(initialFormData)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; driver: Driver | null }>({
    open: false,
    driver: null,
  })

  useEffect(() => {
    loadDrivers()
  }, [])

  async function loadDrivers() {
    try {
      const data = await api.get<Driver[]>('/drivers')
      setDrivers(data)
    } catch (error) {
      console.error('Failed to load drivers:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredDrivers = drivers.filter((driver) => {
    const matchesSearch =
      driver.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      driver.phone.includes(searchQuery) ||
      driver.licenseNo.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = !statusFilter || driver.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const statusOptions: { value: DriverStatus | ''; label: string }[] = [
    { value: '', label: '全部状态' },
    { value: 'on_duty', label: '在岗' },
    { value: 'off_duty', label: '离岗' },
    { value: 'on_leave', label: '休假' },
  ]

  function openCreateModal() {
    setEditingDriver(null)
    setFormData(initialFormData)
    setIsModalOpen(true)
  }

  function openEditModal(driver: Driver) {
    setEditingDriver(driver)
    setFormData({
      name: driver.name,
      phone: driver.phone,
      licenseNo: driver.licenseNo,
      licenseType: driver.licenseType,
      status: driver.status as DriverStatus,
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingDriver(null)
    setFormData(initialFormData)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      if (editingDriver) {
        await api.put(`/drivers/${editingDriver.id}`, formData)
      } else {
        await api.post('/drivers', formData)
      }
      closeModal()
      loadDrivers()
    } catch (error) {
      console.error('Failed to save driver:', error)
      alert('保存失败，请重试')
    }
  }

  function handleDelete(driver: Driver) {
    setDeleteConfirm({ open: true, driver })
  }

  async function confirmDelete() {
    if (!deleteConfirm.driver) return
    try {
      await api.delete(`/drivers/${deleteConfirm.driver.id}`)
      setDeleteConfirm({ open: false, driver: null })
      loadDrivers()
    } catch (error) {
      console.error('Failed to delete driver:', error)
      alert('删除失败，请重试')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800">司机管理</h1>
        <button className="btn-primary flex items-center gap-2" onClick={openCreateModal}>
          <Plus size={18} />
          新建司机
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
              placeholder="搜索司机姓名、电话、驾驶证号..."
              className="input-field pl-10"
            />
          </div>
          <div className="relative">
            <Filter size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DriverStatus | '')}
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
                <th className="table-header">司机姓名</th>
                <th className="table-header">联系电话</th>
                <th className="table-header">驾驶证号</th>
                <th className="table-header">准驾车型</th>
                <th className="table-header">状态</th>
                <th className="table-header">创建时间</th>
                <th className="table-header">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredDrivers.length > 0 ? (
                filteredDrivers.map((driver) => {
                  const statusInfo = statusMap[driver.status as DriverStatus]
                  return (
                    <tr key={driver.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium">
                        <div className="flex items-center gap-2">
                          <User size={16} className="text-gray-400" />
                          {driver.name}
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <Phone size={16} className="text-gray-400" />
                          {formatPhone(driver.phone)}
                        </div>
                      </td>
                      <td className="table-cell">{driver.licenseNo}</td>
                      <td className="table-cell">{driver.licenseType}</td>
                      <td className="table-cell">
                        <span className={clsx('status-badge', statusInfo.color)}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="table-cell">{formatDateTime(driver.createdAt)}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(driver)}
                            className="p-2 text-[#2563eb] hover:bg-blue-50 rounded-md transition-colors"
                            title="编辑"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(driver)}
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
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    暂无司机数据
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
                {editingDriver ? '编辑司机' : '新建司机'}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">姓名 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入司机姓名"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">联系电话 *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="请输入联系电话"
                  className="input-field"
                  pattern="[0-9]{11}"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">驾驶证号 *</label>
                <input
                  type="text"
                  value={formData.licenseNo}
                  onChange={(e) => setFormData({ ...formData, licenseNo: e.target.value })}
                  placeholder="请输入驾驶证号"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">准驾车型 *</label>
                <select
                  value={formData.licenseType}
                  onChange={(e) => setFormData({ ...formData, licenseType: e.target.value })}
                  className="input-field"
                  required
                >
                  {licenseTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">状态 *</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as DriverStatus })}
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
                  {editingDriver ? '保存修改' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm.open && deleteConfirm.driver && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">确认删除</h2>
            <p className="text-gray-600 mb-6">
              确定要删除司机 <span className="font-medium">{deleteConfirm.driver.name}</span> 吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm({ open: false, driver: null })}
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

export default DriverManagement
