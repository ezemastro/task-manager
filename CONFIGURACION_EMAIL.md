# Configuración de Email

Este documento explica cómo configurar el envío de emails para verificación y recuperación de contraseña.

## Opciones de Configuración

### Opción 1: Resend (Recomendado) ⭐

**Resend** es la opción más fácil y moderna para emails transaccionales.

#### ¿Por qué Resend?
- ✅ Configuración súper simple (solo una API key)
- ✅ 100 emails/día gratis (3,000/mes)
- ✅ No necesitas contraseñas de aplicación
- ✅ Mejor deliverability que Gmail
- ✅ Dashboard para ver emails enviados
- ✅ Perfecto para emails transaccionales

#### Configuración con Resend:

1. **Crear cuenta en Resend:**
   - Ve a https://resend.com
   - Regístrate (puedes usar tu Gmail)
   - Es gratis hasta 3,000 emails/mes

2. **Obtener API Key:**
   - En el dashboard, ve a "API Keys"
   - Click en "Create API Key"
   - Dale un nombre (ej: "task-manager-production")
   - Copia la clave (empieza con `re_`)

3. **Agregar dominio propio (Opcional pero recomendado):**
   
   Si tienes un dominio (ej: `tudominio.com`), puedes usarlo:
   
   - En Resend, ve a "Domains"
   - Click "Add Domain"
   - Ingresa tu dominio: `tudominio.com`
   - Resend te dará registros DNS que debes agregar:
     * **SPF** (TXT): Agrega un registro TXT en tu DNS
     * **DKIM** (TXT): Agrega un registro TXT en tu DNS
     * **DMARC** (TXT): Opcional pero recomendado
   
   **Ejemplo de registros DNS que te darán:**
   ```
   Tipo: TXT
   Nombre: @
   Valor: v=spf1 include:resend.com ~all

   Tipo: TXT
   Nombre: resend._domainkey
   Valor: [clave DKIM que te dan]
   ```

   - Espera 5-10 minutos para que se verifique
   - Una vez verificado, puedes enviar desde `noreply@tudominio.com`

4. **Configurar variables de entorno:**

   **Sin dominio propio:**
   ```env
   RESEND_API_KEY=re_tu_clave_aqui
   FROM_EMAIL=onboarding@resend.dev
   FROM_NAME=Gestión de Obras
   APP_URL=https://tuapp.com
   ```

   **Con dominio propio:**
   ```env
   RESEND_API_KEY=re_tu_clave_aqui
   FROM_EMAIL=noreply@tudominio.com
   FROM_NAME=Gestión de Obras
   APP_URL=https://tuapp.com
   ```

### Opción 2: Gmail SMTP

Si prefieres usar tu cuenta de Gmail:

1. **Activar verificación en 2 pasos:**
   - Ve a https://myaccount.google.com/security
   - Activa "Verificación en 2 pasos"

2. **Crear contraseña de aplicación:**
   - Ve a https://myaccount.google.com/apppasswords
   - Crea una contraseña para "Correo"
   - Copia la contraseña de 16 caracteres

3. **Configurar variables de entorno:**
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=tu-email@gmail.com
   SMTP_PASS=tu-contraseña-de-aplicacion
   FROM_EMAIL=tu-email@gmail.com
   FROM_NAME=Gestión de Obras
   APP_URL=https://tuapp.com
   ```

### Opción 3: SMTP de tu dominio

Si tu proveedor de hosting tiene email propio:

```env
SMTP_HOST=mail.tudominio.com
SMTP_PORT=587
SMTP_USER=noreply@tudominio.com
SMTP_PASS=tu-contraseña
FROM_EMAIL=noreply@tudominio.com
FROM_NAME=Gestión de Obras
APP_URL=https://tuapp.com
```

## Configuración en Producción

### Docker Compose

Edita `docker-compose.prod.yml`:

```yaml
services:
  api:
    environment:
      # Opción 1: Resend
      - RESEND_API_KEY=re_tu_clave_aqui
      - FROM_EMAIL=noreply@tudominio.com
      - FROM_NAME=Gestión de Obras
      - APP_URL=https://tuapp.com

      # O Opción 2: SMTP
      # - SMTP_HOST=smtp.gmail.com
      # - SMTP_PORT=587
      # - SMTP_USER=tu-email@gmail.com
      # - SMTP_PASS=tu-contraseña
      # - FROM_EMAIL=tu-email@gmail.com
      # - FROM_NAME=Gestión de Obras
      # - APP_URL=https://tuapp.com
```

## Testing en Desarrollo

Si no configuras nada, el sistema funcionará en modo desarrollo:
- Los emails NO se enviarán realmente
- Los links de verificación/reseteo se mostrarán en la consola del backend
- Puedes copiar los links de la consola y pegarlos en el navegador

Para probar en desarrollo:

1. Registra un usuario
2. Ve a la consola del backend (terminal donde corre `npm run dev`)
3. Verás algo como:
   ```
   📧 EMAIL DE PRUEBA (copia este link):
      Para: usuario@ejemplo.com
      🔗 Link de verificación: http://localhost:3000/verify-email?token=abc123...
   ```
4. Copia el link y ábrelo en el navegador

## Verificar Configuración

Una vez configurado, al iniciar el backend verás:

**Con Resend:**
```
✅ Configurando email con Resend
```

**Con SMTP:**
```
✅ Configurando email con SMTP personalizado
```

**Sin configurar:**
```
⚠️  Email no configurado. Los links se mostrarán en la consola.
📧 Opciones de configuración:
   1. Resend (Recomendado): RESEND_API_KEY + FROM_EMAIL
   2. SMTP: SMTP_HOST + SMTP_USER + SMTP_PASS
```

## Troubleshooting

### Emails no llegan

1. **Verifica spam/correo no deseado**
2. **Revisa los logs del backend** para errores
3. **Si usas Resend:** Verifica en el dashboard que el email se envió
4. **Si usas Gmail:** Verifica que la contraseña de aplicación sea correcta
5. **Si usas dominio propio:** Verifica que los registros DNS estén correctos

### Error "Authentication failed"

- **Gmail:** Asegúrate de usar contraseña de aplicación, no tu contraseña normal
- **SMTP:** Verifica usuario y contraseña
- **Resend:** Verifica que la API key sea correcta

### Emails van a spam

- **Usa Resend:** Mejor deliverability que SMTP directo
- **Configura SPF/DKIM:** Si usas dominio propio
- **Evita palabras spam:** En el asunto/contenido del email

## Recomendación Final

**Para producción, usa Resend:**
- Es gratis hasta 3,000 emails/mes (más que suficiente)
- Configuración en 5 minutos
- Mejor deliverability
- Dashboard para monitorear emails
- Sin problemas de IP bloqueadas o spam

**Gmail solo para testing:**
- Límites diarios de envío
- Puede ir a spam
- Menos profesional
