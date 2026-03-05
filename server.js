const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// API key from environment
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

app.get('/api/health', (req, res) => {
  res.json({ 
    ok: true, 
    port: PORT, 
    key: API_KEY ? 'set' : 'missing',
    env: Object.keys(process.env).filter(k => k.includes('ANTHROP'))
  });
});

app.post('/api/analyse', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ 
      success: false, 
      error: 'ANTHROPIC_API_KEY not configured. Check Railway Variables.' 
    });
  }
  try {
    const { imageBase64, country, lang, langName, currency, standards } = req.body;
    if (!imageBase64) return res.status(400).json({ success: false, error: 'No image' });
    
    const stdList = (standards || ['FSSAI', 'AGMARK']).join(', ');
    const prompt = `You are Tejara AI agricultural inspector. Analyse this crop image.
Country="${country}", Language="${lang}", Currency="${currency}", Standards="${stdList}"
Write ALL text in ${langName}.
Return ONLY valid JSON:
{
  "product_name": "name",
  "product_name_en": "English name",
  "scientific_name": "botanical name",
  "category": "category",
  "variety": "variety",
  "confidence": 92,
  "quality_grade": "A",
  "quality_score": 88,
  "freshness_or_condition": "condition",
  "maturity_stage": "maturity",
  "origin": "origin",
  "season": "season",
  "price_range": "price in ${currency}",
  "shelf_life": "shelf life",
  "storage_conditions": "storage",
  "standards": [{"authority":"FSSAI","standard_name":"Food Safety","status":"pass","detail":"Meets all standards","color":"#00E676"}],
  "attributes": [{"label":"Color","value":"description","highlight":true}],
  "health_safety": "nutrition",
  "pesticide_concern": "Low",
  "certifications": [],
  "warnings": [],
  "mandi_ready": "ready",
  "export_potential": "Medium",
  "recommendations": "advice",
  "summary": "Expert summary"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
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

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const raw = data.content[0].text.replace(/```json\n?/g,'').replace(/```/g,'').trim();
    const result = JSON.parse(raw);
    res.json({ success: true, result });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tejara running on port ${PORT}`);
  console.log(`API Key: ${API_KEY ? 'OK ✓' : 'MISSING ✗'}`);
  console.log(`All env keys with ANTHROP: ${Object.keys(process.env).filter(k => k.includes('ANTHROP')).join(', ') || 'none found'}`);
});
