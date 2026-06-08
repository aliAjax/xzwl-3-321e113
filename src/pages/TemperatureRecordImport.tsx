import { useState, useRef, useCallback } from 'react'
import {
  Upload,
  FileText,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Send,
  Download,
  Copy,
  Thermometer,
  User,
  MapPin,
  Calendar,
  ArrowRight,
  ArrowLeft,
  Check,
  Settings,
  Eye,
} from 'lucide-react'
import { api } from '@/utils/api'
import { formatDateTime, formatTemperature, formatTemperatureRange } from '@/utils/format'
import clsx from 'clsx'
import type {
  TemperatureRecordImportPreview,
  TemperatureRecordImportResult,
  TemperatureRecordValidationResult,
  NodeType,
  TemperatureRecordColumnMapping,
  TemperatureRecordColumnParseResult,
  TemperatureRecordFieldKey,
} from '@shared/types'
import { TEMPERATURE_RECORD_FIELDS } from '@shared/types'

type ImportStep = 'upload' | 'mapping' | 'preview'

const nodeTypeLabels: Record<NodeType, string> = {
  warehouse_in: '入仓',
  loading: '装车',
  departure: '发车',
  arrival: '到达',
  delivery: '配送',
  signature: '签收',
}

function formatNodeType(nodeType: NodeType | null | undefined): string {
  if (!nodeType) return '-'
  return nodeTypeLabels[nodeType] || nodeType
}

const fieldIcons: Record<TemperatureRecordFieldKey, typeof FileText> = {
  orderNo: FileText,
  nodeType: Settings,
  recordedAt: Calendar,
  temperature: Thermometer,
  locationText: MapPin,
  operatorName: User,
}

function TemperatureRecordImport() {
  const [csvText, setCsvText] = useState('')
  const [previewData, setPreviewData] = useState<TemperatureRecordImportPreview | null>(null)
  const [activeTab, setActiveTab] = useState<'importable' | 'abnormal' | 'unmatched'>('importable')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<TemperatureRecordImportResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<ImportStep>('upload')
  const [columnParseResult, setColumnParseResult] = useState<TemperatureRecordColumnParseResult | null>(null)
  const [columnMapping, setColumnMapping] = useState<TemperatureRecordColumnMapping>({
    orderNo: null,
    nodeType: null,
    recordedAt: null,
    temperature: null,
    locationText: null,
    operatorName: null,
  })

  const handleFileRead = useCallback((file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert('文件大小不能超过10MB')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setCsvText(content)
      setFileName(file.name)
      setPreviewData(null)
      setImportResult(null)
      setColumnParseResult(null)
      setStep('upload')
    }
    reader.onerror = () => {
      alert('文件读取失败')
    }
    reader.readAsText(file, 'UTF-8')
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileRead(file)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
        alert('只支持 .csv 和 .txt 文件')
        return
      }
      handleFileRead(file)
    }
  }, [handleFileRead])

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    setTimeout(() => {
      setPreviewData(null)
      setImportResult(null)
      setFileName('')
      setColumnParseResult(null)
      setStep('upload')
    }, 0)
  }

  async function handleParseColumns() {
    if (!csvText.trim()) {
      alert('请先上传文件或粘贴CSV文本')
      return
    }

    setLoading(true)
    try {
      const data = await api.post<TemperatureRecordColumnParseResult>('/temperature-import/parse-columns', {
        csvText: csvText.trim(),
      })
      setColumnParseResult(data)
      setColumnMapping(data.autoMapping)
      setStep('mapping')
    } catch (error) {
      console.error('Failed to parse columns:', error)
      alert('解析列失败: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handlePreview() {
    const requiredFields = TEMPERATURE_RECORD_FIELDS.filter(f => f.required)
    const missingFields = requiredFields.filter(f => columnMapping[f.key] === null)

    if (missingFields.length > 0) {
      alert(`请为以下必填字段选择列: ${missingFields.map(f => f.label).join(', ')}`)
      return
    }

    setLoading(true)
    try {
      const data = await api.post<TemperatureRecordImportPreview>('/temperature-import/preview', {
        csvText: csvText.trim(),
        mapping: columnMapping,
      })
      setPreviewData(data)
      setActiveTab('importable')
      setImportResult(null)
      setStep('preview')
    } catch (error) {
      console.error('Failed to preview import:', error)
      alert('预览失败: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    if (!previewData) return

    const allRecords = [
      ...previewData.importableRecords,
      ...previewData.abnormalRecords,
      ...previewData.unmatchedRecords,
    ]

    if (allRecords.length === 0) {
      alert('没有可导入的记录')
      return
    }

    if (!confirm(`确认导入 ${allRecords.length} 条记录？`)) {
      return
    }

    setImporting(true)
    try {
      const data = await api.post<TemperatureRecordImportResult>('/temperature-import/import', {
        records: allRecords,
      })
      setImportResult(data)
    } catch (error) {
      console.error('Failed to import records:', error)
      alert('导入失败: ' + (error as Error).message)
    } finally {
      setImporting(false)
    }
  }

  function handleReset() {
    setCsvText('')
    setPreviewData(null)
    setImportResult(null)
    setFileName('')
    setActiveTab('importable')
    setColumnParseResult(null)
    setColumnMapping({
      orderNo: null,
      nodeType: null,
      recordedAt: null,
      temperature: null,
      locationText: null,
      operatorName: null,
    })
    setStep('upload')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleBackToUpload() {
    setStep('upload')
    setColumnParseResult(null)
  }

  function handleBackToMapping() {
    setStep('mapping')
    setPreviewData(null)
  }

  function handleMappingChange(fieldKey: TemperatureRecordFieldKey, columnIndex: number | null) {
    setColumnMapping(prev => ({
      ...prev,
      [fieldKey]: columnIndex,
    }))
  }

  function getMappedColumnIndex(fieldKey: TemperatureRecordFieldKey): number | null {
    return columnMapping[fieldKey]
  }

  function isColumnMapped(columnIndex: number): boolean {
    return Object.values(columnMapping).includes(columnIndex)
  }

  function getFieldForColumn(columnIndex: number): TemperatureRecordFieldKey | null {
    for (const [key, idx] of Object.entries(columnMapping)) {
      if (idx === columnIndex) {
        return key as TemperatureRecordFieldKey
      }
    }
    return null
  }

  const getCurrentRecords = (): TemperatureRecordValidationResult[] => {
    if (!previewData) return []
    switch (activeTab) {
      case 'importable':
        return previewData.importableRecords
      case 'abnormal':
        return previewData.abnormalRecords
      case 'unmatched':
        return previewData.unmatchedRecords
      default:
        return []
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'importable':
        return { label: '可导入', color: 'bg-green-100 text-green-800' }
      case 'abnormal':
        return { label: '异常', color: 'bg-red-100 text-red-800' }
      case 'unmatched':
        return { label: '无法匹配', color: 'bg-gray-100 text-gray-800' }
      default:
        return { label: status, color: 'bg-gray-100 text-gray-800' }
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(csvText).then(() => {
      alert('已复制到剪贴板')
    }).catch(() => {
      alert('复制失败')
    })
  }

  const downloadTemplate = () => {
    const template = `订单号,节点类型,记录时间,温度,位置,操作人
ORD001,warehouse_in,2024-01-01 10:00:00,5.5,一号仓库,张三
ORD002,loading,2024-01-01 11:00:00,-18.0,二号仓库,李四`
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '温度记录导入模板.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const allRecords = previewData
    ? [
        ...previewData.importableRecords,
        ...previewData.abnormalRecords,
        ...previewData.unmatchedRecords,
      ]
    : []

  const requiredFields = TEMPERATURE_RECORD_FIELDS.filter(f => f.required)
  const isMappingComplete = requiredFields.every(f => columnMapping[f.key] !== null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">温度记录导入</h2>
          <p className="text-sm text-gray-500 mt-1">
            批量导入温度记录数据，支持CSV文件上传和文本粘贴
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="btn btn-secondary flex items-center gap-2"
        >
          <Download size={16} />
          下载模板
        </button>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          {(['upload', 'mapping', 'preview'] as ImportStep[]).map((s, idx) => (
            <div key={s} className="flex items-center">
              <div className="flex items-center gap-2">
                <div className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                  step === s
                    ? 'bg-blue-500 text-white'
                    : idx < ['upload', 'mapping', 'preview'].indexOf(step)
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                )}>
                  {idx < ['upload', 'mapping', 'preview'].indexOf(step) ? (
                    <Check size={16} />
                  ) : (
                    idx + 1
                  )}
                </div>
                <span className={clsx(
                  'text-sm font-medium',
                  step === s ? 'text-blue-600' : 'text-gray-500'
                )}>
                  {s === 'upload' ? '上传数据' : s === 'mapping' ? '字段映射' : '预览校验'}
                </span>
              </div>
              {idx < 2 && (
                <div className={clsx(
                  'w-16 md:w-24 h-0.5 mx-2',
                  idx < ['upload', 'mapping', 'preview'].indexOf(step)
                    ? 'bg-green-500'
                    : 'bg-gray-200'
                )} />
              )}
            </div>
          ))}
        </div>
      </div>

      {step === 'upload' && !previewData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Upload size={20} />
              文件上传
            </h3>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={clsx(
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                isDragging
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload size={48} className="mx-auto mb-3 text-gray-400" />
              <p className="text-sm font-medium text-gray-700">
                拖拽文件到此处或点击选择
              </p>
              <p className="text-xs text-gray-500 mt-1">
                支持 .csv 和 .txt 文件，最大 10MB
              </p>
              {fileName && (
                <div className="mt-3 p-2 bg-gray-100 rounded-lg">
                  <FileText size={16} className="inline mr-2 text-gray-500" />
                  <span className="text-sm text-gray-700">{fileName}</span>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <FileText size={20} />
              文本粘贴
            </h3>
            <textarea
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value)
                setPreviewData(null)
                setImportResult(null)
                setFileName('')
                setColumnParseResult(null)
              }}
              onPaste={handlePaste}
              placeholder="请粘贴CSV格式的温度记录数据...&#10;订单号,节点类型,记录时间,温度,位置,操作人"
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm"
            />
            {csvText && (
              <div className="flex justify-end mt-2">
                <button
                  onClick={copyToClipboard}
                  className="btn btn-secondary flex items-center gap-1 text-sm py-1 px-3"
                >
                  <Copy size={14} />
                  复制
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 'mapping' && columnParseResult && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Settings size={20} />
              字段映射确认
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              系统已自动识别列与字段的映射关系，请确认或手动调整。<span className="text-red-500">*</span> 标记为必填字段。
            </p>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 w-32">目标字段</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">映射列</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">示例数据</th>
                  </tr>
                </thead>
                <tbody>
                  {TEMPERATURE_RECORD_FIELDS.map((field) => {
                    const Icon = fieldIcons[field.key]
                    const mappedIndex = getMappedColumnIndex(field.key)
                    const mappedColumn = mappedIndex !== null ? columnParseResult.headers[mappedIndex] : null

                    return (
                      <tr key={field.key} className="border-b last:border-b-0 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Icon size={16} className="text-gray-400" />
                            <span className="text-sm font-medium text-gray-800">
                              {field.label}
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={mappedIndex ?? ''}
                            onChange={(e) => {
                              const value = e.target.value
                              handleMappingChange(field.key, value === '' ? null : parseInt(value))
                            }}
                            className={clsx(
                              'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                              mappedIndex === null && field.required
                                ? 'border-red-300 bg-red-50'
                                : 'border-gray-300'
                            )}
                          >
                            <option value="">-- 不映射 --</option>
                            {columnParseResult.headers.map((header, idx) => (
                              <option
                                key={idx}
                                value={idx}
                                disabled={isColumnMapped(idx) && getFieldForColumn(idx) !== field.key}
                                className={clsx(
                                  isColumnMapped(idx) && getFieldForColumn(idx) !== field.key
                                    ? 'text-gray-400'
                                    : ''
                                )}
                              >
                                {header}
                                {isColumnMapped(idx) && getFieldForColumn(idx) !== field.key && (
                                  ` (已映射: ${TEMPERATURE_RECORD_FIELDS.find(f => f.key === getFieldForColumn(idx))?.label})`
                                )}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          {mappedIndex !== null && columnParseResult.sampleRows.length > 0 ? (
                            <div className="space-y-1">
                              {columnParseResult.sampleRows.slice(0, 3).map((row, rowIdx) => (
                                <p key={rowIdx} className="text-sm text-gray-600 truncate">
                                  {row[mappedIndex] || '-'}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>检测到的列:</strong> {columnParseResult.headers.join(' | ')}
              </p>
              <p className="text-sm text-blue-600 mt-1">
                <strong>分隔符:</strong> {columnParseResult.separator === '\t' ? '制表符 (Tab)' : '逗号 (,)'}
              </p>
            </div>
          </div>

          <div className="flex justify-center gap-3">
            <button
              onClick={handleBackToUpload}
              className="btn btn-secondary flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              返回上传
            </button>
            <button
              onClick={handlePreview}
              disabled={loading || !isMappingComplete}
              className="btn btn-primary flex items-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  解析中...
                </>
              ) : (
                <>
                  <Eye size={16} />
                  预览校验
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {step === 'upload' && (
        <div className="flex justify-center gap-3">
          <button
            onClick={handleParseColumns}
            disabled={loading || !csvText.trim()}
            className="btn btn-primary flex items-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                解析中...
              </>
            ) : (
              <>
                <ArrowRight size={16} />
                下一步
              </>
            )}
          </button>
        </div>
      )}

      {loading && step === 'preview' && (
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <RefreshCw size={32} className="mx-auto mb-2 text-blue-500 animate-spin" />
            <p className="text-gray-600">正在解析CSV数据...</p>
          </div>
        </div>
      )}

      {importing && (
        <div className="flex items-center justify-center h-32">
          <div className="text-center">
            <RefreshCw size={32} className="mx-auto mb-2 text-blue-500 animate-spin" />
            <p className="text-gray-600">正在导入数据...</p>
          </div>
        </div>
      )}

      {previewData && !loading && !importing && step === 'preview' && (
        <>
          <div className="flex justify-center gap-3 mb-6">
            <button
              onClick={handleBackToMapping}
              className="btn btn-secondary flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              返回映射
            </button>
            <button
              onClick={handleReset}
              className="btn btn-secondary flex items-center gap-2"
            >
              <RefreshCw size={16} />
              重新上传
            </button>
            <button
              onClick={handleImport}
              disabled={importing || allRecords.length === 0}
              className="btn btn-primary flex items-center gap-2"
            >
              <Send size={16} />
              {importing ? '导入中...' : '确认导入'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">记录总数</p>
                  <p className="text-2xl font-bold text-gray-800">{previewData.totalCount}</p>
                </div>
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  <FileText size={24} className="text-gray-500" />
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">可导入</p>
                  <p className="text-2xl font-bold text-green-600">{previewData.importableCount}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle size={24} className="text-green-500" />
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">异常记录</p>
                  <p className="text-2xl font-bold text-red-600">{previewData.abnormalCount}</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle size={24} className="text-red-500" />
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">无法匹配</p>
                  <p className="text-2xl font-bold text-gray-600">{previewData.unmatchedCount}</p>
                </div>
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  <XCircle size={24} className="text-gray-500" />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">导入预览</h3>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setActiveTab('importable')}
                  className={clsx(
                    'px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5',
                    activeTab === 'importable'
                      ? 'bg-white text-green-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  )}
                >
                  <CheckCircle size={14} />
                  可导入 ({previewData.importableCount})
                </button>
                <button
                  onClick={() => setActiveTab('abnormal')}
                  className={clsx(
                    'px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5',
                    activeTab === 'abnormal'
                      ? 'bg-white text-red-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  )}
                >
                  <AlertTriangle size={14} />
                  异常 ({previewData.abnormalCount})
                </button>
                <button
                  onClick={() => setActiveTab('unmatched')}
                  className={clsx(
                    'px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5',
                    activeTab === 'unmatched'
                      ? 'bg-white text-gray-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  )}
                >
                  <XCircle size={14} />
                  无法匹配 ({previewData.unmatchedCount})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">行号</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">订单号</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">节点类型</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">记录时间</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">温度值</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">温度范围</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">位置</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">操作人</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">状态</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">失败原因</th>
                  </tr>
                </thead>
                <tbody>
                  {getCurrentRecords().length > 0 ? (
                    getCurrentRecords().map((record, index) => {
                      const statusInfo = getStatusBadge(record.status)
                      const order = record.matched?.order
                      const isAbnormal = record.status === 'abnormal'
                      const isUnmatched = record.status === 'unmatched'

                      return (
                        <tr
                          key={index}
                          className={clsx(
                            'border-b last:border-b-0',
                            isAbnormal ? 'bg-red-50' : isUnmatched ? 'bg-gray-50' : 'hover:bg-gray-50'
                          )}
                        >
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {record.lineNumber}
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-sm font-medium text-gray-800">
                              {record.parsed.orderNo || '-'}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {formatNodeType(record.parsed.nodeType)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Calendar size={14} className="text-gray-400" />
                              {record.parsed.recordedAt
                                ? formatDateTime(record.parsed.recordedAt)
                                : '-'}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div
                              className={clsx(
                                'flex items-center gap-1 text-sm font-medium',
                                isAbnormal ? 'text-red-600' : 'text-gray-800'
                              )}
                            >
                              <Thermometer
                                size={14}
                                className={isAbnormal ? 'text-red-500' : 'text-gray-400'}
                              />
                              {record.parsed.temperature !== null
                                ? formatTemperature(record.parsed.temperature)
                                : '-'}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {order
                              ? formatTemperatureRange(order.minTemp, order.maxTemp)
                              : '-'}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <MapPin size={14} className="text-gray-400" />
                              {record.parsed.locationText || '-'}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <User size={14} className="text-gray-400" />
                              {record.parsed.operatorName || '-'}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={clsx('status-badge', statusInfo.color)}>
                              {statusInfo.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-500 max-w-xs">
                            {record.failureReasons.length > 0 ? (
                              <div className="space-y-1">
                                {record.failureReasons.map((reason, idx) => (
                                  <p key={idx} className="text-xs">
                                    {reason}
                                  </p>
                                ))}
                              </div>
                            ) : (
                              record.status === 'importable' ? (
                                <span className="text-green-600 text-xs">温度正常</span>
                              ) : record.status === 'abnormal' ? (
                                <span className="text-red-600 text-xs">
                                  {order && record.parsed.temperature !== null
                                    ? record.parsed.temperature < order.minTemp
                                      ? '低于温度范围'
                                      : '高于温度范围'
                                    : '温度异常'}
                                </span>
                              ) : (
                                '-'
                              )
                            )}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={10}
                        className="py-12 text-center text-gray-500"
                      >
                        暂无{getStatusBadge(activeTab).label}记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {importResult && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">导入结果</h3>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-sm text-gray-600">
                <CheckCircle size={14} className="text-green-500" />
                成功: {importResult.successCount}
              </span>
              <span className="flex items-center gap-1 text-sm text-gray-600">
                <XCircle size={14} className="text-red-500" />
                失败: {importResult.failedCount}
              </span>
              <span className="flex items-center gap-1 text-sm text-gray-600">
                <AlertTriangle size={14} className="text-orange-500" />
                异常: {importResult.exceptionCreatedCount}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">行号</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">订单号</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">状态</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">结果</th>
                </tr>
              </thead>
              <tbody>
                {importResult.results.map((result, index) => (
                  <tr key={index} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-600">{result.lineNumber}</td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-800">{result.orderNo}</td>
                    <td className="py-3 px-4">
                      <span
                        className={clsx(
                          'status-badge',
                          result.success
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        )}
                      >
                        {result.success ? '成功' : '失败'}
                      </span>
                      {result.isException && (
                        <span className="ml-2 status-badge bg-orange-100 text-orange-800">
                          异常
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{result.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default TemperatureRecordImport
