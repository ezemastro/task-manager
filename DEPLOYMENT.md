# 🐳 Guía de Despliegue con Docker

Esta guía te ayudará a desplegar tu aplicación Task Manager en un servidor VPS usando Docker.

## 📋 Pre-requisitos

### En tu máquina local (desarrollo)
- Docker instalado
- Cuenta en [Docker Hub](https://hub.docker.com/) (gratis)
- Git instalado

### En tu VPS (servidor)
- Ubuntu/Debian Linux (o similar)
- Docker y Docker Compose instalados
- Puerto 3000 abierto (o el que prefieras)
- Acceso SSH al servidor

---

## 🏗️ PARTE 1: Preparar y Publicar la Imagen

### 1. Crear cuenta en Docker Hub

1. Ve a [hub.docker.com](https://hub.docker.com/)
2. Crea una cuenta gratuita
3. Verifica tu email

### 2. Configurar tu usuario de Docker Hub

Edita los siguientes archivos y reemplaza `tu-usuario` con tu usuario de Docker Hub:

- `docker-push.sh` (línea 6)
- `docker-update.sh` (línea 6)
- `docker-compose.prod.yml` (línea 5)

```bash
# Ejemplo: Si tu usuario es "juanperez", cambia:
DOCKER_USERNAME="tu-usuario"
# Por:
DOCKER_USERNAME="juanperez"
```

### 3. Hacer ejecutables los scripts

```bash
chmod +x docker-build.sh
chmod +x docker-push.sh
chmod +x docker-update.sh
```

### 4. Construir la imagen

```bash
./docker-build.sh
```

Esto creará una imagen Docker con:
- ✅ Frontend compilado (React + Vite)
- ✅ Backend compilado (Node.js + TypeScript)
- ✅ Todas las dependencias
- ✅ Optimizada para producción

### 5. Login en Docker Hub

```bash
docker login
```

Ingresa tu usuario y contraseña de Docker Hub.

### 6. Publicar la imagen

```bash
./docker-push.sh
```

Esto subirá tu imagen a Docker Hub y estará disponible públicamente en:
`https://hub.docker.com/r/tu-usuario/task-manager`

---

## 🚀 PARTE 2: Desplegar en el Servidor VPS

### 1. Conectar al servidor

```bash
ssh usuario@tu-servidor.com
```

### 2. Instalar Docker (si no está instalado)

```bash
# Actualizar paquetes
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Agregar usuario al grupo docker
sudo usermod -aG docker $USER

# Cerrar sesión y volver a conectar para aplicar cambios
exit
ssh usuario@tu-servidor.com

# Verificar instalación
docker --version
```

### 3. Instalar Docker Compose

```bash
# Instalar Docker Compose
sudo apt install docker-compose -y

# Verificar instalación
docker-compose --version
```

### 4. Crear directorio para la aplicación

```bash
mkdir -p ~/task-manager
cd ~/task-manager
```

### 5. Descargar el archivo docker-compose.prod.yml

Opción A - Si tienes git:
```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/task-manager.git .
```

Opción B - Crear manualmente:
```bash
# Crear el archivo
nano docker-compose.yml
```

Copia el contenido de `docker-compose.prod.yml` y pega en el editor.
- Cambia `tu-usuario/task-manager:latest` por tu usuario real
- Guarda con `Ctrl+O`, Enter, `Ctrl+X`

### 6. Iniciar la aplicación

```bash
docker-compose up -d
```

Este comando:
- 📥 Descarga la imagen de Docker Hub
- 🚀 Inicia el contenedor
- 💾 Crea un volumen para la base de datos
- ✅ Configura reinicio automático

### 7. Verificar que está corriendo

```bash
# Ver contenedores corriendo
docker ps

# Ver logs
docker logs task-manager

# Seguir logs en tiempo real
docker logs -f task-manager
```

### 8. Acceder a la aplicación

Abre tu navegador y ve a:
```
http://tu-servidor.com:3000
```

O si usas IP:
```
http://123.456.789.0:3000
```

---

## 🔄 PARTE 3: Actualizar la Aplicación

### Desde tu máquina local

Cuando hagas cambios en el código:

```bash
# 1. Construir nueva imagen
./docker-build.sh

# 2. Publicar a Docker Hub
./docker-push.sh
```

### En el servidor VPS

```bash
# Conectar al servidor
ssh usuario@tu-servidor.com
cd ~/task-manager

# Opción A: Usar el script (si lo tienes)
./docker-update.sh

# Opción B: Manualmente
docker-compose pull
docker-compose up -d
```

La actualización preserva:
- ✅ Base de datos (en el volumen persistente)
- ✅ Todos los datos de usuarios y proyectos
- ✅ Configuración

---

## 🔧 Comandos Útiles

### Gestión del contenedor

```bash
# Detener la aplicación
docker-compose down

# Iniciar la aplicación
docker-compose up -d

# Reiniciar la aplicación
docker-compose restart

# Ver estado
docker-compose ps

# Ver logs
docker-compose logs -f
```

### Backup de la base de datos

```bash
# Crear backup
docker run --rm \
  -v task-manager-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/database-backup-$(date +%Y%m%d).tar.gz -C /data .

# Restaurar backup
docker run --rm \
  -v task-manager-data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/database-backup-YYYYMMDD.tar.gz -C /data
```

### Limpiar recursos

```bash
# Eliminar imágenes antiguas
docker image prune -a

# Eliminar contenedores detenidos
docker container prune

# Eliminar todo lo no usado
docker system prune -a
```

---

## 🌐 PARTE 4: Configurar Dominio y HTTPS (Opcional)

### Usando Nginx como proxy reverso

1. **Instalar Nginx:**
```bash
sudo apt install nginx -y
```

2. **Configurar Nginx:**
```bash
sudo nano /etc/nginx/sites-available/task-manager
```

Contenido:
```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. **Habilitar sitio:**
```bash
sudo ln -s /etc/nginx/sites-available/task-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

4. **Instalar certificado SSL (HTTPS):**
```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtener certificado
sudo certbot --nginx -d tu-dominio.com

# Renovación automática (ya está configurada)
sudo certbot renew --dry-run
```

---

## 🔍 Solución de Problemas

### El contenedor no inicia

```bash
# Ver logs de error
docker logs task-manager

# Ver todos los eventos
docker events
```

### No puedo acceder desde el navegador

1. Verificar que el puerto esté abierto:
```bash
sudo ufw allow 3000
```

2. Verificar que el contenedor esté corriendo:
```bash
docker ps
```

3. Verificar en el servidor local:
```bash
curl http://localhost:3000/api/health
```

### La base de datos se perdió

Si eliminaste el volumen por error:
```bash
# Listar volúmenes
docker volume ls

# Crear volumen nuevo (si no existe)
docker volume create task-manager-data
```

La base de datos se inicializará desde cero.

### Problemas de permisos

```bash
# Ver permisos del volumen
docker volume inspect task-manager-data

# Si es necesario, recrear con permisos correctos
docker-compose down
docker volume rm task-manager-data
docker-compose up -d
```

---

## 📊 Monitoreo

### Ver uso de recursos

```bash
# Uso de recursos en tiempo real
docker stats

# Uso de disco de volúmenes
docker system df -v
```

### Logs persistentes

Para guardar logs en un archivo:
```bash
docker logs task-manager > ~/task-manager-logs.txt 2>&1
```

---

## 🔐 Seguridad

### Recomendaciones

1. **Firewall:**
```bash
sudo ufw enable
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw allow 3000  # Task Manager (o solo si no usas Nginx)
```

2. **Actualizar regularmente:**
```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Actualizar imágenes Docker
docker-compose pull
docker-compose up -d
```

3. **Backups automáticos:**

Crear un cron job:
```bash
crontab -e
```

Agregar:
```bash
# Backup diario a las 2 AM
0 2 * * * docker run --rm -v task-manager-data:/data -v ~/backups:/backup alpine tar czf /backup/db-$(date +\%Y\%m\%d).tar.gz -C /data .
```

---

## 📝 Resumen de URLs

- **Docker Hub:** `https://hub.docker.com/r/tu-usuario/task-manager`
- **Aplicación:** `http://tu-servidor.com:3000`
- **Health Check:** `http://tu-servidor.com:3000/api/health`

---

## 💡 Consejos

1. **Siempre haz backup antes de actualizar**
2. **Revisa los logs si algo no funciona**
3. **Usa HTTPS en producción**
4. **Configura backups automáticos**
5. **Monitorea el uso de recursos**
6. **Actualiza regularmente las imágenes**

---

## 🆘 Soporte

Si tienes problemas:

1. Revisa los logs: `docker logs task-manager`
2. Verifica el estado: `docker ps`
3. Prueba el health check: `curl http://localhost:3000/api/health`
4. Revisa la configuración de puertos y firewall

---

¡Feliz despliegue! 🚀
