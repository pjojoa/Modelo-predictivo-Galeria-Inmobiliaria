"""
Utilidades comunes para la aplicación
Módulo centralizado para evitar código duplicado
"""

import sys
import builtins

# Función helper para reemplazar caracteres Unicode problemáticos
def safe_encode(text):
    """Reemplaza caracteres Unicode problemáticos por equivalentes ASCII"""
    if not isinstance(text, str):
        return text
    replacements = {
        '\u2713': '[OK]',  # ✓
        '\u26a0': '[ADV]',  # ⚠
        '\u2714': '[OK]',  # ✔
        '\u274c': '[X]',   # ❌
        '\u2192': '->',    # →
    }
    for unicode_char, ascii_replacement in replacements.items():
        text = text.replace(unicode_char, ascii_replacement)
    return text

# Función wrapper para print que maneja codificación de forma segura
_original_print = print
def safe_print(*args, **kwargs):
    """Wrapper de print que maneja caracteres Unicode de forma segura"""
    # Siempre reemplazar caracteres Unicode problemáticos antes de imprimir
    safe_args = []
    for arg in args:
        if isinstance(arg, str):
            safe_args.append(safe_encode(arg))
        else:
            safe_args.append(arg)
    try:
        _original_print(*safe_args, **kwargs)
    except (UnicodeEncodeError, ValueError, OSError):
        # Si aún falla, intentar con encoding más agresivo
        try:
            safe_args_ascii = []
            for arg in safe_args:
                if isinstance(arg, str):
                    safe_args_ascii.append(arg.encode('ascii', 'replace').decode('ascii'))
                else:
                    safe_args_ascii.append(arg)
            _original_print(*safe_args_ascii, **kwargs)
        except:
            pass  # Si todo falla, silenciar el error

# Configurar print seguro en Windows
if sys.platform == 'win32':
    builtins.print = safe_print
    print = safe_print

