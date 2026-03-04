require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
const scanLimiter = rateLimit({ windowMs: 60000, max: 30, message: { error: 'Too many scans. Please wait.' } });
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Tejara', version: '1.0.0', apiKey: process.env.ANTHROPIC_API_KEY ? 'configured' : 'MISSING' });
});

app.post('/api/analyse', scanLimiter, async (req, res) => {
  const { imageBase64, country, lang, langName, currency, standards } = req.body;
  if (!imageBase64) return res.status(400).json({ success: false, error: 'No image provided' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ success: false, error: 'API key not configured' });

  const stdList = (standards || ['FSSAI', 'AGMARK']).join(', ');

  const prompt = `You are Tejara — a professional AI agricultural inspector trusted by farmers, mandis, traders and food safety officers worldwide.

LOCALE: Country="${country}", Language="${lang}", Currency="${currency}", Standards="${stdList}"

CRITICAL: Write ALL descriptive text in ${langName}. Exceptions: authority acronyms, scientific names, numbers.

Identify the agricultural product (fruits, vegetables, grains, pulses, spices, oilseeds, cash crops, dairy, fishery, poultry, seeds, flowers, or any farm produce).

Return ONLY valid JSON:
{
  "product_name": "name in ${langName}",
  "product_name_en": "English name",
  "scientific_name": "botanical name or N/A",
  "category": "category in ${langName}",
  "variety": "variety or N/A",
  "confidence": 0-100,
  "quality_grade": "India=Special/A/B/C, USA=US Fancy/No.1/No.2, others=A+/A/B/C/D",
  "quality_score": 0-100,
  "freshness_or_condition": "condition in ${langName}",
  "maturity_stage": "maturity in ${langName}",
  "origin": "region/state/country",
  "season": "harvest season in ${langName}",
  "price_range": "price in ${currency} with unit or N/A",
  "shelf_life": "shelf life in ${langName}",
  "storage_conditions": "storage in ${langName}",
  "standards": [{"authority":"from ${stdList}","standard_name":"regulation","status":"pass|warn|fail","detail":"in ${langName}","color":"#00E676 pass #FFB800 warn #FF4444 fail"}],
  "attributes": [{"label":"in ${langName}","value":"in ${langName}","highlight":true}],
  "health_safety": "nutrition in ${langName}",
  "pesticide_concern": "Low/Medium/High with reason in ${langName}",
  "certifications": ["certs"],
  "warnings": ["issues in ${langName}"],
  "mandi_ready": "assessment in ${langName}",
  "export_potential": "High/Medium/Low with reason in ${langName}",
  "recommendations": "advice in ${langName}",
  "summary": "2-sentence expert assessment in ${langName}"
}
India: AGMARK Special/A/B/C + FSSAI + APEDA. Include 4-5 standards.`;

  try {
    console.log(`[SCAN] ${new Date().toISOString()} | ${country} | ${langName}`);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });
    if (!response.ok) {
      const e = await response.json().catch(() => ({}));
      throw new Error(e.error?.message || `API ${response.status}`);
    }
    const data = await response.json();
    const raw = data.content.map(b => b.text || '').join('').trim()
      .replace(/^```json?\s*/, '').replace(/\s*```$/, '').trim();
    const result = JSON.parse(raw);
    console.log(`[OK] ${result.product_name_en || result.product_name} | Grade: ${result.quality_grade}`);
    res.json({ success: true, result });
  } catch (err) {
    console.error(`[ERR]`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
  console.log(`\n  🌾 Tejara`);
  console.log(`  Running: http://localhost:${PORT}`);
  console.log(`  API Key: ${process.env.ANTHROPIC_API_KEY ? '✅ Ready' : '❌ Add ANTHROPIC_API_KEY in Railway Variables'}\n`);
});
