import { z } from 'zod';
import { BadRequestError } from './errors.js';

export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 20;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).default(DEFAULT_LIMIT),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().min(1).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface ParsedPagination<TSort extends string> {
  page: number;
  limit: number;
  skip: number;
  take: number;
  orderBy: Record<TSort, 'asc' | 'desc'>;
  search: string | undefined;
}

/**
 * Parses list query params against a per-module allowlist of sortable columns.
 *
 * `sort` reaches Prisma's orderBy as an object KEY, which is the one place user input could
 * become part of a query structure. We never interpolate it — an unknown column is rejected
 * with 400 and the caller is told which columns are valid. Cap on `limit` stops a client
 * asking for the whole table in one page.
 */
export function parsePagination<const TSort extends string>(
  query: unknown,
  sortable: readonly TSort[],
  defaultSort: TSort,
): ParsedPagination<TSort> {
  const parsed = paginationQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestError('Invalid pagination parameters', parsed.error.issues);
  }

  const { page, limit, sort, order, search } = parsed.data;

  const isSortable = (value: string): value is TSort =>
    (sortable as readonly string[]).includes(value);

  let sortColumn: TSort = defaultSort;
  if (sort !== undefined) {
    if (!isSortable(sort)) {
      throw new BadRequestError(
        `Cannot sort by '${sort}'. Sortable columns: ${sortable.join(', ')}`,
      );
    }
    sortColumn = sort;
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { [sortColumn]: order } as Record<TSort, 'asc' | 'desc'>,
    search,
  };
}

/** Wraps rows in the uniform envelope every list endpoint returns. */
export function paginate<T>(data: T[], total: number, page: number, limit: number): Paginated<T> {
  return {
    data,
    meta: { page, limit, total, totalPages: limit > 0 ? Math.ceil(total / limit) : 0 },
  };
}
