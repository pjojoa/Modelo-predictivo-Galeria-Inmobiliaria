# Mejoras Fase 1: Clasificación de Proyectos Mejorada

## Resumen
Se han implementado las mejoras inmediatas (Fase 1) para el sistema de clasificación de proyectos, mejorando significativamente la precisión y robustez del modelo.

## Mejoras Implementadas

### 1. ✅ Clasificación por Segmentos
**Antes**: Los proyectos se clasificaban globalmente, comparando todos los proyectos sin considerar diferencias de mercado.

**Ahora**: 
- Los proyectos se clasifican dentro de su segmento (Zona/Estrato/Tipo_VIS)
- Compara "manzanas con manzanas" (proyectos similares)
- Si un segmento tiene menos de 3 proyectos, se usa clasificación global como fallback
- Cada proyecto tiene un método de clasificación asignado (Segmento o Global)

**Beneficios**:
- Clasificación más justa y precisa
- Considera diferencias de mercado por ubicación y tipo
- Reduce sesgo por precio/ubicación

### 2. ✅ Validación de Datos
**Nuevas validaciones implementadas**:
- **Meses para agotar**: Detecta valores negativos, cero, o extremadamente altos (>120 meses)
- **Velocidad de ventas**: Detecta velocidades cero/negativas con unidades disponibles, o extremadamente altas (>100 unid/mes)
- **Unidades vendidas**: Detecta valores negativos o inconsistencias (vendidas + disponibles > total)
- **Datos faltantes**: Identifica proyectos sin datos críticos para clasificación

**Resultado**: 
- Cada proyecto tiene una bandera `_es_anomalia`
- Se registra la razón de la anomalía en `_razon_anomalia`
- Los proyectos con anomalías críticas se excluyen de la clasificación por segmentos

### 3. ✅ Detección de Anomalías
**Tipos de anomalías detectadas**:
1. `Meses_agotar_invalido`: meses_para_agotar <= 0
2. `Meses_agotar_extremo`: meses_para_agotar > 120 meses (>10 años)
3. `Velocidad_cero_con_disponibles`: velocidad <= 0 pero hay unidades disponibles
4. `Velocidad_extrema`: velocidad > 100 unidades/mes
5. `Unidades_vendidas_negativas`: unidades vendidas < 0
6. `Inconsistencia_unidades`: vendidas + disponibles > total * 1.1
7. `Datos_faltantes`: sin datos de meses_para_agotar

**Reporte**: Se genera un resumen de anomalías detectadas durante la validación.

### 4. ✅ Mejora del Patrón de Ventas
**Antes**: Clasificación simple basada solo en velocidad actual:
- >15 unid/mes = Acelerado
- 8-15 unid/mes = Constante
- <8 unid/mes = Desacelerado

**Ahora**: Considera múltiples factores:
- **Velocidad de ventas actual**: unidades/mes
- **Porcentaje vendido**: % del total de unidades vendidas
- **Tiempo transcurrido**: meses desde inicio del proyecto
- **Comparación con segmento**: ratio vs velocidad promedio del segmento
- **Factor de tiempo**: esperado vs real de penetración

**Lógica mejorada**:
- **Acelerado**: Alta velocidad (>15) Y ratio > 1.2 Y (alta penetración >30% o factor tiempo >= 1.2)
- **Desacelerado**: Baja velocidad (<8) O ratio < 0.8 O (tiempo >12 meses y penetración <20%)
- **Constante**: Velocidad media (8-15) Y ratio cercano a 1 (0.8-1.2)

**Beneficios**:
- Patrón más preciso y contextual
- Considera el desempeño relativo al segmento
- Detecta proyectos con bajo desempeño aunque tengan velocidad media

## Archivos Modificados

### `generar_clasificacion.py`
- **Nueva función**: `validar_datos()` - Valida y detecta anomalías
- **Nueva función**: `clasificar_proyectos_por_segmento()` - Clasificación por segmentos
- **Nueva función**: `clasificar_proyectos_global()` - Clasificación global (fallback)
- **Función mejorada**: `clasificar_proyectos()` - Orquesta validación y clasificación
- **Función mejorada**: `determinar_patron_ventas()` - Patrón de ventas mejorado

### `app.py`
- **Función actualizada**: `generar_clasificacion_en_memoria()` - Usa las nuevas funciones mejoradas
- **Limpieza**: Elimina columnas temporales antes de generar resultado final

## Uso

El sistema ahora funciona automáticamente con las mejoras implementadas. Al ejecutar la aplicación:

1. **Carga de datos**: Se cargan y procesan los datos de `Base Proyectos.xlsx`
2. **Validación**: Se validan los datos y se detectan anomalías
3. **Clasificación por segmentos**: Se clasifican los proyectos dentro de su segmento
4. **Patrón de ventas**: Se determina el patrón de ventas mejorado
5. **Resultado**: Se genera el DataFrame con la clasificación mejorada

## Salida Esperada

Durante la ejecución, verás:
```
======================================================================
  VALIDACIÓN DE DATOS Y DETECCIÓN DE ANOMALÍAS
======================================================================

⚠ Anomalías detectadas:
  - X proyectos con meses_para_agotar <= 0
  - Y proyectos con velocidad_ventas > 100 unidades/mes
  ...

  Total de proyectos con anomalías: Z
  Proyectos válidos: W

======================================================================
  CLASIFICACIÓN DE PROYECTOS POR SEGMENTOS
======================================================================

  Segmentos encontrados: N

  Segmento 'Zona1|Estrato3|VIS': X proyectos clasificados
    - Exitosos: A, Moderados: B, Mejorables: C
  ...

✓ Clasificación por segmentos completada:
  - Exitosos: X
  - Moderados: Y
  - Mejorables: Z
  - Sin clasificar: W

======================================================================
  DETERMINACIÓN DE PATRÓN DE VENTAS MEJORADO
======================================================================

  Patrones de ventas determinados:
    - Acelerado: X proyectos
    - Constante: Y proyectos
    - Desacelerado: Z proyectos
```

## Próximos Pasos (Fase 2)

Las siguientes mejoras están planificadas para la Fase 2:

1. **Modelo de Machine Learning**: Implementar RandomForest/XGBoost para predicción
2. **Feature Engineering Avanzado**: Crear más features predictivos
3. **Métricas Compuestas**: Score combinado con múltiples factores
4. **Validación Temporal**: Validar con datos históricos

## Notas

- Las columnas temporales (`_segmento`, `_metodo_clasificacion`, `_es_anomalia`, `_razon_anomalia`) se eliminan automáticamente antes de generar el resultado final
- Los proyectos con anomalías críticas se clasifican usando el método global
- Si un segmento tiene menos de 3 proyectos, se usa clasificación global para ese segmento

