const { getStore } = require('@netlify/blobs');

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
    const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);

    const store = getStore('report-jobs');
    await store.setJSON(jobId, { status: 'pending' });

    // Fire the background function (don't await — let it run async)
    const siteUrl = process.env.URL || 'https://crashcrusader.com';
    fetch(siteUrl + '/.netlify/functions/report-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: jobId, data: D })
    }).catch(() => {});

    return { statusCode: 200, headers, body: JSON.stringify({ jobId: jobId }) };

  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
