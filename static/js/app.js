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
    loadCaracteristicasExitosos();
    loadRankingConstructores('Todos');
    setupEventListeners();
    setupTabs();
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
async function loadRankingConstructores(estado = 'Todos') {
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
        
        const constructorNombre = escapeHtml(constructor.constructor || 'Constructor Sin Nombre');
        html += `
            <div class="constructor-item ${isTop3 ? 'top-3' : ''}" style="animation-delay: ${delay}s">
                <div class="constructor-header">
                    <div class="constructor-rank">${rank}</div>
                    <div class="constructor-name" title="${constructorNombre}">
                        <i class="${icon}"></i>
                        <span>${constructorNombre}</span>
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
            <td>${escapeHtml(proyecto.constructor || 'N/A')}</td>
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
