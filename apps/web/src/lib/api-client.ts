export interface ApiUser {
  id: string
  email: string
  name?: string | null
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public url: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T>(url: string, init: RequestInit = {}, retry = true): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: buildHeaders(init),
  })

  if (response.status === 401 && retry) {
    const refreshed = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
    if (refreshed.ok) return apiFetch<T>(url, init, false)
  }

  if (!response.ok) {
    const message = await readError(response)
    throw new ApiError(message, response.status, url)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function buildHeaders(init: RequestInit): HeadersInit {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return headers
}

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json()
    if (typeof data?.error === 'string') return data.error
  } catch {
    // ignore non-json response
  }
  return `请求失败：${response.status}`
}
