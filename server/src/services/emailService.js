import nodemailer from 'nodemailer';

/**
 * QueueKisan Email Notification Service
 * Supports Gmail with App Passwords, Custom SMTP, and graceful fallbacks.
 */

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  /**
   * Initializes or refreshes the nodemailer transport based on current env vars
   */
  getTransporter() {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const secure = process.env.SMTP_SECURE !== 'false';

    if (!user || !pass) {
      return null;
    }

    // If host is explicitly specified and not gmail
    if (host && !host.includes('gmail')) {
      return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
    }

    // Default to Gmail preset
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: user.trim(),
        pass: pass.trim().replace(/\s+/g, ''), // Strip spaces from 16-char app passwords
      },
    });
  }

  isConfigured() {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const enabled = process.env.NOTIFICATION_EMAIL_ENABLED !== 'false';
    return Boolean(user && pass && enabled);
  }

  async verifyConnection() {
    if (!this.isConfigured()) {
      return {
        configured: false,
        message: 'EMAIL_USER or EMAIL_PASS not configured in server/.env',
      };
    }
    try {
      const transporter = this.getTransporter();
      if (!transporter) {
        return { configured: false, message: 'Could not create email transporter' };
      }
      await transporter.verify();
      return { configured: true, message: 'SMTP connection verified successfully' };
    } catch (err) {
      console.error('[EmailService] Verification failed:', err.message);
      return { configured: false, error: err.message };
    }
  }

  async sendMail({ to, subject, html, text }) {
    if (!this.isConfigured()) {
      console.log(`[EmailService] Skipped sending email to ${to} (Email not configured or disabled)`);
      return { skipped: true, reason: 'Email not configured' };
    }

    try {
      const transporter = this.getTransporter();
      if (!transporter) {
        throw new Error('Transporter unavailable');
      }

      const fromAddress = process.env.EMAIL_FROM || `"QueueKisan Alerts" <${process.env.EMAIL_USER}>`;

      const info = await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        text: text || html.replace(/<[^>]*>?/gm, ''),
        html,
      });

      console.log(`[EmailService] Email sent to ${to}: MessageId=${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error(`[EmailService] Failed to send email to ${to}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // ==========================================
  // BRANDED TEMPLATE BUILDER
  // ==========================================
  buildEmailLayout(title, subtitle, contentHtml) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f8f2; margin: 0; padding: 0; color: #1e293b; }
    .container { max-width: 580px; margin: 24px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2ece0; }
    .header { background: linear-gradient(135deg, #1b6334 0%, #207a40 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0 0; opacity: 0.9; font-size: 14px; }
    .content { padding: 32px 24px; }
    .token-box { background: #eaf6ec; border: 2px dashed #207a40; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0; }
    .token-num { font-size: 36px; font-weight: 900; color: #1b6334; letter-spacing: 2px; margin: 4px 0; }
    .token-lbl { font-size: 12px; text-transform: uppercase; font-weight: 700; color: #4b7a54; letter-spacing: 1px; }
    .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .details-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    .details-table td.label { color: #64748b; font-weight: 600; width: 40%; }
    .details-table td.value { color: #0f172a; font-weight: 700; }
    .alert-banner { background: #fff8e6; border-left: 4px solid #d9a441; padding: 14px 16px; border-radius: 6px; margin: 20px 0; font-size: 14px; color: #78350f; }
    .footer { background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
    .footer a { color: #207a40; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌾 QueueKisan</h1>
      <p>${subtitle}</p>
    </div>
    <div class="content">
      ${contentHtml}
    </div>
    <div class="footer">
      <p>QueueKisan Digital Farming & Crop Procurement System</p>
      <p>Need assistance? Contact your local APMC Procurement Centre desk.</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  // ==========================================
  // SPECIFIC NOTIFICATION TEMPLATES
  // ==========================================

  async sendBookingConfirmationEmail({ to, farmerName, tokenNumber, crop, centre, date, slot, bookingId }) {
    const title = `Booking Confirmed: Token ${tokenNumber} | QueueKisan`;
    const content = `
      <h2 style="margin-top:0; color:#1b6334; font-size:20px;">Namaste ${farmerName || 'Farmer'},</h2>
      <p style="font-size:15px; line-height:1.5; color:#334155;">Your crop procurement booking has been successfully confirmed. Below are your token and appointment details:</p>
      
      <div class="token-box">
        <div class="token-lbl">Your Token Number</div>
        <div class="token-num">${tokenNumber || 'A-000'}</div>
        <div style="font-size:12px; color:#64748b;">Booking ID: <strong>${bookingId || 'N/A'}</strong></div>
      </div>

      <table class="details-table">
        <tr><td class="label">Crop</td><td class="value">${crop || 'Crop'}</td></tr>
        <tr><td class="label">Procurement Centre</td><td class="value">${centre || 'APMC Centre'}</td></tr>
        <tr><td class="label">Booking Date</td><td class="value">${date || 'Today'}</td></tr>
        <tr><td class="label">Time Slot</td><td class="value">${slot || 'N/A'}</td></tr>
      </table>

      <div class="alert-banner">
        <strong>💡 Reminder:</strong> Please reach the procurement centre 15 minutes before your time slot with your produce and farmer ID.
      </div>
    `;

    return this.sendMail({
      to,
      subject: title,
      html: this.buildEmailLayout('Booking Confirmed', 'Digital Crop Procurement', content),
    });
  }

  async sendApproachingAlertEmail({ to, farmerName, tokenNumber, centre, peopleAhead, estimatedWait }) {
    const title = `⚠️ Your Turn is Approaching! Token ${tokenNumber} | QueueKisan`;
    const content = `
      <h2 style="margin-top:0; color:#b45309; font-size:20px;">Get Ready, ${farmerName || 'Farmer'}!</h2>
      <p style="font-size:15px; line-height:1.5; color:#334155;">Your token is approaching the counter soon. Please make your way towards the procurement bay.</p>

      <div class="token-box" style="background:#fffbeb; border-color:#d9a441;">
        <div class="token-lbl" style="color:#b45309;">Your Token</div>
        <div class="token-num" style="color:#b45309;">${tokenNumber || 'A-000'}</div>
      </div>

      <table class="details-table">
        <tr><td class="label">Centre</td><td class="value">${centre || 'APMC Centre'}</td></tr>
        <tr><td class="label">People Ahead</td><td class="value">${peopleAhead ?? 'Few'}</td></tr>
        <tr><td class="label">Estimated Wait</td><td class="value">${estimatedWait || '~10 mins'}</td></tr>
      </table>

      <div class="alert-banner" style="background:#fef3c7; border-color:#d97706; color:#92400e;">
        <strong>📢 Action Required:</strong> Please keep your tractor/vehicle ready near the weighbridge.
      </div>
    `;

    return this.sendMail({
      to,
      subject: title,
      html: this.buildEmailLayout('Queue Alert', 'Approaching Token Notification', content),
    });
  }

  async sendTokenCalledEmail({ to, farmerName, tokenNumber, centre, counter }) {
    const title = `🚨 TOKEN CALLED NOW: ${tokenNumber} | QueueKisan`;
    const content = `
      <h2 style="margin-top:0; color:#dc2626; font-size:22px;">YOUR TOKEN IS CALLED!</h2>
      <p style="font-size:15px; line-height:1.5; color:#334155;">Hello ${farmerName || 'Farmer'}, your token has been called at the centre. Please proceed immediately to the counter.</p>

      <div class="token-box" style="background:#fef2f2; border-color:#dc2626;">
        <div class="token-lbl" style="color:#991b1b;">Current Token Called</div>
        <div class="token-num" style="color:#dc2626;">${tokenNumber || 'A-000'}</div>
      </div>

      <table class="details-table">
        <tr><td class="label">Procurement Centre</td><td class="value">${centre || 'APMC Centre'}</td></tr>
        <tr><td class="label">Counter / Gate</td><td class="value">${counter || 'Counter 1 • Weighbridge'}</td></tr>
      </table>

      <div class="alert-banner" style="background:#fee2e2; border-color:#dc2626; color:#991b1b;">
        <strong>⚡ Important:</strong> Please present your QR code on the QueueKisan app to the verification officer.
      </div>
    `;

    return this.sendMail({
      to,
      subject: title,
      html: this.buildEmailLayout('Token Called', 'Immediate Action Required', content),
    });
  }

  async sendProcurementCompletedEmail({ to, farmerName, tokenNumber, crop, quantity, amount, centre, procurementId }) {
    const title = `✅ Procurement Completed: ${tokenNumber} | QueueKisan`;
    const content = `
      <h2 style="margin-top:0; color:#1b6334; font-size:20px;">Harvest Accepted Successfully!</h2>
      <p style="font-size:15px; line-height:1.5; color:#334155;">Dear ${farmerName || 'Farmer'}, your crop procurement has been verified and weighed successfully.</p>

      <div class="token-box">
        <div class="token-lbl">Total Procurement Value</div>
        <div class="token-num">${amount ? (typeof amount === 'number' ? '₹' + amount.toLocaleString('en-IN') : amount) : '₹0'}</div>
        <div style="font-size:12px; color:#64748b;">Receipt ID: <strong>${procurementId || 'N/A'}</strong></div>
      </div>

      <table class="details-table">
        <tr><td class="label">Token Number</td><td class="value">${tokenNumber || 'N/A'}</td></tr>
        <tr><td class="label">Crop</td><td class="value">${crop || 'Crop'}</td></tr>
        <tr><td class="label">Total Quantity</td><td class="value">${quantity || 'N/A'}</td></tr>
        <tr><td class="label">Centre</td><td class="value">${centre || 'APMC Centre'}</td></tr>
      </table>

      <p style="font-size:14px; color:#64748b;">Your payment settlement will be processed to your registered bank account / UPI ID shortly.</p>
    `;

    return this.sendMail({
      to,
      subject: title,
      html: this.buildEmailLayout('Procurement Complete', 'Receipt & Settlement Details', content),
    });
  }

  async sendPaymentUpdateEmail({ to, farmerName, amount, referenceId, status, centre }) {
    const title = `💰 Payment Settlement ${status || 'Update'} | QueueKisan`;
    const content = `
      <h2 style="margin-top:0; color:#1b6334; font-size:20px;">Payment Status: ${status || 'Completed'}</h2>
      <p style="font-size:15px; line-height:1.5; color:#334155;">Dear ${farmerName || 'Farmer'}, your procurement payout has been processed.</p>

      <div class="token-box">
        <div class="token-lbl">Amount Transferred</div>
        <div class="token-num">${amount ? (typeof amount === 'number' ? '₹' + amount.toLocaleString('en-IN') : amount) : '₹0'}</div>
      </div>

      <table class="details-table">
        <tr><td class="label">Status</td><td class="value" style="color:#1b6334;">${status || 'Completed'}</td></tr>
        <tr><td class="label">Payment Reference</td><td class="value">${referenceId || 'Pending'}</td></tr>
        <tr><td class="label">Centre</td><td class="value">${centre || 'APMC Centre'}</td></tr>
      </table>
    `;

    return this.sendMail({
      to,
      subject: title,
      html: this.buildEmailLayout('Payment Notification', 'Direct Bank Settlement', content),
    });
  }
}

export const emailService = new EmailService();
export default emailService;
