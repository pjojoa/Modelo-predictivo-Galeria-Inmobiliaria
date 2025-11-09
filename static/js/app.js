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
    estado: 'Activos',  // Por defecto: Activos
    precio_min: null,
    precio_max: null
};
let tableSort = {
    column: null,
    direction: 'asc' // 'asc' o 'desc'
};

// Variables globales para controles del mapa
let currentBaseLayer = null;
let baseLayers = {};
let heatmapLayer = null;
let clustersEnabled = true;
let heatmapEnabled = false;
let markersEnabled = true; // Por defecto los marcadores están visibles
let heatmapDebounceTimer = null;

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
});

// Configurar sistema de pestañas
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Remover clase active de todos los botones y contenidos
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Agregar clase active al botón y contenido seleccionado
            button.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
        });
    });
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
            <div class="constructor-item ${isTop3 ? 'top-3' : ''}" style="animation-delay: ${delay}s">
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
}

// Inicializar mapa
function initMap() {
    // Centro de Cali
    map = L.map('map', {
        center: [3.4516, -76.5320],
        zoom: 11,
        zoomControl: true
    });

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
        const response = await fetch('/api/caracteristicas-exitosos');
        const data = await response.json();
        
        if (data.success && data.caracteristicas) {
            mostrarCaracteristicasExitosos(data.caracteristicas);
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
function mostrarCaracteristicasExitosos(caracteristicas) {
    const container = document.getElementById('caracteristicas-exitosos');
    
    // Validación
    if (!caracteristicas || Object.keys(caracteristicas).length === 0) {
        container.innerHTML = '<p style="color: #888; padding: 2rem; text-align: center;">No hay características disponibles para proyectos exitosos.</p>';
        return;
    }
    
    // Debug: Log de estructura de amenidades
    console.log('Características recibidas:', caracteristicas);
    if (caracteristicas.amenidades) {
        console.log('Amenidades encontradas:', caracteristicas.amenidades);
        console.log('Tipo:', typeof caracteristicas.amenidades);
        console.log('Claves:', Object.keys(caracteristicas.amenidades));
        if (caracteristicas.amenidades.amenidades_exitosos) {
            console.log('amenidades_exitosos encontrado:', Object.keys(caracteristicas.amenidades.amenidades_exitosos).length, 'amenidades');
        }
    } else {
        console.log('No se encontraron amenidades en características');
    }
    
    let html = '<div class="characteristics-grid">';
    
    // Velocidad de ventas
    if (caracteristicas.velocidad_ventas) {
        const v = caracteristicas.velocidad_ventas;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-tachometer-alt"></i> Velocidad de Ventas</strong>
                <p><strong>Promedio:</strong> ${v.promedio.toFixed(2)} unidades/mes</p>
                <p><strong>Mediana:</strong> ${v.mediana.toFixed(2)} unidades/mes</p>
                <p style="font-size: 0.9em; color: #666; margin-top: 0.5rem;">
                    <strong>Rango:</strong> ${v.min.toFixed(2)} - ${v.max.toFixed(2)} unidades/mes
                </p>
                <p style="font-size: 0.85em; color: #888; margin-top: 0.5rem;">
                    Percentil 25: ${v.percentil_25 ? v.percentil_25.toFixed(2) : 'N/A'} | 
                    Percentil 75: ${v.percentil_75 ? v.percentil_75.toFixed(2) : 'N/A'}
                </p>
            </div>
        `;
    }
    
    // Meses para agotar
    if (caracteristicas.meses_para_agotar) {
        const m = caracteristicas.meses_para_agotar;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-clock"></i> Meses para Agotar</strong>
                <p><strong>Promedio:</strong> ${m.promedio.toFixed(1)} meses</p>
                <p><strong>Mediana:</strong> ${m.mediana.toFixed(1)} meses</p>
                <p style="font-size: 0.9em; color: #666; margin-top: 0.5rem;">
                    <strong>Rango:</strong> ${m.min.toFixed(1)} - ${m.max.toFixed(1)} meses
                </p>
            </div>
        `;
    }
    
    // Porcentaje vendido
    if (caracteristicas.porcentaje_vendido) {
        const p = caracteristicas.porcentaje_vendido;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-percentage"></i> Porcentaje Vendido</strong>
                <p><strong>Promedio:</strong> ${p.promedio.toFixed(1)}%</p>
                <p><strong>Mediana:</strong> ${p.mediana.toFixed(1)}%</p>
                <p style="font-size: 0.9em; color: #666; margin-top: 0.5rem;">
                    <strong>Rango:</strong> ${p.min.toFixed(1)}% - ${p.max.toFixed(1)}%
                </p>
            </div>
        `;
    }
    
    // Precio promedio
    if (caracteristicas.precio_promedio) {
        const pr = caracteristicas.precio_promedio;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-dollar-sign"></i> Precio Promedio</strong>
                <p><strong>Promedio:</strong> ${formatCurrency(pr.promedio)}</p>
                <p><strong>Mediana:</strong> ${formatCurrency(pr.mediana)}</p>
                <p style="font-size: 0.9em; color: #666; margin-top: 0.5rem;">
                    <strong>Rango:</strong> ${formatCurrency(pr.min)} - ${formatCurrency(pr.max)}
                </p>
            </div>
        `;
    }
    
    // Área promedio
    if (caracteristicas.area_promedio) {
        const a = caracteristicas.area_promedio;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-ruler-combined"></i> Área Promedio</strong>
                <p><strong>Promedio:</strong> ${a.promedio.toFixed(1)} m²</p>
                <p><strong>Mediana:</strong> ${a.mediana.toFixed(1)} m²</p>
                <p style="font-size: 0.9em; color: #666; margin-top: 0.5rem;">
                    <strong>Rango:</strong> ${a.min.toFixed(1)} - ${a.max.toFixed(1)} m²
                </p>
            </div>
        `;
    }
    
    // Precio por m²
    if (caracteristicas.precio_m2) {
        const pm2 = caracteristicas.precio_m2;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-calculator"></i> Precio por m²</strong>
                <p><strong>Promedio:</strong> ${formatCurrency(pm2.promedio)}</p>
                <p><strong>Mediana:</strong> ${formatCurrency(pm2.mediana)}</p>
                <p style="font-size: 0.9em; color: #666; margin-top: 0.5rem;">
                    <strong>Rango:</strong> ${formatCurrency(pm2.min)} - ${formatCurrency(pm2.max)}
                </p>
            </div>
        `;
    }
    
    // Tamaño del proyecto
    if (caracteristicas.tamano_proyecto) {
        const t = caracteristicas.tamano_proyecto;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-building"></i> Tamaño del Proyecto</strong>
                <p><strong>Promedio:</strong> ${t.promedio.toFixed(0)} unidades</p>
                <p><strong>Mediana:</strong> ${t.mediana.toFixed(0)} unidades</p>
                <p style="font-size: 0.9em; color: #666; margin-top: 0.5rem;">
                    <strong>Rango:</strong> ${t.min.toFixed(0)} - ${t.max.toFixed(0)} unidades
                </p>
            </div>
        `;
    }
    
    // Estrato
    if (caracteristicas.estrato) {
        const e = caracteristicas.estrato;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-layer-group"></i> Estrato</strong>
                <p><strong>Moda:</strong> ${e.moda}</p>
                <p><strong>Promedio:</strong> ${e.promedio.toFixed(1)}</p>
                ${e.distribucion ? `<p style="font-size: 0.85em; color: #888; margin-top: 0.5rem;">
                    <strong>Distribución:</strong> ${Object.entries(e.distribucion).map(([k, v]) => `Estrato ${k}: ${v} proyectos`).join(', ')}
                </p>` : ''}
            </div>
        `;
    }
    
    // Zona
    if (caracteristicas.zona) {
        const z = caracteristicas.zona;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-map-marked-alt"></i> Zona</strong>
                <p><strong>Más común:</strong> ${z.mas_comun || 'N/A'}</p>
                ${z.distribucion ? `<p style="font-size: 0.85em; color: #888; margin-top: 0.5rem;">
                    <strong>Top zonas:</strong> ${Object.entries(z.distribucion).slice(0, 3).map(([k, v]) => `${k} (${v})`).join(', ')}
                </p>` : ''}
            </div>
        `;
    }
    
    // Alcobas promedio
    if (caracteristicas.alcobas_promedio) {
        const alc = caracteristicas.alcobas_promedio;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-bed"></i> Alcobas Promedio</strong>
                <p><strong>Promedio:</strong> ${alc.promedio.toFixed(1)}</p>
                <p><strong>Mediana:</strong> ${alc.mediana.toFixed(1)}</p>
                <p style="font-size: 0.9em; color: #666; margin-top: 0.5rem;">
                    <strong>Rango:</strong> ${alc.min.toFixed(1)} - ${alc.max.toFixed(1)}
                </p>
            </div>
        `;
    }
    
    // Baños promedio
    if (caracteristicas.banos_promedio) {
        const ban = caracteristicas.banos_promedio;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-bath"></i> Baños Promedio</strong>
                <p><strong>Promedio:</strong> ${ban.promedio.toFixed(1)}</p>
                <p><strong>Mediana:</strong> ${ban.mediana.toFixed(1)}</p>
                <p style="font-size: 0.9em; color: #666; margin-top: 0.5rem;">
                    <strong>Rango:</strong> ${ban.min.toFixed(1)} - ${ban.max.toFixed(1)}
                </p>
            </div>
        `;
    }
    
    // Garajes promedio
    if (caracteristicas.garajes_promedio) {
        const gar = caracteristicas.garajes_promedio;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-car"></i> Garajes Promedio</strong>
                <p><strong>Promedio:</strong> ${gar.promedio.toFixed(1)}</p>
                <p><strong>Mediana:</strong> ${gar.mediana.toFixed(1)}</p>
                <p style="font-size: 0.9em; color: #666; margin-top: 0.5rem;">
                    <strong>Rango:</strong> ${gar.min.toFixed(1)} - ${gar.max.toFixed(1)}
                </p>
            </div>
        `;
    }
    
    // Patrón de ventas
    if (caracteristicas.patron_ventas) {
        const pat = caracteristicas.patron_ventas;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-chart-line"></i> Patrón de Ventas</strong>
                <p><strong>Más común:</strong> ${pat.mas_comun || 'N/A'}</p>
                ${pat.distribucion ? `<p style="font-size: 0.85em; color: #888; margin-top: 0.5rem;">
                    <strong>Distribución:</strong> ${Object.entries(pat.distribucion).map(([k, v]) => `${k}: ${v} proyectos`).join(', ')}
                </p>` : ''}
            </div>
        `;
    }
    
    // Tipo VIS
    if (caracteristicas.tipo_vis) {
        const vis = caracteristicas.tipo_vis;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-home"></i> Tipo VIS</strong>
                <p><strong>Más común:</strong> ${vis.mas_comun || 'N/A'}</p>
                ${vis.distribucion ? `<p style="font-size: 0.85em; color: #888; margin-top: 0.5rem;">
                    <strong>Distribución:</strong> ${Object.entries(vis.distribucion).slice(0, 3).map(([k, v]) => `${k} (${v})`).join(', ')}
                </p>` : ''}
            </div>
        `;
    }
    
    // Ratio vendidas/disponibles
    if (caracteristicas.ratio_vendidas_disponibles) {
        const ratio = caracteristicas.ratio_vendidas_disponibles;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-balance-scale"></i> Ratio Vendidas/Disponibles</strong>
                <p><strong>Promedio:</strong> ${ratio.promedio.toFixed(2)}</p>
                <p><strong>Mediana:</strong> ${ratio.mediana.toFixed(2)}</p>
            </div>
        `;
    }
    
    // Posición de precio
    if (caracteristicas.posicion_precio_zona) {
        const pos = caracteristicas.posicion_precio_zona;
        html += `
            <div class="characteristic-item">
                <strong><i class="fas fa-chart-bar"></i> Posición de Precio (Zona)</strong>
                <p><strong>Promedio:</strong> ${pos.promedio.toFixed(1)} percentil</p>
                <p><strong>Mediana:</strong> ${pos.mediana.toFixed(1)} percentil</p>
            </div>
        `;
    }
    
    html += '</div>'; // Cerrar grid
    
    // Amenidades (sección especial más grande)
    // Verificar si hay amenidades disponibles (puede estar en diferentes estructuras)
    let amenidades_data = null;
    if (caracteristicas.amenidades) {
        // Estructura 1: amenidades.amenidades_exitosos (estructura esperada)
        if (caracteristicas.amenidades.amenidades_exitosos) {
            amenidades_data = caracteristicas.amenidades.amenidades_exitosos;
        }
        // Estructura 2: amenidades directamente es un objeto con amenidades
        else if (typeof caracteristicas.amenidades === 'object') {
            // Verificar si tiene la estructura esperada
            const keys = Object.keys(caracteristicas.amenidades);
            if (keys.length > 0 && caracteristicas.amenidades[keys[0]] && typeof caracteristicas.amenidades[keys[0]] === 'object' && 'ratio' in caracteristicas.amenidades[keys[0]]) {
                amenidades_data = caracteristicas.amenidades;
            }
        }
    }
    
    if (amenidades_data) {
        html += `<div style="margin-top: 2rem; padding-top: 2rem; border-top: 2px solid #E8E8E8;">`;
        html += `<h4 style="color: var(--platzi-dark-blue); margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">`;
        html += `<i class="fas fa-star"></i> Amenidades más Distintivas de Proyectos Exitosos`;
        html += `</h4>`;
        html += `<div class="characteristics-grid">`;
        
        try {
            // Convertir a array de entradas y ordenar por ratio
            const amenidades_entries = Object.entries(amenidades_data)
                .map(([nombre, datos]) => {
                    // Asegurar que datos tenga la estructura esperada
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
                    html += `
                        <div class="characteristic-item" style="border-left-color: ${ratioColor};">
                            <strong><i class="fas fa-check-circle"></i> ${escapeHtml(amenidad)}</strong>
                            <p><strong>Ratio:</strong> <span style="color: ${ratioColor}; font-weight: 700;">${datos.ratio.toFixed(2)}x</span></p>
                            <p><strong>En exitosos:</strong> ${datos.porcentaje_exitosos.toFixed(1)}%</p>
                            <p><strong>En total:</strong> ${datos.porcentaje_total.toFixed(1)}%</p>
                            <p style="font-size: 0.85em; color: #888; margin-top: 0.5rem;">
                                ${datos.frecuencia_exitosos} de ${datos.frecuencia_total} proyectos
                            </p>
                        </div>
                    `;
                });
            } else {
                html += `<div class="characteristic-item"><p>No se encontraron amenidades con datos suficientes.</p></div>`;
            }
        } catch (error) {
            console.error('Error al procesar amenidades:', error);
            html += `<div class="characteristic-item"><p>Error al cargar amenidades. Ver consola para más detalles.</p></div>`;
        }
        
        html += `</div></div>`;
    } else {
        // Si no hay amenidades, mostrar mensaje informativo
        html += `<div style="margin-top: 2rem; padding-top: 2rem; border-top: 2px solid #E8E8E8;">`;
        html += `<h4 style="color: var(--platzi-dark-blue); margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">`;
        html += `<i class="fas fa-star"></i> Amenidades más Distintivas de Proyectos Exitosos`;
        html += `</h4>`;
        html += `<div class="characteristic-item"><p style="color: #888; font-style: italic;">No hay datos de amenidades disponibles. Verifica que la columna "Otros" esté presente en los datos.</p></div>`;
        html += `</div>`;
    }
    
    container.innerHTML = html;
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
                    console.log('Diagnóstico:', diagData);
                    
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

// Actualizar mapa (optimizado)
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

    if (proyectosData.length === 0) {
        document.getElementById('map-count').textContent = '0';
        // Remover heatmap si no hay datos
        if (heatmapEnabled) {
            removeHeatmap();
        }
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

    markers = markerLayers;

    // Agregar marcadores según el estado de clústeres y visibilidad
    if (markersEnabled) {
        if (clustersEnabled && markerCluster) {
            markerCluster.addLayers(markerLayers);
        } else {
            markerLayers.forEach(marker => {
                marker.addTo(map);
            });
        }
    }
    // Si markersEnabled es false, no agregar marcadores al mapa

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

    // Actualizar contador
    document.getElementById('map-count').textContent = proyectosData.length;
    
    // Actualizar contador en el tab
    const tableCountElement = document.getElementById('table-count');
    if (tableCountElement) {
        tableCountElement.textContent = `(${proyectosData.length})`;
    }
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
                <strong>Constructor:</strong> ${escapeHtml(proyecto.constructor || 'N/A')}
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
            // Actualizar sidebar stats
            document.getElementById('total-proyectos').textContent = data.total || 0;
            document.getElementById('exitosos').textContent = data.exitosos || 0;
            document.getElementById('moderados').textContent = data.moderados || 0;
            document.getElementById('mejorables').textContent = data.mejorables || 0;
            
            // Actualizar métricas principales
            document.getElementById('metric-exitosos').textContent = data.exitosos || 0;
            document.getElementById('metric-moderados').textContent = data.moderados || 0;
            document.getElementById('metric-mejorables').textContent = data.mejorables || 0;
            
            // Manejar score_promedio de forma segura
            const scorePromedio = data.score_promedio !== undefined && data.score_promedio !== null 
                ? parseFloat(data.score_promedio) 
                : 0.0;
            document.getElementById('metric-score').textContent = scorePromedio.toFixed(2);
        } else {
            // Si hay error, establecer valores por defecto
            document.getElementById('total-proyectos').textContent = '0';
            document.getElementById('exitosos').textContent = '0';
            document.getElementById('moderados').textContent = '0';
            document.getElementById('mejorables').textContent = '0';
            document.getElementById('metric-exitosos').textContent = '0';
            document.getElementById('metric-moderados').textContent = '0';
            document.getElementById('metric-mejorables').textContent = '0';
            document.getElementById('metric-score').textContent = '0.00';
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
    
    if (!styleSelect || !centerBtn || !clusterToggle || !heatmapToggle || !markersToggle) {
        console.warn('No se encontraron todos los controles del mapa');
        return;
    }
    
    // Cargar estado desde localStorage
    const savedStyle = localStorage.getItem('mapStyle') || 'satellite';
    const savedClusters = localStorage.getItem('mapClusters') !== 'false';
    const savedHeatmap = localStorage.getItem('mapHeatmap') === 'true';
    const savedMarkers = localStorage.getItem('mapMarkers') !== 'false';
    
    styleSelect.value = savedStyle;
    clusterToggle.checked = savedClusters;
    heatmapToggle.checked = savedHeatmap;
    markersToggle.checked = savedMarkers;
    
    clustersEnabled = savedClusters;
    heatmapEnabled = savedHeatmap;
    markersEnabled = savedMarkers;
    
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
        console.log('No hay datos de proyectos para crear heatmap');
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
    
    console.log(`Creando heatmap GIS con ${validProjects.length} proyectos válidos`);
    
    // Usar normalizador robusto estilo GIS
    const normalize = weightNormalizer(validProjects, p => p.precio_promedio);
    
    // Obtener valores para la leyenda
    const prices = validProjects.map(p => p.precio_promedio).sort((a, b) => a - b);
    const p5 = percentile(prices, 0.05);
    const p95 = percentile(prices, 0.95);
    
    console.log(`Rango de precios (P5-P95): ${p5.toLocaleString('es-CO')} - ${p95.toLocaleString('es-CO')} COP`);
    
    // Crear datos normalizados con intensidad mejorada
    const normalizedData = validProjects.map(p => {
        const weight = normalize(p.precio_promedio);
        // Aumentar intensidad base para mejor visibilidad (mínimo 0.1 para puntos con peso bajo)
        const intensity = Math.max(0.1, weight * 0.9 + 0.1);
        return [p.lat, p.lon, intensity];
    });
    
    console.log(`Datos normalizados: ${normalizedData.length} puntos`);
    console.log(`Intensidad promedio: ${(normalizedData.reduce((sum, d) => sum + d[2], 0) / normalizedData.length).toFixed(3)}`);
    
    // Verificar si leaflet.heat está disponible
    if (typeof L.heatLayer !== 'function' && typeof L.heat !== 'function') {
        console.error('leaflet.heat no está disponible. Verificando carga de biblioteca...');
        console.log('L.heatLayer:', typeof L.heatLayer);
        console.log('L.heat:', typeof L.heat);
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
        console.log(`Heatmap GIS agregado: radius=${radius}, blur=${blur}`);
        
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
}

// Actualizar parámetro en URL
function updateURLParam(key, value) {
    const url = new URL(window.location);
    url.searchParams.set(key, value);
    window.history.replaceState({}, '', url);
}
