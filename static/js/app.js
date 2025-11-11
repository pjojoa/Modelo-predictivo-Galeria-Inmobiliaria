// Variables globales
let map;
// Exponer map globalmente para street-preview.js
window.map = null; // Se asignará después de initMap()
let markers = [];
let markerCluster;
let proyectosData = [];
let proyectosDataOriginal = []; // Datos originales sin filtrar
let proyectosDataSorted = []; // Datos ordenados para la tabla
let currentFilters = {
    clasificacion: 'Todos',
    zona: 'Todas',
    barrio: 'Todos',
    tipo_vis: 'Todos',
    estado: 'Activos',  // Por defecto: Activos
    precio_min: null,
    precio_max: null,
    area_min: null,
    area_max: null,
    search_query: ''
};
let tableSort = {
    column: null,
    direction: 'asc' // 'asc' o 'desc'
};

// Variable global para el gráfico circular
let pieChart = null;

// Variables globales para controles del mapa
let currentBaseLayer = null;
let baseLayers = {};
let heatmapLayer = null;
let clustersEnabled = true;
let heatmapEnabled = false;
let markersEnabled = true; // Por defecto los marcadores están visibles
let heatmapDebounceTimer = null;
let markerColorCriterion = 'clasificacion'; // Criterio para colorear marcadores

// Variables para filtrado de categorías (selección múltiple con Ctrl)
let selectedCategories = new Set(); // IDs de las categorías seleccionadas (Set para múltiples selecciones)
let allCategories = []; // Todas las categorías disponibles

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    loadFiltros();
    loadProyectos();
    loadCaracteristicasExitosos();
    loadRankingConstructores('Activos');
    setupEventListeners();
    setupTabs();
    setupSidebarControls();
    setupMapControls();
    loadMapStateFromURL();
    setupStreetPreview();
    setupToolbarToggle();
    setupMarkerLegendToggle();
    setupCategoriesPanel();
    setupInfoModal();
    setupFilterControlsExtras();
});

// Configurar vista previa 360°
function setupStreetPreview() {
    const closeBtn = document.getElementById('street-preview-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            if (window.streetPreview && window.streetPreview.closeStreetPreview) {
                window.streetPreview.closeStreetPreview();
            }
        });
        
        // Navegación con teclado
        closeBtn.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (window.streetPreview && window.streetPreview.closeStreetPreview) {
                    window.streetPreview.closeStreetPreview();
                }
            }
        });
    }
}

// Filtros: Área y Búsqueda de Proyecto
function setupFilterControlsExtras() {
    const searchInput = document.getElementById('proyecto_search');
    const searchClear = document.getElementById('proyecto_search_clear');
    const areaMin = document.getElementById('area_min');
    const areaMax = document.getElementById('area_max');
    const areaApply = document.getElementById('aplicar_area');
    const areaClear = document.getElementById('limpiar_area');
    const areaInfo = document.getElementById('area_range_info');

    if (searchInput && searchClear) {
        searchInput.addEventListener('input', () => {
            currentFilters.search_query = (searchInput.value || '').trim().toLowerCase();
            searchClear.style.display = currentFilters.search_query ? 'inline-flex' : 'none';
            applyAllFiltersAndRender();
        });
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            currentFilters.search_query = '';
            searchClear.style.display = 'none';
            applyAllFiltersAndRender();
        });
    }

    function updateAreaInfo() {
        const min = areaMin && areaMin.value !== '' ? parseFloat(areaMin.value) : null;
        const max = areaMax && areaMax.value !== '' ? parseFloat(areaMax.value) : null;
        if (areaInfo) {
            if (min === null && max === null) {
                areaInfo.textContent = 'Rango completo disponible';
            } else if (min !== null && max === null) {
                areaInfo.textContent = `Desde ${min.toFixed(1)} m²`;
            } else if (min === null && max !== null) {
                areaInfo.textContent = `Hasta ${max.toFixed(1)} m²`;
            } else {
                areaInfo.textContent = `${min.toFixed(1)} – ${max.toFixed(1)} m²`;
            }
        }
    }

    if (areaMin) areaMin.addEventListener('input', updateAreaInfo);
    if (areaMax) areaMax.addEventListener('input', updateAreaInfo);

    if (areaApply) {
        areaApply.addEventListener('click', () => {
            currentFilters.area_min = areaMin && areaMin.value !== '' ? parseFloat(areaMin.value) : null;
            currentFilters.area_max = areaMax && areaMax.value !== '' ? parseFloat(areaMax.value) : null;
            updateAreaInfo();
            applyAllFiltersAndRender();
        });
    }
    if (areaClear) {
        areaClear.addEventListener('click', () => {
            if (areaMin) areaMin.value = '';
            if (areaMax) areaMax.value = '';
            currentFilters.area_min = null;
            currentFilters.area_max = null;
            updateAreaInfo();
            applyAllFiltersAndRender();
        });
    }
}

// Pipeline de filtrado (tabla + mapa si es posible)
function applyAllFiltersAndRender() {
    try {
        let filtered = Array.isArray(proyectosDataOriginal) ? [...proyectosDataOriginal] : [];

        // Filtro por búsqueda (nombre de proyecto)
        if (currentFilters.search_query) {
            filtered = filtered.filter(p =>
                (String(p.Proyecto || p.nombre || '').toLowerCase().includes(currentFilters.search_query))
            );
        }
        // Filtro por área
        if (currentFilters.area_min !== null || currentFilters.area_max !== null) {
            filtered = filtered.filter(p => {
                const area = parseFloat(p.area_promedio || p.Area || p['Área (m²)'] || p['Área'] || p.area);
                if (Number.isNaN(area)) return false;
                if (currentFilters.area_min !== null && area < currentFilters.area_min) return false;
                if (currentFilters.area_max !== null && area > currentFilters.area_max) return false;
                return true;
            });
        }

        // Asignar y renderizar si existen funciones de render ya definidas
        proyectosData = filtered;

        if (typeof updateMap === 'function') {
            updateMap(); // re-pinta el mapa con proyectosData
        }
        if (typeof renderProjectsTable === 'function') {
            renderProjectsTable(proyectosData);
        } else {
            // Fallback: actualizar contador si existe
            const countEl = document.getElementById('map-count');
            if (countEl) countEl.textContent = String(proyectosData.length || 0);
        }

        // Actualizar tabla de vista previa de datos
        if (typeof updateTable === 'function') {
            updateTable();
        }

        // Recalcular ranking si aplica
        if (typeof loadRankingConstructores === 'function') {
            // Mantener filtro de estado actual
            loadRankingConstructores(currentFilters.estado || 'Activos');
        }
    } catch (e) {
        console.warn('[applyAllFiltersAndRender] No se pudo aplicar filtros:', e);
    }
}

// Configurar colapso/expansión del toolbar
function setupToolbarToggle() {
    const toolbar = document.getElementById('map-controls-toolbar');
    const toggleBtn = document.getElementById('toolbar-toggle');
    const toolbarContent = document.getElementById('toolbar-content');
    
    if (!toolbar || !toggleBtn || !toolbarContent) {
        return;
    }
    
    // Cargar estado guardado
    const isCollapsed = localStorage.getItem('toolbarCollapsed') === 'true';
    if (isCollapsed) {
        toolbar.classList.add('collapsed');
    }
    
    toggleBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toolbar.classList.toggle('collapsed');
        const collapsed = toolbar.classList.contains('collapsed');
        localStorage.setItem('toolbarCollapsed', collapsed);
        
        // Actualizar icono
        const icon = toggleBtn.querySelector('i');
        if (icon) {
            icon.style.transform = collapsed ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    });
}

// Configurar sistema de pestañas
function setupTabs() {
    // Pestañas del sidebar
    const sidebarTabButtons = document.querySelectorAll('.sidebar-tab');
    const sidebarTabContents = document.querySelectorAll('.tab-pane');
    
    sidebarTabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Remover clase active de todos los botones y contenidos
            sidebarTabButtons.forEach(btn => btn.classList.remove('active'));
            sidebarTabContents.forEach(content => content.classList.remove('active'));
            
            // Agregar clase active al botón y contenido seleccionado
            button.classList.add('active');
            const targetPane = document.getElementById(`tab-${targetTab}`);
            if (targetPane) {
                targetPane.classList.add('active');
            }
        });
    });
    
    // Pestañas de Tabla/Características
    const mainTabButtons = document.querySelectorAll('.tabs-header .tab-button');
    const mainTabContents = document.querySelectorAll('.tabs-container .tab-content');
    
    mainTabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Remover clase active de todos los botones y contenidos
            mainTabButtons.forEach(btn => btn.classList.remove('active'));
            mainTabContents.forEach(content => content.classList.remove('active'));
            
            // Agregar clase active al botón y contenido seleccionado
            button.classList.add('active');
            const targetPane = document.getElementById(`tab-${targetTab}`);
            if (targetPane) {
                targetPane.classList.add('active');
                
                // Si se selecciona la pestaña de características, cargar los datos
                if (targetTab === 'caracteristicas') {
                    loadCaracteristicasExitosos();
                }
            }
        });
    });
}

// Configurar panel off-canvas con accesibilidad completa
function setupSidebarControls() {
    console.log('[setupSidebarControls] INICIANDO función...');
    
    const panel = document.getElementById('sidebar');
    const toggle = document.getElementById('togglePanelBtn');
    const backdrop = document.getElementById('panelBackdrop');
    const resizeHandle = document.getElementById('sidebar-resize-handle');
    const main = document.querySelector('.main-content') || document.body;
    
    console.log('[setupSidebarControls] Búsqueda de elementos:', {
        panel: panel,
        toggle: toggle,
        backdrop: backdrop,
        closeBtn: closeBtn,
        panelExists: !!panel,
        toggleExists: !!toggle,
        backdropExists: !!backdrop
    });
    
    if (!panel) {
        console.error('[setupSidebarControls] ERROR CRÍTICO: No se encontró el panel #sidebar');
        console.error('[setupSidebarControls] Intentando buscar de otra forma...');
        const allAsides = document.querySelectorAll('aside');
        console.log('[setupSidebarControls] Todos los elementos <aside> encontrados:', allAsides);
        return;
    }
    
    if (!toggle) {
        console.error('[setupSidebarControls] ERROR CRÍTICO: No se encontró el botón #togglePanelBtn');
        return;
    }
    
    if (!backdrop) {
        console.error('[setupSidebarControls] ERROR: No se encontró el backdrop #panelBackdrop');
        // Continuar de todas formas
    }
    
    console.log('[setupSidebarControls] Todos los elementos encontrados, inicializando panel off-canvas');
    
    let lastFocused = null;
    
    function openPanel() {
        console.log('[setupSidebarControls] Abriendo panel');
        if (panel.classList.contains('is-open')) {
            console.log('[setupSidebarControls] Panel ya está abierto');
            return;
        }
        
        lastFocused = document.activeElement;
        
        // Obtener ancho actual (del localStorage o por defecto)
        const currentWidth = parseInt(localStorage.getItem('sidebarWidth')) || 529;
        
        // Aplicar estilos para panel ANCLADO (ocupa espacio en el layout)
        panel.style.setProperty('position', 'fixed', 'important');
        panel.style.setProperty('left', '0', 'important');
        panel.style.setProperty('top', '0', 'important');
        panel.style.setProperty('bottom', '0', 'important');
        panel.style.setProperty('height', '100vh', 'important');
        panel.style.setProperty('transform', 'translateX(0)', 'important');
        panel.style.setProperty('visibility', 'visible', 'important');
        panel.style.setProperty('opacity', '1', 'important');
        panel.style.setProperty('display', 'flex', 'important');
        panel.style.setProperty('z-index', '10000', 'important');
        panel.style.setProperty('overflow', 'hidden', 'important');
        panel.style.setProperty('min-width', '280px', 'important');
        panel.style.setProperty('max-width', '90vw', 'important');
        panel.style.setProperty('width', currentWidth + 'px', 'important');
        
        // Actualizar variable CSS para que el contenido se ajuste
        document.documentElement.style.setProperty('--panel-width', currentWidth + 'px');
        
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
        panel.removeAttribute('hidden');
        
        // Ajustar el contenido principal para que se desplace
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.style.setProperty('margin-left', currentWidth + 'px', 'important');
            mainContent.style.setProperty('transition', 'margin-left var(--panel-ease)', 'important');
        }
        
        // Backdrop deshabilitado - no oscurecer el fondo
        backdrop.hidden = true;
        backdrop.setAttribute('aria-hidden', 'true');
        backdrop.style.cssText = `
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
        `;
        backdrop.classList.remove('is-visible');
        
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('title', 'Ocultar Panel');
        // Mover botón cuando el panel se abre (usar el ancho actual del panel)
        const panelWidth = panel.offsetWidth || parseInt(getComputedStyle(panel).width) || parseInt(localStorage.getItem('sidebarWidth')) || 529;
        toggle.style.setProperty('left', panelWidth + 'px', 'important');
        toggle.style.setProperty('transform', 'translateY(-50%) rotate(180deg)', 'important');
        
        // Asegurar que el handle de redimensionamiento sea visible y funcional
        const resizeHandle = document.getElementById('sidebar-resize-handle');
        if (resizeHandle) {
            resizeHandle.style.cssText = `
                position: absolute !important;
                right: 0 !important;
                top: 0 !important;
                bottom: 0 !important;
                width: 6px !important;
                cursor: ew-resize !important;
                z-index: 10001 !important;
                background: rgba(45, 90, 160, 0.05) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                pointer-events: auto !important;
                visibility: visible !important;
                opacity: 1 !important;
                border-left: 1px solid rgba(45, 90, 160, 0.3) !important;
            `;
            
            // Asegurar que el icono sea visible
            const handleIcon = resizeHandle.querySelector('i');
            if (handleIcon) {
                handleIcon.style.cssText = `
                    color: rgba(45, 90, 160, 0.6) !important;
                    font-size: 0.9rem !important;
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                `;
            }
            
            console.log('[Resize] Handle visible cuando el panel se abre:', {
                handle: resizeHandle,
                icon: handleIcon,
                handleDisplay: window.getComputedStyle(resizeHandle).display,
                iconDisplay: handleIcon ? window.getComputedStyle(handleIcon).display : 'no icon'
            });
        }
        
        document.body.classList.add('panel-open');
        
        // NO aplicar inert al contenido principal cuando está anclado (permite interacción)
        // El panel anclado no bloquea el contenido, solo lo desplaza
        
        // Enfoque inicial en el primer elemento enfocable del panel
        setTimeout(() => {
            const focusable = panel.querySelector('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable) {
                focusable.focus();
            } else {
                panel.focus();
            }
        }, 100);
        
        console.log('[setupSidebarControls] Panel abierto - estilos aplicados:', {
            transform: window.getComputedStyle(panel).transform,
            visibility: window.getComputedStyle(panel).visibility,
            opacity: window.getComputedStyle(panel).opacity,
            zIndex: window.getComputedStyle(panel).zIndex
        });
    }
    
    function closePanel() {
        console.log('[setupSidebarControls] Cerrando panel');
        if (!panel.classList.contains('is-open')) {
            console.log('[setupSidebarControls] Panel ya está cerrado');
            return;
        }
        
        // Mantener el ancho actual al cerrar (no resetear)
        const currentWidth = panel.offsetWidth || parseInt(localStorage.getItem('sidebarWidth')) || 529;
        
        // Ocultar el panel (solo se oculta, no se ancla)
        panel.style.setProperty('position', 'fixed', 'important');
        panel.style.setProperty('left', '0', 'important');
        panel.style.setProperty('top', '0', 'important');
        panel.style.setProperty('bottom', '0', 'important');
        panel.style.setProperty('height', '100vh', 'important');
        panel.style.setProperty('transform', 'translateX(-100%)', 'important'); // Oculto completamente
        panel.style.setProperty('visibility', 'visible', 'important');
        panel.style.setProperty('opacity', '1', 'important');
        panel.style.setProperty('display', 'flex', 'important');
        panel.style.setProperty('z-index', '10000', 'important');
        panel.style.setProperty('overflow', 'hidden', 'important');
        panel.style.setProperty('min-width', '280px', 'important');
        panel.style.setProperty('max-width', '90vw', 'important');
        panel.style.setProperty('width', currentWidth + 'px', 'important');
        
        // Restaurar el contenido principal (sin margin-left)
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.style.setProperty('margin-left', '0', 'important');
            mainContent.style.setProperty('transition', 'margin-left var(--panel-ease)', 'important');
        }
        
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
        
        // Backdrop completamente deshabilitado
        if (backdrop) {
            backdrop.hidden = true;
            backdrop.setAttribute('aria-hidden', 'true');
            backdrop.style.cssText = `
                display: none !important;
                opacity: 0 !important;
                pointer-events: none !important;
            `;
            backdrop.classList.remove('is-visible');
        }
        
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('title', 'Expandir Panel');
        // Mover botón de vuelta cuando el panel se cierra (al borde izquierdo)
        toggle.style.setProperty('left', '0', 'important');
        toggle.style.setProperty('transform', 'translateY(-50%)', 'important');
        document.body.classList.remove('panel-open');
        
        // NO necesitamos remover inert porque no lo aplicamos cuando está anclado
        
        // Devolver foco al elemento que abrió el panel
        if (lastFocused && typeof lastFocused.focus === 'function') {
            lastFocused.focus();
        } else {
            toggle.focus();
        }
        
        console.log('[setupSidebarControls] Panel cerrado - estilos aplicados:', {
            transform: window.getComputedStyle(panel).transform,
            visibility: window.getComputedStyle(panel).visibility
        });
    }
    
    // Toggle del panel
    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[setupSidebarControls] Click en toggle, panel abierto:', panel.classList.contains('is-open'));
        console.log('[setupSidebarControls] Estado del panel antes:', {
            hasIsOpen: panel.classList.contains('is-open'),
            transform: window.getComputedStyle(panel).transform,
            visibility: window.getComputedStyle(panel).visibility,
            display: window.getComputedStyle(panel).display
        });
        if (panel.classList.contains('is-open')) {
            closePanel();
        } else {
            openPanel();
        }
    });
    
    // También agregar listener directo como fallback
    toggle.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[setupSidebarControls] onClick directo activado');
        if (panel.classList.contains('is-open')) {
            closePanel();
        } else {
            openPanel();
        }
    };
    
    // Debug: verificar que los elementos existen
    console.log('[setupSidebarControls] Elementos encontrados:', {
        panel: panel,
        toggle: toggle,
        backdrop: backdrop,
        resizeHandle: resizeHandle,
        panelExists: !!panel,
        toggleExists: !!toggle,
        backdropExists: !!backdrop,
        resizeHandleExists: !!resizeHandle
    });
    
    // Test directo: verificar que el botón es clickeable
    console.log('[setupSidebarControls] Test de click directo en 2 segundos...');
    setTimeout(() => {
        console.log('[setupSidebarControls] Verificando estado inicial del panel:', {
            transform: window.getComputedStyle(panel).transform,
            visibility: window.getComputedStyle(panel).visibility,
            display: window.getComputedStyle(panel).display,
            zIndex: window.getComputedStyle(panel).zIndex,
            position: window.getComputedStyle(panel).position
        });
    }, 2000);
    
    // Funcionalidad de redimensionamiento - MEJORADA
    if (resizeHandle) {
        console.log('[Resize] Inicializando funcionalidad de redimensionamiento...');
        
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        
        // Asegurar que el handle sea visible y funcional
        resizeHandle.style.cssText = `
            position: absolute !important;
            right: 0 !important;
            top: 0 !important;
            bottom: 0 !important;
            width: 6px !important;
            cursor: ew-resize !important;
            z-index: 10001 !important;
            background: rgba(45, 90, 160, 0.05) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            pointer-events: auto !important;
            visibility: visible !important;
            opacity: 1 !important;
            border-left: 1px solid rgba(45, 90, 160, 0.3) !important;
        `;
        
        // Asegurar que el icono sea visible
        const handleIcon = resizeHandle.querySelector('i');
        if (handleIcon) {
            handleIcon.style.cssText = `
                color: rgba(45, 90, 160, 0.6) !important;
                font-size: 0.9rem !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
            `;
        }
        
        resizeHandle.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Resize] Mouse down en handle');
            
            if (!panel.classList.contains('is-open')) {
                console.log('[Resize] Panel no está abierto, no se puede redimensionar');
                return;
            }
            
            isResizing = true;
            startX = e.clientX;
            // Obtener ancho actual de múltiples formas
            const computedWidth = parseInt(getComputedStyle(panel).width);
            const offsetWidth = panel.offsetWidth;
            startWidth = offsetWidth || computedWidth || parseInt(localStorage.getItem('sidebarWidth')) || 529;
            
            console.log('[Resize] Iniciando redimensionamiento:', {
                startX: startX,
                startWidth: startWidth,
                computedWidth: computedWidth,
                offsetWidth: offsetWidth,
                styleWidth: panel.style.width
            });
            
            // DESHABILITAR transiciones durante el redimensionamiento
            panel.style.transition = 'none !important';
            panel.style.setProperty('transition', 'none', 'important');
            
            // Agregar listeners globales
            document.addEventListener('mousemove', handleResize, { passive: false });
            document.addEventListener('mouseup', stopResize);
            
            // Cambiar cursor
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
            resizeHandle.style.cursor = 'ew-resize';
        });
        
        function handleResize(e) {
            if (!isResizing) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const diff = e.clientX - startX;
            const newWidth = Math.max(280, Math.min(window.innerWidth * 0.9, startWidth + diff));
            
            // DESHABILITAR todas las transiciones durante el redimensionamiento (como la consola del navegador)
            panel.style.transition = 'none';
            panel.style.setProperty('transition', 'none', 'important');
            
            // Método DIRECTO y SÍNCRONO: aplicar width inmediatamente (como la consola del navegador)
            // NO usar requestAnimationFrame - debe ser instantáneo
            panel.style.width = newWidth + 'px';
            panel.style.setProperty('width', newWidth + 'px', 'important');
            
            // Forzar reflow inmediato para aplicar el cambio
            void panel.offsetWidth;
            
            // Actualizar variable CSS dinámicamente
            document.documentElement.style.setProperty('--panel-width', newWidth + 'px');
            
            // Actualizar posición del botón toggle en tiempo real (en el borde derecho del panel)
            if (panel.classList.contains('is-open') && toggle) {
                toggle.style.setProperty('left', newWidth + 'px', 'important');
            }
            
            // Actualizar margin-left del contenido principal en tiempo real (sin transición)
            const mainContent = document.querySelector('.main-content');
            if (mainContent && panel.classList.contains('is-open')) {
                mainContent.style.transition = 'none';
                mainContent.style.marginLeft = newWidth + 'px';
                mainContent.style.setProperty('margin-left', newWidth + 'px', 'important');
            }
            
            // Guardar en localStorage (throttle para no saturar)
            if (!handleResize.lastSave || Date.now() - handleResize.lastSave > 100) {
                localStorage.setItem('sidebarWidth', newWidth.toString());
                handleResize.lastSave = Date.now();
            }
        }
        
        function stopResize(e) {
            if (!isResizing) return;
            
            console.log('[Resize] Deteniendo redimensionamiento');
            isResizing = false;
            
            // REHABILITAR transiciones después del redimensionamiento
            panel.style.transition = '';
            panel.style.removeProperty('transition');
            
            // Rehabilitar transición del contenido principal
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.style.transition = 'margin-left var(--panel-ease)';
            }
            
            // Remover listeners
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
            
            // Restaurar cursor
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            // Guardar ancho final y actualizar variable CSS
            const finalWidth = panel.offsetWidth;
            localStorage.setItem('sidebarWidth', finalWidth.toString());
            document.documentElement.style.setProperty('--panel-width', finalWidth + 'px');
            
            console.log('[Resize] Ancho final guardado:', finalWidth);
        }
        
        // Cargar ancho guardado al iniciar
        const savedWidth = localStorage.getItem('sidebarWidth');
        if (savedWidth) {
            const width = parseInt(savedWidth);
            if (width >= 280 && width <= window.innerWidth * 0.9) {
                panel.style.setProperty('width', width + 'px', 'important');
                console.log('[Resize] Ancho cargado desde localStorage:', width);
            }
        }
        
        console.log('[Resize] Handle configurado correctamente:', {
            handle: resizeHandle,
            handleVisible: window.getComputedStyle(resizeHandle).display !== 'none',
            handleZIndex: window.getComputedStyle(resizeHandle).zIndex,
            panelWidth: panel.offsetWidth
        });
    } else {
        console.error('[Resize] ERROR: No se encontró el handle de redimensionamiento');
    }
    
    // Cerrar con backdrop
    backdrop.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closePanel();
    });
    
    // Cerrar con Esc
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.classList.contains('is-open')) {
            e.preventDefault();
            e.stopPropagation();
            closePanel();
        }
    });
    
    // Trap de foco dentro del panel
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab' || !panel.classList.contains('is-open')) return;
        
        const focusableNodes = panel.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusableNodes.length) return;
        
        const first = focusableNodes[0];
        const last = focusableNodes[focusableNodes.length - 1];
        const active = document.activeElement;
        
        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    });
    
    // Inicializar estado: panel cerrado
    panel.setAttribute('aria-hidden', 'true');
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
}

// Cargar ranking de constructores
async function loadRankingConstructores(estado = 'Activos') {
    try {
        const response = await fetch(`/api/ranking-constructores?estado=${estado}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.ranking && data.ranking.length > 0) {
            mostrarRankingConstructores(data.ranking);
        } else {
            const errorMsg = data.error || 'No hay datos disponibles';
            console.warn('Ranking de constructores:', errorMsg);
            document.getElementById('constructors-ranking').innerHTML = 
                '<div class="no-constructors"><i class="fas fa-building"></i><p>No hay datos disponibles</p></div>';
        }
    } catch (error) {
        console.error('Error al cargar ranking de constructores:', error);
        document.getElementById('constructors-ranking').innerHTML = 
            '<div class="no-constructors"><i class="fas fa-exclamation-triangle"></i><p>Error al cargar ranking</p></div>';
    }
}

// Mostrar ranking de constructores
function mostrarRankingConstructores(ranking) {
    const container = document.getElementById('constructors-ranking');
    
    if (!ranking || ranking.length === 0) {
        container.innerHTML = '<div class="no-constructors"><i class="fas fa-building"></i><p>No se encontraron constructores</p></div>';
        return;
    }
    
    let html = '';
    
    ranking.forEach((constructor, index) => {
        const rank = index + 1;
        const isTop3 = rank <= 3;
        const delay = index * 0.1;
        
        // Determinar icono según posición
        let icon = 'fas fa-building';
        if (rank === 1) icon = 'fas fa-crown';
        else if (rank === 2) icon = 'fas fa-medal';
        else if (rank === 3) icon = 'fas fa-award';
        
        const vendedorNombre = escapeHtml(constructor.vendedor || 'Vendedor Sin Nombre');
        html += `
            <div class="constructor-item ${isTop3 ? 'top-3' : ''}" 
                 data-vendedor="${escapeHtml(constructor.vendedor || '')}" 
                 style="animation-delay: ${delay}s"
                 role="button"
                 tabindex="0"
                 aria-label="Filtrar por ${vendedorNombre}">
                <div class="constructor-header">
                    <div class="constructor-rank">${rank}</div>
                    <div class="constructor-name" title="${vendedorNombre}">
                        <i class="${icon}"></i>
                        <span>${vendedorNombre}</span>
                    </div>
                </div>
                
                <div class="constructor-stats">
                    <div class="constructor-stat">
                        <div class="constructor-stat-label">Total Proyectos</div>
                        <div class="constructor-stat-value">${constructor.total_proyectos}</div>
                    </div>
                    <div class="constructor-stat">
                        <div class="constructor-stat-label">% Exitosos</div>
                        <div class="constructor-stat-value success">${constructor.porcentaje_exitosos}%</div>
                    </div>
                </div>
                
                <div class="constructor-classification-badges">
                    <span class="classification-badge badge-success">
                        <i class="fas fa-check-circle"></i>
                        ${constructor.exitosos} Exitosos
                    </span>
                    <span class="classification-badge badge-moderate">
                        <i class="fas fa-exclamation-circle"></i>
                        ${constructor.moderados} Moderados
                    </span>
                    <span class="classification-badge badge-improve">
                        <i class="fas fa-times-circle"></i>
                        ${constructor.mejorables} Mejorables
                    </span>
                </div>
                
                <div class="constructor-score">
                    <div>
                        <div class="constructor-score-label">Score Promedio</div>
                        <div class="constructor-score-value">${constructor.score_promedio.toFixed(3)}</div>
                    </div>
                    <div style="flex: 1; margin-left: 1rem;">
                        <div class="constructor-score-bar">
                            <div class="constructor-score-bar-fill" style="width: ${constructor.score_promedio * 100}%"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Agregar event listeners para filtrado
    setupConstructorFiltering();
    
    // Inicializar estados visuales (asegurar que todas las filas estén visibles)
    updateConstructorItemsState();
}

// Variables globales para selección de constructores (misma lógica que categorías)
let selectedConstructors = new Set(); // IDs de los constructores seleccionados (Set para múltiples selecciones)

// Configurar filtrado por constructor
function setupConstructorFiltering() {
    const constructorItems = document.querySelectorAll('.constructor-item');
    
    constructorItems.forEach(item => {
        // Click
        item.addEventListener('click', function(e) {
            const vendedor = this.getAttribute('data-vendedor');
            toggleConstructorFilter(vendedor, e);
        });
        
        // Teclado
        item.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const vendedor = this.getAttribute('data-vendedor');
                toggleConstructorFilter(vendedor, e);
            }
        });
    });
}

// Toggle filtro de constructor (misma lógica que categorías)
function toggleConstructorFilter(vendedor, event) {
    if (!vendedor || vendedor === '') return;
    
    // Detectar si se presionó Ctrl (o Cmd en Mac)
    const isCtrlPressed = event ? (event.ctrlKey || event.metaKey) : false;
    const wasSelected = selectedConstructors.has(vendedor);
    
    if (isCtrlPressed) {
        // Selección múltiple: toggle de este constructor sin afectar los demás
        if (wasSelected) {
            // Deseleccionar este constructor
            selectedConstructors.delete(vendedor);
    } else {
            // Agregar a la selección
            selectedConstructors.add(vendedor);
        }
        
        // Actualizar filtro con todos los constructores seleccionados
        if (selectedConstructors.size === 0) {
            showAllConstructors();
        } else {
            filterBySelectedConstructors();
        }
        
        // Solo actualizar estados visuales (NO regenerar HTML - todas las filas permanecen visibles)
        updateConstructorItemsState();
    } else {
        // Sin Ctrl: selección única (reemplazar selección anterior)
        if (wasSelected && selectedConstructors.size === 1) {
            // Si solo este estaba seleccionado, deseleccionar todo
            selectedConstructors.clear();
            showAllConstructors();
        } else {
            // Limpiar selección anterior y seleccionar solo este
            selectedConstructors.clear();
            // Remover resaltado de todos los constructores
            document.querySelectorAll('.constructor-item').forEach(i => {
                i.classList.remove('selected');
            });
            
            // Seleccionar este constructor
            selectedConstructors.add(vendedor);
            
            // Filtrar para mostrar solo los proyectos de este constructor
            filterBySelectedConstructors();
            
            // Solo actualizar estados visuales (NO regenerar HTML - todas las filas permanecen visibles)
            updateConstructorItemsState();
        }
    }
}

// Filtrar mapa por constructores seleccionados
function filterBySelectedConstructors() {
    if (selectedConstructors.size === 0) {
        showAllConstructors();
        return;
    }
    
    // Filtrar los datos usando el dataset original
    const sourceData = proyectosDataOriginal.length > 0 ? proyectosDataOriginal : proyectosData;
    
    proyectosData = sourceData.filter(proyecto => {
        const vendedor = String(proyecto.vende || 'N/A').trim();
        return selectedConstructors.has(vendedor);
    });
    
    // Actualizar todas las vistas con los datos filtrados
    updateMap();
    
    // Enfocar en los puntos filtrados
    if (proyectosData.length > 0) {
        fitToData();
    }
    
    updateTable();
    updateStats();
    
    // Actualizar estados visuales de los items (sin ocultar filas, solo resaltar)
    updateConstructorItemsState();
}

// Actualizar estados visuales de los items de constructores (estilo Power BI - transparencia)
function updateConstructorItemsState() {
    const constructorItems = document.querySelectorAll('.constructor-item');
    if (!constructorItems || constructorItems.length === 0) return;
    
    const hasSelection = selectedConstructors.size > 0;
    
    constructorItems.forEach(item => {
        const vendedor = item.getAttribute('data-vendedor');
        const isSelected = selectedConstructors.has(vendedor);
        
        // Estilo Power BI: seleccionados opacos, no seleccionados transparentes
        if (isSelected) {
                item.classList.add('selected');
            item.classList.remove('dimmed');
            item.style.opacity = '1';
            item.style.display = '';
            item.style.visibility = 'visible';
            } else {
                item.classList.remove('selected');
            // Solo aplicar transparencia si hay alguna selección (más transparente para mayor contraste)
            if (hasSelection) {
                item.classList.add('dimmed');
                item.style.opacity = '0.25';
            } else {
                item.classList.remove('dimmed');
                item.style.opacity = '1';
            }
            item.style.display = '';
            item.style.visibility = 'visible';
        }
    });
}

// Mostrar todos los constructores (restaurar vista completa)
function showAllConstructors() {
    // Limpiar la selección
    selectedConstructors.clear();
    
    // Restaurar datos originales si existen
    if (proyectosDataOriginal.length > 0) {
        proyectosData = [...proyectosDataOriginal];
    }
    
    // Actualizar vistas
    updateMap();
    
    // Restaurar vista completa del mapa (centrar en todos los proyectos)
    fitToData();
    
    updateTable();
    updateStats();
    
    // Actualizar estados visuales de los items (remover resaltado)
    updateConstructorItemsState();
}

// Inicializar mapa
function initMap() {
    // Centro de Cali
    map = L.map('map', {
        center: [3.4516, -76.5320],
        zoom: 11,
        zoomControl: true
    });
    // Exponer map globalmente para street-preview.js
    window.map = map;

    // Crear todas las capas base
    baseLayers = {
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Esri',
            maxZoom: 19
        }),
        streets: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
        }),
        terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenTopoMap contributors',
            maxZoom: 17
        }),
        light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 19
        }),
        dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO',
            maxZoom: 19
        })
    };

    // Agregar capa satelital por defecto
    currentBaseLayer = baseLayers.satellite;
    currentBaseLayer.addTo(map);

    // Inicializar cluster de marcadores - usar comportamiento nativo de Leaflet
    // Solo personalizar los iconos para tamaños dinámicos
    markerCluster = L.markerClusterGroup({
        chunkedLoading: false,
        maxClusterRadius: 80,
        disableClusteringAtZoom: 16,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true, // Comportamiento nativo - funciona correctamente
        removeOutsideVisibleBounds: false,
        animate: true,
        animateAddingMarkers: false,
        iconCreateFunction: function(cluster) {
            var count = cluster.getChildCount();
            var size, className, iconSize;
            
            // Determinar tamaño según la cantidad de marcadores
            if (count >= 100) {
                size = 'xlarge';
                className = 'marker-cluster-xlarge';
                iconSize = 60;
            } else if (count >= 50) {
                size = 'large';
                className = 'marker-cluster-large';
                iconSize = 55;
            } else if (count >= 20) {
                size = 'big';
                className = 'marker-cluster-big';
                iconSize = 50;
            } else if (count >= 10) {
                size = 'medium';
                className = 'marker-cluster-medium';
                iconSize = 45;
            } else if (count >= 5) {
                size = 'small-medium';
                className = 'marker-cluster-small-medium';
                iconSize = 40;
            } else {
                size = 'small';
                className = 'marker-cluster-small';
                iconSize = 35;
            }
            
            // Crear el HTML del cluster - estructura simple compatible con Leaflet
            var html = '<div><span>' + count + '</span></div>';
            
            return L.divIcon({
                html: html,
                className: 'marker-cluster ' + className,
                iconSize: L.point(iconSize, iconSize),
                iconAnchor: [iconSize / 2, iconSize / 2]
            });
        }
    });
    
    // NO interceptar eventos - dejar que Leaflet maneje todo nativamente
    map.addLayer(markerCluster);
}

// Cargar opciones de filtros
async function loadFiltros() {
    try {
        const response = await fetch('/api/filtros');
        const data = await response.json();
        
        if (data.success) {
            // Llenar select de clasificaciones
            const clasificacionSelect = document.getElementById('clasificacion');
            data.clasificaciones.forEach(clasif => {
                const option = document.createElement('option');
                option.value = clasif;
                option.textContent = clasif;
                clasificacionSelect.appendChild(option);
            });

            // Llenar select de zonas
            const zonaSelect = document.getElementById('zona');
            data.zonas.forEach(zona => {
                const option = document.createElement('option');
                option.value = zona;
                option.textContent = zona;
                zonaSelect.appendChild(option);
            });

            // Llenar select de barrios
            const barrioSelect = document.getElementById('barrio');
            data.barrios.forEach(barrio => {
                const option = document.createElement('option');
                option.value = barrio;
                option.textContent = barrio;
                barrioSelect.appendChild(option);
            });

            // Llenar select de tipos VIS
            const tipoVisSelect = document.getElementById('tipo_vis');
            data.tipos_vis.forEach(tipo => {
                const option = document.createElement('option');
                option.value = tipo;
                option.textContent = tipo;
                tipoVisSelect.appendChild(option);
            });

            // Establecer valores de precio
            document.getElementById('precio_min').placeholder = `Mín: ${formatNumber(data.precio_min)}`;
            document.getElementById('precio_max').placeholder = `Máx: ${formatNumber(data.precio_max)}`;
            
            // Guardar rango de precio para mostrar información
            window.priceRange = {
                min: data.precio_min,
                max: data.precio_max
            };
            
            updatePriceRangeInfo();
        }
    } catch (error) {
        console.error('Error al cargar filtros:', error);
    }
}

// Actualizar información del rango de precio
function updatePriceRangeInfo() {
    const infoElement = document.getElementById('precio_range_info');
    if (!infoElement) return;
    
    const precioMin = document.getElementById('precio_min').value;
    const precioMax = document.getElementById('precio_max').value;
    
    if (precioMin || precioMax) {
        const min = precioMin ? formatNumber(parseFloat(precioMin)) : 'Mín';
        const max = precioMax ? formatNumber(parseFloat(precioMax)) : 'Máx';
        infoElement.textContent = `Filtro: ${min} - ${max} COP`;
        infoElement.style.color = 'var(--platzi-dark-blue)';
        infoElement.style.fontWeight = '600';
    } else {
        if (window.priceRange) {
            infoElement.textContent = `Rango disponible: ${formatNumber(window.priceRange.min)} - ${formatNumber(window.priceRange.max)} COP`;
        } else {
            infoElement.textContent = 'Rango completo disponible';
        }
        infoElement.style.color = 'var(--platzi-text)';
        infoElement.style.fontWeight = '400';
    }
}

// Cargar proyectos
// Cargar características de proyectos exitosos
async function loadCaracteristicasExitosos() {
    try {
        // Cargar características tradicionales
        const response = await fetch('/api/caracteristicas-exitosos');
        const data = await response.json();
        
        // Cargar correlaciones para obtener las características más fuertes
        let topCaracteristicas = [];
        try {
            const corrResponse = await fetch('/api/correlaciones-exito');
            const corrData = await corrResponse.json();
            
            if (corrData.success && corrData.top_caracteristicas_fuertes) {
                topCaracteristicas = corrData.top_caracteristicas_fuertes;
                console.log('[loadCaracteristicasExitosos] Top características cargadas:', topCaracteristicas.length);
                console.log('[loadCaracteristicasExitosos] Top características:', topCaracteristicas);
            } else {
                console.warn('[loadCaracteristicasExitosos] No se encontraron top_caracteristicas_fuertes en la respuesta:', {
                    success: corrData.success,
                    hasTopCaracteristicas: !!corrData.top_caracteristicas_fuertes,
                    keys: Object.keys(corrData)
                });
            }
        } catch (corrError) {
            console.warn('[loadCaracteristicasExitosos] No se pudieron cargar correlaciones:', corrError);
        }
        
        if (data.success && data.caracteristicas) {
            mostrarCaracteristicasExitosos(data.caracteristicas, topCaracteristicas);
        } else {
            document.getElementById('caracteristicas-exitosos').innerHTML = 
                '<div class="loading-state"><i class="fas fa-exclamation-triangle"></i><p>No hay datos disponibles. Regenera la clasificación.</p></div>';
        }
    } catch (error) {
        console.error('Error al cargar características:', error);
        document.getElementById('caracteristicas-exitosos').innerHTML = 
            '<div class="loading-state"><i class="fas fa-exclamation-triangle"></i><p>Error al cargar características. Por favor, recarga la página.</p></div>';
    }
}

// Mostrar características de proyectos exitosos en la UI
function mostrarCaracteristicasExitosos(caracteristicas, topCaracteristicas = []) {
    const container = document.getElementById('caracteristicas-exitosos');
    
    // Validación
    if (!caracteristicas || Object.keys(caracteristicas).length === 0) {
        container.innerHTML = '<p style="color: #888; padding: 2rem; text-align: center;">No hay características disponibles para proyectos exitosos.</p>';
        return;
    }
    
    console.log('[mostrarCaracteristicasExitosos] Top características recibidas:', topCaracteristicas.length);
    const formatNumber = (value, decimals = 2) => {
        if (value === null || value === undefined || Number.isNaN(value)) return 'N/D';
        return Number(value).toLocaleString('es-CO', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    };
    const formatInteger = (value) => {
        if (value === null || value === undefined || Number.isNaN(value)) return 'N/D';
        return Math.round(Number(value)).toLocaleString('es-CO');
    };
    const metodoLabels = {
        numerico_binario: 'Indicador numérico (0/1)',
        numerico_general: 'Valor numérico > 0',
        texto_binario: 'Etiqueta Sí/No',
        texto_general: 'Texto disponible',
        sin_datos: 'Sin datos suficientes'
    };
    const getMetodoLabel = (metodo) => metodoLabels[metodo] || 'Sin datos';
    const resumenTopPresencia = (() => {
        if (!Array.isArray(topCaracteristicas) || topCaracteristicas.length === 0) {
            return '';
        }
        const ordenadas = [...topCaracteristicas]
            .filter(item => item?.estadisticas_presencia && item.estadisticas_presencia.porcentaje_presencia > 0)
            .sort((a, b) => b.estadisticas_presencia.porcentaje_presencia - a.estadisticas_presencia.porcentaje_presencia)
            .slice(0, 3);
        if (!ordenadas.length) {
            return '';
        }
        const promedioPresencia = ordenadas.reduce((acc, item) => acc + (item.estadisticas_presencia.porcentaje_presencia || 0), 0) / ordenadas.length;
        const detalle = ordenadas.map(item => `
            <div class="futuristic-summary-item">
                <span class="summary-rank">${(item.estadisticas_presencia.porcentaje_presencia || 0).toFixed(1)}%</span>
                <span class="summary-name">${escapeHtml(item.variable)}</span>
            </div>
        `).join('');
        return `
            <div class="futuristic-summary">
                <div class="futuristic-summary-header">
                    <i class="fas fa-lightbulb"></i>
                    <div>
                        <h4>Insights rápidos de presencia</h4>
                        <p>Promedio del Top 3: ${promedioPresencia.toFixed(1)}% de los proyectos exitosos</p>
                    </div>
                </div>
                <div class="futuristic-summary-body">
                    ${detalle}
                </div>
            </div>
        `;
    })();
    
    // Diseño moderno y futurista
    let html = `
        <div class="futuristic-characteristics-container">
            <!-- Header futurista -->
            <div class="futuristic-header">
                <div class="futuristic-title-wrapper">
                    <div class="futuristic-icon-circle">
                        <i class="fas fa-rocket"></i>
                    </div>
                    <div>
                        <h2 class="futuristic-title">Características Comunes de Proyectos Exitosos</h2>
                        <p class="futuristic-subtitle">Análisis basado en correlaciones y patrones de éxito</p>
                    </div>
                </div>
            </div>
            
            <!-- Top características más fuertes del mapa de calor -->
            ${topCaracteristicas.length > 0 ? `
            <div class="futuristic-section">
                <div class="futuristic-section-header">
                    <i class="fas fa-chart-line"></i>
                    <h3>Características con Mayor Impacto en el Éxito</h3>
                    <span class="futuristic-badge">${topCaracteristicas.length} características</span>
                </div>
                ${resumenTopPresencia}
                <div class="futuristic-grid top-characteristics-grid">
                    ${topCaracteristicas.map((item, index) => {
                        const corr = item.correlacion;
                        const absCorr = item.abs_correlacion;
                        const isPositive = corr > 0;
                        const intensity = Math.min(absCorr * 100, 100);
                        const rankColor = index === 0 ? '#F39C12' : index === 1 ? '#95A5A6' : index === 2 ? '#CD7F32' : 'rgba(45, 90, 160, 0.6)';
                        const corrColor = isPositive ? '#E74C3C' : '#2D5AA0';
                        const corrIcon = isPositive ? '↑' : '↓';
                        
                        // Estadísticas de presencia en proyectos exitosos
                        const stats = item.estadisticas_presencia || {};
                        const detalles = item.estadisticas_detalladas || {};
                        const porcentajePresencia = stats.porcentaje_presencia || 0;
                        const proyectosCon = stats.proyectos_con_caracteristica || 0;
                        const totalProyectos = stats.total_proyectos || 0;
                        const valoresValidos = stats.valores_validos || detalles.valores_validos || 0;
                        const presenciaColor = porcentajePresencia >= 70 ? '#27AE60' : porcentajePresencia >= 50 ? '#F39C12' : '#E74C3C';
                        const metodoLabel = getMetodoLabel(stats.metodo);
                        
                        let detalleHtml = '';
                        if (detalles && detalles.tipo === 'numerica') {
                            detalleHtml = `
                                <div class="futuristic-analytics">
                                    <div class="futuristic-analytics-title">
                                        <i class="fas fa-wave-square"></i>
                                        Estadística detallada
                                    </div>
                                    <div class="futuristic-analytics-grid">
                                        <div class="analytics-item">
                                            <span>Promedio</span>
                                            <strong>${formatNumber(detalles.promedio)}</strong>
                                        </div>
                                        <div class="analytics-item">
                                            <span>Mediana</span>
                                            <strong>${formatNumber(detalles.mediana)}</strong>
                                        </div>
                                        <div class="analytics-item">
                                            <span>P25 - P75</span>
                                            <strong>${formatNumber(detalles.percentil_25)} - ${formatNumber(detalles.percentil_75)}</strong>
                                        </div>
                                        <div class="analytics-item">
                                            <span>Mín / Máx</span>
                                            <strong>${formatNumber(detalles.min)} - ${formatNumber(detalles.max)}</strong>
                                        </div>
                                    </div>
                                    <div class="futuristic-analytics-foot">
                                        Datos válidos: ${formatInteger(detalles.valores_validos || valoresValidos)}
                                    </div>
                                </div>
                            `;
                        } else if (detalles && detalles.tipo === 'categorica' && Array.isArray(detalles.top_valores)) {
                            const chips = detalles.top_valores.map(val => `
                                <div class="futuristic-category-chip">
                                    <span class="chip-label">${escapeHtml(val.valor)}</span>
                                    <span class="chip-value">${formatInteger(val.conteo)} (${formatNumber(val.porcentaje, 1)}%)</span>
                                </div>
                            `).join('');
                            detalleHtml = `
                                <div class="futuristic-analytics">
                                    <div class="futuristic-analytics-title">
                                        <i class="fas fa-layer-group"></i>
                                        Distribución destacada
                                    </div>
                                    <div class="futuristic-category-list">
                                        ${chips || '<span class="chip-empty">Sin datos relevantes</span>'}
                                    </div>
                                    <div class="futuristic-analytics-foot">
                                        Valores distintos: ${formatInteger(detalles.valores_distintos || 0)}
                                    </div>
                                </div>
                            `;
                        }
                        
                        return `
                            <div class="futuristic-card futuristic-card-compact" style="--intensity: ${intensity}%; --rank-color: ${rankColor}; --corr-color: ${corrColor};">
                                <div class="futuristic-card-glow"></div>
                                <div class="futuristic-card-content">
                                    <div class="futuristic-rank-badge" style="background: ${rankColor};">
                                        <span>${index + 1}</span>
                                    </div>
                                    <div class="futuristic-card-header">
                                        <h4 class="futuristic-card-title">${escapeHtml(item.variable)}</h4>
                                        <div class="futuristic-correlation-indicator" style="color: ${corrColor};">
                                            <i class="fas fa-${isPositive ? 'arrow-up' : 'arrow-down'}"></i>
                                            <span>${corrIcon} ${(absCorr * 100).toFixed(1)}%</span>
                                        </div>
                                    </div>
                                    <div class="futuristic-card-body">
                                        <!-- Estadística de presencia en proyectos exitosos -->
                                        <div class="futuristic-presence-section">
                                            <div class="futuristic-presence-header">
                                                <i class="fas fa-chart-pie"></i>
                                                <span class="futuristic-presence-label">Presencia en Proyectos Exitosos</span>
                                            </div>
                                            <div class="futuristic-presence-value" style="color: ${presenciaColor};">
                                                ${porcentajePresencia.toFixed(1)}%
                                            </div>
                                            <div class="futuristic-presence-detail">
                                                ${proyectosCon} de ${totalProyectos} proyectos
                                            </div>
                                            <div class="futuristic-presence-meta">
                                                <span>${metodoLabel}</span>
                                                <span>Datos válidos: ${formatInteger(valoresValidos)}</span>
                                            </div>
                                            <div class="futuristic-presence-progress">
                                                <div class="futuristic-presence-progress-fill" style="width: ${porcentajePresencia}%; background: linear-gradient(90deg, ${presenciaColor} 0%, ${presenciaColor}dd 100%);"></div>
                                            </div>
                                        </div>
                                        
                                        <!-- Barra de correlación -->
                                        <div class="futuristic-progress-bar">
                                            <div class="futuristic-progress-fill" style="width: ${intensity}%; background: linear-gradient(90deg, ${corrColor} 0%, ${corrColor}dd 100%);"></div>
                                        </div>
                                        
                                        <div class="futuristic-card-stats">
                                            <div class="futuristic-stat">
                                                <span class="futuristic-stat-label">Correlación</span>
                                                <span class="futuristic-stat-value" style="color: ${corrColor};">
                                                    ${corr > 0 ? '+' : ''}${corr.toFixed(3)}
                                                </span>
                                            </div>
                                            <div class="futuristic-stat">
                                                <span class="futuristic-stat-label">Tipo</span>
                                                <span class="futuristic-stat-value">${isPositive ? 'Positiva' : 'Negativa'}</span>
                                            </div>
                                        </div>
                                        
                                        ${detalleHtml}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            ` : ''}
            
            <!-- Características tradicionales -->
            <div class="futuristic-section">
                <div class="futuristic-section-header">
                    <i class="fas fa-chart-bar"></i>
                    <h3>Métricas de Rendimiento</h3>
                </div>
                <div class="futuristic-metrics-grid">
                    ${(() => {
                        let metricsHtml = '';
                        
                        // Velocidad de ventas
                        if (caracteristicas.velocidad_ventas) {
                            const v = caracteristicas.velocidad_ventas;
                            metricsHtml += `
                                <div class="futuristic-metric-card">
                                    <div class="futuristic-metric-icon"><i class="fas fa-tachometer-alt"></i></div>
                                    <div class="futuristic-metric-content">
                                        <h4>Velocidad de Ventas</h4>
                                        <div class="futuristic-metric-value">${v.promedio.toFixed(2)}</div>
                                        <div class="futuristic-metric-unit">unidades/mes</div>
                                        <div class="futuristic-metric-range">Rango: ${v.min.toFixed(2)} - ${v.max.toFixed(2)}</div>
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Meses para agotar
                        if (caracteristicas.meses_para_agotar) {
                            const m = caracteristicas.meses_para_agotar;
                            metricsHtml += `
                                <div class="futuristic-metric-card">
                                    <div class="futuristic-metric-icon"><i class="fas fa-clock"></i></div>
                                    <div class="futuristic-metric-content">
                                        <h4>Meses para Agotar</h4>
                                        <div class="futuristic-metric-value">${m.promedio.toFixed(1)}</div>
                                        <div class="futuristic-metric-unit">meses</div>
                                        <div class="futuristic-metric-range">Rango: ${m.min.toFixed(1)} - ${m.max.toFixed(1)}</div>
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Porcentaje vendido
                        if (caracteristicas.porcentaje_vendido) {
                            const p = caracteristicas.porcentaje_vendido;
                            metricsHtml += `
                                <div class="futuristic-metric-card">
                                    <div class="futuristic-metric-icon"><i class="fas fa-percentage"></i></div>
                                    <div class="futuristic-metric-content">
                                        <h4>Porcentaje Vendido</h4>
                                        <div class="futuristic-metric-value">${p.promedio.toFixed(1)}%</div>
                                        <div class="futuristic-metric-range">Rango: ${p.min.toFixed(1)}% - ${p.max.toFixed(1)}%</div>
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Precio promedio
                        if (caracteristicas.precio_promedio) {
                            const pr = caracteristicas.precio_promedio;
                            metricsHtml += `
                                <div class="futuristic-metric-card">
                                    <div class="futuristic-metric-icon"><i class="fas fa-dollar-sign"></i></div>
                                    <div class="futuristic-metric-content">
                                        <h4>Precio Promedio</h4>
                                        <div class="futuristic-metric-value">${formatCurrency(pr.promedio)}</div>
                                        <div class="futuristic-metric-range">Rango: ${formatCurrency(pr.min)} - ${formatCurrency(pr.max)}</div>
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Área promedio
                        if (caracteristicas.area_promedio) {
                            const a = caracteristicas.area_promedio;
                            metricsHtml += `
                                <div class="futuristic-metric-card">
                                    <div class="futuristic-metric-icon"><i class="fas fa-ruler-combined"></i></div>
                                    <div class="futuristic-metric-content">
                                        <h4>Área Promedio</h4>
                                        <div class="futuristic-metric-value">${a.promedio.toFixed(1)}</div>
                                        <div class="futuristic-metric-unit">m²</div>
                                        <div class="futuristic-metric-range">Rango: ${a.min.toFixed(1)} - ${a.max.toFixed(1)}</div>
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Precio por m²
                        if (caracteristicas.precio_m2) {
                            const pm2 = caracteristicas.precio_m2;
                            metricsHtml += `
                                <div class="futuristic-metric-card">
                                    <div class="futuristic-metric-icon"><i class="fas fa-calculator"></i></div>
                                    <div class="futuristic-metric-content">
                                        <h4>Precio por m²</h4>
                                        <div class="futuristic-metric-value">${formatCurrency(pm2.promedio)}</div>
                                        <div class="futuristic-metric-range">Rango: ${formatCurrency(pm2.min)} - ${formatCurrency(pm2.max)}</div>
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Tamaño del proyecto
                        if (caracteristicas.tamano_proyecto) {
                            const t = caracteristicas.tamano_proyecto;
                            metricsHtml += `
                                <div class="futuristic-metric-card">
                                    <div class="futuristic-metric-icon"><i class="fas fa-building"></i></div>
                                    <div class="futuristic-metric-content">
                                        <h4>Tamaño del Proyecto</h4>
                                        <div class="futuristic-metric-value">${t.promedio.toFixed(0)}</div>
                                        <div class="futuristic-metric-unit">unidades</div>
                                        <div class="futuristic-metric-range">Rango: ${t.min.toFixed(0)} - ${t.max.toFixed(0)}</div>
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Alcobas promedio
                        if (caracteristicas.alcobas_promedio) {
                            const alc = caracteristicas.alcobas_promedio;
                            metricsHtml += `
                                <div class="futuristic-metric-card">
                                    <div class="futuristic-metric-icon"><i class="fas fa-bed"></i></div>
                                    <div class="futuristic-metric-content">
                                        <h4>Alcobas Promedio</h4>
                                        <div class="futuristic-metric-value">${alc.promedio.toFixed(1)}</div>
                                        <div class="futuristic-metric-unit">alcobas</div>
                                        <div class="futuristic-metric-range">Rango: ${alc.min.toFixed(1)} - ${alc.max.toFixed(1)}</div>
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Baños promedio
                        if (caracteristicas.banos_promedio) {
                            const ban = caracteristicas.banos_promedio;
                            metricsHtml += `
                                <div class="futuristic-metric-card">
                                    <div class="futuristic-metric-icon"><i class="fas fa-bath"></i></div>
                                    <div class="futuristic-metric-content">
                                        <h4>Baños Promedio</h4>
                                        <div class="futuristic-metric-value">${ban.promedio.toFixed(1)}</div>
                                        <div class="futuristic-metric-unit">baños</div>
                                        <div class="futuristic-metric-range">Rango: ${ban.min.toFixed(1)} - ${ban.max.toFixed(1)}</div>
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Garajes/Parqueaderos promedio
                        if (caracteristicas.garajes_promedio) {
                            const gar = caracteristicas.garajes_promedio;
                            metricsHtml += `
                                <div class="futuristic-metric-card">
                                    <div class="futuristic-metric-icon"><i class="fas fa-car"></i></div>
                                    <div class="futuristic-metric-content">
                                        <h4>Parqueaderos Promedio</h4>
                                        <div class="futuristic-metric-value">${gar.promedio.toFixed(1)}</div>
                                        <div class="futuristic-metric-unit">parqueaderos</div>
                                        <div class="futuristic-metric-range">Rango: ${gar.min.toFixed(1)} - ${gar.max.toFixed(1)}</div>
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Ratio vendidas/disponibles
                        if (caracteristicas.ratio_vendidas_disponibles) {
                            const ratio = caracteristicas.ratio_vendidas_disponibles;
                            metricsHtml += `
                                <div class="futuristic-metric-card">
                                    <div class="futuristic-metric-icon"><i class="fas fa-balance-scale"></i></div>
                                    <div class="futuristic-metric-content">
                                        <h4>Ratio Vendidas/Disponibles</h4>
                                        <div class="futuristic-metric-value">${ratio.promedio.toFixed(2)}</div>
                                        <div class="futuristic-metric-range">Mediana: ${ratio.mediana.toFixed(2)}</div>
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Posición de precio
                        if (caracteristicas.posicion_precio_zona) {
                            const pos = caracteristicas.posicion_precio_zona;
                            metricsHtml += `
                                <div class="futuristic-metric-card">
                                    <div class="futuristic-metric-icon"><i class="fas fa-chart-bar"></i></div>
                                    <div class="futuristic-metric-content">
                                        <h4>Posición de Precio</h4>
                                        <div class="futuristic-metric-value">${pos.promedio.toFixed(1)}</div>
                                        <div class="futuristic-metric-unit">percentil</div>
                                        <div class="futuristic-metric-range">Mediana: ${pos.mediana.toFixed(1)}</div>
                                    </div>
                                </div>
                            `;
                        }
                        
                        // Estrato
                        if (caracteristicas.estrato) {
                            const e = caracteristicas.estrato;
                            metricsHtml += `
                                <div class="futuristic-metric-card">
                                    <div class="futuristic-metric-icon"><i class="fas fa-layer-group"></i></div>
                                    <div class="futuristic-metric-content">
                                        <h4>Estrato</h4>
                                        <div class="futuristic-metric-value">${e.moda || e.promedio.toFixed(1)}</div>
                                        <div class="futuristic-metric-unit">${e.moda ? 'moda' : 'promedio'}</div>
                                        ${e.promedio ? `<div class="futuristic-metric-range">Promedio: ${e.promedio.toFixed(1)}</div>` : ''}
                                    </div>
                                </div>
                            `;
                        }
                        
                        return metricsHtml;
                    })()}
                </div>
            </div>
            
            <!-- Amenidades -->
            ${(() => {
                // Verificar si hay amenidades disponibles
                let amenidades_data = null;
                if (caracteristicas.amenidades) {
                    if (caracteristicas.amenidades.amenidades_exitosos) {
                        amenidades_data = caracteristicas.amenidades.amenidades_exitosos;
                    } else if (typeof caracteristicas.amenidades === 'object') {
                        const keys = Object.keys(caracteristicas.amenidades);
                        if (keys.length > 0 && caracteristicas.amenidades[keys[0]] && typeof caracteristicas.amenidades[keys[0]] === 'object' && 'ratio' in caracteristicas.amenidades[keys[0]]) {
                            amenidades_data = caracteristicas.amenidades;
                        }
                    }
                }
                
                if (!amenidades_data) {
                    return `
                        <div class="futuristic-section">
                            <div class="futuristic-section-header">
                                <i class="fas fa-star"></i>
                                <h3>Amenidades más Distintivas</h3>
                            </div>
                            <div class="futuristic-empty-state">
                                <i class="fas fa-info-circle"></i>
                                <p>No hay datos de amenidades disponibles. Verifica que la columna "Otros" esté presente en los datos.</p>
                            </div>
                        </div>
                    `;
                }
                
                let amenidadesHtml = `
                    <div class="futuristic-section">
                        <div class="futuristic-section-header">
                            <i class="fas fa-star"></i>
                            <h3>Amenidades más Distintivas</h3>
                        </div>
                        <div class="futuristic-amenities-grid">
                `;
                
                try {
                    const amenidades_entries = Object.entries(amenidades_data)
                        .map(([nombre, datos]) => {
                            if (typeof datos === 'object' && datos !== null) {
                                return [nombre, {
                                    ratio: datos.ratio || 0,
                                    porcentaje_exitosos: datos.porcentaje_exitosos || 0,
                                    porcentaje_total: datos.porcentaje_total || 0,
                                    frecuencia_exitosos: datos.frecuencia_exitosos || 0,
                                    frecuencia_total: datos.frecuencia_total || 0
                                }];
                            }
                            return null;
                        })
                        .filter(entry => entry !== null)
                        .sort((a, b) => (b[1].ratio || 0) - (a[1].ratio || 0))
                        .slice(0, 15);
                    
                    if (amenidades_entries.length > 0) {
                        amenidades_entries.forEach(([amenidad, datos]) => {
                            const ratioColor = datos.ratio >= 1.5 ? '#27AE60' : datos.ratio >= 1.2 ? '#F39C12' : '#E74C3C';
                            const ratioIntensity = Math.min((datos.ratio / 2) * 100, 100);
                            amenidadesHtml += `
                                <div class="futuristic-amenity-card" style="--ratio-color: ${ratioColor}; --ratio-intensity: ${ratioIntensity}%;">
                                    <div class="futuristic-amenity-glow"></div>
                                    <div class="futuristic-amenity-content">
                                        <div class="futuristic-amenity-icon" style="background: ${ratioColor}22;">
                                            <i class="fas fa-check-circle" style="color: ${ratioColor};"></i>
                                        </div>
                                        <h4 class="futuristic-amenity-name">${escapeHtml(amenidad)}</h4>
                                        <div class="futuristic-amenity-ratio" style="color: ${ratioColor};">
                                            <span class="futuristic-ratio-value">${datos.ratio.toFixed(2)}x</span>
                                            <span class="futuristic-ratio-label">Ratio de Éxito</span>
                                        </div>
                                        <div class="futuristic-amenity-stats">
                                            <div class="futuristic-amenity-stat">
                                                <span>En Exitosos</span>
                                                <strong>${datos.porcentaje_exitosos.toFixed(1)}%</strong>
                                            </div>
                                            <div class="futuristic-amenity-stat">
                                                <span>En Total</span>
                                                <strong>${datos.porcentaje_total.toFixed(1)}%</strong>
                                            </div>
                                        </div>
                                        <div class="futuristic-amenity-progress">
                                            <div class="futuristic-amenity-progress-fill" style="width: ${ratioIntensity}%; background: ${ratioColor};"></div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        });
                    } else {
                        amenidadesHtml += `<div class="futuristic-empty-state"><p>No se encontraron amenidades con datos suficientes.</p></div>`;
                    }
                } catch (error) {
                    console.error('Error al procesar amenidades:', error);
                    amenidadesHtml += `<div class="futuristic-empty-state"><p>Error al cargar amenidades. Ver consola para más detalles.</p></div>`;
                }
                
                amenidadesHtml += `</div></div>`;
                return amenidadesHtml;
            })()}
        </div>`;
    
    container.innerHTML = html;
    
    // Cargar correlaciones después de un pequeño delay para asegurar que el DOM esté listo
    setTimeout(() => {
        console.log('[mostrarCaracteristicasExitosos] Cargando correlaciones...');
        cargarCorrelacionesExito();
    }, 100);
}

// Formatear moneda
function formatCurrency(value) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

async function loadProyectos() {
    showLoading();
    try {
        // Construir parámetros, excluyendo valores null (optimizado)
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(currentFilters)) {
            if (value !== null && value !== '') {
                params.append(key, value);
            }
        }
        
        const response = await fetch(`/api/proyectos?${params}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        
        if (data.success) {
            proyectosData = data.proyectos || [];
            proyectosDataOriginal = [...(data.proyectos || [])]; // Guardar copia original para filtros
            proyectosDataSorted = []; // Resetear ordenamiento al cargar nuevos datos
            tableSort.column = null;
            tableSort.direction = 'asc';
            
            
            
            // DEBUG: Verificar que año y tipo_vis estén presentes
            if (proyectosData.length > 0) {
                const conAño = proyectosData.filter(p => p.año !== null && p.año !== undefined && p.año !== '').length;
                const conTipoVis = proyectosData.filter(p => p.tipo_vis && p.tipo_vis !== 'N/A').length;
                console.debug('[loadProyectos] Resumen de datos cargados', {
                    total: proyectosData.length,
                    conAño,
                    conTipoVis
                });
            }
            
            // Actualizar todas las vistas
            updateMap();
            updateTable();
            await updateStats(); // updateStats ya actualiza también las métricas
            updateCategoryStatsPanel(); // Actualizar panel de estadísticas de categorías
            
            // Mostrar mensaje si no hay proyectos
            if (proyectosData.length === 0) {
                console.warn('No hay proyectos para mostrar. Verifica los filtros o que los datos se hayan cargado correctamente.');
                // Mostrar mensaje en la tabla
                const tableBody = document.getElementById('table-body');
                if (tableBody) {
                    tableBody.innerHTML = '<tr><td colspan="12" class="loading" style="color: #E74C3C; text-align: center; padding: 2rem;"><i class="fas fa-exclamation-triangle"></i> No hay proyectos disponibles. Verifica que el archivo Base Proyectos.xlsx exista y contenga datos.</td></tr>';
                }
            }
        } else {
            const errorMsg = data.error || 'Error desconocido';
            console.error('Error al cargar proyectos:', errorMsg);
            
            // Intentar obtener diagnóstico
            try {
                const diagResponse = await fetch('/api/diagnostico');
                if (diagResponse.ok) {
                    const diagData = await diagResponse.json();
                    
                    
                    // Mostrar información de diagnóstico en la tabla
                    let mensajeDiagnostico = `<div style="text-align: left; padding: 1rem;">
                        <p><strong>Error:</strong> ${errorMsg}</p>
                        <hr style="margin: 1rem 0;">
                        <p><strong>Diagnóstico:</strong></p>
                        <ul style="text-align: left; margin-left: 1rem;">
                            <li>Archivo existe: ${diagData.archivo_existe ? 'Sí' : 'No'}</li>
                            <li>Ruta del archivo: ${diagData.archivo_ruta}</li>
                            <li>Tamaño del archivo: ${(diagData.archivo_tamano / 1024 / 1024).toFixed(2)} MB</li>
                            <li>DataFrame vacío: ${diagData.df_data_vacio ? 'Sí' : 'No'}</li>
                            <li>Proyectos cargados: ${diagData.df_data_tamano}</li>
                        </ul>
                        <p style="margin-top: 1rem; font-size: 0.9em; color: #666;">
                            <strong>Solución:</strong> Revisa la consola del servidor para ver mensajes detallados sobre el error.
                            Asegúrate de que el archivo "Base Proyectos.xlsx" exista y contenga datos válidos.
                        </p>
                    </div>`;
                    
                    proyectosData = [];
                    proyectosDataOriginal = [];
                    proyectosDataSorted = [];
                    updateMap();
                    const tableBody = document.getElementById('table-body');
                    if (tableBody) {
                        tableBody.innerHTML = `<tr><td colspan="12" style="color: #E74C3C; text-align: center; padding: 2rem;">${mensajeDiagnostico}</td></tr>`;
                    }
                } else {
                    throw new Error('No se pudo obtener diagnóstico');
                }
            } catch (diagError) {
                console.error('Error al obtener diagnóstico:', diagError);
                // Mostrar mensaje simple si el diagnóstico falla
                proyectosData = [];
                proyectosDataSorted = [];
                updateMap();
                const tableBody = document.getElementById('table-body');
                if (tableBody) {
                    tableBody.innerHTML = `<tr><td colspan="12" class="loading" style="color: #E74C3C; text-align: center; padding: 2rem;"><i class="fas fa-exclamation-triangle"></i> ${errorMsg}<br><small style="margin-top: 1rem; display: block;">Revisa la consola del servidor para más detalles.</small></td></tr>`;
                }
            }
            // También actualizar estadísticas para limpiar los contadores
            await updateStats();
        }
    } catch (error) {
        console.error('Error al cargar proyectos:', error);
        
        // Mostrar mensaje en la tabla en lugar de alerta
        proyectosData = [];
        proyectosDataSorted = [];
        updateMap();
        const tableBody = document.getElementById('table-body');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="12" class="loading" style="color: #E74C3C; text-align: center; padding: 2rem;"><i class="fas fa-exclamation-triangle"></i> Error al cargar los proyectos. Por favor, recarga la página o verifica la consola del servidor.</td></tr>';
        }
        await updateStats();
    } finally {
        hideLoading();
    }
}

// Actualizar mapa (optimizado) - con aislamiento de categorías seleccionadas
function updateMap() {
    
    
    // Limpiar marcadores existentes
    if (clustersEnabled && markerCluster) {
    markerCluster.clearLayers();
    } else {
        markers.forEach(marker => {
            map.removeLayer(marker);
        });
    }
    markers = [];

    // Usar los datos filtrados (proyectosData ya contiene los datos filtrados si hay selección)
    const dataToShow = proyectosData;

    

    if (dataToShow.length === 0) {
        console.warn('[updateMap] No hay datos para mostrar');
        document.getElementById('map-count').textContent = '0';
        // Remover heatmap si no hay datos
        if (heatmapEnabled) {
            removeHeatmap();
        }
        return;
    }

    // Limpiar mapa de marcadores
    projectMarkersMap.clear();
    
    // Filtrar proyectos con coordenadas válidas
    const validProjects = dataToShow.filter(p => {
        const lat = parseFloat(p.lat);
        const lon = parseFloat(p.lon);
        
        // Validar que las coordenadas sean números válidos y no sean 0
        const hasValidCoords = !isNaN(lat) && !isNaN(lon) && 
            lat !== 0 && lon !== 0;
        
        // Validar rango de Cali/Colombia (más estricto)
        // Cali: Lat ~3.42, Lon ~-76.53
        // Rango razonable: Lat 3.0-4.5, Lon -77.5 a -76.0
        const inRange = hasValidCoords && 
            lat >= 3.0 && lat <= 4.5 &&
            lon >= -77.5 && lon <= -76.0;
        
        // Si están fuera de rango pero en el rango invertido, intentar corregir
        if (hasValidCoords && !inRange) {
            // Verificar si están invertidas
            if (lat >= -77.5 && lat <= -76.0 && lon >= 3.0 && lon <= 4.5) {
                // Están invertidas, pero las corregiremos al crear el marcador
                return true;
            }
        }
        
        return inRange;
    });
    
    
    
    if (validProjects.length === 0) {
        console.warn('[updateMap] No hay proyectos con coordenadas válidas');
        document.getElementById('map-count').textContent = '0';
        return;
    }

    // Crear marcadores en batch (más eficiente)
    // Todos los marcadores se muestran con sus colores normales (como los filtros)
    const markerLayers = validProjects.map(proyecto => {
        // Obtener color del marcador
        const color = getMarkerColor(proyecto);
        
        // Validar que el color sea válido
        if (!color || color === '#95A5A6' || color === 'undefined' || color === 'null') {
            console.warn(`[updateMap] Color inválido para proyecto ${proyecto.id || proyecto.nombre}: ${color}`);
        }
        
        // Crear icono con color aplicado correctamente (sin opacidad, como los filtros normales)
        const iconSize = 20;
        const markerIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                background-color: ${color} !important; 
                width: ${iconSize}px; 
                height: ${iconSize}px; 
                border-radius: 50%; 
                border: 3px solid white; 
                box-shadow: 0 2px 8px rgba(0,0,0,0.3); 
                transition: all 0.3s ease;
                display: block;
            "></div>`,
            iconSize: [iconSize, iconSize],
            iconAnchor: [iconSize / 2, iconSize / 2]
        });
        
        // Obtener coordenadas y validar
        let lat = parseFloat(proyecto.lat);
        let lon = parseFloat(proyecto.lon);
        
        // Validar que las coordenadas sean válidas y estén en el rango de Cali/Colombia
        // Cali: Lat ~3.42, Lon ~-76.53
        // Rango razonable: Lat 3.0-4.5, Lon -77.5 a -76.0
        const isValidCoord = !isNaN(lat) && !isNaN(lon) && 
            lat !== 0 && lon !== 0 &&
            lat >= 3.0 && lat <= 4.5 &&
            lon >= -77.5 && lon <= -76.0;
        
        // Si las coordenadas están fuera de rango, pueden estar invertidas
        // Intentar invertir si están en un rango que sugiere que están invertidas
        if (!isValidCoord && !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
            // Si lat está en rango de lon y lon está en rango de lat, están invertidas
            if (lat >= -77.5 && lat <= -76.0 && lon >= 3.0 && lon <= 4.5) {
                console.warn(`[updateMap] Coordenadas invertidas detectadas para proyecto ${proyecto.id || proyecto.nombre}, corrigiendo...`);
                const temp = lat;
                lat = lon;
                lon = temp;
            }
        }
        
        // Validar nuevamente después de la corrección
        if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) {
            console.warn(`[updateMap] Coordenadas inválidas para proyecto ${proyecto.id || proyecto.nombre}: lat=${proyecto.lat}, lon=${proyecto.lon}`);
            return null; // No crear marcador si las coordenadas son inválidas
        }
        
        // Validar rango final
        if (lat < 3.0 || lat > 4.5 || lon < -77.5 || lon > -76.0) {
            console.warn(`[updateMap] Coordenadas fuera de rango para proyecto ${proyecto.id || proyecto.nombre}: lat=${lat}, lon=${lon}`);
            // Aún así crear el marcador, pero registrar la advertencia
        }
        
        const marker = L.marker([lat, lon], {
            icon: markerIcon,
            opacity: 1.0
        });
        
        marker.bindPopup(createPopupContent(proyecto), { maxWidth: 300 });
        
        // Guardar marcador en el mapa para selección
        if (proyecto.id) {
            projectMarkersMap.set(proyecto.id, marker);
        }
        
        // Agregar evento click para abrir Google Maps (opcional - se puede remover si no se desea)
        // El popup ya tiene el botón, así que este evento es opcional
        marker.on('click', function() {
            // Comentado: si quieres que el click del marcador también abra Google Maps, descomenta:
            // const url = `https://www.google.com/maps?q=${proyecto.lat},${proyecto.lon}`;
            // window.open(url, '_blank', 'noopener,noreferrer');
        });
        
        return marker;
    }).filter(marker => marker !== null); // Filtrar marcadores nulos

    markers = markerLayers;

    

    // IMPORTANTE: Siempre agregar marcadores si están habilitados
    // Si markersEnabled es false, forzar a true para mostrar marcadores
    if (!markersEnabled) {
        console.warn('[updateMap] markersEnabled está en false, forzando a true para mostrar marcadores');
        markersEnabled = true;
        const markersToggle = document.getElementById('markers-toggle');
        if (markersToggle) {
            markersToggle.checked = true;
        }
    }
    
    // Agregar marcadores según el estado de clústeres y visibilidad
    if (markersEnabled) {
        if (clustersEnabled && markerCluster) {
            // Limpiar cluster antes de agregar nuevos marcadores
            markerCluster.clearLayers();
            if (markerLayers.length > 0) {
                markerCluster.addLayers(markerLayers);
                
            }
            // Asegurarse de que el cluster esté en el mapa
            if (!map.hasLayer(markerCluster)) {
                map.addLayer(markerCluster);
                
            }
        } else {
            // Agregar marcadores individuales
            let addedCount = 0;
            markerLayers.forEach(marker => {
                if (!map.hasLayer(marker)) {
                    marker.addTo(map);
                    addedCount++;
                }
            });
            
        }
    }

    // Actualizar heatmap con debounce si está activado
    if (heatmapEnabled) {
        clearTimeout(heatmapDebounceTimer);
        heatmapDebounceTimer = setTimeout(() => {
            createHeatmap();
        }, 150);
    } else {
        // Si el heatmap está desactivado, asegurarse de que esté removido
        removeHeatmap();
    }

    // Actualizar contador (mostrar total de proyectos filtrados)
    const visibleCount = dataToShow.length;
    
    document.getElementById('map-count').textContent = visibleCount;
    
    // Actualizar contador en el tab
    const tableCountElement = document.getElementById('table-count');
    if (tableCountElement) {
        tableCountElement.textContent = `(${visibleCount})`;
    }
    
    // Actualizar leyenda de categorías
    updateMarkerLegend();
}

// Enfocar el mapa en los proyectos actuales
function fitToData() {
    if (!map || !proyectosData || proyectosData.length === 0) {
        return;
    }
    
    // Obtener proyectos con coordenadas válidas
    const validProjects = proyectosData.filter(p => {
        const lat = parseFloat(p.lat);
        const lon = parseFloat(p.lon);
        return !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0 &&
               lat >= 3.0 && lat <= 4.5 && lon >= -77.5 && lon <= -76.0;
    });
    
    if (validProjects.length === 0) {
        return;
    }
    
    // Calcular bounds
    const bounds = validProjects.map(p => [parseFloat(p.lat), parseFloat(p.lon)]);
    
    if (bounds.length > 0) {
        map.fitBounds(bounds, {
            padding: [50, 50],
            maxZoom: 15,
            animate: true
        });
    }
}

// Cache de colores generados para evitar repeticiones
const colorCache = new Map();
const usedHues = new Set();

// Generar color consistente basado en un string (hash) - mejorado para evitar repeticiones
function generateColorFromString(str) {
    if (!str || str === 'N/A' || str === '') {
        return '#95A5A6'; // Gris para valores nulos
    }
    
    // Verificar cache
    if (colorCache.has(str)) {
        return colorCache.get(str);
    }
    
    // Hash simple para generar un número consistente
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Generar color HSL con mejor distribución
    let hue = Math.abs(hash) % 360;
    
    // Evitar colores muy similares (diferencia mínima de 30 grados)
    let attempts = 0;
    while (usedHues.size > 0 && attempts < 50) {
        let tooClose = false;
        for (const usedHue of usedHues) {
            const diff = Math.min(Math.abs(hue - usedHue), 360 - Math.abs(hue - usedHue));
            if (diff < 30) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) break;
        hue = (hue + 30) % 360;
        attempts++;
    }
    
    // Añadir el hue usado (solo si no hay demasiados)
    if (usedHues.size < 50) {
        usedHues.add(hue);
    }
    
    // Saturación y luminosidad más consistentes pero variadas
    const saturation = 70 + (Math.abs(hash) % 15); // 70-85%
    const lightness = 50 + (Math.abs(hash) % 10); // 50-60%
    
    // Convertir HSL a RGB y luego a hexadecimal para mejor compatibilidad
    const hslToRgb = (h, s, l) => {
        s /= 100;
        l /= 100;
        const k = n => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
    };
    
    const [r, g, b] = hslToRgb(hue, saturation, lightness);
    const color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    
    // Guardar en cache
    colorCache.set(str, color);
    
    return color;
}

// Limpiar cache de colores (útil cuando cambia el criterio)
function clearColorCache() {
    colorCache.clear();
    usedHues.clear();
}

// Obtener color para marcador según el criterio seleccionado
function getMarkerColor(proyecto) {
    if (!proyecto) {
        console.warn('[getMarkerColor] Proyecto es null o undefined');
        return '#95A5A6';
    }
    
    let color = '#95A5A6'; // Color por defecto
    
    try {
        switch (markerColorCriterion) {
            case 'clasificacion':
    const colors = {
        'Exitoso': '#27AE60',
        'Moderado': '#F39C12',
        'Mejorable': '#E74C3C'
    };
                const clasificacion = String(proyecto.clasificacion || 'Moderado').trim();
                color = colors[clasificacion] || colors['Moderado'] || '#F39C12';
                break;
                
            case 'vende':
                color = generateColorFromString(String(proyecto.vende || 'N/A'));
                break;
                
            case 'zona':
                color = generateColorFromString(String(proyecto.zona || 'N/A'));
                break;
                
            case 'barrio':
                color = generateColorFromString(String(proyecto.barrio || 'N/A'));
                break;
                
            case 'estrato':
                color = generateColorFromString(String(proyecto.estrato || 'N/A'));
                break;
                
            case 'tipo_vis':
                const tipoVisStr = String(proyecto.tipo_vis || 'N/A').trim();
                if (tipoVisStr === 'N/A' || tipoVisStr === '') {
                    console.warn(`[getMarkerColor] Proyecto ${proyecto.id} sin tipo_vis:`, proyecto.tipo_vis);
                }
                color = generateColorFromString(tipoVisStr);
                break;
                
            default:
                color = '#95A5A6';
        }
    } catch (error) {
        console.error('[getMarkerColor] Error al obtener color:', error);
        color = '#95A5A6';
    }
    
    // Validar que el color sea un string válido (hexadecimal o HSL)
    if (!color || typeof color !== 'string' || (!color.startsWith('#') && !color.startsWith('hsl'))) {
        console.warn(`[getMarkerColor] Color inválido generado: ${color}, usando color por defecto`);
        color = '#95A5A6';
    }
    
    // Si el color es HSL, convertirlo a hexadecimal
    if (color.startsWith('hsl')) {
        // Extraer valores HSL
        const hslMatch = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (hslMatch) {
            const h = parseInt(hslMatch[1]);
            const s = parseInt(hslMatch[2]);
            const l = parseInt(hslMatch[3]);
            
            // Convertir HSL a RGB
            const hslToRgb = (h, s, l) => {
                s /= 100;
                l /= 100;
                const k = n => (n + h / 30) % 12;
                const a = s * Math.min(l, 1 - l);
                const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
                return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
            };
            
            const [r, g, b] = hslToRgb(h, s, l);
            color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
    }
    
    return color;
}

// Crear icono según el criterio de color seleccionado
function getIconForClasificacion(clasificacion, proyecto = null) {
    // Si se proporciona el proyecto completo, usar el nuevo sistema
    if (proyecto) {
        const color = getMarkerColor(proyecto);
        return L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
    }
    
    // Fallback al sistema antiguo si no se proporciona proyecto
    const colors = {
        'Exitoso': '#27AE60',
        'Moderado': '#F39C12',
        'Mejorable': '#E74C3C'
    };
    const color = colors[clasificacion] || colors['Moderado'] || '#F39C12';

    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

// Crear contenido del popup
function createPopupContent(proyecto) {
    const clasificacionClass = `clasificacion-${proyecto.clasificacion.toLowerCase()}`;
    
    return `
        <div class="popup-content">
            <div class="popup-header" style="color: ${proyecto.color}">
                ${escapeHtml(proyecto.nombre)}
            </div>
            <div class="popup-item">
                <strong>Código:</strong> ${escapeHtml(proyecto.codigo)}
            </div>
            <div class="popup-item">
                <strong>Clasificación:</strong> 
                <span class="clasificacion-badge ${clasificacionClass}">${escapeHtml(proyecto.clasificacion)}</span>
            </div>
            <div class="popup-item">
                <strong>Barrio:</strong> ${escapeHtml(proyecto.barrio)}
            </div>
            <div class="popup-item">
                <strong>Zona:</strong> ${escapeHtml(proyecto.zona)}
            </div>
            <div class="popup-item">
                <strong>Estrato:</strong> ${escapeHtml(proyecto.estrato)}
            </div>
            <div class="popup-item">
                <strong>Vende:</strong> ${escapeHtml(proyecto.vende || 'N/A')}
            </div>
            <div class="popup-item">
                <strong>Precio Promedio:</strong> ${escapeHtml(proyecto.precio_formateado)}
            </div>
            <div class="popup-item">
                <strong>Área Promedio:</strong> ${proyecto.area_promedio.toFixed(0)} m²
            </div>
            <div class="popup-item">
                <strong>Velocidad Ventas:</strong> ${proyecto.velocidad_ventas.toFixed(1)} unid/mes
            </div>
            <div class="popup-item">
                <strong>Unidades Vendidas:</strong> ${proyecto.unidades_vendidas}
            </div>
            <div class="popup-item">
                <strong>Unidades Disponibles:</strong> ${proyecto.unidades_disponibles}
            </div>
            <div class="popup-item">
                <strong>Patrón Ventas:</strong> ${escapeHtml(proyecto.patron_ventas || 'N/A')}
            </div>
            <div class="popup-item">
                <strong>Score Éxito:</strong> ${proyecto.score_exito.toFixed(2)}
            </div>
            <div class="popup-item" style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #eee;">
                <button class="btn-view-360" onclick="(function(e) { e.stopPropagation(); e.preventDefault(); const url = 'https://www.google.com/maps?q=' + ${proyecto.lat} + ',' + ${proyecto.lon}; window.open(url, '_blank', 'noopener,noreferrer'); })(event); return false;" style="width: 100%; padding: 0.5rem; background: var(--platzi-dark-blue); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                    <i class="fas fa-street-view"></i> Ver en Google Maps
                </button>
            </div>
        </div>
    `;
}

// Función de ordenamiento
function sortTable(column) {
    // Si es la misma columna, cambiar dirección; si no, ordenar ascendente
    if (tableSort.column === column) {
        tableSort.direction = tableSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        tableSort.column = column;
        tableSort.direction = 'asc';
    }
    
    // Copiar datos para ordenar
    proyectosDataSorted = [...proyectosData];
    
    // Ordenar según la columna
    proyectosDataSorted.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];
        
        // Manejar valores nulos/undefined
        if (aVal == null) aVal = '';
        if (bVal == null) bVal = '';
        
        // Ordenamiento para números
        if (column === 'precio_promedio' || column === 'area_promedio' || 
            column === 'velocidad_ventas' || column === 'unidades_vendidas' || 
            column === 'unidades_disponibles' || column === 'score_exito') {
            aVal = parseFloat(aVal) || 0;
            bVal = parseFloat(bVal) || 0;
            return tableSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        // Ordenamiento para texto (incluyendo constructor)
        if (column === 'constructor' || column === 'codigo' || column === 'nombre' || 
            column === 'barrio' || column === 'zona' || column === 'clasificacion') {
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
            if (aVal < bVal) return tableSort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return tableSort.direction === 'asc' ? 1 : -1;
            return 0;
        }
        
        // Ordenamiento para texto (fallback)
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
        
        if (tableSort.direction === 'asc') {
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        } else {
            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
    });
    
    // Actualizar indicadores visuales
    updateSortIndicators();
    
    // Renderizar tabla
    renderTable();
}

// Actualizar indicadores de ordenamiento
function updateSortIndicators() {
    // Resetear todos los indicadores
    document.querySelectorAll('.sort-indicator i').forEach(icon => {
        icon.className = 'fas fa-sort';
        icon.parentElement.parentElement.classList.remove('sort-asc', 'sort-desc');
    });
    
    // Actualizar indicador de columna activa
    if (tableSort.column) {
        const th = document.querySelector(`th[data-column="${tableSort.column}"]`);
        if (th) {
            const icon = th.querySelector('.sort-indicator i');
            if (tableSort.direction === 'asc') {
                icon.className = 'fas fa-sort-up';
                th.classList.add('sort-asc');
            } else {
                icon.className = 'fas fa-sort-down';
                th.classList.add('sort-desc');
            }
        }
    }
}

// Renderizar tabla
function renderTable() {
    const tbody = document.getElementById('table-body');
    const dataToRender = proyectosDataSorted.length > 0 ? proyectosDataSorted : proyectosData;
    
    if (dataToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="loading">No hay proyectos que coincidan con los filtros</td></tr>';
        const tableCountElement = document.getElementById('table-count');
        if (tableCountElement) {
            tableCountElement.textContent = '(0)';
        }
        return;
    }

    // Actualizar contador en el tab
    const tableCountElement = document.getElementById('table-count');
    if (tableCountElement) {
        tableCountElement.textContent = `(${dataToRender.length})`;
    }

    // Usar DocumentFragment para mejor rendimiento
    const fragment = document.createDocumentFragment();
    
    dataToRender.forEach(proyecto => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(proyecto.codigo)}</td>
            <td class="project-name">${escapeHtml(proyecto.nombre)}</td>
            <td><span class="clasificacion-badge clasificacion-${proyecto.clasificacion.toLowerCase()}">${escapeHtml(proyecto.clasificacion)}</span></td>
            <td>${escapeHtml(proyecto.barrio)}</td>
            <td>${escapeHtml(proyecto.zona)}</td>
            <td>${escapeHtml(proyecto.vende || 'N/A')}</td>
            <td class="number-cell">${escapeHtml(proyecto.precio_formateado)}</td>
            <td class="number-cell">${proyecto.area_promedio ? proyecto.area_promedio.toFixed(0) : 'N/A'}</td>
            <td class="number-cell">${proyecto.velocidad_ventas ? proyecto.velocidad_ventas.toFixed(1) : '0.0'}</td>
            <td class="number-cell">${proyecto.unidades_vendidas || 0}</td>
            <td class="number-cell">${proyecto.unidades_disponibles || 0}</td>
            <td class="number-cell score-cell">${proyecto.score_exito ? proyecto.score_exito.toFixed(2) : '0.00'}</td>
        `;
        
        // Agregar evento de clic para resaltar en el mapa
        row.addEventListener('click', function() {
            // Remover resaltado anterior
            document.querySelectorAll('tbody tr').forEach(r => r.classList.remove('selected'));
            // Agregar resaltado a la fila seleccionada
            row.classList.add('selected');
            // Centrar mapa en el proyecto
            map.setView([proyecto.lat, proyecto.lon], Math.max(map.getZoom(), 15), {
                animate: true
            });
            // Abrir popup del marcador
            markerCluster.eachLayer(function(layer) {
                if (layer instanceof L.Marker && !(layer instanceof L.MarkerCluster)) {
                    const lat = layer.getLatLng().lat;
                    const lon = layer.getLatLng().lng;
                    if (Math.abs(lat - proyecto.lat) < 0.0001 && Math.abs(lon - proyecto.lon) < 0.0001) {
                        layer.openPopup();
                    }
                }
            });
        });
        
        fragment.appendChild(row);
    });
    
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

// Actualizar tabla (wrapper)
function updateTable() {
    // Si hay un ordenamiento activo, mantenerlo
    if (tableSort.column) {
        sortTable(tableSort.column);
    } else {
        proyectosDataSorted = [];
        renderTable();
    }
}

// Función helper para escapar HTML (seguridad)
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Función helper para construir parámetros de filtros
function buildFilterParams() {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(currentFilters)) {
        if (value !== null && value !== '') {
            params.append(key, value);
        }
    }
    return params;
}

// Actualizar estadísticas y métricas (combinadas para mejor rendimiento)
async function updateStats() {
    try {
        const params = buildFilterParams();
        const response = await fetch(`/api/estadisticas?${params}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        
        if (data.success) {
            const total = data.total || 0;
            const exitosos = data.exitosos || 0;
            const moderados = data.moderados || 0;
            const mejorables = data.mejorables || 0;
            
            // Actualizar sidebar stats
            const totalProyectosEl = document.getElementById('total-proyectos');
            const exitososEl = document.getElementById('exitosos');
            const moderadosEl = document.getElementById('moderados');
            const mejorablesEl = document.getElementById('mejorables');
            
            if (totalProyectosEl) totalProyectosEl.textContent = total;
            if (exitososEl) exitososEl.textContent = exitosos;
            if (moderadosEl) moderadosEl.textContent = moderados;
            if (mejorablesEl) mejorablesEl.textContent = mejorables;
            
            // Actualizar gráfico circular (pie chart)
            updatePieChart();
            
            // Actualizar panel de estadísticas de categorías
            updateCategoryStatsPanel();
        } else {
            // Si hay error, establecer valores por defecto
            const totalProyectosEl = document.getElementById('total-proyectos');
            const exitososEl = document.getElementById('exitosos');
            const moderadosEl = document.getElementById('moderados');
            const mejorablesEl = document.getElementById('mejorables');
            
            if (totalProyectosEl) totalProyectosEl.textContent = '0';
            if (exitososEl) exitososEl.textContent = '0';
            if (moderadosEl) moderadosEl.textContent = '0';
            if (mejorablesEl) mejorablesEl.textContent = '0';
        }
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
        // Establecer valores por defecto en caso de error
        try {
            document.getElementById('total-proyectos').textContent = '0';
            document.getElementById('exitosos').textContent = '0';
            document.getElementById('moderados').textContent = '0';
            document.getElementById('mejorables').textContent = '0';
            document.getElementById('metric-exitosos').textContent = '0';
            document.getElementById('metric-moderados').textContent = '0';
            document.getElementById('metric-mejorables').textContent = '0';
            document.getElementById('metric-score').textContent = '0.00';
        } catch (domError) {
            // Si los elementos no existen, solo registrar el error
            console.warn('No se pudieron actualizar las estadísticas:', domError);
        }
    }
}

// Actualizar métricas principales (ahora combinado con updateStats)
async function updateMetrics() {
    // Ya se actualiza en updateStats para evitar llamadas duplicadas
    return updateStats();
}

// Configurar event listeners
function setupEventListeners() {
    // Filtros
    document.getElementById('clasificacion').addEventListener('change', function() {
        currentFilters.clasificacion = this.value;
        loadProyectos();
    });

    document.getElementById('zona').addEventListener('change', function() {
        currentFilters.zona = this.value;
        loadProyectos();
    });

    document.getElementById('barrio').addEventListener('change', function() {
        currentFilters.barrio = this.value;
        loadProyectos();
    });

    document.getElementById('tipo_vis').addEventListener('change', function() {
        currentFilters.tipo_vis = this.value;
        loadProyectos();
        loadRankingConstructores(currentFilters.estado);
    });

    document.getElementById('estado').addEventListener('change', function() {
        currentFilters.estado = this.value;
        loadProyectos();
        loadRankingConstructores(currentFilters.estado);
    });

    // Botón aplicar precio
    document.getElementById('aplicar_precio').addEventListener('click', function() {
        const precioMin = document.getElementById('precio_min').value;
        const precioMax = document.getElementById('precio_max').value;
        currentFilters.precio_min = precioMin && precioMin !== '' ? precioMin : null;
        currentFilters.precio_max = precioMax && precioMax !== '' ? precioMax : null;
        loadProyectos();
        updatePriceRangeInfo();
    });
    
    // Botón limpiar precio
    const btnLimpiarPrecio = document.getElementById('limpiar_precio');
    if (btnLimpiarPrecio) {
        btnLimpiarPrecio.addEventListener('click', function() {
            document.getElementById('precio_min').value = '';
            document.getElementById('precio_max').value = '';
            currentFilters.precio_min = null;
            currentFilters.precio_max = null;
            loadProyectos();
            updatePriceRangeInfo();
        });
    }
    
    // Permitir Enter en los campos de precio
    document.getElementById('precio_min').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('aplicar_precio').click();
        }
    });
    
    document.getElementById('precio_max').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('aplicar_precio').click();
        }
    });

    // Toggle de información (opcional - solo si existe)
    const infoToggle = document.getElementById('info-toggle');
    if (infoToggle) {
        infoToggle.addEventListener('click', function() {
        const panel = document.getElementById('info-panel');
            if (panel) {
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
        } else {
            panel.style.display = 'none';
                }
        }
    });
    }

    // Botón de descarga
    // Botón de descarga CSV
    const btnDescargar = document.getElementById('btn-descargar-csv');
    if (btnDescargar) {
        btnDescargar.addEventListener('click', function() {
        downloadCSV();
    });
    }
    
    // Event listeners para ordenamiento de tabla
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', function() {
            const column = this.getAttribute('data-column');
            sortTable(column);
        });
    });
}

// Descargar CSV (optimizado)
function downloadCSV() {
    try {
        // Construir parámetros de filtros
        const params = new URLSearchParams();
        
        // Agregar todos los filtros activos
        if (currentFilters.clasificacion && currentFilters.clasificacion !== 'Todos') {
            params.append('clasificacion', currentFilters.clasificacion);
        }
        if (currentFilters.zona && currentFilters.zona !== 'Todas') {
            params.append('zona', currentFilters.zona);
        }
        if (currentFilters.barrio && currentFilters.barrio !== 'Todos') {
            params.append('barrio', currentFilters.barrio);
        }
        if (currentFilters.tipo_vis && currentFilters.tipo_vis !== 'Todos') {
            params.append('tipo_vis', currentFilters.tipo_vis);
        }
        if (currentFilters.estado && currentFilters.estado !== 'Todos') {
            params.append('estado', currentFilters.estado);
        }
        if (currentFilters.precio_min && currentFilters.precio_min !== null && currentFilters.precio_min !== '') {
            params.append('precio_min', currentFilters.precio_min);
        }
        if (currentFilters.precio_max && currentFilters.precio_max !== null && currentFilters.precio_max !== '') {
            params.append('precio_max', currentFilters.precio_max);
        }
        
        const url = `/api/descargar?${params.toString()}`;
    window.location.href = url;
    } catch (error) {
        console.error('Error al descargar CSV:', error);
        alert('Error al descargar el archivo CSV. Por favor, intenta nuevamente.');
    }
}

// Configurar controles del sidebar (expandir/colapsar y cambiar ancho)
function setupSidebarControls() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarResize = document.getElementById('sidebar-resize');
    
    if (!sidebar || !sidebarToggle || !sidebarResize) return;
    
    // Toggle colapsar/expandir
    sidebarToggle.addEventListener('click', function() {
        sidebar.classList.toggle('collapsed');
        // Guardar estado en localStorage
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
    });
    
    // Restaurar estado del sidebar
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed) {
        sidebar.classList.add('collapsed');
    }
    
    // Cambiar ancho del sidebar
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    sidebarResize.addEventListener('mousedown', function(e) {
        if (sidebar.classList.contains('collapsed')) return;
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', function(e) {
        if (!isResizing) return;
        const diff = e.clientX - startX;
        const newWidth = Math.max(200, Math.min(500, startWidth + diff));
        sidebar.style.width = newWidth + 'px';
        // Guardar ancho en localStorage
        localStorage.setItem('sidebarWidth', newWidth);
    });
    
    document.addEventListener('mouseup', function() {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
    
    // Restaurar ancho guardado
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth && !sidebar.classList.contains('collapsed')) {
        sidebar.style.width = savedWidth + 'px';
    }
    
    // Configurar pestañas del sidebar
    setupSidebarTabs();
}

// Variables para selección de proyectos
let selectedProjects = new Set();
let projectMarkersMap = new Map(); // Mapa de ID de proyecto -> marker de Leaflet

// Configurar pestañas del sidebar
function setupSidebarTabs() {
    const sidebarTabs = document.querySelectorAll('.sidebar-tab');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    sidebarTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            
            // Remover active de todas las pestañas y panes
            sidebarTabs.forEach(t => t.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            // Agregar active a la pestaña y pane seleccionados
            this.classList.add('active');
            const targetPane = document.getElementById(`tab-${targetTab}`);
            if (targetPane) {
                targetPane.classList.add('active');
            }
            
            // Si se selecciona la pestaña de estadísticas, actualizar el panel
            if (targetTab === 'estadisticas') {
                updateCategoryStatsPanel();
            }
        });
    });
}

// Configurar búsqueda y ordenamiento de proyectos
function setupProjectsSearchAndSort() {
    const searchInput = document.getElementById('project-search');
    const searchClear = document.getElementById('search-clear');
    const sortSelect = document.getElementById('project-sort');
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase().trim();
            if (searchClear) {
                searchClear.style.display = query ? 'flex' : 'none';
            }
            updateProjectsList();
        });
    }
    
    if (searchClear) {
        searchClear.addEventListener('click', function() {
            if (searchInput) {
                searchInput.value = '';
            }
            this.style.display = 'none';
            updateProjectsList();
        });
    }
    
    if (sortSelect) {
        sortSelect.addEventListener('change', function() {
            updateProjectsList();
        });
    }
}

// Actualizar lista de proyectos
function updateProjectsList() {
    const projectsList = document.getElementById('projects-list');
    if (!projectsList) return;
    
    const searchInput = document.getElementById('project-search');
    const sortSelect = document.getElementById('project-sort');
    
    const searchQuery = searchInput?.value.toLowerCase().trim() || '';
    const sortValue = sortSelect?.value || 'nombre';
    
    // Filtrar proyectos según búsqueda
    let filteredProjects = proyectosData.filter(proyecto => {
        if (!searchQuery) return true;
        const nombre = String(proyecto.nombre || '').toLowerCase();
        const zona = String(proyecto.zona || '').toLowerCase();
        const barrio = String(proyecto.barrio || '').toLowerCase();
        const vende = String(proyecto.vende || '').toLowerCase();
        return nombre.includes(searchQuery) || 
               zona.includes(searchQuery) || 
               barrio.includes(searchQuery) ||
               vende.includes(searchQuery);
    });
    
    // Ordenar proyectos
    filteredProjects.sort((a, b) => {
        switch (sortValue) {
            case 'nombre':
                return String(a.nombre || '').localeCompare(String(b.nombre || ''));
            case 'nombre-desc':
                return String(b.nombre || '').localeCompare(String(a.nombre || ''));
            case 'precio':
                return (a.precio_promedio || 0) - (b.precio_promedio || 0);
            case 'precio-desc':
                return (b.precio_promedio || 0) - (a.precio_promedio || 0);
            case 'score':
                return (b.score_exito || 0) - (a.score_exito || 0);
            case 'score-desc':
                return (a.score_exito || 0) - (b.score_exito || 0);
            case 'clasificacion':
                return String(a.clasificacion || '').localeCompare(String(b.clasificacion || ''));
            case 'zona':
                return String(a.zona || '').localeCompare(String(b.zona || ''));
            case 'barrio':
                return String(a.barrio || '').localeCompare(String(b.barrio || ''));
            default:
                return 0;
        }
    });
    
    // Actualizar badge
    const proyectosBadge = document.getElementById('proyectos-badge');
    if (proyectosBadge) {
        proyectosBadge.textContent = filteredProjects.length;
    }
    
    // Renderizar proyectos
    if (filteredProjects.length === 0) {
        projectsList.innerHTML = `
            <div class="projects-loading">
                <i class="fas fa-search"></i>
                <p>No se encontraron proyectos</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    filteredProjects.forEach(proyecto => {
        const isSelected = selectedProjects.has(proyecto.id);
        const clasificacion = String(proyecto.clasificacion || 'Moderado').toLowerCase();
        const precio = formatNumber(proyecto.precio_promedio || 0);
        const score = (proyecto.score_exito || 0).toFixed(2);
        
        html += `
            <div class="project-card ${isSelected ? 'selected' : ''}" data-project-id="${proyecto.id}">
                <div class="project-card-header">
                    <div class="project-name">${escapeHtml(proyecto.nombre || 'Sin nombre')}</div>
                    <span class="project-badge ${clasificacion}">${proyecto.clasificacion || 'Moderado'}</span>
                </div>
                <div class="project-details">
                    <div class="project-detail-item">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${escapeHtml(proyecto.zona || 'N/A')} - ${escapeHtml(proyecto.barrio || 'N/A')}</span>
                    </div>
                    <div class="project-detail-item">
                        <i class="fas fa-user"></i>
                        <span>${escapeHtml(proyecto.vende || 'N/A')}</span>
                    </div>
                    <div class="project-detail-item">
                        <i class="fas fa-star"></i>
                        <span>Score: ${score}</span>
                    </div>
                </div>
                <div class="project-price">
                    <i class="fas fa-dollar-sign"></i> ${precio} COP
                </div>
            </div>
        `;
    });
    
    projectsList.innerHTML = html;
    
    // Agregar event listeners a las tarjetas
    projectsList.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('click', function() {
            const projectId = parseInt(this.getAttribute('data-project-id'));
            toggleProjectSelection(projectId);
        });
    });
}

// Toggle selección de proyecto
function toggleProjectSelection(projectId) {
    if (selectedProjects.has(projectId)) {
        selectedProjects.delete(projectId);
    } else {
        selectedProjects.add(projectId);
    }
    
    // Actualizar UI
    const card = document.querySelector(`.project-card[data-project-id="${projectId}"]`);
    if (card) {
        card.classList.toggle('selected', selectedProjects.has(projectId));
    }
    
    // Resaltar en el mapa
    highlightProjectOnMap(projectId, selectedProjects.has(projectId));
}

// Resaltar proyecto en el mapa
function highlightProjectOnMap(projectId, highlight) {
    const marker = projectMarkersMap.get(projectId);
    if (!marker) return;
    
    if (highlight) {
        // Agregar clase de resaltado
        marker.setIcon(L.divIcon({
            className: 'custom-marker highlighted',
            html: `<div style="background-color: #FFD700; width: 24px; height: 24px; border-radius: 50%; border: 4px solid white; box-shadow: 0 0 20px rgba(255, 215, 0, 0.8);"></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        }));
        
        // Centrar mapa en el proyecto
        const proyecto = proyectosData.find(p => p.id === projectId);
        if (proyecto && map) {
            map.setView([proyecto.lat, proyecto.lon], Math.max(map.getZoom(), 15), {
                animate: true,
                duration: 0.5
            });
        }
    } else {
        // Restaurar icono original
        const proyecto = proyectosData.find(p => p.id === projectId);
        if (proyecto) {
            const color = getMarkerColor(proyecto);
            marker.setIcon(L.divIcon({
                className: 'custom-marker',
                html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            }));
        }
    }
}

// Utilidades
function formatNumber(num) {
    return new Intl.NumberFormat('es-CO').format(num);
}

function showLoading() {
    document.getElementById('loading-overlay').classList.add('show');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.remove('show');
}

// ============================================================================
// CONTROLES DEL MAPA
// ============================================================================

// Configurar controles del mapa
function setupMapControls() {
    
    
    const styleSelect = document.getElementById('map-style-select');
    const centerBtn = document.getElementById('center-data-btn');
    const clusterToggle = document.getElementById('cluster-toggle');
    const heatmapToggle = document.getElementById('heatmap-toggle');
    const markersToggle = document.getElementById('markers-toggle');
    const markerColorSelect = document.getElementById('marker-color-select');
    
    
    
    if (!styleSelect || !centerBtn || !clusterToggle || !heatmapToggle || !markersToggle) {
        console.error('[setupMapControls] ERROR: No se encontraron todos los controles del mapa. Elementos faltantes:', {
            styleSelect: !styleSelect,
            centerBtn: !centerBtn,
            clusterToggle: !clusterToggle,
            heatmapToggle: !heatmapToggle,
            markersToggle: !markersToggle
        });
        return;
    }
    
    // Cargar estado desde localStorage
    const savedStyle = localStorage.getItem('mapStyle') || 'satellite';
    const savedClusters = localStorage.getItem('mapClusters') !== 'false';
    const savedHeatmap = localStorage.getItem('mapHeatmap') === 'true';
    // Por defecto, los marcadores deben estar visibles (true)
    const savedMarkers = localStorage.getItem('mapMarkers');
    const savedMarkersEnabled = savedMarkers === null ? true : savedMarkers !== 'false';
    const allowedColorCriteria = ['clasificacion', 'vende', 'zona', 'barrio', 'estrato', 'tipo_vis'];
    let savedColorCriterion = localStorage.getItem('markerColorCriterion') || 'clasificacion';
    if (!allowedColorCriteria.includes(savedColorCriterion)) {
        savedColorCriterion = 'clasificacion';
    }
    
    styleSelect.value = savedStyle;
    clusterToggle.checked = savedClusters;
    heatmapToggle.checked = savedHeatmap;
    markersToggle.checked = savedMarkersEnabled;
    if (markerColorSelect) {
        markerColorSelect.value = savedColorCriterion;
    }
    
    clustersEnabled = savedClusters;
    heatmapEnabled = savedHeatmap;
    markersEnabled = savedMarkersEnabled; // Usar el valor correcto
    markerColorCriterion = savedColorCriterion;
    
    // Aplicar estado inicial
    setBaseStyle(savedStyle);
    updateClusterToggle();
    updateHeatmapToggle();
    updateMarkersToggle();
    
    // Event listeners
    styleSelect.addEventListener('change', function() {
        setBaseStyle(this.value);
        saveMapState();
    });
    
    centerBtn.addEventListener('click', function() {
        fitToData();
    });
    
    clusterToggle.addEventListener('change', function() {
        clustersEnabled = this.checked;
        updateClusterToggle();
        saveMapState();
    });
    
    heatmapToggle.addEventListener('change', function() {
        heatmapEnabled = this.checked;
        updateHeatmapToggle();
        saveMapState();
    });
    
    markersToggle.addEventListener('change', function() {
        markersEnabled = this.checked;
        updateMarkersToggle();
        saveMapState();
    });
    
    // Listener para cambio de criterio de color
    if (markerColorSelect) {
        markerColorSelect.addEventListener('change', function() {
            markerColorCriterion = this.value;
            localStorage.setItem('markerColorCriterion', markerColorCriterion);
            // Limpiar selección de categorías y cache de colores al cambiar criterio
            selectedCategories.clear();
            clearColorCache();
            // Actualizar marcadores con nuevos colores
            updateMap();
            // Actualizar panel de categorías y estadísticas
            updateMarkerLegend();
            updateCategoryStatsPanel();
            updatePieChart(); // Actualizar gráfico circular cuando cambia el criterio
            saveMapState();
        });
    }
    
    // Inicializar panel de categorías
    updateMarkerLegend();
    
    // Navegación con teclado
    styleSelect.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.click();
        }
    });
    
    centerBtn.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fitToData();
        }
    });
    
    // Botón para limpiar todos los filtros (excepto Estado del Proyecto)
    const clearFiltersBtn = document.getElementById('clear-filters-btn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', function() {
            clearAllFilters();
        });
        
        clearFiltersBtn.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                clearAllFilters();
            }
        });
    }
}

// Función para limpiar todos los filtros excepto "Estado del Proyecto"
function clearAllFilters() {
    // Guardar el estado actual del filtro "Estado del Proyecto"
    const estadoActual = currentFilters.estado || 'Activos';
    
    // Restablecer todos los filtros a valores por defecto (excepto estado)
    currentFilters = {
        clasificacion: 'Todos',
        zona: 'Todas',
        barrio: 'Todos',
        tipo_vis: 'Todos',
        estado: estadoActual, // Mantener el estado actual
        precio_min: null,
        precio_max: null
    };
    
    // Limpiar los selects del panel de filtros
    const clasificacionSelect = document.getElementById('clasificacion');
    const zonaSelect = document.getElementById('zona');
    const barrioSelect = document.getElementById('barrio');
    const tipoVisSelect = document.getElementById('tipo_vis');
    
    if (clasificacionSelect) clasificacionSelect.value = 'Todos';
    if (zonaSelect) zonaSelect.value = 'Todas';
    if (barrioSelect) barrioSelect.value = 'Todos';
    if (tipoVisSelect) tipoVisSelect.value = 'Todos';
    
    // Limpiar los campos de precio
    const precioMinInput = document.getElementById('precio_min');
    const precioMaxInput = document.getElementById('precio_max');
    
    if (precioMinInput) precioMinInput.value = '';
    if (precioMaxInput) precioMaxInput.value = '';
    
    // Limpiar selecciones de categorías
    selectedCategories.clear();
    
    // Limpiar selecciones de constructores
    if (typeof selectedConstructors !== 'undefined') {
        selectedConstructors.clear();
    }
    
    // Actualizar información de rango de precio
    if (typeof updatePriceRangeInfo === 'function') {
        updatePriceRangeInfo();
    }
    
    // Recargar proyectos con los filtros limpiados
    loadProyectos();
    
    // Actualizar el mapa y las vistas
    updateMap();
    updateTable();
    updateStats();
    
    // Actualizar panel de categorías y estadísticas
    if (typeof updateMarkerLegend === 'function') {
        updateMarkerLegend();
    }
    if (typeof updateCategoryStatsPanel === 'function') {
        updateCategoryStatsPanel();
    }
    
    // Actualizar estados visuales de constructores
    if (typeof updateConstructorItemsState === 'function') {
        updateConstructorItemsState();
    }
    
    // Actualizar estados visuales de categorías
    if (typeof updateCategoryStatsItemsState === 'function') {
        updateCategoryStatsItemsState();
    }
    
    // Centrar el mapa en los datos
    if (typeof fitToData === 'function') {
        fitToData();
    }
    
    console.log('[clearAllFilters] Todos los filtros han sido limpiados (excepto Estado del Proyecto:', estadoActual + ')');
}

// Cambiar estilo base del mapa
function setBaseStyle(style) {
    if (!baseLayers[style]) {
        console.warn(`Estilo de mapa no encontrado: ${style}`);
        return;
    }
    
    if (currentBaseLayer) {
        map.removeLayer(currentBaseLayer);
    }
    
    currentBaseLayer = baseLayers[style];
    currentBaseLayer.addTo(map);
    
    // Actualizar select
    const styleSelect = document.getElementById('map-style-select');
    if (styleSelect) {
        styleSelect.value = style;
    }
    
    // Actualizar URL
    updateURLParam('style', style);
}

// Centrar mapa en todos los proyectos
function fitToData() {
    if (!proyectosData || proyectosData.length === 0) {
        console.warn('No hay proyectos para centrar');
        return;
    }
    
    // Filtrar proyectos con coordenadas válidas
    const validProjects = proyectosData.filter(p => 
        p.lat && p.lon && 
        !isNaN(p.lat) && !isNaN(p.lon) &&
        p.lat !== 0 && p.lon !== 0
    );
    
    if (validProjects.length === 0) {
        console.warn('No hay proyectos con coordenadas válidas');
        return;
    }
    
    // Calcular bounds
    const bounds = L.latLngBounds(
        validProjects.map(p => [p.lat, p.lon])
    );
    
    // Ajustar vista con padding
    map.fitBounds(bounds, {
        padding: [50, 50],
        maxZoom: 15
    });
}

// Actualizar toggle de clústeres
function updateClusterToggle() {
    if (!markerCluster) return;
    
    // Si los marcadores están desactivados, no hacer nada
    if (!markersEnabled) {
        // Actualizar aria-checked
        const clusterToggle = document.getElementById('cluster-toggle');
        if (clusterToggle) {
            clusterToggle.setAttribute('aria-checked', clustersEnabled);
        }
        return;
    }
    
    if (clustersEnabled) {
        // Activar clústeres: remover marcadores individuales del mapa y agregarlos al cluster
        // Primero, remover todos los marcadores individuales del mapa
        markers.forEach(marker => {
            if (map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        });
        
        // Limpiar el cluster y agregar todos los marcadores
        markerCluster.clearLayers();
        if (markers.length > 0) {
            markerCluster.addLayers(markers);
        }
        
        // Asegurarse de que el cluster esté en el mapa
        if (!map.hasLayer(markerCluster)) {
            map.addLayer(markerCluster);
        }
    } else {
        // Desactivar clústeres: remover cluster y mostrar marcadores individuales
        if (map.hasLayer(markerCluster)) {
            map.removeLayer(markerCluster);
        }
        
        // Agregar marcadores individuales al mapa
        markers.forEach(marker => {
            if (!map.hasLayer(marker)) {
                marker.addTo(map);
            }
        });
    }
    
    // Actualizar aria-checked
    const clusterToggle = document.getElementById('cluster-toggle');
    if (clusterToggle) {
        clusterToggle.setAttribute('aria-checked', clustersEnabled);
    }
}

// Actualizar toggle de mapa de calor
function updateHeatmapToggle() {
    if (heatmapEnabled) {
        createHeatmap();
        const legend = document.getElementById('heatmap-legend');
        if (legend) {
            legend.style.display = 'block';
        }
    } else {
        removeHeatmap();
        const legend = document.getElementById('heatmap-legend');
        if (legend) {
            legend.style.display = 'none';
        }
    }
    
    // Actualizar aria-checked
    const heatmapToggle = document.getElementById('heatmap-toggle');
    if (heatmapToggle) {
        heatmapToggle.setAttribute('aria-checked', heatmapEnabled);
    }
}

// Actualizar toggle de marcadores
function updateMarkersToggle() {
    if (markersEnabled) {
        // Mostrar marcadores según el estado de clústeres
        if (clustersEnabled && markerCluster) {
            // Si los clústeres están activos, mostrar el cluster
            if (!map.hasLayer(markerCluster)) {
                markerCluster.clearLayers();
                if (markers.length > 0) {
                    markerCluster.addLayers(markers);
                }
                map.addLayer(markerCluster);
            }
        } else {
            // Si los clústeres están desactivados, mostrar marcadores individuales
            markers.forEach(marker => {
                if (!map.hasLayer(marker)) {
                    marker.addTo(map);
                }
            });
        }
    } else {
        // Ocultar todos los marcadores
        if (clustersEnabled && markerCluster && map.hasLayer(markerCluster)) {
            map.removeLayer(markerCluster);
        } else {
            markers.forEach(marker => {
                if (map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
        }
    }
    
    // Actualizar aria-checked
    const markersToggle = document.getElementById('markers-toggle');
    if (markersToggle) {
        markersToggle.setAttribute('aria-checked', markersEnabled);
    }
}

// Función para calcular percentil (estilo GIS)
function percentile(values, p) {
    if (!values.length) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (sorted.length - 1) * p;
    const lo = Math.floor(index);
    const hi = Math.ceil(index);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

// Normalizador de pesos robusto (estilo GIS)
function weightNormalizer(items, getter) {
    const vals = items.map(getter).filter(v => Number.isFinite(v));
    if (vals.length === 0) return () => 0;
    
    const p05 = percentile(vals, 0.05);
    const p95 = percentile(vals, 0.95);
    
    return (v) => {
        if (!Number.isFinite(v) || p05 === p95) return 0;
        return Math.max(0, Math.min(1, (v - p05) / (p95 - p05)));
    };
}

// Crear mapa de calor (estilo GIS - más agresivo y visible)
function createHeatmap() {
    // Limpiar heatmap anterior si existe
    removeHeatmap();
    
    if (!proyectosData || proyectosData.length === 0) {
        
        return;
    }
    
    // Filtrar proyectos con coordenadas y precio válidos
    const validProjects = proyectosData.filter(p => 
        p.lat && p.lon && 
        !isNaN(p.lat) && !isNaN(p.lon) &&
        p.lat !== 0 && p.lon !== 0 &&
        p.precio_promedio && 
        p.precio_promedio > 0
    );
    
    if (validProjects.length === 0) {
        console.warn('No hay proyectos con coordenadas y precio válidos para el heatmap');
        return;
    }
    
    
    
    // Usar normalizador robusto estilo GIS
    const normalize = weightNormalizer(validProjects, p => p.precio_promedio);
    
    // Obtener valores para la leyenda
    const prices = validProjects.map(p => p.precio_promedio).sort((a, b) => a - b);
    const p5 = percentile(prices, 0.05);
    const p95 = percentile(prices, 0.95);
    
    
    
    // Crear datos normalizados con intensidad mejorada
    const normalizedData = validProjects.map(p => {
        const weight = normalize(p.precio_promedio);
        // Aumentar intensidad base para mejor visibilidad (mínimo 0.1 para puntos con peso bajo)
        const intensity = Math.max(0.1, weight * 0.9 + 0.1);
        return [p.lat, p.lon, intensity];
    });
    
    
    
    // Verificar si leaflet.heat está disponible
    if (typeof L.heatLayer !== 'function' && typeof L.heat !== 'function') {
        console.error('leaflet.heat no está disponible. Verificando carga de biblioteca...');
            
        return;
    }
    
    // Crear capa de calor con parámetros más agresivos (estilo GIS)
    try {
        const heatFunction = typeof L.heatLayer === 'function' ? L.heatLayer : L.heat;
        
        // Parámetros ajustados para mayor visibilidad y pigmentación
        const currentZoom = map.getZoom();
        const radius = Math.max(40, Math.min(80, 30 + currentZoom * 3)); // Radio adaptativo por zoom
        const blur = Math.max(25, Math.min(50, 20 + currentZoom * 2)); // Blur adaptativo
        
        heatmapLayer = heatFunction(normalizedData, {
            radius: radius,
            blur: blur,
            maxZoom: 18,
            minOpacity: 0.4, // Opacidad mínima más alta para mejor visibilidad
            max: 1.0,
            // Gradiente estilo GIS: azul → cian → amarillo → naranja → rojo
            gradient: {
                0.0: '#2c7bb6',    // Azul (bajo)
                0.25: '#abd9e9',   // Cian claro
                0.5: '#ffffbf',    // Amarillo (medio)
                0.75: '#fdae61',   // Naranja
                1.0: '#d7191c'     // Rojo (alto)
            }
        });
        
        heatmapLayer.addTo(map);
        
        
        // Actualizar leyenda
        updateHeatmapLegend(p5, p95);
        
        // Actualizar heatmap cuando cambie el zoom para mantener visibilidad
        map.off('zoomend', updateHeatmapOnZoom);
        map.on('zoomend', updateHeatmapOnZoom);
        
    } catch (error) {
        console.error('Error al crear heatmap:', error);
    }
}

// Actualizar heatmap cuando cambia el zoom (mantener visibilidad)
let zoomUpdateTimer = null;
function updateHeatmapOnZoom() {
    if (heatmapEnabled && heatmapLayer) {
        // Debounce para evitar recrear demasiado rápido
        clearTimeout(zoomUpdateTimer);
        zoomUpdateTimer = setTimeout(() => {
            // Recrear heatmap con nuevos parámetros de radio/blur según zoom
            createHeatmap();
        }, 300);
    }
}

// Remover mapa de calor
function removeHeatmap() {
    if (heatmapLayer) {
        map.removeLayer(heatmapLayer);
        heatmapLayer = null;
    }
}

// Actualizar leyenda del heatmap (estilo GIS)
function updateHeatmapLegend(minPrice, maxPrice) {
    const formatCurrency = (value) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    };
    
    const lowText = document.getElementById('heatmap-legend-low');
    const mediumText = document.getElementById('heatmap-legend-medium');
    const highText = document.getElementById('heatmap-legend-high');
    
    const midPrice = (minPrice + maxPrice) / 2;
    
    if (lowText) {
        lowText.textContent = `Bajo: ${formatCurrency(minPrice)}`;
    }
    if (mediumText) {
        mediumText.textContent = `Medio: ${formatCurrency(midPrice)}`;
    }
    if (highText) {
        highText.textContent = `Alto: ${formatCurrency(maxPrice)}`;
    }
    
    // Actualizar colores de la leyenda para que coincidan con el gradiente
    const legendColors = document.querySelectorAll('.heatmap-legend-color');
    if (legendColors.length >= 3) {
        legendColors[0].style.background = '#2c7bb6'; // Azul (bajo)
        legendColors[1].style.background = '#ffffbf'; // Amarillo (medio)
        legendColors[2].style.background = '#d7191c'; // Rojo (alto)
    }
}

// Guardar estado del mapa
function saveMapState() {
    const styleSelect = document.getElementById('map-style-select');
    const clusterToggle = document.getElementById('cluster-toggle');
    const heatmapToggle = document.getElementById('heatmap-toggle');
    const markersToggle = document.getElementById('markers-toggle');
    const markerColorSelect = document.getElementById('marker-color-select');
    
    if (styleSelect) {
        localStorage.setItem('mapStyle', styleSelect.value);
        updateURLParam('style', styleSelect.value);
    }
    if (clusterToggle) {
        localStorage.setItem('mapClusters', clusterToggle.checked);
        updateURLParam('cluster', clusterToggle.checked ? '1' : '0');
    }
    if (heatmapToggle) {
        localStorage.setItem('mapHeatmap', heatmapToggle.checked);
        updateURLParam('heat', heatmapToggle.checked ? '1' : '0');
    }
    if (markersToggle) {
        localStorage.setItem('mapMarkers', markersToggle.checked);
        updateURLParam('markers', markersToggle.checked ? '1' : '0');
    }
    if (markerColorSelect) {
        localStorage.setItem('markerColorCriterion', markerColorSelect.value);
        updateURLParam('markerColor', markerColorSelect.value);
    }
}

// Cargar estado desde URL
function loadMapStateFromURL() {
    const params = new URLSearchParams(window.location.search);
    const style = params.get('style');
    const cluster = params.get('cluster');
    const heat = params.get('heat');
    const markers = params.get('markers');
    
    if (style && baseLayers[style]) {
        setBaseStyle(style);
        const styleSelect = document.getElementById('map-style-select');
        if (styleSelect) {
            styleSelect.value = style;
        }
    }
    
    if (cluster !== null) {
        const clusterToggle = document.getElementById('cluster-toggle');
        if (clusterToggle) {
            clusterToggle.checked = cluster === '1';
            clustersEnabled = cluster === '1';
            updateClusterToggle();
        }
    }
    
    if (heat !== null) {
        const heatmapToggle = document.getElementById('heatmap-toggle');
        if (heatmapToggle) {
            heatmapToggle.checked = heat === '1';
            heatmapEnabled = heat === '1';
            updateHeatmapToggle();
        }
    }
    
    if (markers !== null) {
        const markersToggle = document.getElementById('markers-toggle');
        if (markersToggle) {
            markersToggle.checked = markers === '1';
            markersEnabled = markers === '1';
            updateMarkersToggle();
        }
    }
    
    const markerColor = params.get('markerColor');
    if (markerColor) {
        const markerColorSelect = document.getElementById('marker-color-select');
        if (markerColorSelect && ['clasificacion', 'vende', 'zona', 'barrio'].includes(markerColor)) {
            markerColorSelect.value = markerColor;
            markerColorCriterion = markerColor;
        }
    }
}

// Actualizar parámetro en URL
function updateURLParam(key, value) {
    const url = new URL(window.location);
    url.searchParams.set(key, value);
    window.history.replaceState({}, '', url);
}

// Actualizar panel de categorías de marcadores (ahora en el sidebar)
function updateMarkerLegend() {
    const categoriesList = document.getElementById('categories-list');
    const categoriesTitle = document.getElementById('categories-panel-title');
    const categoriesSubtitle = document.getElementById('categories-subtitle');
    const categoriesPanel = document.getElementById('categories-panel-sidebar');
    
    // Ocultar SOLO el panel de filtrado de categorías cuando el criterio es "clasificacion"
    // Pero permitir que se generen las categorías para la tabla de estadísticas
    if (categoriesPanel) {
        if (markerColorCriterion === 'clasificacion') {
            categoriesPanel.style.display = 'none';
        } else {
            categoriesPanel.style.display = '';
        }
    }
    
    // Si no hay lista de categorías, continuar de todas formas para generar allCategories
    // (necesario para la tabla de estadísticas)
    if (!categoriesList && markerColorCriterion !== 'clasificacion') {
        return;
    }
    
    const sourceData = proyectosDataOriginal.length > 0 ? proyectosDataOriginal : proyectosData;
    const currentData = Array.isArray(proyectosData) ? proyectosData : [];
    
    if (!sourceData || sourceData.length === 0) {
        if (categoriesList) {
        categoriesList.innerHTML = '<div class="categories-loading"><i class="fas fa-exclamation-circle"></i><p>No hay datos disponibles</p></div>';
        }
        // Limpiar allCategories si no hay datos
        allCategories = [];
        // Aún así, actualizar el panel de estadísticas
        updateCategoryStatsPanel();
        return;
    }
    
    const categorias = new Map();
    const getCategoriaInfo = (proyecto) => {
        let categoria = 'N/A';
        let color = '#95A5A6';
        
        switch (markerColorCriterion) {
            case 'clasificacion': {
                categoria = String(proyecto.clasificacion || 'Moderado').trim();
                const colors = {
                    'Exitoso': '#27AE60',
                    'Moderado': '#F39C12',
                    'Mejorable': '#E74C3C'
                };
                color = colors[categoria] || colors['Moderado'] || '#F39C12';
                break;
            }
            case 'vende':
                categoria = String(proyecto.vende || 'N/A').trim();
                color = generateColorFromString(categoria);
                break;
            case 'zona':
                categoria = String(proyecto.zona || 'N/A').trim();
                color = generateColorFromString(categoria);
                break;
            case 'barrio':
                categoria = String(proyecto.barrio || 'N/A').trim();
                color = generateColorFromString(categoria);
                break;
            case 'estrato':
                categoria = String(proyecto.estrato || 'N/A').trim();
                color = generateColorFromString(categoria);
                break;
            case 'tipo_vis':
                categoria = String(proyecto.tipo_vis || 'N/A').trim();
                color = generateColorFromString(categoria);
                break;
            default:
                categoria = 'N/A';
                color = '#95A5A6';
        }
        
        if (!categoria || categoria === '') {
            categoria = 'N/A';
        }
        
        return { categoria, color };
    };
    
    // Registrar totales por categoría usando el dataset base
    sourceData.forEach(proyecto => {
        const { categoria, color } = getCategoriaInfo(proyecto);
        const id = categoria.toLowerCase().replace(/\s+/g, '-');
        
        if (!categorias.has(categoria)) {
            categorias.set(categoria, {
                nombre: categoria,
                color,
                count: 0,
                visibleCount: 0,
                id
            });
        }
        
        categorias.get(categoria).count++;
    });
    
    // Registrar cuántos elementos están visibles actualmente (dataset filtrado)
    currentData.forEach(proyecto => {
        const { categoria, color } = getCategoriaInfo(proyecto);
        const id = categoria.toLowerCase().replace(/\s+/g, '-');
        
        if (!categorias.has(categoria)) {
            categorias.set(categoria, {
                nombre: categoria,
                color,
                count: 0,
                visibleCount: 0,
                id
            });
        }
        
        categorias.get(categoria).visibleCount++;
    });
    
    // Obtener categorías únicas según el criterio seleccionado
    const categoriasArray = Array.from(categorias.values()).sort((a, b) => {
        if (a.nombre === 'N/A') return 1;
        if (b.nombre === 'N/A') return -1;
        if (markerColorCriterion === 'estrato') {
            const aNum = parseInt(a.nombre) || 0;
            const bNum = parseInt(b.nombre) || 0;
            return aNum - bNum;
        }
        return a.nombre.localeCompare(b.nombre);
    });
    
    // Guardar todas las categorías
    allCategories = categoriasArray;
    
    // No inicializar selección por defecto (estilo Power BI - sin selección inicial)
    // selectedCategoryId permanece null hasta que el usuario seleccione una categoría
    
    // Actualizar título y subtítulo
    const titulos = {
        'clasificacion': 'Clasificación', // Eliminado "Filtrar" según solicitud del usuario
        'vende': 'Filtrar Vendedor',
        'zona': 'Filtrar Zona',
        'barrio': 'Filtrar Barrio'
    };
    const subtitulos = {
        'clasificacion': 'Selecciona las clasificaciones a mostrar',
        'vende': 'Selecciona los vendedores a mostrar',
        'zona': 'Selecciona las zonas a mostrar',
        'barrio': 'Selecciona los barrios a mostrar'
    };
    
    if (categoriesTitle) {
        categoriesTitle.textContent = titulos[markerColorCriterion] || 'Filtrar Categorías';
    }
    if (categoriesSubtitle) {
        categoriesSubtitle.textContent = subtitulos[markerColorCriterion] || 'Selecciona las categorías a mostrar';
    }
    
    // Solo actualizar el HTML de la lista si el panel está visible (no es "clasificacion")
    if (categoriesList && markerColorCriterion !== 'clasificacion') {
    // Generar HTML de las categorías
    if (categoriasArray.length === 0) {
        categoriesList.innerHTML = '<div class="categories-loading"><i class="fas fa-exclamation-circle"></i><p>No hay categorías disponibles</p></div>';
        updateCategoriesCount();
            // Aún así, actualizar el panel de estadísticas
            updateCategoryStatsPanel();
        return;
    }
    
    // Filtrar por búsqueda
    const searchInput = document.getElementById('categories-search');
    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const filteredCategories = categoriasArray.filter(cat => {
        if (!searchQuery) return true;
        return cat.nombre.toLowerCase().includes(searchQuery);
    });
    
    let html = '';
    filteredCategories.forEach(cat => {
        const isSelected = selectedCategories.has(cat.id); // Selección múltiple
        html += `
            <div class="categories-item ${isSelected ? 'selected' : ''}" data-category-id="${cat.id}">
                <input type="checkbox" id="cat-${cat.id}" ${isSelected ? 'checked' : ''} data-category-id="${cat.id}">
                <label for="cat-${cat.id}" class="categories-item-checkbox"></label>
                <span class="categories-item-color" style="background-color: ${cat.color};"></span>
                <div class="categories-item-info">
                    <div class="categories-item-name">${escapeHtml(cat.nombre)}</div>
                    <div class="categories-item-count">${cat.count} proyecto${cat.count !== 1 ? 's' : ''}</div>
                </div>
            </div>
        `;
    });
    
    if (filteredCategories.length === 0) {
        html = '<div class="categories-loading"><i class="fas fa-search"></i><p>No se encontraron categorías</p></div>';
    }
    
    categoriesList.innerHTML = html;
    
    // Agregar event listeners a los checkboxes (selección múltiple)
    categoriesList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const categoryId = this.getAttribute('data-category-id');
            const item = this.closest('.categories-item');
            
            if (this.checked) {
                // Agregar a la selección
                selectedCategories.add(categoryId);
                if (item) item.classList.add('selected');
            } else {
                // Remover de la selección
                selectedCategories.delete(categoryId);
                if (item) item.classList.remove('selected');
            }
            
            // Actualizar filtro
            if (selectedCategories.size === 0) {
                showAllCategories();
            } else {
                filterBySelectedCategories();
            }
            
            updateCategoriesCount();
        });
    });
    
    // Agregar event listener al item completo (click en cualquier parte)
    categoriesList.querySelectorAll('.categories-item').forEach(item => {
        item.addEventListener('click', function(e) {
            if (e.target.type !== 'checkbox' && e.target.tagName !== 'LABEL') {
                const checkbox = this.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            }
        });
    });
    
    updateCategoriesCount();
    }
    
    // Actualizar panel de estadísticas con información de categorías
    updateCategoryStatsPanel();
    
    // Actualizar gráfico circular después de actualizar las categorías
    updatePieChart();
}

// Variables globales para búsqueda y ordenamiento de categorías
let categorySearchQuery = '';
let categorySortOrder = 'count-desc';

// Actualizar panel de estadísticas con información de categorías
function updateCategoryStatsPanel() {
    const categoryStatsItems = document.getElementById('category-stats-items');
    const statsSectionTitle = document.getElementById('stats-section-title');
    
    // IMPORTANTE: Siempre mostrar TODAS las categorías, sin importar la selección
    if (!allCategories.length) return;
    
    
    
    // Actualizar título de la sección
    const titulos = {
        'clasificacion': 'Clasificación',
        'vende': 'Vendedor',
        'zona': 'Zona',
        'barrio': 'Barrio',
        'estrato': 'Estrato',
        'tipo_vis': 'Tipo VIS'
    };
    const currentTitle = titulos[markerColorCriterion] || 'Categoría';
    if (statsSectionTitle) {
        statsSectionTitle.textContent = `Estadísticas por ${currentTitle}`;
    }
    
    // Mostrar lista detallada de categorías con estadísticas
    if (categoryStatsItems) {
        // Usar datos originales para calcular estadísticas completas
        const sourceData = proyectosDataOriginal.length > 0 ? proyectosDataOriginal : proyectosData;
        
        // Preparar datos de categorías con estadísticas
        // IMPORTANTE: Usar la misma función de generación de colores que el mapa para coherencia
        const categoriesWithStats = allCategories.map(cat => {
            // Calcular estadísticas para esta categoría
            const categoryProjects = sourceData.filter(proyecto => {
                let categoria = 'N/A';
                
                switch (markerColorCriterion) {
                    case 'clasificacion':
                        categoria = String(proyecto.clasificacion || 'Moderado').trim();
                        break;
                    case 'vende':
                        categoria = String(proyecto.vende || 'N/A').trim();
                        break;
                    case 'zona':
                        categoria = String(proyecto.zona || 'N/A').trim();
                        break;
                    case 'barrio':
                        categoria = String(proyecto.barrio || 'N/A').trim();
                        break;
                    case 'estrato':
                        categoria = String(proyecto.estrato || 'N/A').trim();
                        break;
                    case 'tipo_vis':
                        categoria = String(proyecto.tipo_vis || 'N/A').trim();
                        break;
                }
                
                return categoria === cat.nombre;
            });
            
            const exitosos = categoryProjects.filter(p => p.clasificacion === 'Exitoso').length;
            const moderados = categoryProjects.filter(p => p.clasificacion === 'Moderado').length;
            const mejorables = categoryProjects.filter(p => p.clasificacion === 'Mejorable').length;
            
            // Asegurar que el color sea el mismo que en el mapa usando la misma función
            let categoryColor = cat.color;
            if (categoryProjects.length > 0) {
                // Obtener el color del primer proyecto de esta categoría usando la misma función del mapa
                const sampleProject = categoryProjects[0];
                categoryColor = getMarkerColor(sampleProject);
            }
            
            return {
                ...cat,
                color: categoryColor, // Usar el color generado por la misma función del mapa
                exitosos,
                moderados,
                mejorables,
                isSelected: selectedCategories.has(cat.id) // Selección múltiple
            };
        });
        
        // Aplicar búsqueda (NO filtrar por selección - todas las categorías deben mostrarse siempre)
        const searchInput = document.getElementById('category-stats-search');
        const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
        categorySearchQuery = searchQuery;
        
        // IMPORTANTE: Solo filtrar por búsqueda, NO por selección
        // Todas las categorías deben permanecer visibles, solo se resaltan las seleccionadas
        let filteredCategories = categoriesWithStats;
        if (searchQuery) {
            filteredCategories = categoriesWithStats.filter(cat => 
                cat.nombre.toLowerCase().includes(searchQuery)
            );
        }
        // NO filtrar por selectedCategories - todas deben mostrarse
        
        // Aplicar ordenamiento
        const sortSelect = document.getElementById('category-stats-sort');
        const sortOrder = sortSelect ? sortSelect.value : 'count-desc';
        categorySortOrder = sortOrder;
        
        filteredCategories.sort((a, b) => {
            switch (sortOrder) {
                case 'name-asc':
                    if (a.nombre === 'N/A') return 1;
                    if (b.nombre === 'N/A') return -1;
                    return a.nombre.localeCompare(b.nombre);
                case 'name-desc':
                    if (a.nombre === 'N/A') return 1;
                    if (b.nombre === 'N/A') return -1;
                    return b.nombre.localeCompare(a.nombre);
                case 'count-asc':
                    return a.count - b.count;
                case 'count-desc':
                default:
                    return b.count - a.count;
            }
        });
        
        // Generar HTML para tabla
        let statsHtml = '';
        if (filteredCategories.length === 0) {
            statsHtml = '<tr><td colspan="6" class="no-results"><div class="categories-loading"><i class="fas fa-search"></i><p>No se encontraron categorías</p></div></td></tr>';
        } else {
            
            // Determinar si hay alguna selección para aplicar transparencia
            const hasSelection = selectedCategories.size > 0;
            
            filteredCategories.forEach(cat => {
                // IMPORTANTE: Todas las categorías se renderizan siempre (estilo Power BI)
                // Las no seleccionadas se ponen transparentes SOLO si hay alguna selección, NO desaparecen
                const isSelected = cat.isSelected;
                // Solo aplicar transparencia si hay selección y esta categoría no está seleccionada
                const opacityStyle = (hasSelection && !isSelected) ? 'opacity: 0.4;' : 'opacity: 1;';
                const dimmedClass = (hasSelection && !isSelected) ? 'dimmed' : '';
                const rowClass = isSelected ? 'active' : '';
                statsHtml += `
                    <tr class="category-stat-row ${rowClass} ${dimmedClass}" data-category-id="${cat.id}" data-category-name="${escapeHtml(cat.nombre)}" style="display: table-row !important; visibility: visible !important; ${opacityStyle}">
                        <td class="td-color">
                            <div class="category-color-icon" style="background-color: ${cat.color};" title="Color: ${cat.color}">
                                <i class="fas fa-circle"></i>
                            </div>
                        </td>
                        <td class="td-name">
                            <div class="category-name-cell">${escapeHtml(cat.nombre)}</div>
                        </td>
                        <td class="td-success">
                            <span class="stat-badge success">
                                <i class="fas fa-check-circle"></i>
                                <span>${cat.exitosos}</span>
                            </span>
                        </td>
                        <td class="td-moderate">
                            <span class="stat-badge moderate">
                                <i class="fas fa-exclamation-circle"></i>
                                <span>${cat.moderados}</span>
                            </span>
                        </td>
                        <td class="td-improve">
                            <span class="stat-badge improve">
                                <i class="fas fa-times-circle"></i>
                                <span>${cat.mejorables}</span>
                            </span>
                        </td>
                        <td class="td-count">
                            <span class="count-badge">${cat.count}</span>
                        </td>
                    </tr>
                `;
            });
        }
        
        categoryStatsItems.innerHTML = statsHtml;
        
        // Agregar event listeners para filtrar al hacer click (selección múltiple con Ctrl)
        categoryStatsItems.querySelectorAll('.category-stat-row').forEach(item => {
            item.addEventListener('click', function(e) {
                const categoryId = this.getAttribute('data-category-id');
                const categoryName = this.getAttribute('data-category-name');
                
                // Detectar si se presionó Ctrl (o Cmd en Mac)
                const isCtrlPressed = e.ctrlKey || e.metaKey;
                const wasSelected = selectedCategories.has(categoryId);
                
                if (isCtrlPressed) {
                    // Selección múltiple: toggle de esta categoría sin afectar las demás
                    if (wasSelected) {
                        // Deseleccionar esta categoría
                        selectedCategories.delete(categoryId);
                        this.classList.remove('active');
                    } else {
                        // Agregar a la selección
                        selectedCategories.add(categoryId);
                        this.classList.add('active');
                    }
                    
                    // Actualizar filtro con todas las categorías seleccionadas
                    if (selectedCategories.size === 0) {
                        showAllCategories();
                    } else {
                        filterBySelectedCategories();
                    }
                    
                    // Solo actualizar estados visuales (NO regenerar HTML - todas las filas permanecen visibles)
                    updateCategoryStatsItemsState();
                    updateCategoriesCount();
                } else {
                    // Sin Ctrl: selección única (reemplazar selección anterior)
                    if (wasSelected && selectedCategories.size === 1) {
                        // Si solo esta estaba seleccionada, deseleccionar todo
                        selectedCategories.clear();
                        this.classList.remove('active');
                        showAllCategories();
                    } else {
                        // Limpiar selección anterior y seleccionar solo esta
                        selectedCategories.clear();
                        // Remover resaltado de todas las categorías
                        categoryStatsItems.querySelectorAll('.category-stat-row').forEach(i => {
                            i.classList.remove('active');
                        });
                        
                        // Seleccionar esta categoría
                        selectedCategories.add(categoryId);
                        this.classList.add('active');
                        
                        // Filtrar para mostrar solo los proyectos de esta categoría
                        filterBySelectedCategories();
                        
                        // Solo actualizar estados visuales (NO regenerar HTML - todas las filas permanecen visibles)
                        updateCategoryStatsItemsState();
                        updateCategoriesCount();
                        updatePieChart(); // Actualizar gráfico circular cuando se selecciona/deselecciona una categoría
                    }
                }
            });
        });
        
        // Actualizar estados visuales después de renderizar
        updateCategoryStatsItemsState();
        
        // Actualizar gráfico circular después de actualizar el panel
        updatePieChart();
        
        // Configurar event listeners para búsqueda y ordenamiento
        setupCategoryStatsControls();
    }
}

// Configurar controles de búsqueda y ordenamiento para categorías
function setupCategoryStatsControls() {
    const searchInput = document.getElementById('category-stats-search');
    const searchClear = document.getElementById('category-stats-search-clear');
    const sortSelect = document.getElementById('category-stats-sort');
    
    // Búsqueda
    if (searchInput) {
        // Restaurar búsqueda guardada
        if (categorySearchQuery) {
            searchInput.value = categorySearchQuery;
        }
        
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase().trim();
            categorySearchQuery = query;
            
            // Mostrar/ocultar botón de limpiar
            if (searchClear) {
                searchClear.style.display = query ? 'flex' : 'none';
            }
            
            // Actualizar panel
            updateCategoryStatsPanel();
        });
        
        // Limpiar búsqueda
        if (searchClear) {
            searchClear.addEventListener('click', function() {
                searchInput.value = '';
                categorySearchQuery = '';
                this.style.display = 'none';
                updateCategoryStatsPanel();
            });
        }
    }
    
    // Ordenamiento
    if (sortSelect) {
        // Restaurar ordenamiento guardado
        if (categorySortOrder) {
            sortSelect.value = categorySortOrder;
        }
        
        sortSelect.addEventListener('change', function() {
            categorySortOrder = this.value;
            updateCategoryStatsPanel();
        });
    }
}

// Mostrar todas las categorías (restaurar vista completa)
function showAllCategories() {
    // Limpiar la selección
    selectedCategories.clear();
    
    // Restaurar datos originales si existen
    if (proyectosDataOriginal.length > 0) {
        proyectosData = [...proyectosDataOriginal];
    }
    
    // Actualizar vistas
    updateMap();
    
    // Restaurar vista completa del mapa (centrar en todos los proyectos)
    if (proyectosData.length > 0) {
        fitToData();
    }
    
    updateTable();
    updateStats();
    updateCategoriesCount();
    
    // Actualizar estados visuales de los items (remover resaltado)
    updateCategoryStatsItemsState();
    
    // Actualizar gráfico circular
    updatePieChart();
}

// Filtrar mapa por categorías seleccionadas (selección múltiple)
function filterBySelectedCategories() {
    if (selectedCategories.size === 0) {
        showAllCategories();
        return;
    }
    
    // Filtrar los datos como lo hacen los filtros normales
    // Mostrar SOLO los proyectos de las categorías seleccionadas
    const sourceData = proyectosDataOriginal.length > 0 ? proyectosDataOriginal : proyectosData;
    
    proyectosData = sourceData.filter(proyecto => {
        let categoria = 'N/A';
        
        switch (markerColorCriterion) {
            case 'clasificacion':
                categoria = String(proyecto.clasificacion || 'Moderado').trim();
                break;
            case 'vende':
                categoria = String(proyecto.vende || 'N/A').trim();
                break;
            case 'zona':
                categoria = String(proyecto.zona || 'N/A').trim();
                break;
            case 'barrio':
                categoria = String(proyecto.barrio || 'N/A').trim();
                break;
            case 'estrato':
                categoria = String(proyecto.estrato || 'N/A').trim();
                break;
            case 'tipo_vis':
                categoria = String(proyecto.tipo_vis || 'N/A').trim();
                break;
        }
        
        const catId = categoria.toLowerCase().replace(/\s+/g, '-');
        return selectedCategories.has(catId);
    });
    
    // Actualizar todas las vistas con los datos filtrados
    updateMap();
    
    // Enfocar en los puntos filtrados
    if (proyectosData.length > 0) {
        fitToData();
    }
    
    updateTable();
    updateStats();
    updateCategoriesCount();
    
    // Actualizar estados visuales de los items (sin ocultar filas, solo resaltar)
    // NO llamar a updateCategoryStatsPanel() aquí para evitar regenerar el HTML
    // Solo actualizar las clases CSS de las filas existentes
    updateCategoryStatsItemsState();
    
    // Actualizar gráfico circular cuando se filtran categorías
    updatePieChart();
}

// Alias para compatibilidad (ahora filterBySelectedCategories es la función principal)
function filterBySelectedCategory() {
    filterBySelectedCategories();
}


// Función para actualizar el gráfico circular (pie chart) - Innovador y llamativo con interacción Power BI
function updatePieChart() {
    const canvas = document.getElementById('pie-chart-canvas');
    const chartTitle = document.getElementById('pie-chart-title');
    const legendContainer = document.getElementById('pie-chart-legend');
    
    if (!canvas) return;
    
    // Actualizar título según el criterio de "Color por"
    const titulos = {
        'clasificacion': 'Distribución por Clasificación',
        'vende': 'Distribución por Vendedor',
        'zona': 'Distribución por Zona',
        'barrio': 'Distribución por Barrio',
        'estrato': 'Distribución por Estrato',
        'tipo_vis': 'Distribución por Tipo VIS'
    };
    if (chartTitle) {
        chartTitle.textContent = titulos[markerColorCriterion] || 'Distribución por Categoría';
    }
    
    // Obtener datos de categorías según el criterio actual
    if (!allCategories || allCategories.length === 0) {
        // Si no hay categorías, mostrar gráfico vacío
        if (pieChart) {
            pieChart.destroy();
            pieChart = null;
        }
        if (legendContainer) {
            legendContainer.innerHTML = '<div class="pie-chart-empty"><i class="fas fa-chart-pie"></i><p>Cargando datos...</p></div>';
        }
        return;
    }
    
    // Preparar datos para el gráfico
    const chartData = allCategories.map(cat => ({
        label: cat.nombre,
        value: cat.count,
        color: cat.color,
        id: cat.id,
        isSelected: selectedCategories.has(cat.id)
    })).filter(cat => cat.value > 0); // Solo mostrar categorías con datos
    
    if (chartData.length === 0) {
        if (pieChart) {
            pieChart.destroy();
            pieChart = null;
        }
        if (legendContainer) {
            legendContainer.innerHTML = '<div class="pie-chart-empty"><i class="fas fa-chart-pie"></i><p>No hay datos disponibles</p></div>';
        }
        return;
    }
    
    // Calcular total para porcentajes
    const total = chartData.reduce((sum, cat) => sum + cat.value, 0);
    
    // Preparar datos para Chart.js
    const labels = chartData.map(cat => cat.label);
    const data = chartData.map(cat => cat.value);
    const backgroundColors = chartData.map(cat => {
        // Si está seleccionada, usar color brillante; si no, usar color más opaco
        if (cat.isSelected) {
            return cat.color;
        } else if (selectedCategories.size > 0) {
            // Si hay selecciones pero esta no está seleccionada, usar color muy opaco para mayor contraste
            return hexToRgba(cat.color, 0.15);
        } else {
            return cat.color;
        }
    });
    const borderColors = chartData.map(cat => cat.color);
    const borderWidths = chartData.map(cat => cat.isSelected ? 3 : 1);
    
    // Destruir gráfico anterior si existe
    if (pieChart) {
        pieChart.destroy();
    }
    
    // Crear nuevo gráfico circular con estilo innovador y llamativo
    const ctx = canvas.getContext('2d');
    pieChart = new Chart(ctx, {
        type: 'doughnut', // Usar doughnut para un efecto más moderno
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: borderWidths,
                hoverBorderWidth: 4,
                hoverOffset: 8 // Efecto de "salto" al hacer hover
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.2,
            plugins: {
                legend: {
                    display: false // Usaremos leyenda personalizada
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 13
                    },
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} proyectos (${percentage}%)`;
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 1000,
                easing: 'easeOutQuart'
            },
            interaction: {
                intersect: false,
                mode: 'nearest'
            },
            onHover: (event, activeElements) => {
                canvas.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
            },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const categoryId = chartData[index].id;
                    const categoryName = chartData[index].label;
                    
                    // Detectar si se presionó Ctrl (o Cmd en Mac) para selección múltiple
                    // Chart.js pasa el evento nativo en event.nativeEvent o event.originalEvent
                    const nativeEvent = event.nativeEvent || event.originalEvent || event;
                    const isCtrlPressed = nativeEvent.ctrlKey || nativeEvent.metaKey;
                    const wasSelected = selectedCategories.has(categoryId);
                    
                    if (isCtrlPressed) {
                        // Selección múltiple: toggle de esta categoría sin afectar las demás
                        if (wasSelected) {
                            // Deseleccionar esta categoría
                            selectedCategories.delete(categoryId);
                        } else {
                            // Agregar a la selección
                            selectedCategories.add(categoryId);
                        }
                        
                        // Actualizar filtro con todas las categorías seleccionadas
                        if (selectedCategories.size === 0) {
                            showAllCategories();
                        } else {
                            filterBySelectedCategories();
                        }
                        
                        // Actualizar estados visuales
                        updateCategoryStatsItemsState();
                        updateCategoriesCount();
                        updatePieChart(); // Re-renderizar con nuevos colores
                    } else {
                        // Sin Ctrl: selección única (reemplazar selección anterior)
                        if (wasSelected && selectedCategories.size === 1) {
                            // Si solo esta estaba seleccionada, deseleccionar todo
                            selectedCategories.clear();
                            showAllCategories();
                        } else {
                            // Limpiar selección anterior y seleccionar solo esta
                            selectedCategories.clear();
                            selectedCategories.add(categoryId);
                            
                            // Filtrar para mostrar solo los proyectos de esta categoría
                            filterBySelectedCategories();
                            
                            // Actualizar estados visuales
                            updateCategoryStatsItemsState();
                            updateCategoriesCount();
                            updatePieChart(); // Re-renderizar con nuevos colores
                        }
                    }
                }
            }
        }
    });
    
    // Crear leyenda personalizada interactiva
    if (legendContainer) {
        let legendHtml = '<div class="pie-legend-items">';
        chartData.forEach((cat, index) => {
            const percentage = total > 0 ? ((cat.value / total) * 100).toFixed(1) : 0;
            const isSelected = cat.isSelected;
            const opacity = (selectedCategories.size > 0 && !isSelected) ? 0.25 : 1;
            legendHtml += `
                <div class="pie-legend-item ${isSelected ? 'selected' : ''}" 
                     data-category-id="${cat.id}" 
                     style="opacity: ${opacity}; cursor: pointer;"
                     title="Click para ${isSelected ? 'deseleccionar' : 'seleccionar'}">
                    <div class="pie-legend-color" style="background-color: ${cat.color}; border: 2px solid ${isSelected ? '#2d5aa0' : 'transparent'};"></div>
                    <div class="pie-legend-info">
                        <span class="pie-legend-label">${escapeHtml(cat.label)}</span>
                        <span class="pie-legend-value">${cat.value} (${percentage}%)</span>
                    </div>
                </div>
            `;
        });
        legendHtml += '</div>';
        legendContainer.innerHTML = legendHtml;
        
        // Agregar event listeners a los items de la leyenda
        legendContainer.querySelectorAll('.pie-legend-item').forEach(item => {
            item.addEventListener('click', function() {
                const categoryId = this.getAttribute('data-category-id');
                const wasSelected = selectedCategories.has(categoryId);
                
                if (wasSelected) {
                    selectedCategories.delete(categoryId);
                } else {
                    selectedCategories.add(categoryId);
                }
                
                // Actualizar filtros y vistas
                if (selectedCategories.size === 0) {
                    showAllCategories();
                } else {
                    filterBySelectedCategories();
                }
                
                // Actualizar estados visuales
                updateCategoryStatsItemsState();
                updateCategoriesCount();
                updatePieChart(); // Re-renderizar con nuevos colores
            });
        });
    }
}

// Función auxiliar para convertir hex a rgba
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Actualizar estados visuales de los items de categorías (estilo Power BI - transparencia)
function updateCategoryStatsItemsState() {
    const categoryStatsItems = document.getElementById('category-stats-items');
    if (!categoryStatsItems) return;
    
    const hasSelection = selectedCategories.size > 0;
    
    categoryStatsItems.querySelectorAll('.category-stat-row').forEach(item => {
        const categoryId = item.getAttribute('data-category-id');
        const isSelected = selectedCategories.has(categoryId);
        
        // Estilo Power BI: seleccionadas opacas, no seleccionadas transparentes
        if (isSelected) {
            item.classList.add('active');
            item.classList.remove('dimmed');
            item.style.opacity = '1';
            item.style.display = 'table-row';
            item.style.visibility = 'visible';
        } else {
            item.classList.remove('active');
            // Solo aplicar transparencia si hay alguna selección
            if (hasSelection) {
                item.classList.add('dimmed');
                item.style.opacity = '0.4';
            } else {
                item.classList.remove('dimmed');
                item.style.opacity = '1';
            }
            item.style.display = 'table-row';
            item.style.visibility = 'visible';
        }
    });
}

// Mostrar todas las categorías (restaurar vista completa)
function showAllCategories() {
    // Limpiar la selección
    selectedCategories.clear();
    
    // Restaurar datos originales si existen
    if (proyectosDataOriginal.length > 0) {
        proyectosData = [...proyectosDataOriginal];
    }
    
    // Actualizar vistas
    updateMap();
    
    // Restaurar vista completa del mapa (centrar en todos los proyectos)
    fitToData();
    
    updateTable();
    updateStats();
    updateCategoriesCount();
    
    // Actualizar estados visuales de los items (remover resaltado)
    updateCategoryStatsItemsState();
    
    // Actualizar panel de categorías para reflejar que no hay selección
    updateCategoryStatsPanel();
}

// Actualizar contador de categorías seleccionadas (selección múltiple)
function updateCategoriesCount() {
    const countElement = document.getElementById('categories-count');
    if (countElement) {
        const count = selectedCategories.size;
        if (count > 0) {
            countElement.textContent = `${count} seleccionada${count !== 1 ? 's' : ''}`;
        } else {
            countElement.textContent = 'Ninguna';
        }
    }
}

// Función eliminada: setupCategoryTableToggle() - El botón de alternar vista fue removido según solicitud del usuario

// Configurar panel de categorías (ahora en el sidebar)
function setupCategoriesPanel() {
    const selectAllBtn = document.getElementById('categories-select-all');
    const deselectAllBtn = document.getElementById('categories-deselect-all');
    const applyBtn = document.getElementById('categories-apply-btn');
    const searchInput = document.getElementById('categories-search');
    const searchClear = document.getElementById('categories-search-clear');
    
    // Seleccionar todas (selección múltiple)
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            allCategories.forEach(cat => {
                selectedCategories.add(cat.id);
            });
            updateCategoriesList();
            updateCategoriesCount();
            filterBySelectedCategories();
        });
    }
    
    // Deseleccionar todas
    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            selectedCategories.clear();
            showAllCategories();
            updateCategoriesList();
            updateCategoriesCount();
        });
    }
    
    // Aplicar filtros (el filtro se aplica automáticamente, pero mantener para compatibilidad)
    if (applyBtn) {
        applyBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (selectedCategories.size > 0) {
                filterBySelectedCategories();
            } else {
                showAllCategories();
            }
        });
    }
    
    // Búsqueda
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase().trim();
            if (searchClear) {
                searchClear.style.display = query ? 'flex' : 'none';
            }
            updateCategoriesList();
        });
    }
    
    if (searchClear) {
        searchClear.addEventListener('click', function() {
            if (searchInput) {
                searchInput.value = '';
            }
            this.style.display = 'none';
            updateCategoriesList();
        });
    }
}

// Actualizar lista de categorías (solo renderizado, sin cambiar selección)
function updateCategoriesList() {
    const categoriesList = document.getElementById('categories-list');
    if (!categoriesList || allCategories.length === 0) return;
    
    const searchInput = document.getElementById('categories-search');
    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    const filteredCategories = allCategories.filter(cat => {
        if (!searchQuery) return true;
        return cat.nombre.toLowerCase().includes(searchQuery);
    });
    
    if (filteredCategories.length === 0) {
        categoriesList.innerHTML = '<div class="categories-loading"><i class="fas fa-search"></i><p>No se encontraron categorías</p></div>';
        return;
    }
    
    let html = '';
    filteredCategories.forEach(cat => {
        const isSelected = selectedCategories.has(cat.id); // Selección múltiple
        html += `
            <div class="categories-item ${isSelected ? 'selected' : ''}" data-category-id="${cat.id}">
                <input type="checkbox" id="cat-${cat.id}" ${isSelected ? 'checked' : ''} data-category-id="${cat.id}">
                <label for="cat-${cat.id}" class="categories-item-checkbox"></label>
                <span class="categories-item-color" style="background-color: ${cat.color};"></span>
                <div class="categories-item-info">
                    <div class="categories-item-name">${escapeHtml(cat.nombre)}</div>
                    <div class="categories-item-count">${cat.count} proyecto${cat.count !== 1 ? 's' : ''}</div>
                </div>
            </div>
        `;
    });
    
    categoriesList.innerHTML = html;
    
    // Agregar event listeners (selección múltiple)
    categoriesList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const categoryId = this.getAttribute('data-category-id');
            const item = this.closest('.categories-item');
            
            if (this.checked) {
                // Agregar a la selección
                selectedCategories.add(categoryId);
                if (item) item.classList.add('selected');
            } else {
                // Remover de la selección
                selectedCategories.delete(categoryId);
                if (item) item.classList.remove('selected');
            }
            
            // Actualizar filtro
            if (selectedCategories.size === 0) {
                showAllCategories();
            } else {
                filterBySelectedCategories();
            }
            
            updateCategoriesCount();
        });
    });
    
    categoriesList.querySelectorAll('.categories-item').forEach(item => {
        item.addEventListener('click', function(e) {
            if (e.target.type !== 'checkbox' && e.target.tagName !== 'LABEL') {
                const checkbox = this.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            }
        });
    });
}

// Aplicar filtros de categorías (selección múltiple)
function applyCategoryFilters() {
    // El filtro se aplica automáticamente, pero mantener para compatibilidad
    if (selectedCategories.size > 0) {
        filterBySelectedCategories();
    } else {
        showAllCategories();
    }
}

// Configurar toggle de leyenda de marcadores (mantener para compatibilidad)
function setupMarkerLegendToggle() {
    // Ahora usamos setupCategoriesPanel
    setupCategoriesPanel();
}

// Variable global para el mapa de calor de características
let characteristicsHeatmapChart = null;

// Función para transformar variables categóricas a numéricas
function transformarCategoricasANumericas(caracteristicas) {
    const datosTransformados = {};
    
    // Función helper para normalizar valores numéricos (0-1)
    function normalizar(valor, min, max) {
        if (max === min || isNaN(valor) || isNaN(min) || isNaN(max)) return 0.5;
        return Math.max(0, Math.min(1, (valor - min) / (max - min)));
    }
    
    // Función helper para codificar distribuciones categóricas
    function codificarDistribucion(distribucion) {
        if (!distribucion || typeof distribucion !== 'object') return 0;
        const valores = Object.values(distribucion);
        if (valores.length === 0) return 0;
        const maxValor = Math.max(...valores);
        const total = valores.reduce((sum, v) => sum + v, 0);
        return total > 0 ? maxValor / total : 0;
    }
    
    // Función helper para codificar valores categóricos únicos
    function codificarCategorico(valor, opciones) {
        if (!opciones || opciones.length === 0) return 0.5;
        const index = opciones.indexOf(valor);
        return index >= 0 ? (index + 1) / opciones.length : 0.5;
    }
    
    // Procesar todas las características disponibles
    if (caracteristicas.velocidad_ventas) {
        const v = caracteristicas.velocidad_ventas;
        datosTransformados['Velocidad Ventas'] = {
            promedio: normalizar(v.promedio, v.min, v.max),
            mediana: normalizar(v.mediana, v.min, v.max),
            percentil_25: v.percentil_25 ? normalizar(v.percentil_25, v.min, v.max) : null,
            percentil_75: v.percentil_75 ? normalizar(v.percentil_75, v.min, v.max) : null
        };
    }
    
    if (caracteristicas.meses_para_agotar) {
        const m = caracteristicas.meses_para_agotar;
        datosTransformados['Meses para Agotar'] = {
            promedio: 1 - normalizar(m.promedio, m.min, m.max),
            mediana: 1 - normalizar(m.mediana, m.min, m.max)
        };
    }
    
    if (caracteristicas.porcentaje_vendido) {
        const p = caracteristicas.porcentaje_vendido;
        datosTransformados['% Vendido'] = {
            promedio: normalizar(p.promedio, p.min, p.max),
            mediana: normalizar(p.mediana, p.min, p.max)
        };
    }
    
    if (caracteristicas.precio_promedio) {
        const pr = caracteristicas.precio_promedio;
        datosTransformados['Precio Promedio'] = {
            promedio: normalizar(pr.promedio, pr.min, pr.max),
            mediana: normalizar(pr.mediana, pr.min, pr.max)
        };
    }
    
    if (caracteristicas.area_promedio) {
        const a = caracteristicas.area_promedio;
        datosTransformados['Área Promedio'] = {
            promedio: normalizar(a.promedio, a.min, a.max),
            mediana: normalizar(a.mediana, a.min, a.max)
        };
    }
    
    if (caracteristicas.precio_m2) {
        const pm2 = caracteristicas.precio_m2;
        datosTransformados['Precio/m²'] = {
            promedio: normalizar(pm2.promedio, pm2.min, pm2.max),
            mediana: normalizar(pm2.mediana, pm2.min, pm2.max)
        };
    }
    
    if (caracteristicas.tamano_proyecto) {
        const t = caracteristicas.tamano_proyecto;
        datosTransformados['Tamaño Proyecto'] = {
            promedio: normalizar(t.promedio, t.min, t.max),
            mediana: normalizar(t.mediana, t.min, t.max)
        };
    }
    
    if (caracteristicas.estrato && caracteristicas.estrato.distribucion) {
        const e = caracteristicas.estrato;
        const estratos = Object.keys(e.distribucion).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
        if (estratos.length > 0) {
            datosTransformados['Estrato'] = {
                moda: codificarCategorico(e.moda, estratos),
                promedio: normalizar(e.promedio, Math.min(...estratos), Math.max(...estratos)),
                distribucion: codificarDistribucion(e.distribucion)
            };
        }
    }
    
    if (caracteristicas.zona && caracteristicas.zona.distribucion) {
        const z = caracteristicas.zona;
        const zonas = Object.keys(z.distribucion);
        if (zonas.length > 0) {
            datosTransformados['Zona'] = {
                mas_comun: codificarCategorico(z.mas_comun, zonas),
                distribucion: codificarDistribucion(z.distribucion)
            };
        }
    }
    
    if (caracteristicas.alcobas_promedio) {
        const alc = caracteristicas.alcobas_promedio;
        datosTransformados['Alcobas Promedio'] = {
            promedio: normalizar(alc.promedio, alc.min, alc.max),
            mediana: normalizar(alc.mediana, alc.min, alc.max)
        };
    }
    
    if (caracteristicas.banos_promedio) {
        const ban = caracteristicas.banos_promedio;
        datosTransformados['Baños Promedio'] = {
            promedio: normalizar(ban.promedio, ban.min, ban.max),
            mediana: normalizar(ban.mediana, ban.min, ban.max)
        };
    }
    
    if (caracteristicas.garajes_promedio) {
        const gar = caracteristicas.garajes_promedio;
        datosTransformados['Garajes Promedio'] = {
            promedio: normalizar(gar.promedio, gar.min, gar.max),
            mediana: normalizar(gar.mediana, gar.min, gar.max)
        };
    }
    
    if (caracteristicas.patron_ventas) {
        const pat = caracteristicas.patron_ventas;
        const patrones = ['Desacelerado', 'Constante', 'Acelerado'];
        datosTransformados['Patrón Ventas'] = {
            mas_comun: codificarCategorico(pat.mas_comun, patrones),
            distribucion: codificarDistribucion(pat.distribucion)
        };
    }
    
    if (caracteristicas.tipo_vis && caracteristicas.tipo_vis.distribucion) {
        const vis = caracteristicas.tipo_vis;
        const tipos = Object.keys(vis.distribucion);
        if (tipos.length > 0) {
            datosTransformados['Tipo VIS'] = {
                mas_comun: codificarCategorico(vis.mas_comun, tipos),
                distribucion: codificarDistribucion(vis.distribucion)
            };
        }
    }
    
    if (caracteristicas.ratio_vendidas_disponibles) {
        const ratio = caracteristicas.ratio_vendidas_disponibles;
        datosTransformados['Ratio Vend/Dispon'] = {
            promedio: normalizar(ratio.promedio, ratio.min, ratio.max),
            mediana: normalizar(ratio.mediana, ratio.min, ratio.max)
        };
    }
    
    if (caracteristicas.posicion_precio_zona) {
        const pos = caracteristicas.posicion_precio_zona;
        datosTransformados['Posición Precio'] = {
            promedio: 1 - normalizar(pos.promedio, 0, 100),
            mediana: 1 - normalizar(pos.mediana, 0, 100)
        };
    }
    
    // Amenidades
    if (caracteristicas.amenidades) {
        let amenidades_data = caracteristicas.amenidades.amenidades_exitosos || 
            (typeof caracteristicas.amenidades === 'object' && Object.keys(caracteristicas.amenidades).length > 0 ? caracteristicas.amenidades : null);
        
        if (amenidades_data) {
            const amenidades_entries = Object.entries(amenidades_data)
                .map(([nombre, datos]) => ({
                    nombre,
                    ratio: datos.ratio || 0,
                    porcentaje: datos.porcentaje_exitosos || 0
                }))
                .filter(a => a.ratio > 0)
                .sort((a, b) => b.ratio - a.ratio)
                .slice(0, 10);
            
            if (amenidades_entries.length > 0) {
                const maxRatio = Math.max(...amenidades_entries.map(a => a.ratio));
                const minRatio = Math.min(...amenidades_entries.map(a => a.ratio));
                
                amenidades_entries.forEach(({nombre, ratio, porcentaje}) => {
                    datosTransformados[`Amenidad: ${nombre}`] = {
                        ratio: normalizar(ratio, minRatio, maxRatio),
                        porcentaje: normalizar(porcentaje, 0, 100)
                    };
                });
            }
        }
    }
    
    return datosTransformados;
}

// Función para generar el mapa de calor usando Canvas HTML5
function generarHeatmapCaracteristicas(caracteristicas) {
    const container = document.getElementById('heatmap-container');
    const canvas = document.getElementById('characteristics-heatmap');
    const legendInfo = document.getElementById('heatmap-legend-info');
    
    if (!container || !canvas) return;
    
    const datosTransformados = transformarCategoricasANumericas(caracteristicas);
    
    if (Object.keys(datosTransformados).length === 0) {
        container.style.display = 'none';
        return;
    }
    
    const caracteristicasList = Object.keys(datosTransformados);
    const metricasList = ['promedio', 'mediana', 'percentil_25', 'percentil_75', 'min', 'max', 'moda', 'distribucion', 'mas_comun', 'ratio', 'porcentaje'];
    
    const metricasDisponibles = new Set();
    caracteristicasList.forEach(caracteristica => {
        Object.keys(datosTransformados[caracteristica]).forEach(metrica => {
            if (metricasList.includes(metrica) && datosTransformados[caracteristica][metrica] !== null && datosTransformados[caracteristica][metrica] !== undefined) {
                metricasDisponibles.add(metrica);
            }
        });
    });
    
    const metricasArray = Array.from(metricasDisponibles);
    
    if (metricasArray.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    const dataMatrix = caracteristicasList.map(caracteristica => {
        return metricasArray.map(metrica => {
            const valor = datosTransformados[caracteristica][metrica];
            return valor !== undefined && valor !== null && !isNaN(valor) ? valor : null;
        });
    });
    
    const caracteristicasValidas = [];
    const dataMatrixValida = [];
    caracteristicasList.forEach((caracteristica, i) => {
        if (dataMatrix[i].some(v => v !== null)) {
            caracteristicasValidas.push(caracteristica);
            dataMatrixValida.push(dataMatrix[i]);
        }
    });
    
    if (caracteristicasValidas.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    const labelsY = caracteristicasValidas;
    const labelsX = metricasArray.map(m => {
        const nombres = {
            'promedio': 'Promedio', 'mediana': 'Mediana', 'percentil_25': 'P25', 'percentil_75': 'P75',
            'min': 'Mínimo', 'max': 'Máximo', 'moda': 'Moda', 'distribucion': 'Distribución',
            'mas_comun': 'Más Común', 'ratio': 'Ratio', 'porcentaje': 'Porcentaje'
        };
        return nombres[m] || m;
    });
    
    const allValues = dataMatrixValida.flat().filter(v => v !== null);
    if (allValues.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);
    
    const ctx = canvas.getContext('2d');
    const padding = { top: 60, right: 20, bottom: 80, left: 200 };
    const cellPadding = 2;
    const cellWidth = 80;
    const cellHeight = 35;
    const canvasWidth = padding.left + (labelsX.length * cellWidth) + padding.right;
    const canvasHeight = padding.top + (labelsY.length * cellHeight) + padding.bottom;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    function getColorForValue(value) {
        if (value === null || isNaN(value)) return 'rgba(200, 200, 200, 0.3)';
        const normalized = (value - minValue) / (maxValue - minValue);
        
        if (normalized < 0.33) {
            const t = normalized / 0.33;
            return `rgba(${Math.round(45 + t * (39 - 45))}, ${Math.round(90 + t * (174 - 90))}, ${Math.round(160 + t * (96 - 160))}, 0.85)`;
        } else if (normalized < 0.67) {
            const t = (normalized - 0.33) / 0.34;
            return `rgba(${Math.round(39 + t * (243 - 39))}, ${Math.round(174 + t * (156 - 174))}, ${Math.round(96 + t * (18 - 96))}, 0.85)`;
        } else {
            const t = (normalized - 0.67) / 0.33;
            return `rgba(${Math.round(243 + t * (231 - 243))}, ${Math.round(156 + t * (76 - 156))}, ${Math.round(18 + t * (60 - 18))}, 0.85)`;
        }
    }
    
    dataMatrixValida.forEach((row, i) => {
        row.forEach((value, j) => {
            const x = padding.left + (j * cellWidth);
            const y = padding.top + (i * cellHeight);
            
            ctx.fillStyle = getColorForValue(value);
            ctx.fillRect(x + cellPadding, y + cellPadding, cellWidth - (cellPadding * 2), cellHeight - (cellPadding * 2));
            
            ctx.strokeStyle = value !== null ? (value > (minValue + maxValue) / 2 ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.2)') : 'rgba(200, 200, 200, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + cellPadding, y + cellPadding, cellWidth - (cellPadding * 2), cellHeight - (cellPadding * 2));
            
            if (value !== null) {
                ctx.fillStyle = value > (minValue + maxValue) / 2 ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.8)';
                ctx.font = 'bold 10px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(value.toFixed(2), x + cellWidth / 2, y + cellHeight / 2);
            }
        });
    });
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.font = '11px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    labelsX.forEach((label, j) => {
        const x = padding.left + (j * cellWidth) + (cellWidth / 2);
        ctx.save();
        ctx.translate(x, padding.top - 10);
        ctx.rotate(-Math.PI / 4);
        ctx.fillText(label, 0, 0);
        ctx.restore();
    });
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.font = '10px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    labelsY.forEach((label, i) => {
        const y = padding.top + (i * cellHeight) + (cellHeight / 2);
        const truncatedLabel = label.length > 20 ? label.substring(0, 17) + '...' : label;
        ctx.fillText(truncatedLabel, padding.left - 10, y);
    });
    
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    
    for (let j = 0; j <= labelsX.length; j++) {
        const x = padding.left + (j * cellWidth);
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + (labelsY.length * cellHeight));
        ctx.stroke();
    }
    
    for (let i = 0; i <= labelsY.length; i++) {
        const y = padding.top + (i * cellHeight);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + (labelsX.length * cellWidth), y);
        ctx.stroke();
    }
    
    container.style.display = 'block';
    
    if (legendInfo) {
        let legendHtml = '<div class="heatmap-legend">';
        legendHtml += '<div class="legend-title"><strong>Escala de Valores Normalizados (0.0 - 1.0):</strong></div>';
        legendHtml += '<div class="legend-gradient">';
        
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
            const normalized = i / steps;
            const value = minValue + (normalized * (maxValue - minValue));
            let color;
            if (normalized < 0.33) {
                const t = normalized / 0.33;
                color = `rgb(${Math.round(45 + t * (39 - 45))}, ${Math.round(90 + t * (174 - 90))}, ${Math.round(160 + t * (96 - 160))})`;
            } else if (normalized < 0.67) {
                const t = (normalized - 0.33) / 0.34;
                color = `rgb(${Math.round(39 + t * (243 - 39))}, ${Math.round(174 + t * (156 - 174))}, ${Math.round(96 + t * (18 - 96))})`;
            } else {
                const t = (normalized - 0.67) / 0.33;
                color = `rgb(${Math.round(243 + t * (231 - 243))}, ${Math.round(156 + t * (76 - 156))}, ${Math.round(18 + t * (60 - 18))})`;
            }
            legendHtml += `<div class="legend-step" style="background-color: ${color};" title="${value.toFixed(3)}"></div>`;
        }
        legendHtml += '</div>';
        legendHtml += '<div class="legend-labels">';
        legendHtml += `<span>${minValue.toFixed(2)}</span><span>${maxValue.toFixed(2)}</span>`;
        legendHtml += '</div>';
        legendHtml += '</div>';
        
        legendInfo.innerHTML = legendHtml;
    }
    
    canvas.addEventListener('mousemove', function(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (x >= padding.left && x <= padding.left + (labelsX.length * cellWidth) &&
            y >= padding.top && y <= padding.top + (labelsY.length * cellHeight)) {
            
            const col = Math.floor((x - padding.left) / cellWidth);
            const row = Math.floor((y - padding.top) / cellHeight);
            
            if (col >= 0 && col < labelsX.length && row >= 0 && row < labelsY.length) {
                const value = dataMatrixValida[row][col];
                canvas.title = value !== null ? 
                    `${labelsY[row]}: ${labelsX[col]} = ${value.toFixed(3)}` : 
                    `${labelsY[row]}: ${labelsX[col]} = N/A`;
                canvas.style.cursor = 'pointer';
            } else {
                canvas.title = '';
                canvas.style.cursor = 'default';
            }
        } else {
            canvas.title = '';
            canvas.style.cursor = 'default';
        }
    });
}

// Función para cargar y mostrar mapa de calor de correlaciones con éxito
async function cargarCorrelacionesExito() {
    console.log('[cargarCorrelacionesExito] Iniciando carga de correlaciones...');
    const container = document.getElementById('correlation-heatmap-container');
    
    if (!container) {
        console.error('[cargarCorrelacionesExito] No se encontró el contenedor correlation-heatmap-container');
        return;
    }
    
    try {
        console.log('[cargarCorrelacionesExito] Haciendo fetch a /api/correlaciones-exito...');
        const response = await fetch('/api/correlaciones-exito');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('[cargarCorrelacionesExito] Datos recibidos:', data);
        
        if (data.success && data.matriz && data.variables) {
            console.log('[cargarCorrelacionesExito] Datos válidos, generando heatmap...');
            generarHeatmapCorrelaciones(data);
            // Asegurar que el contenedor se muestre
            container.style.display = 'block';
        } else {
            console.warn('[cargarCorrelacionesExito] No se pudieron cargar las correlaciones:', data.error || 'Error desconocido');
            console.warn('[cargarCorrelacionesExito] data.success:', data.success);
            console.warn('[cargarCorrelacionesExito] data.matriz:', data.matriz);
            console.warn('[cargarCorrelacionesExito] data.variables:', data.variables);
            container.style.display = 'none';
        }
    } catch (error) {
        console.error('[cargarCorrelacionesExito] Error al cargar correlaciones:', error);
        console.error('[cargarCorrelacionesExito] Stack:', error.stack);
        container.style.display = 'none';
    }
}

// Función para generar el mapa de calor de correlaciones
function generarHeatmapCorrelaciones(data) {
    console.log('[generarHeatmapCorrelaciones] Iniciando generación de heatmap...');
    const container = document.getElementById('correlation-heatmap-container');
    const canvas = document.getElementById('correlation-heatmap');
    const legendInfo = document.getElementById('correlation-heatmap-legend-info');
    
    if (!container) {
        console.error('[generarHeatmapCorrelaciones] No se encontró el contenedor');
        return;
    }
    
    if (!canvas) {
        console.error('[generarHeatmapCorrelaciones] No se encontró el canvas');
        return;
    }
    
    console.log('[generarHeatmapCorrelaciones] Elementos encontrados, procesando datos...');
    
    const { variables, matriz, correlaciones_exito, info_variables } = data;
    
    if (!variables || !matriz || variables.length === 0) {
        console.warn('[generarHeatmapCorrelaciones] No hay datos suficientes para generar el heatmap');
        container.style.display = 'none';
        return;
    }
    
    // Asegurar que el contenedor esté visible
    container.style.display = 'block';
    
    // Función para limpiar nombres de variables (remover sufijo _num si existe)
    function limpiarNombreVariable(nombre) {
        if (nombre.endsWith('_num')) {
            return nombre.replace('_num', '');
        }
        return nombre;
    }
    
    // Crear un mapa de nombres limpios para las variables
    const nombresLimpios = variables.map(v => limpiarNombreVariable(v));
    
    // Configurar canvas con mejor resolución y diseño moderno
    const ctx = canvas.getContext('2d');
    const padding = { top: 100, right: 40, bottom: 120, left: 300 };
    const cellPadding = 0; // Sin padding para eliminar líneas blancas
    
    // Calcular dimensiones mejoradas (celdas más grandes para mejor legibilidad)
    const cellWidth = 85;
    const cellHeight = 40;
    const canvasWidth = padding.left + (variables.length * cellWidth) + padding.right;
    const canvasHeight = padding.top + (variables.length * cellHeight) + padding.bottom;
    
    // Aumentar resolución para mejor calidad
    const scale = window.devicePixelRatio || 2;
    canvas.width = canvasWidth * scale;
    canvas.height = canvasHeight * scale;
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';
    ctx.scale(scale, scale);
    
    // Fondo con gradiente moderno
    const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
    gradient.addColorStop(0, '#f8f9fa');
    gradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Agregar sombra sutil al canvas
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 5;
    
    // Función mejorada para obtener color según valor de correlación (-1 a 1)
    // Escala más detallada y precisa
    function getColorForCorrelation(value) {
        if (value === null || isNaN(value)) return 'rgba(220, 220, 220, 0.4)';
        
        // Normalizar a 0-1 donde 0 = -1, 0.5 = 0, 1 = 1
        const normalized = (value + 1) / 2;
        const absValue = Math.abs(value);
        
        // Escala de colores mejorada con más detalle:
        // Azul oscuro (correlación negativa fuerte) -> Azul claro -> Blanco -> Amarillo claro -> Rojo (correlación positiva fuerte)
        
        if (normalized < 0.5) {
            // Correlación negativa: Azul oscuro -> Azul medio -> Azul claro -> Blanco
            const t = normalized / 0.5; // 0 a 1
            
            if (t < 0.33) {
                // Azul oscuro a azul medio (correlación negativa muy fuerte: -1.0 a -0.33)
                const t2 = t / 0.33;
                const r = Math.round(30 + t2 * (60 - 30));
                const g = Math.round(60 + t2 * (100 - 60));
                const b = Math.round(120 + t2 * (180 - 120));
                return `rgba(${r}, ${g}, ${b}, ${0.7 + absValue * 0.25})`;
            } else if (t < 0.67) {
                // Azul medio a azul claro (correlación negativa moderada: -0.33 a -0.0)
                const t2 = (t - 0.33) / 0.34;
                const r = Math.round(60 + t2 * (150 - 60));
                const g = Math.round(100 + t2 * (200 - 100));
                const b = Math.round(180 + t2 * (230 - 180));
                return `rgba(${r}, ${g}, ${b}, ${0.6 + absValue * 0.2})`;
            } else {
                // Azul claro a blanco (correlación negativa débil: -0.0 a 0.0)
                const t2 = (t - 0.67) / 0.33;
                const r = Math.round(150 + t2 * (240 - 150));
                const g = Math.round(200 + t2 * (245 - 200));
                const b = Math.round(230 + t2 * (250 - 230));
                return `rgba(${r}, ${g}, ${b}, ${0.5 + absValue * 0.15})`;
            }
        } else {
            // Correlación positiva: Blanco -> Amarillo claro -> Naranja -> Rojo
            const t = (normalized - 0.5) / 0.5; // 0 a 1
            
            if (t < 0.33) {
                // Blanco a amarillo claro (correlación positiva débil: 0.0 a 0.33)
                const t2 = t / 0.33;
                const r = Math.round(240 + t2 * (255 - 240));
                const g = Math.round(245 + t2 * (240 - 245));
                const b = Math.round(250 - t2 * (200 - 50));
                return `rgba(${r}, ${g}, ${b}, ${0.5 + absValue * 0.15})`;
            } else if (t < 0.67) {
                // Amarillo a naranja (correlación positiva moderada: 0.33 a 0.67)
                const t2 = (t - 0.33) / 0.34;
                const r = Math.round(255);
                const g = Math.round(240 - t2 * (180 - 100));
                const b = Math.round(50 - t2 * 30);
                return `rgba(${r}, ${g}, ${b}, ${0.65 + absValue * 0.2})`;
            } else {
                // Naranja a rojo (correlación positiva fuerte: 0.67 a 1.0)
                const t2 = (t - 0.67) / 0.33;
                const r = Math.round(255);
                const g = Math.round(100 - t2 * (100 - 30));
                const b = Math.round(20 - t2 * 20);
                return `rgba(${r}, ${g}, ${b}, ${0.75 + absValue * 0.2})`;
            }
        }
    }
    
    // Dibujar celdas del heatmap con diseño moderno y sofisticado
    matriz.forEach((row, i) => {
        row.forEach((value, j) => {
            const x = padding.left + (j * cellWidth);
            const y = padding.top + (i * cellHeight);
            const absValue = Math.abs(value);
            
            // Resetear sombras
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Para la diagonal (auto-correlación = 1.0), usar color especial
            if (i === j) {
                // Auto-correlación siempre es 1.0
                ctx.fillStyle = 'rgba(45, 90, 160, 0.9)';
                ctx.shadowColor = 'rgba(45, 90, 160, 0.3)';
                ctx.shadowBlur = 8;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            } else {
                // Color de fondo con gradiente mejorado
                ctx.fillStyle = getColorForCorrelation(value);
                
                // Sombra sutil para profundidad en correlaciones significativas
                if (absValue > 0.2) {
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
                    ctx.shadowBlur = 6;
                    ctx.shadowOffsetX = 2;
                    ctx.shadowOffsetY = 2;
                }
            }
            
            // Dibujar celda sin bordes redondeados ni padding para análisis visual continuo
            const rectX = x;
            const rectY = y;
            const rectW = cellWidth;
            const rectH = cellHeight;
            
            // Dibujar rectángulo simple sin bordes redondeados para análisis visual continuo
            ctx.fillRect(rectX, rectY, rectW, rectH);
            
            // Resetear sombra
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Solo dibujar borde sutil para la diagonal (auto-correlación)
            // No dibujar bordes en otras celdas para análisis visual continuo
            if (i === j) {
                // Diagonal: borde dorado especial muy sutil
                ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
                ctx.lineWidth = 2;
                ctx.strokeRect(rectX, rectY, rectW, rectH);
            }
            
            // Texto del valor mejorado
            if (value !== null && !isNaN(value)) {
                // Color del texto según fondo e intensidad
                let textColor;
                if (i === j) {
                    textColor = 'rgba(255, 255, 255, 0.98)';
                } else {
                    const isLight = absValue < 0.2 || (value > 0 && value < 0.3);
                    textColor = isLight ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.98)';
                }
                ctx.fillStyle = textColor;
                
                // Fuente mejorada con mejor legibilidad
                const fontSize = absValue > 0.5 || i === j ? 12 : absValue > 0.3 ? 11 : 10;
                ctx.font = `${absValue > 0.5 || i === j ? 'bold ' : ''}${fontSize}px "Segoe UI", -apple-system, BlinkMacSystemFont, "Roboto", "Helvetica Neue", Arial, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // Sombra de texto para mejor legibilidad
                if (absValue > 0.2 || i === j) {
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                    ctx.shadowBlur = 3;
                    ctx.shadowOffsetX = 1;
                    ctx.shadowOffsetY = 1;
                }
                
                // Mostrar valor con formato mejorado
                const displayValue = i === j ? '1.00' : value.toFixed(2);
                ctx.fillText(displayValue, x + cellWidth / 2, y + cellHeight / 2);
                
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }
        });
    });
    
    // Agregar método roundRect si no existe (para bordes redondeados)
    if (!ctx.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
            this.beginPath();
            this.moveTo(x + radius, y);
            this.lineTo(x + width - radius, y);
            this.quadraticCurveTo(x + width, y, x + width, y + radius);
            this.lineTo(x + width, y + height - radius);
            this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            this.lineTo(x + radius, y + height);
            this.quadraticCurveTo(x, y + height, x, y + height - radius);
            this.lineTo(x, y + radius);
            this.quadraticCurveTo(x, y, x + radius, y);
            this.closePath();
        };
    }
    
    // Dibujar labels del eje X (arriba) mejorados con mejor legibilidad
    ctx.fillStyle = 'rgba(45, 90, 160, 0.9)';
    ctx.font = 'bold 12px "Segoe UI", -apple-system, BlinkMacSystemFont, "Roboto", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    variables.forEach((label, j) => {
        const x = padding.left + (j * cellWidth) + (cellWidth / 2);
        ctx.save();
        ctx.translate(x, padding.top - 20);
        ctx.rotate(-Math.PI / 4);
        const nombreLimpio = nombresLimpios[j];
        const truncatedLabel = nombreLimpio.length > 25 ? nombreLimpio.substring(0, 22) + '...' : nombreLimpio;
        // Sombra de texto para mejor legibilidad
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillText(truncatedLabel, 0, 0);
        ctx.restore();
    });
    
    // Dibujar labels del eje Y (izquierda) mejorados con mejor legibilidad
    ctx.fillStyle = 'rgba(45, 90, 160, 0.9)';
    ctx.font = 'bold 12px "Segoe UI", -apple-system, BlinkMacSystemFont, "Roboto", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    variables.forEach((label, i) => {
        const y = padding.top + (i * cellHeight) + (cellHeight / 2);
        const nombreLimpio = nombresLimpios[i];
        const truncatedLabel = nombreLimpio.length > 32 ? nombreLimpio.substring(0, 29) + '...' : nombreLimpio;
        // Sombra de texto para mejor legibilidad
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillText(truncatedLabel, padding.left - 20, y);
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    });
    
    // Líneas de grid mejoradas (más sutiles)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 0.5;
    
    // Líneas verticales
    for (let j = 0; j <= variables.length; j++) {
        const x = padding.left + (j * cellWidth);
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + (variables.length * cellHeight));
        ctx.stroke();
    }
    
    // Líneas horizontales
    for (let i = 0; i <= variables.length; i++) {
        const y = padding.top + (i * cellHeight);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + (variables.length * cellWidth), y);
        ctx.stroke();
    }
    
    // La diagonal ya está resaltada en el código de celdas, no necesitamos línea adicional
    
    // Mostrar contenedor
    container.style.display = 'block';
    console.log('[generarHeatmapCorrelaciones] Heatmap generado y contenedor mostrado');
    
    // Crear tarjeta informativa pequeña e innovadora con top correlaciones
    if (legendInfo) {
        // Obtener top 5 correlaciones más fuertes
        let topCorrelations = [];
        if (info_variables && Object.keys(info_variables).length > 0) {
            topCorrelations = Object.entries(info_variables)
                .sort((a, b) => Math.abs(b[1].correlacion) - Math.abs(a[1].correlacion))
                .slice(0, 5)
                .map(([varName, info]) => ({
                    nombre: limpiarNombreVariable(varName),
                    correlacion: info.correlacion,
                    absCorr: Math.abs(info.correlacion)
                }));
        }
        
        let legendHtml = '<div class="heatmap-info-card">';
        // Botón compacto para expandir/colapsar
        legendHtml += '<button class="info-card-toggle" onclick="toggleLegendInfo()" aria-expanded="false" aria-label="Mostrar/ocultar información">';
        legendHtml += '<i class="fas fa-info-circle"></i>';
        legendHtml += '<span class="info-card-title">Top Correlaciones</span>';
        legendHtml += '<i class="fas fa-chevron-down info-chevron"></i>';
        legendHtml += '</button>';
        
        // Contenido colapsable compacto
        legendHtml += '<div class="info-card-content" id="legendContent" style="display: none;">';
        
        // Top correlaciones en formato compacto
        if (topCorrelations.length > 0) {
            legendHtml += '<div class="top-correlations-compact">';
            topCorrelations.forEach((item, index) => {
                const corr = item.correlacion;
                const corrColor = corr > 0 ? '#E74C3C' : '#2D5AA0';
                const corrIcon = corr > 0 ? '↑' : '↓';
                const badgeColor = index === 0 ? '#F39C12' : index === 1 ? '#95A5A6' : index === 2 ? '#CD7F32' : 'rgba(0,0,0,0.3)';
                
                legendHtml += `
                    <div class="correlation-item-compact" style="border-left: 3px solid ${corrColor};">
                        <span class="corr-rank" style="background: ${badgeColor};">${index + 1}</span>
                        <span class="corr-name">${item.nombre}</span>
                        <span class="corr-value" style="color: ${corrColor};">${corrIcon} ${corr > 0 ? '+' : ''}${corr.toFixed(3)}</span>
                    </div>
                `;
            });
            legendHtml += '</div>';
        }
        
        // Escala de correlación compacta
        legendHtml += '<div class="legend-scale-compact">';
        legendHtml += '<div class="scale-label">Escala:</div>';
        legendHtml += '<div class="legend-gradient-compact">';
        
        // Crear gradiente de colores mejorado y más detallado para correlación
        const steps = 50; // Más pasos para mejor detalle
        for (let i = 0; i <= steps; i++) {
            const normalized = i / steps;
            const value = -1 + (normalized * 2); // De -1 a 1
            let color;
            const absValue = Math.abs(value);
            
            // Misma lógica de color que en getColorForCorrelation pero sin alpha
            if (normalized < 0.5) {
                const t = normalized / 0.5;
                if (t < 0.33) {
                    const t2 = t / 0.33;
                    const r = Math.round(30 + t2 * (60 - 30));
                    const g = Math.round(60 + t2 * (100 - 60));
                    const b = Math.round(120 + t2 * (180 - 120));
                    color = `rgb(${r}, ${g}, ${b})`;
                } else if (t < 0.67) {
                    const t2 = (t - 0.33) / 0.34;
                    const r = Math.round(60 + t2 * (150 - 60));
                    const g = Math.round(100 + t2 * (200 - 100));
                    const b = Math.round(180 + t2 * (230 - 180));
                    color = `rgb(${r}, ${g}, ${b})`;
                } else {
                    const t2 = (t - 0.67) / 0.33;
                    const r = Math.round(150 + t2 * (240 - 150));
                    const g = Math.round(200 + t2 * (245 - 200));
                    const b = Math.round(230 + t2 * (250 - 230));
                    color = `rgb(${r}, ${g}, ${b})`;
                }
            } else {
                const t = (normalized - 0.5) / 0.5;
                if (t < 0.33) {
                    const t2 = t / 0.33;
                    const r = Math.round(240 + t2 * (255 - 240));
                    const g = Math.round(245 + t2 * (240 - 245));
                    const b = Math.round(250 - t2 * (200 - 50));
                    color = `rgb(${r}, ${g}, ${b})`;
                } else if (t < 0.67) {
                    const t2 = (t - 0.33) / 0.34;
                    const r = Math.round(255);
                    const g = Math.round(240 - t2 * (180 - 100));
                    const b = Math.round(50 - t2 * 30);
                    color = `rgb(${r}, ${g}, ${b})`;
                } else {
                    const t2 = (t - 0.67) / 0.33;
                    const r = Math.round(255);
                    const g = Math.round(100 - t2 * (100 - 30));
                    const b = Math.round(20 - t2 * 20);
                    color = `rgb(${r}, ${g}, ${b})`;
                }
            }
            legendHtml += `<div class="legend-step-compact" style="background-color: ${color};" title="${value.toFixed(2)}"></div>`;
        }
        legendHtml += '</div>';
        legendHtml += '<div class="scale-labels-compact">';
        legendHtml += '<span>-1.0</span><span>0.0</span><span>+1.0</span>';
        legendHtml += '</div>';
        legendHtml += '</div>';
        
        // Información breve sobre el cálculo
        legendHtml += '<div class="info-note-compact">';
        legendHtml += '<i class="fas fa-chart-line"></i>';
        legendHtml += '<span>Correlación de Pearson con Éxito del Proyecto</span>';
        legendHtml += '</div>';
        
        legendHtml += '</div>'; // Cerrar info-card-content
        legendHtml += '</div>'; // Cerrar heatmap-info-card
        
        legendInfo.innerHTML = legendHtml;
    }
    
    // Función para toggle de la leyenda (debe ser global)
    window.toggleLegendInfo = function() {
        const content = document.getElementById('legendContent');
        const btn = document.querySelector('.info-card-toggle');
        const chevron = document.querySelector('.info-chevron');
        
        if (!content || !btn) return;
        
        const isExpanded = content.style.display !== 'none';
        
        if (isExpanded) {
            content.style.display = 'none';
            btn.setAttribute('aria-expanded', 'false');
            if (chevron) {
                chevron.style.transform = 'rotate(0deg)';
            }
        } else {
            content.style.display = 'block';
            btn.setAttribute('aria-expanded', 'true');
            if (chevron) {
                chevron.style.transform = 'rotate(180deg)';
            }
        }
    };
    
    // Agregar interactividad: tooltip al hacer hover
    canvas.addEventListener('mousemove', function(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (x >= padding.left && x <= padding.left + (variables.length * cellWidth) &&
            y >= padding.top && y <= padding.top + (variables.length * cellHeight)) {
            
            const col = Math.floor((x - padding.left) / cellWidth);
            const row = Math.floor((y - padding.top) / cellHeight);
            
            if (col >= 0 && col < variables.length && row >= 0 && row < variables.length) {
                const value = matriz[row][col];
                const var1 = nombresLimpios[row];
                const var2 = nombresLimpios[col];
                const var1Original = variables[row];
                const var2Original = variables[col];
                
                let tooltipText = `${var1} ↔ ${var2}\nCorrelación: ${value !== null ? value.toFixed(3) : 'N/A'}`;
                
                // Si es correlación con éxito, agregar información adicional
                if (var2Original === '_Exito_Numerico' && info_variables && info_variables[var1Original]) {
                    const info = info_variables[var1Original];
                    tooltipText += `\nPromedio: ${info.promedio.toFixed(2)}`;
                    tooltipText += `\nRango: ${info.min.toFixed(2)} - ${info.max.toFixed(2)}`;
                }
                
                canvas.title = tooltipText;
                canvas.style.cursor = 'pointer';
            } else {
                canvas.title = '';
                canvas.style.cursor = 'default';
            }
        } else {
            canvas.title = '';
            canvas.style.cursor = 'default';
        }
    });
}

// Configurar modal de información sobre clasificación
function setupInfoModal() {
    const infoBtn = document.getElementById('info-classification-btn');
    const modal = document.getElementById('classification-info-modal');
    const closeBtn = modal ? modal.querySelector('.info-modal-close') : null;
    const backdrop = modal ? modal.querySelector('.info-modal-backdrop') : null;
    
    if (!infoBtn || !modal) return;
    
    // Abrir modal
    infoBtn.addEventListener('click', function() {
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        // Enfocar el botón de cerrar
        if (closeBtn) {
            setTimeout(() => closeBtn.focus(), 100);
        }
    });
    
    // Cerrar modal
    function closeModal() {
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        // Devolver foco al botón de información
        infoBtn.focus();
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    if (backdrop) {
        backdrop.addEventListener('click', closeModal);
    }
    
    // Cerrar con Esc
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') {
            closeModal();
        }
    });
}
