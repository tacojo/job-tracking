/**
 * API client for Job Tracking backend.
 * Uses relative URLs so Vite proxy forwards to backend.
 */
const BASE = '';

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function handleResponse(res) {
  if (res.status === 401) {
    localStorage.removeItem('auth_token');
    window.location.href = '/login';
    throw new Error('Not authenticated');
  }
  if (!res.ok) {
    const err = new Error(res.statusText || 'Request failed');
    err.status = res.status;
    const text = await res.text();
    try {
      err.body = text ? JSON.parse(text) : null;
    } catch {
      err.body = text;
    }
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  health: () => fetch(`${BASE}/health`).then(handleResponse),

  auth: {
    me: () =>
      fetch(`${BASE}/api/v1/auth/me`, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse),
    devAvailable: () =>
      fetch(`${BASE}/api/v1/auth/dev-available`, { credentials: 'include' }).then(handleResponse),
    devLogin: () =>
      fetch(`${BASE}/api/v1/auth/dev-login`, { credentials: 'include' }).then(handleResponse),
    logout: () =>
      fetch(`${BASE}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
      }).then(handleResponse),
  },

  companies: {
    list: (params = {}) => {
      const sp = new URLSearchParams()
      if (params.page != null) sp.set('page', params.page)
      if (params.page_size != null) sp.set('page_size', params.page_size)
      if (params.sort != null) sp.set('sort', params.sort)
      if (params.order != null) sp.set('order', params.order)
      if (params.q != null && params.q !== '') sp.set('q', params.q)
      const qs = sp.toString()
      const url = `${BASE}/api/companies${qs ? '?' + qs : ''}`
      return fetch(url, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse)
    },
    get: (id) =>
      fetch(`${BASE}/api/companies/${id}`, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse),
    create: (data) =>
      fetch(`${BASE}/api/companies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify(data),
      }).then(handleResponse),
    addNote: (id, text) =>
      fetch(`${BASE}/api/companies/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ text }),
      }).then(handleResponse),
    delete: (id) =>
      fetch(`${BASE}/api/companies/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders(),
      }).then(handleResponse),
  },

  roles: {
    list: () =>
      fetch(`${BASE}/api/roles`, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse),
  },

  recruiters: {
    list: (params = {}) => {
      const sp = new URLSearchParams()
      if (params.page != null) sp.set('page', params.page)
      if (params.page_size != null) sp.set('page_size', params.page_size)
      if (params.sort != null) sp.set('sort', params.sort)
      if (params.order != null) sp.set('order', params.order)
      if (params.q != null && params.q !== '') sp.set('q', params.q)
      const qs = sp.toString()
      const url = `${BASE}/api/recruiters${qs ? '?' + qs : ''}`
      return fetch(url, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse)
    },
    get: (id) =>
      fetch(`${BASE}/api/recruiters/${id}`, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse),
    create: (data) =>
      fetch(`${BASE}/api/recruiters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify(data),
      }).then(handleResponse),
    addNote: (id, text) =>
      fetch(`${BASE}/api/recruiters/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ text }),
      }).then(handleResponse),
    delete: (id) =>
      fetch(`${BASE}/api/recruiters/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders(),
      }).then(handleResponse),
  },

  analytics: {
    get: (filters = {}) => {
      const params = new URLSearchParams()
      if (filters.company_id != null) params.set('company_id', filters.company_id)
      if (filters.role_id != null) params.set('role_id', filters.role_id)
      if (filters.stage) params.set('stage', filters.stage)
      if (filters.date_from) params.set('date_from', filters.date_from)
      if (filters.date_to) params.set('date_to', filters.date_to)
      if (filters.group_by) params.set('group_by', filters.group_by)
      const qs = params.toString()
      const url = `${BASE}/api/analytics${qs ? '?' + qs : ''}`
      return fetch(url, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse)
    },
    getRoadmap: () =>
      fetch(`${BASE}/api/analytics/roadmap`, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse),
  },

  applications: {
    list: (filters = {}) => {
      const params = new URLSearchParams()
      if (filters.company) params.set('company', filters.company)
      if (filters.role) params.set('role', filters.role)
      if (filters.recruiter) params.set('recruiter', filters.recruiter)
      if (filters.stage) params.set('stage', filters.stage)
      if (filters.stage_mode) params.set('stage_mode', filters.stage_mode)
      const qs = params.toString()
      const url = `${BASE}/api/applications${qs ? '?' + qs : ''}`
      return fetch(url, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse)
    },
    get: (id) =>
      fetch(`${BASE}/api/applications/${id}`, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse),
    getBySlug: (companySlug, roleSlug, dateSlug) =>
      fetch(`${BASE}/api/applications/slug/${companySlug}/${roleSlug}/${dateSlug}`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      }).then(handleResponse),
    create: (data) =>
      fetch(`${BASE}/api/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify(data),
      }).then(handleResponse),
    update: (id, data) =>
      fetch(`${BASE}/api/applications/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify(data),
      }).then(handleResponse),
    addNote: (id, text) =>
      fetch(`${BASE}/api/applications/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ text }),
      }).then(handleResponse),
    delete: (id) =>
      fetch(`${BASE}/api/applications/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders(),
      }).then(handleResponse),

    prospect: {
      getAnswers: (appId) =>
        fetch(`${BASE}/api/applications/${appId}/prospect/answers`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        }).then(handleResponse),
      saveAnswers: (appId, items) =>
        fetch(`${BASE}/api/applications/${appId}/prospect/answers`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          credentials: 'include',
          body: JSON.stringify({ items }),
        }).then(handleResponse),
      tailor: (appId, data) =>
        fetch(`${BASE}/api/applications/${appId}/prospect/tailor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          credentials: 'include',
          body: JSON.stringify(data),
        }).then(handleResponse),
      saveDocx: (appId, data) =>
        fetch(`${BASE}/api/applications/${appId}/prospect/save-docx`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          credentials: 'include',
          body: JSON.stringify(data),
        }).then(handleResponse),
      getTemplates: (appId) =>
        fetch(`${BASE}/api/applications/${appId}/prospect/templates`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        }).then(handleResponse),
      setJobSpec: (appId, data) =>
        fetch(`${BASE}/api/applications/${appId}/prospect/job-spec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          credentials: 'include',
          body: JSON.stringify(data),
        }).then(handleResponse),
      swotAnalysis: (appId) =>
        fetch(`${BASE}/api/applications/${appId}/prospect/swot-analysis`, {
          method: 'POST',
          credentials: 'include',
          headers: getAuthHeaders(),
        }).then(handleResponse),
      saveSwotAnalysis: (appId, data) =>
        fetch(`${BASE}/api/applications/${appId}/prospect/swot-analysis/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          credentials: 'include',
          body: JSON.stringify(data),
        }).then(handleResponse),
      getSavedSwotAnalysis: (appId) =>
        fetch(`${BASE}/api/applications/${appId}/prospect/swot-analysis/saved`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        }).then(handleResponse),
    },

    documents: {
      list: (appId) =>
        fetch(`${BASE}/api/applications/${appId}/documents`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        }).then(handleResponse),
      upload: (appId, docType, file) => {
        const fd = new FormData()
        fd.append('file', file)
        return fetch(`${BASE}/api/applications/${appId}/documents?doc_type=${encodeURIComponent(docType)}`, {
          method: 'POST',
          credentials: 'include',
          headers: getAuthHeaders(),
          body: fd,
        }).then(handleResponse)
      },
      getFile: async (appId, docUuid, download = false) => {
        const url = `${BASE}/api/applications/${appId}/documents/${docUuid}/file${download ? '?download=true' : ''}`
        const res = await fetch(url, { credentials: 'include', headers: getAuthHeaders() })
        if (res.status === 401) {
          localStorage.removeItem('auth_token')
          window.location.href = '/login'
          throw new Error('Not authenticated')
        }
        if (!res.ok) throw new Error(res.statusText || 'Failed to fetch file')
        return res.blob()
      },
      replace: (appId, docUuid, file) => {
        const fd = new FormData()
        fd.append('file', file)
        return fetch(`${BASE}/api/applications/${appId}/documents/${docUuid}/replace`, {
          method: 'PUT',
          credentials: 'include',
          headers: getAuthHeaders(),
          body: fd,
        }).then(handleResponse)
      },
      delete: (appId, docUuid) =>
        fetch(`${BASE}/api/applications/${appId}/documents/${docUuid}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: getAuthHeaders(),
        }).then(handleResponse),
    },
  },

  stages: {
    list: (applicationId) =>
      fetch(`${BASE}/api/applications/${applicationId}/stages`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      }).then(handleResponse),
    create: (applicationId, data) =>
      fetch(`${BASE}/api/applications/${applicationId}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify(data),
      }).then(handleResponse),
    update: (id, data) =>
      fetch(`${BASE}/api/stages/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify(data),
      }).then(handleResponse),
    delete: (id) =>
      fetch(`${BASE}/api/stages/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders(),
      }).then(handleResponse),
  },

  reset: {
    all: () =>
      fetch(`${BASE}/api/reset`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
      }).then(handleResponse),
  },

  cvProfile: {
    getProfile: () =>
      fetch(`${BASE}/api/cv-profile/profile`, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse),
    updateProfile: (data) =>
      fetch(`${BASE}/api/cv-profile/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify(data),
      }).then(handleResponse),
    listExperiences: () =>
      fetch(`${BASE}/api/cv-profile/experiences`, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse),
    createExperience: (data) =>
      fetch(`${BASE}/api/cv-profile/experiences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify(data),
      }).then(handleResponse),
    updateExperience: (id, data) =>
      fetch(`${BASE}/api/cv-profile/experiences/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify(data),
      }).then(handleResponse),
    deleteExperience: (id) =>
      fetch(`${BASE}/api/cv-profile/experiences/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders(),
      }).then((res) => (res.status === 204 ? null : handleResponse(res))),
    parseFromCv: (cvId) =>
      fetch(`${BASE}/api/cv-profile/parse/${cvId}`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
      }).then(handleResponse),
    export: (format, template = 'default') =>
      fetch(`${BASE}/api/cv-profile/export?format=${format}&template=${encodeURIComponent(template)}`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      }),
    listTemplates: (format) =>
      fetch(`${BASE}/api/cv-profile/templates?format=${format}`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      }).then(handleResponse),
    exportJson: () =>
      fetch(`${BASE}/api/cv-profile/export/json`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      }).then(handleResponse),
  },

  cvVersions: {
    list: () =>
      fetch(`${BASE}/api/cv-versions`, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse),
    upload: (formData) =>
      fetch(`${BASE}/api/cv-versions`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: formData,
      }).then(handleResponse),
    getFile: async (id) => {
      const res = await fetch(`${BASE}/api/cv-versions/${id}/file`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      })
      if (res.status === 401) {
        localStorage.removeItem('auth_token')
        window.location.href = '/login'
        throw new Error('Not authenticated')
      }
      return res
    },
    delete: (id) =>
      fetch(`${BASE}/api/cv-versions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders(),
      }).then(handleResponse),
  },

  coverLetters: {
    list: () =>
      fetch(`${BASE}/api/cover-letters`, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse),
    upload: (formData) =>
      fetch(`${BASE}/api/cover-letters`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: formData,
      }).then(handleResponse),
    getFile: async (id) => {
      const res = await fetch(`${BASE}/api/cover-letters/${id}/file`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      })
      if (res.status === 401) {
        localStorage.removeItem('auth_token')
        window.location.href = '/login'
        throw new Error('Not authenticated')
      }
      return res
    },
    delete: (id) =>
      fetch(`${BASE}/api/cover-letters/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders(),
      }).then(handleResponse),
  },

  settings: {
    ai: {
      get: () =>
        fetch(`${BASE}/api/settings/ai`, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse),
      update: (data) =>
        fetch(`${BASE}/api/settings/ai`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          credentials: 'include',
          body: JSON.stringify(data),
        }).then(handleResponse),
    },
  },

  prospect: {
    tailor: (data) =>
      fetch(`${BASE}/api/prospect/tailor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify(data),
      }).then(handleResponse),
    questions: () =>
      fetch(`${BASE}/api/prospect/questions`, { credentials: 'include', headers: getAuthHeaders() }).then(handleResponse),
    answer: (data) =>
      fetch(`${BASE}/api/prospect/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify(data),
      }).then(handleResponse),
  },
};
