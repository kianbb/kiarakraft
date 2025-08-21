import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRateLimit, orderRateLimit } from '@/lib/rateLimit';

async function getSearchSuggestions(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 10);

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    const searchTerm = query.trim();

    // Get search suggestions using PostgreSQL trigram similarity
    const suggestions = await prisma.$queryRaw<
      Array<{ suggestion: string; type: string }>
    >`
      (
        -- Product titles that start with the query (highest priority)
        SELECT DISTINCT 
          title as suggestion,
          'product' as type
        FROM "Product"
        WHERE 
          active = true 
          AND "eligibilityStatus" = 'APPROVED'
          AND stock > 0
          AND LOWER(title) LIKE LOWER(${searchTerm + '%'})
        ORDER BY LENGTH(title), title
        LIMIT 3
      )
      UNION ALL
      (
        -- Product titles with trigram similarity (medium priority)
        SELECT DISTINCT 
          title as suggestion,
          'product' as type
        FROM "Product"
        WHERE 
          active = true 
          AND "eligibilityStatus" = 'APPROVED'
          AND stock > 0
          AND SIMILARITY(title, ${searchTerm}) > 0.3
          AND NOT LOWER(title) LIKE LOWER(${searchTerm + '%'}) -- Exclude already found
        ORDER BY SIMILARITY(title, ${searchTerm}) DESC, LENGTH(title)
        LIMIT 2
      )
      UNION ALL
      (
        -- Category names (lower priority)
        SELECT DISTINCT 
          name as suggestion,
          'category' as type
        FROM "Category"
        WHERE 
          LOWER(name) LIKE LOWER('%' || ${searchTerm} || '%')
          OR SIMILARITY(name, ${searchTerm}) > 0.4
        ORDER BY 
          CASE WHEN LOWER(name) LIKE LOWER(${searchTerm + '%'}) THEN 1 ELSE 2 END,
          LENGTH(name)
        LIMIT 2
      )
      LIMIT ${limit}
    `;

    return NextResponse.json({
      suggestions: suggestions.map(s => ({
        text: s.suggestion.trim(),
        type: s.type,
      })),
    });
  } catch (error) {
    console.error('Error getting search suggestions:', error);
    return NextResponse.json({ suggestions: [] });
  }
}

export const GET = withRateLimit(orderRateLimit, getSearchSuggestions);
