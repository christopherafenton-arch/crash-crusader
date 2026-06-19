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
    const jobId = (event.queryStringParameters || {}).jobId;
    if (!jobId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'jobId required' }) };
    }

    const store = getStore('report-jobs');
    const job = await store.get(jobId, { type: 'json' });

    if (!job) {
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(job) };

  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
