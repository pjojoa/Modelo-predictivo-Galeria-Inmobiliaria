# Script para generar clasificación de proyectos inmobiliarios
# Basado en notebook_exito_proyectos.ipynb

import pandas as pd
import numpy as np
from pathlib import Path

# Verificar si scikit-learn está disponible
try:
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.model_selection import TimeSeriesSplit
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    print("⚠ Advertencia: scikit-learn no está disponible. El modelo RandomForest no se usará.")

# ============================================================================
# FUNCIONES AUXILIARES
# ============================================================================

def to_num(x):
    """Convierte un valor a número, manejando varios formatos."""
    if pd.isna(x):
        return np.nan
    if isinstance(x, (int, float)):
        return float(x)
    if isinstance(x, str):
        x = x.replace(',', '').replace('$', '').replace(' ', '').strip()
        try:
            return float(x)
        except (ValueError, AttributeError):
            return np.nan
    return np.nan

def winsorize(s, p_low=0.01, p_high=0.99):
    """Aplica winsorización a una serie para limitar valores extremos."""
    lo = s.quantile(p_low)
    hi = s.quantile(p_high)
    return s.clip(lower=lo, upper=hi)

# ============================================================================
# CARGAR Y PREPARAR DATOS
# ============================================================================

def cargar_datos(xlsx_path=None):
    """Carga las hojas Inmuebles y Proyectos del Excel.
    
    Args:
        xlsx_path: Ruta al archivo Excel. Si es None, busca en el directorio del script.
    
    Returns:
        tuple: (inm, pry) DataFrames de Inmuebles y Proyectos
    """
    import os
    
    # Si no se proporciona ruta, buscar el archivo
    if xlsx_path is None:
        # Obtener el directorio del script (donde está generar_clasificacion.py)
        script_dir = Path(__file__).parent.absolute()
        
        # Buscar el archivo en el directorio del script
        xlsx_path = script_dir / 'Base Proyectos.xlsx'
        
        # Si no se encuentra, intentar en el directorio actual de trabajo
        if not xlsx_path.exists():
            xlsx_path = Path('Base Proyectos.xlsx')
        
        # Si aún no se encuentra, buscar variaciones del nombre
        if not xlsx_path.exists():
            posibles_nombres = [
                'Base Proyectos.xlsx',
                'Base de Proyectos.xlsx',
                'BaseProyectos.xlsx',
                'base_proyectos.xlsx'
            ]
            for nombre in posibles_nombres:
                posible_path = script_dir / nombre
                if posible_path.exists():
                    xlsx_path = posible_path
                    break
    
    # Convertir a Path si es string
    xlsx_path = Path(xlsx_path)
    
    if not xlsx_path.exists():
        error_msg = f"No se encontró el archivo: {xlsx_path}\n"
        error_msg += f"  Directorio del script: {Path(__file__).parent.absolute()}\n"
        error_msg += f"  Directorio actual de trabajo: {os.getcwd()}\n"
        error_msg += f"  Ruta buscada: {xlsx_path}\n"
        raise FileNotFoundError(error_msg)
    
    print(f"[OK] Cargando archivo: {xlsx_path}")
    
    xls = pd.ExcelFile(xlsx_path)
    
    # Intentar cargar las hojas
    try:
        inm = pd.read_excel(xls, 'Inmuebles')
        pry = pd.read_excel(xls, 'Proyectos')
        
        print(f"[OK] Cargados {len(inm)} inmuebles y {len(pry)} proyectos")
        
        return inm, pry
    except Exception as e:
        print(f"[ERROR] Error al cargar hojas del Excel: {str(e)}")
        print(f"  Hojas disponibles: {xls.sheet_names}")
        raise

def detectar_llaves(inm, pry):
    """Detecta las columnas clave para unir Inmuebles y Proyectos.
    
    La llave de unión es:
    - Inmuebles: 'Codigo de proyecto' (o variantes)
    - Proyectos: 'Cod proyecto' (o variantes)
    """
    # Buscar llave en Inmuebles: 'Codigo de proyecto' o variantes
    key_inm_candidates = [
        'Codigo de proyecto',
        'Codigo de Proyecto',
        'Código de proyecto',
        'Código de Proyecto',
        'Codigo Proyecto',
        'Código Proyecto',
        'Codigo_Proyecto',
        'Código_Proyecto',
        'Cod Proyecto',
        'Cod proyecto'
    ]
    
    key_inm = None
    for k in key_inm_candidates:
        if k in inm.columns:
            key_inm = k
            break
    
    # Buscar llave en Proyectos: 'Cod proyecto' o variantes
    key_pry_candidates = [
        'Cod proyecto',
        'Cod Proyecto',
        'Codigo proyecto',
        'Codigo Proyecto',
        'Código proyecto',
        'Código Proyecto',
        'Codigo_Proyecto',
        'Código_Proyecto',
        'Codigo de proyecto',
        'Código de proyecto'
    ]
    
    key_pry = None
    for k in key_pry_candidates:
        if k in pry.columns:
            key_pry = k
            break
    
    # Si no se encuentra, buscar columnas comunes como fallback
    if not key_inm or not key_pry:
        comunes = set(inm.columns) & set(pry.columns)
        if comunes:
            # Buscar cualquier columna que contenga 'cod' y 'proyecto'
            for col in comunes:
                if 'cod' in col.lower() and 'proyecto' in col.lower():
                    if not key_inm:
                        key_inm = col
                    if not key_pry:
                        key_pry = col
                    break
            
            # Si aún no se encuentra, usar la primera columna común
            if not key_inm:
                key_inm = list(comunes)[0]
            if not key_pry:
                key_pry = key_inm if key_inm in pry.columns else list(comunes)[0]
    
    if not key_inm:
        raise ValueError(f"No se encontró columna de código de proyecto en Inmuebles. Columnas disponibles: {list(inm.columns)}")
    
    if not key_pry:
        raise ValueError(f"No se encontró columna de código de proyecto en Proyectos. Columnas disponibles: {list(pry.columns)}")
    
    print(f"[OK] Llaves detectadas: '{key_inm}' (Inmuebles) <-> '{key_pry}' (Proyectos)")
    
    return key_inm, key_pry

def unir_datos(inm, pry, key_inm, key_pry):
    """Une los datos de Inmuebles y Proyectos.
    
    IMPORTANTE: Une TODAS las columnas de Proyectos a Inmuebles.
    El resultado es un dataset a nivel de inmueble con todas las columnas de Proyectos.
    """
    # Hacer el merge manteniendo todas las filas de Inmuebles (how='left')
    # Esto asegura que todos los inmuebles tengan las columnas de Proyectos
    inm_join = inm.merge(
        pry,
        left_on=key_inm,
        right_on=key_pry,
        how='left',
        suffixes=('', '_pry')
    )
    
    # Verificar que todas las columnas de Proyectos estén presentes
    columnas_pry_originales = set(pry.columns)
    columnas_en_resultado = set(inm_join.columns)
    columnas_faltantes = columnas_pry_originales - columnas_en_resultado
    
    if columnas_faltantes:
        print(f"  ⚠ Advertencia: Algunas columnas de Proyectos no se unieron: {columnas_faltantes}")
    else:
        print(f"  ✓ Todas las columnas de Proyectos se unieron correctamente")
    
    # Contar inmuebles con y sin información de proyecto
    inm_con_proyecto = inm_join[key_pry].notna().sum()
    inm_sin_proyecto = inm_join[key_pry].isna().sum()
    
    print(f"[OK] Datos unidos: {len(inm_join)} inmuebles")
    print(f"  - Inmuebles con información de proyecto: {inm_con_proyecto}")
    if inm_sin_proyecto > 0:
        print(f"  - Inmuebles sin información de proyecto: {inm_sin_proyecto} (serán eliminados)")
        
        # ELIMINAR inmuebles sin información de proyecto
        inm_join = inm_join[inm_join[key_pry].notna()].copy()
        print(f"  ✓ Inmuebles eliminados: {inm_sin_proyecto}")
        print(f"  ✓ Total de inmuebles válidos: {len(inm_join)}")
    else:
        print(f"  ✓ Todos los inmuebles tienen información de proyecto")
    
    print(f"  - Columnas totales: {len(inm_join.columns)} (Inmuebles: {len(inm.columns)}, Proyectos: {len(pry.columns)})")
    
    return inm_join

def detectar_columnas_inmuebles(inm_join):
    """Detecta las columnas relevantes en el dataset de inmuebles."""
    col_precio = next((c for c in inm_join.columns if 'precio' in c.lower() and 'prom' not in c.lower()), None)
    col_area = next((c for c in inm_join.columns if 'area' in c.lower() and 'prom' not in c.lower()), None)
    col_alcobas = next((c for c in inm_join.columns if 'alcoba' in c.lower()), None)
    col_banos = next((c for c in inm_join.columns if 'baño' in c.lower() or 'bano' in c.lower()), None)
    col_garajes = next((c for c in inm_join.columns if 'garaje' in c.lower()), None)
    
    return {
        'precio': col_precio,
        'area': col_area,
        'alcobas': col_alcobas,
        'banos': col_banos,
        'garajes': col_garajes
    }

def agregar_datos_por_proyecto(inm_join, cols_inm, cols_proy, key_inm, key_pry):
    """Agrega datos por proyecto desde el dataset de inmuebles.
    
    IMPORTANTE: El dataset inm_join ya tiene TODAS las columnas de Proyectos.
    Esta función agrupa por proyecto y mantiene todas las columnas de Proyectos,
    agregando también features calculados desde los inmuebles.
    
    Args:
        inm_join: DataFrame de inmuebles con todas las columnas de Proyectos
        cols_inm: Diccionario con columnas de inmuebles
        cols_proy: Diccionario con columnas de proyectos
        key_inm: Columna de código de proyecto en inmuebles
        key_pry: Columna de código de proyecto en proyectos (debe estar en inm_join después del merge)
    
    Returns:
        DataFrame a nivel de proyecto con todas las columnas de Proyectos y features agregados
    """
    print("  Agregando datos por proyecto...")
    print(f"  Dataset de entrada: {len(inm_join)} inmuebles")
    
    # Convertir a numéricos las columnas de inmuebles
    for c in [cols_inm.get('precio'), cols_inm.get('area'), cols_inm.get('alcobas'), 
              cols_inm.get('banos'), cols_inm.get('garajes')]:
        if c and c in inm_join.columns:
            if c + "_num" not in inm_join.columns:
                inm_join[c + "_num"] = pd.to_numeric(inm_join[c].apply(to_num), errors='coerce')
    
    # Agrupar por proyecto
    grp = inm_join.groupby(key_inm, dropna=False)
    
    # Preparar diccionario de agregación
    # Para columnas de Proyectos: usar 'first' (todas las filas del mismo proyecto tienen los mismos valores)
    # Para columnas de Inmuebles: agregar (median, mean, etc.)
    
    # Identificar todas las columnas que NO son de inmuebles (son de proyectos o otras)
    # Estas se toman con 'first'
    columnas_proyecto = []
    columnas_inmueble_para_agregar = []
    
    # Columnas de inmuebles que se agregan
    if cols_inm.get('precio') and cols_inm['precio'] + "_num" in inm_join.columns:
        columnas_inmueble_para_agregar.append(cols_inm['precio'] + "_num")
    if cols_inm.get('area') and cols_inm['area'] + "_num" in inm_join.columns:
        columnas_inmueble_para_agregar.append(cols_inm['area'] + "_num")
    if cols_inm.get('alcobas') and cols_inm['alcobas'] + "_num" in inm_join.columns:
        columnas_inmueble_para_agregar.append(cols_inm['alcobas'] + "_num")
    if cols_inm.get('banos') and cols_inm['banos'] + "_num" in inm_join.columns:
        columnas_inmueble_para_agregar.append(cols_inm['banos'] + "_num")
    if cols_inm.get('garajes') and cols_inm['garajes'] + "_num" in inm_join.columns:
        columnas_inmueble_para_agregar.append(cols_inm['garajes'] + "_num")
    
    # Todas las demás columnas son de proyectos y se toman con 'first'
    columnas_proyecto = [col for col in inm_join.columns 
                         if col != key_inm and col not in columnas_inmueble_para_agregar]
    
    # ESTRATEGIA: Separar agregación de proyectos e inmuebles para evitar problemas con MultiIndex
    
    # Paso 1: Tomar la primera fila de cada proyecto para obtener todas las columnas de proyectos
    proj_ds = grp.first().reset_index()
    
    # Paso 2: Agregar features de inmuebles por separado
    agg_dict_inm = {}
    if cols_inm.get('precio') and cols_inm['precio'] + "_num" in inm_join.columns:
        agg_dict_inm[cols_inm['precio'] + "_num"] = ['median', 'mean', 'std']
    if cols_inm.get('area') and cols_inm['area'] + "_num" in inm_join.columns:
        agg_dict_inm[cols_inm['area'] + "_num"] = ['median', 'mean', 'std']
    if cols_inm.get('alcobas') and cols_inm['alcobas'] + "_num" in inm_join.columns:
        agg_dict_inm[cols_inm['alcobas'] + "_num"] = ['median', 'mean']
    if cols_inm.get('banos') and cols_inm['banos'] + "_num" in inm_join.columns:
        agg_dict_inm[cols_inm['banos'] + "_num"] = ['median', 'mean']
    if cols_inm.get('garajes') and cols_inm['garajes'] + "_num" in inm_join.columns:
        agg_dict_inm[cols_inm['garajes'] + "_num"] = ['median', 'mean']
    
    # Agregar conteo de unidades
    proj_feat = grp.size().reset_index(name='n_unidades')
    
    # Si hay features de inmuebles para agregar, hacerlo
    if agg_dict_inm:
        proj_feat_inm = grp.agg(agg_dict_inm)
        # Aplanar columnas multi-nivel de features de inmuebles
        if isinstance(proj_feat_inm.columns, pd.MultiIndex):
            proj_feat_inm.columns = [f'{col[0]}_{col[1]}' for col in proj_feat_inm.columns]
        proj_feat_inm = proj_feat_inm.reset_index()
        
        # Unir conteo y features de inmuebles
        proj_feat = proj_feat.merge(proj_feat_inm, on=key_inm, how='left')
    
    # Paso 3: Unir features agregados con dataset de proyectos
    proj_ds = proj_ds.merge(proj_feat, on=key_inm, how='left', suffixes=('', '_feat'))
    
    # Calcular velocidad desde las columnas de Proyectos que ya están en proj_ds
    # (proj_ds ya tiene todas las columnas de Proyectos)
    proj_ds = calcular_velocidad(proj_ds, cols_proy)
    
    print(f"  ✓ Datos agregados: {len(proj_ds)} proyectos")
    print(f"  ✓ Columnas en resultado: {len(proj_ds.columns)}")
    
    # Verificar que key_pry esté presente (puede estar como key_inm o con otro nombre)
    if key_pry not in proj_ds.columns and key_inm in proj_ds.columns:
        # Si key_pry no está pero key_inm sí, usar key_inm
        pass
    elif key_pry not in proj_ds.columns:
        print(f"  ⚠ Advertencia: key_pry '{key_pry}' no está en proj_ds, usando key_inm '{key_inm}'")
    
    return proj_ds

def agregar_features_unidad(inm_join, cols_inm, key_inm):
    """Agrega features a nivel de proyecto basados en las unidades.
    
    NOTA: Esta función se mantiene para compatibilidad, pero ahora se usa agregar_datos_por_proyecto
    """
    # Convertir a numéricos
    for c in [cols_inm.get('precio'), cols_inm.get('area'), cols_inm.get('alcobas'), 
              cols_inm.get('banos'), cols_inm.get('garajes')]:
        if c and c in inm_join.columns:
            if c + "_num" not in inm_join.columns:
                inm_join[c + "_num"] = inm_join[c].apply(to_num)
    
    # Agrupar por proyecto
    grp = inm_join.groupby(key_inm)
    agg_dict = {}
    
    if cols_inm.get('precio') and cols_inm['precio'] + "_num" in inm_join.columns:
        agg_dict[cols_inm['precio'] + "_num"] = ['median', 'mean', 'std']
    if cols_inm.get('area') and cols_inm['area'] + "_num" in inm_join.columns:
        agg_dict[cols_inm['area'] + "_num"] = ['median', 'mean', 'std']
    if cols_inm.get('alcobas') and cols_inm['alcobas'] + "_num" in inm_join.columns:
        agg_dict[cols_inm['alcobas'] + "_num"] = ['median', 'mean']
    if cols_inm.get('banos') and cols_inm['banos'] + "_num" in inm_join.columns:
        agg_dict[cols_inm['banos'] + "_num"] = ['median', 'mean']
    if cols_inm.get('garajes') and cols_inm['garajes'] + "_num" in inm_join.columns:
        agg_dict[cols_inm['garajes'] + "_num"] = ['median', 'mean']
    
    agg_dict[key_inm] = ['count']
    
    proj_feat_u = grp.agg(agg_dict)
    # Aplanar columnas
    proj_feat_u.columns = [
        '{}_{}'.format(k, stat) if k != key_inm else 'n_unidades'
        for (k, stat) in proj_feat_u.columns
    ]
    proj_feat_u = proj_feat_u.reset_index()
    
    print(f"[OK] Features agregadas: {len(proj_feat_u)} proyectos")
    
    return proj_feat_u

def detectar_columnas_proyectos(ds):
    """Detecta las columnas relevantes en el dataset de proyectos.
    
    Args:
        ds: DataFrame que puede ser el dataset de proyectos original o el dataset unido (inm_join o proj_ds)
    """
    col_un_disp = next((c for c in ds.columns if 'dispon' in c.lower() and 'un' in c.lower()), None)
    
    # Ventas promedio en UNIDADES/mes
    col_ventas_un = None
    for c in ds.columns:
        cl = c.lower().replace('.', '').replace('  ', ' ')
        if ('venta' in cl or 'ventas' in cl) and 'mes' in cl and (' un' in cl or 'unid' in cl or 'unidad' in cl):
            if '$' not in c:
                col_ventas_un = c
                break
    if not col_ventas_un:
        col_ventas_un = next((c for c in ds.columns if 'capacidad' in c.lower() and 'venta' in c.lower()), None)
    
    col_tot_un = next((c for c in ds.columns if ('tot' in c.lower() or 'total' in c.lower()) and 'proyecto' in c.lower() and ('un' in c.lower() or 'unidad' in c.lower())), None)
    col_precio_m2 = next((c for c in ds.columns if 'm2' in c.lower() and 'prom' in c.lower()), None)
    col_precio_p = next((c for c in ds.columns if 'precio prom' in c.lower() and 'm2' not in c.lower()), None)
    col_area_p = next((c for c in ds.columns if 'area prom' in c.lower()), None)
    col_zona = 'Zona' if 'Zona' in ds.columns else None
    col_subzona = next((c for c in ds.columns if 'sub zona' in c.lower() or 'subzona' in c.lower()), None)
    col_barrio = next((c for c in ds.columns if 'barrio' in c.lower()), None)
    col_estrato = 'Estrato' if 'Estrato' in ds.columns else None
    col_estado = next((c for c in ds.columns if 'estado etapas' in c.lower() or (c.lower().startswith('estado') and 'etapa' in c.lower())), None)
    col_codigo = next((c for c in ds.columns if 'codigo proyecto' in c.lower()), None)
    col_nombre = 'Proyecto' if 'Proyecto' in ds.columns else None
    col_fecha_ini = next((c for c in ds.columns if 'fecha inicio' in c.lower()), None)
    col_coordenadas = next((c for c in ds.columns if 'coordenadas' in c.lower()), None)
    col_direccion = next((c for c in ds.columns if 'dirección' in c.lower() or 'direccion' in c.lower()), None)
    
    return {
        'un_disp': col_un_disp,
        'ventas_un': col_ventas_un,
        'tot_un': col_tot_un,
        'precio_m2': col_precio_m2,
        'precio_p': col_precio_p,
        'area_p': col_area_p,
        'zona': col_zona,
        'subzona': col_subzona,
        'barrio': col_barrio,
        'estrato': col_estrato,
        'estado': col_estado,
        'codigo': col_codigo,
        'nombre': col_nombre,
        'fecha_ini': col_fecha_ini,
        'coordenadas': col_coordenadas,
        'direccion': col_direccion
    }

def calcular_velocidad(pry, cols):
    """Calcula métricas de velocidad de venta por proyecto."""
    prj = pry.copy()
    
    # Convertir a numéricos
    for c in [cols['un_disp'], cols['ventas_un'], cols['tot_un'], 
              cols['precio_m2'], cols['precio_p'], cols['area_p'], cols['estrato']]:
        if c and c in prj.columns:
            prj[c + "_num"] = pd.to_numeric(prj[c].apply(to_num), errors='coerce')
    
    # Meses para agotar
    if cols['un_disp'] and cols['ventas_un']:
        un_disp_num = cols['un_disp'] + "_num"
        ventas_un_num = cols['ventas_un'] + "_num"
        if un_disp_num in prj.columns and ventas_un_num in prj.columns:
            # Asegurar que velocidad_ventas sea positiva
            # Calcular velocidad de ventas (asegurar que sea positiva para evitar división por cero)
            velocidad_calc = pd.to_numeric(prj[ventas_un_num], errors='coerce').fillna(0).clip(lower=0)
            # Si la velocidad es 0, no se puede calcular meses_para_agotar
            prj['velocidad_ventas'] = velocidad_calc
            # Calcular meses_para_agotar solo si hay velocidad > 0
            mask_velocidad_valida = velocidad_calc > 0
            prj.loc[mask_velocidad_valida, 'meses_para_agotar'] = (
                pd.to_numeric(prj.loc[mask_velocidad_valida, un_disp_num], errors='coerce').fillna(0) / 
                prj.loc[mask_velocidad_valida, 'velocidad_ventas']
            ).replace([np.inf, -np.inf], np.nan).clip(upper=120)
            prj.loc[~mask_velocidad_valida, 'meses_para_agotar'] = np.nan
        else:
            prj['meses_para_agotar'] = np.nan
            prj['velocidad_ventas'] = np.nan
    else:
        prj['meses_para_agotar'] = np.nan
        prj['velocidad_ventas'] = np.nan
    
    # Meses desde inicio
    if cols['fecha_ini'] and cols['fecha_ini'] in prj.columns:
        prj['_fecha_ini'] = pd.to_datetime(prj[cols['fecha_ini']], errors='coerce')
        today = pd.Timestamp.today().normalize()
        prj['meses_desde_inicio'] = ((today - prj['_fecha_ini']).dt.days / 30.4375).clip(lower=0).fillna(0)
    else:
        prj['meses_desde_inicio'] = 0.0
    
    prj['tiempo_total_estimado_meses'] = (prj['meses_desde_inicio'].fillna(0) + prj['meses_para_agotar'].fillna(0)).replace([np.inf, -np.inf], np.nan)
    
    # Calcular unidades vendidas (total - disponibles)
    if cols['tot_un'] and cols['un_disp']:
        tot_un_num = cols['tot_un'] + "_num"
        un_disp_num = cols['un_disp'] + "_num"
        if tot_un_num in prj.columns and un_disp_num in prj.columns:
            prj['unidades_vendidas'] = (prj[tot_un_num].fillna(0) - prj[un_disp_num].fillna(0)).clip(lower=0)
        else:
            prj['unidades_vendidas'] = 0.0
    else:
        prj['unidades_vendidas'] = 0.0
    
    # Si no se calculó velocidad_ventas arriba, calcularla ahora
    if 'velocidad_ventas' not in prj.columns or prj['velocidad_ventas'].isna().all():
        if cols['ventas_un']:
            ventas_un_num = cols['ventas_un'] + "_num"
            if ventas_un_num in prj.columns:
                prj['velocidad_ventas'] = prj[ventas_un_num].fillna(0).clip(lower=0)
            else:
                prj['velocidad_ventas'] = 0.0
        else:
            prj['velocidad_ventas'] = 0.0
    
    # Asegurar que velocidad_ventas sea numérico
    prj['velocidad_ventas'] = pd.to_numeric(prj['velocidad_ventas'], errors='coerce').fillna(0).clip(lower=0)
    prj['unidades_vendidas'] = pd.to_numeric(prj['unidades_vendidas'], errors='coerce').fillna(0).clip(lower=0)
    prj['meses_para_agotar'] = pd.to_numeric(prj['meses_para_agotar'], errors='coerce')
    
    print(f"[OK] Métricas de velocidad calculadas")
    print(f"  - Proyectos con velocidad válida: {prj['velocidad_ventas'].gt(0).sum()}")
    print(f"  - Proyectos con meses_para_agotar válido: {prj['meses_para_agotar'].notna().sum()}")
    
    return prj

# ============================================================================
# VALIDACIÓN Y DETECCIÓN DE ANOMALÍAS (FASE 1)
# ============================================================================

def validar_datos(ds, cols_proy):
    """Valida los datos y detecta anomalías.
    SIEMPRE devuelve un DataFrame válido con columnas de validación."""
    print("=" * 70)
    print("  VALIDACIÓN DE DATOS Y DETECCIÓN DE ANOMALÍAS")
    print("=" * 70)
    print()
    
    ds_val = ds.copy()
    
    # Inicializar columnas de validación
    ds_val['_es_anomalia'] = False
    ds_val['_razon_anomalia'] = ''
    
    anomalias_encontradas = {
        'meses_agotar_invalido': 0,
        'meses_agotar_extremo': 0,
        'velocidad_cero_con_disponibles': 0,
        'velocidad_extrema': 0,
        'unidades_vendidas_negativas': 0,
        'inconsistencia_unidades': 0,
        'datos_faltantes': 0
    }
    
    # 1. Validar meses_para_agotar
    if 'meses_para_agotar' in ds_val.columns:
        meses = pd.to_numeric(ds_val['meses_para_agotar'], errors='coerce')
        
        # Meses inválidos (<= 0)
        mask_invalido = (meses <= 0) | meses.isna()
        if mask_invalido.any():
            ds_val.loc[mask_invalido, '_es_anomalia'] = True
            ds_val.loc[mask_invalido, '_razon_anomalia'] = ds_val.loc[mask_invalido, '_razon_anomalia'] + 'Meses_agotar_invalido;'
            anomalias_encontradas['meses_agotar_invalido'] = mask_invalido.sum()
        
        # Meses extremos (>120)
        mask_extremo = (meses > 120)
        if mask_extremo.any():
            ds_val.loc[mask_extremo, '_es_anomalia'] = True
            ds_val.loc[mask_extremo, '_razon_anomalia'] = ds_val.loc[mask_extremo, '_razon_anomalia'] + 'Meses_agotar_extremo;'
            anomalias_encontradas['meses_agotar_extremo'] = mask_extremo.sum()
    
    # 2. Validar velocidad de ventas
    if 'velocidad_ventas' in ds_val.columns:
        velocidad = pd.to_numeric(ds_val['velocidad_ventas'], errors='coerce').fillna(0)
        
        # Obtener columna de unidades disponibles
        un_disp_col = None
        if cols_proy['un_disp']:
            un_disp_col = cols_proy['un_disp'] + "_num" if (cols_proy['un_disp'] + "_num") in ds_val.columns else cols_proy['un_disp']
        
        # Velocidad cero/negativa con unidades disponibles
        if un_disp_col and un_disp_col in ds_val.columns:
            unidades_disp = pd.to_numeric(ds_val[un_disp_col], errors='coerce').fillna(0)
            mask_velocidad_cero = (velocidad <= 0) & (unidades_disp > 0)
            if mask_velocidad_cero.any():
                ds_val.loc[mask_velocidad_cero, '_es_anomalia'] = True
                ds_val.loc[mask_velocidad_cero, '_razon_anomalia'] = ds_val.loc[mask_velocidad_cero, '_razon_anomalia'] + 'Velocidad_cero_con_disponibles;'
                anomalias_encontradas['velocidad_cero_con_disponibles'] = mask_velocidad_cero.sum()
        
        # Velocidad extrema (>100 unidades/mes)
        mask_velocidad_extrema = velocidad > 100
        if mask_velocidad_extrema.any():
            ds_val.loc[mask_velocidad_extrema, '_es_anomalia'] = True
            ds_val.loc[mask_velocidad_extrema, '_razon_anomalia'] = ds_val.loc[mask_velocidad_extrema, '_razon_anomalia'] + 'Velocidad_extrema;'
            anomalias_encontradas['velocidad_extrema'] = mask_velocidad_extrema.sum()
    
    # 3. Validar unidades vendidas
    if 'unidades_vendidas' in ds_val.columns:
        unidades_vendidas = pd.to_numeric(ds_val['unidades_vendidas'], errors='coerce').fillna(0)
        
        # Unidades vendidas negativas
        mask_negativas = unidades_vendidas < 0
        if mask_negativas.any():
            ds_val.loc[mask_negativas, '_es_anomalia'] = True
            ds_val.loc[mask_negativas, '_razon_anomalia'] = ds_val.loc[mask_negativas, '_razon_anomalia'] + 'Unidades_vendidas_negativas;'
            anomalias_encontradas['unidades_vendidas_negativas'] = mask_negativas.sum()
        
        # Inconsistencia: vendidas + disponibles > total * 1.1
        if cols_proy['tot_un'] and un_disp_col:
            tot_un_col = cols_proy['tot_un'] + "_num" if (cols_proy['tot_un'] + "_num") in ds_val.columns else cols_proy['tot_un']
            if tot_un_col in ds_val.columns and un_disp_col in ds_val.columns:
                tot_un = pd.to_numeric(ds_val[tot_un_col], errors='coerce').fillna(0)
                unidades_disp = pd.to_numeric(ds_val[un_disp_col], errors='coerce').fillna(0)
                mask_inconsistencia = (unidades_vendidas + unidades_disp) > (tot_un * 1.1)
                if mask_inconsistencia.any():
                    ds_val.loc[mask_inconsistencia, '_es_anomalia'] = True
                    ds_val.loc[mask_inconsistencia, '_razon_anomalia'] = ds_val.loc[mask_inconsistencia, '_razon_anomalia'] + 'Inconsistencia_unidades;'
                    anomalias_encontradas['inconsistencia_unidades'] = mask_inconsistencia.sum()
    
    # 4. Validar datos faltantes críticos
    if 'meses_para_agotar' in ds_val.columns:
        mask_faltantes = ds_val['meses_para_agotar'].isna()
        if mask_faltantes.any():
            ds_val.loc[mask_faltantes, '_es_anomalia'] = True
            ds_val.loc[mask_faltantes, '_razon_anomalia'] = ds_val.loc[mask_faltantes, '_razon_anomalia'] + 'Datos_faltantes;'
            anomalias_encontradas['datos_faltantes'] = mask_faltantes.sum()
    
    # Resumen de anomalías
    total_anomalias = ds_val['_es_anomalia'].sum()
    print(f"⚠ Anomalías detectadas:")
    for tipo, count in anomalias_encontradas.items():
        if count > 0:
            print(f"  - {count} proyectos con {tipo}")
    print(f"\n  Total de proyectos con anomalías: {total_anomalias}")
    print(f"  Proyectos válidos: {len(ds_val) - total_anomalias}")
    print()
    
    return ds_val

# ============================================================================
# FEATURE ENGINEERING AVANZADO (FASE 2)
# ============================================================================

def crear_features_avanzados(ds, cols_proy):
    """Crea features avanzados para mejorar la predicción del modelo.
    SIEMPRE devuelve un DataFrame válido, incluso si hay errores."""
    try:
        ds_feat = ds.copy()
        
        print("=" * 70)
        print("  FEATURE ENGINEERING AVANZADO")
        print("=" * 70)
        print()
        
        # 1. Features de precio y área
        if cols_proy['precio_m2']:
            precio_m2_col = cols_proy['precio_m2'] + "_num" if (cols_proy['precio_m2'] + "_num") in ds_feat.columns else cols_proy['precio_m2']
            if precio_m2_col in ds_feat.columns:
                precio_m2 = pd.to_numeric(ds_feat[precio_m2_col], errors='coerce')
                
                # Percentil de precio por m² dentro de la zona
                if cols_proy['zona'] and cols_proy['zona'] in ds_feat.columns:
                    ds_feat['_precio_m2_percentil_zona'] = ds_feat.groupby(cols_proy['zona'])[precio_m2_col].transform(
                        lambda x: pd.to_numeric(x, errors='coerce').rank(pct=True) * 100
                    ).fillna(50)
                
                # Percentil de precio por m² dentro del estrato
                if cols_proy['estrato'] and cols_proy['estrato'] in ds_feat.columns:
                    estrato_col = cols_proy['estrato'] + "_num" if (cols_proy['estrato'] + "_num") in ds_feat.columns else cols_proy['estrato']
                    if estrato_col in ds_feat.columns:
                        ds_feat['_precio_m2_percentil_estrato'] = ds_feat.groupby(estrato_col)[precio_m2_col].transform(
                            lambda x: pd.to_numeric(x, errors='coerce').rank(pct=True) * 100
                        ).fillna(50)
        
        # 2. Features de tamaño del proyecto
        if cols_proy['tot_un']:
            tot_un_col = cols_proy['tot_un'] + "_num" if (cols_proy['tot_un'] + "_num") in ds_feat.columns else cols_proy['tot_un']
            if tot_un_col in ds_feat.columns:
                tot_un = pd.to_numeric(ds_feat[tot_un_col], errors='coerce').fillna(0)
                
                # Categorías de tamaño
                ds_feat['_tamano_proyecto'] = pd.cut(
                    tot_un,
                    bins=[0, 50, 100, 200, np.inf],
                    labels=['Pequeño', 'Mediano', 'Grande', 'Muy Grande']
                )
                
                # Log del tamaño (para normalizar)
                ds_feat['_log_tamano'] = np.log1p(tot_un)
        
        # 3. Features de penetración de mercado
        if 'unidades_vendidas' in ds_feat.columns:
            un_disp_col = None
            if cols_proy['un_disp']:
                un_disp_col = cols_proy['un_disp'] + "_num" if (cols_proy['un_disp'] + "_num") in ds_feat.columns else cols_proy['un_disp']
            
            if un_disp_col and un_disp_col in ds_feat.columns:
                unidades_vendidas = pd.to_numeric(ds_feat['unidades_vendidas'], errors='coerce').fillna(0)
                unidades_disp = pd.to_numeric(ds_feat[un_disp_col], errors='coerce').fillna(0)
                total_unidades = unidades_vendidas + unidades_disp
                
                # Porcentaje vendido
                mask_total_valido = total_unidades > 0
                ds_feat.loc[mask_total_valido, '_porcentaje_vendido_feat'] = (
                    unidades_vendidas[mask_total_valido] / total_unidades[mask_total_valido] * 100
                ).clip(0, 100)
                ds_feat.loc[~mask_total_valido, '_porcentaje_vendido_feat'] = 0
                
                # Ratio vendidas/disponibles
                mask_disp_valido = unidades_disp > 0
                ds_feat.loc[mask_disp_valido, '_ratio_vendidas_disponibles'] = (
                    unidades_vendidas[mask_disp_valido] / unidades_disp[mask_disp_valido]
                ).clip(0, 10)
                ds_feat.loc[~mask_disp_valido, '_ratio_vendidas_disponibles'] = 0
        
        # 4. Features temporales
        if 'meses_desde_inicio' in ds_feat.columns:
            meses_inicio = pd.to_numeric(ds_feat['meses_desde_inicio'], errors='coerce').fillna(0)
            
            # Categorías de antigüedad
            ds_feat['_antiguedad_proyecto'] = pd.cut(
                meses_inicio,
                bins=[0, 6, 12, 24, 36, np.inf],
                labels=['Muy Nuevo', 'Nuevo', 'Mediano', 'Antiguo', 'Muy Antiguo']
            )
            
            # Velocidad histórica (si hay datos)
            if 'unidades_vendidas' in ds_feat.columns:
                unidades_vendidas = pd.to_numeric(ds_feat['unidades_vendidas'], errors='coerce').fillna(0)
                meses_inicio = pd.to_numeric(ds_feat['meses_desde_inicio'], errors='coerce').clip(lower=0.1)
                ds_feat['_velocidad_historica'] = (unidades_vendidas / meses_inicio).replace([np.inf, -np.inf], np.nan).clip(0, 100).fillna(0)
        
        # 5. Features de área promedio
        if cols_proy['area_p']:
            area_col = cols_proy['area_p'] + "_num" if (cols_proy['area_p'] + "_num") in ds_feat.columns else cols_proy['area_p']
            if area_col in ds_feat.columns:
                area = pd.to_numeric(ds_feat[area_col], errors='coerce')
                
                # Categorías de área
                ds_feat['_categoria_area'] = pd.cut(
                    area,
                    bins=[0, 60, 80, 100, 120, np.inf],
                    labels=['Muy Pequeña', 'Pequeña', 'Mediana', 'Grande', 'Muy Grande']
                )
        
        # 6. Features de ubicación combinada
        if cols_proy['zona'] and cols_proy['estrato']:
            if cols_proy['zona'] in ds_feat.columns and cols_proy['estrato'] in ds_feat.columns:
                estrato_col = cols_proy['estrato'] + "_num" if (cols_proy['estrato'] + "_num") in ds_feat.columns else cols_proy['estrato']
                if estrato_col in ds_feat.columns:
                    ds_feat['_zona_estrato'] = (
                        ds_feat[cols_proy['zona']].astype(str) + "_" + 
                        ds_feat[estrato_col].astype(str)
                    )
        
        # 7. Features de densidad (precio por m² / área promedio)
        if cols_proy['precio_m2'] and cols_proy['area_p']:
            precio_m2_col = cols_proy['precio_m2'] + "_num" if (cols_proy['precio_m2'] + "_num") in ds_feat.columns else cols_proy['precio_m2']
            area_col = cols_proy['area_p'] + "_num" if (cols_proy['area_p'] + "_num") in ds_feat.columns else cols_proy['area_p']
            if precio_m2_col in ds_feat.columns and area_col in ds_feat.columns:
                precio_m2 = pd.to_numeric(ds_feat[precio_m2_col], errors='coerce')
                area = pd.to_numeric(ds_feat[area_col], errors='coerce')
                mask_valido = (precio_m2 > 0) & (area > 0) & precio_m2.notna() & area.notna()
                ds_feat.loc[mask_valido, '_densidad_precio_area'] = precio_m2[mask_valido] * area[mask_valido]
                ds_feat.loc[~mask_valido, '_densidad_precio_area'] = 0
        
        print(f"[OK] Features avanzados creados")
        print(f"  Total de features numéricos: {len([c for c in ds_feat.columns if ds_feat[c].dtype in [np.float64, np.int64]])}")
        print()
        
        return ds_feat
    except Exception as e:
        print(f"⚠ Error en Feature Engineering: {str(e)}")
        print("  Continuando sin features avanzados...")
        return ds

# ============================================================================
# MODELO RANDOM FOREST (FASE 2)
# ============================================================================

def entrenar_modelo_random_forest(ds, cols_proy, usar_modelo=True):
    """Entrena un modelo RandomForest para predecir meses_para_agotar.
    
    Returns:
        modelo: Modelo RandomForest entrenado (o None si no se puede entrenar)
        importancia_features: DataFrame con la importancia de cada feature (o None)
    """
    if not SKLEARN_AVAILABLE or not usar_modelo:
        return None, None
    
    print("=" * 70)
    print("  ENTRENAMIENTO DEL MODELO RANDOM FOREST")
    print("=" * 70)
    print()
    
    try:
        # Preparar datos
        ds_modelo = ds.copy()
        
        # Filtrar datos válidos
        mask_valido = (
            ds_modelo['meses_para_agotar'].notna() &
            (ds_modelo['meses_para_agotar'] > 0) &
            (ds_modelo['meses_para_agotar'] <= 120) &
            (~ds_modelo.get('_es_anomalia', pd.Series([False] * len(ds_modelo))))
        )
        
        ds_valido = ds_modelo[mask_valido].copy()
        
        if len(ds_valido) < 10:
            print("⚠ No hay suficientes datos para entrenar el modelo (mínimo 10 proyectos)")
            return None, None
        
        # Seleccionar features numéricos
        features_numericos = []
        for col in ds_valido.columns:
            if col.startswith('_') and ds_valido[col].dtype in [np.float64, np.int64]:
                if col not in ['meses_para_agotar', '_es_anomalia']:
                    if ds_valido[col].notna().sum() > len(ds_valido) * 0.5:
                        features_numericos.append(col)
        
        # Features categóricos (one-hot encoding)
        features_categoricos = []
        if cols_proy['zona'] and cols_proy['zona'] in ds_valido.columns:
            features_categoricos.append(cols_proy['zona'])
        if cols_proy['estrato'] and cols_proy['estrato'] in ds_valido.columns:
            features_categoricos.append(cols_proy['estrato'])
        if '_tamano_proyecto' in ds_valido.columns:
            features_categoricos.append('_tamano_proyecto')
        if '_antiguedad_proyecto' in ds_valido.columns:
            features_categoricos.append('_antiguedad_proyecto')
        if '_categoria_area' in ds_valido.columns:
            features_categoricos.append('_categoria_area')
        
        # Crear X (features) y y (target)
        X_numericos = ds_valido[features_numericos].fillna(0)
        
        # One-hot encoding para categóricas
        X_categoricos = pd.DataFrame()
        for col in features_categoricos:
            if col in ds_valido.columns:
                dummies = pd.get_dummies(ds_valido[col].astype(str), prefix=col, dummy_na=True)
                X_categoricos = pd.concat([X_categoricos, dummies], axis=1)
        
        # Combinar features
        if not X_categoricos.empty:
            X = pd.concat([X_numericos.reset_index(drop=True), X_categoricos.reset_index(drop=True)], axis=1)
        else:
            X = X_numericos
        
        y = ds_valido['meses_para_agotar'].values
        
        if len(X.columns) == 0:
            print("⚠ No se encontraron features válidos para el modelo")
            return None, None
        
        # Entrenar modelo
        print(f"  Entrenando modelo con {len(X)} proyectos y {len(X.columns)} features...")
        print(f"  Features numéricos: {len(features_numericos)}")
        print(f"  Features categóricos (one-hot): {len(X_categoricos.columns) if not X_categoricos.empty else 0}")
        print()
        
        # Usar TimeSeriesSplit para validación temporal
        if len(X) >= 5:
            tscv = TimeSeriesSplit(n_splits=min(5, len(X) // 2))
            
            # Entrenar modelo con mejores hiperparámetros
            modelo = RandomForestRegressor(
                n_estimators=100,
                max_depth=10,
                min_samples_split=5,
                min_samples_leaf=2,
                random_state=42,
                n_jobs=-1
            )
            
            # Validación cruzada
            from sklearn.model_selection import cross_val_score
            scores = cross_val_score(modelo, X, y, cv=tscv, scoring='neg_mean_absolute_error')
            mae_scores = -scores
            print(f"  Validación temporal (MAE): {mae_scores.mean():.2f} ± {mae_scores.std():.2f} meses")
            print()
            
            # Entrenar modelo final
            modelo.fit(X, y)
            
            # Importancia de features
            importancia = pd.DataFrame({
                'feature': X.columns,
                'importancia': modelo.feature_importances_
            }).sort_values('importancia', ascending=False)
            
            print("  Top-10 features más importantes:")
            for idx, row in importancia.head(10).iterrows():
                print(f"    - {row['feature']}: {row['importancia']:.4f}")
            print()
            
            print("[OK] Modelo entrenado exitosamente")
            print()
            
            return modelo, importancia
        else:
            print("⚠ No hay suficientes datos para validación temporal")
            return None, None
            
    except Exception as e:
        print(f"⚠ Error en entrenamiento de modelo: {str(e)}")
        print("  Continuando sin modelo ML...")
        return None, None

# ============================================================================
# MÉTRICAS COMPUESTAS (FASE 2)
# ============================================================================

def calcular_score_compuesto(ds, cols_proy):
    """Calcula un score compuesto que combina múltiples métricas.
    SIEMPRE devuelve valores válidos, incluso si faltan algunos factores."""
    try:
        print("=" * 70)
        print("  CÁLCULO DE SCORE COMPUESTO")
        print("=" * 70)
        print()
        
        ds_score = ds.copy()
        
        # Normalizar cada métrica a escala 0-1
        scores_normalizados = {}
        
        # 1. Score de velocidad (invertido: menor meses = mayor score)
        if 'meses_para_agotar' in ds_score.columns:
            meses = pd.to_numeric(ds_score['meses_para_agotar'], errors='coerce')
            meses_validos = meses.dropna()
            if not meses_validos.empty and meses_validos.max() > meses_validos.min():
                score_velocidad = 1.0 - ((meses - meses_validos.min()) / (meses_validos.max() - meses_validos.min()))
                score_velocidad = score_velocidad.clip(0, 1).fillna(0.5)
                scores_normalizados['velocidad'] = score_velocidad
            else:
                scores_normalizados['velocidad'] = pd.Series(0.5, index=ds_score.index)
        else:
            scores_normalizados['velocidad'] = pd.Series(0.5, index=ds_score.index)
        
        # 2. Score de penetración de mercado
        if '_porcentaje_vendido_feat' in ds_score.columns:
            porcentaje = pd.to_numeric(ds_score['_porcentaje_vendido_feat'], errors='coerce').fillna(0)
            scores_normalizados['penetracion'] = (porcentaje / 100).clip(0, 1)
        else:
            scores_normalizados['penetracion'] = pd.Series(0.0, index=ds_score.index)
        
        # 3. Score de velocidad histórica
        if '_velocidad_historica' in ds_score.columns:
            vel_hist = pd.to_numeric(ds_score['_velocidad_historica'], errors='coerce').fillna(0)
            vel_hist_validos = vel_hist[vel_hist > 0]
            if not vel_hist_validos.empty and vel_hist_validos.max() > vel_hist_validos.min():
                score_vel_hist = (vel_hist - vel_hist_validos.min()) / (vel_hist_validos.max() - vel_hist_validos.min())
                score_vel_hist = score_vel_hist.clip(0, 1)
                score_vel_hist = score_vel_hist.fillna(0.5)
                scores_normalizados['velocidad_historica'] = score_vel_hist
            else:
                scores_normalizados['velocidad_historica'] = pd.Series(0.5, index=ds_score.index)
        else:
            scores_normalizados['velocidad_historica'] = pd.Series(0.5, index=ds_score.index)
        
        # 4. Score de posición relativa (percentil en segmento)
        if '_precio_m2_percentil_zona' in ds_score.columns:
            percentil = pd.to_numeric(ds_score['_precio_m2_percentil_zona'], errors='coerce').fillna(50)
            scores_normalizados['posicion_precio'] = ((100 - percentil) / 100).clip(0, 1)
        else:
            scores_normalizados['posicion_precio'] = pd.Series(0.5, index=ds_score.index)
        
        # 5. Score compuesto (ponderado)
        # Pesos: velocidad 40%, penetración 25%, velocidad histórica 20%, posición precio 15%
        pesos = {
            'velocidad': 0.40,
            'penetracion': 0.25,
            'velocidad_historica': 0.20,
            'posicion_precio': 0.15
        }
        
        score_compuesto = pd.Series(0.0, index=ds_score.index)
        for key, peso in pesos.items():
            if key in scores_normalizados:
                score_compuesto += scores_normalizados[key] * peso
        
        ds_score['Score_Compuesto'] = score_compuesto.clip(0, 1).fillna(0.5)
        
        # Clasificación basada en score compuesto
        def clasificar_por_score_compuesto(score):
            if pd.isna(score) or score < 0:
                return 'Moderado_Compuesto'
            if score >= 0.67:
                return 'Exitoso_Compuesto'
            elif score >= 0.33:
                return 'Moderado_Compuesto'
            else:
                return 'Mejorable_Compuesto'
        
        ds_score['Clasificacion_Compuesta'] = ds_score['Score_Compuesto'].apply(clasificar_por_score_compuesto)
        
        # GARANTIZAR que todos tengan score compuesto válido
        mask_sin_score = ds_score['Score_Compuesto'].isna()
        if mask_sin_score.any():
            ds_score.loc[mask_sin_score, 'Score_Compuesto'] = 0.5
            ds_score.loc[mask_sin_score, 'Clasificacion_Compuesta'] = 'Moderado_Compuesto'
        
        print(f"[OK] Score compuesto calculado")
        score_validos = ds_score['Score_Compuesto'].dropna()
        if len(score_validos) > 0:
            print(f"  Rango: {score_validos.min():.3f} - {score_validos.max():.3f}")
            print(f"  Promedio: {score_validos.mean():.3f}")
        print()
        
        return ds_score
    except Exception as e:
        print(f"⚠ Error en cálculo de score compuesto: {str(e)}")
        print("  Asignando valores por defecto...")
        ds['Score_Compuesto'] = 0.5
        ds['Clasificacion_Compuesta'] = 'Moderado_Compuesto'
        return ds

# ============================================================================
# CLASIFICACIÓN
# ============================================================================

def clasificar_por_factores_alternativos(row):
    """Clasifica un proyecto usando factores alternativos cuando no hay meses_para_agotar.
    Siempre devuelve una clasificación válida (Exitoso, Moderado, o Mejorable).
    
    Args:
        row: Serie de pandas con los datos del proyecto
    
    Returns:
        tuple: (clasificacion, score) donde clasificacion es 'Exitoso', 'Moderado', o 'Mejorable'
    """
    # Intentar usar velocidad de ventas si está disponible
    if 'velocidad_ventas' in row.index:
        velocidad = pd.to_numeric(row.get('velocidad_ventas'), errors='coerce')
        if pd.notna(velocidad) and velocidad > 0:
            if velocidad > 15:
                return ('Exitoso', 0.7)
            elif velocidad >= 8:
                return ('Moderado', 0.5)
            else:
                return ('Mejorable', 0.3)
    
    # Intentar usar porcentaje vendido si está disponible
    if '_porcentaje_vendido_feat' in row.index:
        porcentaje = pd.to_numeric(row.get('_porcentaje_vendido_feat'), errors='coerce')
        if pd.notna(porcentaje) and porcentaje >= 0:
            if porcentaje > 50:
                return ('Exitoso', 0.7)
            elif porcentaje > 25:
                return ('Moderado', 0.5)
            else:
                return ('Mejorable', 0.3)
    
    # Intentar usar unidades vendidas si está disponible
    if 'unidades_vendidas' in row.index:
        unidades = pd.to_numeric(row.get('unidades_vendidas'), errors='coerce')
        if pd.notna(unidades) and unidades >= 0:
            if unidades > 50:
                return ('Exitoso', 0.65)
            elif unidades > 20:
                return ('Moderado', 0.5)
            else:
                return ('Mejorable', 0.35)
    
    # Si no hay ningún factor disponible, usar clasificación neutra
    return ('Moderado', 0.5)

def clasificar_proyectos_global(ds):
    """Clasifica proyectos usando método global (fallback).
    GARANTIZA que TODOS los proyectos tengan una clasificación válida."""
    # Asegurar que la columna meses_para_agotar existe
    if 'meses_para_agotar' not in ds.columns:
        ds['meses_para_agotar'] = np.nan
    
    valid = pd.to_numeric(ds['meses_para_agotar'], errors='coerce')
    valid_positive = valid[(valid > 0) & valid.notna()]
    
    # Si hay datos válidos, usar percentiles
    if len(valid_positive) >= 3:
        # Calcular percentiles globales
        q1 = valid_positive.quantile(0.33)
        q2 = valid_positive.quantile(0.67)
        
        # Normalizar score
        max_meses = valid_positive.max()
        min_meses = valid_positive.min()
        rango = max_meses - min_meses
        
        def calcular_score_y_clasificacion(idx):
            x = pd.to_numeric(ds.loc[idx, 'meses_para_agotar'], errors='coerce')
            if pd.isna(x) or x <= 0:
                # Si no hay datos válidos, usar clasificación por defecto basada en otros factores
                resultado = clasificar_por_factores_alternativos(ds.loc[idx])
                return resultado
            
            # Score normalizado
            if rango > 0:
                score = 1.0 - ((x - min_meses) / rango)
                score = float(max(0.0, min(1.0, score)))
            else:
                score = 0.5
            
            # Clasificación
            if x <= q1:
                clasificacion = 'Exitoso'
            elif x <= q2:
                clasificacion = 'Moderado'
            else:
                clasificacion = 'Mejorable'
            
            return (clasificacion, float(score))
        
        # Aplicar clasificación
        results = ds.index.to_series().apply(calcular_score_y_clasificacion)
        ds['Clasificacion'] = results.apply(lambda x: x[0] if isinstance(x, tuple) and len(x) >= 1 else 'Moderado')
        ds['Score_Exito'] = results.apply(lambda x: float(x[1]) if isinstance(x, tuple) and len(x) >= 2 else 0.5)
    else:
        # Si no hay suficientes datos, clasificar por factores alternativos
        print("  ⚠ Pocos datos válidos, usando clasificación por factores alternativos")
        resultados = ds.apply(clasificar_por_factores_alternativos, axis=1)
        ds['Clasificacion'] = resultados.apply(lambda x: x[0] if isinstance(x, tuple) else 'Moderado')
        ds['Score_Exito'] = resultados.apply(lambda x: x[1] if isinstance(x, tuple) and len(x) > 1 else 0.5)
    
    # GARANTIZAR que TODOS tengan clasificación válida
    mask_sin_clasificar = ~ds['Clasificacion'].isin(['Exitoso', 'Moderado', 'Mejorable'])
    if mask_sin_clasificar.any():
        print(f"  ⚠ {mask_sin_clasificar.sum()} proyectos sin clasificación válida, asignando 'Moderado' por defecto")
        ds.loc[mask_sin_clasificar, 'Clasificacion'] = 'Moderado'
        ds.loc[mask_sin_clasificar, 'Score_Exito'] = 0.5
    
    return ds

def clasificar_proyectos_por_segmento(ds, cols_proy):
    """Clasifica proyectos en Exitoso, Moderado o Mejorable basado en velocidad, 
    comparando dentro de cada segmento (Zona/Estrato/Tipo_VIS).
    GARANTIZA que TODOS los proyectos tengan una clasificación válida."""
    
    print("=" * 70)
    print("  CLASIFICACIÓN DE PROYECTOS POR SEGMENTOS")
    print("=" * 70)
    print()
    
    # Crear columna de segmento
    segmento_cols = []
    if cols_proy['zona'] and cols_proy['zona'] in ds.columns:
        segmento_cols.append(cols_proy['zona'])
    if cols_proy['estrato'] and cols_proy['estrato'] in ds.columns:
        segmento_cols.append(cols_proy['estrato'])
    
    # Buscar columna de Tipo VIS
    tipo_vis_col = None
    for c in ds.columns:
        if 'tipo vis' in c.lower() or 'tipo_vis' in c.lower():
            tipo_vis_col = c
            break
    
    if tipo_vis_col:
        segmento_cols.append(tipo_vis_col)
    
    # Crear segmento combinado
    if segmento_cols:
        # Filtrar valores nulos para crear segmento
        segmento_mask = ds[segmento_cols].notna().all(axis=1)
        ds.loc[segmento_mask, '_segmento'] = ds.loc[segmento_mask, segmento_cols].apply(
            lambda x: '|'.join([str(v) if pd.notna(v) else 'N/A' for v in x]), axis=1
        )
        ds.loc[~segmento_mask, '_segmento'] = 'Sin_Segmento'
    else:
        ds['_segmento'] = 'Sin_Segmento'
    
    # Inicializar columnas de clasificación con valores por defecto
    # IMPORTANTE: Inicializar con 'Moderado' en lugar de 'Sin Clasificar' para garantizar clasificación válida
    ds['Clasificacion'] = 'Moderado'  # Clasificación por defecto
    ds['Score_Exito'] = 0.5  # Score neutro por defecto
    ds['_metodo_clasificacion'] = 'Pendiente'
    
    # Clasificar por segmento
    segmentos = ds['_segmento'].unique()
    print(f"  Segmentos encontrados: {len(segmentos)}")
    print()
    
    for segmento in segmentos:
        ds_segmento = ds[ds['_segmento'] == segmento]
        
        # Filtrar proyectos válidos (sin anomalías críticas y con meses_para_agotar válido)
        meses_col = pd.to_numeric(ds_segmento['meses_para_agotar'], errors='coerce')
        valid_mask = (meses_col > 0) & meses_col.notna() & (meses_col <= 120)
        valid_segmento = ds_segmento[valid_mask]
        
        # Si hay menos de 3 proyectos válidos en el segmento, usar método global
        if len(valid_segmento) < 3:
            continue  # Se clasificarán después con método global
        
        # Calcular métricas del segmento para múltiples variables
        meses_seg = pd.to_numeric(valid_segmento['meses_para_agotar'], errors='coerce')
        q1_seg = meses_seg.quantile(0.33)
        q2_seg = meses_seg.quantile(0.67)
        min_meses_seg = meses_seg.min()
        max_meses_seg = meses_seg.max()
        rango_seg = max_meses_seg - min_meses_seg
        
        # Calcular métricas de velocidad
        velocidad_seg = pd.to_numeric(valid_segmento.get('velocidad_ventas', pd.Series([0] * len(valid_segmento))), errors='coerce')
        velocidad_seg_valida = velocidad_seg[velocidad_seg > 0]
        if len(velocidad_seg_valida) > 0:
            mediana_velocidad_seg = velocidad_seg_valida.median()
            p75_velocidad_seg = velocidad_seg_valida.quantile(0.75)
            p25_velocidad_seg = velocidad_seg_valida.quantile(0.25)
        else:
            mediana_velocidad_seg = 0
            p75_velocidad_seg = 0
            p25_velocidad_seg = 0
        
        # Calcular métricas de porcentaje vendido
        porcentaje_vendido_seg = pd.to_numeric(valid_segmento.get('_porcentaje_vendido_feat', pd.Series([0] * len(valid_segmento))), errors='coerce')
        porcentaje_seg_valido = porcentaje_vendido_seg[porcentaje_vendido_seg >= 0]
        if len(porcentaje_seg_valido) > 0:
            mediana_porcentaje_seg = porcentaje_seg_valido.median()
            p75_porcentaje_seg = porcentaje_seg_valido.quantile(0.75)
            p25_porcentaje_seg = porcentaje_seg_valido.quantile(0.25)
        else:
            mediana_porcentaje_seg = 0
            p75_porcentaje_seg = 0
            p25_porcentaje_seg = 0
        
        # Calcular métricas de tamaño (unidades totales)
        tot_un_col = cols_proy.get('tot_un', '')
        tot_un_col_num = tot_un_col + "_num" if (tot_un_col + "_num") in valid_segmento.columns else tot_un_col
        if tot_un_col_num in valid_segmento.columns:
            tamano_seg = pd.to_numeric(valid_segmento[tot_un_col_num], errors='coerce')
            tamano_seg_valido = tamano_seg[tamano_seg > 0]
            if len(tamano_seg_valido) > 0:
                mediana_tamano_seg = tamano_seg_valido.median()
            else:
                mediana_tamano_seg = 0
        else:
            mediana_tamano_seg = 0
        
        # Clasificar proyectos del segmento considerando múltiples variables
        for idx in ds_segmento[valid_mask].index:
            meses = pd.to_numeric(ds_segmento.loc[idx, 'meses_para_agotar'], errors='coerce')
            
            if pd.isna(meses) or meses <= 0:
                continue
            
            # 1. Score de velocidad (meses para agotar) - PESO 40%
            if rango_seg > 0:
                score_velocidad = 1.0 - ((meses - min_meses_seg) / rango_seg)
                score_velocidad = float(max(0.0, min(1.0, score_velocidad)))
            else:
                score_velocidad = 0.5
            
            # 2. Score de velocidad de ventas (unidades/mes) - PESO 25%
            velocidad = pd.to_numeric(ds_segmento.loc[idx, 'velocidad_ventas'] if 'velocidad_ventas' in ds_segmento.columns else 0, errors='coerce')
            if pd.notna(velocidad) and velocidad > 0 and p75_velocidad_seg > p25_velocidad_seg:
                # Normalizar velocidad respecto al segmento
                score_vel_ventas = min(1.0, max(0.0, (velocidad - p25_velocidad_seg) / (p75_velocidad_seg - p25_velocidad_seg)))
            elif pd.notna(velocidad) and velocidad > 0 and mediana_velocidad_seg > 0:
                # Comparar con mediana
                score_vel_ventas = min(1.0, max(0.0, velocidad / (mediana_velocidad_seg * 2)))
            else:
                score_vel_ventas = 0.3  # Penalizar velocidad baja/inexistente
            
            # 3. Score de porcentaje vendido - PESO 20%
            porcentaje = pd.to_numeric(ds_segmento.loc[idx, '_porcentaje_vendido_feat'] if '_porcentaje_vendido_feat' in ds_segmento.columns else 0, errors='coerce')
            if pd.notna(porcentaje) and porcentaje >= 0:
                if p75_porcentaje_seg > p25_porcentaje_seg:
                    score_porcentaje = min(1.0, max(0.0, (porcentaje - p25_porcentaje_seg) / (p75_porcentaje_seg - p25_porcentaje_seg)))
                else:
                    score_porcentaje = min(1.0, porcentaje / 100.0)  # Normalizar a 0-100%
            else:
                score_porcentaje = 0.2  # Penalizar porcentaje bajo/inexistente
            
            # 4. Score de tamaño del proyecto - PESO 10%
            # Proyectos medianos (50-150 unidades) tienden a ser más exitosos
            if tot_un_col_num in ds_segmento.columns:
                tamano = pd.to_numeric(ds_segmento.loc[idx, tot_un_col_num], errors='coerce')
                if pd.notna(tamano) and tamano > 0:
                    if 50 <= tamano <= 150:
                        score_tamano = 1.0  # Tamaño óptimo
                    elif 25 <= tamano < 50 or 150 < tamano <= 200:
                        score_tamano = 0.7  # Tamaño aceptable
                    elif tamano < 25:
                        score_tamano = 0.5  # Muy pequeño
                    else:
                        score_tamano = 0.6  # Muy grande
                else:
                    score_tamano = 0.5
            else:
                score_tamano = 0.5
            
            # 5. Score de patrón de ventas - PESO 5%
            patron = str(ds_segmento.loc[idx, 'Patron_Ventas'] if 'Patron_Ventas' in ds_segmento.columns else 'Sin datos')
            if 'Acelerado' in patron:
                score_patron = 1.0
            elif 'Constante' in patron:
                score_patron = 0.7
            elif 'Desacelerado' in patron:
                score_patron = 0.3
            else:
                score_patron = 0.5
            
            # Score compuesto ponderado
            score_compuesto = (
                score_velocidad * 0.40 +      # Meses para agotar (invertido)
                score_vel_ventas * 0.25 +     # Velocidad de ventas
                score_porcentaje * 0.20 +     # Porcentaje vendido
                score_tamano * 0.10 +         # Tamaño del proyecto
                score_patron * 0.05           # Patrón de ventas
            )
            
            # Clasificación basada en score compuesto
            if score_compuesto >= 0.67:
                clasificacion = 'Exitoso'
            elif score_compuesto >= 0.33:
                clasificacion = 'Moderado'
            else:
                clasificacion = 'Mejorable'
            
            # Ajustar score para que coincida con los rangos esperados
            if clasificacion == 'Exitoso':
                score_final = 0.62 + (score_compuesto * 0.17)  # Rango: 0.62 - 0.79
            elif clasificacion == 'Moderado':
                score_final = 0.50 + (score_compuesto * 0.12)  # Rango: 0.50 - 0.62
            else:
                score_final = 0.21 + (score_compuesto * 0.29)  # Rango: 0.21 - 0.50
            
            ds.loc[idx, 'Clasificacion'] = clasificacion
            ds.loc[idx, 'Score_Exito'] = float(max(0.0, min(1.0, score_final)))
            ds.loc[idx, '_metodo_clasificacion'] = f'Segmento: {segmento} (Multi-variable)'
        
        print(f"  Segmento '{segmento}': {len(valid_segmento)} proyectos clasificados")
        if len(valid_segmento) > 0:
            exitosos = (ds.loc[ds_segmento[valid_mask].index, 'Clasificacion'] == 'Exitoso').sum()
            moderados = (ds.loc[ds_segmento[valid_mask].index, 'Clasificacion'] == 'Moderado').sum()
            mejorables = (ds.loc[ds_segmento[valid_mask].index, 'Clasificacion'] == 'Mejorable').sum()
            print(f"    - Exitosos: {exitosos}, Moderados: {moderados}, Mejorables: {mejorables}")
    
    # Clasificar proyectos que aún tienen clasificación por defecto usando método global
    # Solo clasificar los que realmente no fueron clasificados por segmento
    mask_pendiente = ds['_metodo_clasificacion'] == 'Pendiente'
    if mask_pendiente.any():
        print()
        print(f"  Clasificando {mask_pendiente.sum()} proyectos pendientes con método global...")
        try:
            ds_pendientes = ds[mask_pendiente].copy()
            ds_global = clasificar_proyectos_global(ds_pendientes)
            ds.loc[mask_pendiente, 'Clasificacion'] = ds_global['Clasificacion']
            ds.loc[mask_pendiente, 'Score_Exito'] = ds_global['Score_Exito']
            ds.loc[mask_pendiente, '_metodo_clasificacion'] = 'Global'
        except Exception as e:
            print(f"  ⚠ Error en clasificación global: {str(e)}")
            print("  Manteniendo clasificación por defecto 'Moderado'")
            # Asegurar que todos tengan clasificación válida
            ds.loc[mask_pendiente, 'Clasificacion'] = 'Moderado'
            ds.loc[mask_pendiente, 'Score_Exito'] = 0.5
            ds.loc[mask_pendiente, '_metodo_clasificacion'] = 'Por defecto (error)'
    
    # Ajustar score para que coincida con los rangos esperados
    def ajustar_score(row):
        score = pd.to_numeric(row.get('Score_Exito', 0.5), errors='coerce')
        if pd.isna(score):
            score = 0.5
        
        clasif = str(row.get('Clasificacion', 'Moderado')).strip()
        
        if clasif == 'Exitoso':
            return float(0.62 + (score * 0.17))  # Rango: 0.62 - 0.79
        elif clasif == 'Moderado':
            return float(0.50 + (score * 0.12))  # Rango: 0.50 - 0.62
        elif clasif == 'Mejorable':
            return float(0.21 + (score * 0.29))  # Rango: 0.21 - 0.50
        else:
            return 0.5
    
    ds['Score_Exito'] = ds.apply(ajustar_score, axis=1).astype(float)
    
    # GARANTIZAR que TODOS los proyectos tengan clasificación válida
    mask_invalida = ~ds['Clasificacion'].isin(['Exitoso', 'Moderado', 'Mejorable'])
    if mask_invalida.any():
        print(f"  ⚠ {mask_invalida.sum()} proyectos con clasificación inválida, corrigiendo...")
        ds.loc[mask_invalida, 'Clasificacion'] = 'Moderado'
        ds.loc[mask_invalida, 'Score_Exito'] = 0.5
        ds.loc[mask_invalida, '_metodo_clasificacion'] = 'Por defecto'
    
    print()
    print("[OK] Clasificación por segmentos completada:")
    print(f"  - Exitosos: {len(ds[ds['Clasificacion'] == 'Exitoso'])}")
    print(f"  - Moderados: {len(ds[ds['Clasificacion'] == 'Moderado'])}")
    print(f"  - Mejorables: {len(ds[ds['Clasificacion'] == 'Mejorable'])}")
    
    # Verificar que no haya proyectos sin clasificar
    sin_clasificar = len(ds[~ds['Clasificacion'].isin(['Exitoso', 'Moderado', 'Mejorable'])])
    if sin_clasificar > 0:
        print(f"  ⚠ ADVERTENCIA: {sin_clasificar} proyectos aún sin clasificación válida")
    else:
        print(f"  ✓ Todos los {len(ds)} proyectos tienen clasificación válida")
    print()
    
    return ds

def clasificar_proyectos(ds, cols_proy):
    """Función principal de clasificación que incluye validación y clasificación por segmentos.
    GARANTIZA que todos los proyectos tengan clasificación válida."""
    # 1. Validar datos y detectar anomalías
    ds = validar_datos(ds, cols_proy)
    
    # 2. Clasificar por segmentos
    ds = clasificar_proyectos_por_segmento(ds, cols_proy)
    
    return ds

def determinar_patron_ventas(ds, cols):
    """Determina el patrón de ventas mejorado considerando múltiples factores.
    SIEMPRE devuelve un patrón válido para todos los proyectos.
    
    Factores considerados:
    - Velocidad de ventas actual
    - Tiempo transcurrido desde inicio
    - Porcentaje de unidades vendidas
    - Comparación con velocidad promedio del segmento
    """
    try:
        print("=" * 70)
        print("  DETERMINACIÓN DE PATRÓN DE VENTAS MEJORADO")
        print("=" * 70)
        print()
        
        ds_patron = ds.copy()
        
        # Calcular porcentaje de ventas
        ds_patron['_porcentaje_vendido'] = 0.0
        
        if 'unidades_vendidas' in ds_patron.columns:
            # Intentar obtener unidades disponibles
            un_disp_col = None
            if cols['un_disp']:
                un_disp_col = cols['un_disp'] + "_num" if (cols['un_disp'] + "_num") in ds_patron.columns else cols['un_disp']
                if un_disp_col not in ds_patron.columns:
                    un_disp_col = None
            
            # Calcular total de unidades
            if cols['tot_un']:
                tot_un_col = cols['tot_un'] + "_num" if (cols['tot_un'] + "_num") in ds_patron.columns else cols['tot_un']
                if tot_un_col in ds_patron.columns:
                    ds_patron['_total_unidades'] = pd.to_numeric(ds_patron[tot_un_col], errors='coerce').fillna(0)
                else:
                    # Fallback: sumar vendidas + disponibles
                    if un_disp_col and un_disp_col in ds_patron.columns:
                        ds_patron['_total_unidades'] = (
                            pd.to_numeric(ds_patron['unidades_vendidas'], errors='coerce').fillna(0) +
                            pd.to_numeric(ds_patron[un_disp_col], errors='coerce').fillna(0)
                        )
                    else:
                        ds_patron['_total_unidades'] = pd.to_numeric(ds_patron['unidades_vendidas'], errors='coerce').fillna(0)
            else:
                # Si no hay total, sumar vendidas + disponibles
                if un_disp_col and un_disp_col in ds_patron.columns:
                    ds_patron['_total_unidades'] = (
                        pd.to_numeric(ds_patron['unidades_vendidas'], errors='coerce').fillna(0) +
                        pd.to_numeric(ds_patron[un_disp_col], errors='coerce').fillna(0)
                    )
                else:
                    ds_patron['_total_unidades'] = pd.to_numeric(ds_patron['unidades_vendidas'], errors='coerce').fillna(0)
            
            # Calcular porcentaje vendido
            mask_total_valido = (
                (ds_patron['_total_unidades'] > 0) & 
                ds_patron['_total_unidades'].notna() &
                ds_patron['unidades_vendidas'].notna()
            )
            if mask_total_valido.any():
                ds_patron.loc[mask_total_valido, '_porcentaje_vendido'] = (
                    pd.to_numeric(ds_patron.loc[mask_total_valido, 'unidades_vendidas'], errors='coerce') / 
                    ds_patron.loc[mask_total_valido, '_total_unidades'] * 100
                ).clip(upper=100)
        else:
            ds_patron['_total_unidades'] = 0
        
        # Calcular velocidad promedio por segmento (si existe)
        if '_segmento' in ds_patron.columns and 'velocidad_ventas' in ds_patron.columns:
            # Calcular promedio por segmento, excluyendo valores inválidos
            velocidad_valida = pd.to_numeric(ds_patron['velocidad_ventas'], errors='coerce').replace([np.inf, -np.inf], np.nan)
            velocidad_prom_segmento = ds_patron.groupby('_segmento')['velocidad_ventas'].transform('mean')
            # Reemplazar valores inválidos en el resultado
            velocidad_prom_segmento = pd.to_numeric(velocidad_prom_segmento, errors='coerce').replace([np.inf, -np.inf], np.nan)
            ds_patron['_velocidad_prom_segmento'] = velocidad_prom_segmento.fillna(0)
        else:
            if 'velocidad_ventas' in ds_patron.columns:
                velocidad_valida = pd.to_numeric(ds_patron['velocidad_ventas'], errors='coerce').replace([np.inf, -np.inf], np.nan)
                velocidad_prom_global = velocidad_valida.mean()
                ds_patron['_velocidad_prom_segmento'] = velocidad_prom_global if not pd.isna(velocidad_prom_global) else 0
            else:
                ds_patron['_velocidad_prom_segmento'] = 0
        
        def patron_mejorado(row):
            """Determina el patrón de ventas considerando múltiples factores."""
            # Asegurar tipos numéricos correctos
            velocidad = pd.to_numeric(row.get('velocidad_ventas', 0), errors='coerce')
            meses_desde_inicio = pd.to_numeric(row.get('meses_desde_inicio', 0), errors='coerce')
            porcentaje_vendido = pd.to_numeric(row.get('_porcentaje_vendido_feat', row.get('_porcentaje_vendido', 0)), errors='coerce')
            velocidad_prom_seg = pd.to_numeric(row.get('_velocidad_prom_segmento', 0), errors='coerce')
            
            # Rellenar NaN con valores por defecto
            if pd.isna(velocidad):
                velocidad = 0.0
            if pd.isna(meses_desde_inicio):
                meses_desde_inicio = 0.0
            if pd.isna(porcentaje_vendido):
                porcentaje_vendido = 0.0
            if pd.isna(velocidad_prom_seg):
                velocidad_prom_seg = velocidad if velocidad > 0 else 1.0
            
            # Validar datos
            if velocidad <= 0:
                return 'Sin datos'
            
            # Asegurar que velocidad_prom_seg sea positiva
            if velocidad_prom_seg <= 0:
                velocidad_prom_seg = velocidad  # Usar velocidad propia como referencia
            
            # Calcular ratio de velocidad vs promedio del segmento
            ratio_velocidad = velocidad / velocidad_prom_seg if velocidad_prom_seg > 0 else 1.0
            
            # Factor de tiempo: proyectos más antiguos deberían tener más vendido
            factor_tiempo = 1.0
            if meses_desde_inicio > 0 and porcentaje_vendido >= 0:
                # Esperado: ~2-3% por mes en proyectos exitosos
                porcentaje_esperado = min(meses_desde_inicio * 2.5, 100)
                if porcentaje_vendido < porcentaje_esperado * 0.5:
                    factor_tiempo = 0.7  # Desacelerado
                elif porcentaje_vendido > porcentaje_esperado * 1.5:
                    factor_tiempo = 1.3  # Acelerado
            
            # Clasificación mejorada
            # Acelerado: Alta velocidad Y alta penetración Y ratio > 1.2
            if (velocidad > 15 and 
                ratio_velocidad > 1.2 and 
                (porcentaje_vendido > 30 or factor_tiempo >= 1.2)):
                return 'Acelerado'
            
            # Desacelerado: Baja velocidad O baja penetración O ratio < 0.8
            if (velocidad < 8 or 
                ratio_velocidad < 0.8 or 
                (meses_desde_inicio > 12 and porcentaje_vendido < 20)):
                return 'Desacelerado'
            
            # Constante: Velocidad media, ratio cercano a 1, penetración normal
            if (8 <= velocidad <= 15 and 
                0.8 <= ratio_velocidad <= 1.2):
                return 'Constante'
            
            # Clasificación por velocidad si no hay otros datos
            if velocidad > 15:
                return 'Acelerado'
            elif velocidad >= 8:
                return 'Constante'
            else:
                return 'Desacelerado'
        
        ds_patron['Patron_Ventas'] = ds_patron.apply(patron_mejorado, axis=1)
        
        # GARANTIZAR que todos tengan un patrón válido
        if 'Patron_Ventas' not in ds_patron.columns:
            ds_patron['Patron_Ventas'] = 'Sin datos'
        else:
            mask_sin_patron = ds_patron['Patron_Ventas'].isna() | (ds_patron['Patron_Ventas'] == '')
            if mask_sin_patron.any():
                ds_patron.loc[mask_sin_patron, 'Patron_Ventas'] = 'Sin datos'
        
        # Resumen de patrones
        patrones = ds_patron['Patron_Ventas'].value_counts()
        print("  Patrones de ventas determinados:")
        for patron, count in patrones.items():
            print(f"    - {patron}: {count} proyectos")
        print()
        
        # Limpiar columnas temporales
        columnas_temp = ['_porcentaje_vendido', '_total_unidades', '_velocidad_prom_segmento']
        for col in columnas_temp:
            if col in ds_patron.columns:
                ds_patron = ds_patron.drop(columns=[col], errors='ignore')
        
        return ds_patron
    except Exception as e:
        print(f"⚠ Error en determinación de patrón de ventas: {str(e)}")
        print("  Asignando patrón por defecto 'Sin datos'...")
        ds['Patron_Ventas'] = 'Sin datos'
        return ds

# ============================================================================
# GENERAR ARCHIVO FINAL
# ============================================================================

def generar_archivo_final(proj_ds, cols_proy, key_pry):
    """Genera el DataFrame final con el formato esperado.
    GARANTIZA que todas las columnas tengan los tipos de datos correctos."""
    print("=" * 70)
    print("  GENERANDO ARCHIVO FINAL")
    print("=" * 70)
    print()
    
    resultado = pd.DataFrame()
    
    # Código y nombre del proyecto
    # Buscar columna de código de proyecto de forma flexible
    key_para_codigo = None
    if cols_proy.get('codigo') and cols_proy['codigo'] in proj_ds.columns:
        key_para_codigo = cols_proy['codigo']
    elif key_pry and key_pry in proj_ds.columns:
        key_para_codigo = key_pry
    else:
        # Buscar cualquier columna que contenga 'codigo' y 'proyecto'
        for col in proj_ds.columns:
            col_lower = col.lower()
            if 'codigo' in col_lower and 'proyecto' in col_lower:
                key_para_codigo = col
                break
        # Si no se encuentra, buscar columna que contenga 'cod' y 'proyecto'
        if not key_para_codigo:
            for col in proj_ds.columns:
                col_lower = col.lower()
                if 'cod' in col_lower and 'proyecto' in col_lower:
                    key_para_codigo = col
                    break
    
    if key_para_codigo:
        resultado['Codigo_Proyecto'] = proj_ds[key_para_codigo].astype(str)
    else:
        # Último recurso: usar el índice
        resultado['Codigo_Proyecto'] = proj_ds.index.astype(str)
    
    if cols_proy['nombre'] and cols_proy['nombre'] in proj_ds.columns:
        resultado['Proyecto'] = proj_ds[cols_proy['nombre']].astype(str)
    else:
        resultado['Proyecto'] = resultado['Codigo_Proyecto']
    
    # Clasificación y score - GARANTIZAR que sean válidos
    if 'Clasificacion' in proj_ds.columns:
        # Validar y corregir clasificaciones inválidas
        clasificaciones_validas = ['Exitoso', 'Moderado', 'Mejorable']
        mask_invalida = ~proj_ds['Clasificacion'].isin(clasificaciones_validas)
        if mask_invalida.any():
            proj_ds.loc[mask_invalida, 'Clasificacion'] = 'Moderado'
        resultado['Clasificacion'] = proj_ds['Clasificacion'].astype(str)
    else:
        resultado['Clasificacion'] = 'Moderado'
    
    if 'Score_Exito' in proj_ds.columns:
        resultado['Score_Exito'] = pd.to_numeric(proj_ds['Score_Exito'], errors='coerce').fillna(0.5).clip(0, 1)
    else:
        resultado['Score_Exito'] = 0.5
    
    # Score compuesto (FASE 2)
    if 'Score_Compuesto' in proj_ds.columns:
        resultado['Score_Compuesto'] = pd.to_numeric(proj_ds['Score_Compuesto'], errors='coerce').fillna(0.5).clip(0, 1)
    else:
        resultado['Score_Compuesto'] = 0.5
    
    # Clasificación compuesta (opcional)
    if 'Clasificacion_Compuesta' in proj_ds.columns:
        resultado['Clasificacion_Compuesta'] = proj_ds['Clasificacion_Compuesta'].astype(str)
    else:
        resultado['Clasificacion_Compuesta'] = 'Moderado_Compuesto'
    
    # Ubicación
    if cols_proy['zona'] and cols_proy['zona'] in proj_ds.columns:
        resultado['Zona'] = proj_ds[cols_proy['zona']].astype(str).fillna('N/A')
    else:
        resultado['Zona'] = 'N/A'
    
    if cols_proy['barrio'] and cols_proy['barrio'] in proj_ds.columns:
        resultado['Barrio'] = proj_ds[cols_proy['barrio']].astype(str).fillna('N/A')
    else:
        resultado['Barrio'] = 'N/A'
    
    if cols_proy['estrato']:
        estrato_col = cols_proy['estrato'] + "_num" if (cols_proy['estrato'] + "_num") in proj_ds.columns else cols_proy['estrato']
        if estrato_col in proj_ds.columns:
            estrato_numeric = pd.to_numeric(proj_ds[estrato_col], errors='coerce')
            # Convertir a entero, reemplazar NaN con 0 para luego convertir a string 'N/A' en app.py
            resultado['Estrato'] = estrato_numeric.fillna(0).astype(int)
            # Los que eran NaN se marcarán como 0, y en app.py se manejarán como 'N/A'
        else:
            resultado['Estrato'] = 0
    else:
        resultado['Estrato'] = 0
    
    # Precios y áreas - Asegurar tipos numéricos
    if cols_proy['precio_p']:
        precio_num = cols_proy['precio_p'] + "_num" if (cols_proy['precio_p'] + "_num") in proj_ds.columns else cols_proy['precio_p']
        if precio_num in proj_ds.columns:
            resultado['Precio_Promedio'] = pd.to_numeric(proj_ds[precio_num], errors='coerce').fillna(0).clip(lower=0)
        else:
            resultado['Precio_Promedio'] = 0.0
    else:
        resultado['Precio_Promedio'] = 0.0
    
    if cols_proy['area_p']:
        area_num = cols_proy['area_p'] + "_num" if (cols_proy['area_p'] + "_num") in proj_ds.columns else cols_proy['area_p']
        if area_num in proj_ds.columns:
            resultado['Area_Promedio'] = pd.to_numeric(proj_ds[area_num], errors='coerce').fillna(0).clip(lower=0)
        else:
            resultado['Area_Promedio'] = 0.0
    else:
        resultado['Area_Promedio'] = 0.0
    
    # Velocidad y unidades - Asegurar tipos numéricos correctos
    if 'velocidad_ventas' in proj_ds.columns:
        resultado['Velocidad_Ventas'] = pd.to_numeric(proj_ds['velocidad_ventas'], errors='coerce').fillna(0).clip(lower=0)
    else:
        resultado['Velocidad_Ventas'] = 0.0
    
    # Unidades vendidas - Asegurar tipo entero
    if 'unidades_vendidas' in proj_ds.columns:
        resultado['Unidades_Vendidas'] = pd.to_numeric(proj_ds['unidades_vendidas'], errors='coerce').fillna(0).clip(lower=0).astype(int)
    else:
        resultado['Unidades_Vendidas'] = 0
    
    # Unidades disponibles - Asegurar tipo entero
    if cols_proy['un_disp']:
        un_disp_col = cols_proy['un_disp'] + "_num" if (cols_proy['un_disp'] + "_num") in proj_ds.columns else cols_proy['un_disp']
        if un_disp_col and un_disp_col in proj_ds.columns:
            resultado['Unidades_Disponibles'] = pd.to_numeric(proj_ds[un_disp_col], errors='coerce').fillna(0).clip(lower=0).astype(int)
        else:
            resultado['Unidades_Disponibles'] = 0
    else:
        resultado['Unidades_Disponibles'] = 0
    
    # Patrón de ventas
    if 'Patron_Ventas' in proj_ds.columns:
        resultado['Patron_Ventas'] = proj_ds['Patron_Ventas'].astype(str).fillna('Sin datos')
    else:
        resultado['Patron_Ventas'] = 'Sin datos'
    
    # Meses para agotar (métrica útil para visualización)
    if 'meses_para_agotar' in proj_ds.columns:
        resultado['Meses_Para_Agotar'] = pd.to_numeric(proj_ds['meses_para_agotar'], errors='coerce').fillna(0).clip(lower=0, upper=120)
    else:
        resultado['Meses_Para_Agotar'] = 0.0
    
    # Meses desde inicio (métrica útil para visualización)
    if 'meses_desde_inicio' in proj_ds.columns:
        resultado['Meses_Desde_Inicio'] = pd.to_numeric(proj_ds['meses_desde_inicio'], errors='coerce').fillna(0).clip(lower=0)
    else:
        resultado['Meses_Desde_Inicio'] = 0.0
    
    # Coordenadas (si están disponibles)
    if cols_proy['coordenadas'] and cols_proy['coordenadas'] in proj_ds.columns:
        resultado['Coordenadas Reales'] = proj_ds[cols_proy['coordenadas']].astype(str).fillna('')
    else:
        resultado['Coordenadas Reales'] = ''
    
    # Tipo VIS (si está disponible)
    tipo_vis_col = None
    for c in proj_ds.columns:
        if 'tipo vis' in c.lower() or 'tipo_vis' in c.lower():
            tipo_vis_col = c
            break
    
    if tipo_vis_col and tipo_vis_col in proj_ds.columns:
        resultado['Tipo_VIS_Principal'] = proj_ds[tipo_vis_col].astype(str).fillna('N/A')
    else:
        resultado['Tipo_VIS_Principal'] = 'N/A'
    
    # Validación final: asegurar que todas las columnas tengan tipos correctos
    # Clasificacion
    mask_invalida = ~resultado['Clasificacion'].isin(['Exitoso', 'Moderado', 'Mejorable'])
    if mask_invalida.any():
        print(f"  ⚠ {mask_invalida.sum()} proyectos con clasificación inválida en resultado final, corrigiendo...")
        resultado.loc[mask_invalida, 'Clasificacion'] = 'Moderado'
        resultado.loc[mask_invalida, 'Score_Exito'] = 0.5
    
    # Asegurar tipos numéricos correctos
    columnas_numericas = ['Score_Exito', 'Score_Compuesto', 'Precio_Promedio', 'Area_Promedio', 
                          'Velocidad_Ventas', 'Meses_Para_Agotar', 'Meses_Desde_Inicio']
    for col in columnas_numericas:
        if col in resultado.columns:
            resultado[col] = pd.to_numeric(resultado[col], errors='coerce')
            if col in ['Score_Exito', 'Score_Compuesto']:
                resultado[col] = resultado[col].fillna(0.5).clip(0, 1)
            elif col in ['Precio_Promedio', 'Area_Promedio', 'Velocidad_Ventas']:
                resultado[col] = resultado[col].fillna(0).clip(lower=0)
            elif col == 'Meses_Para_Agotar':
                resultado[col] = resultado[col].fillna(0).clip(0, 120)
            elif col == 'Meses_Desde_Inicio':
                resultado[col] = resultado[col].fillna(0).clip(lower=0)
    
    # Asegurar tipos enteros correctos
    columnas_enteras = ['Unidades_Vendidas', 'Unidades_Disponibles', 'Estrato']
    for col in columnas_enteras:
        if col in resultado.columns:
            resultado[col] = pd.to_numeric(resultado[col], errors='coerce').fillna(0).clip(lower=0).astype(int)
    
    # Asegurar tipos string correctos
    columnas_string = ['Codigo_Proyecto', 'Proyecto', 'Clasificacion', 'Zona', 'Barrio', 
                       'Patron_Ventas', 'Coordenadas Reales', 'Tipo_VIS_Principal', 'Clasificacion_Compuesta']
    for col in columnas_string:
        if col in resultado.columns:
            resultado[col] = resultado[col].astype(str)
            # Rellenar valores vacíos según la columna
            if col in ['Zona', 'Barrio', 'Tipo_VIS_Principal']:
                resultado[col] = resultado[col].replace(['', 'nan', 'None'], 'N/A')
            elif col == 'Patron_Ventas':
                resultado[col] = resultado[col].replace(['', 'nan', 'None'], 'Sin datos')
            elif col == 'Coordenadas Reales':
                resultado[col] = resultado[col].replace(['nan', 'None'], '')
            elif col == 'Clasificacion':
                # Asegurar que solo haya valores válidos
                mask_invalida = ~resultado[col].isin(['Exitoso', 'Moderado', 'Mejorable'])
                resultado.loc[mask_invalida, col] = 'Moderado'
    
    # Mostrar resumen de columnas generadas
    print(f"[OK] Archivo final generado: {len(resultado)} proyectos")
    print(f"  Columnas ({len(resultado.columns)}): {list(resultado.columns)}")
    print()
    print(f"  Tipos de datos:")
    for col in sorted(resultado.columns):
        dtype = resultado[col].dtype
        # Contar valores nulos/NaN
        nulos = resultado[col].isna().sum() if pd.api.types.is_numeric_dtype(dtype) else (resultado[col] == '').sum() + (resultado[col] == 'N/A').sum()
        print(f"    - {col:30s}: {str(dtype):15s} (nulos/vacios: {nulos})")
    print()
    
    # Verificar clasificaciones
    print(f"  Distribución de clasificaciones:")
    print(f"    - Exitosos: {(resultado['Clasificacion'] == 'Exitoso').sum()}")
    print(f"    - Moderados: {(resultado['Clasificacion'] == 'Moderado').sum()}")
    print(f"    - Mejorables: {(resultado['Clasificacion'] == 'Mejorable').sum()}")
    
    # Verificar rangos de scores
    print(f"  Rangos de scores:")
    print(f"    - Score_Exito: {resultado['Score_Exito'].min():.3f} - {resultado['Score_Exito'].max():.3f} (promedio: {resultado['Score_Exito'].mean():.3f})")
    print(f"    - Score_Compuesto: {resultado['Score_Compuesto'].min():.3f} - {resultado['Score_Compuesto'].max():.3f} (promedio: {resultado['Score_Compuesto'].mean():.3f})")
    print()
    
    return resultado

# ============================================================================
# ANÁLISIS DE CARACTERÍSTICAS DE PROYECTOS EXITOSOS
# ============================================================================

def analizar_caracteristicas_exitosos(ds, cols_proy):
    """Analiza las características comunes de los proyectos exitosos.
    
    Args:
        ds: DataFrame con proyectos clasificados
        cols_proy: Diccionario con columnas de proyectos
    
    Returns:
        dict: Diccionario con características comunes de proyectos exitosos
    """
    try:
        print("=" * 70)
        print("  ANÁLISIS DE CARACTERÍSTICAS DE PROYECTOS EXITOSOS")
        print("=" * 70)
        print()
        
        # Filtrar proyectos exitosos
        exitosos = ds[ds['Clasificacion'] == 'Exitoso'].copy()
        
        if len(exitosos) == 0:
            print("  ⚠ No hay proyectos exitosos para analizar")
            return {}
        
        print(f"  Analizando {len(exitosos)} proyectos exitosos de {len(ds)} totales")
        print()
        
        caracteristicas = {}
        
        # 1. Velocidad de ventas
        if 'velocidad_ventas' in exitosos.columns:
            velocidad = pd.to_numeric(exitosos['velocidad_ventas'], errors='coerce')
            velocidad_valida = velocidad[velocidad > 0]
            if len(velocidad_valida) > 0:
                caracteristicas['velocidad_ventas'] = {
                    'promedio': float(velocidad_valida.mean()),
                    'mediana': float(velocidad_valida.median()),
                    'min': float(velocidad_valida.min()),
                    'max': float(velocidad_valida.max()),
                    'percentil_25': float(velocidad_valida.quantile(0.25)),
                    'percentil_75': float(velocidad_valida.quantile(0.75))
                }
        
        # 2. Meses para agotar
        if 'meses_para_agotar' in exitosos.columns:
            meses = pd.to_numeric(exitosos['meses_para_agotar'], errors='coerce')
            meses_valido = meses[meses > 0]
            if len(meses_valido) > 0:
                caracteristicas['meses_para_agotar'] = {
                    'promedio': float(meses_valido.mean()),
                    'mediana': float(meses_valido.median()),
                    'min': float(meses_valido.min()),
                    'max': float(meses_valido.max()),
                    'percentil_25': float(meses_valido.quantile(0.25)),
                    'percentil_75': float(meses_valido.quantile(0.75))
                }
        
        # 3. Porcentaje vendido
        if '_porcentaje_vendido_feat' in exitosos.columns:
            porcentaje = pd.to_numeric(exitosos['_porcentaje_vendido_feat'], errors='coerce')
            porcentaje_valido = porcentaje[porcentaje >= 0]
            if len(porcentaje_valido) > 0:
                caracteristicas['porcentaje_vendido'] = {
                    'promedio': float(porcentaje_valido.mean()),
                    'mediana': float(porcentaje_valido.median()),
                    'min': float(porcentaje_valido.min()),
                    'max': float(porcentaje_valido.max())
                }
        
        # 4. Precio promedio
        precio_col = None
        if cols_proy.get('precio_p'):
            precio_col = cols_proy['precio_p'] + "_num" if (cols_proy['precio_p'] + "_num") in exitosos.columns else cols_proy['precio_p']
        if not precio_col or precio_col not in exitosos.columns:
            # Buscar columna de precio
            for col in exitosos.columns:
                if 'precio' in col.lower() and 'prom' in col.lower() and 'm2' not in col.lower():
                    precio_col = col
                    break
        
        if precio_col and precio_col in exitosos.columns:
            precio = pd.to_numeric(exitosos[precio_col], errors='coerce')
            precio_valido = precio[precio > 0]
            if len(precio_valido) > 0:
                caracteristicas['precio_promedio'] = {
                    'promedio': float(precio_valido.mean()),
                    'mediana': float(precio_valido.median()),
                    'min': float(precio_valido.min()),
                    'max': float(precio_valido.max())
                }
        
        # 5. Área promedio
        area_col = None
        if cols_proy.get('area_p'):
            area_col = cols_proy['area_p'] + "_num" if (cols_proy['area_p'] + "_num") in exitosos.columns else cols_proy['area_p']
        if not area_col or area_col not in exitosos.columns:
            # Buscar columna de área
            for col in exitosos.columns:
                if 'area' in col.lower() and 'prom' in col.lower():
                    area_col = col
                    break
        
        if area_col and area_col in exitosos.columns:
            area = pd.to_numeric(exitosos[area_col], errors='coerce')
            area_valido = area[area > 0]
            if len(area_valido) > 0:
                caracteristicas['area_promedio'] = {
                    'promedio': float(area_valido.mean()),
                    'mediana': float(area_valido.median()),
                    'min': float(area_valido.min()),
                    'max': float(area_valido.max())
                }
        
        # 6. Precio por m²
        if cols_proy.get('precio_m2'):
            precio_m2_col = cols_proy['precio_m2'] + "_num" if (cols_proy['precio_m2'] + "_num") in exitosos.columns else cols_proy['precio_m2']
            if precio_m2_col and precio_m2_col in exitosos.columns:
                precio_m2 = pd.to_numeric(exitosos[precio_m2_col], errors='coerce')
                precio_m2_valido = precio_m2[precio_m2 > 0]
                if len(precio_m2_valido) > 0:
                    caracteristicas['precio_m2'] = {
                        'promedio': float(precio_m2_valido.mean()),
                        'mediana': float(precio_m2_valido.median()),
                        'min': float(precio_m2_valido.min()),
                        'max': float(precio_m2_valido.max())
                    }
        
        # 7. Tamaño del proyecto (unidades totales)
        if cols_proy.get('tot_un'):
            tot_un_col = cols_proy['tot_un'] + "_num" if (cols_proy['tot_un'] + "_num") in exitosos.columns else cols_proy['tot_un']
            if tot_un_col and tot_un_col in exitosos.columns:
                tot_un = pd.to_numeric(exitosos[tot_un_col], errors='coerce')
                tot_un_valido = tot_un[tot_un > 0]
                if len(tot_un_valido) > 0:
                    caracteristicas['tamano_proyecto'] = {
                        'promedio': float(tot_un_valido.mean()),
                        'mediana': float(tot_un_valido.median()),
                        'min': float(tot_un_valido.min()),
                        'max': float(tot_un_valido.max())
                    }
        
        # 8. Estrato más común
        if cols_proy.get('estrato') and cols_proy['estrato'] in exitosos.columns:
            estrato_col = cols_proy['estrato'] + "_num" if (cols_proy['estrato'] + "_num") in exitosos.columns else cols_proy['estrato']
            if estrato_col and estrato_col in exitosos.columns:
                estrato = pd.to_numeric(exitosos[estrato_col], errors='coerce')
                estrato_valido = estrato[estrato > 0]
                if len(estrato_valido) > 0:
                    estrato_moda = estrato_valido.mode()
                    if len(estrato_moda) > 0:
                        caracteristicas['estrato'] = {
                            'moda': float(estrato_moda.iloc[0]),
                            'promedio': float(estrato_valido.mean()),
                            'distribucion': {int(k): int(v) for k, v in estrato_valido.value_counts().head(5).to_dict().items()}
                        }
        
        # 9. Zona más común
        if cols_proy.get('zona') and cols_proy['zona'] in exitosos.columns:
            zona_counts = exitosos[cols_proy['zona']].value_counts()
            if len(zona_counts) > 0:
                caracteristicas['zona'] = {
                    'mas_comun': str(zona_counts.index[0]) if len(zona_counts) > 0 else None,
                    'distribucion': {str(k): int(v) for k, v in zona_counts.head(5).to_dict().items()}
                }
        
        # 10. Características de inmuebles agregadas (si existen)
        # Precio mediano de inmuebles
        for col in exitosos.columns:
            if 'precio' in col.lower() and 'median' in col.lower():
                precio_med = pd.to_numeric(exitosos[col], errors='coerce')
                precio_med_valido = precio_med[precio_med > 0]
                if len(precio_med_valido) > 0:
                    caracteristicas['precio_mediano_inmuebles'] = {
                        'promedio': float(precio_med_valido.mean()),
                        'mediana': float(precio_med_valido.median())
                    }
                break
        
        # Área mediana de inmuebles
        for col in exitosos.columns:
            if 'area' in col.lower() and 'median' in col.lower():
                area_med = pd.to_numeric(exitosos[col], errors='coerce')
                area_med_valido = area_med[area_med > 0]
                if len(area_med_valido) > 0:
                    caracteristicas['area_mediana_inmuebles'] = {
                        'promedio': float(area_med_valido.mean()),
                        'mediana': float(area_med_valido.median())
                    }
                break
        
        # 11. Patrón de ventas
        if 'Patron_Ventas' in exitosos.columns:
            patron_counts = exitosos['Patron_Ventas'].value_counts()
            if len(patron_counts) > 0:
                caracteristicas['patron_ventas'] = {
                    'mas_comun': str(patron_counts.index[0]) if len(patron_counts) > 0 else None,
                    'distribucion': {str(k): int(v) for k, v in patron_counts.to_dict().items()}
                }
        
        # 12. Meses desde inicio
        if 'meses_desde_inicio' in exitosos.columns:
            meses_ini = pd.to_numeric(exitosos['meses_desde_inicio'], errors='coerce')
            meses_ini_valido = meses_ini[meses_ini >= 0]
            if len(meses_ini_valido) > 0:
                caracteristicas['meses_desde_inicio'] = {
                    'promedio': float(meses_ini_valido.mean()),
                    'mediana': float(meses_ini_valido.median()),
                    'min': float(meses_ini_valido.min()),
                    'max': float(meses_ini_valido.max())
                }
        
        # 13. Score compuesto (si existe)
        if 'Score_Compuesto' in exitosos.columns:
            score_comp = pd.to_numeric(exitosos['Score_Compuesto'], errors='coerce')
            score_comp_valido = score_comp[score_comp >= 0]
            if len(score_comp_valido) > 0:
                caracteristicas['score_compuesto'] = {
                    'promedio': float(score_comp_valido.mean()),
                    'mediana': float(score_comp_valido.median()),
                    'min': float(score_comp_valido.min()),
                    'max': float(score_comp_valido.max())
                }
        
        # 14. Posición de precio (percentil)
        if '_precio_m2_percentil_zona' in exitosos.columns:
            percentil = pd.to_numeric(exitosos['_precio_m2_percentil_zona'], errors='coerce')
            percentil_valido = percentil[percentil >= 0]
            if len(percentil_valido) > 0:
                caracteristicas['posicion_precio_zona'] = {
                    'promedio': float(percentil_valido.mean()),
                    'mediana': float(percentil_valido.median())
                }
        
        print(f"  ✓ Analizadas {len(caracteristicas)} características")
        print()
        
        return caracteristicas
        
    except Exception as e:
        print(f"⚠ Error al analizar características: {str(e)}")
        import traceback
        traceback.print_exc()
        return {}

# ============================================================================
# FUNCIÓN PRINCIPAL
# ============================================================================

def main():
    """Función principal para ejecutar el script directamente."""
    try:
        # Cargar datos
        inm, pry = cargar_datos()
        
        # Detectar llaves
        key_inm, key_pry = detectar_llaves(inm, pry)
        
        # Unir datos
        inm_join = unir_datos(inm, pry, key_inm, key_pry)
        
        # Detectar columnas
        cols_inm = detectar_columnas_inmuebles(inm_join)
        cols_proy = detectar_columnas_proyectos(pry)
        
        # Agregar features
        proj_feat_u = agregar_features_unidad(inm_join, cols_inm, key_inm)
        
        # Calcular velocidad
        pry_vel = calcular_velocidad(pry, cols_proy)
        
        # Unir todo
        proj_ds = proj_feat_u.merge(
            pry_vel,
            left_on=key_inm,
            right_on=key_pry,
            how='left',
            suffixes=('', '_pry2')
        )
        
        # Feature Engineering Avanzado (FASE 2)
        proj_ds = crear_features_avanzados(proj_ds, cols_proy)
        
        # Entrenar Modelo RandomForest (FASE 2)
        modelo_rf, importancia_features = entrenar_modelo_random_forest(proj_ds, cols_proy, usar_modelo=True)
        
        # Calcular Score Compuesto (FASE 2)
        proj_ds = calcular_score_compuesto(proj_ds, cols_proy)
        
        # Clasificar proyectos
        proj_ds = clasificar_proyectos(proj_ds, cols_proy)
        
        # Determinar patrón de ventas
        proj_ds = determinar_patron_ventas(proj_ds, cols_proy)
        
        # Limpiar columnas temporales
        columnas_temp = ['_segmento', '_metodo_clasificacion', '_es_anomalia', '_razon_anomalia']
        columnas_a_eliminar = [col for col in columnas_temp if col in proj_ds.columns]
        columnas_intermedias = [col for col in proj_ds.columns if col.startswith('_') and col not in ['_precio_m2_percentil_zona', '_precio_m2_percentil_estrato', '_velocidad_historica', '_porcentaje_vendido_feat']]
        columnas_a_eliminar.extend(columnas_intermedias)
        proj_ds = proj_ds.drop(columns=columnas_a_eliminar, errors='ignore')
        
        # Generar archivo final
        resultado = generar_archivo_final(proj_ds, cols_proy, key_pry)
        
        # Guardar
        output_path = Path('proyectos_clasificados.xlsx')
        resultado.to_excel(output_path, index=False)
        
        print(f"[OK] Archivo generado exitosamente: {output_path.resolve()}")
        print(f"  Total de proyectos clasificados: {len(resultado)}")
        print()
        
        return 0
        
    except Exception as e:
        print(f"\n[ERROR] Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == '__main__':
    exit(main())
