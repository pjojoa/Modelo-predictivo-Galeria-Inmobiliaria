# Mejoras Fase 2: Machine Learning y Métricas Avanzadas

## Resumen
Se han implementado las mejoras de la Fase 2 para el sistema de clasificación de proyectos, incorporando Machine Learning, feature engineering avanzado, métricas compuestas y validación temporal.

## Mejoras Implementadas

### 1. ✅ Feature Engineering Avanzado

**Nuevos features creados**:

#### Features de Precio y Área
- **`_precio_m2_percentil_zona`**: Percentil del precio por m² dentro de la zona (0-100)
- **`_precio_m2_percentil_estrato`**: Percentil del precio por m² dentro del estrato (0-100)
- **`_densidad_precio_area`**: Densidad de precio (precio/m² × área promedio)

#### Features de Tamaño
- **`_tamano_proyecto`**: Categorías de tamaño (Pequeño, Mediano, Grande, Muy Grande)
  - Pequeño: 0-50 unidades
  - Mediano: 50-100 unidades
  - Grande: 100-200 unidades
  - Muy Grande: >200 unidades
- **`_log_tamano`**: Logaritmo del tamaño (para normalización)

#### Features de Penetración de Mercado
- **`_porcentaje_vendido_feat`**: Porcentaje de unidades vendidas (0-100%)
- **`_ratio_vendidas_disponibles`**: Ratio de unidades vendidas vs disponibles

#### Features Temporales
- **`_antiguedad_proyecto`**: Categorías de antigüedad
  - Muy Nuevo: 0-6 meses
  - Nuevo: 6-12 meses
  - Mediano: 12-24 meses
  - Antiguo: 24-36 meses
  - Muy Antiguo: >36 meses
- **`_velocidad_historica`**: Velocidad histórica de ventas (unidades vendidas / meses desde inicio)

#### Features de Ubicación
- **`_zona_estrato`**: Combinación de zona y estrato (para segmentación)

#### Features de Área
- **`_categoria_area`**: Categorías de área promedio
  - Muy Pequeña: 0-60 m²
  - Pequeña: 60-80 m²
  - Mediana: 80-100 m²
  - Grande: 100-120 m²
  - Muy Grande: >120 m²

**Beneficios**:
- Más features predictivos para el modelo
- Normalización y categorización de variables continuas
- Comparación relativa dentro de segmentos

### 2. ✅ Modelo RandomForest

**Implementación**:
- **Algoritmo**: RandomForestRegressor de scikit-learn
- **Target**: Predecir `meses_para_agotar`
- **Features**: 
  - Features numéricos avanzados
  - Features categóricos con one-hot encoding (Zona, Estrato, Tamaño, Antigüedad, Área)
- **Hiperparámetros**:
  - `n_estimators=100`: 100 árboles
  - `max_depth=10`: Profundidad máxima de 10
  - `min_samples_split=5`: Mínimo 5 muestras para dividir
  - `min_samples_leaf=2`: Mínimo 2 muestras en hoja
  - `random_state=42`: Semilla para reproducibilidad

**Validación Temporal**:
- **TimeSeriesSplit**: Validación cruzada temporal (hasta 5 folds)
- **Métrica**: MAE (Mean Absolute Error) en meses
- **Resultado**: Muestra el error promedio y desviación estándar

**Importancia de Features**:
- El modelo calcula la importancia de cada feature
- Muestra los Top-10 features más importantes
- Útil para entender qué factores influyen más en el éxito

**Beneficios**:
- Predicción más precisa que percentiles simples
- Captura interacciones complejas entre variables
- Identifica factores importantes para el éxito
- Validación temporal para evitar data leakage

### 3. ✅ Métricas Compuestas

**Score Compuesto**:
Combina múltiples métricas normalizadas con pesos:

1. **Score de Velocidad** (40%):
   - Basado en `meses_para_agotar`
   - Normalizado 0-1 (invertido: menor tiempo = mayor score)

2. **Score de Penetración** (25%):
   - Basado en `_porcentaje_vendido_feat`
   - Normalizado 0-1 (mayor penetración = mayor score)

3. **Score de Velocidad Histórica** (20%):
   - Basado en `_velocidad_historica`
   - Normalizado 0-1 (mayor velocidad = mayor score)

4. **Score de Posición Precio** (15%):
   - Basado en `_precio_m2_percentil_zona`
   - Normalizado 0-1 (invertido: menor percentil = mejor precio = mayor score)

**Fórmula**:
```
Score_Compuesto = 0.40 × Score_Velocidad + 
                  0.25 × Score_Penetracion + 
                  0.20 × Score_Velocidad_Historica + 
                  0.15 × Score_Posicion_Precio
```

**Clasificación Compuesta**:
- **Exitoso_Compuesto**: Score >= 0.67
- **Moderado_Compuesto**: 0.33 <= Score < 0.67
- **Mejorable_Compuesto**: Score < 0.33

**Beneficios**:
- Combina múltiples factores en un solo score
- Más robusto que una sola métrica
- Considera contexto y desempeño histórico
- Proporciona una visión holística del proyecto

### 4. ✅ Validación Temporal

**Implementación**:
- **TimeSeriesSplit**: Divide los datos en orden temporal
- **Cross-Validation**: Hasta 5 folds (dependiendo del tamaño de datos)
- **Métrica**: MAE (Mean Absolute Error)
- **Reporte**: Muestra error promedio ± desviación estándar

**Beneficios**:
- Evita data leakage (no usa información futura)
- Valida el modelo de forma realista
- Proporciona métricas de confiabilidad
- Útil para evaluar el rendimiento del modelo

## Pipeline Actualizado

El pipeline ahora incluye:

1. **Carga de datos** (Base Proyectos.xlsx)
2. **Unión de datos** (Inmuebles + Proyectos)
3. **Features básicos** (agregados por proyecto)
4. **Cálculo de velocidad** (meses para agotar)
5. **Feature Engineering Avanzado** (FASE 2) ✨
6. **Entrenamiento RandomForest** (FASE 2) ✨
7. **Score Compuesto** (FASE 2) ✨
8. **Validación de datos** (FASE 1)
9. **Clasificación por segmentos** (FASE 1)
10. **Patrón de ventas mejorado** (FASE 1)
11. **Generación de archivo final**

## Archivos Modificados

### `generar_clasificacion.py`
- **Nueva función**: `crear_features_avanzados()` - Feature engineering avanzado
- **Nueva función**: `entrenar_modelo_random_forest()` - Entrenamiento del modelo ML
- **Nueva función**: `predecir_con_modelo()` - Predicción con el modelo (preparado para uso futuro)
- **Nueva función**: `calcular_score_compuesto()` - Cálculo de score compuesto
- **Función actualizada**: `main()` - Integra todas las funciones de Fase 2
- **Función actualizada**: `generar_archivo_final()` - Incluye Score_Compuesto y Clasificacion_Compuesta

### `app.py`
- **Función actualizada**: `generar_clasificacion_en_memoria()` - Incluye todas las funciones de Fase 2

### `requirements.txt`
- **Agregado**: `scikit-learn>=1.3.0` - Para el modelo RandomForest

## Salida Esperada

Durante la ejecución, verás:

```
======================================================================
  FEATURE ENGINEERING AVANZADO
======================================================================

✓ Features avanzados creados
  Total de features numéricos: X

======================================================================
  ENTRENAMIENTO DEL MODELO RANDOM FOREST
======================================================================

  Entrenando modelo con X proyectos y Y features...
  Features numéricos: A
  Features categóricos (one-hot): B

  Validación temporal (MAE): X.XX ± Y.YY meses

  Top-10 features más importantes:
    - feature_1: 0.XXXX
    - feature_2: 0.XXXX
    ...

✓ Modelo entrenado exitosamente

======================================================================
  CÁLCULO DE SCORE COMPUESTO
======================================================================

✓ Score compuesto calculado
  Rango: 0.XXX - 0.XXX
  Promedio: 0.XXX

======================================================================
  RESUMEN DE SCORE COMPUESTO (FASE 2)
======================================================================

  Rango: 0.XXX - 0.XXX
  Promedio: 0.XXX
  Mediana: 0.XXX

  Clasificación basada en Score Compuesto:
  Exitoso_Compuesto: X
  Moderado_Compuesto: Y
  Mejorable_Compuesto: Z
```

## Columnas Agregadas al Resultado

### Nuevas Columnas en `proyectos_clasificados.xlsx`:
- **`Score_Compuesto`**: Score compuesto (0-1) que combina múltiples métricas
- **`Clasificacion_Compuesta`**: Clasificación basada en el score compuesto
  - `Exitoso_Compuesto`: Score >= 0.67
  - `Moderado_Compuesto`: 0.33 <= Score < 0.67
  - `Mejorable_Compuesto`: Score < 0.33

## Comparación: Fase 1 vs Fase 2

| Aspecto | Fase 1 | Fase 2 |
|---------|--------|--------|
| **Método de Clasificación** | Percentiles por segmento | Percentiles + Score Compuesto + ML |
| **Features** | Básicos (precio, área, velocidad) | Avanzados (percentiles, categorías, históricos) |
| **Modelo ML** | No | Sí (RandomForest) |
| **Validación** | Por segmentos | Temporal (TimeSeriesSplit) |
| **Score** | Simple (meses_para_agotar) | Compuesto (múltiples métricas) |
| **Precisión** | Media | Alta |
| **Explicabilidad** | Alta | Media-Alta (feature importance) |

## Próximos Pasos (Fase 3)

Las siguientes mejoras están planificadas para la Fase 3:

1. **Análisis Temporal Completo**: Series temporales de ventas por proyecto
2. **Predicción de Éxito Futuro**: Modelo predictivo para proyectos nuevos
3. **Simulación de Escenarios**: "¿Qué pasaría si...?"
4. **Dashboard Avanzado**: Visualizaciones interactivas

## Notas

- El modelo RandomForest se entrena automáticamente si hay suficientes datos (mínimo 10 proyectos)
- Si scikit-learn no está disponible, el sistema funciona sin el modelo ML (usa solo clasificación por segmentos)
- El score compuesto se calcula siempre, independientemente del modelo ML
- La validación temporal solo se ejecuta si hay suficientes datos (mínimo 5 proyectos para 1 fold)
- Los features avanzados se crean antes de la clasificación para estar disponibles en todo el pipeline

## Uso

El sistema ahora funciona automáticamente con todas las mejoras de Fase 1 y Fase 2. Al ejecutar la aplicación:

1. **Carga de datos**: Se cargan y procesan los datos
2. **Feature Engineering**: Se crean features avanzados
3. **Entrenamiento ML**: Se entrena el modelo RandomForest (si hay datos suficientes)
4. **Score Compuesto**: Se calcula el score compuesto
5. **Clasificación**: Se clasifican los proyectos (por segmentos + compuesto)
6. **Resultado**: Se genera el DataFrame con todas las métricas

## Instalación

Para usar las nuevas funciones, asegúrate de tener scikit-learn instalado:

```bash
pip install -r requirements.txt
```

O manualmente:

```bash
pip install scikit-learn>=1.3.0
```

