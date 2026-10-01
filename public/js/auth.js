/**
 * Módulo de Autenticación, Control de Sesión y Perfil
 */
const Auth = {
  currentUser: null,
  currentPermissions: [],

  hasPermission(permName) {
    if (!this.currentUser) return false;
    if (this.currentUser.nombre_rol === 'Administrador') return true;
    if (this.currentPermissions.includes('*')) return true;
    return this.currentPermissions.includes(permName);
  },

  async init() {
    const token = API.getToken();
    const refreshToken = API.getRefreshToken();

    if (!token && !refreshToken) {
      this.currentUser = null;
      this.currentPermissions = [];
      this.updateAuthUI();
      return;
    }

    try {
      const data = await API.get('/auth/me');
      this.currentUser = data.user;
      this.currentPermissions = data.permissions || [];
      this.updateAuthUI();
    } catch (error) {
      console.warn('No se pudo restaurar la sesión:', error.message);
      this.logout(false);
    }
  },

  async login(email, password) {
    try {
      const data = await API.post('/auth/login', { email, password });
      API.setToken(data.token);
      if (data.refreshToken) {
        API.setRefreshToken(data.refreshToken);
      }
      this.currentUser = data.user;
      this.currentPermissions = data.permissions || [];
      this.updateAuthUI();
      showToast(`Bienvenido, ${data.user.nombre}`, 'success');

      if (typeof News !== 'undefined') {
        News.loadNews();
      }
      return true;
    } catch (error) {
      showToast(error.message || 'Error al iniciar sesión', 'error');
      return false;
    }
  },

  async register(nombre, email, password) {
    try {
      const data = await API.post('/auth/register', { nombre, email, password });
      API.setToken(data.token);
      if (data.refreshToken) {
        API.setRefreshToken(data.refreshToken);
      }
      this.currentUser = data.user;
      this.currentPermissions = data.permissions || [];
      this.updateAuthUI();
      showToast('Cuenta creada exitosamente', 'success');

      if (typeof News !== 'undefined') {
        News.loadNews();
      }
      return true;
    } catch (error) {
      showToast(error.message || 'Error al registrarse', 'error');
      return false;
    }
  },

  async changePassword(currentPassword, newPassword) {
    try {
      const data = await API.post('/auth/change-password', {
        currentPassword,
        newPassword
      });
      showToast(data.message || 'Contraseña actualizada correctamente', 'success');
      return true;
    } catch (error) {
      showToast(error.message || 'Error al cambiar contraseña', 'error');
      return false;
    }
  },

  async forgotPassword(email) {
    try {
      const data = await API.post('/auth/forgot-password', { email });
      showToast(data.message, 'info', 6000);
      return true;
    } catch (error) {
      showToast(error.message || 'Error al solicitar código', 'error');
      return false;
    }
  },

  async resetPassword(email, resetCode, newPassword) {
    try {
      const data = await API.post('/auth/reset-password', {
        email,
        resetCode,
        newPassword
      });
      showToast(data.message, 'success', 5000);
      return true;
    } catch (error) {
      showToast(error.message || 'Error al restablecer contraseña', 'error');
      return false;
    }
  },

  async logout(showNotification = true) {
    const refreshToken = API.getRefreshToken();
    if (refreshToken) {
      try {
        await API.post('/auth/logout', { refreshToken });
      } catch (err) {
        // Ignorar fallo al revocar
      }
    }

    API.clearTokens();
    this.currentUser = null;
    this.currentPermissions = [];
    this.updateAuthUI();

    if (typeof App !== 'undefined') {
      App.switchView('portal');
    }

    if (typeof News !== 'undefined') {
      News.loadNews();
    }

    if (showNotification) {
      showToast('Has cerrado sesión correctamente', 'info');
    }
  },

  // Perfiles de prueba predeterminados para revisión académica
  async quickLogin(roleType) {
    const creds = {
      admin: { email: 'admin@portalnoticias.com', pass: 'Admin123!' },
      editor: { email: 'editor@portalnoticias.com', pass: 'Editor123!' },
      lector: { email: 'lector@portalnoticias.com', pass: 'Lector123!' }
    };

    const target = creds[roleType];
    if (!target) return;

    showToast(`Iniciando sesión como ${roleType}...`, 'info', 1500);
    await this.login(target.email, target.pass);
  },

  updateAuthUI() {
    const guestButtons = document.getElementById('guestButtons');
    const userProfileBadge = document.getElementById('userProfileBadge');
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userRoleBadge = document.getElementById('userRoleBadge');
    const userAvatar = document.getElementById('userAvatar');
    const btnNavNewArticle = document.getElementById('btnNavNewArticle');
    const btnNavAdmin = document.getElementById('btnNavAdmin');

    if (this.currentUser) {
      if (guestButtons) guestButtons.style.display = 'none';
      if (userProfileBadge) userProfileBadge.style.display = 'flex';
      if (userNameDisplay) userNameDisplay.textContent = this.currentUser.nombre;
      if (userRoleBadge) {
        userRoleBadge.textContent = this.currentUser.nombre_rol;
        userRoleBadge.className = `user-role-badge ${this.getRoleBadgeClass(this.currentUser.nombre_rol)}`;
      }
      if (userAvatar) userAvatar.textContent = this.currentUser.nombre.charAt(0).toUpperCase();

      // Botón "Publicar Noticia" (permiso noticias.crear)
      if (btnNavNewArticle) {
        btnNavNewArticle.style.display = this.hasPermission('noticias.crear') ? 'inline-flex' : 'none';
      }

      // Botón "Panel de Control" (permisos de gestión)
      const canAccessAdmin = this.hasPermission('usuarios.gestionar') ||
                             this.hasPermission('roles.gestionar') ||
                             this.hasPermission('auditoria.ver');

      if (btnNavAdmin) {
        btnNavAdmin.style.display = canAccessAdmin ? 'inline-flex' : 'none';
      }

    } else {
      if (guestButtons) guestButtons.style.display = 'flex';
      if (userProfileBadge) userProfileBadge.style.display = 'none';
      if (btnNavNewArticle) btnNavNewArticle.style.display = 'none';
      if (btnNavAdmin) btnNavAdmin.style.display = 'none';
    }
  },

  getRoleBadgeClass(roleName) {
    switch (roleName) {
      case 'Administrador': return 'badge-admin';
      case 'Editor': return 'badge-editor';
      default: return 'badge-regular';
    }
  }
};
