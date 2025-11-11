# 🚀 Guía de Despliegue en Render

Esta guía te ayudará a desplegar tu aplicación Flask en Render paso a paso.

## 📋 Requisitos Previos

1. **Cuenta en Render**: Crea una cuenta gratuita en [render.com](https://render.com)
2. **Repositorio Git**: Tu código debe estar en GitHub, GitLab o Bitbucket
3. **Archivo Base Proyectos.xlsx**: Debe estar incluido en tu repositorio (en la raíz del proyecto)

## ✅ Archivos Necesarios (Ya Configurados)

Tu proyecto ya tiene todos los archivos necesarios:

- ✅ `requirements.txt` - Dependencias Python
- ✅ `Procfile` - Comando de inicio para producción
- ✅ `render.yaml` - Configuración de Render
- ✅ `runtime.txt` - Versión de Python
- ✅ `app.py` - Aplicación Flask (configurada para producción)

## 🔧 Paso 1: Preparar el Repositorio

### 1.1 Verificar que Base Proyectos.xlsx esté en el repo

**IMPORTANTE**: El archivo `Base Proyectos.xlsx` debe estar en la raíz de tu repositorio. Render tiene un filesystem efímero, por lo que todos los archivos necesarios deben estar en el repositorio.

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

### 1.2 Verificar .gitignore

Asegúrate de que `Base Proyectos.xlsx` NO esté en `.gitignore`. El archivo `.gitignore` actual ya tiene la línea `!Base Proyectos.xlsx` que lo incluye explícitamente.

## 🌐 Paso 2: Crear el Servicio en Render

### 2.1 Crear Nuevo Servicio Web

1. Ve a [render.com](https://render.com) e inicia sesión
2. Haz clic en **"New +"** en el dashboard
3. Selecciona **"Web Service"**
4. Conecta tu repositorio (GitHub/GitLab/Bitbucket)
5. Selecciona el repositorio `Modelo-predictivo-Galeria-Inmobiliaria`

### 2.2 Configuración del Servicio

Render detectará automáticamente la configuración desde `render.yaml`, pero puedes verificar:

- **Name**: `galeria-inmobiliaria` (o el nombre que prefieras)
- **Environment**: `Python 3`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `gunicorn app:app --workers 2 --threads 2 --timeout 180 --bind 0.0.0.0:$PORT`
- **Plan**: `Free` (o el plan que prefieras)

### 2.3 Variables de Entorno

En la sección **"Environment Variables"**, agrega:

- **PYTHONUNBUFFERED**: `1` (ya está en render.yaml)
- **MAPILLARY_TOKEN**: (opcional) Tu token de Mapillary si usas Street Preview

Para agregar variables:
1. Ve a tu servicio en Render
2. Click en **"Environment"** en el menú lateral
3. Agrega las variables necesarias

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
2. Selecciona la rama y commit que deseas desplegar
3. Click en **"Deploy"**

## ⏱️ Paso 4: Monitorear el Despliegue

1. Ve a la pestaña **"Logs"** en tu servicio de Render
2. Observa el proceso de build:
   - Instalación de dependencias
   - Verificación de archivos
   - Inicio del servidor Gunicorn

### Logs Esperados

Deberías ver algo como:
```
Building...
==> Installing dependencies
==> pip install -r requirements.txt
...
==> Starting service
==> gunicorn app:app --workers 2 --threads 2 --timeout 180
[INFO] Starting gunicorn...
[INFO] Listening at: http://0.0.0.0:XXXX
```

## ✅ Paso 5: Verificar el Despliegue

Una vez completado el despliegue:

1. Render te dará una URL como: `https://galeria-inmobiliaria.onrender.com`
2. Visita la URL en tu navegador
3. Verifica que la aplicación cargue correctamente
4. Prueba los endpoints:
   - `/` - Página principal
   - `/api/proyectos` - API de proyectos
   - `/api/filtros` - API de filtros

## 🔍 Solución de Problemas

### Error: "No se encontró el archivo Base Proyectos.xlsx"

**Causa**: El archivo no está en el repositorio o no está en la raíz.

**Solución**:
1. Verifica que el archivo esté en la raíz del proyecto
2. Asegúrate de que NO esté en `.gitignore`
3. Haz commit y push del archivo:
```bash
git add "Base Proyectos.xlsx"
git commit -m "Agregar Base Proyectos.xlsx"
git push
```

### Error: "Module not found" o errores de importación

**Causa**: Faltan dependencias en `requirements.txt`.

**Solución**:
1. Verifica que todas las dependencias estén en `requirements.txt`
2. Si falta alguna, agrégala y haz push:
```bash
pip freeze > requirements.txt
git add requirements.txt
git commit -m "Actualizar dependencias"
git push
```

### Error: "Application failed to respond"

**Causa**: El servidor no está escuchando en el puerto correcto o hay un error en el código.

**Solución**:
1. Revisa los logs en Render para ver el error específico
2. Verifica que `app.py` no tenga `debug=True` en producción (ya está corregido)
3. Asegúrate de que Gunicorn esté configurado correctamente en `Procfile`

### Error: Timeout

**Causa**: El procesamiento de datos tarda demasiado (más de 180 segundos).

**Solución**:
1. Aumenta el timeout en `Procfile` y `render.yaml`:
```
--timeout 300
```
2. Optimiza el código de procesamiento si es posible

### La aplicación carga pero no muestra datos

**Causa**: Error al cargar o procesar `Base Proyectos.xlsx`.

**Solución**:
1. Revisa los logs en Render para ver errores específicos
2. Verifica que el archivo Excel tenga el formato correcto (hojas "Inmuebles" y "Proyectos")
3. Usa el endpoint `/api/diagnostico` para verificar el estado:
```
https://tu-app.onrender.com/api/diagnostico
```

## 📝 Notas Importantes

### Filesystem Efímero

Render tiene un filesystem efímero, lo que significa que:
- ✅ Los archivos en el repositorio están disponibles
- ❌ Los archivos generados en runtime se pierden al reiniciar
- ✅ Tu app genera datos en memoria, así que esto no es un problema

### Plan Free

El plan gratuito de Render tiene algunas limitaciones:
- ⏱️ El servicio se "duerme" después de 15 minutos de inactividad
- 🔄 El primer request después de dormir puede tardar ~30 segundos (cold start)
- 💾 512 MB de RAM
- 📊 100 GB de ancho de banda por mes

Para producción, considera actualizar a un plan de pago.

### Actualizaciones

Para actualizar la aplicación:
1. Haz cambios en tu código local
2. Haz commit y push:
```bash
git add .
git commit -m "Descripción de los cambios"
git push origin main
```
3. Render desplegará automáticamente (si `autoDeploy: true`)

## 🎯 Checklist Final

Antes de considerar el despliegue completo, verifica:

- [ ] `Base Proyectos.xlsx` está en el repositorio
- [ ] Todos los archivos de configuración están presentes
- [ ] El servicio se despliega sin errores
- [ ] La aplicación carga correctamente en la URL de Render
- [ ] Los endpoints de API funcionan
- [ ] Los datos se cargan y visualizan correctamente
- [ ] Las variables de entorno están configuradas (si son necesarias)

## 📞 Soporte

Si encuentras problemas:

1. Revisa los logs en Render (Dashboard → Tu Servicio → Logs)
2. Verifica el endpoint `/api/diagnostico` para diagnóstico
3. Revisa la documentación de Render: [docs.render.com](https://docs.render.com)

## 🎉 ¡Listo!

Tu aplicación debería estar funcionando en Render. La URL será algo como:
`https://galeria-inmobiliaria.onrender.com`

¡Feliz despliegue! 🚀

