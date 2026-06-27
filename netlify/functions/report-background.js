const https = require('https');
const { getStore } = require('@netlify/blobs');

function getJobStore() {
  return getStore('report-jobs');
}

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
  const store = getJobStore();

  try {
    const body = JSON.parse(event.body || '{}');
    const D = body.data;
    const jobId = body.jobId;

    const offer = Number(D.offer) || 0;
    const cpoCase = D.cpoCase || false;
    const cpoBrand = D.cpoBrandInfo || null;
    const cpoWarnings = D.cpoWarnings || [];
    const yr = D.year, mk = D.make, mo = D.model, tr = D.trim || '';
    const miles = Number(D.miles);
    const mi = miles.toLocaleString();
    const vehicleAge = new Date().getFullYear() - Number(yr);

    // Determine if vehicle is still within CPO eligibility ceiling (mileage/age)
    var cpoStillEligible = cpoCase && cpoBrand;
    if (cpoStillEligible && cpoBrand.maxMiles && miles > cpoBrand.maxMiles) {
      cpoStillEligible = false;
    }
    if (cpoStillEligible && cpoBrand.maxAge && vehicleAge > cpoBrand.maxAge) {
      cpoStillEligible = false;
    }

    var cpoInstruction = '';
    if (cpoStillEligible) {
      cpoInstruction = '\n\nCRITICAL — CPO WARRANTY ARGUMENT (HIGHEST PRIORITY):' +
        '\nThis vehicle was purchased ' + (D.purchase || D.purchaseType) + ' and remains within the brand\'s CPO eligibility window (under ' + (cpoBrand.maxMiles ? cpoBrand.maxMiles.toLocaleString() + ' miles' : 'mileage cap') + (cpoBrand.maxAge ? ' and ' + cpoBrand.maxAge + ' model years' : '') + ').' +
        '\nThe vehicle currently carries: ' + cpoBrand.warranty +
        '\nYou MUST cite this exact warranty coverage in your arguments and dispute letter. State explicitly that any replacement vehicle used as a comparable MUST be Certified Pre-Owned (CPO) — a non-certified replacement does not carry equivalent warranty coverage and is NOT a valid comparable under standard total loss valuation practice.' +
        '\nWhen searching for comparable vehicles, search SPECIFICALLY for CPO/Certified Pre-Owned listings of this exact vehicle. Do not rely on general used listings for the primary valuation — CPO listings are the correct comparable.';
    } else if (cpoCase && cpoBrand) {
      cpoInstruction = '\n\nNOTE ON CPO STATUS:' +
        '\nThis vehicle was purchased ' + (D.purchase || D.purchaseType) + ', but at ' + mi + ' miles' + (vehicleAge ? ' and ' + vehicleAge + ' years old' : '') + ', it has exceeded this brand\'s CPO certification eligibility window (' + (cpoBrand.maxMiles ? 'max ' + cpoBrand.maxMiles.toLocaleString() + ' miles' : '') + (cpoBrand.maxAge ? ', max ' + cpoBrand.maxAge + ' model years' : '') + ').' +
        '\nThis means the vehicle could no longer be certified CPO today even if traded in, so a CPO replacement comparable is not realistic to demand. Use standard clean used-vehicle comparables instead. You may still note that the vehicle benefited from CPO-level coverage for most of its ownership life, but do not argue for CPO replacement comps.';
    }

    const prompt = 'You are an expert auto insurance total loss analyst. Independently determine the fair market value of this vehicle using web search, then compare to the insurance offer.' +
      '\n\nVEHICLE: ' + yr + ' ' + mk + ' ' + mo + (tr ? ' ' + tr : '') +
      '\nMILEAGE: ' + mi + ' miles' +
      '\nCONDITION: ' + (D.condition || 'good') +
      '\nPURCHASE TYPE: ' + (D.purchase || D.purchaseType || 'used') +
      '\nPRIOR ACCIDENTS (on this vehicle): ' + (D.accidents || D.prior || 'none') +
      '\nINSURANCE OFFER: $' + offer.toLocaleString() +
      '\nSTATE: ' + (D.state || 'MA') +
      (D.vin ? '\nVIN: ' + D.vin : '') +
      cpoInstruction +
      '\n\nCOMPARABLE VEHICLE REQUIREMENTS (MANDATORY):' +
      '\n- Only count listings for CLEAN TITLE vehicles with NO reported accident or salvage history. If a listing or its description mentions an accident, salvage title, rebuilt title, frame damage, or flood damage, EXCLUDE it from your comparables entirely.' +
      '\n- Only count listings that reasonably match the trim level specified above. Do not count listings for a different trim as if they were equivalent.' +
      (cpoStillEligible ? '\n- Prioritize CPO/Certified Pre-Owned listings as your primary comparables per the instruction above.' : '') +
      '\n\nINSTRUCTIONS:' +
      '\n1. Search the web for current retail listings: "' + yr + ' ' + mk + ' ' + mo + (tr ? ' ' + tr : '') + (cpoStillEligible ? ' certified pre-owned' : '') + ' for sale"' +
      '\n2. Find 3-5 real asking prices from CarGurus, AutoTrader, Cars.com, or dealer sites that meet the comparable requirements above.' +
      '\n3. Determine true fair market value range based ONLY on real, clean-title, trim-matched listings found — ignore the insurance offer entirely when valuing.' +
      '\n4. If the offer is within 5% of fair value, say so honestly — case strength should be "Fair Offer".' +
      '\n5. If offer is 5-15% below fair value = Moderate. 15%+ below = Strong.' +
      '\n6. In the "arguments" array, if this is a CPO-eligible case, the FIRST argument must cite the specific brand warranty terms and demand CPO comparables.' +
      '\n\nReturn ONLY valid JSON, no other text:' +
      '\n{' +
      '\n  "estimatedLowValue": <number>,' +
      '\n  "estimatedHighValue": <number>,' +
      '\n  "caseStrength": "Strong"|"Moderate"|"Weak"|"Fair Offer",' +
      '\n  "offerAssessment": "<one sentence honest assessment>",' +
      '\n  "realListings": [{"price": <number>, "miles": <number>, "source": "<site>", "certified": <true/false>}],' +
      '\n  "valuationBasis": "<2-3 sentences explaining valuation based on listings found, noting CPO status and clean-title filtering>",' +
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
      const store2 = getJobStore();
      await store2.setJSON(body.jobId, { status: 'error', error: e.message });
    } catch(e2) {}
    return { statusCode: 200, body: 'error handled' };
  }
};
