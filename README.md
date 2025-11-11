# 🏗️ Modelo Predictivo - Galería Inmobiliaria

Aplicación web moderna para visualización y clasificación de proyectos inmobiliarios en Cali, Colombia.

## 📋 Descripción

Esta aplicación permite visualizar proyectos inmobiliarios en un mapa interactivo y clasificarlos automáticamente como **Exitosos**, **Moderados** o **Mejorables** basándose en múltiples variables de análisis.

## ✨ Características

- 🗺️ **Mapa Interactivo**: Visualización de proyectos en mapa de Cali con Leaflet.js
- 📊 **Clasificación Automática**: Sistema de clasificación multi-variable que considera:
  - Velocidad de ventas (40%)
  - Velocidad de ventas mensual (25%)
  - Porcentaje vendido (20%)
  - Tamaño del proyecto (10%)
  - Patrón de ventas (5%)
- 🎯 **Clasificación por Segmentos**: Compara proyectos similares (Zona/Estrato/Tipo_VIS)
- 📈 **Análisis de Características**: Identifica patrones comunes en proyectos exitosos
- 🚀 **Flask Backend**: API RESTful para datos y filtros
- 💾 **Procesamiento en Memoria**: Genera clasificación directamente desde Excel sin archivos intermedios

## 🛠️ Tecnologías

- **Backend**: Flask (Python)
- **Frontend**: HTML, CSS, JavaScript
- **Mapas**: Leaflet.js con MarkerCluster
- **Data Science**: Pandas, NumPy, Scikit-learn
- **Visualización**: Font Awesome Icons

## 📦 Instalación

1. **Clonar el repositorio**:
```bash
git clone https://github.com/pjojoa/Modelo-predictivo-Galeria-Inmobiliaria.git
cd Modelo-predictivo-Galeria-Inmobiliaria
```

2. **Instalar dependencias**:
```bash
pip install -r requirements.txt
```

3. **Preparar datos**:
   - Asegúrate de tener el archivo `Base Proyectos.xlsx` en el directorio raíz
   - El archivo debe contener las hojas "Inmuebles" y "Proyectos"

## 🚀 Uso

### Windows
```bash
EJECUTAR_APP.bat
```

### Manual
```bash
python app.py
```

La aplicación estará disponible en: **http://localhost:5000**

## 📁 Estructura del Proyecto

```
.
├── app.py                      # Aplicación Flask principal
├── generar_clasificacion.py    # Lógica de clasificación y análisis
├── Base Proyectos.xlsx         # Datos de entrada
├── requirements.txt            # Dependencias Python
├── templates/
│   └── index.html             # Frontend HTML
├── static/
│   ├── css/
│   │   └── style.css          # Estilos CSS
│   └── js/
│       └── app.js             # JavaScript frontend
└── README.md                  # Este archivo
```

## 🎯 Sistema de Clasificación

Los proyectos se clasifican en tres categorías:

### 🟢 Exitosos
- **Score**: 0.62 - 0.79
- **Características**: Alta velocidad de ventas, rápido agotamiento de inventario
- **Velocidad típica**: 22+ unidades/mes
- **Meses para agotar**: < 18 meses

### 🟠 Moderados
- **Score**: 0.50 - 0.62
- **Características**: Desempeño estándar, ventas constantes
- **Velocidad típica**: 8-22 unidades/mes
- **Meses para agotar**: 18-36 meses

### 🔴 Mejorables
- **Score**: 0.21 - 0.50
- **Características**: Requieren atención, bajas ventas
- **Velocidad típica**: < 8 unidades/mes
- **Meses para agotar**: > 36 meses

## 📊 Variables Consideradas

La clasificación considera múltiples factores:

1. **Velocidad de Ventas** (40%): Unidades vendidas por mes
2. **Meses para Agotar** (40%): Tiempo estimado para agotar inventario
3. **Porcentaje Vendido** (20%): % de unidades vendidas vs. total
4. **Tamaño del Proyecto** (10%): Número de unidades (óptimo: 50-150)
5. **Patrón de Ventas** (5%): Acelerado, Constante, o Desacelerado

## 🔧 API Endpoints

### GET `/api/proyectos`
Obtiene proyectos con filtros aplicados.

**Parámetros**:
- `clasificacion`: Exitoso, Moderado, Mejorable, Todos
- `zona`: Zona de Cali
- `barrio`: Barrio específico
- `tipo_vis`: Tipo de vivienda
- `precio_min`: Precio mínimo
- `precio_max`: Precio máximo

### GET `/api/filtros`
Obtiene opciones disponibles para los filtros.

### GET `/api/estadisticas`
Obtiene estadísticas de los proyectos filtrados.

### GET `/api/caracteristicas-exitosos`
Obtiene características comunes de proyectos exitosos.

## 📝 Documentación Adicional

- `README_CLASIFICACION.md`: Sistema de clasificación detallado
- `README_FLASK.md`: Documentación de la aplicación Flask
- `MEJORAS_FASE1.md`: Mejoras de Fase 1 implementadas
- `MEJORAS_FASE2.md`: Mejoras de Fase 2 implementadas
- `DATASET_FINAL_COLUMNAS.md`: Columnas del dataset final

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto es de uso interno.

## 👤 Autor

**Pedro Jojoa**
- GitHub: [@pjojoa](https://github.com/pjojoa)

## 🙏 Agradecimientos

- Leaflet.js por la librería de mapas
- Font Awesome por los iconos
- La comunidad de Flask por el framework

## 🌐 Despliegue en Render

Sigue estos pasos para desplegar:

1) Requisitos en el repo
- Archivo `requirements.txt` incluye `gunicorn`.
- Archivo `Procfile` con:
  ```
  web: gunicorn app:app --workers 2 --threads 2 --timeout 180
  ```
- `render.yaml` con el servicio web Python, autoDeploy habilitado, y `startCommand` configurado.
- `runtime.txt` (ej. `python-3.10.13`).

2) Crear el servicio
- Entra a `https://render.com` → New + → Web Service.
- Conecta este repositorio.
- Environment: Python.
- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app --workers 2 --threads 2 --timeout 180`
- Plan: Free (o superior).

3) Variables de entorno
- En Render → tu servicio → Environment:
  - `MAPILLARY_TOKEN` (si usas Street Preview).
  - `PYTHONUNBUFFERED=1` (opcional; ya definido en `render.yaml`).

4) Auto‑deploy
- `render.yaml` define `autoDeploy: true`. Cada push a `main` dispara un nuevo deploy automáticamente.

5) Notas importantes
- El servidor Gunicorn toma el puerto que Render expone (no cambies host/port en `app.py` para producción).
- Si usas archivos locales (como `Base Proyectos.xlsx`), el filesystem es efímero. Inclúyelo en el repo o usa almacenamiento remoto.
- Aumenta `--timeout` si algún endpoint tarda (180s por defecto).

6) Troubleshooting
- Verifica logs en Render → Logs si hay fallos de importación o rutas 404/500.
- Si el build falla por dependencias, asegúrate de fijar versiones compatibles en `requirements.txt`.

