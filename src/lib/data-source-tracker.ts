// Data source tracking and aggregation utility
// Allows collecting data from multiple sources while tracking origin in code (not UI)

export type DataSource = "merolagani" | "nepalstock" | "nepsealpha" | "sharehubnepal" | "floorsheet" | "unknown";

interface SourceMetadata {
  source: DataSource;
  timestamp: string;
  fetchedAt: Date;
  responseTime: number;
  rowCount: number;
  errors?: string[];
}

interface TrackedData<T> {
  item: T;
  source: SourceMetadata;
}

export class DataSourceTracker {
  private static sourceOrder: Record<DataSource, number> = {
    nepalstock: 1,      // Official NEPSE
    nepsealpha: 2,      // Community premium
    merolagani: 3,      // Community free
    floorsheet: 4,      // Local database
    sharehubnepal: 5,   // Community aggregator
    unknown: 99,
  };

  /**
   * Deduplicate items by key, preferring more reliable sources
   */
  static deduplicateBySource<T extends Record<K, any>, K extends string>(
    items: TrackedData<T>[],
    keyField: K
  ): T[] {
    const map = new Map<any, TrackedData<T>>();

    for (const tracked of items) {
      const key = tracked.item[keyField];
      const existing = map.get(key);

      // Keep item with more reliable source
      if (!existing || this.sourceOrder[tracked.source.source] < this.sourceOrder[existing.source.source]) {
        map.set(key, tracked);
      }
    }

    return Array.from(map.values()).map((t) => t.item);
  }

  /**
   * Aggregate data from multiple sources, tracking where each came from
   */
  static aggregate<T>(
    dataBySource: Record<DataSource, T[]>
  ): { items: T[]; sourceBreakdown: Record<DataSource, number>; totalSources: number } {
    const breakdown: Record<DataSource, number> = {} as Record<DataSource, number>;
    const allItems: T[] = [];

    for (const [source, items] of Object.entries(dataBySource)) {
      breakdown[source as DataSource] = items.length;
      allItems.push(...items);
    }

    return {
      items: allItems,
      sourceBreakdown: breakdown,
      totalSources: Object.keys(dataBySource).filter((s) => breakdown[s as DataSource] > 0).length,
    };
  }

  /**
   * Log data source info to console (for debugging, not user-visible)
   */
  static logSourceInfo(data: SourceMetadata[]): void {
    if (typeof window === "undefined") return; // Skip on server

    const grouped = data.reduce(
      (acc, meta) => {
        acc[meta.source] = (acc[meta.source] || 0) + meta.rowCount;
        return acc;
      },
      {} as Record<string, number>
    );

    console.group("📊 Data Source Information");
    console.table(grouped);
    console.log("Total sources:", data.length);
    console.log("All sources loaded from:", Array.from(new Set(data.map((d) => d.source))));
    console.groupEnd();
  }

  /**
   * Validate data completeness across sources
   */
  static validateCompleteness(breakdown: Record<DataSource, number>): {
    hasData: boolean;
    sourceCount: number;
    message: string;
  } {
    const activeCount = Object.values(breakdown).filter((count) => count > 0).length;
    const hasData = activeCount > 0;

    return {
      hasData,
      sourceCount: activeCount,
      message: hasData
        ? `Data from ${activeCount} source(s) - using most reliable sources first`
        : "No data available from any source",
    };
  }
}

/**
 * Fetch from a source with retries and timeout
 */
export async function fetchFromSourceWithRetry(
  url: string,
  options: {
    retries?: number;
    timeout?: number;
    source: DataSource;
  } = { source: "unknown" }
): Promise<{ data: any; meta: SourceMetadata } | null> {
  const { retries = 3, timeout = 5000, source } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const startTime = performance.now();

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Nepal Stock Market Dashboard)",
        },
      });

      clearTimeout(timeoutId);
      const responseTime = performance.now() - startTime;

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      return {
        data,
        meta: {
          source,
          timestamp: new Date().toISOString(),
          fetchedAt: new Date(),
          responseTime,
          rowCount: Array.isArray(data) ? data.length : data?.rows?.length || 1,
        },
      };
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries - 1) {
        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }
  }

  return null;
}

/**
 * Convert source name to display name (for console logs and monitoring)
 */
export function getSourceDisplayName(source: DataSource): string {
  const names: Record<DataSource, string> = {
    nepalstock: "🏛️ Nepal Stock Exchange",
    nepsealpha: "⭐ NEPSE Alpha",
    merolagani: "💼 MeroLagani",
    floorsheet: "💾 Local Database",
    sharehubnepal: "🌐 ShareHubNepal",
    unknown: "❓ Unknown",
  };
  return names[source] || names.unknown;
}
