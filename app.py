"""
Aplicación Web Flask - Mapa Interactivo de Proyectos Inmobiliarios
Sistema moderno sin dependencia de Streamlit usando Flask + Leaflet
"""

from flask import Flask, render_template, jsonify, request, make_response
import pandas as pd
import numpy as np
from datetime import datetime
from functools import lru_cache
import io
from pathlib import Path

app = Flask(__name__)

# ------------------------------
# Configuración y constantes
# ------------------------------
COLORES_CLASIFICACION = {
    'Exitoso': '#27AE60',
    'Moderado': '#F39C12',
    'Mejorable': '#E74C3C'
}

# Variable global para almacenar características de proyectos exitosos
caracteristicas_exitosos_global = {}

# ------------------------------
# Funciones auxiliares
# ------------------------------
def parse_coordinates(coord_str):
    """Parsea una cadena de coordenadas 'lat, lon' y retorna (lat, lon) o None.
    
    Valida que las coordenadas estén en el rango de Colombia (específicamente Cali y región).
    Rangos válidos para Colombia:
    - Latitud: 4.0°N a 12.5°N (Cali está alrededor de 3.42°N)
    - Longitud: 79.0°W a 67.0°W (Cali está alrededor de 76.53°W)
    
    Para Cali específicamente:
    - Latitud: 3.0°N a 4.0°N
    - Longitud: 77.0°W a 76.0°W
    """
    if pd.isna(coord_str) or coord_str == '' or str(coord_str) == 'nan' or str(coord_str).lower() == 'none':
        return None
    
    try:
        coord_str = str(coord_str).strip()
        
        # Limpiar posibles caracteres especiales
        coord_str = coord_str.replace('(', '').replace(')', '').replace('[', '').replace(']', '')
        
        # Dividir por coma o espacio
        if ',' in coord_str:
            parts = coord_str.split(',')
        elif ' ' in coord_str:
            parts = coord_str.split()
        else:
            return None
        
        if len(parts) >= 2:
            lat_str = parts[0].strip()
            lon_str = parts[1].strip()
            
            # Convertir a float
            lat = float(lat_str)
            lon = float(lon_str)
            
            # Validar rangos para Colombia (más amplio que solo Cali)
            # Latitud Colombia: aproximadamente 4.0°N a 12.5°N, pero Cali está en 3.42°N
            # Ajustamos para incluir Cali y región: 3.0°N a 13.0°N
            # Longitud Colombia: 79.0°W a 67.0°W, Cali está en 76.53°W
            # Ajustamos para incluir Cali: 80.0°W a 65.0°W
            
            if 3.0 <= lat <= 13.0 and -80.0 <= lon <= -65.0:
                # Validación adicional: coordenadas muy cercanas a 0,0 o fuera del rango de Colombia son inválidas
                if abs(lat) < 0.1 and abs(lon) < 0.1:
                    # Coordenadas cerca de 0,0 son probablemente inválidas
                    return None
                return (lat, lon)
            else:
                # Coordenadas fuera del rango de Colombia
                return None
                
    except (ValueError, AttributeError, IndexError) as e:
        # Si hay algún error al parsear, retornar None
        return None
    
    return None

def format_currency(value):
    """Formatea un valor numérico como moneda colombiana."""
    if pd.isna(value):
        return "N/A"
    try:
        return f"${float(value):,.0f} COP"
    except (ValueError, TypeError):
        return "N/A"

def get_color_by_clasificacion(clasificacion):
    """Retorna el color según la clasificación del proyecto.
    GARANTIZA que siempre retorne un color válido (nunca gris por defecto)."""
    # Normalizar clasificación
    if clasificacion:
        clasificacion = str(clasificacion).strip()
    
    # Si es una clasificación válida, retornar su color
    if clasificacion in COLORES_CLASIFICACION:
        return COLORES_CLASIFICACION[clasificacion]
    
    # Si no es válida, usar 'Moderado' como defecto (naranja) en lugar de gris
    return COLORES_CLASIFICACION.get('Moderado', '#F39C12')

def apply_filters(df, clasificacion, zona, barrio, tipo_vis, precio_min, precio_max, estado='Todos'):
    """Aplica filtros al DataFrame de manera eficiente."""
    if df.empty:
        return df
    
    df_filtered = df.copy()
    
    # Filtro de estado (activo/inactivo)
    if estado and estado != 'Todos':
        if 'Unidades_Disponibles' in df_filtered.columns:
            if estado == 'Activos':
                df_filtered = df_filtered[df_filtered['Unidades_Disponibles'] > 0]
            elif estado == 'Inactivos':
                df_filtered = df_filtered[df_filtered['Unidades_Disponibles'] == 0]
    
    # Filtro de clasificación
    if clasificacion and clasificacion != 'Todos' and 'Clasificacion' in df_filtered.columns:
        df_filtered = df_filtered[df_filtered['Clasificacion'] == clasificacion]
    
    # Filtro de zona
    if zona and zona != 'Todas' and 'Zona' in df_filtered.columns:
        df_filtered = df_filtered[df_filtered['Zona'] == zona]
    
    # Filtro de barrio
    if barrio and barrio != 'Todos' and 'Barrio' in df_filtered.columns:
        df_filtered = df_filtered[df_filtered['Barrio'] == barrio]
    
    # Filtro de tipo VIS
    if tipo_vis and tipo_vis != 'Todos' and 'Tipo_VIS_Principal' in df_filtered.columns:
        df_filtered = df_filtered[df_filtered['Tipo_VIS_Principal'] == tipo_vis]
    
    # Filtros de precio
    if precio_min and precio_min != '' and precio_min != 'null' and 'Precio_Promedio' in df_filtered.columns:
        try:
            precio_min_val = float(precio_min)
            precio_mask = df_filtered['Precio_Promedio'].notna() & (df_filtered['Precio_Promedio'] >= precio_min_val)
            df_filtered = df_filtered[precio_mask]
        except (ValueError, TypeError):
            pass
    
    if precio_max and precio_max != '' and precio_max != 'null' and 'Precio_Promedio' in df_filtered.columns:
        try:
            precio_max_val = float(precio_max)
            precio_mask = df_filtered['Precio_Promedio'].notna() & (df_filtered['Precio_Promedio'] <= precio_max_val)
            df_filtered = df_filtered[precio_mask]
        except (ValueError, TypeError):
            pass
    
    return df_filtered

def generar_clasificacion_en_memoria(xlsx_path=None):
    """Genera la clasificación de proyectos en memoria desde Base Proyectos.xlsx.
    
    Args:
        xlsx_path: Ruta al archivo Excel. Si es None, busca automáticamente.
    
    Returns:
        pd.DataFrame: DataFrame con los proyectos clasificados, o DataFrame vacío si hay error
    """
    try:
        # Importar las funciones del script de generación
        import generar_clasificacion as gen_clas
        
        print("=" * 70)
        print("  GENERANDO CLASIFICACIÓN DE PROYECTOS")
        print("=" * 70)
        print()
        
        # Paso 1: Cargar datos
        print("1. Cargando datos desde Base Proyectos.xlsx...")
        inm, pry = gen_clas.cargar_datos(xlsx_path)
        
        # Paso 2: Detectar llaves
        print("2. Detectando llaves de unión...")
        key_inm, key_pry = gen_clas.detectar_llaves(inm, pry)
        
        # Paso 3: Unir datos
        print("3. Uniendo datos de Inmuebles y Proyectos...")
        print("   IMPORTANTE: Todas las columnas de Proyectos se unen a Inmuebles")
        inm_join = gen_clas.unir_datos(inm, pry, key_inm, key_pry)
        
        # Verificar que todas las columnas de Proyectos estén en inm_join
        columnas_pry_originales = set(pry.columns)
        columnas_en_inm_join = set(inm_join.columns)
        columnas_faltantes = columnas_pry_originales - columnas_en_inm_join
        if columnas_faltantes:
            print(f"  ⚠ ADVERTENCIA: Faltan columnas de Proyectos en inm_join: {columnas_faltantes}")
        else:
            print(f"  ✓ Todas las columnas de Proyectos están presentes en inm_join")
        
        # Paso 4: Detectar columnas de proyectos (AHORA desde inm_join, no desde pry)
        print("4. Detectando columnas de proyectos (desde inm_join)...")
        cols_proy = gen_clas.detectar_columnas_proyectos(inm_join)
        
        # Paso 5: Agregar datos por proyecto (manteniendo TODAS las columnas de Proyectos)
        print("5. Agregando datos por proyecto...")
        print("   El dataset inm_join ya tiene todas las columnas de Proyectos")
        print("   Agregamos para tener un dataset a nivel de proyecto")
        
        # Agrupar por proyecto y tomar la primera fila (todas las filas de un proyecto tienen la misma info de proyecto)
        # También agregar features de inmuebles
        cols_inm = gen_clas.detectar_columnas_inmuebles(inm_join)
        
        # Agregar por proyecto manteniendo todas las columnas de Proyectos
        proj_ds = gen_clas.agregar_datos_por_proyecto(inm_join, cols_inm, cols_proy, key_inm, key_pry)
        
        # VALIDACIÓN CRÍTICA: Verificar que proj_ds no esté vacío después de agregar
        if proj_ds is None or proj_ds.empty:
            print("❌ ERROR CRÍTICO: proj_ds está vacío después de agregar_datos_por_proyecto")
            print(f"  inm_join tenía {len(inm_join)} filas")
            print(f"  Columnas en inm_join: {list(inm_join.columns)[:10]}...")
            return pd.DataFrame()
        
        print(f"  ✓ Dataset a nivel de proyecto: {len(proj_ds)} proyectos")
        print(f"  ✓ Columnas en proj_ds: {len(proj_ds.columns)}")
        print(f"  ✓ Primeras columnas: {list(proj_ds.columns)[:10]}")
        
        # Paso 6: Feature Engineering Avanzado (FASE 2)
        # Las funciones ahora SIEMPRE devuelven valores válidos, no necesitan try-except
        print("6. Creando features avanzados...")
        proj_ds_antes = len(proj_ds)
        proj_ds = gen_clas.crear_features_avanzados(proj_ds, cols_proy)
        if proj_ds is None or proj_ds.empty:
            print(f"❌ ERROR: proj_ds está vacío después de crear_features_avanzados")
            print(f"  Tenía {proj_ds_antes} filas antes")
            return pd.DataFrame()
        print(f"  ✓ Features avanzados procesados. DataFrame tiene {len(proj_ds)} filas (antes: {proj_ds_antes})")
        
        # Paso 7: Entrenar Modelo RandomForest (FASE 2)
        # Esta función puede devolver None si no hay datos suficientes, pero no falla
        print("7. Entrenando modelo de Machine Learning...")
        modelo_rf, importancia_features = gen_clas.entrenar_modelo_random_forest(proj_ds, cols_proy, usar_modelo=True)
        if modelo_rf is not None:
            print("  ✓ Modelo entrenado exitosamente")
        else:
            print("  ⚠ Modelo no entrenado (datos insuficientes o no disponible)")
        
        # Paso 8: Calcular Score Compuesto (FASE 2)
        # Esta función SIEMPRE devuelve valores válidos
        print("8. Calculando score compuesto...")
        proj_ds_antes = len(proj_ds)
        proj_ds = gen_clas.calcular_score_compuesto(proj_ds, cols_proy)
        if proj_ds is None or proj_ds.empty:
            print(f"❌ ERROR: proj_ds está vacío después de calcular_score_compuesto")
            print(f"  Tenía {proj_ds_antes} filas antes")
            return pd.DataFrame()
        print(f"  ✓ Score compuesto calculado. DataFrame tiene {len(proj_ds)} filas (antes: {proj_ds_antes})")
        
        # Paso 9: Clasificar proyectos (con validación y clasificación por segmentos)
        # Esta función GARANTIZA que todos los proyectos tengan clasificación válida
        print("9. Clasificando proyectos...")
        proj_ds_antes = len(proj_ds)
        print(f"  DataFrame antes de clasificar: {proj_ds_antes} filas")
        proj_ds = gen_clas.clasificar_proyectos(proj_ds, cols_proy)
        
        if proj_ds is None or proj_ds.empty:
            print(f"❌ ERROR: proj_ds está vacío después de clasificar_proyectos")
            print(f"  Tenía {proj_ds_antes} filas antes")
            return pd.DataFrame()
        
        # Verificar que TODOS los proyectos tengan clasificación válida
        if 'Clasificacion' not in proj_ds.columns:
            print("❌ ERROR: No se encontró columna 'Clasificacion' después de clasificar_proyectos")
            print(f"  Columnas disponibles: {list(proj_ds.columns)}")
            return pd.DataFrame()
        
        clasificaciones_validas = proj_ds['Clasificacion'].isin(['Exitoso', 'Moderado', 'Mejorable'])
        if not clasificaciones_validas.all():
            sin_clasificar = (~clasificaciones_validas).sum()
            print(f"  ⚠ ADVERTENCIA: {sin_clasificar} proyectos sin clasificación válida, corrigiendo...")
            proj_ds.loc[~clasificaciones_validas, 'Clasificacion'] = 'Moderado'
            if 'Score_Exito' in proj_ds.columns:
                proj_ds.loc[~clasificaciones_validas, 'Score_Exito'] = 0.5
        
        print(f"  ✓ Clasificación completada. DataFrame tiene {len(proj_ds)} filas (antes: {proj_ds_antes})")
        print(f"    - Exitosos: {(proj_ds['Clasificacion'] == 'Exitoso').sum()}")
        print(f"    - Moderados: {(proj_ds['Clasificacion'] == 'Moderado').sum()}")
        print(f"    - Mejorables: {(proj_ds['Clasificacion'] == 'Mejorable').sum()}")
        
        # Paso 10: Determinar patrón de ventas (mejorado)
        # Esta función SIEMPRE devuelve valores válidos
        print("10. Determinando patrones de ventas...")
        proj_ds = gen_clas.determinar_patron_ventas(proj_ds, cols_proy)
        print(f"  ✓ Patrones de ventas determinados. DataFrame tiene {len(proj_ds)} filas")
        
        # Paso 10.5: Analizar características de proyectos exitosos
        print("10.5. Analizando características de proyectos exitosos...")
        # Verificar que la columna "Otros" esté disponible para análisis de amenidades
        col_otros = cols_proy.get('otros')
        if col_otros:
            if col_otros in proj_ds.columns:
                print(f"  ✓ Columna 'Otros' encontrada: {col_otros}")
                # Verificar si hay datos en la columna
                otros_no_vacios = proj_ds[col_otros].notna() & (proj_ds[col_otros].astype(str).str.strip() != '')
                print(f"  ✓ Proyectos con datos en 'Otros': {otros_no_vacios.sum()} de {len(proj_ds)}")
            else:
                print(f"  ⚠ Columna 'Otros' detectada como '{col_otros}' pero no está en proj_ds")
                print(f"    Columnas disponibles en proj_ds: {[c for c in proj_ds.columns if 'otro' in c.lower()]}")
        else:
            print("  ⚠ No se detectó columna 'Otros' en cols_proy")
        
        global caracteristicas_exitosos_global
        caracteristicas_exitosos_global = gen_clas.analizar_caracteristicas_exitosos(proj_ds, cols_proy)
        if caracteristicas_exitosos_global:
            print(f"  ✓ Características analizadas: {len(caracteristicas_exitosos_global)} métricas")
            # Verificar si hay amenidades en las características
            if 'amenidades' in caracteristicas_exitosos_global:
                amenidades = caracteristicas_exitosos_global['amenidades']
                if amenidades and 'amenidades_exitosos' in amenidades:
                    num_amenidades = len(amenidades['amenidades_exitosos'])
                    print(f"  ✓ Amenidades analizadas: {num_amenidades} amenidades distintas")
                else:
                    print("  ⚠ Amenidades no encontradas en caracteristicas_exitosos_global")
            else:
                print("  ⚠ No hay sección 'amenidades' en caracteristicas_exitosos_global")
        else:
            print("  ⚠ No se pudieron analizar características de proyectos exitosos")
        
        # Paso 11: Limpiar columnas temporales del proj_ds antes de generar archivo final
        try:
            columnas_temp = ['_segmento', '_metodo_clasificacion', '_es_anomalia', '_razon_anomalia']
            columnas_a_eliminar = [col for col in columnas_temp if col in proj_ds.columns]
            # Eliminar columnas intermedias de features, pero mantener las que se usan en el resultado
            columnas_intermedias = [col for col in proj_ds.columns if col.startswith('_') and col not in ['_precio_m2_percentil_zona', '_precio_m2_percentil_estrato', '_velocidad_historica', '_porcentaje_vendido_feat']]
            columnas_a_eliminar.extend(columnas_intermedias)
            proj_ds = proj_ds.drop(columns=columnas_a_eliminar, errors='ignore')
            print(f"  ✓ Columnas temporales limpiadas. DataFrame tiene {len(proj_ds)} filas")
        except Exception as e:
            print(f"⚠ Advertencia al limpiar columnas: {str(e)}")
        
        # Paso 12: Generar DataFrame final con formato esperado
        print("11. Generando formato final...")
        print(f"  DataFrame antes de generar archivo final: {len(proj_ds)} filas, {len(proj_ds.columns)} columnas")
        
        # VALIDACIÓN CRÍTICA: Verificar que proj_ds no esté vacío antes de generar archivo final
        if proj_ds is None or proj_ds.empty:
            print("❌ ERROR CRÍTICO: proj_ds está vacío antes de generar archivo final")
            print(f"  Tipo: {type(proj_ds)}")
            if proj_ds is not None:
                print(f"  Tamaño: {len(proj_ds)}")
                print(f"  Columnas: {list(proj_ds.columns)}")
            return pd.DataFrame()
        
        print(f"  ✓ Validación: proj_ds tiene {len(proj_ds)} filas y {len(proj_ds.columns)} columnas")
        print(f"  ✓ Columnas clave esperadas:")
        print(f"    - Clasificacion: {'Clasificacion' in proj_ds.columns}")
        print(f"    - Score_Exito: {'Score_Exito' in proj_ds.columns}")
        print(f"    - cols_proy['nombre']: {cols_proy.get('nombre')} ({cols_proy.get('nombre') in proj_ds.columns if cols_proy.get('nombre') else 'N/A'})")
        print(f"    - cols_proy['codigo']: {cols_proy.get('codigo')} ({cols_proy.get('codigo') in proj_ds.columns if cols_proy.get('codigo') else 'N/A'})")
        print()
        
        try:
            resultado = gen_clas.generar_archivo_final(proj_ds, cols_proy, key_pry)
            
            if resultado is None or resultado.empty:
                print("❌ ERROR: El resultado final está vacío o es None")
                print(f"  Tipo de resultado: {type(resultado)}")
                if resultado is not None:
                    print(f"  Tamaño de resultado: {len(resultado)}")
                    print(f"  Columnas en resultado: {list(resultado.columns)}")
                print(f"  Proj_ds tenía {len(proj_ds)} filas antes de generar archivo final")
                print(f"  Columnas en proj_ds: {list(proj_ds.columns)[:20]}...")
                return pd.DataFrame()
            
            print(f"✓ Dataset final generado: {len(resultado)} proyectos")
            print(f"  Columnas en resultado: {len(resultado.columns)}")
            print(f"  Columnas: {list(resultado.columns)}")
            print()
            print("  ✓ Retornando dataset de salida del modelo sin modificaciones adicionales")
            print()
            
            return resultado
        except Exception as e:
            print(f"❌ Error al generar archivo final: {str(e)}")
            import traceback
            traceback.print_exc()
            return pd.DataFrame()
        
    except Exception as e:
        print(f"[ERROR] Error al generar clasificación: {str(e)}")
        import traceback
        traceback.print_exc()
        return pd.DataFrame()

def guardar_clasificacion_excel(df, filename='proyectos_clasificados.xlsx'):
    """Guarda la clasificación en un archivo Excel (opcional).
    
    Args:
        df: DataFrame con los proyectos clasificados
        filename: Nombre del archivo Excel a guardar
    """
    try:
        if df.empty:
            print("⚠ No hay datos para guardar")
            return False
        
        df.to_excel(filename, index=False)
        print(f"[OK] Archivo guardado: {filename}")
        return True
    except Exception as e:
        print(f"⚠ Error al guardar archivo: {str(e)}")
        return False

def load_data():
    """Carga los datos de proyectos clasificados generándolos directamente desde Base Proyectos.xlsx.
    
    La aplicación siempre genera los datos en memoria desde Base Proyectos.xlsx,
    sin depender de archivos Excel intermedios.
    """
    try:
        import os
        # Obtener el directorio del script (donde está app.py)
        script_dir = Path(__file__).parent.absolute()
        
        # Buscar el archivo en el directorio del script
        base_proyectos_path = script_dir / 'Base Proyectos.xlsx'
        
        # Si no se encuentra, intentar en el directorio actual de trabajo
        if not base_proyectos_path.exists():
            base_proyectos_path = Path('Base Proyectos.xlsx')
        
        # Si aún no se encuentra, buscar variaciones del nombre
        if not base_proyectos_path.exists():
            posibles_nombres = [
                'Base Proyectos.xlsx',
                'Base de Proyectos.xlsx',
                'BaseProyectos.xlsx',
                'base_proyectos.xlsx'
            ]
            for nombre in posibles_nombres:
                posible_path = script_dir / nombre
                if posible_path.exists():
                    base_proyectos_path = posible_path
                    break
        
        if not base_proyectos_path.exists():
            print("=" * 70)
            print("  ERROR: ARCHIVO NO ENCONTRADO")
            print("=" * 70)
            print(f"[ERROR] No se encontró el archivo 'Base Proyectos.xlsx'")
            print(f"  Directorio del script: {script_dir}")
            print(f"  Directorio actual de trabajo: {os.getcwd()}")
            print(f"  Ruta buscada: {base_proyectos_path}")
            print()
            print("  Archivos .xlsx encontrados en el directorio del script:")
            try:
                archivos_xlsx = [f for f in script_dir.glob('*.xlsx')]
                if archivos_xlsx:
                    for archivo in archivos_xlsx[:10]:
                        print(f"    - {archivo.name}")
                else:
                    print("    (ninguno encontrado)")
            except Exception as e:
                print(f"    (error al listar: {str(e)})")
            print()
            print("  Este archivo es necesario para generar la clasificación.")
            print("  Asegúrate de que el archivo 'Base Proyectos.xlsx' esté en el mismo")
            print("  directorio que app.py")
            print("=" * 70)
            return pd.DataFrame()
        
        # Generar clasificación directamente en memoria
        print("=" * 70)
        print("  CARGANDO Y GENERANDO DATOS DE PROYECTOS")
        print("=" * 70)
        print(f"  Archivo encontrado: {base_proyectos_path}")
        print(f"  Ruta absoluta: {base_proyectos_path.absolute()}")
        print()
        
        # Pasar la ruta del archivo a la función de generación
        df_clasificados = generar_clasificacion_en_memoria(base_proyectos_path)
        
        if df_clasificados.empty:
            print("[ERROR] No se pudieron generar los datos de clasificación")
            print("  Revisa los mensajes anteriores para ver el error específico")
            return pd.DataFrame()
        
        print(f"[OK] Datos clasificados generados: {len(df_clasificados)} proyectos")
        
        # Normalizar nombre de columna de coordenadas
        if 'Coordenadas' in df_clasificados.columns and 'Coordenadas Reales' not in df_clasificados.columns:
            df_clasificados['Coordenadas Reales'] = df_clasificados['Coordenadas']
        
        # IMPORTANTE: NO filtrar proyectos por coordenadas - devolver TODOS los proyectos
        # incluso si no tienen coordenadas válidas
        print(f"  Total de proyectos clasificados: {len(df_clasificados)}")
        
        # Procesar coordenadas para todos los proyectos
        if 'Coordenadas Reales' in df_clasificados.columns:
            print(f"  Procesando coordenadas de {len(df_clasificados)} proyectos...")
            df_clasificados['Coordenadas_Parsed'] = df_clasificados['Coordenadas Reales'].apply(parse_coordinates)
            
            # Separar proyectos con y sin coordenadas válidas
            mask_con_coords = df_clasificados['Coordenadas_Parsed'].notna()
            proyectos_con_coords = mask_con_coords.sum()
            
            # Asignar Lat y Lon a todos los proyectos
            df_clasificados['Lat'] = None
            df_clasificados['Lon'] = None
            
            # Solo asignar coordenadas a los que tienen coordenadas válidas
            if proyectos_con_coords > 0:
                df_clasificados.loc[mask_con_coords, 'Lat'] = df_clasificados.loc[mask_con_coords, 'Coordenadas_Parsed'].apply(lambda x: x[0] if x is not None else None)
                df_clasificados.loc[mask_con_coords, 'Lon'] = df_clasificados.loc[mask_con_coords, 'Coordenadas_Parsed'].apply(lambda x: x[1] if x is not None else None)
                print(f"  ✓ Proyectos con coordenadas válidas: {proyectos_con_coords}")
                print(f"  ⚠ Proyectos sin coordenadas válidas: {len(df_clasificados) - proyectos_con_coords}")
                
                # Validar coordenadas fuera de rango de Cali y reportarlas
                if proyectos_con_coords > 0:
                    coords_df = df_clasificados.loc[mask_con_coords, ['Lat', 'Lon', 'Proyecto']].copy()
                    # Verificar coordenadas que están fuera del rango esperado de Cali (más estricto)
                    # Cali: Lat ~3.42, Lon ~-76.53
                    # Rango razonable para Cali y área metropolitana: Lat 3.0-4.5, Lon -77.5 a -76.0
                    mask_fuera_rango_cali = (
                        (coords_df['Lat'] < 3.0) | (coords_df['Lat'] > 4.5) |
                        (coords_df['Lon'] < -77.5) | (coords_df['Lon'] > -76.0)
                    )
                    if mask_fuera_rango_cali.any():
                        proyectos_fuera_rango = mask_fuera_rango_cali.sum()
                        print(f"  ⚠ Advertencia: {proyectos_fuera_rango} proyectos tienen coordenadas fuera del rango de Cali")
                        print(f"    (Rango esperado para Cali: Lat 3.0-4.5, Lon -77.5 a -76.0)")
                        # Mostrar algunos ejemplos
                        ejemplos = coords_df[mask_fuera_rango_cali].head(5)
                        if not ejemplos.empty:
                            print(f"    Ejemplos de coordenadas fuera de rango:")
                            for idx, row in ejemplos.iterrows():
                                proj_name = row.get('Proyecto', 'N/A')
                                lat_val = row.get('Lat', 0)
                                lon_val = row.get('Lon', 0)
                                print(f"      - {proj_name}: Lat={lat_val:.4f}, Lon={lon_val:.4f}")
            else:
                print("  ⚠ Advertencia: No se encontraron proyectos con coordenadas válidas")
                print("  Todos los proyectos se mostrarán sin coordenadas en el mapa")
        else:
            print("  ⚠ Advertencia: No se encontró columna de coordenadas")
            df_clasificados['Lat'] = None
            df_clasificados['Lon'] = None
            df_clasificados['Coordenadas_Parsed'] = None
        
        # NO filtrar - devolver TODOS los proyectos
        df_with_coords = df_clasificados.copy()
        
        # Verificar columnas esenciales
        columnas_esperadas = ['Codigo_Proyecto', 'Proyecto', 'Clasificacion', 'Score_Exito', 'Zona', 'Barrio']
        columnas_faltantes = [col for col in columnas_esperadas if col not in df_with_coords.columns]
        if columnas_faltantes:
            print(f"  ⚠ ADVERTENCIA: Faltan columnas esenciales: {columnas_faltantes}")
        
        print(f"[OK] Datos procesados: {len(df_with_coords)} proyectos")
        print(f"  Columnas disponibles: {list(df_with_coords.columns)}")
        print()
        
        return df_with_coords
        
    except Exception as e:
        print("=" * 70)
        print("  ERROR CRÍTICO AL CARGAR DATOS")
        print("=" * 70)
        print(f"[ERROR] Error al cargar datos: {str(e)}")
        print()
        import traceback
        print("  Detalles del error:")
        traceback.print_exc()
        print("=" * 70)
        return pd.DataFrame()

def proyecto_to_dict(row):
    """Convierte una fila del DataFrame a diccionario de manera eficiente.
    GARANTIZA que la clasificación siempre sea válida (Exitoso, Moderado, o Mejorable)."""
    # Obtener clasificación y asegurar que sea válida
    clasificacion = str(row.get('Clasificacion', 'Moderado')).strip()
    
    # Validar que la clasificación sea una de las válidas
    clasificaciones_validas = ['Exitoso', 'Moderado', 'Mejorable']
    if clasificacion not in clasificaciones_validas:
        # Si no es válida, usar 'Moderado' por defecto
        clasificacion = 'Moderado'
    
    # Obtener constructor y limpiar si es necesario
    constructor = str(row.get('Constructor', 'N/A')).strip()
    if constructor == 'nan' or constructor == '' or constructor.lower() == 'none':
        constructor = 'N/A'
    
    return {
        'id': str(row.name),
        'codigo': str(row.get('Codigo_Proyecto', 'N/A')),
        'nombre': str(row.get('Proyecto', 'Proyecto Sin Nombre')),
        'clasificacion': clasificacion,  # Siempre válida
        'lat': float(row.get('Lat', 0)) if pd.notna(row.get('Lat')) else 0,
        'lon': float(row.get('Lon', 0)) if pd.notna(row.get('Lon')) else 0,
        'barrio': str(row.get('Barrio', 'N/A')),
        'zona': str(row.get('Zona', 'N/A')),
        'estrato': str(row.get('Estrato', 'N/A')) if pd.notna(row.get('Estrato')) and pd.to_numeric(row.get('Estrato', 0), errors='coerce') != 0 else 'N/A',
        'constructor': constructor,
        'precio_promedio': float(row.get('Precio_Promedio', 0)) if pd.notna(row.get('Precio_Promedio')) else 0,
        'precio_formateado': format_currency(row.get('Precio_Promedio', np.nan)),
        'area_promedio': float(row.get('Area_Promedio', 0)) if pd.notna(row.get('Area_Promedio')) else 0,
        'velocidad_ventas': float(row.get('Velocidad_Ventas', 0)) if pd.notna(row.get('Velocidad_Ventas')) else 0,
        'unidades_vendidas': int(row.get('Unidades_Vendidas', 0)) if pd.notna(row.get('Unidades_Vendidas')) else 0,
        'unidades_disponibles': int(row.get('Unidades_Disponibles', 0)) if pd.notna(row.get('Unidades_Disponibles')) else 0,
        'patron_ventas': str(row.get('Patron_Ventas', 'Sin datos')),
        'score_exito': float(row.get('Score_Exito', 0.5)) if pd.notna(row.get('Score_Exito')) else 0.5,
        'color': get_color_by_clasificacion(clasificacion)  # Usar clasificación validada
    }

# Cargar datos al inicio (una sola vez)
df_data = load_data()

# Verificar que los datos se cargaron correctamente
if df_data.empty:
    print("=" * 70)
    print("  ⚠ ADVERTENCIA CRÍTICA: EL DATASET ESTÁ VACÍO")
    print("=" * 70)
    print()
    print("  El DataFrame 'df_data' está vacío después de cargar los datos.")
    print("  Esto puede deberse a:")
    print("    1. El archivo 'Base Proyectos.xlsx' no existe o está vacío")
    print("    2. Error en la generación de clasificación")
    print("    3. Todas las filas fueron filtradas")
    print()
    print("  Revisa los mensajes anteriores para ver el error específico.")
    print()
else:
    print("=" * 70)
    print("  DATOS CARGADOS EXITOSAMENTE")
    print("=" * 70)
    print(f"  Total de proyectos: {len(df_data)}")
    print(f"  Columnas: {list(df_data.columns)}")
    print()

# Cachear opciones de filtros (se actualizan solo si los datos cambian)
@lru_cache(maxsize=1)
def get_filtros_options():
    """Obtiene opciones de filtros de manera cacheada."""
    # Validar que df_data no esté vacío
    if df_data.empty:
        return {
            'clasificaciones': [],
            'zonas': [],
            'barrios': [],
            'tipos_vis': [],
            'precio_min': 0,
            'precio_max': 0
        }
    
    # Verificar que las columnas necesarias existan
    try:
        clasificaciones = sorted(df_data['Clasificacion'].unique().tolist()) if 'Clasificacion' in df_data.columns else []
        zonas = sorted([z for z in df_data['Zona'].dropna().unique() if z != '' and z != 'N/A']) if 'Zona' in df_data.columns else []
        barrios = sorted([b for b in df_data['Barrio'].dropna().unique() if b != '' and b != 'N/A']) if 'Barrio' in df_data.columns else []
        tipos_vis = sorted([v for v in df_data['Tipo_VIS_Principal'].dropna().unique() if v != '' and v != 'N/A']) if 'Tipo_VIS_Principal' in df_data.columns else []
        
        precios_validos = df_data['Precio_Promedio'].dropna() if 'Precio_Promedio' in df_data.columns else pd.Series([], dtype=float)
        precio_min = float(precios_validos.min()) if len(precios_validos) > 0 else 0
        precio_max = float(precios_validos.max()) if len(precios_validos) > 0 else 0
        
        return {
            'clasificaciones': clasificaciones,
            'zonas': zonas,
            'barrios': barrios,
            'tipos_vis': tipos_vis,
            'precio_min': precio_min,
            'precio_max': precio_max
        }
    except Exception as e:
        print(f"⚠ Error al obtener opciones de filtros: {str(e)}")
        return {
            'clasificaciones': [],
            'zonas': [],
            'barrios': [],
            'tipos_vis': [],
            'precio_min': 0,
            'precio_max': 0
        }


# ------------------------------
# Rutas
# ------------------------------
@app.route('/')
def index():
    """Página principal."""
    return render_template('index.html')

@app.route('/api/diagnostico')
def diagnostico():
    """API de diagnóstico para verificar el estado de los datos."""
    import os
    from pathlib import Path
    
    script_dir = Path(__file__).parent.absolute()
    base_proyectos_path = script_dir / 'Base Proyectos.xlsx'
    
    diagnostico_info = {
        'df_data_vacio': df_data.empty,
        'df_data_tamano': len(df_data) if not df_data.empty else 0,
        'archivo_existe': base_proyectos_path.exists(),
        'archivo_ruta': str(base_proyectos_path.absolute()),
        'directorio_script': str(script_dir),
        'directorio_trabajo': str(os.getcwd()),
        'archivo_tamano': base_proyectos_path.stat().st_size if base_proyectos_path.exists() else 0,
        'columnas_df': list(df_data.columns) if not df_data.empty else []
    }
    
    # Verificar si hay archivos .xlsx en el directorio
    try:
        archivos_xlsx = [f.name for f in script_dir.glob('*.xlsx')]
        diagnostico_info['archivos_xlsx_encontrados'] = archivos_xlsx
    except Exception as e:
        diagnostico_info['archivos_xlsx_encontrados'] = f'Error: {str(e)}'
    
    return jsonify(diagnostico_info)

@app.route('/api/proyectos')
def get_proyectos():
    """API para obtener proyectos con filtros."""
    try:
        # Validar que df_data no esté vacío
        if df_data.empty:
            print("⚠ ADVERTENCIA: Intentando obtener proyectos pero df_data está vacío")
            print("  Esto puede deberse a:")
            print("    1. El archivo 'Base Proyectos.xlsx' no existe o no se encontró")
            print("    2. Error en la generación de clasificación (revisa los logs anteriores)")
            print("    3. El archivo está vacío o no tiene datos válidos")
            print("    4. Error durante el procesamiento de datos")
            return jsonify({
                'success': False,
                'error': 'No hay datos disponibles. Verifica que el archivo Base Proyectos.xlsx exista y contenga datos. Revisa la consola del servidor para más detalles.',
                'proyectos': [],
                'total': 0
            }), 200  # Retornar 200 para que el frontend pueda mostrar el error
        
        # Obtener filtros de la query string
        clasificacion = request.args.get('clasificacion', 'Todos')
        zona = request.args.get('zona', 'Todas')
        barrio = request.args.get('barrio', 'Todos')
        tipo_vis = request.args.get('tipo_vis', 'Todos')
        precio_min = request.args.get('precio_min', None)
        precio_max = request.args.get('precio_max', None)
        estado = request.args.get('estado', 'Todos')
        
        # Aplicar filtros
        df_filtered = apply_filters(df_data, clasificacion, zona, barrio, tipo_vis, precio_min, precio_max, estado)
        
        # Convertir a JSON de manera eficiente
        proyectos = [proyecto_to_dict(row) for _, row in df_filtered.iterrows()]
        
        return jsonify({
            'success': True,
            'proyectos': proyectos,
            'total': len(proyectos)
        })
    except Exception as e:
        print(f"❌ Error en /api/proyectos: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e),
            'proyectos': [],
            'total': 0
        }), 500

@app.route('/api/filtros')
def get_filtros():
    """API para obtener opciones de filtros."""
    try:
        # Validar que df_data no esté vacío
        if df_data.empty:
            print("⚠ ADVERTENCIA: Intentando obtener filtros pero df_data está vacío")
            return jsonify({
                'success': False,
                'error': 'No hay datos disponibles. Verifica que el archivo Base Proyectos.xlsx exista y contenga datos.',
                'clasificaciones': [],
                'zonas': [],
                'barrios': [],
                'tipos_vis': [],
                'precio_min': 0,
                'precio_max': 0
            }), 200  # Retornar 200 para que el frontend pueda mostrar el error
        
        options = get_filtros_options()
        return jsonify({
            'success': True,
            **options
        })
    except Exception as e:
        print(f"❌ Error en /api/filtros: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e),
            'clasificaciones': [],
            'zonas': [],
            'barrios': [],
            'tipos_vis': [],
            'precio_min': 0,
            'precio_max': 0
        }), 500

@app.route('/api/estadisticas')
def get_estadisticas():
    """API para obtener estadísticas de los proyectos filtrados."""
    try:
        # Obtener filtros
        clasificacion = request.args.get('clasificacion', 'Todos')
        zona = request.args.get('zona', 'Todas')
        barrio = request.args.get('barrio', 'Todos')
        tipo_vis = request.args.get('tipo_vis', 'Todos')
        precio_min = request.args.get('precio_min', None)
        precio_max = request.args.get('precio_max', None)
        estado = request.args.get('estado', 'Todos')
        
        # Aplicar filtros usando función helper
        df_filtered = apply_filters(df_data, clasificacion, zona, barrio, tipo_vis, precio_min, precio_max, estado)
        
        # Validar que df_data no esté vacío
        if df_data.empty:
            return jsonify({
                'success': True,
                'total': 0,
                'exitosos': 0,
                'moderados': 0,
                'mejorables': 0,
                'score_promedio': 0.0
            })
        
        # Calcular estadísticas
        total = len(df_filtered)
        if 'Clasificacion' in df_filtered.columns:
            exitosos = len(df_filtered[df_filtered['Clasificacion'] == 'Exitoso']) if total > 0 else 0
            moderados = len(df_filtered[df_filtered['Clasificacion'] == 'Moderado']) if total > 0 else 0
            mejorables = len(df_filtered[df_filtered['Clasificacion'] == 'Mejorable']) if total > 0 else 0
        else:
            exitosos = moderados = mejorables = 0
        
        avg_score = float(df_filtered['Score_Exito'].mean()) if total > 0 and 'Score_Exito' in df_filtered.columns else 0
        
        return jsonify({
            'success': True,
            'total': total,
            'exitosos': exitosos,
            'moderados': moderados,
            'mejorables': mejorables,
            'score_promedio': round(avg_score, 2)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/descargar')
def descargar_csv():
    """API para descargar datos en CSV."""
    try:
        # Obtener filtros
        clasificacion = request.args.get('clasificacion', 'Todos')
        zona = request.args.get('zona', 'Todas')
        barrio = request.args.get('barrio', 'Todos')
        tipo_vis = request.args.get('tipo_vis', 'Todos')
        precio_min = request.args.get('precio_min', None)
        precio_max = request.args.get('precio_max', None)
        estado = request.args.get('estado', 'Todos')
        
        # Aplicar filtros usando función helper
        df_filtered = apply_filters(df_data, clasificacion, zona, barrio, tipo_vis, precio_min, precio_max, estado)
        
        # Crear CSV en memoria
        output = io.StringIO()
        df_filtered.to_csv(output, index=False, encoding='utf-8-sig')
        output.seek(0)
        
        response = make_response(output.getvalue())
        response.headers['Content-Type'] = 'text/csv; charset=utf-8-sig'
        response.headers['Content-Disposition'] = f'attachment; filename=proyectos_filtrados_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
        
        return response
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/regenerar-clasificacion', methods=['POST'])
def regenerar_clasificacion():
    """API para regenerar la clasificación de proyectos desde Base Proyectos.xlsx."""
    try:
        base_proyectos_path = Path('Base Proyectos.xlsx')
        if not base_proyectos_path.exists():
            return jsonify({
                'success': False,
                'error': 'No se encontró el archivo Base Proyectos.xlsx'
            }), 400
        
        # Regenerar la clasificación en memoria
        global df_data
        df_data = load_data()
        
        if df_data.empty:
            return jsonify({
                'success': False,
                'error': 'No se pudo generar la clasificación'
            }), 500
        
        return jsonify({
            'success': True,
            'message': 'Clasificación regenerada exitosamente',
            'total_proyectos': len(df_data)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/caracteristicas-exitosos')
def get_caracteristicas_exitosos():
    """API para obtener las características comunes de proyectos exitosos."""
    try:
        global caracteristicas_exitosos_global
        
        if not caracteristicas_exitosos_global:
            return jsonify({
                'success': False,
                'error': 'No hay características de proyectos exitosos disponibles. Regenera la clasificación.'
            }), 404
        
        return jsonify({
            'success': True,
            'caracteristicas': caracteristicas_exitosos_global
        })
    except Exception as e:
        print(f"❌ Error en /api/caracteristicas-exitosos: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def calcular_ranking_constructores(df, estado_filtro='Todos'):
    """Calcula el ranking de constructores con estadísticas de proyectos.
    
    Args:
        df: DataFrame con proyectos
        estado_filtro: 'Todos', 'Activos', 'Inactivos'
    
    Returns:
        Lista de diccionarios con información de constructores ordenados por score promedio
    """
    try:
        if df.empty:
            return []
        
        # Buscar columna de constructor
        col_constructor = None
        # Primero buscar 'Constructor' exacto
        if 'Constructor' in df.columns:
            col_constructor = 'Constructor'
        else:
            # Buscar cualquier columna que contenga 'constructor' o 'constructora'
            for col in df.columns:
                if 'constructor' in col.lower() or 'constructora' in col.lower():
                    col_constructor = col
                    break
        
        if not col_constructor:
            print("⚠ No se encontró columna de constructor en el dataset")
            return []
        
        # Filtrar por estado (activo/inactivo)
        df_filtrado = df.copy()
        if estado_filtro == 'Activos':
            # Proyectos activos: tienen unidades disponibles > 0
            if 'Unidades_Disponibles' in df_filtrado.columns:
                df_filtrado = df_filtrado[df_filtrado['Unidades_Disponibles'] > 0]
        elif estado_filtro == 'Inactivos':
            # Proyectos inactivos: unidades disponibles = 0 o no tienen disponibilidad
            if 'Unidades_Disponibles' in df_filtrado.columns:
                df_filtrado = df_filtrado[df_filtrado['Unidades_Disponibles'] == 0]
        
        # Agrupar por constructor
        constructores_stats = []
        
        for constructor, grupo in df_filtrado.groupby(col_constructor):
            if pd.isna(constructor) or str(constructor).strip() == '' or str(constructor).lower() == 'nan':
                continue
            
            # Limpiar nombre del constructor
            constructor_nombre = str(constructor).strip()
            
            # Eliminar ".0" si es un número flotante convertido a string
            if constructor_nombre.endswith('.0') and constructor_nombre.replace('.0', '').replace('-', '').isdigit():
                constructor_nombre = constructor_nombre.rstrip('.0')
            
            # Si es un número puro (sin decimales), es probable que sea un código
            # En este caso, buscar en el dataset enriquecido si hay otra columna con nombres
            if constructor_nombre.replace('-', '').isdigit():
                # Es un número/código, buscar columnas alternativas que puedan tener el nombre
                primer_proyecto = grupo.iloc[0]
                
                # Buscar columnas que contengan "constructor" o "constructora" pero no sean la misma
                for col in df_filtrado.columns:
                    if col != col_constructor and ('constructor' in col.lower() or 'constructora' in col.lower()):
                        valor = primer_proyecto.get(col)
                        if pd.notna(valor):
                            valor_str = str(valor).strip()
                            # Si el valor no es numérico, usarlo como nombre
                            if valor_str and not valor_str.replace('.', '').replace('-', '').isdigit():
                                constructor_nombre = valor_str
                                break
                
                # Si aún es un número después de buscar, formatearlo como "Constructor #XXXX"
                if constructor_nombre.replace('-', '').isdigit():
                    # Mantener el número pero formateado mejor
                    constructor_nombre = f"Constructor #{constructor_nombre}"
            
            total_proyectos = len(grupo)
            
            # Contar por clasificación
            exitosos = len(grupo[grupo['Clasificacion'] == 'Exitoso'])
            moderados = len(grupo[grupo['Clasificacion'] == 'Moderado'])
            mejorables = len(grupo[grupo['Clasificacion'] == 'Mejorable'])
            
            # Calcular score promedio
            score_promedio = float(grupo['Score_Exito'].mean()) if 'Score_Exito' in grupo.columns else 0.5
            
            # Calcular porcentaje de exitosos
            porcentaje_exitosos = (exitosos / total_proyectos * 100) if total_proyectos > 0 else 0
            
            # Calcular score compuesto para ranking (ponderado: 60% score promedio, 40% % exitosos)
            score_ranking = (score_promedio * 0.6) + (porcentaje_exitosos / 100 * 0.4)
            
            constructores_stats.append({
                'constructor': constructor_nombre,
                'total_proyectos': total_proyectos,
                'exitosos': exitosos,
                'moderados': moderados,
                'mejorables': mejorables,
                'score_promedio': round(score_promedio, 3),
                'porcentaje_exitosos': round(porcentaje_exitosos, 1),
                'score_ranking': round(score_ranking, 3)
            })
        
        # Ordenar por score_ranking (descendente) y tomar top 10
        constructores_stats.sort(key=lambda x: x['score_ranking'], reverse=True)
        
        return constructores_stats[:10]
        
    except Exception as e:
        print(f"⚠ Error al calcular ranking de constructores: {str(e)}")
        import traceback
        traceback.print_exc()
        return []

@app.route('/api/ranking-constructores')
def get_ranking_constructores():
    """API para obtener el ranking de constructores."""
    try:
        if df_data.empty:
            return jsonify({
                'success': False,
                'error': 'No hay datos disponibles. Verifica que el archivo Base Proyectos.xlsx exista y contenga datos. Revisa la consola del servidor para más detalles.',
                'ranking': []
            }), 200
        
        # Obtener filtro de estado
        estado_filtro = request.args.get('estado', 'Todos')
        
        # Calcular ranking
        ranking = calcular_ranking_constructores(df_data, estado_filtro)
        
        return jsonify({
            'success': True,
            'ranking': ranking,
            'estado_filtro': estado_filtro
        })
    except Exception as e:
        print(f"❌ Error en /api/ranking-constructores: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/guardar-clasificacion', methods=['POST'])
def guardar_clasificacion():
    """API para guardar la clasificación actual en un archivo Excel (opcional)."""
    try:
        filename = request.json.get('filename', 'proyectos_clasificados.xlsx') if request.json else 'proyectos_clasificados.xlsx'
        
        if guardar_clasificacion_excel(df_data, filename):
            return jsonify({
                'success': True,
                'message': f'Clasificación guardada en {filename}',
                'filename': filename
            })
        else:
            return jsonify({
                'success': False,
                'error': 'No se pudo guardar el archivo'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    import webbrowser
    import threading
    import time
    
    print("=" * 70)
    print(" " * 15 + "Aplicación Flask - Mapa de Proyectos")
    print("=" * 70)
    if not df_data.empty:
        print(f"[OK] Total de proyectos cargados: {len(df_data)}")
        print(f"[OK] Proyectos con coordenadas: {len(df_data)}")
        print("")
        print("  NOTA: Los datos se generan directamente desde Base Proyectos.xlsx")
        print("  No se requiere el archivo proyectos_clasificados.xlsx")
    else:
        print("")
        print("  ⚠ ADVERTENCIA: No se cargaron datos")
        print("  La aplicación puede no funcionar correctamente")
        print("  Revisa los mensajes anteriores para ver el error específico")
    print("")
    print("=" * 70)
    print("  La aplicación estará disponible en:")
    print("  → http://localhost:5000")
    print("")
    print("  Se abrirá automáticamente en tu navegador en 2 segundos...")
    print("=" * 70)
    print("")
    print("  Presiona Ctrl+C para detener el servidor")
    print("=" * 70)
    print("")
    
    # Función para abrir el navegador después de un breve retraso
    def open_browser():
        time.sleep(2)
        webbrowser.open('http://localhost:5000')
    
    # Iniciar el hilo para abrir el navegador
    browser_thread = threading.Thread(target=open_browser, daemon=True)
    browser_thread.start()
    
    try:
        app.run(debug=True, host='127.0.0.1', port=5000, use_reloader=False)
    except OSError as e:
        if "Address already in use" in str(e):
            print("")
            print("=" * 70)
            print("  ERROR: El puerto 5000 ya está en uso")
            print("")
            print("  Soluciones:")
            print("  1. Cierra otras aplicaciones que usen el puerto 5000")
            print("  2. O modifica el puerto en app.py (línea final)")
            print("=" * 70)
        else:
            print(f"Error al iniciar el servidor: {e}")
