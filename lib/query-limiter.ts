/**
 * Query Complexity Limiter
 * Prevents DoS attacks through expensive database queries
 */

// Query limits configuration
export const QUERY_LIMITS = {
  // Maximum number of records to fetch
  maxRecords: {
    default: 100,
    products: 50,
    orders: 25,
    users: 20,
    auditLogs: 100,
  },
  
  // Maximum query depth for nested relations
  maxDepth: {
    default: 2,
    products: 3, // Product -> Images -> Reviews
    orders: 3,    // Order -> Items -> Product
  },
  
  // Maximum number of include/select fields
  maxFields: {
    default: 10,
    detailed: 20,
  },
  
  // Query timeout in milliseconds
  timeout: {
    default: 5000,  // 5 seconds
    complex: 10000,  // 10 seconds for complex queries
    report: 30000,   // 30 seconds for reports
  },
};

/**
 * Apply safe query limits to Prisma queries
 */
export function applyQueryLimits<T extends Record<string, any>>(
  query: T,
  type: keyof typeof QUERY_LIMITS.maxRecords = 'default'
): T & { take?: number } {
  const limited: any = { ...query };
  
  // Apply take limit if not specified or too high
  if (!limited.take || limited.take > QUERY_LIMITS.maxRecords[type]) {
    limited.take = QUERY_LIMITS.maxRecords[type];
  }
  
  return limited as T & { take?: number };
}

/**
 * Validate pagination parameters
 */
export function validatePagination(params: {
  page?: number | string;
  limit?: number | string;
  offset?: number | string;
}): {
  skip: number;
  take: number;
  page: number;
} {
  // Parse and validate page
  let page = 1;
  if (params.page) {
    const parsed = typeof params.page === 'string' ? parseInt(params.page, 10) : params.page;
    if (!isNaN(parsed) && parsed > 0) {
      page = parsed;
    }
  }
  
  // Parse and validate limit
  let limit = 20; // Default limit
  if (params.limit) {
    const parsed = typeof params.limit === 'string' ? parseInt(params.limit, 10) : params.limit;
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, QUERY_LIMITS.maxRecords.default);
    }
  }
  
  // Calculate skip (offset)
  let skip = (page - 1) * limit;
  if (params.offset) {
    const parsed = typeof params.offset === 'string' ? parseInt(params.offset, 10) : params.offset;
    if (!isNaN(parsed) && parsed >= 0) {
      skip = parsed;
    }
  }
  
  // Prevent excessive pagination
  const maxSkip = 10000; // Don't allow skipping more than 10k records
  skip = Math.min(skip, maxSkip);
  
  return {
    skip,
    take: limit,
    page,
  };
}

/**
 * Count query depth to prevent deeply nested queries
 */
export function countQueryDepth(query: any, currentDepth = 0): number {
  if (!query || typeof query !== 'object') {
    return currentDepth;
  }
  
  let maxDepth = currentDepth;
  
  // Check include field
  if (query.include) {
    for (const key in query.include) {
      const subQuery = query.include[key];
      if (typeof subQuery === 'object' && subQuery !== null) {
        const depth = countQueryDepth(subQuery, currentDepth + 1);
        maxDepth = Math.max(maxDepth, depth);
      }
    }
  }
  
  // Check select field
  if (query.select) {
    for (const key in query.select) {
      const subQuery = query.select[key];
      if (typeof subQuery === 'object' && subQuery !== null && subQuery !== true) {
        const depth = countQueryDepth(subQuery, currentDepth + 1);
        maxDepth = Math.max(maxDepth, depth);
      }
    }
  }
  
  return maxDepth;
}

/**
 * Validate query complexity
 */
export function validateQueryComplexity(
  query: any,
  type: keyof typeof QUERY_LIMITS.maxDepth = 'default'
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Check query depth
  const depth = countQueryDepth(query);
  if (depth > QUERY_LIMITS.maxDepth[type]) {
    errors.push(`Query depth ${depth} exceeds maximum ${QUERY_LIMITS.maxDepth[type]}`);
  }
  
  // Count total fields being selected/included
  let fieldCount = 0;
  function countFields(obj: any) {
    if (!obj || typeof obj !== 'object') return;
    for (const key in obj) {
      fieldCount++;
      if (typeof obj[key] === 'object' && obj[key] !== null && obj[key] !== true) {
        countFields(obj[key]);
      }
    }
  }
  
  if (query.select) countFields(query.select);
  if (query.include) countFields(query.include);
  
  if (fieldCount > QUERY_LIMITS.maxFields.detailed) {
    errors.push(`Query selects ${fieldCount} fields, exceeds maximum ${QUERY_LIMITS.maxFields.detailed}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Safe query executor with timeout
 */
export async function executeWithTimeout<T>(
  queryFn: () => Promise<T>,
  timeoutMs: number = QUERY_LIMITS.timeout.default
): Promise<T> {
  return Promise.race([
    queryFn(),
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout exceeded')), timeoutMs)
    ),
  ]);
}

/**
 * Create a safe paginated query
 */
export function createSafePaginatedQuery<T extends Record<string, any>>(
  baseQuery: T,
  pagination: { page?: number | string; limit?: number | string },
  type: keyof typeof QUERY_LIMITS.maxRecords = 'default'
): T & { skip: number; take: number } {
  const { skip, take } = validatePagination(pagination);
  
  return {
    ...baseQuery,
    skip,
    take: Math.min(take, QUERY_LIMITS.maxRecords[type]),
  };
}

/**
 * Sanitize orderBy to prevent injection
 */
export function sanitizeOrderBy(
  orderBy: any,
  allowedFields: string[]
): any {
  if (!orderBy) return undefined;
  
  // Handle array of orderBy
  if (Array.isArray(orderBy)) {
    return orderBy
      .filter(item => {
        const field = Object.keys(item)[0];
        return allowedFields.includes(field);
      })
      .slice(0, 3); // Max 3 sort fields
  }
  
  // Handle single orderBy object
  if (typeof orderBy === 'object') {
    const filtered: any = {};
    for (const field in orderBy) {
      if (allowedFields.includes(field)) {
        filtered[field] = orderBy[field] === 'desc' ? 'desc' : 'asc';
      }
    }
    return Object.keys(filtered).length > 0 ? filtered : undefined;
  }
  
  return undefined;
}

/**
 * Middleware to apply query limits
 */
export function withQueryLimits<T extends (...args: any[]) => Promise<any>>(
  handler: T,
  options?: {
    type?: keyof typeof QUERY_LIMITS.maxRecords;
    timeout?: number;
  }
): T {
  return (async (...args: Parameters<T>) => {
    const timeout = options?.timeout || QUERY_LIMITS.timeout.default;
    
    try {
      return await executeWithTimeout(
        () => handler(...args),
        timeout
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'Query timeout exceeded') {
        throw new Error('Query took too long to execute. Please refine your search.');
      }
      throw error;
    }
  }) as T;
}