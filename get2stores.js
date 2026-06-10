'use strict';




const { getData } = require('./src/utils/fetch');

// const ACCESS_TOKEN = 'IA.AQAAAAfyVqJIbCRJFphl0ccBsoSbznYPEq8a19PkL_rcZzBJGTfYpJEpwHCND7GXsvNwe61VRfXVoIsq83RKGuoFitC2ppspzXfcPmiQZu_V9aKaM0qpFCWbEwuGfMT5dC1WTcr5k1x-gpjsHy94R2jcJeDYfujQQLrhOS5JmVB9QA';
const ACCESS_TOKEN = 'IA.AQAAAAeyjFjb-7ddtt9PFpNffBQlO-Se0KqS7VdipTt84rWvw1bllUGt1IM_My8XxDwWAECpCnnOG-XqWQ8ioKWwpNhgiKncNhmXqmix6THVZzjVb-P7a0-lNELttIt-gpFvIS4TimRku0zEzQTn9so3JLQE7WDMInndmI9b2ry4EQ';

getData('https://test-api.uber.com/v1/eats/stores', { Authorization: `Bearer ${ACCESS_TOKEN}` })
  .then(data => console.log(data))
  .catch(e => console.error(e.message));


  // .then(data => console.log(JSON.stringify(data, null, 2))) this will show in text


  // using axis
// const axios = require('axios');
// axios.get('https://test-api.uber.com/v1/eats/stores', {
//   headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
// })
// .then(r => console.log(JSON.stringify(r.data, null, 2)))
// .catch(e => console.error(e.response?.data || e.message));


// To Run type:
// $node get2stores.js


