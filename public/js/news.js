/**
 * Módulo de Noticias: Portal Público, Filtros y Operaciones CRUD
 */
const News = {
  currentCategory: 'Todas',
  searchQuery: '',
  articlesList: [],

  init() {
    this.bindEvents();
    this.loadNews();
  },

  bindEvents() {
    // Filtros por Categoría
    const catButtons = document.querySelectorAll('.category-pill');
    catButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        catButtons.forEach(b => b.classList.remove('active'));
        const targetBtn = e.currentTarget;
        targetBtn.classList.add('active');
        this.currentCategory = targetBtn.getAttribute('data-cat') || 'Todas';
        this.loadNews();
      });
    });

    // Búsqueda en Vivo
    const searchInput = document.getElementById('searchInput');
    const searchClearBtn = document.getElementById('searchClearBtn');

    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const val = e.target.value.trim();
        if (searchClearBtn) searchClearBtn.style.display = val ? 'block' : 'none';

        debounceTimer = setTimeout(() => {
          this.searchQuery = val;
          this.loadNews();
        }, 300);
      });
    }

    if (searchClearBtn && searchInput) {
      searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchClearBtn.style.display = 'none';
        this.searchQuery = '';
        this.loadNews();
      });
    }

    // Botón Restablecer Filtros
    const btnResetFilters = document.getElementById('btnResetFilters');
    if (btnResetFilters) {
      btnResetFilters.addEventListener('click', () => {
        this.currentCategory = 'Todas';
        this.searchQuery = '';
        if (searchInput) searchInput.value = '';
        if (searchClearBtn) searchClearBtn.style.display = 'none';
        document.querySelectorAll('.category-pill').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-cat') === 'Todas');
        });
        this.loadNews();
      });
    }

    // Selector de imágenes de muestra
    const presetSelect = document.getElementById('articlePresetImg');
    const imgUrlInput = document.getElementById('articleImgUrl');
    if (presetSelect && imgUrlInput) {
      presetSelect.addEventListener('change', () => {
        if (presetSelect.value) {
          imgUrlInput.value = presetSelect.value;
        }
      });
    }

    // Formulario de Noticia (Crear / Actualizar)
    const articleForm = document.getElementById('articleForm');
    if (articleForm) {
      articleForm.addEventListener('submit', (e) => this.handleSaveArticle(e));
    }
  },

  async loadNews() {
    try {
      let endpoint = '/noticias?';
      if (this.currentCategory && this.currentCategory !== 'Todas') {
        endpoint += `categoria=${encodeURIComponent(this.currentCategory)}&`;
      }
      if (this.searchQuery) {
        endpoint += `search=${encodeURIComponent(this.searchQuery)}&`;
      }

      const articles = await API.get(endpoint);
      this.articlesList = articles;
      this.renderNews(articles);
    } catch (error) {
      console.error('Error al cargar noticias:', error.message);
      showToast('No se pudieron cargar las noticias', 'error');
    }
  },

  renderNews(articles) {
    const featuredHero = document.getElementById('featuredHero');
    const newsGrid = document.getElementById('newsGrid');
    const emptyState = document.getElementById('emptyState');
    const newsCountBadge = document.getElementById('newsCountBadge');

    if (newsCountBadge) {
      newsCountBadge.textContent = `${articles.length} ${articles.length === 1 ? 'artículo' : 'artículos'}`;
    }

    if (!articles || articles.length === 0) {
      if (featuredHero) featuredHero.style.display = 'none';
      if (newsGrid) newsGrid.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // 1. Noticia Principal (Destacada)
    if (!this.searchQuery && this.currentCategory === 'Todas' && articles.length > 0) {
      const heroArticle = articles[0];
      if (featuredHero) {
        featuredHero.style.display = 'grid';
        const heroImg = document.getElementById('heroImage');
        const heroCat = document.getElementById('heroCategory');
        const heroTitle = document.getElementById('heroTitle');
        const heroExcerpt = document.getElementById('heroExcerpt');
        const heroAuthor = document.getElementById('heroAuthor');
        const heroDate = document.getElementById('heroDate');
        const heroReadBtn = document.getElementById('heroReadBtn');

        if (heroImg) heroImg.style.backgroundImage = `url('${heroArticle.imagen_url}')`;
        if (heroCat) heroCat.textContent = heroArticle.categoria;
        if (heroTitle) heroTitle.textContent = heroArticle.titulo;
        if (heroExcerpt) heroExcerpt.textContent = heroArticle.contenido;
        if (heroAuthor) heroAuthor.innerHTML = `<i class="fa-solid fa-user-pen"></i> ${heroArticle.autor_nombre}`;
        if (heroDate) heroDate.innerHTML = `<i class="fa-regular fa-clock"></i> ${this.formatDate(heroArticle.fecha_creacion)}`;

        if (heroReadBtn) {
          heroReadBtn.onclick = () => this.openReader(heroArticle.id);
        }
      }
    } else {
      if (featuredHero) featuredHero.style.display = 'none';
    }

    // 2. Renderizar Cuadrícula de Noticias
    if (newsGrid) {
      const canEdit = Auth.hasPermission('noticias.editar');
      const canDelete = Auth.hasPermission('noticias.eliminar');

      // Si hay hero visible, omitir el primer elemento de la cuadrícula
      const itemsToRender = (!this.searchQuery && this.currentCategory === 'Todas' && articles.length > 1)
        ? articles.slice(1)
        : articles;

      newsGrid.innerHTML = itemsToRender.map(item => {
        const isAuthorOrAdmin = Auth.currentUser && (Auth.currentUser.nombre_rol === 'Administrador' || Auth.currentUser.id === item.id_autor);
        const showEditBtn = canEdit && isAuthorOrAdmin;
        const showDeleteBtn = canDelete && isAuthorOrAdmin;

        return `
          <article class="article-card" data-id="${item.id}">
            <div class="article-card-media">
              <img src="${item.imagen_url}" alt="${this.escapeHtml(item.titulo)}" class="article-card-img" loading="lazy">
              <span class="badge badge-category-overlay">${item.categoria}</span>

              ${(showEditBtn || showDeleteBtn) ? `
                <div class="card-admin-actions">
                  ${showEditBtn ? `
                    <button class="btn-card-icon edit" onclick="News.openEditor(${item.id})" title="Editar Noticia">
                      <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                  ` : ''}
                  ${showDeleteBtn ? `
                    <button class="btn-card-icon delete" onclick="News.confirmDelete(${item.id})" title="Eliminar Noticia">
                      <i class="fa-solid fa-trash-can"></i>
                    </button>
                  ` : ''}
                </div>
              ` : ''}
            </div>
            <div class="article-card-body">
              <div class="article-card-date">
                <i class="fa-regular fa-calendar"></i> ${this.formatDate(item.fecha_creacion)}
              </div>
              <h4 class="article-card-title" onclick="News.openReader(${item.id})">${this.escapeHtml(item.titulo)}</h4>
              <p class="article-card-text">${this.escapeHtml(item.contenido)}</p>
              <div class="article-card-footer">
                <div class="article-card-author">
                  <i class="fa-solid fa-user-pen"></i>
                  <span>${this.escapeHtml(item.autor_nombre)}</span>
                </div>
                <button class="btn-read-more" onclick="News.openReader(${item.id})">
                  Leer <i class="fa-solid fa-arrow-right"></i>
                </button>
              </div>
            </div>
          </article>
        `;
      }).join('');
    }
  },

  async openReader(id) {
    try {
      const article = await API.get(`/noticias/${id}`);
      const modal = document.getElementById('modalArticleReader');
      if (!modal) return;

      document.getElementById('readerImg').src = article.imagen_url;
      document.getElementById('readerCategory').textContent = article.categoria;
      document.getElementById('readerTitle').textContent = article.titulo;
      document.getElementById('readerDate').innerHTML = `<i class="fa-regular fa-calendar"></i> ${this.formatDate(article.fecha_creacion)}`;
      document.getElementById('readerAuthor').innerHTML = `<i class="fa-solid fa-user-pen"></i> ${article.autor_nombre} (${article.autor_rol})`;
      document.getElementById('readerContent').textContent = article.contenido;

      App.openModal('modalArticleReader');
    } catch (error) {
      showToast('Error al abrir el artículo', 'error');
    }
  },

  openEditor(id = null) {
    if (!Auth.hasPermission('noticias.crear') && !id) {
      showToast('No tienes permiso para publicar noticias', 'error');
      return;
    }

    const modal = document.getElementById('modalArticleEditor');
    const form = document.getElementById('articleForm');
    const titleHeader = document.getElementById('editorModalTitle');
    const editIdInput = document.getElementById('editArticleId');
    if (!modal || !form) return;

    form.reset();

    if (id) {
      const item = this.articlesList.find(a => a.id === id);
      if (!item) return;

      titleHeader.innerHTML = '<i class="fa-solid fa-pen-nib"></i> Editar Noticia';
      editIdInput.value = item.id;
      document.getElementById('articleTitle').value = item.titulo;
      document.getElementById('articleCategory').value = item.categoria;
      document.getElementById('articleImgUrl').value = item.imagen_url;
      document.getElementById('articleContent').value = item.contenido;
    } else {
      titleHeader.innerHTML = '<i class="fa-solid fa-pen-nib"></i> Redactar Noticia';
      editIdInput.value = '';
    }

    App.openModal('modalArticleEditor');
  },

  async handleSaveArticle(e) {
    e.preventDefault();
    const editId = document.getElementById('editArticleId').value;
    const titulo = document.getElementById('articleTitle').value.trim();
    const categoria = document.getElementById('articleCategory').value;
    const imagen_url = document.getElementById('articleImgUrl').value.trim();
    const contenido = document.getElementById('articleContent').value.trim();

    if (!titulo || !contenido) {
      showToast('Por favor completa todos los campos requeridos', 'warning');
      return;
    }

    const submitBtn = document.getElementById('btnSaveArticle');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

    try {
      if (editId) {
        await API.put(`/noticias/${editId}`, {
          titulo,
          categoria,
          imagen_url,
          contenido
        });
        showToast('Noticia actualizada exitosamente', 'success');
      } else {
        await API.post('/noticias', {
          titulo,
          categoria,
          imagen_url,
          contenido
        });
        showToast('Noticia publicada con éxito', 'success');
      }

      App.closeModal('modalArticleEditor');
      this.loadNews();
    } catch (error) {
      showToast(error.message || 'Error al guardar la noticia', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = editId ? 'Guardar Cambios' : 'Publicar Noticia';
    }
  },

  async confirmDelete(id) {
    if (!confirm('¿Deseas eliminar este artículo? Esta acción quedará asentada en la bitácora de auditoría.')) {
      return;
    }

    try {
      await API.delete(`/noticias/${id}`);
      showToast('Noticia eliminada correctamente', 'info');
      this.loadNews();
    } catch (error) {
      showToast(error.message || 'Error al eliminar noticia', 'error');
    }
  },

  formatDate(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
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
