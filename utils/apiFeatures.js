/**
 * Lightweight query-builder used by list endpoints (Activities, Businesses)
 * to apply search, filtering, sorting, and pagination consistently.
 *
 * Usage:
 *   const features = new ApiFeatures(Model.find(baseFilter), req.query)
 *     .search(['title', 'description'])
 *     .filter(['category', 'status'])
 *     .sort()
 *     .paginate();
 *   const results = await features.query;
 *   const meta = await features.getMeta(Model, baseFilter);
 */
class ApiFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
  }

  // Text search across the given fields using a case-insensitive regex OR match.
  // (Falls back to regex rather than $text so it works even without a text index
  // on every deployment, and supports partial-word matches.)
  search(fields = []) {
    if (this.queryString.search && fields.length) {
      const regex = new RegExp(this.queryString.search.trim(), 'i');
      this.query = this.query.find({ $or: fields.map((f) => ({ [f]: regex })) });
    }
    return this;
  }

  // Allow-listed equality/range filters, e.g. ?category=sports&minRating=4
  filter(allowedFields = []) {
    const queryObj = { ...this.queryString };
    ['search', 'sort', 'page', 'limit', 'fields', 'minRating', 'minPrice', 'maxPrice', 'lat', 'lng', 'radius'].forEach(
      (f) => delete queryObj[f]
    );

    Object.keys(queryObj).forEach((key) => {
      if (!allowedFields.includes(key)) delete queryObj[key];
    });

    if (Object.keys(queryObj).length) {
      this.query = this.query.find(queryObj);
    }

    if (this.queryString.minRating) {
      this.query = this.query.find({ ratingsAverage: { $gte: Number(this.queryString.minRating) } });
    }

    return this;
  }

  sort(defaultSort = '-createdAt') {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort(defaultSort);
    }
    return this;
  }

  paginate() {
    const page = Math.max(parseInt(this.queryString.page, 10) || 1, 1);
    const limit = Math.min(parseInt(this.queryString.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    this.query = this.query.skip(skip).limit(limit);
    this.page = page;
    this.limit = limit;
    return this;
  }

  async getMeta(Model, countFilter = {}) {
    const total = await Model.countDocuments(countFilter);
    return {
      total,
      page: this.page || 1,
      limit: this.limit || 20,
      totalPages: Math.ceil(total / (this.limit || 20)),
    };
  }
}

module.exports = ApiFeatures;
