#!/bin/bash
set -e

echo "🔄 Actualizando aplicación en el servidor..."
echo ""

# Configuración
DOCKER_USERNAME="ezemastro"  # Cambiar por tu usuario de Docker Hub
IMAGE_NAME="task-manager"
CONTAINER_NAME="task-manager"

# Pull de la imagen más reciente
echo "⬇️  Descargando última versión..."
docker pull $DOCKER_USERNAME/$IMAGE_NAME:latest

# Detener contenedor actual si existe
if [ $(docker ps -q -f name=$CONTAINER_NAME) ]; then
    echo "⏸️  Deteniendo contenedor actual..."
    docker stop $CONTAINER_NAME
fi

# Eliminar contenedor antiguo si existe
if [ $(docker ps -aq -f name=$CONTAINER_NAME) ]; then
    echo "🗑️  Eliminando contenedor antiguo..."
    docker rm $CONTAINER_NAME
fi

# Iniciar nuevo contenedor
echo "🚀 Iniciando nuevo contenedor..."
docker run -d \
  --name $CONTAINER_NAME \
  --restart unless-stopped \
  -p 3000:3000 \
  -v task-manager-data:/app/data \
  $DOCKER_USERNAME/$IMAGE_NAME:latest

# Esperar un momento para verificar que está corriendo
sleep 3

# Verificar estado
if [ $(docker ps -q -f name=$CONTAINER_NAME) ]; then
    echo ""
    echo "✅ Aplicación actualizada y corriendo!"
    echo ""
    echo "📊 Estado del contenedor:"
    docker ps -f name=$CONTAINER_NAME
    echo ""
    echo "📝 Ver logs:"
    echo "   docker logs -f $CONTAINER_NAME"
else
    echo ""
    echo "❌ Error: El contenedor no está corriendo"
    echo "Ver logs para más información:"
    echo "   docker logs $CONTAINER_NAME"
    exit 1
fi
