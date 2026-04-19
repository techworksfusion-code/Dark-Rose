const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const whatsappService = require('./whatsapp-service');

const app = express();
const PORT = process.env.PORT || 3000;
const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');
const NOTIFICATION_FILE = path.join(__dirname, 'notification_count.json');

const OWNER_PHONE = '91XXXXXXXXXX'; // Replace with actual owner phone
const FUSION_WA = 'wa.me/91XXXXXXXXXX'; // Replace with Fusion Tech Works WhatsApp link
const UPI_ID = 'yourname@upi'; // Replace with actual UPI ID

const PLAN_LIMITS = {
  free: 5,
  standard: 50,
  business: -1, // -1 means unlimited
  lifetime: -1
};

const PLAN_PRICES = {
  free: 0,
  standard: 499,
  business: 999,
  lifetime: 7999
};

const PLAN_NAMES = {
  free: 'Free',
  standard: 'Standard',
  business: 'Business',
  lifetime: 'Lifetime'
};

// Notification data - in-memory with daily reset
let notificationMemory = {
  count: 0,
  extraCount: 0,
  totalExtraCharge: 0,
  lastResetDate: new Date().toISOString().split('T')[0]
};

// Track total contacted customers (confirmed)
let totalContacted = 0;

// Check and reset daily count at midnight
function checkDailyReset() {
  const today = new Date().toISOString().split('T')[0];
  if (notificationMemory.lastResetDate !== today) {
    notificationMemory.count = 0;
    notificationMemory.lastResetDate = today;
    console.log(`[NOTIFICATION] Daily count reset. Extra charges preserved: ₹${notificationMemory.totalExtraCharge}`);
  }
}

// Get notification data from memory
function getNotificationData() {
  checkDailyReset();
  return { ...notificationMemory };
}

// Increment notification data in memory + save to file for billing history
function incrementNotificationData(isExtra) {
  checkDailyReset();
  
  if (isExtra) {
    notificationMemory.extraCount += 1;
    notificationMemory.totalExtraCharge += 5;
  } else {
    notificationMemory.count += 1;
  }
  
  // Write to file for billing history only
  try {
    const historyData = {
      count: notificationMemory.count,
      extraCount: notificationMemory.extraCount,
      totalExtraCharge: notificationMemory.totalExtraCharge,
      date: notificationMemory.lastResetDate
    };
    fs.writeFileSync(NOTIFICATION_FILE, JSON.stringify(historyData, null, 2));
  } catch (err) {
    console.error('[NOTIFICATION] Error writing to file:', err.message);
  }
  
  console.log(`[NOTIFICATION] Incremented ${isExtra ? 'extra' : 'free'} count. Total: ${notificationMemory.count}, Extra: ${notificationMemory.extraCount}, Due: ₹${notificationMemory.totalExtraCharge}`);
  
  return { ...notificationMemory };
}

// Simple auth config
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'darkrose2024'; // Change this password
const AUTH_TOKEN = 'dr_admin_session_v1';

// Middleware
app.use(cookieParser());
app.use(express.json({ extended: true, limit: '10mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname)));

// Auth middleware (skip for static files and login API)
function isAuthenticated(req, res, next) {
  // Allow login/logout endpoints without auth
  if (req.path === '/api/login' || req.path === '/api/logout') {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  const cookie = req.headers.cookie;
  
  if (cookie && cookie.includes('auth_token=' + AUTH_TOKEN)) {
    return next();
  }
  
  if (authHeader === AUTH_TOKEN) {
    return next();
  }
  
  // For API calls, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized', needsLogin: true });
  }
  
  // For /admin, let it pass - the HTML will handle showing login
  if (req.path === '/admin') {
    return next();
  }
  
  next();
}

// Mock database for designs
const designs = [
  {id: 1, name:"Mahadev Nataraja",tag:"Blackwork · Divine Dance",price:"Starting ₹249/inch",img:"Assets/1.jpg"},
  {id: 2, name:"Ardhanarishvara",tag:"Blackwork · Shiva-Shakti",price:"Starting ₹249/inch",img:"Assets/2.jpg"},
  {id: 3, name:"Shiva with Trishula",tag:"Blackwork · Divine Weapon",price:"Starting ₹249/inch",img:"Assets/3.jpg"},
  {id: 4, name:"Shiva Lingam",tag:"Dotwork · Sacred Symbol",price:"Starting ₹249/inch",img:"Assets/4.jpg"},
  {id: 5, name:"Shiva as Pashupati",tag:"Blackwork · Lord of Beasts",price:"Starting ₹249/inch",img:"Assets/5.jpg"},
  {id: 6, name:"Shiva's Damaru",tag:"Fine Line · Divine Drum",price:"Starting ₹249/inch",img:"Assets/6.jpg"},
  {id: 7, name:"Shiva with Nandi",tag:"Blackwork · Divine Bull",price:"Starting ₹249/inch",img:"Assets/7.jpg"},
  {id: 8, name:"Shiva's Third Eye",tag:"Dotwork · Spiritual Awakening",price:"Starting ₹249/inch",img:"Assets/8.jpg"},
  {id: 9, name:"Shiva with Ganga",tag:"Blackwork · Holy River",price:"Starting ₹249/inch",img:"Assets/9.jpg"},
  {id: 10, name:"Shiva's Crescent Moon",tag:"Fine Line · Chandra Shekhara",price:"Starting ₹249/inch",img:"Assets/10.jpg"},
  {id: 11, name:"Shiva as Rudra",tag:"Blackwork · Fierce Form",price:"Starting ₹249/inch",img:"Assets/11.jpg"},
  {id: 12, name:"Shiva in Meditation",tag:"Dotwork · Yogeshwara",price:"Starting ₹249/inch",img:"Assets/12.jpg"},
  {id: 13, name:"Shiva's Snake Ornament",tag:"Blackwork · Vasuki",price:"Starting ₹249/inch",img:"Assets/13.jpg"},
  {id: 14, name:"Shiva's Tiger Skin",tag:"Blackwork · Vastra",price:"Starting ₹249/inch",img:"Assets/14.jpg"},
  {id: 15, name:"Shiva's Ash Covered",tag:"Blackwork · Vibhuti",price:"Starting ₹249/inch",img:"Assets/15.jpg"},
  {id: 16, name:"Shiva's Trinetra",tag:"Dotwork · Three Eyes",price:"Starting ₹249/inch",img:"Assets/16.jpg"},
  {id: 17, name:"Shiva's Jata (Hair)",tag:"Blackwork · Divine Locks",price:"Starting ₹249/inch",img:"Assets/17.jpg"},
  {id: 18, name:"Shiva with Kamandal",tag:"Blackwork · Water Pot",price:"Starting ₹249/inch",img:"Assets/18.jpg"},
  {id: 19, name:"Shiva's Rosary (Rudraksha)",tag:"Dotwork · Sacred Beads",price:"Starting ₹249/inch",img:"Assets/19.jpg"},
  {id: 20, name:"Shiva as Bholenath",tag:"Blackwork · Innocent Lord",price:"Starting ₹249/inch",img:"Assets/20.jpg"},
  {id: 21, name:"Shiva's Cosmic Dance",tag:"Blackwork · Tandava",price:"Starting ₹249/inch",img:"Assets/21.jpg"},
  {id: 22, name:"Shiva's Abode Kailash",tag:"Blackwork · Divine Mountain",price:"Starting ₹249/inch",img:"Assets/22.jpg"},
  {id: 23, name:"Shiva with Parvati",tag:"Blackwork · Divine Couple",price:"Starting ₹249/inch",img:"Assets/23.jpg"},
  {id: 24, name:"Shiva's Ganas",tag:"Blackwork · Divine Attendants",price:"Starting ₹249/inch",img:"Assets/24.jpg"},
  {id: 25, name:"Shiva's Trishula & Damaru",tag:"Blackwork · Divine Instruments",price:"Starting ₹249/inch",img:"Assets/25.jpg"},
  {id: 26, name:"Shiva's Blue Throat",tag:"Blackwork · Neelkantha",price:"Starting ₹249/inch",img:"Assets/26.jpg"},
  {id: 27, name:"Shiva's Tiger Skin Seat",tag:"Blackwork · Asher",price:"Starting ₹249/inch",img:"Assets/27.jpg"},
  {id: 28, name:"Shiva's Lotus Feet",tag:"Dotwork · Charanamrita",price:"Starting ₹249/inch",img:"Assets/28.jpg"},
  {id: 29, name:"Shiva's Sacred Thread",tag:"Fine Line · Yajnopavita",price:"Starting ₹249/inch",img:"Assets/29.jpg"},
  {id: 30, name:"Shiva's Flame Hair",tag:"Blackwork · Jwala Jata",price:"Starting ₹249/inch",img:"Assets/30.jpg"}
];

// Rate limiter for login - 5 attempts per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' }
});

// Login endpoint
app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.setHeader('Set-Cookie', `auth_token=${AUTH_TOKEN}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'auth_token=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax');
  res.json({ success: true });
});

// API Routes

// Get all designs
app.get('/api/designs', (req, res) => {
  res.json(designs);
});

// Serve the Contact Us page
app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'contact-us.html'));
});

// Admin panel - get all bookings
app.get('/api/bookings', isAuthenticated, (req, res) => {
  try {
    let data = fs.readFileSync(BOOKINGS_FILE, 'utf8');
    let bookings = JSON.parse(data);
    const originalLength = bookings.length;

    // Backfill IDs and status for old bookings
    let needsSave = false;
    bookings = bookings.map((b, index) => {
      const hasId = b.id !== undefined;
      const hasStatus = b.status !== undefined;
      if (!hasId || !hasStatus) {
        needsSave = true;
      }
      return {
        ...b,
        id: b.id || `legacy_${Date.now()}_${index}`,
        status: b.status || 'pending'
      };
    });

    // Persist backfilled IDs back to file
    if (needsSave) {
      fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
      console.log(`[GET] Backfilled IDs/status for ${originalLength} bookings and saved to file`);
    }

    res.json(bookings);
  } catch (error) {
    console.error('[GET] Error reading bookings:', error);
    res.json([]);
  }
});

// Check premium status for booking updates - block status changes when limit reached
app.put('/api/bookings/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  // Only check limit if trying to change status to confirmed/cancelled
  if (status === 'confirmed' || status === 'cancelled') {
    const notificationData = getNotificationData();
    if (notificationData.count >= PLAN_LIMITS.free) {
      return res.status(403).json({ 
        error: 'LIMIT_REACHED',
        message: 'Daily notification limit (10) reached. Upgrade to Premium from Fusion Tech Works to continue.',
        upgradeLink: 'wa.me/91XXXXXXXXXX',
        freeUsed: notificationData.count,
        freeLimit: PLAN_LIMITS.free
      });
    }
  }
  
// Continue with rest of handler...
   const { name, phone, design, budget, placement, notes, visitDate, visitTime } = req.body;

   console.log(`[PUT] Updating booking ${id}`, { name, phone, design, budget, placement, notes, status, visitDate, visitTime });

   try {
     const data = fs.readFileSync(BOOKINGS_FILE, 'utf8');
     let bookings = JSON.parse(data);

     console.log(`[PUT] Found ${bookings.length} bookings in file`);

     const index = bookings.findIndex(b => b.id === id);
     if (index === -1) {
       console.log(`[PUT] Booking ${id} NOT found. Available IDs:`, bookings.map(b => b.id));
       return res.status(404).json({ error: 'Booking not found', availableIds: bookings.map(b => b.id) });
     }

     const oldStatus = bookings[index].status;
     const newStatus = status || oldStatus;

     bookings[index] = {
       ...bookings[index],
       name: name ?? bookings[index].name,
       phone: phone ?? bookings[index].phone,
       design: design ?? bookings[index].design,
       budget: budget ?? bookings[index].budget,
       placement: placement ?? bookings[index].placement,
       notes: notes ?? bookings[index].notes,
       status: newStatus,
       visitDate: visitDate ?? bookings[index].visitDate,
       visitTime: visitTime ?? bookings[index].visitTime,
       updatedAt: new Date().toISOString()
     };

     fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
     console.log(`[PUT] Booking ${id} updated successfully`);

// Send WhatsApp notification if status changed to 'confirmed' or 'cancelled'
      if (oldStatus !== newStatus && (newStatus === 'confirmed' || newStatus === 'cancelled')) {
        console.log(`[BILLING] Checking notification limit...`);
        
        // Reset count if status changed to confirmed (start fresh for new day)
        if (newStatus === 'confirmed') {
          notificationMemory.count = 0;
          totalContacted++;
          console.log(`[BILLING] Status confirmed - reset count to 0, total contacted: ${totalContacted}`);
        }
        
        const notificationData = getNotificationData();
        console.log(`[BILLING] Current state - count: ${notificationData.count}, extraCount: ${notificationData.extraCount}, free limit: ${PLAN_LIMITS.free}`);
        
        const isFreeNotification = notificationData.count < PLAN_LIMITS.free;
        
        // Send the notification (never block customer notifications)
        const whatsappResult = await whatsappService.sendBookingNotification(bookings[index], newStatus);
        
        console.log(`[BILLING] WhatsApp result:`, whatsappResult);
        
        if (whatsappResult) {
          // Increment based on whether it's free or extra
          const updatedData = incrementNotificationData(!isFreeNotification);
          
          console.log(`[WHATSAPP] Notification sent to customer for booking ${id} (${newStatus})`);
          console.log(`[BILLING] After increment - Free: ${updatedData.count}, Extra: ${updatedData.extraCount}, Total due: ₹${updatedData.totalExtraCharge}`);
          
          // If limit reached after this notification, tell frontend to reload (will show block page)
          if (updatedData.count >= PLAN_LIMITS.free) {
            console.log(`[BILLING] Limit reached! Sending reload flag to admin.`);
            const remainingAfterLimit = Math.max(0, PLAN_LIMITS.free - updatedData.count);
            return res.json({ 
              message: 'Booking updated successfully', 
              booking: bookings[index],
              limitReached: true,
              reloadPage: true,
              freeRemaining: remainingAfterLimit
            });
          }
          
          // Return freeRemaining for real-time update even when not reached limit
          return res.json({ 
            message: 'Booking updated successfully', 
            booking: bookings[index],
            freeRemaining: Math.max(0, PLAN_LIMITS.free - updatedData.count)
          });
        } else {
          console.log(`[WHATSAPP] Failed to send notification for booking ${id}. WhatsApp may not be connected.`);
        }
      }
   } catch (error) {
     console.error('[PUT] Error updating booking:', error);
     res.status(500).json({ error: 'Failed to update booking', details: error.message });
   }
});

// Admin panel - delete a booking
app.delete('/api/bookings/:id', isAuthenticated, (req, res) => {
  const { id } = req.params;

  console.log(`[DELETE] Attempting to delete booking ${id}`);

  try {
    const data = fs.readFileSync(BOOKINGS_FILE, 'utf8');
    let bookings = JSON.parse(data);

    console.log(`[DELETE] Found ${bookings.length} bookings in file`);
    console.log(`[DELETE] Booking IDs:`, bookings.map(b => b.id));

    const initialLength = bookings.length;
    bookings = bookings.filter(b => b.id !== id);

    if (bookings.length === initialLength) {
      console.log(`[DELETE] Booking ${id} NOT found - no change made`);
      return res.status(404).json({ error: 'Booking not found', totalBookings: bookings.length });
    }

    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
    console.log(`[DELETE] Booking ${id} deleted successfully. Remaining: ${bookings.length}`);

    res.json({ message: 'Booking deleted successfully', remainingCount: bookings.length });
  } catch (error) {
    console.error('[DELETE] Error deleting booking:', error);
    res.status(500).json({ error: 'Failed to delete booking', details: error.message });
  }
});

// Admin panel - bulk delete all bookings (use with caution)
app.delete('/api/bookings', isAuthenticated, (req, res) => {
  try {
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify([], null, 2));
    console.log('All bookings cleared');
    res.json({ message: 'All bookings cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear bookings' });
  }
});

// WhatsApp status endpoint (for admin)
app.get('/api/whatsapp-status', isAuthenticated, (req, res) => {
   const status = whatsappService.getStatus();
   res.json(status);
});

// Billing summary endpoint
app.get('/api/billing-summary', isAuthenticated, (req, res) => {
  const notificationData = getNotificationData();
  
  const freeUsed = notificationData.count;
  const freeRemaining = Math.max(0, PLAN_LIMITS.free - freeUsed);
  const extraMessages = notificationData.extraCount;
  const totalDue = notificationData.totalExtraCharge;
  
  let currentPlan = 'free';
  if (totalDue >= 50) {
    currentPlan = 'consider_upgrade';
  }
  
  res.json({
    freeUsed,
    freeRemaining,
    extraMessages,
    totalDue,
    totalContacted,
    currentPlan,
    planLimits: PLAN_LIMITS,
    planPrices: PLAN_PRICES,
    planNames: PLAN_NAMES,
    fusionWA: FUSION_WA,
    date: notificationData.date
  });
});

// Admin panel - get all contacts
app.get('/api/contacts', isAuthenticated, (req, res) => {
  try {
    const CONTACTS_FILE = path.join(__dirname, 'contacts.json');
    const data = fs.readFileSync(CONTACTS_FILE, 'utf8');
    const contacts = JSON.parse(data);
    res.json(contacts);
  } catch (error) {
    // If file doesn't exist or is invalid, return empty array
    res.json([]);
  }
});

// Serve admin page - block if limit reached
app.get('/admin', isAuthenticated, (req, res) => {
  const notificationData = getNotificationData();
  const isLimitReached = notificationData.count >= PLAN_LIMITS.free;
  
  if (isLimitReached) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Access Blocked - Fusion Tech Works</title>
        <style>
          body { background: #0a0a0a; color: #F5EDE0; font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
          .box { background: #1a1a1a; border: 2px solid #D4A84A; padding: 2rem; text-align: center; max-width: 500px; border-radius: 12px; width: 100%; }
          h1 { color: #D4A84A; margin-bottom: 1rem; }
          p { color: #ccc; line-height: 1.6; margin-bottom: 1rem; }
          .plans { display: flex; flex-direction: column; gap: 1rem; margin: 1.5rem 0; }
          .plan { background: #0a0a0a; border: 1px solid #2d1f1f; padding: 1rem; border-radius: 8px; }
          .plan-name { color: #D4A84A; font-weight: bold; font-size: 1.1rem; }
          .plan-price { color: #F5EDE0; font-size: 1.5rem; font-weight: bold; margin: 0.3rem 0; }
          .plan-limit { color: #888; font-size: 0.85rem; }
          a { background: #D4A84A; color: #0a0a0a; padding: 0.8rem 1.5rem; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block; margin-top: 1rem; }
          a:hover { background: #c49a3d; }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>⚠️ Daily Limit Reached</h1>
          <p>You have used your ${PLAN_LIMITS.free} free WhatsApp notifications for today.</p>
          <p>Upgrade to Premium from <strong>Fusion Tech Works</strong> for unlimited notifications!</p>
          
          <div class="plans">
            <div class="plan">
              <div class="plan-name">🥉 Standard</div>
              <div class="plan-price">₹499/month</div>
              <div class="plan-limit">50 notifications/day</div>
            </div>
            <div class="plan">
              <div class="plan-name">🥇 Business</div>
              <div class="plan-price">₹999/month</div>
              <div class="plan-limit">Unlimited notifications</div>
            </div>
            <div class="plan">
              <div class="plan-name">👑 Lifetime</div>
              <div class="plan-price">₹7,999 one-time</div>
              <div class="plan-limit">Unlimited forever</div>
            </div>
          </div>
          
          <a href="https://wa.me/91XXXXXXXXXX" target="_blank">Upgrade Now →</a>
        </div>
      </body>
      </html>
    `);
  }
  
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Handle contact form submissions
app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required' });
  }

  try {
    const CONTACTS_FILE = path.join(__dirname, 'contacts.json');
    const newContact = {
      name,
      email,
      subject: subject || 'General Inquiry',
      message,
      timestamp: new Date().toISOString()
    };

    let contacts = [];
    try {
      const data = fs.readFileSync(CONTACTS_FILE, 'utf8');
      contacts = JSON.parse(data);
    } catch (fileError) {
      contacts = [];
    }
    contacts.push(newContact);
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
    console.log('Contact saved to', CONTACTS_FILE);

    res.json({
      message: 'Thank you for contacting us! We will get back to you soon.',
      success: true
    });
  } catch (error) {
    console.error('Error processing contact:', error);
    res.status(500).json({
      message: 'We received your message but encountered an issue. Please try again later.',
      success: false
    });
  }
});

// Validation helper functions
function validatePhone(phone) {
  if (!phone) return 'Phone number is required';
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length < 10) return 'Phone number must be at least 10 digits';
  if (digitsOnly.length > 10) return 'Phone number must be exactly 10 digits';
  return null;
}

function sanitizeString(str, maxLength = 500) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
}

// Submit a booking and save to file
app.post('/api/booking', async (req, res) => {
   let { name, phone, design, budget, placement, notes } = req.body;

   // Sanitize all string inputs
   name = sanitizeString(name, 100);
   phone = sanitizeString(phone, 20);
   design = sanitizeString(design, 200);
   budget = sanitizeString(budget, 50);
   placement = sanitizeString(placement, 100);
   notes = sanitizeString(notes, 1000);

// Validations
    const errors = [];

    if (!name || name.length < 2) {
      errors.push('Name must be at least 2 characters');
    }

    if (!design || design.length < 2) {
      errors.push('Design selection is required');
    }

    if (budget && budget.length > 50) {
      errors.push('Budget exceeds maximum length');
    }

    if (placement && placement.length > 100) {
      errors.push('Placement exceeds maximum length');
    }

    if (notes && notes.length > 1000) {
      errors.push('Notes exceed maximum length');
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', errors });
    }

    try {
       // Check for duplicate phone number FIRST (allow 9-12 digits for legacy data)
       const data = fs.readFileSync(BOOKINGS_FILE, 'utf8');
       const existingBookings = JSON.parse(data);
       const digitsOnly = phone.replace(/\D/g, '');
       
       // Validate phone length for new bookings (must be 10 digits)
       if (digitsOnly.length !== 10) {
         errors.push('Phone number must be exactly 10 digits');
         return res.status(400).json({ error: 'Validation failed', errors });
       }
       
       const duplicate = existingBookings.find(b => {
         const existingDigits = b.phone.replace(/\D/g, '');
         return existingDigits === digitsOnly;
       });
       
if (duplicate) {
         return res.status(409).json({ error: 'This phone number already has a booking', existingBooking: { name: duplicate.name, design: duplicate.design, status: duplicate.status } });
       }

      // Save booking to JSON file with unique ID
      const newBooking = {
        id: Date.now().toString(),
        name,
        phone,
        design,
        budget: budget || '',
        placement: placement || '',
        notes: notes || '',
        status: 'pending',
        timestamp: new Date().toISOString()
      };

      existingBookings.push(newBooking);
      fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(existingBookings, null, 2));
      console.log('Booking saved to', BOOKINGS_FILE);

     res.json({
       message: 'Booking request saved! We will contact you soon.',
       success: true,
       booking: newBooking
     });
   } catch (error) {
     console.error('Error processing booking:', error);
     res.json({
       message: 'Booking request received but there was an issue saving. Please try again later.',
       success: false
     });
   }
});

// Serve the HTML file for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'darkrose-tattoos.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Bookings will be saved to:', BOOKINGS_FILE);
});
