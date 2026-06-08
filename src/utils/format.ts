import { format, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  OrderStatus,
  NodeStatus,
  TemperatureZone,
  UserRole,
  BatchStatus,
  ExceptionHandlingStatus,
  ExceptionHandlingResult,
  EscalationLevel,
  ProcessingNoteActionType,
} from '@shared/types'

export function formatDate(date: string | Date, pattern: string = 'yyyy-MM-dd HH:mm:ss'): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, pattern, { locale: zhCN })
}

export function formatDateTime(date: string | Date): string {
  return formatDate(date, 'yyyy-MM-dd HH:mm')
}

export function formatDateOnly(date: string | Date): string {
  return formatDate(date, 'yyyy-MM-dd')
}

export function formatTimeOnly(date: string | Date): string {
  return formatDate(date, 'HH:mm:ss')
}

export function formatTemperature(temp: number | null | undefined): string {
  if (temp === null || temp === undefined) return '-'
  return `${temp.toFixed(1)}°C`
}

export function formatTemperatureRange(min: number, max: number): string {
  return `${formatTemperature(min)} ~ ${formatTemperature(max)}`
}

export function formatWeight(weight: number): string {
  if (weight >= 1000) {
    return `${(weight / 1000).toFixed(2)} 吨`
  }
  return `${weight.toFixed(2)} kg`
}

const orderStatusMap: Record<OrderStatus, { label: string; color: string }> = {
  created: { label: '已创建', color: 'bg-gray-100 text-gray-800' },
  warehoused: { label: '已入仓', color: 'bg-blue-100 text-blue-800' },
  loading: { label: '装车中', color: 'bg-yellow-100 text-yellow-800' },
  in_transit: { label: '运输中', color: 'bg-indigo-100 text-indigo-800' },
  delivered: { label: '已送达', color: 'bg-purple-100 text-purple-800' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-800' },
  cancelled: { label: '已取消', color: 'bg-red-100 text-red-800' },
}

export function formatOrderStatus(status: OrderStatus): { label: string; color: string } {
  return orderStatusMap[status] || { label: status, color: 'bg-gray-100 text-gray-800' }
}

const nodeStatusMap: Record<NodeStatus, { label: string; color: string; icon: string }> = {
  pending: { label: '待处理', color: 'bg-gray-300', icon: 'clock' },
  in_progress: { label: '进行中', color: 'bg-blue-500', icon: 'loader' },
  completed: { label: '已完成', color: 'bg-green-500', icon: 'check' },
  exception: { label: '异常', color: 'bg-red-500', icon: 'alert' },
}

export function formatNodeStatus(status: NodeStatus): { label: string; color: string; icon: string } {
  return nodeStatusMap[status] || { label: status, color: 'bg-gray-300', icon: 'clock' }
}

const tempZoneMap: Record<TemperatureZone, { label: string; color: string }> = {
  frozen: { label: '冷冻', color: 'temp-zone-frozen' },
  chilled: { label: '冷藏', color: 'temp-zone-chilled' },
  ambient: { label: '常温', color: 'temp-zone-ambient' },
}

export function formatTemperatureZone(zone: TemperatureZone): { label: string; color: string } {
  return tempZoneMap[zone] || { label: zone, color: 'bg-gray-100 text-gray-800' }
}

const roleMap: Record<UserRole, { label: string; color: string }> = {
  admin: { label: '管理员', color: 'bg-red-100 text-red-800' },
  dispatcher: { label: '调度员', color: 'bg-blue-100 text-blue-800' },
  driver: { label: '司机', color: 'bg-green-100 text-green-800' },
}

export function formatUserRole(role: UserRole): { label: string; color: string } {
  return roleMap[role] || { label: role, color: 'bg-gray-100 text-gray-800' }
}

const batchStatusMap: Record<BatchStatus, { label: string; color: string }> = {
  created: { label: '已创建', color: 'bg-gray-100 text-gray-800' },
  loading: { label: '装车中', color: 'bg-yellow-100 text-yellow-800' },
  departed: { label: '已发车', color: 'bg-blue-100 text-blue-800' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-800' },
}

export function formatBatchStatus(status: BatchStatus): { label: string; color: string } {
  return batchStatusMap[status] || { label: status, color: 'bg-gray-100 text-gray-800' }
}

export function formatPhone(phone: string): string {
  if (!phone) return '-'
  return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}小时${minutes}分钟${secs}秒`
  }
  if (minutes > 0) {
    return `${minutes}分钟${secs}秒`
  }
  return `${secs}秒`
}

export function formatDurationMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  if (hours > 0 && mins > 0) {
    return `${hours}小时${mins}分钟`
  }
  if (hours > 0) {
    return `${hours}小时`
  }
  return `${mins}分钟`
}

const handlingStatusMap: Record<ExceptionHandlingStatus, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'bg-yellow-100 text-yellow-800' },
  resolved: { label: '已解决', color: 'bg-green-100 text-green-800' },
  escalated: { label: '已升级', color: 'bg-red-100 text-red-800' },
}

export function formatHandlingStatus(status: ExceptionHandlingStatus): { label: string; color: string } {
  return handlingStatusMap[status] || { label: status, color: 'bg-gray-100 text-gray-800' }
}

const handlingResultMap: Record<ExceptionHandlingResult, { label: string }> = {
  recovered: { label: '已恢复正常' },
  compensated: { label: '已赔偿' },
  re_routed: { label: '已改派' },
  cancelled: { label: '已取消订单' },
  other: { label: '其他' },
}

export function formatHandlingResult(result: ExceptionHandlingResult): { label: string } {
  return handlingResultMap[result] || { label: result }
}

const escalationLevelMap: Record<EscalationLevel, { label: string; color: string }> = {
  level_1: { label: '一级（普通）', color: 'bg-blue-100 text-blue-800' },
  level_2: { label: '二级（紧急）', color: 'bg-orange-100 text-orange-800' },
  level_3: { label: '三级（严重）', color: 'bg-red-100 text-red-800' },
}

export function formatEscalationLevel(level: EscalationLevel): { label: string; color: string } {
  return escalationLevelMap[level] || { label: level, color: 'bg-gray-100 text-gray-800' }
}

const actionTypeMap: Record<ProcessingNoteActionType, { label: string; color: string }> = {
  create: { label: '创建工单', color: 'bg-gray-100 text-gray-800' },
  assign: { label: '分配处理人', color: 'bg-blue-100 text-blue-800' },
  escalate: { label: '升级级别', color: 'bg-orange-100 text-orange-800' },
  add_note: { label: '添加备注', color: 'bg-purple-100 text-purple-800' },
  update_status: { label: '更新状态', color: 'bg-indigo-100 text-indigo-800' },
  close: { label: '关闭工单', color: 'bg-green-100 text-green-800' },
  reopen: { label: '重新开启', color: 'bg-yellow-100 text-yellow-800' },
}

export function formatActionType(action: ProcessingNoteActionType): { label: string; color: string } {
  return actionTypeMap[action] || { label: action, color: 'bg-gray-100 text-gray-800' }
}
