#!/bin/bash
set -e

echo "🚀 Construyendo imagen de Docker..."
echo ""

# Nombre de la imagen
IMAGE_NAME="task-manager"
VERSION=$(date +%Y%m%d-%H%M%S)

# Construir la imagen
docker build -t $IMAGE_NAME:latest -t $IMAGE_NAME:$VERSION .

echo ""
echo "✅ Imagen construida exitosamente!"
echo "   - $IMAGE_NAME:latest"
echo "   - $IMAGE_NAME:$VERSION"
echo ""
