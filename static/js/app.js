// Variables globales
let map;
let markers = [];
let markerCluster;
let proyectosData = [];
let proyectosDataSorted = []; // Datos ordenados para la tabla
let currentFilters = {
    clasificacion: 'Todos',
    zona: 'Todas',
    barrio: 'Todos',
    tipo_vis: 'Todos',
    precio_min: null,
    precio_max: null
};
let tableSort = {
    column: null,
    direction: 'asc' // 'asc' o 'desc'
};

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    loadFiltros();
    loadProyectos();
    setupEventListeners();
});

// Inicializar mapa
function initMap() {
    // Centro de Cali
    map = L.map('map', {
        center: [3.4516, -76.5320],
        zoom: 11,
        zoomControl: true
    });

    // Capas base (reutilizar instancias)
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    });
    
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri',
        maxZoom: 19
    });

    // Agregar capa satelital por defecto (siempre satelital)
    satelliteLayer.addTo(map);

    // Control de capas (opcional, pero mantenemos para poder cambiar si es necesario)
    const baseMaps = {
        "Satélite": satelliteLayer,
        "Mapa": osmLayer
    };

    L.control.layers(baseMaps).addTo(map);

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
        }
    } catch (error) {
        console.error('Error al cargar filtros:', error);
    }
}

// Cargar proyectos
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
            proyectosDataSorted = []; // Resetear ordenamiento al cargar nuevos datos
            tableSort.column = null;
            tableSort.direction = 'asc';
            
            console.log(`Proyectos cargados: ${proyectosData.length}`);
            
            // Actualizar todas las vistas
            updateMap();
            updateTable();
            await updateStats(); // updateStats ya actualiza también las métricas
            
            // Mostrar mensaje si no hay proyectos
            if (proyectosData.length === 0) {
                console.warn('No hay proyectos para mostrar. Verifica los filtros o que los datos se hayan cargado correctamente.');
            }
        } else {
            console.error('Error al cargar proyectos:', data.error || 'Error desconocido');
            if (data.error) {
                alert('Error: ' + data.error);
            }
        }
    } catch (error) {
        console.error('Error al cargar proyectos:', error);
        alert('Error al cargar los proyectos. Por favor, recarga la página.');
    } finally {
        hideLoading();
    }
}

// Actualizar mapa (optimizado)
function updateMap() {
    // Limpiar marcadores existentes
    markerCluster.clearLayers();
    markers = [];

    if (proyectosData.length === 0) {
        document.getElementById('map-count').textContent = '0';
        return;
    }

    // Crear marcadores en batch (más eficiente)
    const markerLayers = proyectosData.map(proyecto => {
        const marker = L.marker([proyecto.lat, proyecto.lon], {
            icon: getIconForClasificacion(proyecto.clasificacion)
        });
        marker.bindPopup(createPopupContent(proyecto), { maxWidth: 300 });
        return marker;
    });

    // Agregar todos los marcadores al cluster de una vez
    markerCluster.addLayers(markerLayers);
    markers = markerLayers;

    // Ajustar vista del mapa si hay proyectos
    if (markers.length > 0) {
        const group = new L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.1));
    }

    // Actualizar contador
    document.getElementById('map-count').textContent = proyectosData.length;
}

// Crear icono según clasificación
function getIconForClasificacion(clasificacion) {
    const colors = {
        'Exitoso': '#27AE60',
        'Moderado': '#F39C12',
        'Mejorable': '#E74C3C'
    };

    // Normalizar clasificación
    if (clasificacion) {
        clasificacion = String(clasificacion).trim();
    }
    
    // Si no es una clasificación válida, usar 'Moderado' por defecto (naranja) en lugar de gris
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
                <strong>Patrón Ventas:</strong> ${escapeHtml(proyecto.patron_ventas)}
            </div>
            <div class="popup-item">
                <strong>Score Éxito:</strong> ${proyecto.score_exito.toFixed(2)}
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
        
        // Ordenamiento para texto
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
        tbody.innerHTML = '<tr><td colspan="11" class="loading">No hay proyectos que coincidan con los filtros</td></tr>';
        document.getElementById('table-count').textContent = '(0 proyectos)';
        return;
    }

    // Actualizar contador
    document.getElementById('table-count').textContent = `(${dataToRender.length} proyecto${dataToRender.length !== 1 ? 's' : ''})`;

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
            // Actualizar sidebar stats
            document.getElementById('total-proyectos').textContent = data.total;
            document.getElementById('exitosos').textContent = data.exitosos;
            document.getElementById('moderados').textContent = data.moderados;
            document.getElementById('mejorables').textContent = data.mejorables;
            
            // Actualizar métricas principales
            document.getElementById('metric-exitosos').textContent = data.exitosos;
            document.getElementById('metric-moderados').textContent = data.moderados;
            document.getElementById('metric-mejorables').textContent = data.mejorables;
            document.getElementById('metric-score').textContent = data.score_promedio.toFixed(2);
        }
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
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
    });

    // Botón aplicar precio
    document.getElementById('aplicar_precio').addEventListener('click', function() {
        const precioMin = document.getElementById('precio_min').value;
        const precioMax = document.getElementById('precio_max').value;
        currentFilters.precio_min = precioMin && precioMin !== '' ? precioMin : null;
        currentFilters.precio_max = precioMax && precioMax !== '' ? precioMax : null;
        loadProyectos();
    });
    
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

    // Toggle de información
    document.getElementById('info-toggle').addEventListener('click', function() {
        const panel = document.getElementById('info-panel');
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
        } else {
            panel.style.display = 'none';
        }
    });

    // Botón de descarga
    document.getElementById('btn-download').addEventListener('click', function() {
        downloadCSV();
    });
    
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
    const params = buildFilterParams();
    const url = `/api/descargar?${params}`;
    window.location.href = url;
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
