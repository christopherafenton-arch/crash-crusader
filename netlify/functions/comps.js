import https from 'https';

const MC_API_KEY = 'mc_live_MCG1g62XE7kFVKRpnkvokBKecqnc5DOS';

function fetchURL(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

export const handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const params = event.queryStringParameters || {};
    const { year, make, model, miles, state, cpo } = params;
    const milesNum = Number(miles) || 50000;
    const milesMin = Math.round(milesNum * 0.7);
    const milesMax = Math.round(milesNum * 1.3);
    const searchState = (!state || state === 'other') ? '' : state;
    const encodedMake = encodeURIComponent(make || '');
    const encodedModel = encodeURIComponent(model || '');
    const results = { cpo: [], nonCpo: [] };

    if (cpo === 'true') {
      const cpoData = await fetchURL(`https://mc-api.marketcheck.com/v2/search/car/active?api_key=${MC_API_KEY}&year=${year}&make=${encodedMake}&model=${encodedModel}&certified=true&miles_min=${milesMin}&miles_max=${milesMax}&state=${searchState}&radius=150&rows=5&sort_by=price&sort_order=asc`);
      if (cpoData && cpoData.listings) {
        results.cpo = cpoData.listings.filter(l => l.price > 0).map(l => ({ price: l.price, miles: l.miles, source: l.dealer ? l.dealer.name : 'Dealer', city: l.dealer ? l.dealer.city : '' }));
      }
      const ncpoData = await fetchURL(`https://mc-api.marketcheck.com/v2/search/car/active?api_key=${MC_API_KEY}&year=${year}&make=${encodedMake}&model=${encodedModel}&certified=false&miles_min=${milesMin}&miles_max=${milesMax}&state=${searchState}&radius=150&rows=5&sort_by=price&sort_order=asc`);
      if (ncpoData && ncpoData.listings) {
        results.nonCpo = ncpoData.listings.filter(l => l.price > 0).map(l => ({ price: l.price, miles: l.miles, source: l.dealer ? l.dealer.name : 'Dealer', city: l.dealer ? l.dealer.city : '' }));
      }
    } else {
      const compData = await fetchURL(`https://mc-api.marketcheck.com/v2/search/car/active?api_key=${MC_API_KEY}&year=${year}&make=${encodedMake}&model=${encodedModel}&miles_min=${milesMin}&miles_max=${milesMax}&state=${searchState}&radius=150&rows=8&sort_by=price&sort_order=asc`);
      if (compData && compData.listings) {
        results.nonCpo = compData.listings.filter(l => l.price > 0).map(l => ({ price: l.price, miles: l.miles, source: l.dealer ? l.dealer.name : 'Dealer', city: l.dealer ? l.dealer.city : '' }));
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify(results) };
  } catch(e) {
    return { statusCode: 200, headers, body: JSON.stringify({ cpo: [], nonCpo: [] }) };
  }
};
