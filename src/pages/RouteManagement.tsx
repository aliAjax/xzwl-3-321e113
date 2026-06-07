import { useState, useEffect } from 'react'
import {
  Plus, Search, Edit2, Trash2, X, Route as RouteIcon, MapPin, Clock, GripVertical, PlusCircle, MinusCircle } from 'lucide-react'
import { api } from '@/utils/api'
import { formatDateTime, formatDurationMinutes } from '@/utils/format'
import type { Route, RouteStop } from '@shared/types'
import clsx from 'clsx'

interface RouteFormData {
  name: string
  description: string
  stops: Omit<RouteStop, 'order'>[]
}

const initialFormData: RouteFormData = {
  name: '',
  description: '',
  stops: [],
}

const initialStop: Omit<RouteStop, 'order'> = {
  address: '',
  estimatedTime: 30,
}

function RouteManagement() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRoute, setEditingRoute] = useState<Route | null>(null)
  const [formData, setFormData] = useState<RouteFormData>(initialFormData)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; route: Route | null }>({
    open: false,
    route: null,
  })

  useEffect(() => {
    loadRoutes()
  }, [])

  async function loadRoutes() {
    try {
      const data = await api.get<Route[]>('/routes')
      setRoutes(data)
    } catch (error) {
      console.error('Failed to load routes:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredRoutes = routes.filter((route) => {
    const matchesSearch =
      route.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      route.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      route.stops.some((stop) =>
        stop.address.toLowerCase().includes(searchQuery.toLowerCase())
      )

    return matchesSearch
  })

  function openCreateModal() {
    setEditingRoute(null)
    setFormData(initialFormData)
    setIsModalOpen(true)
  }

  function openEditModal(route: Route) {
    setEditingRoute(route)
    setFormData({
      name: route.name,
      description: route.description,
      stops: route.stops.map((stop) => ({
        address: stop.address,
        estimatedTime: stop.estimatedTime,
      })),
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
    setEditingRoute(null)
    setFormData(initialFormData)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    const submitData = {
      ...formData,
      stops: formData.stops.map((stop, index) => ({
        ...stop,
        order: index + 1,
      })),
    }

    try {
      if (editingRoute) {
        await api.put(`/routes/${editingRoute.id}`, submitData)
      } else {
        await api.post('/routes', submitData)
      }
      closeModal()
      loadRoutes()
    } catch (error) {
      console.error('Failed to save route:', error)
      alert('保存失败，请重试')
    }
  }

  function handleDelete(route: Route) {
    setDeleteConfirm({ open: true, route })
  }

  async function confirmDelete() {
    if (!deleteConfirm.route) return
    try {
      await api.delete(`/routes/${deleteConfirm.route.id}`)
      setDeleteConfirm({ open: false, route: null })
      loadRoutes()
    } catch (error) {
      console.error('Failed to delete route:', error)
      alert('删除失败，请重试')
    }
  }

  function addStop() {
    setFormData({
      ...formData,
      stops: [...formData.stops, { ...initialStop }],
    })
  }

  function removeStop(index: number) {
    const newStops = formData.stops.filter((_, i) => i !== index)
    setFormData({ ...formData, stops: newStops })
  }

  function updateStop(index: number, field: 'address' | 'estimatedTime', value: string | number) {
    const newStops = [...formData.stops]
    newStops[index] = { ...newStops[index], [field]: value }
    setFormData({ ...formData, stops: newStops })
  }

  function moveStop(fromIndex: number, direction: 'up' | 'down') {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
    if (toIndex < 0 || toIndex >= formData.stops.length) return

    const newStops = [...formData.stops]
    ;[newStops[fromIndex], newStops[toIndex]] = [newStops[toIndex], newStops[fromIndex]]
    setFormData({ ...formData, stops: newStops })
  }

  function getTotalEstimatedTime(stops: RouteStop[]) {
    return stops.reduce((total, stop) => total + stop.estimatedTime, 0)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800">线路管理</h1>
        <button className="btn-primary flex items-center gap-2" onClick={openCreateModal}>
          <Plus size={18} />
          新建线路
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
              placeholder="搜索线路名称、描述、站点地址..."
              className="input-field pl-10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="table-header">线路名称</th>
                <th className="table-header">描述</th>
                <th className="table-header">站点数</th>
                <th className="table-header">预计总时长</th>
                <th className="table-header">创建时间</th>
                <th className="table-header">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRoutes.length > 0 ? (
                filteredRoutes.map((route) => (
                  <tr key={route.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">
                      <div className="flex items-center gap-2">
                        <RouteIcon size={16} className="text-gray-400" />
                        {route.name}
                      </div>
                    </td>
                    <td className="table-cell max-w-[200px] truncate" title={route.description}>
                      {route.description || '-'}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-gray-400" />
                        {route.stops.length} 个站点
                      </div>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-gray-400" />
                        {formatDurationMinutes(getTotalEstimatedTime(route.stops))}
                      </div>
                    </td>
                    <td className="table-cell">{formatDateTime(route.createdAt)}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(route)}
                          className="p-2 text-[#2563eb] hover:bg-blue-50 rounded-md transition-colors"
                          title="编辑"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(route)}
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
                  <td colSpan={6} className="text-center py-12 text-gray-500">
                    暂无线路数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-xl font-semibold text-gray-800">
                {editingRoute ? '编辑线路' : '新建线路'}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">线路名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入线路名称"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="请输入线路描述"
                  className="input-field min-h-[80px] resize-none"
                  rows={3}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">站点列表 *</label>
                <button
                  type="button"
                  onClick={addStop}
                  className="flex items-center gap-1 text-sm text-[#2563eb] hover:text-[#1d4ed8] transition-colors"
                >
                  <PlusCircle size={16} />
                  添加站点
                </button>
              </div>

              {formData.stops.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
                  <MapPin size={32} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-gray-500 text-sm">暂无站点，点击上方"添加站点"按钮添加</p>
                </div>
              )}

              {formData.stops.length > 0 && (
                <div className="space-y-3">
                  {formData.stops.map((stop, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex flex-col items-center gap-1 pt-2">
                        <GripVertical size={16} className="text-gray-400" />
                        <span className="w-6 h-6 rounded-full bg-[#2563eb] text-white text-xs flex items-center justify-center">
                          {index + 1}
                        </span>
                      </div>
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            站点地址 *
                          </label>
                          <input
                            type="text"
                            value={stop.address}
                            onChange={(e) => updateStop(index, 'address', e.target.value)}
                            placeholder="请输入站点地址"
                            className="input-field text-sm"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            预计时间 (分钟) *
                          </label>
                          <input
                            type="number"
                            value={stop.estimatedTime}
                            onChange={(e) => updateStop(index, 'estimatedTime', Number(e.target.value))}
                            className="input-field text-sm"
                            min="1"
                            required
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 pt-6">
                        <button
                          type="button"
                          onClick={() => moveStop(index, 'up')}
                          disabled={index === 0}
                          className={clsx(
                            'p-1 rounded transition-colors',
                            index === 0
                              ? 'text-gray-300 cursor-not-allowed'
                              : 'text-gray-500 hover:bg-gray-200'
                          )}
                          title="上移"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStop(index, 'down')}
                          disabled={index === formData.stops.length - 1}
                          className={clsx(
                            'p-1 rounded transition-colors',
                            index === formData.stops.length - 1
                              ? 'text-gray-300 cursor-not-allowed'
                              : 'text-gray-500 hover:bg-gray-200'
                          )}
                          title="下移"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStop(index)}
                          className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors"
                          title="删除"
                        >
                          <MinusCircle size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {formData.stops.length > 0 && (
                <div className="flex items-center justify-between text-sm text-gray-600 pt-2">
                  <span>共 {formData.stops.length} 个站点</span>
                  <span>
                    预计总时长:{' '}
                    {formatDurationMinutes(getTotalEstimatedTime(
                      formData.stops.map((s, i) => ({ ...s, order: i + 1 }))
                    ))}
                  </span>
                </div>
              )}
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6">
                <button type="button" onClick={closeModal} className="btn-secondary">
                  取消
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={formData.stops.length === 0}
                >
                  {editingRoute ? '保存修改' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm.open && deleteConfirm.route && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">确认删除</h2>
            <p className="text-gray-600 mb-6">
              确定要删除线路 <span className="font-medium">{deleteConfirm.route.name}</span> 吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm({ open: false, route: null })}
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

export default RouteManagement
