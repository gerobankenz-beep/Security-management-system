// Reads ?page=1&per_page=20 from the URL. Returns safe numbers.
function parsePagination(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const perPage = Math.min(Math.max(parseInt(query.per_page, 10) || 20, 1), 100);
  return { page, perPage, offset: (page - 1) * perPage };
}

module.exports = { parsePagination };
