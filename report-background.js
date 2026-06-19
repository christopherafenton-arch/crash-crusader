const https = require('https');
const { getStore } = require('@netlify/blobs');

function callAnthropic(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
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
        catch(e) { reject(new Error('Invalid JSON response')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async function(event) {
  const store = getStore('report-jobs');

  try {
    const body = JSON.parse(event.body || '{}');
    const D = body.data;
    const jobId = body.jobId;

    const offer = Number(D.offer) || 0;
    const cpoCase = D.cpoCase || false;
    const yr = D.year, mk = D.make, mo = D.model, tr = D.trim || '';
    const mi = Number(D.miles).toLocaleString();

    const prompt = 'You are an expert auto insurance total loss analyst. Independently determine the fair market value of this vehicle using web search, then compare to the insurance offer.' +
      '\n\nVEHICLE: ' + yr + ' ' + mk + ' ' + mo + (tr ? ' ' + tr : '') +
      '\nMILEAGE: ' + mi + ' miles' +
      '\nCONDITION: ' + (D.condition || 'good') +
      '\nPURCHASE TYPE: ' + (D.purchase || D.purchaseType || 'used') +
      '\nPRIOR ACCIDENTS: ' + (D.accidents || D.prior || 'none') +
      '\nINSURANCE OFFER: $' + offer.toLocaleString() +
      '\nSTATE: ' + (D.state || 'MA') +
      (D.vin ? '\nVIN: ' + D.vin : '') +
      '\n\nINSTRUCTIONS:' +
      '\n1. Search the web for current retail listings: "' + yr + ' ' + mk + ' ' + mo + (tr ? ' ' + tr : '') + ' for sale"' +
      '\n2. Find 3-5 real asking prices from CarGurus, AutoTrader, Cars.com, or dealer sites.' +
      (cpoCase ? '\n3. Also search for CPO listings specifically since this vehicle was purchased new/CPO.' : '') +
      '\n4. Determine true fair market value range based ONLY on real listings found — ignore the insurance offer entirely when valuing.' +
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
      await store.setJSON(jobId, { status: 'error', error: 'API key not configured' });
      return { statusCode: 200, body: 'done' };
    }

    const payload = {
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: prompt }]
    };

    const result = await callAnthropic(apiKey, payload);
    var txt = (result.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    txt = txt.replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(txt);
      await store.setJSON(jobId, { status: 'done', result: parsed });
    } catch(e) {
      await store.setJSON(jobId, { status: 'error', error: 'Parse failed', raw: txt.slice(0, 500) });
    }

    return { statusCode: 200, body: 'done' };

  } catch(e) {
    try {
      const body = JSON.parse(event.body || '{}');
      const store2 = getStore('report-jobs');
      await store2.setJSON(body.jobId, { status: 'error', error: e.message });
    } catch(e2) {}
    return { statusCode: 200, body: 'error handled' };
  }
};
