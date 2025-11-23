#!/bin/bash
set -e

echo "🚀 Publicando imagen a Docker Hub..."
echo ""

# Configuración
DOCKER_USERNAME="ezemastro"  # Cambiar por tu usuario de Docker Hub
IMAGE_NAME="task-manager"
VERSION=$(date +%Y%m%d-%H%M%S)

# Verificar que estás logueado
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker no está corriendo"
    exit 1
fi

# Hacer login si no estás logueado
echo "📝 Verificando autenticación en Docker Hub..."
if ! docker info | grep -q "Username: $DOCKER_USERNAME"; then
    echo "Por favor, inicia sesión en Docker Hub:"
    docker login
fi

# Tag de la imagen con el usuario de Docker Hub
echo "🏷️  Etiquetando imagen..."
docker tag $IMAGE_NAME:latest $DOCKER_USERNAME/$IMAGE_NAME:latest
docker tag $IMAGE_NAME:latest $DOCKER_USERNAME/$IMAGE_NAME:$VERSION

# Push a Docker Hub
echo "⬆️  Subiendo imagen a Docker Hub..."
docker push $DOCKER_USERNAME/$IMAGE_NAME:latest
docker push $DOCKER_USERNAME/$IMAGE_NAME:$VERSION

echo ""
echo "✅ Imagen publicada exitosamente!"
echo "   - $DOCKER_USERNAME/$IMAGE_NAME:latest"
echo "   - $DOCKER_USERNAME/$IMAGE_NAME:$VERSION"
echo ""
echo "📝 Para usar en tu VPS, ejecuta:"
echo "   docker pull $DOCKER_USERNAME/$IMAGE_NAME:latest"
echo "   docker run -d -p 3000:3000 -v task-manager-data:/app/data $DOCKER_USERNAME/$IMAGE_NAME:latest"
echo ""
