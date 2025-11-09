# 🗺️ Aplicación Web Flask - Mapa Interactivo de Proyectos Inmobiliarios

## Descripción

Aplicación web moderna desarrollada con **Flask** y **Leaflet** que muestra un mapa interactivo de Cali con proyectos inmobiliarios clasificados. Esta aplicación **NO depende de Streamlit**, es más rápida y ligera.

## Características

- ✅ **Sin dependencia de Streamlit** - Aplicación Flask pura
- ✅ **Generación automática de clasificación** - Solo necesitas `Base Proyectos.xlsx`
- ✅ **Mapa interactivo** - Leaflet con marcadores agrupados (clustering)
- ✅ **Diseño moderno** - Estilo Platzi con colores profesionales
- ✅ **Filtros avanzados** - Por clasificación, zona, barrio, tipo VIS y precio
- ✅ **API RESTful** - Backend completo con endpoints para datos
- ✅ **Responsive** - Funciona en dispositivos móviles y tablets
- ✅ **Descarga de datos** - Exportar proyectos filtrados a CSV
- ✅ **Rápida y eficiente** - Mejor rendimiento que Streamlit
- ✅ **Clasificación inteligente** - Clasifica proyectos en Exitosos, Moderados y Mejorables

## Requisitos

- Python 3.8 o superior
- Dependencias (instaladas automáticamente):
  - Flask >= 3.0.0
  - pandas >= 2.0.0
  - openpyxl >= 3.1.0
  - numpy >= 1.24.0

## Instalación

1. **Instalar dependencias:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Archivo de datos requerido:**
   - `Base Proyectos.xlsx` (debe existir con hojas "Inmuebles" y "Proyectos")
   - **NOTA**: La aplicación genera los datos directamente en memoria, NO requiere `proyectos_clasificados.xlsx`

## Uso

### Opción 1: Script de inicio (Windows)
```bash
iniciar_app.bat
```

### Opción 2: Desde la terminal
```bash
python app.py
```

### Opción 3: Con Flask CLI
```bash
flask run
```

La aplicación estará disponible en: **http://localhost:5000**

## Estructura del Proyecto

```
.
├── app.py                  # Aplicación Flask principal
├── templates/
│   └── index.html         # Frontend HTML
├── static/
│   ├── css/
│   │   └── style.css      # Estilos CSS estilo Platzi
│   └── js/
│       └── app.js         # JavaScript para interactividad
├── requirements.txt       # Dependencias Python
├── iniciar_app.bat       # Script de inicio (Windows)
└── README_FLASK.md       # Este archivo
```

## API Endpoints

### GET `/api/proyectos`
Obtiene proyectos con filtros aplicados.

**Parámetros de query:**
- `clasificacion`: Exitoso, Moderado, Mejorable, Todos
- `zona`: Zona de Cali
- `barrio`: Barrio específico
- `tipo_vis`: Tipo de vivienda
- `precio_min`: Precio mínimo
- `precio_max`: Precio máximo

**Respuesta:**
```json
{
  "success": true,
  "proyectos": [...],
  "total": 150
}
```

### GET `/api/filtros`
Obtiene opciones disponibles para los filtros.

**Respuesta:**
```json
{
  "success": true,
  "clasificaciones": ["Exitoso", "Moderado", "Mejorable"],
  "zonas": ["Norte", "Sur", ...],
  "barrios": [...],
  "tipos_vis": [...],
  "precio_min": 100000000,
  "precio_max": 500000000
}
```

### GET `/api/estadisticas`
Obtiene estadísticas de los proyectos filtrados.

**Respuesta:**
```json
{
  "success": true,
  "total": 150,
  "exitosos": 50,
  "moderados": 60,
  "mejorables": 40,
  "score_promedio": 0.58
}
```

### GET `/api/descargar`
Descarga los proyectos filtrados en formato CSV.

## Características del Mapa

- **Marcadores agrupados**: Los marcadores cercanos se agrupan automáticamente
- **Colores por clasificación**:
  - 🟢 Verde: Exitosos
  - 🟠 Naranja: Moderados
  - 🔴 Rojo: Mejorables
- **Popups informativos**: Información detallada al hacer clic
- **Capas**: Cambiar entre vista de mapa y vista satelital
- **Zoom automático**: Se ajusta automáticamente a los proyectos filtrados

## Diseño

El diseño sigue el estilo **Platzi** con:
- Colores: Verde Platzi (#98CA3F), Azul oscuro (#24385B)
- Tipografía moderna y legible
- Tarjetas con sombras sutiles
- Interfaz responsive y accesible

## Sistema de Clasificación

La aplicación **genera automáticamente** la clasificación de proyectos desde `Base Proyectos.xlsx`. 

### Clasificaciones
- **Exitoso** (Score: 0.62-0.79): Alta velocidad de ventas, top 33%
- **Moderado** (Score: 0.50-0.62): Velocidad media, 33%-67%
- **Mejorable** (Score: 0.21-0.50): Baja velocidad, bottom 33%

### Generación Automática
1. **Los datos se generan siempre en memoria** desde `Base Proyectos.xlsx` al iniciar la aplicación
2. Solo necesitas tener `Base Proyectos.xlsx` con las hojas "Inmuebles" y "Proyectos"
3. El sistema detecta automáticamente las columnas necesarias
4. **NO se requiere** el archivo `proyectos_clasificados.xlsx` - todo se procesa en memoria
5. Opcionalmente puedes guardar el resultado en Excel usando la API `/api/guardar-clasificacion`

Para más detalles, consulta [README_CLASIFICACION.md](README_CLASIFICACION.md)

## Ventajas sobre Streamlit

1. **Más rápido**: Flask es más ligero y rápido
2. **Mayor control**: Control total sobre el frontend
3. **Mejor rendimiento**: Sin recarga de página completa
4. **Más escalable**: Fácil de extender con más funcionalidades
5. **Sin limitaciones**: No hay restricciones de diseño de Streamlit
6. **Clasificación automática**: No necesitas archivos pre-clasificados

## Solución de Problemas

### Error: "No module named 'flask'"
```bash
pip install -r requirements.txt
```

### Error: "No se encuentran los datos"
- Verifica que `Base Proyectos.xlsx` existe con las hojas "Inmuebles" y "Proyectos"
- La clasificación se genera automáticamente en memoria al iniciar la aplicación
- Revisa los logs en la consola para ver el proceso de generación
- No es necesario tener `proyectos_clasificados.xlsx` - se genera todo en memoria

### El mapa no se muestra
- Verifica tu conexión a internet (Leaflet necesita cargar tiles)
- Revisa la consola del navegador para errores

### Puerto 5000 ocupado
Modifica el puerto en `app.py`:
```python
app.run(debug=True, host='0.0.0.0', port=5001)  # Cambiar 5000 a 5001
```

## Desarrollo

### Modificar estilos
Edita `static/css/style.css`

### Agregar funcionalidades
- Backend: Modifica `app.py`
- Frontend: Modifica `templates/index.html` y `static/js/app.js`

### Agregar nuevos endpoints
```python
@app.route('/api/nuevo-endpoint')
def nuevo_endpoint():
    return jsonify({'success': True})
```

## Licencia

Este proyecto es de uso interno.

## Soporte

Para más información sobre los datos y análisis, consulta:
- `reporte_proyectos_exitosos.txt`: Análisis detallado de patrones
- `informe_analisis_datos.txt`: Informe completo de análisis de datos

