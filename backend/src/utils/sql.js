// Small helper for PATCH endpoints: builds "col = $1, col2 = $2" from the fields that were sent.
function buildUpdate(allowed, input, startIndex = 0) {
  const sets = [];
  const params = [];
  for (const field of allowed) {
    if (input[field] !== undefined) {
      params.push(input[field]);
      sets.push(`${field} = $${startIndex + params.length}`);
    }
  }
  return { sets, params };
}

module.exports = { buildUpdate };
