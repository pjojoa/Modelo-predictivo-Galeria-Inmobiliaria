# 🚀 Guía de Despliegue en Render - ACTUALIZADA

Esta guía te ayudará a desplegar tu aplicación Flask en Render con las nuevas funcionalidades del chat asistente.

## 📋 Cambios Recientes

### Nuevas Funcionalidades Agregadas:
- ✅ Chat asistente con Google Gemini AI
- ✅ Endpoint `/api/chat` para conversación con IA
- ✅ Endpoint `/api/buscar-proyectos` para búsquedas avanzadas
- ✅ Contexto completo de proyectos para el asistente
- ✅ Búsqueda por constructor/vendedor

### Nuevas Dependencias:
- ✅ `google-generativeai>=0.3.0` (ya agregado en requirements.txt)
- ✅ `python-dotenv>=1.0.0` (ya agregado en requirements.txt)

## ✅ Archivos Actualizados

Los siguientes archivos han sido actualizados para el despliegue:

- ✅ `requirements.txt` - Incluye nuevas dependencias
- ✅ `render.yaml` - Configuración actualizada con variables de entorno para Gemini
- ✅ `Procfile` - Sin cambios (ya estaba correcto)
- ✅ `runtime.txt` - Sin cambios necesarios

## 🔧 Paso 1: Verificar el Repositorio

### 1.1 Verificar que Base Proyectos.xlsx esté en el repo

**IMPORTANTE**: El archivo `Base Proyectos.xlsx` debe estar en la raíz de tu repositorio.

```bash
# Verifica que el archivo esté en tu repo
ls -la "Base Proyectos.xlsx"
```

Si el archivo no está en el repo, agrégalo:

```bash
git add "Base Proyectos.xlsx"
git commit -m "Agregar archivo Base Proyectos.xlsx para despliegue"
git push
```

### 1.2 Verificar cambios pendientes

Asegúrate de que todos los cambios estén commiteados:

```bash
git status
git add .
git commit -m "Actualizar configuración para despliegue con chat asistente"
git push origin main
```

## 🌐 Paso 2: Configurar Variables de Entorno en Render

### 2.1 Acceder al Dashboard de Render

1. Ve a [render.com](https://render.com) e inicia sesión
2. Selecciona tu servicio `galeria-inmobiliaria` (o el nombre que le hayas dado)

### 2.2 Agregar Variable GEMINI_API_KEY (OBLIGATORIA)

**IMPORTANTE**: Esta variable es necesaria para que el chat asistente funcione.

1. En el dashboard de Render, ve a tu servicio
2. Click en **"Environment"** en el menú lateral
3. Haz clic en **"Add Environment Variable"**
4. Agrega:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: `AIzaSyCBeurnd1ylLJ0xM5WIECMVdMOtpnr4TjM` (tu API key de Gemini)
   - **Mark as Secret**: ✅ (recomendado)
5. Click en **"Save Changes"**

### 2.3 Agregar Variable GEMINI_MODEL (OPCIONAL)

Esta variable es opcional. Si no la agregas, se usará el valor por defecto `gemini-2.0-flash-exp`.

1. En la misma sección de Environment Variables
2. Haz clic en **"Add Environment Variable"**
3. Agrega:
   - **Key**: `GEMINI_MODEL`
   - **Value**: `gemini-2.0-flash-exp` (o el modelo que prefieras)
4. Click en **"Save Changes"**

### 2.4 Verificar Otras Variables (Opcionales)

Si usas Street Preview con Mapillary, asegúrate de tener:
- **Key**: `MAPILLARY_TOKEN`
- **Value**: (tu token de Mapillary)

## 🚀 Paso 3: Desplegar

### Opción A: Despliegue Automático (Recomendado)

Si `autoDeploy: true` está en `render.yaml` (ya está configurado), cada push a la rama `main` desplegará automáticamente.

1. Haz push a tu repositorio:
```bash
git push origin main
```

2. Render detectará el cambio y comenzará el despliegue automáticamente

### Opción B: Despliegue Manual

1. En el dashboard de Render, haz clic en **"Manual Deploy"**
2. Selecciona la rama `main` y el último commit
3. Click en **"Deploy"**

## ⏱️ Paso 4: Monitorear el Despliegue

1. Ve a la pestaña **"Logs"** en tu servicio de Render
2. Observa el proceso de build:
   - Instalación de dependencias (incluyendo google-generativeai)
   - Verificación de archivos
   - Inicio del servidor Gunicorn

### Logs Esperados

Deberías ver algo como:
```
Building...
==> Installing dependencies
==> pip install -r requirements.txt
...
Collecting google-generativeai>=0.3.0
Collecting python-dotenv>=1.0.0
...
==> Starting service
==> gunicorn app:app --workers 2 --threads 2 --timeout 180
[INFO] Starting gunicorn...
[INFO] Listening at: http://0.0.0.0:XXXX
```

## ✅ Paso 5: Verificar el Despliegue

Una vez completado el despliegue:

1. Render te dará una URL como: `https://galeria-inmobiliaria.onrender.com`
2. Abre la URL en tu navegador
3. Verifica que la aplicación cargue correctamente
4. Prueba el chat asistente:
   - Haz clic en el botón del robot en la esquina inferior derecha
   - Prueba una pregunta como: "¿Cuántos proyectos tiene Marval?"
   - Verifica que el asistente responda correctamente

### Endpoints para Verificar

- **Aplicación principal**: `https://tu-app.onrender.com/`
- **Diagnóstico**: `https://tu-app.onrender.com/api/diagnostico`
- **Chat API**: `https://tu-app.onrender.com/api/chat` (POST)
- **Búsqueda de proyectos**: `https://tu-app.onrender.com/api/buscar-proyectos` (POST)

## 🔍 Paso 6: Verificar Funcionalidad del Chat

### 6.1 Probar el Chat desde el Navegador

1. Abre tu aplicación en Render
2. Haz clic en el botón del robot (esquina inferior derecha)
3. Prueba estas preguntas:
   - "¿Cuántos proyectos tiene Marval?"
   - "Muéstrame proyectos exitosos en la zona Sur"
   - "¿Qué proyectos hay en el barrio Granada?"

### 6.2 Probar el Endpoint Directamente

Puedes probar el endpoint con curl o Postman:

```bash
curl -X POST https://tu-app.onrender.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "¿Cuántos proyectos tiene Marval?"}'
```

## ⚠️ Solución de Problemas

### Error: "API key de Gemini no configurada"

**Causa**: La variable de entorno `GEMINI_API_KEY` no está configurada.

**Solución**:
1. Ve a Render Dashboard → Tu Servicio → Environment
2. Verifica que `GEMINI_API_KEY` esté configurada
3. Si no está, agrégalo siguiendo el Paso 2.2
4. Reinicia el servicio (Render → Manual Deploy → Deploy)

### Error: "Error de autenticación con la API de Gemini"

**Causa**: La API key es inválida o ha expirado.

**Solución**:
1. Verifica que la API key sea correcta
2. Obtén una nueva API key de [Google AI Studio](https://makersuite.google.com/app/apikey)
3. Actualiza la variable `GEMINI_API_KEY` en Render
4. Reinicia el servicio

### El chat no responde o tarda mucho

**Causa**: Puede ser un problema de límites de la API de Gemini o cold start de Render.

**Solución**:
1. Verifica los logs en Render para ver errores específicos
2. Revisa si hay límites de rate en tu cuenta de Gemini
3. En el plan Free de Render, el primer request después de dormir puede tardar ~30 segundos

### Error al instalar dependencias

**Causa**: Problemas con las versiones de las dependencias.

**Solución**:
1. Verifica que `requirements.txt` tenga todas las dependencias:
   ```
   Flask>=3.0.0
   pandas>=2.0.0
   openpyxl>=3.1.0
   numpy>=1.24.0
   scikit-learn>=1.3.0
   gunicorn>=21.2.0
   google-generativeai>=0.3.0
   python-dotenv>=1.0.0
   ```
2. Revisa los logs de build en Render para ver el error específico

## 📝 Checklist de Despliegue

Antes de considerar el despliegue completo, verifica:

- [ ] `Base Proyectos.xlsx` está en el repositorio
- [ ] Todos los cambios están commiteados y pusheados
- [ ] `GEMINI_API_KEY` está configurada en Render (Environment Variables)
- [ ] `GEMINI_MODEL` está configurada (opcional, tiene valor por defecto)
- [ ] El servicio se despliega sin errores
- [ ] La aplicación carga correctamente en la URL de Render
- [ ] El chat asistente funciona (botón del robot visible y funcional)
- [ ] El asistente puede responder preguntas sobre proyectos
- [ ] El asistente puede responder preguntas sobre constructores (ej: Marval)
- [ ] Los endpoints de API funcionan (`/api/chat`, `/api/buscar-proyectos`)

## 🎯 Configuración Recomendada en Render Dashboard

### Settings del Servicio

1. **Name**: `galeria-inmobiliaria` (o el nombre que prefieras)
2. **Environment**: `Python 3`
3. **Region**: Elige la región más cercana a tus usuarios
4. **Branch**: `main` (o la rama que uses)
5. **Root Directory**: (dejar vacío, usa la raíz del repo)
6. **Auto-Deploy**: ✅ Habilitado (si quieres despliegue automático)

### Build & Deploy

- **Build Command**: `pip install -r requirements.txt` (ya configurado en render.yaml)
- **Start Command**: `gunicorn app:app --workers 2 --threads 2 --timeout 180 --bind 0.0.0.0:$PORT` (ya configurado)

### Environment Variables (IMPORTANTE)

Asegúrate de tener estas variables configuradas:

| Variable | Valor | Obligatorio | Descripción |
|----------|-------|-------------|-------------|
| `PYTHONUNBUFFERED` | `1` | ✅ | Ya configurado en render.yaml |
| `GEMINI_API_KEY` | `AIzaSyC...` | ✅ | **NUEVA** - API key de Gemini |
| `GEMINI_MODEL` | `gemini-2.0-flash-exp` | ❌ | Modelo de Gemini (opcional) |
| `MAPILLARY_TOKEN` | `...` | ❌ | Solo si usas Street Preview |

## 📊 Monitoreo Post-Despliegue

### Verificar Logs

1. Ve a Render Dashboard → Tu Servicio → Logs
2. Busca mensajes como:
   - `[INFO] Generando contexto de proyectos para el chat...`
   - `[OK] Contexto generado: XXXX caracteres`
   - `[OK] Encontrados X proyectos del constructor`

### Probar Funcionalidades

1. **Chat básico**: Pregunta general sobre proyectos
2. **Búsqueda por constructor**: "¿Cuántos proyectos tiene Marval?"
3. **Búsqueda por proyecto**: "Información sobre el proyecto X"
4. **Filtros**: "Proyectos exitosos en la zona Sur"

## 🎉 ¡Listo!

Tu aplicación debería estar funcionando en Render con todas las nuevas funcionalidades del chat asistente.

La URL será algo como: `https://galeria-inmobiliaria.onrender.com`

### Próximos Pasos

1. Prueba todas las funcionalidades del chat
2. Monitorea los logs para asegurar que todo funciona correctamente
3. Considera actualizar a un plan de pago si necesitas mejor rendimiento
4. Configura alertas en Render si es necesario

¡Feliz despliegue! 🚀

