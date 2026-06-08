'use strict';

const axios = require('axios');

const ACCESS_TOKEN = 'IA.AQAAAAfyVqJIbCRJFphl0ccBsoSbznYPEq8a19PkL_rcZzBJGTfYpJEpwHCND7GXsvNwe61VRfXVoIsq83RKGuoFitC2ppspzXfcPmiQZu_V9aKaM0qpFCWbEwuGfMT5dC1WTcr5k1x-gpjsHy94R2jcJeDYfujQQLrhOS5JmVB9QA';

axios.get('https://test-api.uber.com/v1/eats/stores', {
  headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
})
.then(r => console.log(JSON.stringify(r.data, null, 2)))
.catch(e => console.error(e.response?.data || e.message));





// To Run type:
// $node get2stores.js


