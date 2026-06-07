import { useState, useEffect } from 'react'
import { Package, AlertTriangle, Truck, Clock, CheckCircle } from 'lucide-react'
import { api } from '@/utils/api'
import { formatDateTime, formatOrderStatus, formatHandlingStatus } from '@/utils/format'
import type { DashboardStats } from '@shared/types'
import clsx from 'clsx'

function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    try {
      const data = await api.get<DashboardStats>('/dashboard/stats')
      setStats(data)
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  const statCards = [
    {
      label: '今日配送量',
      value: stats?.todayDeliveries || 0,
      icon: Package,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      label: '异常订单',
      value: stats?.exceptionOrders || 0,
      icon: AlertTriangle,
      color: 'bg-orange-500',
      bgColor: 'bg-orange-50',
    },
    {
      label: '在途车辆',
      value: stats?.inTransitVehicles || 0,
      icon: Truck,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
    },
    {
      label: '待处理订单',
      value: stats?.pendingOrders || 0,
      icon: Clock,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">{card.label}</p>
                  <p className="text-3xl font-bold text-gray-800">{card.value}</p>
                </div>
                <div className={clsx('w-12 h-12 rounded-lg flex items-center justify-center', card.bgColor)}>
                  <Icon size={24} className={card.color.replace('bg-', 'text-')} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">今日任务时间线</h3>
          <div className="space-y-4">
            {stats?.todayTasks && stats.todayTasks.length > 0 ? (
              stats.todayTasks.slice(0, 5).map((task) => {
                const statusInfo = formatOrderStatus(task.status)
                return (
                  <div key={task.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 bg-[#1e3a5f] rounded-full flex items-center justify-center">
                      <Package size={18} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">
                        {task.order?.orderNo}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {task.order?.deliveryAddress}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={clsx('status-badge', statusInfo.color)}>
                        {statusInfo.label}
                      </span>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDateTime(task.createdAt)}
                      </p>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-center py-8 text-gray-500">暂无今日任务</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">异常预警</h3>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span className="text-gray-500">未处理 {stats?.pendingExceptionCount || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className="text-gray-500">已处理 {stats?.handledExceptionCount || 0}</span>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {stats?.recentExceptions && stats.recentExceptions.length > 0 ? (
              stats.recentExceptions.slice(0, 5).map((node) => (
                <div
                  key={node.id}
                  className={clsx(
                    'p-4 border rounded-lg transition-colors',
                    node.handled
                      ? 'bg-green-50 border-green-100'
                      : 'bg-red-50 border-red-100'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {node.handled ? (
                      <CheckCircle size={20} className="text-green-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={clsx(
                          'font-medium',
                          node.handled ? 'text-green-800' : 'text-red-800'
                        )}>
                          {node.nodeName}
                        </p>
                        {node.handlingStatus && (
                          <span className={clsx(
                            'text-xs px-2 py-0.5 rounded-full',
                            formatHandlingStatus(node.handlingStatus).color
                          )}>
                            {formatHandlingStatus(node.handlingStatus).label}
                          </span>
                        )}
                      </div>
                      <p className={clsx(
                        'text-sm mt-1',
                        node.handled ? 'text-green-600' : 'text-red-600'
                      )}>
                        {node.exceptionDescription}
                      </p>
                      <p className={clsx(
                        'text-xs mt-2',
                        node.handled ? 'text-green-400' : 'text-red-400'
                      )}>
                        {formatDateTime(node.recordedAt || node.createdAt)} · {node.operatorName}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">暂无异常记录</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
