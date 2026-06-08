import { useState, useEffect } from 'react'
import { Package, AlertTriangle, Truck, Clock, CheckCircle, XCircle, AlertCircle, Users, Zap } from 'lucide-react'
import { api } from '@/utils/api'
import { formatDateTime, formatOrderStatus, formatHandlingStatus, formatEscalationLevel } from '@/utils/format'
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

  const workorderStatCards = stats?.workorderStats ? [
    {
      label: '工单总数',
      value: stats.workorderStats.total || 0,
      icon: AlertCircle,
      color: 'bg-slate-500',
      bgColor: 'bg-slate-50',
    },
    {
      label: '待处理工单',
      value: stats.workorderStats.pending || 0,
      icon: Clock,
      color: 'bg-yellow-500',
      bgColor: 'bg-yellow-50',
    },
    {
      label: '处理中工单',
      value: stats.workorderStats.open || 0,
      icon: Zap,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      label: '已闭环工单',
      value: stats.workorderStats.closed || 0,
      icon: CheckCircle,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
    },
    {
      label: '未分配工单',
      value: stats.workorderStats.unassigned || 0,
      icon: Users,
      color: 'bg-red-500',
      bgColor: 'bg-red-50',
    },
    {
      label: '一级异常',
      value: stats.workorderStats.level1 || 0,
      icon: AlertCircle,
      color: 'bg-yellow-400',
      bgColor: 'bg-yellow-50',
    },
    {
      label: '二级异常',
      value: stats.workorderStats.level2 || 0,
      icon: AlertTriangle,
      color: 'bg-orange-500',
      bgColor: 'bg-orange-50',
    },
    {
      label: '三级异常',
      value: stats.workorderStats.level3 || 0,
      icon: XCircle,
      color: 'bg-red-600',
      bgColor: 'bg-red-50',
    },
  ] : []

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

      {workorderStatCards.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">异常工单统计</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {workorderStatCards.map((card) => {
              const Icon = card.icon
              return (
                <div key={card.label} className="card">
                  <div className="flex items-center gap-3">
                    <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', card.bgColor)}>
                      <Icon size={20} className={card.color.replace('bg-', 'text-')} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">{card.label}</p>
                      <p className="text-xl font-bold text-gray-800">{card.value}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-600"></span>
                <span className="text-gray-500">已闭环 {stats?.workorderStats?.closed || 0}</span>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {stats?.recentExceptions && stats.recentExceptions.length > 0 ? (
              stats.recentExceptions.slice(0, 5).map((node) => {
                const isClosed = node.isClosed || false
                return (
                  <div
                    key={node.id}
                    className={clsx(
                      'p-4 border rounded-lg transition-colors',
                      isClosed
                        ? 'bg-green-50 border-green-200'
                        : node.handled
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-red-50 border-red-200'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {isClosed ? (
                        <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                      ) : node.handled ? (
                        <AlertCircle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={clsx(
                            'font-medium',
                            isClosed
                              ? 'text-green-800'
                              : node.handled
                                ? 'text-yellow-800'
                                : 'text-red-800'
                          )}>
                            {node.nodeName}
                          </p>
                          {node.escalationLevel && (
                            <span className={clsx(
                              'text-xs px-2 py-0.5 rounded-full',
                              formatEscalationLevel(node.escalationLevel).color
                            )}>
                              {formatEscalationLevel(node.escalationLevel).label}
                            </span>
                          )}
                          {node.handlingStatus && (
                            <span className={clsx(
                              'text-xs px-2 py-0.5 rounded-full',
                              formatHandlingStatus(node.handlingStatus).color
                            )}>
                              {formatHandlingStatus(node.handlingStatus).label}
                            </span>
                          )}
                          {isClosed && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-200 text-green-800">
                              已闭环
                            </span>
                          )}
                        </div>
                        <p className={clsx(
                          'text-sm mt-1',
                          isClosed
                            ? 'text-green-600'
                            : node.handled
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        )}>
                          {node.exceptionDescription}
                        </p>
                        <p className={clsx(
                          'text-xs mt-2',
                          isClosed
                            ? 'text-green-500'
                            : node.handled
                              ? 'text-yellow-500'
                              : 'text-red-500'
                        )}>
                          {formatDateTime(node.recordedAt || node.createdAt)} · {node.operatorName}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })
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
