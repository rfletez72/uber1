'use strict';
require('dotenv').config();

const axios = require('axios');


async function getTokenFromCode(authorizationCode) {
  const params = new URLSearchParams({
    client_secret: '6r260GfUHNzAES69fnf3sVgImpMeSVnuPJDleK4c',
    client_id: process.env.UBER_CLIENT_ID,
    grant_type: 'authorization_code',
    redirect_uri: 'https://cosmic-dealing-guy.ngrok-free.dev',
    code: authorizationCode
  });

  const response = await axios.post(
    'https://sandbox-login.uber.com/oauth/v2/token',
    params.toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );

  return response.data;
}

console.log('c: ', process.env.UBER_CLIENT_ID);

getTokenFromCode('crd.EA.CAESEHEjOQRirE5Fl6D9ScbmUjsiATE.Gbr3m0oNK0K6l4bovQBFYA9yw3d1I52gwFysfu32pFg#_')
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(err => console.error(err.response?.data || err.message));

// To Run type:
// $node get1token.js


// first we need the token from:
// https://sandbox-login.uber.com/oauth/v2/authorize?client_id=GoPVbSUAoIjlRmk6Ej-j__HBPjpfOgP3&redirect_uri=https://cosmic-dealing-guy.ngrok-free.dev&scope=eats.pos_provisioning&response_type=code
// scope=eats.pos_provisioning%20eats.order%20eats.store
// we will get the code as follow
// https://cosmic-dealing-guy.ngrok-free.dev/?code=crd.EA.CAESEFao9eFEcE2-slFdMXAsqMQiATE.-lR8Y9JYH7blnlGoCQEplX5VXbwJg4th2smIYO7ZNP4#_


// {
//   "access_token": "IA.AQAAAAfyVqJIbCRJFphl0ccBsoSbznYPEq8a19PkL_rcZzBJGTfYpJEpwHCND7GXsvNwe61VRfXVoIsq83RKGuoFitC2ppspzXfcPmiQZu_V9aKaM0qpFCWbEwuGfMT5dC1WTcr5k1x-gpjsHy94R2jcJeDYfujQQLrhOS5JmVB9QA",
//   "token_type": "Bearer",
//   "expires_in": 2592000,
//   "refresh_token": "MA.CAESEEopZ9n-ekUoi8yD8btkiW4iATEyATFCJDY2ODRkZWM4LWI4ODktNGQ5OC04NzQwLTFiMjAxOTRjN2QwMkogR29QVmJTVUFvSWpsUm1rNkVqLWpfX0hCUGpwZk9nUDNSJGQ0OWVmNzBmLTNmYjktNDg3Ny1iMmM2LWViNzczMjBjZDIxMQ.GRknOc8KgWej5UV2CVHW-Crb4793NIrkF1mxEAJrNaI.zJUZ6-eyDbgM6B-SMEm6C7KwpS_t0FPqxBnvwtPm8-o",
//   "scope": "eats.pos_provisioning offline_access"
// }

// the response will include expires_in: 2599xxx this are seconds, so we need to calculate the refresh token using
// console.log(Date.now() + expires_in * 1000)
// UBER_TOKEN_EXPIRES_AT=1752019200000