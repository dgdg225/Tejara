const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const API_KEY = process.env.ANTHROPIC_API_KEY || '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';

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, port: PORT, key: API_KEY ? 'set' : 'missing' });
});

app.post('/api/analyse', async (req, res) => {
  try {
    const { imageBase64, country, lang, langName, currency, standards } = req.body;
    if (!imageBase64) return res.status(400).json({ success: false, error: 'No image' });

    const stdList = (standards || ['FSSAI', 'AGMARK']).join(', ');
    const prompt = `You are Tejara AI agricultural inspector. Analyse this crop image.
Country="${country}", Language="${lang}", Currency="${currency}", Standards="${stdList}"
Write ALL descriptive text in ${langName}.
Return ONLY valid JSON:
{
  "product_name": "name in ${langName}",
  "product_name_en": "English name",
  "scientific_name": "botanical name",
  "category": "category",
  "variety": "variety or N/A",
  "confidence": 92,
  "quality_grade": "A",
  "quality_score": 88,
  "freshness_or_condition": "condition in ${langName}",
  "maturity_stage": "maturity in ${langName}",
  "origin": "likely origin",
  "season": "season in ${langName}",
  "price_range": "price in ${currency}",
  "shelf_life": "shelf life in ${langName}",
  "storage_conditions": "storage advice in ${langName}",
  "standards": [
    {"authority":"FSSAI","standard_name":"Food Safety Standard","status":"pass","detail":"Meets food safety norms","color":"#00E676"},
    {"authority":"AGMARK","standard_name":"Agricultural Grade","status":"pass","detail":"Graded as per AGMARK","color":"#00E676"}
  ],
  "attributes": [
    {"label":"Color","value":"description","highlight":true},
    {"label":"Texture","value":"description","highlight":false}
  ],
  "health_safety": "nutrition info in ${langName}",
  "pesticide_concern": "Low",
  "certifications": [],
  "warnings": [],
  "mandi_ready": "market readiness in ${langName}",
  "export_potential": "Medium",
  "recommendations": "advice in ${langName}",
  "summary": "2 sentence expert summary in ${langName}"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
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
    console.log(`[OK] ${result.product_name_en} | Grade: ${result.quality_grade}`);
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
  console.log(`API Key: OK`);
});
