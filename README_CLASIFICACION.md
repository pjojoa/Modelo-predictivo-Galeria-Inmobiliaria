# 📊 Sistema de Clasificación de Proyectos

## Descripción

Este sistema genera automáticamente la clasificación de proyectos inmobiliarios (Exitosos, Moderados, Mejorables) a partir del archivo **Base Proyectos.xlsx**.

## Archivos Principales

- **`generar_clasificacion.py`**: Script principal que genera la clasificación
- **`Base Proyectos.xlsx`**: Archivo de entrada con las hojas "Inmuebles" y "Proyectos"
- **`app.py`**: Aplicación Flask que usa las funciones de `generar_clasificacion.py` directamente

## Funcionamiento Automático

La aplicación Flask **genera automáticamente los datos en memoria** desde `Base Proyectos.xlsx`:
1. Al iniciar la aplicación, se ejecuta el proceso de clasificación completo
2. Los datos se generan en memoria sin necesidad de archivos intermedios
3. **NO se requiere** el archivo `proyectos_clasificados.xlsx` - todo se procesa en tiempo real
4. Opcionalmente puedes guardar el resultado en Excel usando la API

Esto significa que **solo necesitas tener `Base Proyectos.xlsx`** y la aplicación se encargará del resto.

## Proceso de Clasificación

### 1. Carga de Datos
- Lee las hojas "Inmuebles" y "Proyectos" del Excel
- Detecta automáticamente las columnas clave
- Une los datos por código de proyecto

### 2. Ingeniería de Variables
- **Nivel Unidad**: Calcula precio, área, precio/m², número de alcobas, baños, garajes
- **Nivel Proyecto**: Agrega métricas por proyecto (medianas, promedios, mínimos, máximos)

### 3. Métricas de Velocidad
- **Meses para agotar**: Unidades disponibles / Velocidad de ventas (unidades/mes)
- **Meses desde inicio**: Tiempo transcurrido desde la fecha de inicio del proyecto
- **Velocidad de ventas**: Unidades vendidas por mes

### 4. Clasificación
Los proyectos se clasifican en tres categorías según su velocidad de venta:

- **Exitoso** (Score: 0.62-0.79)
  - Top 33% más rápido en agotar inventario
  - Alta velocidad de ventas
  - Patrón: Acelerado o Constante

- **Moderado** (Score: 0.50-0.62)
  - 33%-67% en velocidad de ventas
  - Velocidad media
  - Patrón: Constante o Desacelerado

- **Mejorable** (Score: 0.21-0.50)
  - Bottom 33% más lento en agotar inventario
  - Baja velocidad de ventas
  - Patrón: Desacelerado o Constante

### 5. Score de Éxito
El Score de Éxito es un valor entre 0 y 1 que representa qué tan exitoso es un proyecto:
- **0.62-0.79**: Exitoso
- **0.50-0.62**: Moderado
- **0.21-0.50**: Mejorable

El score se calcula normalizando los "meses para agotar" y mapeándolo a los rangos anteriores.

## Columnas Generadas

El archivo `proyectos_clasificados.xlsx` contiene las siguientes columnas:

- `Codigo_Proyecto`: Código único del proyecto
- `Proyecto`: Nombre del proyecto
- `Clasificacion`: Exitoso, Moderado o Mejorable
- `Score_Exito`: Score numérico (0.21-0.79)
- `Zona`: Zona de Cali
- `Barrio`: Barrio
- `Estrato`: Estrato socioeconómico
- `Precio_Promedio`: Precio promedio del proyecto
- `Area_Promedio`: Área promedio de las unidades
- `Velocidad_Ventas`: Unidades vendidas por mes
- `Unidades_Vendidas`: Total de unidades vendidas
- `Unidades_Disponibles`: Unidades disponibles
- `Patron_Ventas`: Patrón de ventas (Acelerado, Constante, Desacelerado)
- `Coordenadas Reales`: Coordenadas geográficas
- `Tipo_VIS_Principal`: Tipo de vivienda de interés social

## Uso Manual

### Opción 1: Ejecutar el script directamente (genera Excel)
```bash
python generar_clasificacion.py
```
Esto generará el archivo `proyectos_clasificados.xlsx` (útil para análisis externos).

### Opción 2: Usar la API de Flask (regenera en memoria)
```bash
# Regenerar clasificación en memoria
curl -X POST http://localhost:5000/api/regenerar-clasificacion

# Guardar clasificación actual en Excel (opcional)
curl -X POST http://localhost:5000/api/guardar-clasificacion \
  -H "Content-Type: application/json" \
  -d '{"filename": "proyectos_clasificados.xlsx"}'
```

### Opción 3: La aplicación Flask (automático)
La aplicación Flask **siempre genera los datos en memoria** al iniciar, sin necesidad de archivos intermedios.

## Detección Automática de Columnas

El script detecta automáticamente las columnas necesarias en el Excel, buscando variaciones comunes de nombres:
- **Código de proyecto**: `Cod Proyecto`, `Codigo Proyecto`, `Código Proyecto`, etc.
- **Precio**: `Precio`, `Valor`, etc.
- **Área**: `Área`, `Area`, etc.
- **Velocidad de ventas**: `Ventas Promedio`, `Capacidad Ventas`, etc.
- **Unidades disponibles**: `Un. Disponible Proyecto`, etc.

## Requisitos

- Python 3.8+
- pandas >= 2.0.0
- numpy >= 1.24.0
- openpyxl >= 3.1.0

## Notas Importantes

1. **Formato del Excel**: El archivo `Base Proyectos.xlsx` debe tener las hojas "Inmuebles" y "Proyectos"
2. **Columnas requeridas**: Al menos debe tener código de proyecto, unidades disponibles y velocidad de ventas
3. **Coordenadas**: Si no están en el archivo de clasificación, se intentan obtener de "Base Proyectos.xlsx"
4. **Regeneración**: Puedes regenerar la clasificación en cualquier momento ejecutando el script o usando la API

## Personalización

Si deseas modificar los criterios de clasificación, edita la función `clasificar_proyectos()` en `generar_clasificacion.py`:

```python
def clasificar_proyectos(ds):
    # Modifica los percentiles aquí
    q1 = valid.quantile(0.33)  # Top 33% = Exitosos
    q2 = valid.quantile(0.67)  # Top 67% = Moderados
    # ...
```

## Troubleshooting

### Error: "No se encontró el archivo Base Proyectos.xlsx"
- Verifica que el archivo existe en el directorio raíz del proyecto
- Verifica que el nombre del archivo es exactamente "Base Proyectos.xlsx"

### Error: "No se encontraron columnas clave"
- Verifica que el Excel tiene las hojas "Inmuebles" y "Proyectos"
- Verifica que existe una columna con código de proyecto

### Error: "No hay datos válidos para clasificar"
- Verifica que hay proyectos con datos de unidades disponibles y velocidad de ventas
- Verifica que los datos numéricos están en formato correcto

