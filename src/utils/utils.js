function GetReqValues(req) {
  if (Object.keys(req.query).length > 0)
    return req.query;
  else
    return req.body;
}

module.exports = {
  GetReqValues
};
