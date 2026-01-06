# Sistema de Verificación de Email y Recuperación de Contraseña

## ✅ Implementación Completada

Se ha implementado un sistema completo de seguridad para el registro y autenticación:

### Funcionalidades Agregadas

1. **Confirmación de Contraseña en Registro**
   - Campo "Repetir contraseña" en el formulario
   - Validación en tiempo real de coincidencia
   - Indicador visual si no coinciden

2. **Verificación de Email**
   - Link de verificación enviado al registrarse
   - Token único con expiración de 24 horas
   - Página de verificación (/verify-email)
   - Los usuarios deben verificar su email antes de poder iniciar sesión
   - Opción de reenviar email de verificación

3. **Recuperación de Contraseña**
   - Botón "¿Olvidaste tu contraseña?" en login
   - Formulario para solicitar reseteo (/forgot-password)
   - Link de reseteo por email (expira en 1 hora)
   - Página para establecer nueva contraseña (/reset-password)

### Archivos Modificados/Creados

#### Backend
- ✅ `api/src/emailService.ts` - Servicio de envío de emails con Resend/SMTP
- ✅ `api/src/authRouter.ts` - Endpoints nuevos:
  - `POST /api/auth/register` - Ahora genera token y envía email
  - `POST /api/auth/login` - Verifica que el email esté confirmado
  - `GET /api/auth/verify-email?token=...` - Verifica el email
  - `POST /api/auth/resend-verification` - Reenvía email de verificación
  - `POST /api/auth/forgot-password` - Solicita reseteo
  - `POST /api/auth/reset-password` - Establece nueva contraseña
- ✅ `api/migrations/add_email_verification_and_reset.js` - Migración ejecutada
- ✅ `api/migrations/mark_existing_users_verified.js` - Para usuarios existentes

#### Frontend
- ✅ `client/src/components/LoginPage.tsx` - Campo de confirmación de contraseña
- ✅ `client/src/components/VerifyEmailPage.tsx` - Página de verificación
- ✅ `client/src/components/ForgotPasswordPage.tsx` - Solicitar reseteo
- ✅ `client/src/components/ResetPasswordPage.tsx` - Establecer nueva contraseña
- ✅ `client/src/App.tsx` - Rutas agregadas

#### Base de Datos
La tabla `accounts` ahora tiene:
- `email_verified` - Boolean, indica si el email está verificado
- `verification_token` - Token único para verificación
- `verification_token_expires` - Fecha de expiración (24h)
- `reset_token` - Token único para reseteo de contraseña
- `reset_token_expires` - Fecha de expiración (1h)

### Usuarios Existentes

**✅ Los usuarios que ya se registraron están marcados como verificados**
- Pueden seguir usando el sistema sin problemas
- No necesitan verificar su email
- La migración ya se ejecutó

### Configuración Requerida

Para que los emails se envíen realmente, necesitas configurar uno de estos:

#### Opción 1: Resend (RECOMENDADO) ⭐

```env
RESEND_API_KEY=re_tu_clave_aqui
FROM_EMAIL=noreply@tudominio.com
FROM_NAME=Gestión de Obras
APP_URL=https://tuapp.com
```

**Pasos:**
1. Ve a https://resend.com y crea una cuenta (gratis)
2. Obtén tu API Key
3. (Opcional) Configura tu dominio agregando registros DNS
4. Agrega las variables de entorno en `docker-compose.prod.yml`

Ver [CONFIGURACION_EMAIL.md](CONFIGURACION_EMAIL.md) para guía detallada.

#### Opción 2: Gmail SMTP

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-contraseña-de-aplicacion
FROM_EMAIL=tu-email@gmail.com
FROM_NAME=Gestión de Obras
APP_URL=https://tuapp.com
```

#### Sin Configuración (Desarrollo)

Si no configuras nada:
- El sistema funcionará
- Los emails NO se enviarán
- Los links aparecerán en la consola del backend
- Puedes copiar y pegar los links para testing

### Flujo de Registro

1. Usuario completa el formulario de registro
2. Sistema valida que las contraseñas coincidan
3. Crea la cuenta con `email_verified=0`
4. Genera token de verificación (expira en 24h)
5. Envía email con link de verificación
6. Usuario hace click en el link
7. Sistema marca `email_verified=1`
8. Usuario puede iniciar sesión

### Flujo de Recuperación

1. Usuario hace click en "¿Olvidaste tu contraseña?"
2. Ingresa su email
3. Sistema genera token de reseteo (expira en 1h)
4. Envía email con link de reseteo
5. Usuario hace click en el link
6. Ingresa nueva contraseña (y confirmación)
7. Sistema actualiza la contraseña
8. Usuario puede iniciar sesión con la nueva contraseña

### Testing en Desarrollo

1. **Inicia el backend:**
   ```bash
   cd api
   npm run dev
   ```

2. **Inicia el frontend:**
   ```bash
   cd client
   npm run dev
   ```

3. **Registra un usuario:**
   - Ve a http://localhost:5173/login
   - Cambia a "Registrarse"
   - Completa el formulario
   - Mira la consola del backend

4. **Copia el link de verificación:**
   ```
   📧 EMAIL DE PRUEBA (copia este link):
      🔗 Link de verificación: http://localhost:5173/verify-email?token=...
   ```

5. **Pega el link en el navegador**

6. **Prueba recuperación de contraseña:**
   - Click en "¿Olvidaste tu contraseña?"
   - Ingresa el email
   - Mira la consola del backend
   - Copia y pega el link de reseteo

### Producción

1. **Configura el email** (Resend recomendado)

2. **Agrega variables de entorno** en `docker-compose.prod.yml`:
   ```yaml
   api:
     environment:
       - RESEND_API_KEY=re_tu_clave_aqui
       - FROM_EMAIL=noreply@tudominio.com
       - FROM_NAME=Gestión de Obras
       - APP_URL=https://tudominio.com
   ```

3. **Reinicia los contenedores:**
   ```bash
   docker-compose -f docker-compose.prod.yml down
   docker-compose -f docker-compose.prod.yml up -d
   ```

4. **Verifica los logs:**
   ```bash
   docker-compose -f docker-compose.prod.yml logs api
   ```

   Deberías ver:
   ```
   ✅ Configurando email con Resend
   ```

### Seguridad

- ✅ Tokens únicos y aleatorios (32 bytes)
- ✅ Tokens con expiración (24h para verificación, 1h para reseteo)
- ✅ Tokens se eliminan después de usar
- ✅ No se revela si una cuenta existe en forgot-password
- ✅ Contraseñas hasheadas con bcrypt
- ✅ Validación de longitud de contraseña (mínimo 6 caracteres)
- ✅ Validación de formato de email

### Próximos Pasos (Opcional)

1. **Personalizar templates de email** - Agregar logo, colores de la marca
2. **Límite de rate** - Prevenir spam en forgot-password
3. **Log de intentos fallidos** - Para detectar ataques
4. **Notificaciones** - Email cuando se cambia la contraseña
5. **2FA** - Autenticación de dos factores

## Documentación Adicional

- [CONFIGURACION_EMAIL.md](CONFIGURACION_EMAIL.md) - Guía detallada de configuración de email
- Para Resend: https://resend.com/docs
- Para configuración DNS: Consulta con tu proveedor de dominio
