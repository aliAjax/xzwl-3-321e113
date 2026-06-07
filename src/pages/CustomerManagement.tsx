import { useState, useEffect } from 'react'
import { Plus, Search, Filter, Edit2, Trash2, X, Building2, Phone, MapPin, Star } from 'lucide-react'
import { api } from '@/utils/api'
import { formatDateTime, formatPhone } from '@/utils/format'
import type { Customer } from '@shared/types'
import clsx from 'clsx'

interface CustomerFormData {
  name: string
  contactName: string
  phone: string
  address: string
  priority: number
}

const initialFormData: CustomerFormData = {
  name: '',
  contactName: '',
  phone: '',
  address: '',
  priority: 1,
}

const priorityOptions = [
  { value: 1, label: '1 - 低优先级' },
  { value: 2, label: '2 - 普通' },
  { value: 3, label: '3 - 高优先级' },
  { value: 4, label: '4 - 重要' },
  { value: 5, label: '5 - 核心客户' },
]

function CustomerManagement() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<number | ''>('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [formData, setFormData] = useState<CustomerFormData>(initialFormData)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; customer: Customer | null }>({
    open: false,
    customer: null,
  })

  useEffect(() => {
    loadCustomers()
  }, [])

  async function loadCustomers() {
    try {
      const data = await api.get<Customer[]>('/customers')
      setCustomers(data)
    } catch (error) {
      console.error('Failed to load customers:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.phone.includes(searchQuery) ||
      customer.address.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesPriority = priorityFilter === '' || customer.priority === priorityFilter

    return matchesSearch && matchesPriority
  })

  const priorityFilterOptions: { value: number | ''; label: string }[] = [
    { value: '', label: '全部优先级' },
    ...priorityOptions,
  ]

  function openCreateModal() {
    setEditingCustomer(null)
    setFormData(initialFormData)
    setIsModalOpen(true)
  }

  function openEditModal(customer: Customer) {
    setEditingCustomer(customer)
    setFormData({
      name: customer.name,
      contactName: customer.contactName,
      phone: customer.phone,
      address: customer.address,
      priority: customer.priority,
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingCustomer(null)
    setFormData(initialFormData)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer.id}`, formData)
      } else {
        await api.post('/customers', formData)
      }
      closeModal()
      loadCustomers()
    } catch (error) {
      console.error('Failed to save customer:', error)
      alert('保存失败，请重试')
    }
  }

  function handleDelete(customer: Customer) {
    setDeleteConfirm({ open: true, customer })
  }

  async function confirmDelete() {
    if (!deleteConfirm.customer) return
    try {
      await api.delete(`/customers/${deleteConfirm.customer.id}`)
      setDeleteConfirm({ open: false, customer: null })
      loadCustomers()
    } catch (error) {
      console.error('Failed to delete customer:', error)
      alert('删除失败，请重试')
    }
  }

  function renderPriorityStars(priority: number) {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((level) => (
          <Star
            key={level}
            size={14}
            className={clsx(
              level <= priority ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'
            )}
          />
        ))}
      </div>
    )
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800">客户管理</h1>
        <button className="btn-primary flex items-center gap-2" onClick={openCreateModal}>
          <Plus size={18} />
          新建客户
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
              placeholder="搜索客户名称、联系人、电话、地址..."
              className="input-field pl-10"
            />
          </div>
          <div className="relative">
            <Filter size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={priorityFilter}
              onChange={(e) =>
                setPriorityFilter(e.target.value === '' ? '' : Number(e.target.value))
              }
              className="input-field pl-10 pr-8 appearance-none bg-white"
            >
              {priorityFilterOptions.map((option) => (
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
                <th className="table-header">客户名称</th>
                <th className="table-header">联系人</th>
                <th className="table-header">联系电话</th>
                <th className="table-header">地址</th>
                <th className="table-header">优先级</th>
                <th className="table-header">创建时间</th>
                <th className="table-header">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 size={16} className="text-gray-400" />
                        {customer.name}
                      </div>
                    </td>
                    <td className="table-cell">{customer.contactName}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <Phone size={16} className="text-gray-400" />
                        {formatPhone(customer.phone)}
                      </div>
                    </td>
                    <td className="table-cell max-w-[250px]">
                      <div className="flex items-start gap-2">
                        <MapPin size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                        <span className="truncate" title={customer.address}>
                          {customer.address}
                        </span>
                      </div>
                    </td>
                    <td className="table-cell">{renderPriorityStars(customer.priority)}</td>
                    <td className="table-cell">{formatDateTime(customer.createdAt)}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(customer)}
                          className="p-2 text-[#2563eb] hover:bg-blue-50 rounded-md transition-colors"
                          title="编辑"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(customer)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          title="删除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    暂无客户数据
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
                {editingCustomer ? '编辑客户' : '新建客户'}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">客户名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入客户名称"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">联系人姓名 *</label>
                <input
                  type="text"
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  placeholder="请输入联系人姓名"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">地址 *</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="请输入详细地址"
                  className="input-field min-h-[80px] resize-none"
                  rows={3}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">优先级 *</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                  className="input-field"
                  required
                >
                  {priorityOptions.map((option) => (
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
                  {editingCustomer ? '保存修改' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm.open && deleteConfirm.customer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">确认删除</h2>
            <p className="text-gray-600 mb-6">
              确定要删除客户 <span className="font-medium">{deleteConfirm.customer.name}</span> 吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm({ open: false, customer: null })}
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

export default CustomerManagement
