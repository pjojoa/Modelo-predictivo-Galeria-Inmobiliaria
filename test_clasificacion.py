"""Script de prueba para diagnosticar problemas en la generación de clasificación"""

import sys
import traceback

print("=" * 70)
print("  PRUEBA DE GENERACIÓN DE CLASIFICACIÓN")
print("=" * 70)
print()

try:
    # Importar app para usar la función de generación
    from app import generar_clasificacion_en_memoria
    print("✓ Función importada correctamente")
    print()
    
    # Intentar generar la clasificación
    print("Generando clasificación...")
    print()
    df = generar_clasificacion_en_memoria()
    
    print()
    print("=" * 70)
    print("  RESULTADO")
    print("=" * 70)
    print(f"  Proyectos generados: {len(df)}")
    
    if df.empty:
        print("  ⚠ ERROR: El DataFrame está vacío")
        print()
        print("  Posibles causas:")
        print("    - Error en la generación de datos")
        print("    - Archivo Base Proyectos.xlsx no encontrado")
        print("    - Error en alguna función de Fase 2")
    else:
        print(f"  ✓ Datos generados correctamente")
        print()
        print("  Columnas disponibles:")
        for col in df.columns:
            print(f"    - {col}")
        print()
        print("  Primeras filas:")
        print(df.head())
        print()
        
        # Verificar coordenadas
        if 'Coordenadas Reales' in df.columns:
            coord_count = df['Coordenadas Reales'].notna().sum()
            print(f"  Proyectos con coordenadas: {coord_count} / {len(df)}")
        else:
            print("  ⚠ No se encontró columna 'Coordenadas Reales'")
        
except Exception as e:
    print()
    print("=" * 70)
    print("  ERROR")
    print("=" * 70)
    print(f"  Error: {str(e)}")
    print()
    print("  Traceback completo:")
    traceback.print_exc()

