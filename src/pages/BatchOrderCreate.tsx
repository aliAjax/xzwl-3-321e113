import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Upload, CheckCircle, AlertCircle, ArrowLeft, FileText } from 'lucide-react'
import { api, ApiError } from '@/utils/api'
import { formatTemperatureZone } from '@/utils/format'
import type { Customer, TemperatureZone, BatchOrderCreateItem, BatchOrderValidationError } from '@shared/types'
import { TEMPERATURE_ZONE_RANGES } from '@shared/types'
import { clsx } from 'clsx'

interface OrderRow extends BatchOrderCreateItem {
  _id: string
}

interface FieldError {
  field: string
  message: string
}

const temperatureZoneOptions: { value: TemperatureZone; label: string }[] = [
  { value: 'frozen', label: `冷冻 (${TEMPERATURE_ZONE_RANGES.frozen.min}°C ~ ${TEMPERATURE_ZONE_RANGES.frozen.max}°C)` },
  { value: 'chilled', label: `冷藏 (${TEMPERATURE_ZONE_RANGES.chilled.min}°C ~ ${TEMPERATURE_ZONE_RANGES.chilled.max}°C)` },
  { value: 'ambient', label: `常温 (${TEMPERATURE_ZONE_RANGES.ambient.min}°C ~ ${TEMPERATURE_ZONE_RANGES.ambient.max}°C)` },
]

function generateOrderNo(): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `ORD${dateStr}${random}`
}

function createEmptyRow(): OrderRow {
  return {
    _id: Math.random().toString(36).substring(2, 9),
    orderNo: generateOrderNo(),
    customerId: '',
    temperatureZone: 'chilled',
    minTemp: 2,
    maxTemp: 6,
    goodsName: '',
    quantity: 1,
    weight: 1,
    deliveryAddress: '',
    scheduledDeliveryTime: '',
    remarks: '',
  }
}

function BatchOrderCreate() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [rows, setRows] = useState<OrderRow[]>([createEmptyRow()])
  const [rowErrors, setRowErrors] = useState<Map<number, FieldError[]>>(new Map())
  const [submitting, setSubmitting] = useState(false)
  const [successResult, setSuccessResult] = useState<{ orderNos: string[]; count: number } | null>(null)
  const [apiErrors, setApiErrors] = useState<BatchOrderValidationError[]>([])

  useEffect(() => {
    loadCustomers()
  }, [])

  async function loadCustomers() {
    try {
      const data = await api.get<Customer[]>('/customers')
      setCustomers(data)
    } catch (error) {
      console.error('Failed to load customers:', error)
    }
  }

  const updateRow = useCallback((rowIndex: number, field: keyof OrderRow, value: unknown) => {
    setRows(prev => {
      const newRows = [...prev]
      newRows[rowIndex] = { ...newRows[rowIndex], [field]: value }

      if (field === 'temperatureZone') {
        const zone = value as TemperatureZone
        const range = TEMPERATURE_ZONE_RANGES[zone]
        newRows[rowIndex].minTemp = range.min
        newRows[rowIndex].maxTemp = range.max
      }

      return newRows
    })

    setRowErrors(prev => {
      const newErrors = new Map(prev)
      newErrors.delete(rowIndex)
      return newErrors
    })
    setApiErrors([])
  }, [])

  const addRow = useCallback(() => {
    setRows(prev => [...prev, createEmptyRow()])
    setApiErrors([])
  }, [])

  const removeRow = useCallback((rowIndex: number) => {
    if (rows.length <= 1) return
    setRows(prev => prev.filter((_, idx) => idx !== rowIndex))
    setRowErrors(prev => {
      const newErrors = new Map<number, FieldError[]>()
      prev.forEach((errors, idx) => {
        if (idx < rowIndex) {
          newErrors.set(idx, errors)
        } else if (idx > rowIndex) {
          newErrors.set(idx - 1, errors)
        }
      })
      return newErrors
    })
    setApiErrors([])
  }, [rows.length])

  const validateRow = useCallback((row: OrderRow, rowIndex: number): FieldError[] => {
    const errors: FieldError[] = []

    if (!row.orderNo.trim()) {
      errors.push({ field: 'orderNo', message: '订单号不能为空' })
    }

    if (!row.customerId) {
      errors.push({ field: 'customerId', message: '请选择客户' })
    }

    if (!row.goodsName.trim()) {
      errors.push({ field: 'goodsName', message: '货物名称不能为空' })
    }

    if (row.quantity <= 0 || isNaN(row.quantity)) {
      errors.push({ field: 'quantity', message: '数量必须大于0' })
    }

    if (row.weight <= 0 || isNaN(row.weight)) {
      errors.push({ field: 'weight', message: '重量必须大于0' })
    }

    if (!row.deliveryAddress.trim()) {
      errors.push({ field: 'deliveryAddress', message: '配送地址不能为空' })
    }

    if (!row.scheduledDeliveryTime) {
      errors.push({ field: 'scheduledDeliveryTime', message: '请选择送达时间' })
    }

    const range = TEMPERATURE_ZONE_RANGES[row.temperatureZone]
    if (row.minTemp < range.min || row.minTemp > range.max) {
      errors.push({ field: 'minTemp', message: `最低温度需在 ${range.min}°C ~ ${range.max}°C 之间` })
    }
    if (row.maxTemp < range.min || row.maxTemp > range.max) {
      errors.push({ field: 'maxTemp', message: `最高温度需在 ${range.min}°C ~ ${range.max}°C 之间` })
    }
    if (row.minTemp > row.maxTemp) {
      errors.push({ field: 'minTemp', message: '最低温度不能大于最高温度' })
    }

    return errors
  }, [])

  const validateAll = useCallback((): boolean => {
    const newRowErrors = new Map<number, FieldError[]>()
    let hasError = false

    rows.forEach((row, index) => {
      const errors = validateRow(row, index)
      if (errors.length > 0) {
        newRowErrors.set(index, errors)
        hasError = true
      }
    })

    const orderNos = new Set<string>()
    rows.forEach((row, index) => {
      if (orderNos.has(row.orderNo)) {
        const existing = newRowErrors.get(index) || []
        existing.push({ field: 'orderNo', message: '订单号重复' })
        newRowErrors.set(index, existing)
        hasError = true
      } else {
        orderNos.add(row.orderNo)
      }
    })

    setRowErrors(newRowErrors)
    return !hasError
  }, [rows, validateRow])

  const handleSubmit = async () => {
    if (!validateAll()) {
      return
    }

    setSubmitting(true)
    setApiErrors([])
    setSuccessResult(null)

    try {
      const payload: BatchOrderCreateItem[] = rows.map(({ _id, ...rest }) => rest)
      const result = await api.post<{
        success: boolean
        orderIds?: string[]
        orderNos?: string[]
        count?: number
        errors?: BatchOrderValidationError[]
        message?: string
      }>('/orders/batch', payload)

      if (result.success && result.orderNos) {
        setSuccessResult({
          orderNos: result.orderNos,
          count: result.count || result.orderNos.length,
        })
        setRows([createEmptyRow()])
        setRowErrors(new Map())
      } else if (result.errors) {
        setApiErrors(result.errors)
      }
    } catch (error) {
      console.error('Batch create failed:', error)
      if (error instanceof ApiError && error.data) {
        const errData = error.data as { errors?: BatchOrderValidationError[] }
        if (errData.errors) {
          setApiErrors(errData.errors)
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const getFieldError = (rowIndex: number, field: string): string | undefined => {
    const rowErr = rowErrors.get(rowIndex)
    if (rowErr) {
      const found = rowErr.find(e => e.field === field)
      if (found) return found.message
    }

    const apiErr = apiErrors.find(e => e.rowIndex === rowIndex + 1 && e.field === field)
    if (apiErr) return apiErr.message

    return undefined
  }

  const getRowErrorSummary = (rowIndex: number): string[] => {
    const summary: string[] = []
    const rowErr = rowErrors.get(rowIndex)
    if (rowErr) {
      rowErr.forEach(e => summary.push(e.message))
    }

    apiErrors.forEach(e => {
      if (e.rowIndex === rowIndex + 1) {
        summary.push(e.message)
      }
    })

    return summary
  }

  const today = new Date().toISOString().slice(0, 16)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/orders')}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">批量订单创建</h1>
            <p className="text-sm text-gray-500 mt-1">一次录入多条冷链订单，提交前统一校验</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={addRow} className="btn-secondary flex items-center gap-2">
            <Plus size={18} />
            添加行
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || rows.length === 0}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Upload size={18} />
            {submitting ? '提交中...' : '批量提交'}
          </button>
        </div>
      </div>

      {successResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="font-medium text-green-800">
              成功创建 {successResult.count} 条订单
            </h3>
            <p className="text-sm text-green-600 mt-1">
              订单号：{successResult.orderNos.join('、')}
            </p>
            <button
              onClick={() => navigate('/orders')}
              className="mt-2 text-sm text-green-700 hover:text-green-800 font-medium"
            >
              前往订单列表 →
            </button>
          </div>
        </div>
      )}

      {apiErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="font-medium text-red-800">数据校验失败</h3>
              <p className="text-sm text-red-600 mt-1">
                以下行存在错误，请修正后重新提交：
              </p>
              <ul className="mt-2 space-y-1">
                {Array.from(new Map(apiErrors.map(e => [`${e.rowIndex}-${e.field}`, e])).values())
                  .slice(0, 10)
                  .map((err, idx) => (
                    <li key={idx} className="text-sm text-red-700">
                      第 {err.rowIndex} 行：{err.message}
                    </li>
                  ))}
                {apiErrors.length > 10 && (
                  <li className="text-sm text-red-600">
                    ... 还有 {apiErrors.length - 10} 条错误
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FileText size={16} />
            <span>共 {rows.length} 条订单</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="table-header w-12 text-center">#</th>
                <th className="table-header min-w-[140px]">订单号</th>
                <th className="table-header min-w-[180px]">客户</th>
                <th className="table-header min-w-[200px]">温区要求</th>
                <th className="table-header w-24">最低温</th>
                <th className="table-header w-24">最高温</th>
                <th className="table-header min-w-[150px]">货物名称</th>
                <th className="table-header w-20">数量</th>
                <th className="table-header w-24">重量(kg)</th>
                <th className="table-header min-w-[180px]">配送地址</th>
                <th className="table-header min-w-[160px]">计划送达时间</th>
                <th className="table-header min-w-[120px]">备注</th>
                <th className="table-header w-16">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((row, rowIndex) => {
                const rowErrors = getRowErrorSummary(rowIndex)
                const hasError = rowErrors.length > 0

                return (
                  <tr
                    key={row._id}
                    className={clsx(
                      'hover:bg-gray-50 transition-colors',
                      hasError && 'bg-red-50'
                    )}
                  >
                    <td className="table-cell text-center text-gray-500">
                      {rowIndex + 1}
                      {hasError && (
                        <div className="mt-1">
                          <AlertCircle size={14} className="text-red-500 mx-auto" />
                        </div>
                      )}
                    </td>

                    <td className="table-cell">
                      <input
                        type="text"
                        value={row.orderNo}
                        onChange={e => updateRow(rowIndex, 'orderNo', e.target.value)}
                        className={clsx(
                          'input-field text-sm py-1.5',
                          getFieldError(rowIndex, 'orderNo') && 'border-red-500 focus:ring-red-500'
                        )}
                      />
                      {getFieldError(rowIndex, 'orderNo') && (
                        <p className="text-xs text-red-500 mt-1">{getFieldError(rowIndex, 'orderNo')}</p>
                      )}
                    </td>

                    <td className="table-cell">
                      <select
                        value={row.customerId}
                        onChange={e => updateRow(rowIndex, 'customerId', e.target.value)}
                        className={clsx(
                          'input-field text-sm py-1.5',
                          getFieldError(rowIndex, 'customerId') && 'border-red-500 focus:ring-red-500'
                        )}
                      >
                        <option value="">请选择客户</option>
                        {customers.map(customer => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}
                          </option>
                        ))}
                      </select>
                      {getFieldError(rowIndex, 'customerId') && (
                        <p className="text-xs text-red-500 mt-1">{getFieldError(rowIndex, 'customerId')}</p>
                      )}
                    </td>

                    <td className="table-cell">
                      <select
                        value={row.temperatureZone}
                        onChange={e => updateRow(rowIndex, 'temperatureZone', e.target.value as TemperatureZone)}
                        className={clsx(
                          'input-field text-sm py-1.5',
                          getFieldError(rowIndex, 'temperatureZone') && 'border-red-500 focus:ring-red-500'
                        )}
                      >
                        {temperatureZoneOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {getFieldError(rowIndex, 'temperatureZone') && (
                        <p className="text-xs text-red-500 mt-1">{getFieldError(rowIndex, 'temperatureZone')}</p>
                      )}
                    </td>

                    <td className="table-cell">
                      <input
                        type="number"
                        step="0.1"
                        value={row.minTemp}
                        onChange={e => updateRow(rowIndex, 'minTemp', parseFloat(e.target.value))}
                        className={clsx(
                          'input-field text-sm py-1.5 text-center',
                          getFieldError(rowIndex, 'minTemp') && 'border-red-500 focus:ring-red-500'
                        )}
                      />
                      {getFieldError(rowIndex, 'minTemp') && (
                        <p className="text-xs text-red-500 mt-1">{getFieldError(rowIndex, 'minTemp')}</p>
                      )}
                    </td>

                    <td className="table-cell">
                      <input
                        type="number"
                        step="0.1"
                        value={row.maxTemp}
                        onChange={e => updateRow(rowIndex, 'maxTemp', parseFloat(e.target.value))}
                        className={clsx(
                          'input-field text-sm py-1.5 text-center',
                          getFieldError(rowIndex, 'maxTemp') && 'border-red-500 focus:ring-red-500'
                        )}
                      />
                      {getFieldError(rowIndex, 'maxTemp') && (
                        <p className="text-xs text-red-500 mt-1">{getFieldError(rowIndex, 'maxTemp')}</p>
                      )}
                    </td>

                    <td className="table-cell">
                      <input
                        type="text"
                        value={row.goodsName}
                        onChange={e => updateRow(rowIndex, 'goodsName', e.target.value)}
                        placeholder="货物名称"
                        className={clsx(
                          'input-field text-sm py-1.5',
                          getFieldError(rowIndex, 'goodsName') && 'border-red-500 focus:ring-red-500'
                        )}
                      />
                      {getFieldError(rowIndex, 'goodsName') && (
                        <p className="text-xs text-red-500 mt-1">{getFieldError(rowIndex, 'goodsName')}</p>
                      )}
                    </td>

                    <td className="table-cell">
                      <input
                        type="number"
                        min="1"
                        value={row.quantity}
                        onChange={e => updateRow(rowIndex, 'quantity', parseInt(e.target.value) || 0)}
                        className={clsx(
                          'input-field text-sm py-1.5 text-center',
                          getFieldError(rowIndex, 'quantity') && 'border-red-500 focus:ring-red-500'
                        )}
                      />
                      {getFieldError(rowIndex, 'quantity') && (
                        <p className="text-xs text-red-500 mt-1">{getFieldError(rowIndex, 'quantity')}</p>
                      )}
                    </td>

                    <td className="table-cell">
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={row.weight}
                        onChange={e => updateRow(rowIndex, 'weight', parseFloat(e.target.value) || 0)}
                        className={clsx(
                          'input-field text-sm py-1.5 text-center',
                          getFieldError(rowIndex, 'weight') && 'border-red-500 focus:ring-red-500'
                        )}
                      />
                      {getFieldError(rowIndex, 'weight') && (
                        <p className="text-xs text-red-500 mt-1">{getFieldError(rowIndex, 'weight')}</p>
                      )}
                    </td>

                    <td className="table-cell">
                      <input
                        type="text"
                        value={row.deliveryAddress}
                        onChange={e => updateRow(rowIndex, 'deliveryAddress', e.target.value)}
                        placeholder="配送地址"
                        className={clsx(
                          'input-field text-sm py-1.5',
                          getFieldError(rowIndex, 'deliveryAddress') && 'border-red-500 focus:ring-red-500'
                        )}
                      />
                      {getFieldError(rowIndex, 'deliveryAddress') && (
                        <p className="text-xs text-red-500 mt-1">{getFieldError(rowIndex, 'deliveryAddress')}</p>
                      )}
                    </td>

                    <td className="table-cell">
                      <input
                        type="datetime-local"
                        value={row.scheduledDeliveryTime}
                        min={today}
                        onChange={e => updateRow(rowIndex, 'scheduledDeliveryTime', e.target.value)}
                        className={clsx(
                          'input-field text-sm py-1.5',
                          getFieldError(rowIndex, 'scheduledDeliveryTime') && 'border-red-500 focus:ring-red-500'
                        )}
                      />
                      {getFieldError(rowIndex, 'scheduledDeliveryTime') && (
                        <p className="text-xs text-red-500 mt-1">{getFieldError(rowIndex, 'scheduledDeliveryTime')}</p>
                      )}
                    </td>

                    <td className="table-cell">
                      <input
                        type="text"
                        value={row.remarks || ''}
                        onChange={e => updateRow(rowIndex, 'remarks', e.target.value)}
                        placeholder="备注"
                        className="input-field text-sm py-1.5"
                      />
                    </td>

                    <td className="table-cell">
                      <button
                        onClick={() => removeRow(rowIndex)}
                        disabled={rows.length <= 1}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="删除行"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
          <p className="text-sm text-gray-500">
            提示：温区切换时会自动填充对应的温度范围，可根据需要微调
          </p>
          <button onClick={addRow} className="btn-secondary flex items-center gap-2">
            <Plus size={16} />
            添加一行
          </button>
        </div>
      </div>

      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-800 mb-2">温区说明</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {temperatureZoneOptions.map(option => {
            const info = formatTemperatureZone(option.value)
            return (
              <div key={option.value} className="flex items-center gap-2">
                <span className={clsx('status-badge', info.color)}>{info.label}</span>
                <span className="text-sm text-blue-700">{option.label.split(' ')[1]}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default BatchOrderCreate
