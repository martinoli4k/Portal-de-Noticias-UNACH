/**
 * Cliente HTTP y Manejador de Tokens con Renovación Automática (Refresh Token)
 */
const API = {
  baseUrl: '/api',
  isRefreshing: false,
  failedQueue: [],

  getToken() {
    return localStorage.getItem('portal_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('portal_token', token);
    } else {
      localStorage.removeItem('portal_token');
    }
  },

  getRefreshToken() {
    return localStorage.getItem('portal_refresh_token');
  },

  setRefreshToken(token) {
    if (token) {
      localStorage.setItem('portal_refresh_token', token);
    } else {
      localStorage.removeItem('portal_refresh_token');
    }
  },

  clearTokens() {
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_refresh_token');
  },

  processQueue(error, token = null) {
    this.failedQueue.forEach(prom => {
      if (error) {
        prom.reject(error);
      } else {
        prom.resolve(token);
      }
    });
    this.failedQueue = [];
  },

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();

    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({}));

      // Si el Access Token expiró y no es la ruta de login/refresh, intentar renovar
      if (response.status === 401 && data.code === 'TOKEN_EXPIRED' && !endpoint.startsWith('/auth/refresh') && !endpoint.startsWith('/auth/login')) {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
          this.clearTokens();
          if (typeof Auth !== 'undefined') Auth.logout(false);
          throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
        }

        if (this.isRefreshing) {
          return new Promise((resolve, reject) => {
            this.failedQueue.push({ resolve, reject });
          }).then(newToken => {
            headers['Authorization'] = `Bearer ${newToken}`;
            return fetch(url, { ...options, headers }).then(res => res.json());
          });
        }

        this.isRefreshing = true;

        try {
          const refreshRes = await fetch(`${this.baseUrl}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
          });

          const refreshData = await refreshRes.json();

          if (!refreshRes.ok || !refreshData.token) {
            throw new Error(refreshData.error || 'No se pudo renovar la sesión');
          }

          this.setToken(refreshData.token);
          if (refreshData.refreshToken) {
            this.setRefreshToken(refreshData.refreshToken);
          }

          this.processQueue(null, refreshData.token);
          this.isRefreshing = false;

          // Reintentar la petición original con el nuevo token
          headers['Authorization'] = `Bearer ${refreshData.token}`;
          const retryResponse = await fetch(url, { ...options, headers });
          return await retryResponse.json();
        } catch (refreshErr) {
          this.processQueue(refreshErr, null);
          this.isRefreshing = false;
          this.clearTokens();
          if (typeof Auth !== 'undefined') Auth.logout(false);
          throw new Error('Tu sesión ha expirado. Inicia sesión nuevamente.');
        }
      }

      if (!response.ok) {
        const errorMessage = data.error || `Error ${response.status}: ${response.statusText}`;
        const err = new Error(errorMessage);
        err.status = response.status;
        err.data = data;
        throw err;
      }

      return data;
    } catch (error) {
      console.error(`[API Error] ${endpoint}:`, error.message);
      throw error;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
};

/**
 * Notificaciones Flotantes (Toasts)
 */
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: 'fa-solid fa-circle-check',
    error: 'fa-solid fa-triangle-exclamation',
    warning: 'fa-solid fa-circle-exclamation',
    info: 'fa-solid fa-circle-info'
  };

  toast.innerHTML = `
    <i class="${icons[type] || icons.info} toast-icon"></i>
    <span class="toast-msg">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
