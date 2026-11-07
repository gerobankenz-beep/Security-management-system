// Helpers that produce the standard success shapes from the API contract.
function ok(res, data, status = 200) {
  return res.status(status).json({ data });
}

function created(res, data) {
  return ok(res, data, 201);
}

function list(res, data, meta) {
  return res.status(200).json({ data, meta });
}

module.exports = { ok, created, list };
