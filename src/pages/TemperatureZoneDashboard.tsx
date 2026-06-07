import { useState, useEffect } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Package, Truck, Thermometer, AlertTriangle, Clock, Snowflake, Sun } from 'lucide-react'
import { api } from '@/utils/api'
import { formatDateTime, formatTemperature, formatTemperatureZone } from '@/utils/format'
import type { TemperatureZoneSummary, TemperatureZoneAbnormalRecord, TemperatureZoneStats } from '@shared/types'
import clsx from 'clsx'

interface ZoneCardConfig {
  zone: keyof Omit<TemperatureZoneSummary, 'recentAbnormalRecords'>
  label: string
  icon: LucideIcon
  gradient: string
  bgColor: string
  iconColor: string
}

const zoneConfigs: ZoneCardConfig[] = [
  {
    zone: 'frozen',
    label: '冷冻',
    icon: Snowflake,
    gradient: 'from-blue-400 to-blue-600',
    bgColor: 'bg-blue-50',
    iconColor: 'text-blue-500',
  },
  {
    zone: 'chilled',
    label: '冷藏',
    icon: Thermometer,
    gradient: 'from-cyan-400 to-teal-600',
    bgColor: 'bg-cyan-50',
    iconColor: 'text-cyan-500',
  },
  {
    zone: 'ambient',
    label: '常温',
    icon: Sun,
    gradient: 'from-amber-400 to-orange-500',
    bgColor: 'bg-amber-50',
    iconColor: 'text-amber-500',
  },
]

function StatItem({
  label,
  value,
  icon: Icon,
  colorClass,
}: {
  label: string
  value: number
  icon: LucideIcon
  colorClass: string
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm">
      <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', colorClass.replace('text-', 'bg-').replace('-500', '-100'))}>
        <Icon size={18} className={colorClass} />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-800">{value}</p>
      </div>
    </div>
  )
}

function ZoneCard({
  config,
  stats,
}: {
  config: ZoneCardConfig
  stats: TemperatureZoneStats
}) {
  const Icon = config.icon

  return (
    <div className="card overflow-hidden">
      <div className={clsx('h-2 bg-gradient-to-r', config.gradient)} />
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center', config.bgColor)}>
            <Icon size={24} className={config.iconColor} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800">{config.label}</h3>
            <p className="text-sm text-gray-500">温区概览</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatItem
            label="待调度"
            value={stats.pendingOrders}
            icon={Clock}
            colorClass="text-purple-500"
          />
          <StatItem
            label="运输中"
            value={stats.inTransitOrders}
            icon={Package}
            colorClass="text-indigo-500"
          />
          <StatItem
            label="可用车辆"
            value={stats.availableVehicles}
            icon={Truck}
            colorClass="text-green-500"
          />
        </div>
      </div>
    </div>
  )
}

function AbnormalRecordItem({ record }: { record: TemperatureZoneAbnormalRecord }) {
  const zoneInfo = formatTemperatureZone(record.temperatureZone)
  const isBelowMin = record.temperature < record.minTemp
  const isAboveMax = record.temperature > record.maxTemp

  return (
    <div className="p-4 bg-red-50 border border-red-100 rounded-lg">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium text-red-800">{record.orderNo}</span>
            <span className={clsx('status-badge text-xs', zoneInfo.color)}>
              {zoneInfo.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-red-600 mb-2">
            <span className={clsx('font-bold', isBelowMin ? 'text-blue-600' : 'text-red-600')}>
              {formatTemperature(record.temperature)}
            </span>
            <span className="text-gray-400">/</span>
            <span className="text-gray-500">
              {formatTemperature(record.minTemp)} ~ {formatTemperature(record.maxTemp)}
            </span>
            {record.exceptionDescription && (
              <span className="text-xs text-red-500 ml-auto">
                {record.exceptionDescription}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>位置: {record.locationText}</span>
            <span>操作人: {record.operatorName}</span>
            <span>{formatDateTime(record.recordedAt)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TemperatureZoneDashboard() {
  const [summary, setSummary] = useState<TemperatureZoneSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSummary()
  }, [])

  async function loadSummary() {
    try {
      const data = await api.get<TemperatureZoneSummary>('/temperature-zone/summary')
      setSummary(data)
    } catch (error) {
      console.error('Failed to load temperature zone summary:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">温区看板</h2>
          <p className="text-sm text-gray-500 mt-1">按温区维度实时监控订单、车辆和配送状态</p>
        </div>
        <button
          onClick={loadSummary}
          className="px-4 py-2 bg-[#1e3a5f] text-white rounded-lg hover:bg-[#2d4a6f] transition-colors text-sm"
        >
          刷新数据
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {zoneConfigs.map((config) => (
          <ZoneCard
            key={config.zone}
            config={config}
            stats={summary?.[config.zone] || { pendingOrders: 0, inTransitOrders: 0, availableVehicles: 0 }}
          />
        ))}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">最近异常温度记录</h3>
          <span className="text-sm text-gray-500">
            共 {summary?.recentAbnormalRecords?.length || 0} 条异常
          </span>
        </div>
        <div className="space-y-3">
          {summary?.recentAbnormalRecords && summary.recentAbnormalRecords.length > 0 ? (
            summary.recentAbnormalRecords.map((record) => (
              <AbnormalRecordItem key={record.id} record={record} />
            ))
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Thermometer size={48} className="mx-auto mb-3 text-gray-300" />
              <p>暂无异常温度记录</p>
              <p className="text-sm mt-1">所有温区温度均在正常范围内</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TemperatureZoneDashboard
