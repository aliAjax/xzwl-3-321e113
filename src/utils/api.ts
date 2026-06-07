interface ApiOptions {
  headers?: Record<string, string>
  timeout?: number
}

const TOKEN_KEY = 'auth-storage'

function getToken(): string | null {
  try {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed.state?.token || null
    }
  } catch {
    // ignore
  }
  return null
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
}

class ApiClient {
  private baseUrl = '/api'
  private timeout = 30000

  private getHeaders(): Record<string, string> {
    const token = getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  private async request<T>(
    method: string,
    url: string,
    data?: unknown,
    options: ApiOptions = {}
  ): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.timeout)

    try {
      const response = await fetch(`${this.baseUrl}${url}`, {
        method,
        headers: { ...this.getHeaders(), ...options.headers },
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.status === 401) {
        clearAuth()
        window.location.href = '/login'
        throw new Error('未授权，请重新登录')
      }

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || result.error || `请求失败: ${response.status}`)
      }

      return result as T
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('请求超时')
      }
      throw error
    }
  }

  get<T>(url: string, options?: ApiOptions): Promise<T> {
    return this.request<T>('GET', url, undefined, options)
  }

  post<T>(url: string, data?: unknown, options?: ApiOptions): Promise<T> {
    return this.request<T>('POST', url, data, options)
  }

  put<T>(url: string, data?: unknown, options?: ApiOptions): Promise<T> {
    return this.request<T>('PUT', url, data, options)
  }

  delete<T>(url: string, options?: ApiOptions): Promise<T> {
    return this.request<T>('DELETE', url, undefined, options)
  }

  patch<T>(url: string, data?: unknown, options?: ApiOptions): Promise<T> {
    return this.request<T>('PATCH', url, data, options)
  }
}

export const api = new ApiClient()
