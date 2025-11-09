# Dataset Final - Columnas y Tipos de Datos

## Resumen

Este documento describe las columnas que se generan en el dataset final mediante `generar_archivo_final()` en `generar_clasificacion.py`. Este dataset es el que alimenta el mapa interactivo y la tabla de la aplicación Flask.

## Columnas Finales del Dataset (19 columnas)

**Total de columnas generadas:** 19

### 1. Identificación

| Columna | Tipo | Descripción | Valores Válidos |
|---------|------|-------------|-----------------|
| `Codigo_Proyecto` | str | Código único del proyecto | Cualquier string |
| `Proyecto` | str | Nombre del proyecto | Cualquier string |

### 2. Clasificación y Métricas

| Columna | Tipo | Descripción | Valores Válidos | Rango |
|---------|------|-------------|-----------------|-------|
| `Clasificacion` | str | Clasificación del proyecto | 'Exitoso', 'Moderado', 'Mejorable' | - |
| `Score_Exito` | float | Score de éxito del proyecto | 0.0 - 1.0 | 0.21 - 0.79 |
| `Score_Compuesto` | float | Score compuesto (FASE 2) | 0.0 - 1.0 | 0.0 - 1.0 |
| `Clasificacion_Compuesta` | str | Clasificación basada en score compuesto | 'Exitoso_Compuesto', 'Moderado_Compuesto', 'Mejorable_Compuesto' | - |

**Nota sobre Score_Exito:**
- **Exitoso**: Rango 0.62 - 0.79
- **Moderado**: Rango 0.50 - 0.62
- **Mejorable**: Rango 0.21 - 0.50

**Nota sobre Score_Compuesto:**
- Calculado con pesos: velocidad (40%), penetración (25%), velocidad histórica (20%), posición precio (15%)
- **Exitoso_Compuesto**: Score >= 0.67
- **Moderado_Compuesto**: Score 0.33 - 0.67
- **Mejorable_Compuesto**: Score < 0.33

### 3. Ubicación

| Columna | Tipo | Descripción | Valores Válidos |
|---------|------|-------------|-----------------|
| `Zona` | str | Zona del proyecto | Cualquier string o 'N/A' |
| `Barrio` | str | Barrio del proyecto | Cualquier string o 'N/A' |
| `Estrato` | int | Estrato del proyecto | 1-6 o 0 (si no disponible, se muestra como 'N/A' en la app) |
| `Coordenadas Reales` | str | Coordenadas en formato 'lat, lon' | String con coordenadas o '' (vacío) |

### 4. Características del Proyecto

| Columna | Tipo | Descripción | Valores Válidos | Unidades |
|---------|------|-------------|-----------------|----------|
| `Precio_Promedio` | float | Precio promedio del proyecto | >= 0 | COP |
| `Area_Promedio` | float | Área promedio del proyecto | >= 0 | m² |
| `Tipo_VIS_Principal` | str | Tipo de VIS del proyecto | Cualquier string o 'N/A' | - |

### 5. Métricas de Ventas

| Columna | Tipo | Descripción | Valores Válidos | Unidades |
|---------|------|-------------|-----------------|----------|
| `Velocidad_Ventas` | float | Unidades vendidas por mes | >= 0 | unid/mes |
| `Unidades_Vendidas` | int | Número de unidades vendidas | >= 0 | unidades |
| `Unidades_Disponibles` | int | Número de unidades disponibles | >= 0 | unidades |
| `Patron_Ventas` | str | Patrón de ventas del proyecto | 'Acelerado', 'Constante', 'Desacelerado', 'Sin datos' | - |
| `Meses_Para_Agotar` | float | Meses estimados para agotar inventario | 0 - 120 | meses |
| `Meses_Desde_Inicio` | float | Meses transcurridos desde inicio del proyecto | >= 0 | meses |

**NOTA:** Las columnas `Meses_Para_Agotar` y `Meses_Desde_Inicio` fueron agregadas recientemente al dataset final para proporcionar más información en la visualización.

## Validaciones Implementadas

### 1. Clasificación
- **SIEMPRE** debe ser 'Exitoso', 'Moderado', o 'Mejorable'
- **NUNCA** debe ser 'Sin Clasificar', vacío, o None
- Si no se puede clasificar, se asigna 'Moderado' por defecto

### 2. Score_Exito
- **SIEMPRE** debe estar en el rango 0.0 - 1.0
- Se ajusta según la clasificación:
  - Exitoso: 0.62 - 0.79
  - Moderado: 0.50 - 0.62
  - Mejorable: 0.21 - 0.50

### 3. Tipos de Datos
- **Números**: Se convierten a `float` o `int` según corresponda
- **Strings**: Se convierten a `str` y se rellenan valores vacíos
- **NaN/None**: Se reemplazan con valores por defecto apropiados

### 4. Rangos
- Precios y áreas: >= 0
- Unidades: >= 0 (enteros)
- Velocidad: >= 0
- Meses para agotar: 0 - 120
- Scores: 0.0 - 1.0

## Mapeo a la Aplicación Flask

### proyecto_to_dict (app.py)

El diccionario generado contiene:

```python
{
    'id': str,  # Índice del DataFrame
    'codigo': str,  # Codigo_Proyecto
    'nombre': str,  # Proyecto
    'clasificacion': str,  # Clasificacion (validada: 'Exitoso', 'Moderado', 'Mejorable')
    'lat': float,  # De Coordenadas Reales (parsed)
    'lon': float,  # De Coordenadas Reales (parsed)
    'barrio': str,  # Barrio
    'zona': str,  # Zona
    'estrato': str,  # Estrato (convertido a str, 'N/A' si es 0)
    'precio_promedio': float,  # Precio_Promedio
    'precio_formateado': str,  # Precio_Promedio formateado como moneda
    'area_promedio': float,  # Area_Promedio
    'velocidad_ventas': float,  # Velocidad_Ventas
    'unidades_vendidas': int,  # Unidades_Vendidas
    'unidades_disponibles': int,  # Unidades_Disponibles
    'patron_ventas': str,  # Patron_Ventas
    'score_exito': float,  # Score_Exito
    'color': str  # Color basado en Clasificacion
}
```

### Columnas Mostradas en la Tabla HTML

Las siguientes columnas se muestran en la tabla de la aplicación:

1. Código (`codigo`)
2. Nombre (`nombre`)
3. Clasificación (`clasificacion`)
4. Barrio (`barrio`)
5. Zona (`zona`)
6. Precio Promedio (`precio_promedio`)
7. Área Promedio (`area_promedio`)
8. Velocidad Ventas (`velocidad_ventas`)
9. Unidades Vendidas (`unidades_vendidas`)
10. Unidades Disponibles (`unidades_disponibles`)
11. Score de Éxito (`score_exito`)

### Columnas Mostradas en el Popup del Mapa

El popup muestra:

1. Nombre (`nombre`)
2. Código (`codigo`)
3. Clasificación (`clasificacion`)
4. Barrio (`barrio`)
5. Zona (`zona`)
6. Estrato (`estrato`)
7. Precio Promedio (`precio_formateado`)
8. Área Promedio (`area_promedio`)
9. Velocidad Ventas (`velocidad_ventas`)
10. Unidades Vendidas (`unidades_vendidas`)
11. Unidades Disponibles (`unidades_disponibles`)
12. Patrón Ventas (`patron_ventas`)
13. Score de Éxito (`score_exito`)

## Métricas y Cálculos

### 1. Score_Exito

Calculado mediante clasificación por segmentos o método global:

1. **Clasificación por Segmentos (FASE 1)**:
   - Segmentos: Zona + Estrato + Tipo_VIS
   - Percentiles del segmento: Q1 (33%), Q2 (67%)
   - Clasificación:
     - `meses_para_agotar <= Q1`: Exitoso
     - `Q1 < meses_para_agotar <= Q2`: Moderado
     - `meses_para_agotar > Q2`: Mejorable

2. **Método Global (Fallback)**:
   - Percentiles globales: Q1 (33%), Q2 (67%)
   - Misma lógica de clasificación

3. **Ajuste de Score**:
   - Exitoso: `0.62 + (score * 0.17)` → Rango 0.62 - 0.79
   - Moderado: `0.50 + (score * 0.12)` → Rango 0.50 - 0.62
   - Mejorable: `0.21 + (score * 0.29)` → Rango 0.21 - 0.50

### 2. Score_Compuesto (FASE 2)

Calculado con múltiples métricas normalizadas:

1. **Score de Velocidad (40%)**:
   - Basado en `meses_para_agotar`
   - Normalizado: `1.0 - ((meses - min_meses) / (max_meses - min_meses))`

2. **Score de Penetración (25%)**:
   - Basado en `_porcentaje_vendido_feat`
   - Normalizado: `porcentaje / 100`

3. **Score de Velocidad Histórica (20%)**:
   - Basado en `_velocidad_historica`
   - Normalizado: `(vel_hist - min_vel) / (max_vel - min_vel)`

4. **Score de Posición de Precio (15%)**:
   - Basado en `_precio_m2_percentil_zona`
   - Normalizado: `(100 - percentil) / 100`

5. **Score Compuesto**:
   - `Score_Compuesto = (velocidad * 0.40) + (penetracion * 0.25) + (velocidad_historica * 0.20) + (posicion_precio * 0.15)`

### 3. Patrón de Ventas

Determinado considerando:

1. **Velocidad de ventas**: Unidades vendidas por mes
2. **Tiempo transcurrido**: Meses desde inicio
3. **Porcentaje vendido**: % de unidades vendidas
4. **Comparación con segmento**: Ratio velocidad vs promedio del segmento

Clasificación:
- **Acelerado**: Alta velocidad (>15), ratio >1.2, alta penetración (>30%)
- **Constante**: Velocidad media (8-15), ratio cercano a 1 (0.8-1.2)
- **Desacelerado**: Baja velocidad (<8), ratio <0.8, baja penetración

## Notas Importantes

1. **Todas las clasificaciones son válidas**: No hay proyectos sin clasificar
2. **Todos los scores están en rangos válidos**: 0.0 - 1.0
3. **Todos los tipos de datos son correctos**: No hay errores de tipo
4. **Valores faltantes se manejan apropiadamente**: Se reemplazan con valores por defecto
5. **Coordenadas se procesan correctamente**: Se parsean y validan antes de usar

## Cambios Recientes

### FASE 1 (Mejoras Inmediatas)
- Clasificación por segmentos
- Validación de datos
- Detección de anomalías
- Patrón de ventas mejorado

### FASE 2 (Mejoras Medias)
- Feature Engineering avanzado
- Modelo RandomForest (opcional)
- Score Compuesto
- Validación temporal

### Últimas Correcciones
- Garantía de clasificación válida para todos los proyectos
- Manejo robusto de errores en todas las funciones
- Validación de tipos de datos en `generar_archivo_final`
- Agregadas columnas `Meses_Para_Agotar` y `Meses_Desde_Inicio` al dataset final
- Corrección de manejo de `Estrato` (int con 0 para valores no disponibles)

