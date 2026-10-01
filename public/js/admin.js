/**
 * Módulo de Administración: Usuarios, Roles Dinámicos (RBAC) y Bitácora
 */
const Admin = {
  allRoles: [],
  allPermissions: [],
  allUsers: [],
  auditLogs: [],
  activeTab: 'tabUsers',

  init() {
    this.bindEvents();
  },

  bindEvents() {
    // Pestañas de navegación interna
    const tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetId = e.currentTarget.getAttribute('data-tab');
        this.switchTab(targetId);
      });
    });

    // Búsqueda de usuarios
    const userSearchInput = document.getElementById('userSearchInput');
    if (userSearchInput) {
      userSearchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        const filtered = this.allUsers.filter(u =>
          u.nombre.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.nombre_rol.toLowerCase().includes(q)
        );
        this.renderUsersTable(filtered);
      });
    }

    // Filtros de Auditoría
    const auditSearch = document.getElementById('auditSearchInput');
    const auditActionFilter = document.getElementById('auditActionFilter');
    const btnRefreshAudit = document.getElementById('btnRefreshAudit');

    if (auditSearch) {
      let debounce;
      auditSearch.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => this.loadAuditLogs(), 300);
      });
    }

    if (auditActionFilter) {
      auditActionFilter.addEventListener('change', () => this.loadAuditLogs());
    }

    if (btnRefreshAudit) {
      btnRefreshAudit.addEventListener('click', () => {
        this.loadAuditLogs();
        showToast('Bitácora de auditoría actualizada', 'info');
      });
    }

    // Modal Crear Rol
    const btnCreateRoleOpen = document.getElementById('btnCreateRoleOpen');
    if (btnCreateRoleOpen) {
      btnCreateRoleOpen.addEventListener('click', () => {
        App.openModal('modalCreateRole');
      });
    }

    const createRoleForm = document.getElementById('createRoleForm');
    if (createRoleForm) {
      createRoleForm.addEventListener('submit', (e) => this.handleCreateRole(e));
    }
  },

  switchTab(tabId) {
    this.activeTab = tabId;

    document.querySelectorAll('.admin-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.admin-tab-pane').forEach(pane => {
      pane.style.display = pane.id === tabId ? 'block' : 'none';
    });

    if (tabId === 'tabUsers') this.loadUsers();
    if (tabId === 'tabRoles') this.loadRolesAndPermissions();
    if (tabId === 'tabAudit') this.loadAuditLogs();
  },

  async loadDashboard() {
    await Promise.all([
      this.loadUsers(),
      this.loadRolesAndPermissions(),
      this.loadAuditLogs()
    ]);
    this.updateStats();
  },

  updateStats() {
    const container = document.getElementById('adminQuickStats');
    if (!container) return;

    container.innerHTML = `
      <div class="stat-item">
        <span class="stat-number">${this.allUsers.length}</span>
        <span class="stat-name">Usuarios</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">${this.allRoles.length}</span>
        <span class="stat-name">Roles SQL</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">${this.auditLogs.length}</span>
        <span class="stat-name">Eventos</span>
      </div>
    `;
  },

  /**
   * 1. Directorio de Usuarios
   */
  async loadUsers() {
    try {
      const users = await API.get('/admin/usuarios');
      this.allUsers = users;
      this.renderUsersTable(users);
      this.updateStats();
    } catch (error) {
      console.error('Error al cargar usuarios:', error.message);
      showToast('Error al cargar la lista de usuarios', 'error');
    }
  },

  renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No se encontraron usuarios registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(user => `
      <tr>
        <td><strong>#${user.id}</strong></td>
        <td>
          <div class="user-row-name">
            <div class="user-avatar-sm">${user.nombre.charAt(0).toUpperCase()}</div>
            <span>${this.escapeHtml(user.nombre)}</span>
          </div>
        </td>
        <td><span class="text-dim">${this.escapeHtml(user.email)}</span></td>
        <td>
          <span class="badge ${this.getRoleBadgeStyle(user.nombre_rol)}">${user.nombre_rol}</span>
        </td>
        <td><span class="badge badge-count">${user.total_noticias}</span></td>
        <td><span class="text-dim text-sm">${this.formatDate(user.fecha_registro)}</span></td>
        <td>
          <select class="form-input form-input-sm role-select" onchange="Admin.handleRoleChange(${user.id}, this.value)">
            ${this.allRoles.map(r => `
              <option value="${r.id}" ${r.id === user.id_rol ? 'selected' : ''}>
                ${r.nombre_rol}
              </option>
            `).join('')}
          </select>
        </td>
      </tr>
    `).join('');
  },

  async handleRoleChange(userId, newRoleId) {
    try {
      const res = await API.put(`/admin/usuarios/${userId}/rol`, { id_rol: Number(newRoleId) });
      showToast(res.message || 'Rol actualizado correctamente', 'success');

      if (Auth.currentUser && Auth.currentUser.id === userId) {
        await Auth.init();
      }

      await this.loadUsers();
    } catch (error) {
      showToast(error.message || 'Error al actualizar el rol', 'error');
      this.loadUsers();
    }
  },

  /**
   * 2. Roles y Permisos Dinámicos
   */
  async loadRolesAndPermissions() {
    try {
      const [roles, permissions] = await Promise.all([
        API.get('/admin/roles'),
        API.get('/admin/permisos')
      ]);

      this.allRoles = roles;
      this.allPermissions = permissions;
      this.renderRolesMatrix(roles, permissions);
      this.updateStats();
    } catch (error) {
      console.error('Error al cargar roles y permisos:', error.message);
      showToast('Error al cargar los roles y permisos', 'error');
    }
  },

  renderRolesMatrix(roles, permissions) {
    const container = document.getElementById('rolesMatrixContainer');
    if (!container) return;

    container.innerHTML = roles.map(role => {
      const isSuperAdmin = role.nombre_rol === 'Administrador';
      const assignedPermIds = (role.permisos || []).map(p => p.id_permiso || p.id);

      return `
        <div class="role-card" data-role-id="${role.id}">
          <div class="role-card-header">
            <div class="role-title">
              <i class="fa-solid ${isSuperAdmin ? 'fa-crown text-warning' : 'fa-shield'}"></i>
              <span>${this.escapeHtml(role.nombre_rol)}</span>
            </div>
            <span class="badge ${this.getRoleBadgeStyle(role.nombre_rol)}">
              ${isSuperAdmin ? 'Acceso Total (*)' : `${assignedPermIds.length} / ${permissions.length} Permisos`}
            </span>
          </div>

          <p class="role-description">${this.escapeHtml(role.descripcion || 'Sin descripción asignada')}</p>

          <div class="perm-list">
            ${permissions.map(perm => {
              const isChecked = isSuperAdmin || assignedPermIds.includes(perm.id);
              const isDisabled = isSuperAdmin;

              return `
                <div class="perm-item">
                  <div class="perm-text">
                    <span class="perm-code"><code>${perm.nombre_permiso}</code></span>
                    <span class="perm-label">${perm.descripcion}</span>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox"
                           data-perm-id="${perm.id}"
                           ${isChecked ? 'checked' : ''}
                           ${isDisabled ? 'disabled' : ''}
                           onchange="Admin.handleTogglePermission(${role.id})">
                    <span class="slider"></span>
                  </label>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  },

  async handleTogglePermission(roleId) {
    const roleCard = document.querySelector(`.role-card[data-role-id="${roleId}"]`);
    if (!roleCard) return;

    const checkedInputs = roleCard.querySelectorAll('input[type="checkbox"]:checked');
    const selectedPermIds = Array.from(checkedInputs).map(cb => Number(cb.getAttribute('data-perm-id')));

    try {
      const res = await API.put(`/admin/roles/${roleId}/permisos`, {
        permisos_ids: selectedPermIds
      });
      showToast(res.message || 'Permisos actualizados dinámicamente', 'success');

      if (Auth.currentUser && Auth.currentUser.id_rol === roleId) {
        await Auth.init();
      }

      await this.loadRolesAndPermissions();
    } catch (error) {
      showToast(error.message || 'Error al actualizar permisos', 'error');
      this.loadRolesAndPermissions();
    }
  },

  async handleCreateRole(e) {
    e.preventDefault();
    const roleName = document.getElementById('roleName').value.trim();
    const roleDesc = document.getElementById('roleDesc').value.trim();

    if (!roleName) {
      showToast('El nombre del rol es obligatorio', 'warning');
      return;
    }

    try {
      await API.post('/admin/roles', {
        nombre_rol: roleName,
        descripcion: roleDesc
      });

      showToast(`Rol "${roleName}" creado exitosamente`, 'success');
      App.closeModal('modalCreateRole');
      document.getElementById('createRoleForm').reset();
      this.loadRolesAndPermissions();
    } catch (error) {
      showToast(error.message || 'Error al crear el rol', 'error');
    }
  },

  /**
   * 3. Bitácora de Auditoría
   */
  async loadAuditLogs() {
    try {
      const search = document.getElementById('auditSearchInput')?.value || '';
      const accion = document.getElementById('auditActionFilter')?.value || 'Todas';

      let endpoint = '/admin/auditoria?';
      if (search) endpoint += `search=${encodeURIComponent(search)}&`;
      if (accion && accion !== 'Todas') endpoint += `accion=${encodeURIComponent(accion)}&`;

      const logs = await API.get(endpoint);
      this.auditLogs = logs;
      this.renderAuditTable(logs);
      this.updateStats();
    } catch (error) {
      console.error('Error al cargar auditoría:', error.message);
      showToast('Error al consultar la bitácora de auditoría', 'error');
    }
  },

  renderAuditTable(logs) {
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No se encontraron eventos en la bitácora.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(log => `
      <tr>
        <td><strong class="text-dim">#${log.id}</strong></td>
        <td>
          <div class="audit-time">
            <i class="fa-regular fa-clock"></i> ${this.formatDateTime(log.fecha_hora)}
          </div>
        </td>
        <td>
          <div class="audit-user">
            <span class="audit-user-name">${log.usuario_nombre ? this.escapeHtml(log.usuario_nombre) : '<em>Sistema / Anónimo</em>'}</span>
            ${log.usuario_email ? `<span class="audit-user-email">${this.escapeHtml(log.usuario_email)}</span>` : ''}
          </div>
        </td>
        <td>
          ${log.usuario_rol ? `<span class="badge ${this.getRoleBadgeStyle(log.usuario_rol)}">${log.usuario_rol}</span>` : '-'}
        </td>
        <td>
          <span class="audit-action-tag">${this.escapeHtml(log.accion)}</span>
        </td>
        <td>
          <span class="audit-detail">${this.escapeHtml(log.detalles || '-')}</span>
        </td>
        <td>
          <code class="audit-ip">${log.ip || '127.0.0.1'}</code>
        </td>
      </tr>
    `).join('');
  },

  getRoleBadgeStyle(roleName) {
    switch (roleName) {
      case 'Administrador': return 'badge-admin';
      case 'Editor': return 'badge-editor';
      default: return 'badge-regular';
    }
  },

  formatDate(isoString) {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return isoString;
    }
  },

  formatDateTime(isoString) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return `${d.toLocaleDateString('es-ES')} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    } catch {
      return isoString;
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
