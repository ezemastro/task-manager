.PHONY: help build push update dev clean test

# Variables
DOCKER_USER ?= ezemastro
IMAGE_NAME = task-manager
CONTAINER_NAME = task-manager
VERSION = $(shell date +%Y%m%d-%H%M%S)

help: ## Mostrar esta ayuda
	@echo "Comandos disponibles:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Construir imagen Docker
	@echo "🏗️  Construyendo imagen..."
	docker build -t $(IMAGE_NAME):latest -t $(IMAGE_NAME):$(VERSION) .
	@echo "✅ Imagen construida: $(IMAGE_NAME):latest"

push: ## Publicar imagen a Docker Hub
	@echo "📤 Publicando imagen a Docker Hub..."
	docker tag $(IMAGE_NAME):latest $(DOCKER_USER)/$(IMAGE_NAME):latest
	docker tag $(IMAGE_NAME):$(VERSION) $(DOCKER_USER)/$(IMAGE_NAME):$(VERSION)
	docker push $(DOCKER_USER)/$(IMAGE_NAME):latest
	docker push $(DOCKER_USER)/$(IMAGE_NAME):$(VERSION)
	@echo "✅ Imagen publicada: $(DOCKER_USER)/$(IMAGE_NAME):latest"

deploy: build push ## Construir y publicar imagen

dev: ## Iniciar en modo desarrollo con docker-compose
	docker-compose up

dev-build: ## Reconstruir e iniciar en modo desarrollo
	docker-compose up --build

stop: ## Detener contenedores
	docker-compose down

logs: ## Ver logs del contenedor
	docker logs -f $(CONTAINER_NAME)

shell: ## Abrir shell en el contenedor
	docker exec -it $(CONTAINER_NAME) sh

clean: ## Limpiar imágenes y contenedores antiguos
	docker system prune -f
	docker image prune -a -f

backup: ## Crear backup de la base de datos
	@echo "💾 Creando backup..."
	@mkdir -p ./backups
	docker run --rm \
		-v $(CONTAINER_NAME)-data:/data \
		-v $(PWD)/backups:/backup \
		alpine tar czf /backup/backup-$(VERSION).tar.gz -C /data .
	@echo "✅ Backup creado: ./backups/backup-$(VERSION).tar.gz"

restore: ## Restaurar backup (usar: make restore FILE=backup-file.tar.gz)
	@if [ -z "$(FILE)" ]; then \
		echo "❌ Error: Especifica el archivo con FILE=nombre-archivo.tar.gz"; \
		exit 1; \
	fi
	@echo "📥 Restaurando backup: $(FILE)"
	docker run --rm \
		-v $(CONTAINER_NAME)-data:/data \
		-v $(PWD)/backups:/backup \
		alpine tar xzf /backup/$(FILE) -C /data
	@echo "✅ Backup restaurado"

test-build: ## Probar que la imagen se construye correctamente
	docker build --no-cache -t $(IMAGE_NAME):test .
	@echo "✅ Build test exitoso"

update: ## Actualizar aplicación en producción
	@echo "🔄 Actualizando aplicación..."
	docker pull $(DOCKER_USER)/$(IMAGE_NAME):latest
	docker-compose down
	docker-compose up -d
	@echo "✅ Aplicación actualizada"

stats: ## Ver estadísticas de recursos
	docker stats $(CONTAINER_NAME)

health: ## Verificar health check
	@curl -s http://localhost:3000/api/health | jq .
