"""
Aplicación Web Flask - GeoMapval Proyectos Inmobiliarios
Sistema moderno sin dependencia de Streamlit usando Flask + Leaflet
"""

# Importar utilidades comunes (manejo de codificación)
import utils

from flask import Flask, render_template, jsonify, request, make_response, send_from_directory
import pandas as pd
import numpy as np
import io
from datetime import datetime
from pathlib import Path
import os

# Configurar Flask con rutas explícitas para archivos estáticos
app = Flask(__name__, 
            static_folder='static',
            static_url_path='/static',
            template_folder='templates')

# Configurar MIME types correctos para archivos estáticos
@app.after_request
def set_mime_types(response):
    """Configura MIME types correctos para archivos estáticos"""
    if request.path.startswith('/static/'):
        if request.path.endswith('.js'):
            response.headers['Content-Type'] = 'application/javascript; charset=utf-8'
        elif request.path.endswith('.css'):
            response.headers['Content-Type'] = 'text/css; charset=utf-8'
        elif request.path.endswith('.json'):
            response.headers['Content-Type'] = 'application/json; charset=utf-8'
    return response

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

# Variable global para almacenar el dataframe completo con todas las columnas originales
df_completo_global = None

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

def apply_filters(df, clasificacion, zona, barrio, tipo_vis, precio_min, precio_max, estado='Activos', vende=None):
    """Aplica filtros al DataFrame de manera eficiente usando máscaras booleanas."""
    if df.empty:
        return df
    
    # Crear máscara inicial (todos True)
    mask = pd.Series([True] * len(df), index=df.index)
    
    # Filtro de estado (activo/inactivo)
    if estado and estado != 'Todos' and 'Unidades_Disponibles' in df.columns:
        if estado == 'Activos':
            mask &= (df['Unidades_Disponibles'] > 0)
        elif estado == 'Inactivos':
            mask &= (df['Unidades_Disponibles'] == 0)
    
    # Filtro de clasificación
    if clasificacion and clasificacion != 'Todos' and 'Clasificacion' in df.columns:
        mask &= (df['Clasificacion'] == clasificacion)
    
    # Filtro de zona
    if zona and zona != 'Todas' and 'Zona' in df.columns:
        mask &= (df['Zona'] == zona)
    
    # Filtro de barrio
    if barrio and barrio != 'Todos' and 'Barrio' in df.columns:
        mask &= (df['Barrio'] == barrio)
    
    # Filtro de tipo VIS - buscar en múltiples variantes de nombre de columna
    if tipo_vis and tipo_vis != 'Todos':
        tipo_vis_col = None
        for col_name in ['Tipo VIS', 'Tipo_VIS', 'Tipo_VIS_Principal', 'TipoVIS']:
            if col_name in df.columns:
                tipo_vis_col = col_name
                break
        if tipo_vis_col:
            mask &= (df[tipo_vis_col] == tipo_vis)
    
    # Filtro de vendedor
    if vende and vende != 'Todos' and 'Vende' in df.columns:
        mask &= (df['Vende'] == vende)
    
    # Filtros de precio (combinados en una sola operación)
    if 'Precio_Promedio' in df.columns:
        precio_mask = df['Precio_Promedio'].notna()
        
        if precio_min and precio_min not in ('', 'null'):
            try:
                precio_min_val = float(precio_min)
                precio_mask &= (df['Precio_Promedio'] >= precio_min_val)
            except (ValueError, TypeError):
                pass
    
        if precio_max and precio_max not in ('', 'null'):
            try:
                precio_max_val = float(precio_max)
                precio_mask &= (df['Precio_Promedio'] <= precio_max_val)
            except (ValueError, TypeError):
                pass
    
        mask &= precio_mask
    
    return df[mask]

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
        
        # Paso 11: Limpiar SOLO columnas realmente temporales (opcional - comentado para preservar todas las columnas)
        # NOTA: Se preservan TODAS las columnas para permitir segmentación y visualizaciones avanzadas
        # Si necesitas limpiar columnas temporales, descomenta el siguiente bloque:
        """
        try:
            # Solo eliminar columnas de debugging/validación interna, NO las de features calculados
            columnas_temp_estrictas = ['_segmento', '_metodo_clasificacion', '_es_anomalia', '_razon_anomalia']
            columnas_a_eliminar = [col for col in columnas_temp_estrictas if col in proj_ds.columns]
            proj_ds = proj_ds.drop(columns=columnas_a_eliminar, errors='ignore')
            print(f"  ✓ Columnas temporales de debugging limpiadas. DataFrame tiene {len(proj_ds)} filas")
        except Exception as e:
            print(f"⚠ Advertencia al limpiar columnas: {str(e)}")
        """
        print(f"  ✓ Preservando TODAS las columnas para análisis avanzado. DataFrame tiene {len(proj_ds)} filas y {len(proj_ds.columns)} columnas")
        
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
            # Guardar el dataframe completo antes de generar el archivo final
            global df_completo_global
            df_completo_global = proj_ds.copy()
            print(f"  ✓ DataFrame completo guardado globalmente: {len(df_completo_global)} proyectos, {len(df_completo_global.columns)} columnas")
            
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
        clasificacion = 'Moderado'
    
    # Obtener vendedor (columna Vende) y limpiar si es necesario
    vende = str(row.get('Vende', 'N/A')).strip()
    if vende in ('nan', '', 'none', 'None'):
        vende = 'N/A'
    
    # Pre-calcular valores para evitar múltiples accesos
    precio = row.get('Precio_Promedio', 0)
    lat = row.get('Lat', 0)
    lon = row.get('Lon', 0)
    
    # Tipo VIS: buscar en múltiples variantes de nombre de columna (prioridad: "Tipo VIS" con espacio)
    tipo_vis_val = 'N/A'
    for col_name in ['Tipo VIS', 'Tipo_VIS', 'Tipo_VIS_Principal', 'TipoVIS']:
        if col_name in row.index:
            val = row.get(col_name, None)
            if pd.notna(val) and str(val).strip() not in ('', 'nan', 'None'):
                tipo_vis_val = str(val).strip()
                break
    
    return {
        'id': str(row.name),
        'codigo': str(row.get('Codigo_Proyecto', 'N/A')),
        'nombre': str(row.get('Proyecto', 'Proyecto Sin Nombre')),
        'clasificacion': clasificacion,
        'lat': float(lat) if pd.notna(lat) else 0,
        'lon': float(lon) if pd.notna(lon) else 0,
        'barrio': str(row.get('Barrio', 'N/A')),
        'zona': str(row.get('Zona', 'N/A')),
        'estrato': str(row.get('Estrato', 'N/A')) if pd.notna(row.get('Estrato')) and pd.to_numeric(row.get('Estrato', 0), errors='coerce') != 0 else 'N/A',
        'tipo_vis': tipo_vis_val,
        'vende': vende,
        'precio_promedio': float(precio) if pd.notna(precio) else 0,
        'precio_formateado': format_currency(precio),
        'area_promedio': float(row.get('Area_Promedio', 0)) if pd.notna(row.get('Area_Promedio')) else 0,
        'velocidad_ventas': float(row.get('Velocidad_Ventas', 0)) if pd.notna(row.get('Velocidad_Ventas')) else 0,
        'unidades_vendidas': int(row.get('Unidades_Vendidas', 0)) if pd.notna(row.get('Unidades_Vendidas')) else 0,
        'unidades_disponibles': int(row.get('Unidades_Disponibles', 0)) if pd.notna(row.get('Unidades_Disponibles')) else 0,
        'patron_ventas': str(row.get('Patron_Ventas', 'Sin datos')),
        'score_exito': float(row.get('Score_Exito', 0.5)) if pd.notna(row.get('Score_Exito')) else 0.5,
        'color': get_color_by_clasificacion(clasificacion)
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

# Cachear opciones de filtros (variable global para evitar recálculo)
_filtros_cache = None

def get_filtros_options():
    """Obtiene opciones de filtros de manera cacheada."""
    global _filtros_cache
    
    # Si el cache existe y los datos no han cambiado, retornar cache
    if _filtros_cache is not None:
        return _filtros_cache
    
    # Validar que df_data no esté vacío
    if df_data.empty:
        _filtros_cache = {
            'clasificaciones': [],
            'zonas': [],
            'barrios': [],
            'tipos_vis': [],
            'precio_min': 0,
            'precio_max': 0
        }
        return _filtros_cache
    
    # Verificar que las columnas necesarias existan
    try:
        # Usar operaciones vectorizadas más eficientes
        clasificaciones = sorted(df_data['Clasificacion'].dropna().unique().tolist()) if 'Clasificacion' in df_data.columns else []
        
        # Filtrar valores válidos de forma más eficiente
        if 'Zona' in df_data.columns:
            zonas = sorted(df_data['Zona'].dropna().unique())
            zonas = [z for z in zonas if z and str(z) not in ('', 'N/A', 'nan')]
        else:
            zonas = []
        
        if 'Barrio' in df_data.columns:
            barrios = sorted(df_data['Barrio'].dropna().unique())
            barrios = [b for b in barrios if b and str(b) not in ('', 'N/A', 'nan')]
        else:
            barrios = []
        
        # Buscar columna Tipo VIS en múltiples variantes
        tipo_vis_col = None
        for col_name in ['Tipo VIS', 'Tipo_VIS', 'Tipo_VIS_Principal', 'TipoVIS']:
            if col_name in df_data.columns:
                tipo_vis_col = col_name
                break
        if tipo_vis_col:
            tipos_vis = sorted(df_data[tipo_vis_col].dropna().unique())
            tipos_vis = [v for v in tipos_vis if v and str(v) not in ('', 'N/A', 'nan')]
        else:
            tipos_vis = []
        
        # Calcular precios de forma más eficiente
        if 'Precio_Promedio' in df_data.columns:
            precios_validos = df_data['Precio_Promedio'].dropna()
            precio_min = float(precios_validos.min()) if len(precios_validos) > 0 else 0
            precio_max = float(precios_validos.max()) if len(precios_validos) > 0 else 0
        else:
            precio_min = precio_max = 0
        
        _filtros_cache = {
            'clasificaciones': clasificaciones,
            'zonas': zonas,
            'barrios': barrios,
            'tipos_vis': tipos_vis,
            'precio_min': precio_min,
            'precio_max': precio_max
        }
        return _filtros_cache
    except Exception as e:
        print(f"⚠ Error al obtener opciones de filtros: {str(e)}")
        _filtros_cache = {
            'clasificaciones': [],
            'zonas': [],
            'barrios': [],
            'tipos_vis': [],
            'precio_min': 0,
            'precio_max': 0
        }
        return _filtros_cache


# ------------------------------
# Rutas
# ------------------------------
@app.route('/')
def index():
    """Página principal."""
    # Obtener token de Mapillary desde variables de entorno o usar valor por defecto
    import os
    mapillary_token = os.getenv('MAPILLARY_TOKEN', 'MLY|YOUR_TOKEN_HERE')
    return render_template('index.html', mapillary_token=mapillary_token)

@app.route('/static/<path:filename>')
def serve_static(filename):
    """Sirve archivos estáticos con MIME types correctos."""
    return send_from_directory(app.static_folder, filename)

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
        estado = request.args.get('estado', 'Activos')  # Por defecto: Activos
        vende = request.args.get('vende', None)
        
        # Aplicar filtros
        df_filtered = apply_filters(df_data, clasificacion, zona, barrio, tipo_vis, precio_min, precio_max, estado, vende)
        
        # Convertir a JSON de manera eficiente
        # Usar to_dict('records') es más rápido que iterrows para DataFrames pequeños/medianos
        if len(df_filtered) < 1000:
            proyectos = [proyecto_to_dict(row) for _, row in df_filtered.iterrows()]
        else:
            # Para datasets grandes, usar vectorización parcial
            proyectos = df_filtered.apply(proyecto_to_dict, axis=1).tolist()
        
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
        estado = request.args.get('estado', 'Activos')  # Por defecto: Activos
        
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

@app.route('/api/dataset-completo')
def get_dataset_completo():
    """API para obtener el dataset completo con TODAS las columnas (originales + calculadas).
    Útil para segmentación y visualizaciones avanzadas."""
    try:
        # Validar que df_data no esté vacío
        if df_data.empty:
            return jsonify({
                'success': False,
                'error': 'No hay datos disponibles. Verifica que el archivo Base Proyectos.xlsx exista y contenga datos.',
                'proyectos': [],
                'total': 0,
                'columnas': []
            }), 200
        
        # Obtener filtros de la query string
        clasificacion = request.args.get('clasificacion', 'Todos')
        zona = request.args.get('zona', 'Todas')
        barrio = request.args.get('barrio', 'Todos')
        tipo_vis = request.args.get('tipo_vis', 'Todos')
        precio_min = request.args.get('precio_min', None)
        precio_max = request.args.get('precio_max', None)
        estado = request.args.get('estado', 'Activos')  # Por defecto: Activos
        vende = request.args.get('vende', None)
        
        # Aplicar filtros
        df_filtered = apply_filters(df_data, clasificacion, zona, barrio, tipo_vis, precio_min, precio_max, estado, vende)
        
        # Convertir TODAS las columnas a JSON
        # Usar to_dict('records') para preservar todas las columnas
        proyectos = df_filtered.to_dict('records')
        
        # Convertir NaN, None, y otros valores problemáticos a None para JSON
        for proyecto in proyectos:
            for key, value in proyecto.items():
                if pd.isna(value):
                    proyecto[key] = None
                elif isinstance(value, pd.Timestamp):
                    proyecto[key] = str(value)
                elif isinstance(value, (np.integer, np.floating)):
                    if isinstance(value, np.integer):
                        proyecto[key] = int(value)
                    elif isinstance(value, np.floating):
                        proyecto[key] = None if np.isnan(value) else float(value)
                    else:
                        proyecto[key] = value.item() if hasattr(value, 'item') else value
        
        return jsonify({
            'success': True,
            'proyectos': proyectos,
            'total': len(proyectos),
            'columnas': list(df_filtered.columns),
            'total_columnas': len(df_filtered.columns)
        })
    except Exception as e:
        print(f"❌ Error en /api/dataset-completo: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e),
            'proyectos': [],
            'total': 0,
            'columnas': []
        }), 500

@app.route('/api/descargar')
def descargar_csv():
    """API para descargar datos en CSV con TODAS las columnas."""
    try:
        # Validar que df_data no esté vacío
        if df_data.empty:
            print("⚠ ADVERTENCIA: Intentando descargar CSV pero df_data está vacío")
            return jsonify({
                'success': False,
                'error': 'No hay datos disponibles para descargar. Verifica que el archivo Base Proyectos.xlsx exista y contenga datos.'
            }), 400
        
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
        
        # Validar que haya datos después de filtrar
        if df_filtered.empty:
            return jsonify({
                'success': False,
                'error': 'No hay datos que coincidan con los filtros seleccionados.'
            }), 400
        
        # Crear CSV en memoria con TODAS las columnas
        # Usar StringIO para texto
        output = io.StringIO()
        
        # Convertir DataFrame a CSV (sin encoding, pandas devuelve string)
        df_filtered.to_csv(output, index=False)
        output.seek(0)
        csv_content = output.getvalue()
        
        # Convertir a bytes con UTF-8 BOM para Excel (utf-8-sig agrega BOM automáticamente)
        csv_bytes = csv_content.encode('utf-8-sig')
        
        response = make_response(csv_bytes)
        response.headers['Content-Type'] = 'text/csv; charset=utf-8-sig'
        response.headers['Content-Disposition'] = f'attachment; filename=proyectos_filtrados_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
        
        print(f"✓ CSV generado: {len(df_filtered)} proyectos, {len(df_filtered.columns)} columnas")
        return response
    except Exception as e:
        print(f"❌ Error en /api/descargar: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Error al generar CSV: {str(e)}'
        }), 500

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
        global df_data, _filtros_cache
        df_data = load_data()
        _filtros_cache = None  # Invalidar cache de filtros
        
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
    """
    Obtiene las características más comunes de proyectos exitosos.
    Ahora también incluye las características con mayor correlación del mapa de calor.
    """
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

@app.route('/api/correlaciones-exito', methods=['GET'])
def get_correlaciones_exito():
    """API para calcular correlaciones entre variables originales y éxito del proyecto.
    
    Analiza todas las variables numéricas del dataframe original y calcula su correlación
    con la clasificación de éxito (transformada a numérica: Exitoso=1, Moderado=0.5, Mejorable=0).
    Retorna una matriz de correlaciones para visualización en mapa de calor.
    """
    try:
        global df_completo_global
        
        print(f"[DEBUG] df_completo_global es None: {df_completo_global is None}")
        if df_completo_global is not None:
            print(f"[DEBUG] df_completo_global está vacío: {df_completo_global.empty}")
            print(f"[DEBUG] df_completo_global tiene {len(df_completo_global)} filas y {len(df_completo_global.columns)} columnas")
        
        if df_completo_global is None or df_completo_global.empty:
            print("[ERROR] df_completo_global no está disponible o está vacío")
            return jsonify({
                'success': False,
                'error': 'No hay datos completos disponibles. Regenera la clasificación.',
                'debug': {
                    'is_none': df_completo_global is None,
                    'is_empty': df_completo_global.empty if df_completo_global is not None else True
                }
            }), 404
        
        print("=" * 70)
        print("  CALCULANDO CORRELACIONES CON ÉXITO DEL PROYECTO")
        print("=" * 70)
        
        # Crear copia del dataframe para trabajar
        df = df_completo_global.copy()
        
        # Transformar clasificación a numérica
        # Exitoso = 1.0, Moderado = 0.5, Mejorable = 0.0
        clasificacion_map = {
            'Exitoso': 1.0,
            'Moderado': 0.5,
            'Mejorable': 0.0
        }
        
        if 'Clasificacion' not in df.columns:
            return jsonify({
                'success': False,
                'error': 'No se encontró la columna Clasificacion en los datos.'
            }), 404
        
        df['_Exito_Numerico'] = df['Clasificacion'].map(clasificacion_map).fillna(0.5)
        
        # Seleccionar solo columnas numéricas (excluyendo identificadores y coordenadas)
        columnas_excluidas = {
            'Codigo_Proyecto', 'Proyecto', 'Clasificacion', 'Clasificacion_Compuesta',
            'Coordenadas Reales', 'Coordenadas', 'Lat', 'Lon', 'Coordenadas_Parsed',
            'Zona', 'Barrio', 'Tipo_VIS_Principal', 'Tipo VIS', 'Tipo_VIS',
            'Patron_Ventas', 'Vende', 'Estado Etapas', 'Estado_Etapas',
            '_Exito_Numerico'  # Temporal, se agregará después
        }
        
        # Obtener columnas numéricas
        columnas_numericas = []
        for col in df.columns:
            if col in columnas_excluidas:
                continue
            
            # Intentar convertir a numérico
            try:
                serie_numerica = pd.to_numeric(df[col], errors='coerce')
                # Verificar que al menos el 50% de los valores sean numéricos válidos
                valores_validos = serie_numerica.notna().sum()
                if valores_validos >= len(df) * 0.5:
                    # Verificar que los valores convertidos sean realmente numéricos (no NaN)
                    # y que no haya demasiados valores únicos que sugieran que es categórico
                    valores_unicos = serie_numerica.dropna().nunique()
                    # Si tiene más de 100 valores únicos o menos del 10% de valores válidos, probablemente no es útil
                    if valores_unicos <= 100 or valores_validos >= len(df) * 0.1:
                        # Verificar que los valores sean realmente numéricos (no strings que se convirtieron a NaN)
                        # Comparar con la serie original para detectar strings que no se pudieron convertir
                        valores_originales = df[col].dropna()
                        if len(valores_originales) > 0:
                            # Si más del 80% de los valores originales se convirtieron exitosamente, es numérico
                            ratio_conversion = valores_validos / len(valores_originales)
                            if ratio_conversion >= 0.8:
                                columnas_numericas.append(col)
            except Exception as e:
                # Si hay error al procesar, omitir la columna
                print(f"  [ADV] Omitiendo columna '{col}' por error: {str(e)[:50]}")
                continue
        
        print(f"  ✓ Encontradas {len(columnas_numericas)} columnas numéricas")
        
        # Lista de variables categóricas específicas que el usuario quiere analizar
        # Estas son características de proyectos que queremos incluir en el análisis
        # IMPORTANTE: Estas son las ÚNICAS variables que queremos mostrar en el heatmap
        variables_categoricas_importantes = [
            'Coc. Integral', 'Extractor', 'Estufa Gas / Eléc.', 'Horno Gas / Eléc.',
            'Cal. Gas / Eléc.', 'Chimeneas', 'Tinas', 'Pta Duchas', 'Depósito',
            'Portería', 'Salón Social', 'Parque Inf.', 'Canchas', 'Gimnasio',
            'Planta Eléct.', 'Ofrece Piscina', 'Shut Basuras', 'Zonas Humedas',
            'BBQ', 'Zona Mascotas', 'Parqueaderos', 'Inst. Lavad. / Secadora',
            'Lavad.', 'Aire Acond.', 'Mueble Cocina', 'Mesón Cocina', 'Mesón Baños',
            'Piso Halles Com.', 'Piso Halles Viv.', 'Piso Alcoba', 'Piso Zona Social',
            'Piso Baño', 'Piso Cocina', 'Muros Coc.', 'Muros Baños', 'Mueble Lavamanos',
            'Tipo De Sanitario Alcoba Princ.', 'Pared Ducha', 'Tipo Griferia Lav.',
            'Tipo Griferia Ducha', 'Tipo de Sanitario Otros Baños', 'Tipo de Lavamanos',
            'Tipo Ducha', 'Tipo Griferia Lavaplatos', 'Muros Interiores',
            'Carpinteria Puertas/Closets', 'Fachada', 'Vent.', 'Tipo Est.',
            'Tipo Urbanizacion', 'Cómo se Entrega', 'Otro'
        ]
        
        print(f"  ✓ Buscando {len(variables_categoricas_importantes)} variables categóricas específicas")
        
        # Convertir variables categóricas a numéricas usando diferentes métodos según el tipo
        # Aplicar: One-hot para binarias, Frequency encoding para multi-categoría, etc.
        columnas_categoricas_numericas = []
        df_corr_categoricas = pd.DataFrame()
        
        for col in variables_categoricas_importantes:
            if col not in df.columns:
                continue
                
            serie_categorica = df[col].astype(str).str.strip()
            
            # Detectar valores nulos o vacíos
            valores_validos = serie_categorica[serie_categorica.notna() & (serie_categorica != '') & (serie_categorica != 'nan')]
            
            if len(valores_validos) < len(df) * 0.03:
                # Si hay muy pocos valores válidos, omitir esta columna
                continue
            
            valores_unicos = valores_validos.unique()
            num_valores_unicos = len(valores_unicos)
            
            # Detectar si es variable binaria (Si/No, Sí/No, etc.)
            valores_positivos = ['Si', 'Sí', 'Incluido', 'Yes', '1', 'True', 'true', 'SI', 'SÍ', 'Incluido', 'Sí']
            valores_binarios = [v for v in valores_unicos if str(v).strip() in valores_positivos or str(v).strip().lower() in [vp.lower() for vp in valores_positivos]]
            
            # MÉTODO 1: Codificación binaria (0/1) para variables binarias simples
            if len(valores_binarios) > 0 and num_valores_unicos <= 3:
                serie_numerica = serie_categorica.apply(
                    lambda x: 1 if str(x).strip() in valores_positivos or str(x).strip().lower() in [v.lower() for v in valores_positivos] else 0
                )
                
                suma_ones = serie_numerica.sum()
                suma_zeros = len(serie_numerica) - suma_ones
                
                # Incluir si tiene al menos 1% de cada valor (muy permisivo)
                if suma_ones >= len(df) * 0.01 and suma_zeros >= len(df) * 0.01:
                    nombre_col_nueva = f"{col}_num"
                    df_corr_categoricas[nombre_col_nueva] = serie_numerica
                    columnas_categoricas_numericas.append(nombre_col_nueva)
                    print(f"  ✓ [BINARIA] {col} -> {nombre_col_nueva} (1s: {suma_ones}, 0s: {suma_zeros})")
                else:
                    print(f"  ⚠ [BINARIA] {col} omitida: muy desbalanceada (1s: {suma_ones}, 0s: {suma_zeros})")
            
            # MÉTODO 2: Frequency/Count Encoding para variables con múltiples categorías
            # Reemplazar cada categoría por su frecuencia en el dataset
            elif num_valores_unicos > 1 and num_valores_unicos <= 50:
                # Calcular frecuencia de cada categoría
                frecuencias = valores_validos.value_counts()
                # Normalizar por el total para obtener proporción (0-1)
                frecuencias_norm = frecuencias / len(valores_validos)
                
                # Mapear cada valor a su frecuencia normalizada
                serie_numerica = serie_categorica.map(frecuencias_norm)
                # Reemplazar NaN (valores no vistos) con 0
                serie_numerica = serie_numerica.fillna(0)
                
                # Verificar variación
                if serie_numerica.var() > 0.001:
                    nombre_col_nueva = f"{col}_num"
                    df_corr_categoricas[nombre_col_nueva] = serie_numerica
                    columnas_categoricas_numericas.append(nombre_col_nueva)
                    print(f"  ✓ [FREQUENCY] {col} -> {nombre_col_nueva} ({num_valores_unicos} categorías, varianza: {serie_numerica.var():.4f})")
                else:
                    print(f"  ⚠ [FREQUENCY] {col} omitida: poca variación (varianza: {serie_numerica.var():.4f})")
            
            # MÉTODO 3: One-Hot Encoding simplificado (presencia/ausencia) para alta cardinalidad
            # En lugar de crear múltiples columnas, usar una sola columna de presencia
            elif num_valores_unicos > 50:
                # Codificación de presencia: 1 si tiene valor, 0 si no
                serie_numerica = serie_categorica.apply(
                    lambda x: 1 if str(x).strip() not in ['', 'nan', 'None', 'NaN'] and pd.notna(x) else 0
                )
                
                if serie_numerica.sum() >= len(df) * 0.01:
                    nombre_col_nueva = f"{col}_num"
                    df_corr_categoricas[nombre_col_nueva] = serie_numerica
                    columnas_categoricas_numericas.append(nombre_col_nueva)
                    print(f"  ✓ [PRESENCIA] {col} -> {nombre_col_nueva} ({num_valores_unicos} categorías, presencia: {serie_numerica.sum()})")
                else:
                    print(f"  ⚠ [PRESENCIA] {col} omitida: muy pocos valores válidos")
            
            # MÉTODO 4: Label Encoding para variables con pocas categorías (2-10)
            # Asignar números enteros a cada categoría
            else:
                # Crear mapeo de categorías a enteros
                categorias_ordenadas = sorted([v for v in valores_unicos if str(v).strip() not in ['', 'nan', 'None', 'NaN']])
                label_map = {cat: idx for idx, cat in enumerate(categorias_ordenadas)}
                
                serie_numerica = serie_categorica.map(label_map)
                serie_numerica = serie_numerica.fillna(-1)  # Valores no vistos = -1
                
                # Verificar variación
                if serie_numerica.var() > 0.1:
                    nombre_col_nueva = f"{col}_num"
                    df_corr_categoricas[nombre_col_nueva] = serie_numerica
                    columnas_categoricas_numericas.append(nombre_col_nueva)
                    print(f"  ✓ [LABEL] {col} -> {nombre_col_nueva} ({num_valores_unicos} categorías, varianza: {serie_numerica.var():.4f})")
                else:
                    print(f"  ⚠ [LABEL] {col} omitida: poca variación (varianza: {serie_numerica.var():.4f})")
        
        print(f"  ✓ Convertidas {len(columnas_categoricas_numericas)} variables categóricas a numéricas usando diferentes métodos")
        
        # IMPORTANTE: SOLO usar las variables categóricas convertidas (NO las numéricas originales)
        # El usuario quiere ver SOLO las características categóricas en el heatmap
        if len(columnas_categoricas_numericas) == 0:
            return jsonify({
                'success': False,
                'error': 'No se encontraron variables categóricas para analizar. Verifica que las columnas existan en los datos.'
            }), 404
        
        print(f"  ✓ Usando SOLO {len(columnas_categoricas_numericas)} variables categóricas (sin variables numéricas)")
        
        # Preparar datos para correlación
        # Incluir SOLO _Exito_Numerico y las variables categóricas convertidas
        columnas_para_corr = columnas_categoricas_numericas + ['_Exito_Numerico']
        
        # Crear DataFrame SOLO con las categóricas convertidas + éxito
        df_corr = pd.DataFrame()
        df_corr['_Exito_Numerico'] = df['_Exito_Numerico']
        
        # Agregar las columnas categóricas convertidas
        for col in columnas_categoricas_numericas:
            df_corr[col] = df_corr_categoricas[col]
        
        # Las variables categóricas ya están convertidas a numéricas (0/1)
        # No necesitamos convertir nada más, solo asegurarnos de que todas estén presentes
        for col in columnas_categoricas_numericas:
            if col not in df_corr.columns and col in df_corr_categoricas.columns:
                df_corr[col] = df_corr_categoricas[col]
        
        print(f"  ✓ DataFrame de correlación creado con {len(df_corr.columns)} columnas (categóricas + éxito)")
        
        # Verificar variación en las variables antes de calcular correlaciones
        # Ser más permisivo ahora que usamos diferentes métodos de codificación
        # Las variables ya fueron filtradas durante la conversión, así que solo verificamos que no sean constantes
        columnas_con_variacion = []
        for col in columnas_categoricas_numericas:
            serie = df_corr_categoricas[col].dropna()
            if len(serie) > 0:
                varianza = serie.var()
                valores_unicos = serie.nunique()
                
                # Criterios muy permisivos según el tipo de codificación
                # Para binarias: varianza > 0.0001 (muy permisivo, permite hasta 99.9% de un valor)
                # Para frequency/label: varianza > 0.00001 (muy permisivo)
                # Solo excluir variables completamente constantes (varianza = 0)
                if varianza > 0.00001 and valores_unicos >= 1:
                    columnas_con_variacion.append(col)
                    # Solo mostrar en detalle si hay muchas variables
                    if len(columnas_categoricas_numericas) <= 20:
                        print(f"  ✓ Variable '{col}' incluida (varianza: {varianza:.6f}, valores únicos: {valores_unicos})")
                else:
                    print(f"  ⚠ Variable '{col}' omitida: sin variación (varianza: {varianza:.6f}, valores únicos: {valores_unicos})")
        
        if len(columnas_con_variacion) == 0:
            return jsonify({
                'success': False,
                'error': 'No hay variables categóricas con suficiente variación para calcular correlaciones significativas.'
            }), 404
        
        # Actualizar columnas para usar solo las que tienen variación
        columnas_categoricas_numericas = columnas_con_variacion
        columnas_para_corr = columnas_categoricas_numericas + ['_Exito_Numerico']
        
        # Recrear df_corr solo con variables con variación
        df_corr = pd.DataFrame()
        df_corr['_Exito_Numerico'] = df['_Exito_Numerico']
        for col in columnas_categoricas_numericas:
            df_corr[col] = df_corr_categoricas[col]
        
        print(f"  ✓ Usando {len(columnas_categoricas_numericas)} variables categóricas convertidas con diferentes métodos")
        
        # Eliminar filas con demasiados NaN (más del 50% de valores faltantes)
        umbral_nan = len(columnas_para_corr) * 0.5
        df_corr = df_corr.dropna(thresh=umbral_nan)
        
        if len(df_corr) < 10:
            return jsonify({
                'success': False,
                'error': 'No hay suficientes datos válidos para calcular correlaciones (mínimo 10 proyectos requeridos).'
            }), 404
        
        # Calcular matriz de correlación usando método de Pearson
        # Usar min_periods para manejar valores faltantes correctamente
        print(f"  ✓ Calculando matriz de correlación con {len(df_corr)} proyectos y {len(columnas_para_corr)} variables")
        print(f"  ✓ Valores faltantes por columna:")
        for col in columnas_para_corr:
            nulos = df_corr[col].isna().sum()
            print(f"    - {col}: {nulos} nulos de {len(df_corr)} ({100*nulos/len(df_corr):.1f}%)")
        
        # Calcular correlación con min_periods para asegurar suficiente datos
        matriz_corr = df_corr[columnas_para_corr].corr(method='pearson', min_periods=10)
        
        # Verificar que la matriz se calculó correctamente
        print(f"  ✓ Matriz de correlación calculada: {matriz_corr.shape}")
        print(f"  ✓ Rango de valores en matriz: {matriz_corr.min().min():.3f} a {matriz_corr.max().max():.3f}")
        
        # Obtener correlaciones con _Exito_Numerico
        if '_Exito_Numerico' not in matriz_corr.columns:
            return jsonify({
                'success': False,
                'error': 'No se pudo calcular la correlación con el éxito del proyecto.'
            }), 404
        
        correlaciones_exito = matriz_corr['_Exito_Numerico'].drop('_Exito_Numerico')
        
        # Mostrar algunas correlaciones para debugging
        print(f"  ✓ Correlaciones con éxito (primeras 10):")
        for var, corr in correlaciones_exito.head(10).items():
            print(f"    - {var}: {corr:.3f}")
        
        # Ordenar por valor absoluto de correlación (mayor impacto primero)
        correlaciones_ordenadas = correlaciones_exito.abs().sort_values(ascending=False)
        
        # SOLO usar variables categóricas convertidas (las que el usuario quiere ver)
        # Filtrar para incluir SOLO las variables categóricas que convertimos
        variables_categoricas_con_corr = [v for v in correlaciones_ordenadas.index if v.endswith('_num')]
        
        # Si hay variables categóricas, usar SOLO esas
        if len(variables_categoricas_con_corr) > 0:
            # Ordenar las categóricas por su correlación absoluta
            top_variables = sorted(variables_categoricas_con_corr, 
                                 key=lambda x: abs(correlaciones_exito[x]), 
                                 reverse=True)
            # Tomar todas las categóricas (o máximo 50 si hay muchas)
            top_variables = top_variables[:50]
            print(f"  ✓ Usando SOLO variables categóricas: {len(top_variables)} variables")
        else:
            # Si no hay categóricas, usar las top numéricas (fallback)
            top_variables = correlaciones_ordenadas.head(30).index.tolist()
            print(f"  ⚠ No se encontraron variables categóricas, usando numéricas: {len(top_variables)} variables")
        
        print(f"  ✓ Variables seleccionadas para el heatmap: {len(top_variables)}")
        
        # Mostrar las primeras 10 para verificación
        print(f"  ✓ Primeras 10 variables: {top_variables[:10]}")
        
        # Crear matriz de correlación solo con las variables seleccionadas + éxito
        variables_finales = top_variables + ['_Exito_Numerico']
        matriz_corr_final = matriz_corr.loc[variables_finales, variables_finales]
        
        # Convertir a formato JSON
        # Crear estructura: {variables: [...], matriz: [[...]], correlaciones_exito: {...}}
        variables_list = [v for v in variables_finales if v != '_Exito_Numerico']
        variables_list.append('Éxito del Proyecto')  # Renombrar _Exito_Numerico
        
        # Matriz de correlación (asegurarse de que la diagonal tenga 1.0)
        matriz_data = []
        for i, var1 in enumerate(variables_finales):
            fila = []
            for j, var2 in enumerate(variables_finales):
                if i == j:
                    # Diagonal: auto-correlación siempre es 1.0
                    valor = 1.0
                else:
                    valor = matriz_corr_final.iloc[i, j]
                    # Reemplazar NaN con 0.0 (no None) para mejor visualización
                    if pd.isna(valor):
                        valor = 0.0
                fila.append(float(valor))
            matriz_data.append(fila)
        
        print(f"  ✓ Matriz de datos creada: {len(matriz_data)}x{len(matriz_data[0]) if matriz_data else 0}")
        
        # Correlaciones individuales con éxito (para mostrar en tooltip)
        correlaciones_dict = {}
        for var in top_variables:
            valor = correlaciones_exito[var]
            if pd.isna(valor):
                valor = 0.0
            correlaciones_dict[var] = float(valor)
        
        # Información adicional sobre las variables
        info_variables = {}
        for var in top_variables:
            serie = df_corr[var].dropna()
            if len(serie) > 0:
                info_variables[var] = {
                    'correlacion': float(correlaciones_exito[var]) if not pd.isna(correlaciones_exito[var]) else 0.0,
                    'promedio': float(serie.mean()) if not pd.isna(serie.mean()) else 0.0,
                    'mediana': float(serie.median()) if not pd.isna(serie.median()) else 0.0,
                    'min': float(serie.min()) if not pd.isna(serie.min()) else 0.0,
                    'max': float(serie.max()) if not pd.isna(serie.max()) else 0.0,
                    'valores_validos': int(serie.notna().sum())
                }
        
        print(f"  ✓ Matriz de correlación calculada: {len(variables_list)}x{len(variables_list)}")
        print(f"  ✓ Correlaciones más altas:")
        top_5 = correlaciones_ordenadas.head(5)
        for var, corr_abs in top_5.items():
            corr_real = correlaciones_exito[var]
            print(f"    - {var}: {corr_real:.3f}")
        print()
        
        # Identificar las características más fuertes y representativas (top 10 por valor absoluto)
        # Usar SOLO las variables categóricas convertidas (las que están en top_variables)
        correlaciones_dict_filtrado = {k: v for k, v in correlaciones_dict.items() if k in top_variables}
        
        top_caracteristicas_fuertes = sorted(
            correlaciones_dict_filtrado.items(),
            key=lambda x: abs(x[1]),
            reverse=True
        )[:30]  # Aumentado de 10 a 30 características
        
        print(f"  ✓ Top 30 características más fuertes identificadas (de {len(correlaciones_dict_filtrado)} variables categóricas):")
        for var, corr in top_caracteristicas_fuertes[:10]:  # Mostrar solo las primeras 10 en el log
            nombre_limpio = var.replace('_num', '') if var.endswith('_num') else var
            print(f"    - {nombre_limpio}: {corr:.3f}")
        
        # Calcular estadísticas de presencia en proyectos exitosos para cada característica
        # Verificar que df_completo_global existe y tiene datos
        if df_completo_global is None or len(df_completo_global) == 0:
            print("  ⚠ df_completo_global no está disponible, usando df_corr para estadísticas")
            df_para_stats = df_corr.copy()
        else:
            df_para_stats = df_completo_global.copy()
        
        # Filtrar proyectos exitosos
        if 'Clasificacion' in df_para_stats.columns:
            exitosos_completo = df_para_stats[df_para_stats['Clasificacion'] == 'Exitoso'].copy()
        elif '_Exito_Numerico' in df_para_stats.columns:
            exitosos_completo = df_para_stats[df_para_stats['_Exito_Numerico'] == 1.0].copy()
        else:
            exitosos_completo = df_para_stats.copy()
        
        total_exitosos = len(exitosos_completo)
        print(f"  ✓ Calculando estadísticas de presencia en {total_exitosos} proyectos exitosos...")
        print(f"  ✓ Columnas disponibles en df_para_stats: {len(df_para_stats.columns)} columnas")
        if len(df_para_stats.columns) > 0:
            print(f"  ✓ Primeras 10 columnas: {list(df_para_stats.columns[:10])}")
        
        top_caracteristicas_con_stats = []
        for var, corr in top_caracteristicas_fuertes:
            nombre_limpio = var.replace('_num', '') if var.endswith('_num') else var
            variable_original = nombre_limpio  # Nombre sin _num
            
            stats = {
                'porcentaje_presencia': 0.0,
                'total_proyectos': int(total_exitosos),
                'proyectos_con_caracteristica': 0,
                'proyectos_sin_caracteristica': int(total_exitosos),
                'valores_validos': 0,
                'metodo': 'sin_datos'
            }
            estadisticas_detalladas = {}
            
            # Buscar la columna original en el dataframe
            columna_original = None
            posibles_columnas = [
                variable_original,
                var,
                variable_original.replace('_', ' '),
                variable_original.replace(' ', '_')
            ]
            posibles_columnas = [col for col in posibles_columnas if col]
            
            for candidato in posibles_columnas:
                if candidato in df_para_stats.columns:
                    columna_original = candidato
                    break
            
            if columna_original is None:
                variable_limpia = variable_original.replace(' ', '').replace('_', '').lower()
                for col in df_para_stats.columns:
                    col_limpia = str(col).replace(' ', '').replace('_', '').lower()
                    if col_limpia == variable_limpia or variable_limpia in col_limpia or col_limpia in variable_limpia:
                        columna_original = col
                        break
            
            if columna_original and columna_original in df_para_stats.columns and total_exitosos > 0:
                serie_valores = exitosos_completo[columna_original]
                valores_numericos = pd.to_numeric(serie_valores, errors='coerce')
                valores_numericos_validos = valores_numericos.dropna()
                
                valores_positivos = {'si', 'sí', 'incluido', 'incluida', 'incluye', 'yes', 'true', '1', 'disponible'}
                valores_negativos = {'no', 'n/a', 'na', 'false', '0', 'ninguno', 'ninguna', 'no aplica'}
                
                presencia_conteo = 0
                
                if len(valores_numericos_validos) > 0:
                    valores_unicos = set(np.round(valores_numericos_validos.unique(), 6))
                    es_binaria_numerica = valores_unicos.issubset({0.0, 1.0}) or valores_unicos.issubset({0, 1})
                    
                    if es_binaria_numerica:
                        presencia_conteo = int((valores_numericos_validos > 0).sum())
                        stats['metodo'] = 'numerico_binario'
                    else:
                        presencia_conteo = int((valores_numericos_validos > 0).sum())
                        stats['metodo'] = 'numerico_general'
                    
                    stats['valores_validos'] = int(len(valores_numericos_validos))
                    
                    estadisticas_detalladas = {
                        'tipo': 'numerica',
                        'valores_validos': int(len(valores_numericos_validos)),
                        'promedio': float(valores_numericos_validos.mean()),
                        'mediana': float(valores_numericos_validos.median()),
                        'min': float(valores_numericos_validos.min()),
                        'max': float(valores_numericos_validos.max()),
                        'percentil_25': float(valores_numericos_validos.quantile(0.25)),
                        'percentil_75': float(valores_numericos_validos.quantile(0.75)),
                        'desviacion': float(valores_numericos_validos.std(ddof=0)) if len(valores_numericos_validos) > 1 else 0.0
                    }
                else:
                    valores_str = serie_valores.astype(str).str.strip()
                    mask_validos = (
                        serie_valores.notna() &
                        (valores_str != '') &
                        (~valores_str.str.lower().isin({'nan', 'none', 'null', 'sin dato', 'sin datos'}))
                    )
                    valores_texto = valores_str[mask_validos]
                    stats['valores_validos'] = int(len(valores_texto))
                    
                    if len(valores_texto) > 0:
                        valores_texto_lower = valores_texto.str.lower()
                        conjunto_unicos = set(valores_texto_lower.unique())
                        if conjunto_unicos.issubset(valores_positivos.union(valores_negativos)):
                            presencia_conteo = int(valores_texto_lower.isin(valores_positivos).sum())
                            stats['metodo'] = 'texto_binario'
                        else:
                            presencia_conteo = int(len(valores_texto))
                            stats['metodo'] = 'texto_general'
                            
                            conteos = valores_texto.value_counts().head(5)
                            top_valores = []
                            for valor, conteo in conteos.items():
                                top_valores.append({
                                    'valor': str(valor),
                                    'conteo': int(conteo),
                                    'porcentaje': float((conteo / total_exitosos) * 100) if total_exitosos else 0.0
                                })
                            
                            estadisticas_detalladas = {
                                'tipo': 'categorica',
                                'valores_validos': int(len(valores_texto)),
                                'valores_distintos': int(valores_texto.nunique()),
                                'top_valores': top_valores,
                                'valor_mas_frecuente': str(conteos.idxmax()) if len(conteos) > 0 else None
                            }
                
                stats['proyectos_con_caracteristica'] = int(presencia_conteo)
                stats['proyectos_sin_caracteristica'] = int(total_exitosos - presencia_conteo)
                stats['porcentaje_presencia'] = float((presencia_conteo / total_exitosos) * 100) if total_exitosos > 0 else 0.0
                
                if stats['metodo'] != 'sin_datos':
                    print(f"    ✓ {nombre_limpio} ({columna_original}): {stats['porcentaje_presencia']:.1f}% ({stats['proyectos_con_caracteristica']}/{stats['total_proyectos']}) – método: {stats['metodo']}")
                else:
                    print(f"    ⚠ {nombre_limpio} ({columna_original}): No se pudo determinar presencia (sin datos suficientes)")
            else:
                if columna_original:
                    print(f"    ⚠ {nombre_limpio}: columna '{columna_original}' no tiene datos válidos")
                else:
                    print(f"    ⚠ {nombre_limpio}: columna original no encontrada en dataframe (referencia: {variable_original})")
            
            top_caracteristicas_con_stats.append({
                'variable': nombre_limpio,
                'variable_original': var,
                'columna_original': columna_original,
                'correlacion': float(corr),
                'abs_correlacion': float(abs(corr)),
                'estadisticas_presencia': stats,
                'estadisticas_detalladas': estadisticas_detalladas
            })
        
        return jsonify({
            'success': True,
            'variables': variables_list,
            'matriz': matriz_data,
            'correlaciones_exito': correlaciones_dict,
            'info_variables': info_variables,
            'top_caracteristicas_fuertes': top_caracteristicas_con_stats,
            'total_proyectos': len(df_corr),
            'total_variables': len(variables_list)
        })
        
    except Exception as e:
        print(f"❌ Error en /api/correlaciones-exito: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def calcular_ranking_constructores(df, estado_filtro='Activos'):
    """Calcula el ranking de vendedores (columna "Vende") con estadísticas de proyectos.
    
    Args:
        df: DataFrame con proyectos
        estado_filtro: 'Todos', 'Activos', 'Inactivos'
    
    Returns:
        Lista de diccionarios con información de vendedores ordenados por score promedio
    """
    try:
        if df.empty:
            return []
        
        # Buscar columna de vendedor (Vende)
        col_vende = None
        # Primero buscar 'Vende' exacto
        if 'Vende' in df.columns:
            col_vende = 'Vende'
        else:
            # Buscar cualquier columna que contenga 'vende'
            for col in df.columns:
                if col.lower() == 'vende' or 'vende' in col.lower():
                    col_vende = col
                    break
        
        if not col_vende:
            print("⚠ No se encontró columna 'Vende' en el dataset")
            print(f"  Columnas disponibles: {list(df.columns)[:30]}...")
            return []
        
        print(f"  ✓ Usando columna '{col_vende}' para ranking de vendedores")
        
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
        
        # Agrupar por vendedor (Vende)
        vendedores_stats = []
        
        # Filtrar valores nulos antes de agrupar
        df_filtrado = df_filtrado[df_filtrado[col_vende].notna()]
        df_filtrado = df_filtrado[df_filtrado[col_vende].astype(str).str.strip() != '']
        df_filtrado = df_filtrado[~df_filtrado[col_vende].astype(str).str.lower().isin(['nan', 'none', 'n/a', ''])]
        
        if df_filtrado.empty:
            print("  ⚠ No hay vendedores válidos después de filtrar")
            return []
        
        print(f"  ✓ Proyectos con vendedor válido: {len(df_filtrado)}")
        
        for vendedor, grupo in df_filtrado.groupby(col_vende):
            if pd.isna(vendedor) or str(vendedor).strip() == '' or str(vendedor).lower() == 'nan':
                continue
            
            # Limpiar nombre del vendedor
            vendedor_nombre = str(vendedor).strip()
            
            # Eliminar ".0" si es un número flotante convertido a string
            if vendedor_nombre.endswith('.0') and vendedor_nombre.replace('.0', '').replace('-', '').isdigit():
                vendedor_nombre = vendedor_nombre.rstrip('.0')
            
            # Si es un número puro (sin decimales), es probable que sea un código
            if vendedor_nombre.replace('-', '').isdigit():
                # Si aún es un número después de buscar, formatearlo como "Vendedor #XXXX"
                vendedor_nombre = f"Vendedor #{vendedor_nombre}"
            
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
            
            vendedores_stats.append({
                'vendedor': vendedor_nombre,
                'total_proyectos': total_proyectos,
                'exitosos': exitosos,
                'moderados': moderados,
                'mejorables': mejorables,
                'score_promedio': round(score_promedio, 3),
                'porcentaje_exitosos': round(porcentaje_exitosos, 1),
                'score_ranking': round(score_ranking, 3)
            })
        
        # Ordenar por cantidad de proyectos exitosos (descendente) y tomar top 10
        # Si hay empate, usar score_ranking como desempate
        vendedores_stats.sort(key=lambda x: (x['exitosos'], x['score_ranking']), reverse=True)
        
        top_10 = vendedores_stats[:10]
        print(f"  ✓ Ranking generado: {len(top_10)} vendedores en top 10")
        if len(top_10) > 0:
            print(f"    - Mejor vendedor: {top_10[0]['vendedor']} ({top_10[0]['exitosos']} proyectos exitosos)")
        
        return top_10
        
    except Exception as e:
        print(f"⚠ Error al calcular ranking de vendedores: {str(e)}")
        import traceback
        traceback.print_exc()
        return []

@app.route('/api/ranking-constructores')
def get_ranking_constructores():
    """API para obtener el ranking de vendedores (columna Vende)."""
    try:
        if df_data.empty:
            return jsonify({
                'success': False,
                'error': 'No hay datos disponibles. Verifica que el archivo Base Proyectos.xlsx exista y contenga datos. Revisa la consola del servidor para más detalles.',
                'ranking': []
            }), 200
        
        # Obtener filtro de estado
        estado_filtro = request.args.get('estado', 'Activos')
        
        # Calcular ranking (ahora usa columna Vende)
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

def generar_contexto_proyectos(df):
    """
    Genera un contexto estructurado con información de los proyectos para el chat.
    Incluye resumen estadístico, información sobre columnas disponibles y datos de proyectos.
    """
    if df.empty:
        return "No hay datos de proyectos disponibles."
    
    context_parts = []
    
    # Inicializar variables de columnas de vendedor/constructor
    col_vende = None
    col_constructor = None
    
    # 0. Información sobre el dataset completo
    total = len(df)
    total_columnas = len(df.columns)
    context_parts.append(f"DATASET COMPLETO DE PROYECTOS:")
    context_parts.append(f"- Total de proyectos: {total}")
    context_parts.append(f"- Total de columnas disponibles: {total_columnas}")
    
    # Lista de columnas principales disponibles
    columnas_principales = [
        'Codigo_Proyecto', 'Proyecto', 'Clasificacion', 'Score_Exito', 'Score_Compuesto',
        'Zona', 'Barrio', 'Estrato', 'Precio_Promedio', 'Area_Promedio',
        'Unidades_Vendidas', 'Unidades_Disponibles', 'Velocidad_Ventas', 'Meses_Para_Agotar',
        'Patron_Ventas', 'Tipo_VIS_Principal', 'Vende', 'Constructor', 'Ciudad',
        'Coordenadas Reales', 'Lat', 'Lon'
    ]
    columnas_disponibles = [col for col in columnas_principales if col in df.columns]
    context_parts.append(f"\nCOLUMNAS PRINCIPALES DISPONIBLES ({len(columnas_disponibles)}):")
    context_parts.append(", ".join(columnas_disponibles[:15]))
    if len(columnas_disponibles) > 15:
        context_parts.append(f"... y {len(columnas_disponibles) - 15} columnas más")
    
    # Lista de TODAS las columnas disponibles (compacta)
    todas_columnas = list(df.columns)
    context_parts.append(f"\nTODAS LAS COLUMNAS DISPONIBLES ({len(todas_columnas)}):")
    # Agrupar en líneas de 5 columnas
    for i in range(0, min(len(todas_columnas), 50), 5):  # Mostrar primeras 50
        grupo = todas_columnas[i:i+5]
        context_parts.append(", ".join(grupo))
    if len(todas_columnas) > 50:
        context_parts.append(f"... y {len(todas_columnas) - 50} columnas más")
    
    # 1. Resumen estadístico general
    if 'Clasificacion' in df.columns:
        exitosos = len(df[df['Clasificacion'] == 'Exitoso'])
        moderados = len(df[df['Clasificacion'] == 'Moderado'])
        mejorables = len(df[df['Clasificacion'] == 'Mejorable'])
        context_parts.append(f"\nRESUMEN POR CLASIFICACIÓN:")
        context_parts.append(f"- Exitosos: {exitosos} ({exitosos/total*100:.1f}%)")
        context_parts.append(f"- Moderados: {moderados} ({moderados/total*100:.1f}%)")
        context_parts.append(f"- Mejorables: {mejorables} ({mejorables/total*100:.1f}%)")
    
    # 2. Información por zona
    if 'Zona' in df.columns:
        zonas = df['Zona'].value_counts()
        context_parts.append(f"\nPROYECTOS POR ZONA (Todas las zonas):")
        for zona, count in zonas.items():
            if pd.notna(zona) and str(zona).strip() not in ('', 'N/A'):
                porcentaje = (count / total) * 100
                context_parts.append(f"- {zona}: {count} proyectos ({porcentaje:.1f}%)")
    
    # 3. Estadísticas de precios
    if 'Precio_Promedio' in df.columns:
        precios_validos = df['Precio_Promedio'].dropna()
        if len(precios_validos) > 0:
            precio_min = precios_validos.min()
            precio_max = precios_validos.max()
            precio_prom = precios_validos.mean()
            precio_mediana = precios_validos.median()
            context_parts.append(f"\nESTADÍSTICAS DE PRECIOS:")
            context_parts.append(f"- Precio mínimo: ${precio_min:,.0f}")
            context_parts.append(f"- Precio máximo: ${precio_max:,.0f}")
            context_parts.append(f"- Precio promedio: ${precio_prom:,.0f}")
            context_parts.append(f"- Precio mediana: ${precio_mediana:,.0f}")
    
    # 4. Estadísticas de áreas
    if 'Area_Promedio' in df.columns:
        areas_validas = df['Area_Promedio'].dropna()
        if len(areas_validas) > 0:
            context_parts.append(f"\nESTADÍSTICAS DE ÁREAS:")
            context_parts.append(f"- Área mínima: {areas_validas.min():.1f} m²")
            context_parts.append(f"- Área máxima: {areas_validas.max():.1f} m²")
            context_parts.append(f"- Área promedio: {areas_validas.mean():.1f} m²")
    
    # 4.5. Estadísticas por Constructor/Vendedor
    # Buscar columna de vendedor/constructor (ya inicializadas arriba)
    if 'Vende' in df.columns:
        col_vende = 'Vende'
    else:
        for col in df.columns:
            if col.lower() == 'vende' or (col.lower().startswith('vende') and 'vende' in col.lower()):
                col_vende = col
                break
    
    if 'Constructor' in df.columns:
        col_constructor = 'Constructor'
    else:
        for col in df.columns:
            if 'constructor' in col.lower() or 'constructora' in col.lower():
                col_constructor = col
                break
    
    # Estadísticas por Vendedor (columna Vende)
    if col_vende and col_vende in df.columns:
        df_vende = df[df[col_vende].notna()].copy()
        df_vende = df_vende[df_vende[col_vende].astype(str).str.strip() != '']
        df_vende = df_vende[~df_vende[col_vende].astype(str).str.lower().isin(['nan', 'none', 'n/a', ''])]
        
        if not df_vende.empty:
            vendedores = df_vende[col_vende].value_counts()
            context_parts.append(f"\nPROYECTOS POR VENDEDOR/CONSTRUCTORA (columna '{col_vende}'):")
            context_parts.append(f"Total de vendedores/constructoras únicos: {len(vendedores)}")
            
            # Mostrar todos los vendedores con sus conteos
            for vendedor, count in vendedores.items():
                vendedor_nombre = str(vendedor).strip()
                # Limpiar formato
                if vendedor_nombre.endswith('.0') and vendedor_nombre.replace('.0', '').replace('-', '').isdigit():
                    vendedor_nombre = vendedor_nombre.rstrip('.0')
                if vendedor_nombre.replace('-', '').isdigit():
                    vendedor_nombre = f"Vendedor #{vendedor_nombre}"
                
                porcentaje = (count / total) * 100
                # Contar clasificaciones por vendedor
                vendedor_df = df_vende[df_vende[col_vende] == vendedor]
                exitosos = len(vendedor_df[vendedor_df['Clasificacion'] == 'Exitoso']) if 'Clasificacion' in vendedor_df.columns else 0
                moderados = len(vendedor_df[vendedor_df['Clasificacion'] == 'Moderado']) if 'Clasificacion' in vendedor_df.columns else 0
                mejorables = len(vendedor_df[vendedor_df['Clasificacion'] == 'Mejorable']) if 'Clasificacion' in vendedor_df.columns else 0
                
                context_parts.append(
                    f"- {vendedor_nombre}: {count} proyectos ({porcentaje:.1f}%) - "
                    f"Exitosos: {exitosos}, Moderados: {moderados}, Mejorables: {mejorables}"
                )
    
    # Estadísticas por Constructor (si es diferente de Vende)
    if col_constructor and col_constructor in df.columns and col_constructor != col_vende:
        df_constructor = df[df[col_constructor].notna()].copy()
        df_constructor = df_constructor[df_constructor[col_constructor].astype(str).str.strip() != '']
        df_constructor = df_constructor[~df_constructor[col_constructor].astype(str).str.lower().isin(['nan', 'none', 'n/a', ''])]
        
        if not df_constructor.empty:
            constructores = df_constructor[col_constructor].value_counts()
            context_parts.append(f"\nPROYECTOS POR CONSTRUCTOR (columna '{col_constructor}'):")
            context_parts.append(f"Total de constructores únicos: {len(constructores)}")
            
            # Mostrar todos los constructores con sus conteos
            for constructor, count in constructores.items():
                constructor_nombre = str(constructor).strip()
                # Limpiar formato
                if constructor_nombre.endswith('.0') and constructor_nombre.replace('.0', '').replace('-', '').isdigit():
                    constructor_nombre = constructor_nombre.rstrip('.0')
                if constructor_nombre.replace('-', '').isdigit():
                    constructor_nombre = f"Constructor #{constructor_nombre}"
                
                porcentaje = (count / total) * 100
                context_parts.append(f"- {constructor_nombre}: {count} proyectos ({porcentaje:.1f}%)")
    
    # 5. Lista completa de TODOS los proyectos (formato compacto para búsqueda)
    # Limitar a 200 proyectos más importantes para no exceder límites de tokens
    context_parts.append(f"\nLISTA DE PROYECTOS (muestra de {min(200, total)} proyectos más relevantes):")
    context_parts.append("Formato: Código | Nombre | Clasificación | Zona | Barrio | Precio | Unidades V/D | Vendedor")
    
    # Priorizar proyectos con más información (exitosos primero, luego por score)
    df_ordenado = df.copy()
    if 'Score_Exito' in df_ordenado.columns:
        # Usar na_position en lugar de na_last (compatible con pandas 2.0+)
        df_ordenado = df_ordenado.sort_values('Score_Exito', ascending=False, na_position='last')
    
    # Mostrar proyectos en formato compacto (máximo 200 para no exceder límites)
    muestra_proyectos = df_ordenado.head(200)
    for idx, row in muestra_proyectos.iterrows():
        proyecto = str(row.get('Proyecto', 'N/A'))[:35]
        codigo = str(row.get('Codigo_Proyecto', 'N/A'))[:12]
        clasificacion = str(row.get('Clasificacion', 'N/A'))[:10]
        zona = str(row.get('Zona', 'N/A'))[:12]
        barrio = str(row.get('Barrio', 'N/A'))[:15]
        precio = row.get('Precio_Promedio', 0)
        precio_str = f"${precio/1e6:.1f}M" if pd.notna(precio) and precio > 0 else "N/A"
        unidades_vendidas = int(row.get('Unidades_Vendidas', 0)) if pd.notna(row.get('Unidades_Vendidas')) else 0
        unidades_disponibles = int(row.get('Unidades_Disponibles', 0)) if pd.notna(row.get('Unidades_Disponibles')) else 0
        
        # Obtener vendedor/constructor
        vendedor_str = "N/A"
        if col_vende and col_vende in row:
            vende_val = row.get(col_vende)
            if pd.notna(vende_val) and str(vende_val).strip() not in ('', 'nan', 'none', 'N/A'):
                vendedor_str = str(vende_val).strip()[:20]
        elif col_constructor and col_constructor in row:
            constructor_val = row.get(col_constructor)
            if pd.notna(constructor_val) and str(constructor_val).strip() not in ('', 'nan', 'none', 'N/A'):
                vendedor_str = str(constructor_val).strip()[:20]
        
        # Formato compacto: código|nombre|clasificación|zona|barrio|precio|vendidas/disponibles|vendedor
        context_parts.append(
            f"{codigo}|{proyecto}|{clasificacion}|{zona}|{barrio}|{precio_str}|{unidades_vendidas}/{unidades_disponibles}|{vendedor_str}"
        )
    
    if total > 200:
        context_parts.append(f"\n... y {total - 200} proyectos más (total: {total} proyectos)")
        context_parts.append(f"NOTA: Tienes acceso a TODOS los {total} proyectos. Si necesitas información de un proyecto específico que no aparece aquí, puedes buscarlo por nombre o código.")
    
    return "\n".join(context_parts)

@app.route('/api/chat', methods=['POST'])
def chat_gemini():
    """
    API para chat con Gemini AI.
    Conecta el widget de chat con Google Gemini API para análisis de datos geoespaciales.
    Incluye el contexto completo de los proyectos en el dataset.
    """
    try:
        import google.generativeai as genai
        from dotenv import load_dotenv
        
        # Cargar variables de entorno
        load_dotenv()
        
        # Obtener API key de Gemini
        gemini_api_key = os.getenv('GEMINI_API_KEY', 'AIzaSyCBeurnd1ylLJ0xM5WIECMVdMOtpnr4TjM')
        
        if not gemini_api_key:
            return jsonify({
                'success': False,
                'error': 'API key de Gemini no configurada'
            }), 500
        
        # Configurar Gemini
        genai.configure(api_key=gemini_api_key)
        
        # Obtener mensaje del usuario
        data = request.get_json()
        if not data or 'message' not in data:
            return jsonify({
                'success': False,
                'error': 'El campo "message" es requerido'
            }), 400
        
        user_message = data.get('message', '').strip()
        if not user_message:
            return jsonify({
                'success': False,
                'error': 'El mensaje no puede estar vacío'
            }), 400
        
        # Modelo a usar (gemini-1.5-flash es el recomendado para tier gratuito con buenos límites)
        model_name = os.getenv('GEMINI_MODEL', 'gemini-1.5-flash')
        
        # Detectar si el usuario está preguntando por un proyecto específico o constructor
        buscar_proyecto_especifico = False
        proyecto_buscado = None
        buscar_constructor = False
        constructor_buscado = None
        
        # Palabras clave que indican búsqueda de proyecto específico
        palabras_busqueda = ['proyecto', 'información sobre', 'datos de', 'detalles de', 'código', 'nombre']
        # Palabras clave que indican búsqueda de constructor/vendedor
        palabras_constructor = ['constructor', 'constructora', 'vendedor', 'marval', 'cuántos proyectos tiene', 'proyectos de']
        
        user_lower = user_message.lower()
        
        # Detectar búsqueda de constructor/vendedor
        for palabra in palabras_constructor:
            if palabra in user_lower:
                buscar_constructor = True
                # Intentar extraer el nombre del constructor
                if palabra in ['cuántos proyectos tiene', 'proyectos de']:
                    partes = user_message.split(palabra, 1)
                    if len(partes) > 1:
                        constructor_buscado = partes[1].strip().strip('?').strip('.').strip()
                elif palabra in ['marval']:
                    constructor_buscado = palabra
                break
        
        # Intentar extraer nombre de proyecto del mensaje
        if not buscar_constructor:
            for palabra in palabras_busqueda:
                if palabra in user_lower:
                    buscar_proyecto_especifico = True
                    # Intentar extraer el nombre del proyecto (texto después de la palabra clave)
                    partes = user_message.split(palabra, 1)
                    if len(partes) > 1:
                        proyecto_buscado = partes[1].strip().strip('?').strip('.').strip()
                    break
        
            # Generar contexto completo de proyectos
            contexto_proyectos = ""
            if not df_data.empty:
                print("  [INFO] Generando contexto de proyectos para el chat...")
                
                # Si se busca un constructor/vendedor específico, agregar información adicional
                if buscar_constructor and constructor_buscado:
                    print(f"  [INFO] Búsqueda de constructor/vendedor: '{constructor_buscado}'")
                    # Buscar proyectos del constructor
                    proyectos_constructor = None
                    if 'Vende' in df_data.columns:
                        mask = df_data['Vende'].astype(str).str.contains(
                            constructor_buscado, case=False, na=False, regex=False
                        )
                        proyectos_constructor = df_data[mask]
                    elif 'Constructor' in df_data.columns:
                        mask = df_data['Constructor'].astype(str).str.contains(
                            constructor_buscado, case=False, na=False, regex=False
                        )
                        proyectos_constructor = df_data[mask]
                    
                    if proyectos_constructor is not None and not proyectos_constructor.empty:
                        print(f"  [OK] Encontrados {len(proyectos_constructor)} proyectos del constructor")
                        # Generar contexto general primero
                        contexto_proyectos = generar_contexto_proyectos(df_data)
                        # Agregar información detallada del constructor
                        contexto_proyectos += f"\n\nINFORMACIÓN ESPECÍFICA DEL CONSTRUCTOR/VENDEDOR '{constructor_buscado}':\n"
                        contexto_proyectos += f"Total de proyectos: {len(proyectos_constructor)}\n"
                        
                        # Estadísticas del constructor
                        if 'Clasificacion' in proyectos_constructor.columns:
                            exitosos = len(proyectos_constructor[proyectos_constructor['Clasificacion'] == 'Exitoso'])
                            moderados = len(proyectos_constructor[proyectos_constructor['Clasificacion'] == 'Moderado'])
                            mejorables = len(proyectos_constructor[proyectos_constructor['Clasificacion'] == 'Mejorable'])
                            contexto_proyectos += f"Clasificación: Exitosos: {exitosos}, Moderados: {moderados}, Mejorables: {mejorables}\n"
                        
                        # Lista de proyectos del constructor
                        contexto_proyectos += f"\nProyectos del constructor:\n"
                        for idx, row in proyectos_constructor.iterrows():
                            proyecto = str(row.get('Proyecto', 'N/A'))
                            codigo = str(row.get('Codigo_Proyecto', 'N/A'))
                            clasificacion = str(row.get('Clasificacion', 'N/A'))
                            zona = str(row.get('Zona', 'N/A'))
                            precio = row.get('Precio_Promedio', 0)
                            precio_str = f"${precio:,.0f}" if pd.notna(precio) and precio > 0 else "N/A"
                            contexto_proyectos += f"- {proyecto} (Código: {codigo}, Clasificación: {clasificacion}, Zona: {zona}, Precio: {precio_str})\n"
                    else:
                        print(f"  [ADV] Constructor no encontrado exactamente, usando contexto general")
                        contexto_proyectos = generar_contexto_proyectos(df_data)
                # Si se busca un proyecto específico, incluirlo en el contexto
                elif buscar_proyecto_especifico and proyecto_buscado:
                    print(f"  [INFO] Búsqueda de proyecto específico: '{proyecto_buscado}'")
                    # Buscar proyecto por nombre o código
                    proyecto_encontrado = None
                    
                    # Buscar por nombre (parcial)
                    if 'Proyecto' in df_data.columns:
                        mask_nombre = df_data['Proyecto'].astype(str).str.contains(
                            proyecto_buscado, case=False, na=False, regex=False
                        )
                        proyectos_coincidentes = df_data[mask_nombre]
                        if not proyectos_coincidentes.empty:
                            proyecto_encontrado = proyectos_coincidentes.iloc[0]
                    
                    # Si no se encontró por nombre, buscar por código
                    if proyecto_encontrado is None and 'Codigo_Proyecto' in df_data.columns:
                        try:
                            codigo_buscado = str(proyecto_buscado).strip()
                            mask_codigo = df_data['Codigo_Proyecto'].astype(str).str.contains(
                                codigo_buscado, case=False, na=False, regex=False
                            )
                            proyectos_coincidentes = df_data[mask_codigo]
                            if not proyectos_coincidentes.empty:
                                proyecto_encontrado = proyectos_coincidentes.iloc[0]
                        except:
                            pass
                    
                    # Si se encontró el proyecto, agregarlo al contexto
                    if proyecto_encontrado is not None:
                        print(f"  [OK] Proyecto encontrado: {proyecto_encontrado.get('Proyecto', 'N/A')}")
                        contexto_proyectos = generar_contexto_proyectos(df_data)
                        # Agregar información detallada del proyecto encontrado
                        contexto_proyectos += f"\n\nPROYECTO ESPECÍFICO SOLICITADO:\n"
                        contexto_proyectos += f"Nombre: {proyecto_encontrado.get('Proyecto', 'N/A')}\n"
                        contexto_proyectos += f"Código: {proyecto_encontrado.get('Codigo_Proyecto', 'N/A')}\n"
                        contexto_proyectos += f"Clasificación: {proyecto_encontrado.get('Clasificacion', 'N/A')}\n"
                        contexto_proyectos += f"Zona: {proyecto_encontrado.get('Zona', 'N/A')}\n"
                        contexto_proyectos += f"Barrio: {proyecto_encontrado.get('Barrio', 'N/A')}\n"
                        if pd.notna(proyecto_encontrado.get('Estrato')):
                            contexto_proyectos += f"Estrato: {proyecto_encontrado.get('Estrato', 'N/A')}\n"
                        if pd.notna(proyecto_encontrado.get('Precio_Promedio')) and proyecto_encontrado.get('Precio_Promedio', 0) > 0:
                            contexto_proyectos += f"Precio promedio: ${proyecto_encontrado.get('Precio_Promedio', 0):,.0f}\n"
                        if pd.notna(proyecto_encontrado.get('Area_Promedio')) and proyecto_encontrado.get('Area_Promedio', 0) > 0:
                            contexto_proyectos += f"Área promedio: {proyecto_encontrado.get('Area_Promedio', 0):.1f} m²\n"
                        contexto_proyectos += f"Unidades vendidas: {int(proyecto_encontrado.get('Unidades_Vendidas', 0))}\n"
                        contexto_proyectos += f"Unidades disponibles: {int(proyecto_encontrado.get('Unidades_Disponibles', 0))}\n"
                        if pd.notna(proyecto_encontrado.get('Score_Exito')):
                            contexto_proyectos += f"Score de éxito: {proyecto_encontrado.get('Score_Exito', 0):.3f}\n"
                        if pd.notna(proyecto_encontrado.get('Velocidad_Ventas')):
                            contexto_proyectos += f"Velocidad de ventas: {proyecto_encontrado.get('Velocidad_Ventas', 0):.2f} unidades/mes\n"
                        if pd.notna(proyecto_encontrado.get('Patron_Ventas')):
                            contexto_proyectos += f"Patrón de ventas: {proyecto_encontrado.get('Patron_Ventas', 'N/A')}\n"
                    else:
                        print(f"  [ADV] Proyecto no encontrado exactamente, usando contexto general")
                        contexto_proyectos = generar_contexto_proyectos(df_data)
                else:
                    contexto_proyectos = generar_contexto_proyectos(df_data)
            
            print(f"  [OK] Contexto generado: {len(contexto_proyectos)} caracteres")
        
        # Crear contexto del sistema con información sobre GeoMapval
        system_instruction = f"""Eres GeoMapval Assistant, un asistente especializado en análisis geoespacial e inmobiliario con acceso COMPLETO a todos los datos del modelo.

Tu función es ayudar a los usuarios a:
- Analizar proyectos inmobiliarios en Cali, Colombia
- Buscar información sobre CUALQUIER proyecto específico por nombre, código, zona, barrio, etc.
- Filtrar y analizar proyectos por múltiples criterios (zona, barrio, estrato, precio, clasificación, etc.)
- Entender clasificaciones de proyectos (Exitosos, Moderados, Mejorables)
- Interpretar datos geoespaciales y métricas de proyectos
- Responder preguntas sobre el sistema de clasificación
- Proporcionar insights sobre el mercado inmobiliario
- Comparar proyectos entre sí
- Hacer análisis estadísticos y consultas complejas sobre los datos

Contexto de la plataforma:
- GeoMapval es una plataforma de análisis de proyectos inmobiliarios
- Los proyectos se clasifican automáticamente según velocidad de ventas, porcentaje vendido, tamaño, precio, etc.
- Tienes acceso a TODAS las columnas y filas del dataset completo ({len(df_data)} proyectos, {len(df_data.columns) if not df_data.empty else 0} columnas)

INSTRUCCIONES IMPORTANTES:
- Tienes acceso COMPLETO a información detallada de TODOS los {len(df_data)} proyectos en el dataset
- El dataset incluye {len(df_data.columns) if not df_data.empty else 0} columnas con información completa de cada proyecto
- Cuando el usuario pregunte por un proyecto específico, busca en la LISTA DE PROYECTOS proporcionada
- Si encuentras el proyecto, proporciona TODA la información disponible (nombre, código, clasificación, zona, barrio, precio, unidades, score, vendedor/constructor, y cualquier otra columna relevante)
- Si el usuario pregunta por filtros o análisis, usa la información completa del dataset para responder
- Puedes hacer comparaciones entre proyectos, análisis por zona, barrio, clasificación, precio, área, constructor/vendedor, etc.
- Puedes contar, sumar, promediar, encontrar mínimos/máximos sobre cualquier columna del dataset
- IMPORTANTE: Si el usuario pregunta sobre una constructora o vendedor específico (ej: "Marval", "cuántos proyectos tiene X"), busca en la sección "PROYECTOS POR VENDEDOR/CONSTRUCTORA" del contexto
- La información de constructores/vendedores está disponible en las columnas "Vende" y/o "Constructor"
- Responde siempre en español de manera clara, profesional y útil
- Si no tienes información suficiente sobre algo específico, indícalo honestamente

FILTROS DEL MAPA:
Cuando el usuario quiera filtrar datos en el mapa, explícale que puede usar los siguientes filtros disponibles en el panel lateral:
- Clasificación: Exitoso, Moderado, Mejorable, Todos
- Zona: Todas las zonas disponibles (Sur, Norte, Oeste, etc.)
- Barrio: Cualquier barrio específico
- Tipo VIS: Vis, No Vis, Vis Renov., etc.
- Rango de precio: Precio mínimo y máximo
- Estado: Activos (con unidades disponibles) o Inactivos (sin unidades disponibles)
- Vendedor: Filtro por vendedor/constructor

Puedes sugerir filtros específicos basándote en la pregunta del usuario. Por ejemplo:
- "Para ver proyectos exitosos en la zona Sur, usa el filtro de Clasificación: Exitoso y Zona: Sur"
- "Para proyectos entre $50M y $100M, ajusta el rango de precio en los filtros"

DATOS COMPLETOS DE PROYECTOS DISPONIBLES:
{contexto_proyectos}

IMPORTANTE: Tienes acceso a TODOS los proyectos y TODAS las columnas. Usa esta información completa para responder las preguntas del usuario de manera precisa y detallada."""
        
        # Crear el modelo con instrucciones del sistema
        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=system_instruction
        )
        
        # Construir prompt completo (solo el mensaje del usuario, el contexto ya está en system_instruction)
        full_prompt = user_message
        
        # Generar respuesta
        response = model.generate_content(
            full_prompt,
            generation_config={
                'temperature': 0.7,
                'top_p': 0.95,
                'top_k': 40,
                'max_output_tokens': 2048,  # Aumentado para respuestas más detalladas
            }
        )
        
        # Extraer texto de la respuesta
        if response and response.text:
            response_text = response.text.strip()
        else:
            response_text = "Lo siento, no pude generar una respuesta. Por favor, intenta reformular tu pregunta."
        
        return jsonify({
            'success': True,
            'response': response_text,
            'message': response_text  # Compatibilidad con diferentes formatos
        })
        
    except Exception as e:
        print(f"❌ Error en /api/chat: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # Mensaje de error amigable
        error_message = "Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta nuevamente."
        
        # Si es un error específico de API, dar más detalles
        error_str = str(e).lower()
        if '429' in str(e) or 'quota' in error_str or 'rate limit' in error_str:
            error_message = "Límite de solicitudes alcanzado. El modelo experimental puede tener límites restrictivos. Se ha cambiado a gemini-1.5-flash. Por favor, espera unos segundos e intenta nuevamente."
        elif 'API key' in str(e) or 'authentication' in error_str:
            error_message = "Error de autenticación con la API de Gemini. Verifica la configuración."
        elif 'quota' in error_str or 'limit' in error_str:
            error_message = "Se ha alcanzado el límite de solicitudes. Por favor, intenta más tarde."
        
        return jsonify({
            'success': False,
            'error': error_message,
            'response': error_message  # Para que el widget lo muestre
        }), 500

@app.route('/api/buscar-proyectos', methods=['POST'])
def buscar_proyectos():
    """
    API para búsqueda avanzada de proyectos.
    Permite al asistente hacer consultas específicas sobre los datos.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Se requiere un objeto JSON con criterios de búsqueda'
            }), 400
        
        if df_data.empty:
            return jsonify({
                'success': False,
                'error': 'No hay datos disponibles'
            }), 404
        
        # Aplicar filtros
        df_resultado = df_data.copy()
        
        # Filtro por nombre de proyecto (búsqueda parcial)
        if 'nombre' in data and data['nombre']:
            nombre_buscado = str(data['nombre']).strip()
            if 'Proyecto' in df_resultado.columns:
                mask = df_resultado['Proyecto'].astype(str).str.contains(
                    nombre_buscado, case=False, na=False, regex=False
                )
                df_resultado = df_resultado[mask]
        
        # Filtro por código
        if 'codigo' in data and data['codigo']:
            codigo_buscado = str(data['codigo']).strip()
            if 'Codigo_Proyecto' in df_resultado.columns:
                mask = df_resultado['Codigo_Proyecto'].astype(str).str.contains(
                    codigo_buscado, case=False, na=False, regex=False
                )
                df_resultado = df_resultado[mask]
        
        # Filtro por zona
        if 'zona' in data and data['zona']:
            zona_buscada = str(data['zona']).strip()
            if 'Zona' in df_resultado.columns:
                df_resultado = df_resultado[df_resultado['Zona'] == zona_buscada]
        
        # Filtro por barrio
        if 'barrio' in data and data['barrio']:
            barrio_buscado = str(data['barrio']).strip()
            if 'Barrio' in df_resultado.columns:
                df_resultado = df_resultado[df_resultado['Barrio'] == barrio_buscado]
        
        # Filtro por clasificación
        if 'clasificacion' in data and data['clasificacion']:
            clasificacion_buscada = str(data['clasificacion']).strip()
            if 'Clasificacion' in df_resultado.columns:
                df_resultado = df_resultado[df_resultado['Clasificacion'] == clasificacion_buscada]
        
        # Filtro por rango de precio
        if 'precio_min' in data and data['precio_min']:
            try:
                precio_min = float(data['precio_min'])
                if 'Precio_Promedio' in df_resultado.columns:
                    df_resultado = df_resultado[df_resultado['Precio_Promedio'] >= precio_min]
            except (ValueError, TypeError):
                pass
        
        if 'precio_max' in data and data['precio_max']:
            try:
                precio_max = float(data['precio_max'])
                if 'Precio_Promedio' in df_resultado.columns:
                    df_resultado = df_resultado[df_resultado['Precio_Promedio'] <= precio_max]
            except (ValueError, TypeError):
                pass
        
        # Filtro por vendedor/constructor
        if 'vendedor' in data and data['vendedor']:
            vendedor_buscado = str(data['vendedor']).strip()
            # Buscar en columna Vende
            if 'Vende' in df_resultado.columns:
                mask = df_resultado['Vende'].astype(str).str.contains(
                    vendedor_buscado, case=False, na=False, regex=False
                )
                df_resultado = df_resultado[mask]
            # También buscar en columna Constructor si existe
            elif 'Constructor' in df_resultado.columns:
                mask = df_resultado['Constructor'].astype(str).str.contains(
                    vendedor_buscado, case=False, na=False, regex=False
                )
                df_resultado = df_resultado[mask]
        
        # Filtro por constructor (si es diferente de vendedor)
        if 'constructor' in data and data['constructor']:
            constructor_buscado = str(data['constructor']).strip()
            if 'Constructor' in df_resultado.columns:
                mask = df_resultado['Constructor'].astype(str).str.contains(
                    constructor_buscado, case=False, na=False, regex=False
                )
                df_resultado = df_resultado[mask]
        
        # Limitar número de resultados
        limite = data.get('limite', 50)
        if limite and isinstance(limite, int) and limite > 0:
            limite = min(limite, 500)  # Máximo 500 resultados
            df_resultado = df_resultado.head(limite)
        
        # Convertir a formato JSON
        proyectos = []
        for idx, row in df_resultado.iterrows():
            proyecto_dict = {}
            # Incluir todas las columnas
            for col in df_resultado.columns:
                valor = row.get(col)
                # Convertir tipos problemáticos para JSON
                if pd.isna(valor):
                    proyecto_dict[col] = None
                elif isinstance(valor, (np.integer, np.floating)):
                    if isinstance(valor, np.integer):
                        proyecto_dict[col] = int(valor)
                    else:
                        proyecto_dict[col] = None if np.isnan(valor) else float(valor)
                elif isinstance(valor, pd.Timestamp):
                    proyecto_dict[col] = str(valor)
                else:
                    proyecto_dict[col] = str(valor) if valor is not None else None
            proyectos.append(proyecto_dict)
        
        return jsonify({
            'success': True,
            'total': len(proyectos),
            'proyectos': proyectos,
            'columnas': list(df_resultado.columns),
            'total_columnas': len(df_resultado.columns)
        })
        
    except Exception as e:
        print(f"❌ Error en /api/buscar-proyectos: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    # Modo desarrollo local (solo se ejecuta cuando se corre directamente con python app.py)
    import webbrowser
    import threading
    import time
    import os
    
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
        # En desarrollo local, usar debug mode
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
else:
    # Modo producción (cuando se ejecuta con gunicorn)
    # Gunicorn manejará el host y puerto automáticamente
    # No configuramos nada aquí, solo dejamos que Flask use los valores por defecto
    pass
