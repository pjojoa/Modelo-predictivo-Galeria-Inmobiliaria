"""
Script para validar el dataset final generado por generar_clasificacion.py
Verifica que todas las columnas necesarias estén presentes con los tipos correctos
"""

import pandas as pd
import numpy as np

# Columnas esperadas en el dataset final
COLUMNAS_ESPERADAS = {
    # Columnas obligatorias
    'Codigo_Proyecto': str,
    'Proyecto': str,
    'Clasificacion': str,  # 'Exitoso', 'Moderado', 'Mejorable'
    'Score_Exito': (float, np.floating),
    'Zona': str,
    'Barrio': str,
    'Estrato': (float, np.floating, str, int),
    'Precio_Promedio': (float, np.floating),
    'Area_Promedio': (float, np.floating),
    'Velocidad_Ventas': (float, np.floating),
    'Unidades_Vendidas': (int, np.integer),
    'Unidades_Disponibles': (int, np.integer),
    'Patron_Ventas': str,
    'Coordenadas Reales': (str, float, type(None)),
    'Tipo_VIS_Principal': str,
    # Columnas opcionales (FASE 2)
    'Score_Compuesto': (float, np.floating, type(None)),
    'Clasificacion_Compuesta': str,
}

# Valores válidos para clasificaciones
CLASIFICACIONES_VALIDAS = ['Exitoso', 'Moderado', 'Mejorable']
PATRONES_VALIDOS = ['Acelerado', 'Constante', 'Desacelerado', 'Sin datos']

def validar_dataset(df):
    """Valida que el dataset tenga todas las columnas necesarias con tipos correctos."""
    errores = []
    advertencias = []
    
    print("=" * 70)
    print("  VALIDACIÓN DEL DATASET FINAL")
    print("=" * 70)
    print()
    
    # Verificar que el DataFrame no esté vacío
    if df.empty:
        errores.append("El DataFrame está vacío")
        return errores, advertencias
    
    print(f"Total de proyectos: {len(df)}")
    print()
    
    # Verificar columnas obligatorias
    print("Verificando columnas obligatorias...")
    for col, tipo_esperado in COLUMNAS_ESPERADAS.items():
        if col not in df.columns:
            errores.append(f"Columna faltante: '{col}'")
        else:
            # Verificar tipo de datos
            tipos_validos = tipo_esperado if isinstance(tipo_esperado, tuple) else (tipo_esperado,)
            tipo_actual = df[col].dtype
            
            # Verificar si el tipo es compatible
            tipo_compatible = False
            for tipo_valido in tipos_validos:
                if tipo_valido == str and pd.api.types.is_string_dtype(tipo_actual):
                    tipo_compatible = True
                    break
                elif tipo_valido == int and pd.api.types.is_integer_dtype(tipo_actual):
                    tipo_compatible = True
                    break
                elif tipo_valido == float and pd.api.types.is_float_dtype(tipo_actual):
                    tipo_compatible = True
                    break
                elif tipo_valido in (np.integer, np.floating) and pd.api.types.is_numeric_dtype(tipo_actual):
                    tipo_compatible = True
                    break
                elif tipo_valido == type(None):
                    tipo_compatible = True
                    break
            
            if not tipo_compatible:
                advertencias.append(f"Tipo de dato inesperado en '{col}': esperado {tipo_esperado}, obtenido {tipo_actual}")
            
            # Validaciones específicas
            if col == 'Clasificacion':
                valores_invalidos = df[~df[col].isin(CLASIFICACIONES_VALIDAS)][col].unique()
                if len(valores_invalidos) > 0:
                    errores.append(f"Clasificaciones inválidas en '{col}': {valores_invalidos}")
            
            if col == 'Patron_Ventas':
                valores_invalidos = df[~df[col].isin(PATRONES_VALIDOS)][col].unique()
                if len(valores_invalidos) > 0:
                    advertencias.append(f"Patrones inválidos en '{col}': {valores_invalidos}")
            
            if col == 'Score_Exito':
                valores_invalidos = df[(df[col] < 0) | (df[col] > 1)][col]
                if len(valores_invalidos) > 0:
                    errores.append(f"Score_Exito fuera de rango [0, 1]: {len(valores_invalidos)} valores")
            
            if col == 'Velocidad_Ventas':
                valores_negativos = df[df[col] < 0][col]
                if len(valores_negativos) > 0:
                    errores.append(f"Velocidad_Ventas negativa: {len(valores_negativos)} valores")
            
            if col in ['Unidades_Vendidas', 'Unidades_Disponibles']:
                valores_negativos = df[df[col] < 0][col]
                if len(valores_negativos) > 0:
                    errores.append(f"{col} negativa: {len(valores_negativos)} valores")
            
            if col in ['Precio_Promedio', 'Area_Promedio']:
                valores_negativos = df[df[col] < 0][col]
                if len(valores_negativos) > 0:
                    advertencias.append(f"{col} negativa: {len(valores_negativos)} valores")
    
    # Verificar que no haya proyectos sin clasificación
    if 'Clasificacion' in df.columns:
        sin_clasificar = df[~df['Clasificacion'].isin(CLASIFICACIONES_VALIDAS)]
        if len(sin_clasificar) > 0:
            errores.append(f"Proyectos sin clasificación válida: {len(sin_clasificar)}")
    
    # Mostrar resumen
    print()
    print("=" * 70)
    print("  RESULTADOS DE VALIDACIÓN")
    print("=" * 70)
    print()
    
    if errores:
        print("❌ ERRORES ENCONTRADOS:")
        for error in errores:
            print(f"  - {error}")
        print()
    else:
        print("✓ No se encontraron errores críticos")
        print()
    
    if advertencias:
        print("⚠ ADVERTENCIAS:")
        for advertencia in advertencias:
            print(f"  - {advertencia}")
        print()
    else:
        print("✓ No se encontraron advertencias")
        print()
    
    # Mostrar resumen de columnas
    print("=" * 70)
    print("  COLUMNAS EN EL DATASET")
    print("=" * 70)
    print()
    for col in df.columns:
        tipo = df[col].dtype
        nulos = df[col].isna().sum()
        print(f"  {col:30s} {str(tipo):15s} (nulos: {nulos})")
    print()
    
    # Mostrar estadísticas de clasificación
    if 'Clasificacion' in df.columns:
        print("=" * 70)
        print("  DISTRIBUCIÓN DE CLASIFICACIONES")
        print("=" * 70)
        print()
        print(df['Clasificacion'].value_counts().to_string())
        print()
    
    return errores, advertencias

if __name__ == '__main__':
    # Cargar datos desde app
    try:
        from app import df_data
        print("Cargando dataset desde app.py...")
        print()
        errores, advertencias = validar_dataset(df_data)
        
        if errores:
            print("❌ El dataset tiene errores que deben corregirse")
            exit(1)
        else:
            print("✓ El dataset es válido")
            exit(0)
    except Exception as e:
        print(f"Error al cargar dataset: {str(e)}")
        import traceback
        traceback.print_exc()
        exit(1)

