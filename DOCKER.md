# 🐳 Docker Reference

## Comandos Rápidos

```bash
# Descargar e iniciar
docker pull tu-usuario/task-manager:latest
docker run -d -p 3000:3000 -v task-manager-data:/app/data --name task-manager tu-usuario/task-manager:latest

# Ver logs
docker logs -f task-manager

# Detener/Iniciar
docker stop task-manager
docker start task-manager

# Actualizar
docker pull tu-usuario/task-manager:latest
docker stop task-manager && docker rm task-manager
docker run -d -p 3000:3000 -v task-manager-data:/app/data --name task-manager tu-usuario/task-manager:latest
```

## Docker Compose

Crear `docker-compose.yml`:
```yaml
version: '3.8'
services:
  task-manager:
    image: tu-usuario/task-manager:latest
    container_name: task-manager
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - task-manager-data:/app/data

volumes:
  task-manager-data:
```

Usar:
```bash
docker-compose up -d      # Iniciar
docker-compose logs -f    # Ver logs
docker-compose down       # Detener
docker-compose pull       # Actualizar imagen
```

## Backup/Restore

```bash
# Backup
docker run --rm -v task-manager-data:/data -v $(pwd):/backup alpine tar czf /backup/backup.tar.gz -C /data .

# Restore
docker run --rm -v task-manager-data:/data -v $(pwd):/backup alpine tar xzf /backup/backup.tar.gz -C /data
```

## Health Check

```bash
curl http://localhost:3000/api/health
```

📖 **[Ver DEPLOYMENT.md para más detalles](./DEPLOYMENT.md)**
