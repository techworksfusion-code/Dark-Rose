const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');

const logger = pino({ level: 'silent' });
const AUTH_FOLDER = path.join(__dirname, 'wa_auth');

// ─────────────────────────────────────────────────────
//  CHANGE THIS to whatever appointment time you want
const APPOINTMENT_TIME = '03:00 PM';
// ─────────────────────────────────────────────────────

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.connected = false;
    this.ready = false;
    this.qrCode = null;
    this.init();
  }

  async init() {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: ['DarkRose Tattoos', 'Desktop', '1.0.0'],
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrCode = qr;
          console.log('\n========== SCAN QR CODE WITH OWNER WhatsApp ==========');
          qrcode.generate(qr, { small: true });
          console.log('======================================================\n');
        }

        if (connection === 'open') {
          console.log('✅ WhatsApp connected successfully!');
          this.connected = true;
          this.ready = true;
        }

        if (connection === 'close') {
          this.connected = false;
          this.ready = false;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          console.log(`WhatsApp disconnected (code: ${statusCode}). Reconnecting: ${shouldReconnect}`);
          if (shouldReconnect) {
            setTimeout(() => this.init(), 5000);
          } else {
            console.log('Logged out. Delete wa_auth/ folder and restart to re-scan QR.');
          }
        }
      });

    } catch (error) {
      console.error('Failed to initialize WhatsApp service:', error.message);
    }
  }

  // ─── Validate phone number ───────────────────────────
  validatePhone(phone) {
    if (!phone) return 'Phone number is required';
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length < 9) return 'Phone number too short';
    if (digitsOnly.length > 12) return 'Phone number too long';
    return null;
  }

  // ─── Send raw message ────────────────────────────────
  async sendMessage(phoneNumber, message) {
    if (!this.ready || !this.sock) {
      console.error('❌ WhatsApp not ready. Cannot send message.');
      return false;
    }

    const phoneError = this.validatePhone(phoneNumber);
    if (phoneError) {
      console.error(`❌ Invalid phone number: ${phoneError}`);
      return false;
    }

    try {
      const jid = `${phoneNumber}@s.whatsapp.net`;
      await this.sock.sendMessage(jid, { text: message });
      console.log(`✅ WhatsApp message sent to ${phoneNumber}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send message to ${phoneNumber}:`, error.message);
      return false;
    }
  }

  // ─── Send upgrade message ───────────────────────────
  async sendUpgradeMessage(phoneNumber, businessName = 'Fusion Tech Works') {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const phoneError = this.validatePhone(cleanPhone);
    if (phoneError) {
      console.error(`❌ Invalid phone for upgrade message: ${phoneError}`);
      return false;
    }
    const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;

    const message = `🏆 *${businessName} UPGRADE TO PREMIUM* 🏆\n\n` +
      `You've reached the free notification limit (5 notifications).\n\n` +
      `Upgrade to Premium for unlimited WhatsApp notifications and exclusive features!\n\n` +
      `Contact us to upgrade today. 🙏`;

    return await this.sendMessage(formattedPhone, message);
  }

  // ─── Send booking notification ───────────────────────
  async sendBookingNotification(booking, status) {
    const { name, phone, design } = booking;

    // Clean and format phone number
    const cleanPhone = phone.replace(/\D/g, '');
    const phoneError = this.validatePhone(cleanPhone);
    if (phoneError) {
      console.error(`❌ Cannot send WhatsApp: ${phoneError} (original: ${phone})`);
      return false;
    }
    const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;

    let message = '';

    if (status === 'confirmed') {

      let formattedDate, formattedTime;

      if (booking.visitDate && booking.visitTime) {
        const visitDateObj = new Date(booking.visitDate + 'T' + booking.visitTime);
        formattedDate = visitDateObj.toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        formattedTime = visitDateObj.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
      } else {
        const today = new Date();
        formattedDate = today.toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        formattedTime = APPOINTMENT_TIME;
      }

      message =
        `🌹 *Dark Rose Tattoos*\n\n` +
        `Hello ${name}! 🎉\n\n` +
        `Your booking for *"${design}"* has been *CONFIRMED* ✅\n\n` +
        `📅 *Date:* ${formattedDate}\n` +
        `⏰ *Time:* ${formattedTime}\n\n` +
        `📍 *Studio Address:*\nBypass Gaya, Bihar - Opposite Vijay Laddu Bhandar, Gaya Ji\n\n` +
        `📍 Please arrive 10 minutes early.\n` +
        `Reply to this message if you need to reschedule.\n\n` +
        `See you soon! 🖤`;

    } else if (status === 'cancelled') {

      message =
        `🌹 *Dark Rose Tattoos*\n\n` +
        `Hello ${name},\n\n` +
        `Unfortunately your booking for *"${design}"* has been *CANCELLED* ❌\n\n` +
        `If you have any questions or want to rebook, please contact us.\n` +
        `Sorry for the inconvenience. 🙏`;

    } else {
      return false;
    }

    return await this.sendMessage(formattedPhone, message);
  }

  // ─── Get connection status ───────────────────────────
  getStatus() {
    return {
      connected: this.connected,
      ready: this.ready,
      qrCode: this.qrCode
    };
  }

  // ─── Send extra charge alert to owner ──────────────
  async sendExtraChargeAlert(ownerPhone, extraCount, totalCharge) {
    const cleanPhone = ownerPhone.replace(/\D/g, '');
    const phoneError = this.validatePhone(cleanPhone);
    if (phoneError) {
      console.error(`❌ Invalid owner phone for charge alert: ${phoneError}`);
      return false;
    }
    const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;

    const message = 
`💡 *Notification Update from Fusion Tech Works* 💡

Hey there! 🌟

Just a quick update from your tech partner! 

📊 *Today's Usage:*
• Extra notifications sent: ${extraCount}
• Rate per message: ₹5
• *Total due today: ₹${totalCharge}*

✨ *Good news:* Your bookings are being delivered smoothly to customers - never blocked!

🚀 *Want to save on extra charges?*

Here are our plans:
━━━━━━━━━━━━━━━━━━━━
🥉 *Standard* - ₹499/month → 50 msgs/day
🥇 *Business* - ₹999/month → Unlimited
👑 *Lifetime* - ₹7,999 one-time → Unlimited forever!
━━━━━━━━━━━━━━━━━━━━

Which plan works best for your growing business?

👉 Chat with us: wa.me/91XXXXXXXXXX

We're here to help you succeed! 

Team Fusion Tech Works 💻`;

    return await this.sendMessage(formattedPhone, message);
  }

  // ─── Send monthly invoice to owner ─────────────────
  async sendMonthlyInvoice(ownerPhone, extraMessages, totalCharge) {
    const cleanPhone = ownerPhone.replace(/\D/g, '');
    const phoneError = this.validatePhone(cleanPhone);
    if (phoneError) {
      console.error(`❌ Invalid owner phone for invoice: ${phoneError}`);
      return false;
    }
    const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;

    const message = 
`📄 *Monthly Invoice from Fusion Tech Works* 📄

Hey! Here's your monthly summary:

━━━━━━━━━━━━━━━━━━━━
📱 *Extra Notifications:* ${extraMessages} messages
💰 *Rate:* ₹5 per message
💵 *Total Amount Due:* ₹${totalCharge}
━━━━━━━━━━━━━━━━━━━━

💳 *Pay via UPI:*
` + "```" + `
yourname@upi
` + "```" + `

🔄 Or upgrade to avoid future charges!

📋 *Available Plans:*
• Standard - ₹499/month (50/day)
• Business - ₹999/month (Unlimited)
• Lifetime - ₹7,999 (Unlimited forever)

Questions? Just reply to this message!

Thank you for being a valued partner! 

Team Fusion Tech Works 💻`;

    return await this.sendMessage(formattedPhone, message);
  }

  // ─── Graceful disconnect ─────────────────────────────
  async disconnect() {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (err) {
        console.error('Error during logout:', err.message);
      }
      this.connected = false;
      this.ready = false;
    }
  }
}

// Singleton instance
const whatsappService = new WhatsAppService();
module.exports = whatsappService;