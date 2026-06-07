import { CheckCircle, Clock, Loader, AlertCircle } from 'lucide-react'
import type { DeliveryNode } from '@shared/types'
import { formatNodeStatus, formatDateTime, formatTemperature } from '@/utils/format'
import clsx from 'clsx'

interface TimelineProps {
  nodes: DeliveryNode[]
}

const nodeIcons = {
  clock: Clock,
  loader: Loader,
  check: CheckCircle,
  alert: AlertCircle,
}

function Timeline({ nodes }: TimelineProps) {
  if (!nodes || nodes.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        暂无追踪数据
      </div>
    )
  }

  return (
    <div className="relative">
      {nodes.map((node, index) => {
        const statusInfo = formatNodeStatus(node.status)
        const Icon = nodeIcons[statusInfo.icon as keyof typeof nodeIcons] || Clock
        const isLast = index === nodes.length - 1

        return (
          <div key={node.id} className="relative flex gap-4">
            {!isLast && (
              <div
                className={clsx(
                  'absolute left-[15px] top-8 w-0.5 h-full',
                  node.status === 'completed'
                    ? 'bg-green-500'
                    : node.status === 'exception'
                    ? 'bg-red-500'
                    : 'bg-gray-300'
                )}
              />
            )}

            <div
              className={clsx(
                'relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                statusInfo.color
              )}
            >
              <Icon size={16} className="text-white" />
            </div>

            <div className="flex-1 pb-8">
              <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-medium text-gray-900">{node.nodeName}</h4>
                    <span
                      className={clsx(
                        'status-badge mt-1',
                        node.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : node.status === 'exception'
                          ? 'bg-red-100 text-red-800'
                          : node.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      )}
                    >
                      {statusInfo.label}
                    </span>
                  </div>
                  {node.recordedAt && (
                    <span className="text-sm text-gray-500">
                      {formatDateTime(node.recordedAt)}
                    </span>
                  )}
                </div>

                {node.locationText && (
                  <p className="text-sm text-gray-600 mb-2">
                    <span className="text-gray-500">位置：</span>
                    {node.locationText}
                  </p>
                )}

                {node.temperature !== undefined && node.temperature !== null && (
                  <p className="text-sm text-gray-600 mb-2">
                    <span className="text-gray-500">温度：</span>
                    <span
                      className={clsx(
                        'font-medium',
                        node.temperature < 0
                          ? 'text-blue-600'
                          : node.temperature > 10
                          ? 'text-orange-600'
                          : 'text-green-600'
                      )}
                    >
                      {formatTemperature(node.temperature)}
                    </span>
                  </p>
                )}

                {node.exceptionDescription && (
                  <div className="mt-2 p-3 bg-red-50 rounded-md border border-red-100">
                    <p className="text-sm text-red-700">
                      <span className="font-medium">异常说明：</span>
                      {node.exceptionDescription}
                    </p>
                  </div>
                )}

                <p className="text-xs text-gray-400 mt-2">
                  操作人：{node.operatorName}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default Timeline
