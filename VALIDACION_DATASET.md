# Validación del Dataset Final

## Columnas Esperadas en el Dataset Final

El dataset final que se genera en `generar_archivo_final` y que alimenta el mapa y la tabla debe contener las siguientes columnas:

### Columnas Obligatorias

1. **Codigo_Proyecto** (str)
   - Código único del proyecto
   - Fuente: `cols_proy['codigo']` o `key_pry`

2. **Proyecto** (str)
   - Nombre del proyecto
   - Fuente: `cols_proy['nombre']` o `Codigo_Proyecto`

3. **Clasificacion** (str)
   - Valores válidos: 'Exitoso', 'Moderado', 'Mejorable'
   - **NUNCA** debe ser 'Sin Clasificar' o vacío
   - Fuente: `proj_ds['Clasificacion']`

4. **Score_Exito** (float)
   - Rango: 0.0 - 1.0
   - Fuente: `proj_ds['Score_Exito']`

5. **Zona** (str)
   - Fuente: `cols_proy['zona']` o 'N/A'

6. **Barrio** (str)
   - Fuente: `cols_proy['barrio']` o 'N/A'

7. **Estrato** (int)
   - Fuente: `cols_proy['estrato']` convertido con `to_num()`
   - Valor por defecto: 0 (se muestra como 'N/A' en la aplicación si es 0)

8. **Precio_Promedio** (float)
   - Precio promedio del proyecto
   - Fuente: `cols_proy['precio_p']` (versión numérica)

9. **Area_Promedio** (float)
   - Área promedio del proyecto
   - Fuente: `cols_proy['area_p']` (versión numérica)

10. **Velocidad_Ventas** (float)
    - Unidades vendidas por mes
    - Fuente: `proj_ds['velocidad_ventas']`

11. **Unidades_Vendidas** (int)
    - Número de unidades vendidas
    - Fuente: `proj_ds['unidades_vendidas']`

12. **Unidades_Disponibles** (int)
    - Número de unidades disponibles
    - Fuente: `cols_proy['un_disp']` (versión numérica)

13. **Patron_Ventas** (str)
    - Valores: 'Acelerado', 'Constante', 'Desacelerado', 'Sin datos'
    - Fuente: `proj_ds['Patron_Ventas']`

14. **Coordenadas Reales** (str o float)
    - Coordenadas en formato 'lat, lon'
    - Fuente: `cols_proy['coordenadas']`

15. **Tipo_VIS_Principal** (str)
    - Tipo de VIS del proyecto
    - Fuente: Columna con 'tipo vis' en el nombre

### Columnas Opcionales (FASE 2)

16. **Score_Compuesto** (float)
    - Rango: 0.0 - 1.0
    - Fuente: `proj_ds['Score_Compuesto']` o np.nan

17. **Clasificacion_Compuesta** (str)
    - Valores: 'Exitoso_Compuesto', 'Moderado_Compuesto', 'Mejorable_Compuesto', 'N/A'
    - Fuente: `proj_ds['Clasificacion_Compuesta']` o 'N/A'

## Mapeo a la Aplicación Flask

### proyecto_to_dict (app.py)

El diccionario que se genera debe contener:

```python
{
    'id': str,  # Índice del DataFrame
    'codigo': str,  # Codigo_Proyecto
    'nombre': str,  # Proyecto
    'clasificacion': str,  # Clasificacion (validada)
    'lat': float,  # De Coordenadas Reales (parsed)
    'lon': float,  # De Coordenadas Reales (parsed)
    'barrio': str,  # Barrio
    'zona': str,  # Zona
    'estrato': str,  # Estrato (convertido a str)
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

### Tabla HTML

Las columnas que se muestran en la tabla son:
- codigo
- nombre
- clasificacion
- barrio
- zona
- precio_promedio
- area_promedio
- velocidad_ventas
- unidades_vendidas
- unidades_disponibles
- score_exito

### Popup del Mapa

El popup muestra:
- nombre
- codigo
- clasificacion
- barrio
- zona
- estrato
- precio_formateado
- area_promedio
- velocidad_ventas
- unidades_vendidas
- unidades_disponibles
- patron_ventas
- score_exito

## Validaciones Necesarias

1. **Clasificacion**: Debe ser siempre 'Exitoso', 'Moderado', o 'Mejorable'
2. **Score_Exito**: Debe estar en el rango 0.0 - 1.0
3. **Velocidad_Ventas**: Debe ser >= 0
4. **Unidades_Vendidas**: Debe ser >= 0 y entero
5. **Unidades_Disponibles**: Debe ser >= 0 y entero
6. **Precio_Promedio**: Debe ser >= 0
7. **Area_Promedio**: Debe ser >= 0
8. **Coordenadas**: Debe poder parsearse a (lat, lon)

## Tipos de Datos Correctos

- **Strings**: Codigo_Proyecto, Proyecto, Clasificacion, Zona, Barrio, Patron_Ventas, Tipo_VIS_Principal, Coordenadas Reales
- **Floats**: Score_Exito, Precio_Promedio, Area_Promedio, Velocidad_Ventas, Score_Compuesto
- **Integers**: Estrato, Unidades_Vendidas, Unidades_Disponibles

