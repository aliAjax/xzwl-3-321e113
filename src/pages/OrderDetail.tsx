import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Package, Thermometer, MapPin, Calendar, User, Phone, Clock } from 'lucide-react'
import { api } from '@/utils/api'
import {
  formatDateTime,
  formatOrderStatus,
  formatTemperatureZone,
  formatTemperatureRange,
  formatWeight,
  formatPhone,
} from '@/utils/format'
import Timeline from '@/components/Timeline'
import type { Order, DeliveryTask } from '@shared/types'
import clsx from 'clsx'

function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<Order | null>(null)
  const [tasks, setTasks] = useState<DeliveryTask[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      loadOrderDetail()
    }
  }, [id])

  async function loadOrderDetail() {
    try {
      const [orderData, tasksData] = await Promise.all([
        api.get<Order>(`/orders/${id}`),
        api.get<DeliveryTask[]>(`/orders/${id}/tasks`),
      ])
      setOrder(orderData)
      setTasks(tasksData)
    } catch (error) {
      console.error('Failed to load order detail:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  if (!order) {
    return <div className="text-center py-12 text-gray-500">订单不存在</div>
  }

  const statusInfo = formatOrderStatus(order.status)
  const tempZoneInfo = formatTemperatureZone(order.temperatureZone)
  const allNodes = tasks.flatMap((t) => t.nodes || [])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/orders"
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">订单详情</h1>
        <span className={clsx('status-badge', statusInfo.color)}>
          {statusInfo.label}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Package size={20} />
              订单基本信息
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-500 mb-1">订单号</p>
                <p className="font-medium text-gray-800">{order.orderNo}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">商品名称</p>
                <p className="font-medium text-gray-800">{order.goodsName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">数量</p>
                <p className="font-medium text-gray-800">{order.quantity} 件</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">重量</p>
                <p className="font-medium text-gray-800">{formatWeight(order.weight)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">创建时间</p>
                <p className="font-medium text-gray-800">{formatDateTime(order.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">预计送达</p>
                <p className="font-medium text-gray-800">
                  {formatDateTime(order.scheduledDeliveryTime)}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Thermometer size={20} />
              温区要求
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500 mb-1">温区类型</p>
                <span className={clsx('status-badge', tempZoneInfo.color)}>
                  {tempZoneInfo.label}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">温度范围</p>
                <p className="font-medium text-gray-800">
                  {formatTemperatureRange(order.minTemp, order.maxTemp)}
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Clock size={20} />
              配送追踪
            </h2>
            <Timeline nodes={allNodes} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <User size={20} />
              客户信息
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">客户名称</p>
                <p className="font-medium text-gray-800">{order.customer?.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">联系人</p>
                <p className="font-medium text-gray-800">{order.customer?.contactName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1 flex items-center gap-1">
                  <Phone size={14} />
                  联系电话
                </p>
                <p className="font-medium text-gray-800">
                  {formatPhone(order.customer?.phone || '')}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1 flex items-center gap-1">
                  <MapPin size={14} />
                  配送地址
                </p>
                <p className="font-medium text-gray-800">{order.deliveryAddress}</p>
              </div>
            </div>
          </div>

          {order.remarks && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Calendar size={20} />
                备注信息
              </h2>
              <p className="text-gray-600">{order.remarks}</p>
            </div>
          )}

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">相关任务</h2>
            <div className="space-y-3">
              {tasks.length > 0 ? (
                tasks.map((task) => {
                  const taskStatusInfo = formatOrderStatus(task.status)
                  return (
                    <div
                      key={task.id}
                      className="p-3 bg-gray-50 rounded-lg border border-gray-100"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-800">
                          配送任务
                        </span>
                        <span className={clsx('status-badge text-xs', taskStatusInfo.color)}>
                          {taskStatusInfo.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        车辆：{task.vehicle?.plateNo || '-'}
                      </p>
                      <p className="text-xs text-gray-500">
                        司机：{task.driver?.name || '-'}
                      </p>
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">暂无配送任务</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OrderDetail
