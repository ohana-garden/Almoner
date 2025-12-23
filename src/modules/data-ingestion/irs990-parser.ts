/**
 * IRS 990 Data Parser
 *
 * Parses IRS 990 bulk data from various formats:
 * - AWS bulk data extracts (CSV)
 * - XML filings
 *
 * Data source: https://www.irs.gov/statistics/soi-tax-stats-annual-extract-of-tax-exempt-organization-financial-data
 */

import * as fs from 'fs';
import * as readline from 'readline';
import type { Raw990Record } from './index';

/**
 * Parse IRS 990 extract CSV file.
 * The IRS provides annual extracts in CSV format with organization data.
 */
export async function parse990ExtractCsv(
  filePath: string,
  onRecord: (record: Raw990Record) => Promise<void>,
  options: { limit?: number; onProgress?: (count: number) => void } = {}
): Promise<{ total: number; errors: string[] }> {
  const errors: string[] = [];
  let total = 0;
  let headerMap: Map<string, number> | null = null;

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    // First line is header
    if (!headerMap) {
      headerMap = parseHeader(line);
      continue;
    }

    if (options.limit && total >= options.limit) {
      break;
    }

    try {
      const record = parseCsvLine(line, headerMap);
      if (record) {
        await onRecord(record);
        total++;

        if (options.onProgress && total % 1000 === 0) {
          options.onProgress(total);
        }
      }
    } catch (error) {
      errors.push(`Line ${total + 2}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { total, errors };
}

/**
 * Parse CSV header to get column indices.
 */
function parseHeader(line: string): Map<string, number> {
  const columns = parseCsvRow(line);
  const map = new Map<string, number>();

  columns.forEach((col, idx) => {
    map.set(col.toLowerCase().trim(), idx);
  });

  return map;
}

/**
 * Parse a CSV line into a Raw990Record.
 */
function parseCsvLine(line: string, headerMap: Map<string, number>): Raw990Record | null {
  const columns = parseCsvRow(line);

  const getValue = (key: string): string => {
    const idx = headerMap.get(key.toLowerCase());
    return idx !== undefined ? columns[idx]?.trim() || '' : '';
  };

  const getNumber = (key: string): number => {
    const val = getValue(key);
    const num = parseInt(val.replace(/[,$]/g, ''), 10);
    return isNaN(num) ? 0 : num;
  };

  const ein = getValue('ein');
  const name = getValue('name') || getValue('organization_name') || getValue('orgname');

  if (!ein || !name) {
    return null;
  }

  return {
    ein: formatEin(ein),
    name,
    city: getValue('city'),
    state: getValue('state'),
    nteeCode: getValue('ntee_cd') || getValue('nteecode') || getValue('ntee'),
    totalAssets: getNumber('totassetsend') || getNumber('total_assets'),
    totalRevenue: getNumber('totrevenue') || getNumber('total_revenue'),
    totalGiving: getNumber('totfuncexpns') || getNumber('grntstogovt') || getNumber('grntdomorg'),
    fiscalYearEnd: getValue('taxperiod') || getValue('tax_period'),
  };
}

/**
 * Parse a CSV row handling quoted values.
 */
function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Format EIN to standard format (XX-XXXXXXX).
 */
function formatEin(ein: string): string {
  const cleaned = ein.replace(/\D/g, '');
  if (cleaned.length === 9) {
    return `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`;
  }
  return cleaned;
}

/**
 * Download 990 extract from IRS website.
 * Returns path to downloaded file.
 */
export async function download990Extract(
  year: number,
  outputDir: string
): Promise<string> {
  // IRS provides annual extracts at predictable URLs
  const url = `https://www.irs.gov/pub/irs-soi/eo${year % 100}.csv`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download 990 extract: ${response.statusText}`);
  }

  const outputPath = `${outputDir}/eo${year}.csv`;

  // Ensure directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const data = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(data));

  return outputPath;
}

/**
 * Get list of available 990 extract years.
 * The IRS typically has data going back to around 2012.
 */
export function getAvailable990Years(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];

  // Data is typically available for prior years
  for (let year = 2012; year <= currentYear - 1; year++) {
    years.push(year);
  }

  return years;
}
