import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Package, Thermometer, MapPin, Calendar, User, Phone, Clock, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react'
import { api } from '@/utils/api'
import {
  formatDateTime,
  formatOrderStatus,
  formatTemperatureZone,
  formatTemperatureRange,
  formatWeight,
  formatPhone,
  formatEscalationLevel,
  formatHandlingStatus,
} from '@/utils/format'
import Timeline from '@/components/Timeline'
import type { Order, DeliveryNode, OrderTimeline, ExceptionHandlingNodeStatusResponse } from '@shared/types'
import clsx from 'clsx'

function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [timelineNodes, setTimelineNodes] = useState<DeliveryNode[]>([])
  const [nodeStatusMap, setNodeStatusMap] = useState<Record<string, ExceptionHandlingNodeStatusResponse>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      loadOrderDetail()
    }
  }, [id])

  async function loadOrderDetail() {
    try {
      const [orderData, timelineData] = await Promise.all([
        api.get<Order>(`/orders/${id}`),
        api.get<OrderTimeline>(`/orders/${id}/timeline`),
      ])
      const nodes = timelineData.events.map((event) => ({
        ...event,
        taskId: '',
        operatorId: event.operatorId || '',
        operatorName: event.operatorName || '',
        version: 1,
        updatedAt: event.recordedAt || new Date().toISOString(),
        createdAt: event.recordedAt || new Date().toISOString(),
      }))
      setOrder(orderData)
      setTimelineNodes(nodes)

      const exceptionNodes = nodes.filter((node) => node.status === 'exception')
      if (exceptionNodes.length > 0) {
        const statusPromises = exceptionNodes.map((node) =>
          api.get<ExceptionHandlingNodeStatusResponse>(`/exceptions/node/${node.id}`)
        )
        const statuses = await Promise.all(statusPromises)
        const statusMap: Record<string, ExceptionHandlingNodeStatusResponse> = {}
        exceptionNodes.forEach((node, index) => {
          statusMap[node.id] = statuses[index]
        })
        setNodeStatusMap(statusMap)
      }
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
            <Timeline nodes={timelineNodes} />
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
            <h2 className="text-lg font-semibold text-gray-800 mb-4">追踪节点</h2>
            <div className="space-y-3">
              {timelineNodes.length > 0 ? (
                timelineNodes.map((node) => {
                  const isException = node.status === 'exception'
                  const nodeStatus = nodeStatusMap[node.id]
                  
                  return (
                    <div
                      key={node.id}
                      className={clsx(
                        'p-3 rounded-lg border',
                        isException
                          ? nodeStatus?.isClosed
                            ? 'bg-green-50 border-green-200'
                            : 'bg-red-50 border-red-200'
                          : 'bg-gray-50 border-gray-100'
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {isException && (
                            nodeStatus?.isClosed ? (
                              <CheckCircle size={16} className="text-green-600" />
                            ) : (
                              <AlertTriangle size={16} className="text-red-600" />
                            )
                          )}
                          <span className={clsx(
                            'text-sm font-medium',
                            isException
                              ? nodeStatus?.isClosed
                                ? 'text-green-800'
                                : 'text-red-800'
                              : 'text-gray-800'
                          )}>
                            {node.nodeName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isException && nodeStatus?.data?.escalationLevel && (
                            <span className={clsx(
                              'text-xs px-2 py-0.5 rounded-full',
                              formatEscalationLevel(nodeStatus.data.escalationLevel).color
                            )}>
                              {formatEscalationLevel(nodeStatus.data.escalationLevel).label}
                            </span>
                          )}
                          {isException && nodeStatus?.data?.handlingStatus && (
                            <span className={clsx(
                              'text-xs px-2 py-0.5 rounded-full',
                              formatHandlingStatus(nodeStatus.data.handlingStatus).color
                            )}>
                              {formatHandlingStatus(nodeStatus.data.handlingStatus).label}
                            </span>
                          )}
                          <span className={clsx(
                            'text-xs',
                            isException
                              ? nodeStatus?.isClosed
                                ? 'text-green-600'
                                : 'text-red-600'
                              : 'text-gray-500'
                          )}>
                            {isException && nodeStatus?.isClosed ? '已闭环' : node.status}
                          </span>
                        </div>
                      </div>
                      {isException && node.exceptionDescription && (
                        <p className={clsx(
                          'text-xs mb-2',
                          nodeStatus?.isClosed ? 'text-green-600' : 'text-red-600'
                        )}>
                          {node.exceptionDescription}
                        </p>
                      )}
                      {isException && nodeStatus?.data?.assignee && (
                        <p className="text-xs text-gray-500 mb-1">
                          处理人：{nodeStatus.data.assignee.name}
                        </p>
                      )}
                      {isException && nodeStatus?.data?.handlingResult && (
                        <p className="text-xs text-gray-500 mb-1">
                          处理结果：{nodeStatus.data.handlingResult}
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        {node.recordedAt ? formatDateTime(node.recordedAt) : '待记录'}
                        {isException && nodeStatus?.data?.closedAt && (
                          <span className="ml-2">· 闭环时间：{formatDateTime(nodeStatus.data.closedAt)}</span>
                        )}
                      </p>
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">暂无追踪节点</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OrderDetail
