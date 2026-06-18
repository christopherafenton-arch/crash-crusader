const https = require('https');

function callAnthropic(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'tools-2024-04-04'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Invalid JSON response')); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const D = JSON.parse(event.body || '{}');
    const offer = Number(D.offer) || 0;
    const cpoCase = D.cpoCase || false;
    const yr = D.year, mk = D.make, mo = D.model, tr = D.trim || '';
    const mi = Number(D.miles).toLocaleString();

    const prompt = 'You are an expert auto insurance total loss analyst. Independently determine the fair market value of this vehicle using web search, then compare to the insurance offer.' +
      '\n\nVEHICLE: ' + yr + ' ' + mk + ' ' + mo + (tr ? ' ' + tr : '') +
      '\nMILEAGE: ' + mi + ' miles' +
      '\nCONDITION: ' + (D.condition || 'good') +
      '\nPURCHASE TYPE: ' + (D.purchase || 'used') +
      '\nPRIOR ACCIDENTS: ' + (D.accidents || 'none') +
      '\nINSURANCE OFFER: $' + offer.toLocaleString() +
      '\nSTATE: ' + (D.state || 'MA') +
      (D.vin ? '\nVIN: ' + D.vin : '') +
      '\n\nINSTRUCTIONS:' +
      '\n1. Search for current retail listings: "' + yr + ' ' + mk + ' ' + mo + (tr ? ' ' + tr : '') + ' for sale"' +
      '\n2. Find real asking prices from CarGurus, AutoTrader, Cars.com, or dealer sites.' +
      (cpoCase ? '\n3. Also search for CPO listings specifically since this was purchased new/CPO.' : '') +
      '\n4. Determine true fair market value range based ONLY on real listings — ignore the insurance offer entirely when valuing.' +
      '\n5. If the offer is within 5% of fair value, say so honestly — case strength should be "Fair Offer".' +
      '\n6. If offer is 5-15% below fair value = Moderate. 15%+ below = Strong.' +
      '\n\nReturn ONLY valid JSON, no other text:' +
      '\n{' +
      '\n  "estimatedLowValue": <number>,' +
      '\n  "estimatedHighValue": <number>,' +
      '\n  "caseStrength": "Strong"|"Moderate"|"Weak"|"Fair Offer",' +
      '\n  "offerAssessment": "<one sentence honest assessment>",' +
      '\n  "realListings": [{"price": <number>, "miles": <number>, "source": "<site>", "certified": <true/false>}],' +
      '\n  "valuationBasis": "<2-3 sentences explaining valuation based on listings found>",' +
      '\n  "arguments": ["<arg1>", "<arg2>", "<arg3>"],' +
      '\n  "wordTrack": "<professional dispute script for calling the adjuster>",' +
      '\n  "disputeLetter": "<formal written dispute letter>",' +
      '\n  "nextSteps": ["<step1>", "<step2>", "<step3>"]' +
      '\n}';

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
    }

    const payload = {
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    };

    // Add API key to headers
    const body = JSON.stringify(payload);
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(new Error('Invalid JSON')); }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    // Extract text from response
    var txt = (result.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    txt = txt.replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(txt);
      return { statusCode: 200, headers, body: JSON.stringify(parsed) };
    } catch(e) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'Parse failed', raw: txt.slice(0, 500) }) };
    }

  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
