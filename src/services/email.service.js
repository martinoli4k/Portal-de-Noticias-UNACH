const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.testAccount = null;
    this.initTransporter();
  }

  async initTransporter() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (user && pass) {
      if (host === 'smtp.gmail.com') {
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user, pass }
        });
      } else {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass }
        });
      }
      console.log(`[EmailService] Transporte SMTP configurado con: ${user}`);
    } else {
      // Si no hay credenciales en .env, inicializar cuenta Ethereal para pruebas
      try {
        this.testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: this.testAccount.user,
            pass: this.testAccount.pass
          }
        });
        console.log('[EmailService] Modo de prueba activo (Ethereal). Configura SMTP_USER y SMTP_PASS en .env para envío a bandejas reales.');
      } catch (err) {
        console.warn('[EmailService] No se pudo crear cuenta de prueba Ethereal:', err.message);
      }
    }
  }

  async getTransporter() {
    if (!this.transporter) {
      await this.initTransporter();
    }
    return this.transporter;
  }

  /**
   * Envía el código de recuperación de contraseña por correo electrónico
   * @param {string} toEmail - Correo del destinatario
   * @param {string} userName - Nombre del usuario
   * @param {string} resetCode - Código de 6 dígitos
   */
  async sendPasswordResetEmail(toEmail, userName, resetCode) {
    const transporter = await this.getTransporter();
    const fromAddress = process.env.EMAIL_FROM || '"Portal de Noticias UNACH" <no-reply@portalnoticias.edu.mx>';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }
          .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          .header { background: #0f172a; color: #ffffff; padding: 24px; text-align: center; }
          .header h2 { margin: 0; font-size: 20px; font-weight: 600; }
          .content { padding: 30px 24px; color: #334155; line-height: 1.6; }
          .code-box { background: #f8fafc; border: 2px dashed #6366f1; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0; }
          .code { font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #4338ca; font-family: monospace; }
          .warning { font-size: 13px; color: #64748b; margin-top: 15px; }
          .footer { background: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Portal de Noticias</h2>
          </div>
          <div class="content">
            <p>Hola <strong>${userName || 'Usuario'}</strong>,</p>
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta asociada a este correo electrónico.</p>
            <p>Utiliza el siguiente código de verificación para completar el proceso:</p>
            
            <div class="code-box">
              <div class="code">${resetCode}</div>
              <div class="warning">Este código es válido por <strong>15 minutos</strong> y puede usarse una sola vez.</div>
            </div>

            <p class="warning">Si tú no realizaste esta solicitud, puedes ignorar este mensaje; tu contraseña actual permanecerá segura.</p>
          </div>
          <div class="footer">
            Portal de Noticias • Sistema de Seguridad y Control de Acceso
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: fromAddress,
      to: toEmail,
      subject: `Código de recuperación: ${resetCode} - Portal de Noticias`,
      text: `Hola ${userName},\n\nTu código para restablecer tu contraseña es: ${resetCode}\n\nEste código caduca en 15 minutos.\nSi no solicitaste este cambio, puedes ignorar este mensaje.`,
      html: htmlContent
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`[EmailService] Correo de recuperación enviado exitosamente a: ${toEmail} (ID: ${info.messageId})`);

      // Si fue enviado por cuenta de prueba Ethereal, mostrar preview URL
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`[EmailService] Vista previa del correo (Ethereal): ${previewUrl}`);
      }

      return { success: true, messageId: info.messageId, previewUrl };
    } catch (error) {
      console.error(`[EmailService] Error al enviar correo a ${toEmail}:`, error.message);
      throw error;
    }
  }
}

module.exports = new EmailService();
