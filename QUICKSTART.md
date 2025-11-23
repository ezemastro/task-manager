# 🚀 Quick Start - Despliegue con Docker

## Opción 1: GitHub Actions (Recomendado - Sin Docker Local)

### 1. Configurar Secrets en GitHub

Ve a tu repositorio → Settings → Secrets → Actions:
- `DOCKER_USERNAME`: tu usuario de Docker Hub
- `DOCKER_PASSWORD`: token de acceso de Docker Hub

### 2. Push a GitHub

```bash
git add .
git commit -m "Deploy setup"
git push origin main
```

GitHub Actions construye y publica automáticamente a Docker Hub.

### 3. Desplegar en tu Servidor

```bash
ssh usuario@tu-servidor.com

# Instalar Docker si no lo tienes
curl -fsSL https://get.docker.com | sh

# Descargar y ejecutar
docker pull tu-usuario/task-manager:latest
docker run -d -p 3000:3000 -v task-manager-data:/app/data --name task-manager tu-usuario/task-manager:latest
```

---

## Opción 2: Build Local (Si tienes Docker en tu máquina)

### 1. Construir

```bash
docker build -t tu-usuario/task-manager:latest .
```

### 2. Publicar

```bash
docker login
docker push tu-usuario/task-manager:latest
```

### 3. Desplegar en Servidor

```bash
docker pull tu-usuario/task-manager:latest
docker run -d -p 3000:3000 -v task-manager-data:/app/data --name task-manager tu-usuario/task-manager:latest
```

---

## ✅ Verificar

```
http://tu-servidor.com:3000
```

## 🔄 Actualizar

**Con GitHub Actions:**
```bash
git push origin main  # Construye automáticamente
```

**En el servidor:**
```bash
docker pull tu-usuario/task-manager:latest
docker stop task-manager
docker rm task-manager
docker run -d -p 3000:3000 -v task-manager-data:/app/data --name task-manager tu-usuario/task-manager:latest
```

📖 **[Ver DEPLOYMENT.md para guía completa](./DEPLOYMENT.md)**
