import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const FROM_EMAIL = process.env.FROM_EMAIL || process.env.SMTP_USER || 'noreply@tudominio.com';
const FROM_NAME = process.env.FROM_NAME || 'Gestión de Obras';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    // Opción 1: Resend (Recomendado - más fácil de configurar)
    if (process.env.RESEND_API_KEY) {
      console.log('✅ Configurando email con Resend');
      transporter = nodemailer.createTransport({
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: {
          user: 'resend',
          pass: process.env.RESEND_API_KEY,
        },
      });
    }
    // Opción 2: SMTP personalizado (Gmail, dominio propio, etc.)
    else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      console.log('✅ Configurando email con SMTP personalizado');
      const smtpPort = parseInt(process.env.SMTP_PORT || '587');
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
    // Sin configuración: solo loggear en consola
    else {
      console.warn('⚠️  Email no configurado. Los links se mostrarán en la consola.');
      console.warn('📧 Opciones de configuración:');
      console.warn('   1. Resend (Recomendado): RESEND_API_KEY + FROM_EMAIL');
      console.warn('   2. SMTP: SMTP_HOST + SMTP_USER + SMTP_PASS');
      transporter = nodemailer.createTransport({
        jsonTransport: true
      });
    }
  }
  return transporter;
}

export async function sendVerificationEmail(email: string, token: string, name: string): Promise<void> {
  const verificationUrl = `${APP_URL}/verify-email?token=${token}`;
  
  const mailOptions = {
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: email,
    subject: 'Verifica tu cuenta - Gestión de Obras',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1976d2;">¡Bienvenido/a ${name}!</h2>
        <p>Gracias por registrarte en Gestión de Obras.</p>
        <p>Para activar tu cuenta, por favor haz clic en el siguiente botón:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" 
             style="background-color: #1976d2; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Verificar mi cuenta
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">
          Si no puedes hacer clic en el botón, copia y pega este enlace en tu navegador:<br>
          <a href="${verificationUrl}">${verificationUrl}</a>
        </p>
        <p style="color: #666; font-size: 14px;">
          Este enlace expirará en 24 horas.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          Si no creaste esta cuenta, puedes ignorar este correo.
        </p>
      </div>
    `,
  };

  try {
    const info = await getTransporter().sendMail(mailOptions);
    console.log('✅ Email de verificación enviado:', info.messageId);
    
    // Si estamos usando el transportador de prueba, mostrar el URL
    if (!process.env.RESEND_API_KEY && !process.env.SMTP_HOST) {
      console.log('📧 EMAIL DE PRUEBA (copia este link):');
      console.log('   Para:', email);
      console.log('   🔗 Link de verificación:', verificationUrl);
    }
  } catch (error) {
    console.error('❌ Error al enviar email de verificación:', error);
    throw new Error('No se pudo enviar el email de verificación');
  }
}

export async function sendPasswordResetEmail(email: string, token: string, name: string): Promise<void> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;
  
  const mailOptions = {
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: email,
    subject: 'Recuperación de contraseña - Gestión de Obras',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1976d2;">Recuperación de contraseña</h2>
        <p>Hola ${name},</p>
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p>Para crear una nueva contraseña, haz clic en el siguiente botón:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background-color: #1976d2; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Restablecer contraseña
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">
          Si no puedes hacer clic en el botón, copia y pega este enlace en tu navegador:<br>
          <a href="${resetUrl}">${resetUrl}</a>
        </p>
        <p style="color: #666; font-size: 14px;">
          Este enlace expirará en 1 hora.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          Si no solicitaste restablecer tu contraseña, puedes ignorar este correo. Tu contraseña no cambiará.
        </p>
      </div>
    `,
  };

  try {
    const info = await getTransporter().sendMail(mailOptions);
    console.log('✅ Email de recuperación enviado:', info.messageId);
    
    // Si estamos usando el transportador de prueba, mostrar el URL
    if (!process.env.RESEND_API_KEY && !process.env.SMTP_HOST) {
      console.log('📧 EMAIL DE PRUEBA (copia este link):');
      console.log('   Para:', email);
      console.log('   🔗 Link de reseteo:', resetUrl);
    }
  } catch (error) {
    console.error('❌ Error al enviar email de recuperación:', error);
    throw new Error('No se pudo enviar el email de recuperación');
  }
}
