/**
 * Módulo de vista previa 360° con MapillaryJS
 * Integración con Graph API de Mapillary para vistas de calle
 */

// Token de Mapillary (puede ser configurado desde el servidor o variable de entorno)
const MAPILLARY_TOKEN = window.MAPILLARY_TOKEN || 'MLY|YOUR_TOKEN_HERE';

let mapillaryViewer = null;
let mapillaryLoaded = false;

/**
 * Busca la imagen más cercana de Mapillary a las coordenadas dadas
 * @param {number} lat - Latitud
 * @param {number} lng - Longitud
 * @param {number} radius - Radio de búsqueda en metros (default: 100)
 * @returns {Promise<string|null>} - ID de la imagen o null si no se encuentra
 */
async function findNearestImage(lat, lng, radius = 100) {
    try {
        // Verificar que el token esté configurado
        const token = window.MAPILLARY_TOKEN || MAPILLARY_TOKEN;
        if (!token || token === 'MLY|YOUR_TOKEN_HERE') {
            console.warn('[street] Token de Mapillary no configurado. Usa la variable de entorno MAPILLARY_TOKEN o configúralo en app.py');
            return null;
        }
        
        const url = new URL('https://graph.mapillary.com/images');
        url.searchParams.set('access_token', token);
        url.searchParams.set('fields', 'id,computed_geometry');
        url.searchParams.set('limit', '1');
        url.searchParams.set('near', `${lat},${lng}`);
        
        // Opcional: filtrar por radio (el endpoint ya da las más cercanas)
        if (radius) {
            url.searchParams.set('radius', radius.toString());
        }
        
        const response = await fetch(url.toString());
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[street] Graph API error ${response.status}: ${errorText}`);
            throw new Error(`[street] Graph API error ${response.status}: ${response.statusText}`);
        }
        
        const json = await response.json();
        
        if (json?.data && json.data.length > 0) {
            const imageId = json.data[0].id;
            return imageId;
        }
        
        return null;
        
    } catch (error) {
        console.error('[street] Error al buscar imagen:', error);
        return null;
    }
}

/**
 * Carga MapillaryJS de forma perezosa (solo cuando se necesita)
 * @returns {Promise<Object>} - Módulo de Mapillary
 */
async function loadMapillaryJS() {
    if (mapillaryLoaded && window.Mapillary) {
        return window.Mapillary;
    }
    
    try {
        
        // Cargar CSS
        if (!document.getElementById('mapillary-css')) {
            const link = document.createElement('link');
            link.id = 'mapillary-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/mapillary-js@4.1.3/dist/mapillary.css';
            document.head.appendChild(link);
        }
        
        // Cargar JS de forma dinámica
        // Usar la versión correcta del módulo
        const mapillaryModule = await import('https://unpkg.com/mapillary-js@4.1.3/dist/mapillary.module.js');
        
        window.Mapillary = mapillaryModule;
        mapillaryLoaded = true;
        
        return mapillaryModule;
        
    } catch (error) {
        console.error('[street] Error al cargar MapillaryJS:', error);
        throw error;
    }
}

/**
 * Abre el viewer de Mapillary con una imagen específica
 * @param {string} imageId - ID de la imagen de Mapillary
 * @param {string} containerId - ID del contenedor HTML
 */
async function openMapillaryViewer(imageId, containerId = 'mly') {
    try {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`[street] Contenedor '${containerId}' no encontrado`);
        }
        
        // Verificar token
        const token = window.MAPILLARY_TOKEN || MAPILLARY_TOKEN;
        if (!token || token === 'MLY|YOUR_TOKEN_HERE') {
            throw new Error('[street] Token de Mapillary no configurado');
        }
        
        // Cargar MapillaryJS si no está cargado
        const Mapillary = await loadMapillaryJS();
        
        // Limpiar viewer anterior si existe
        if (mapillaryViewer) {
            try {
                mapillaryViewer.remove();
            } catch (e) {
                console.warn('[street] Error al remover viewer anterior:', e);
            }
            mapillaryViewer = null;
        }
        
        // Asegurar que el contenedor esté visible y tenga dimensiones
        container.style.display = 'block';
        container.style.height = '400px';
        container.style.width = '100%';
        
        // Crear nuevo viewer
        mapillaryViewer = new Mapillary.Viewer({
            container: containerId,
            accessToken: token,
            imageId: imageId
        });
        
        
    } catch (error) {
        console.error('[street] Error al abrir viewer:', error);
        throw error;
    }
}

/**
 * Mueve el viewer a una nueva imagen
 * @param {string} imageId - ID de la nueva imagen
 */
async function moveToImage(imageId) {
    if (!mapillaryViewer) {
        await openMapillaryViewer(imageId);
        return;
    }
    
    try {
        await mapillaryViewer.moveTo(imageId);
    } catch (error) {
        console.error('[street] Error al mover viewer:', error);
        // Si falla, recrear el viewer
        await openMapillaryViewer(imageId);
    }
}

/**
 * Cierra y limpia el viewer de Mapillary
 */
function closeMapillaryViewer() {
    if (mapillaryViewer) {
        try {
            mapillaryViewer.remove();
        } catch (e) {
            console.warn('[street] Error al remover viewer:', e);
        }
        mapillaryViewer = null;
    }
}

/**
 * Abre la vista previa 360° para un proyecto
 * @param {Object} proyecto - Objeto con lat, lng y otros datos del proyecto
 */
async function openStreetPreview(proyecto) {
    
    const previewPanel = document.getElementById('street-preview-panel');
    const mlyDiv = document.getElementById('mly');
    const no360Div = document.getElementById('no360');
    const btnMaps = document.getElementById('btn-maps');
    const loadingDiv = document.getElementById('street-loading');
    
    if (!previewPanel) {
        console.error('[street] Panel street-preview-panel no encontrado');
        return;
    }
    
    if (!mlyDiv || !no360Div) {
        console.error('[street] Elementos mly o no360 no encontrados');
        return;
    }
    
    try {
        // Mostrar panel
        previewPanel.style.display = 'block';
        previewPanel.setAttribute('aria-expanded', 'true');
        
        // Mostrar loading
        mlyDiv.style.display = 'none';
        no360Div.style.display = 'none';
        if (loadingDiv) {
            loadingDiv.style.display = 'block';
        }
        
        // Validar coordenadas
        if (!proyecto.lat || !proyecto.lon) {
            throw new Error('Coordenadas inválidas');
        }
        
        // Buscar imagen cercana
        const imageId = await findNearestImage(proyecto.lat, proyecto.lon, 100);
        
        if (imageId) {
            
            // Ocultar loading y mensaje sin cobertura
            if (loadingDiv) loadingDiv.style.display = 'none';
            no360Div.style.display = 'none';
            
            // Mostrar contenedor del viewer
            mlyDiv.style.display = 'block';
            
            // Abrir viewer
            await openMapillaryViewer(imageId, 'mly');
            
            
        } else {
            
            // Sin cobertura 360°
            if (loadingDiv) loadingDiv.style.display = 'none';
            mlyDiv.style.display = 'none';
            no360Div.style.display = 'block';
            
            // Configurar botón de Google Maps
            if (btnMaps) {
                // Remover listeners anteriores
                const newBtn = btnMaps.cloneNode(true);
                btnMaps.parentNode.replaceChild(newBtn, btnMaps);
                
                newBtn.addEventListener('click', () => {
                    const url = `https://www.google.com/maps?q=${proyecto.lat},${proyecto.lon}`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                });
            }
            
            // Hacer zoom al punto en el mapa (usar la variable global map)
            if (typeof window !== 'undefined' && window.map) {
                window.map.setView([proyecto.lat, proyecto.lon], 17, {
                    animate: true
                });
            } else {
                console.warn('[street] Variable map no disponible globalmente');
            }
        }
        
    } catch (error) {
        console.error('[street] Error en openStreetPreview:', error);
        
        // Mostrar mensaje de error
        if (loadingDiv) loadingDiv.style.display = 'none';
        mlyDiv.style.display = 'none';
        no360Div.style.display = 'block';
        
        // Actualizar mensaje
        const no360Text = no360Div.querySelector('p');
        if (no360Text) {
            no360Text.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Error al cargar vista 360°. ${error.message || 'Sin cobertura cercana.'}`;
        }
    }
}

/**
 * Cierra el panel de vista previa
 */
function closeStreetPreview() {
    const previewPanel = document.getElementById('street-preview-panel');
    if (previewPanel) {
        previewPanel.style.display = 'none';
        previewPanel.setAttribute('aria-expanded', 'false');
    }
    
    closeMapillaryViewer();
}

// Exportar funciones para uso global
window.streetPreview = {
    findNearestImage,
    openMapillaryViewer,
    moveToImage,
    openStreetPreview,
    closeStreetPreview,
    closeMapillaryViewer
};

