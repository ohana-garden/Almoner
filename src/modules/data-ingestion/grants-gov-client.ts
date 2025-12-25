/**
 * Grants.gov API Client
 *
 * Fetches grant opportunities from the Grants.gov API.
 * API Docs: https://grants.gov/api/api-guide
 *
 * Updated for the new search2 API (2024+)
 */

import type { RawGrantRecord } from './index';

// New Grants.gov API endpoint (2024+)
const GRANTS_GOV_BASE_URL = 'https://api.grants.gov/v1/api/search2';
const GRANTS_GOV_DETAIL_URL = 'https://api.grants.gov/v1/api/fetchOpportunity';

/**
 * Search options for Grants.gov API.
 */
export interface GrantsGovSearchOptions {
  keyword?: string;
  agency?: string;
  eligibility?: string;
  fundingInstrument?: 'CA' | 'G' | 'PC' | 'O'; // Cooperative Agreement, Grant, Procurement, Other
  category?: string;
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  oppStatus?: 'posted' | 'closed' | 'archived' | 'forecasted';
  rows?: number;
  startIndex?: number;
}

/**
 * Response from new Grants.gov search2 API.
 */
interface GrantsGovResponse {
  totalCount: number;
  opportunities: Array<{
    opportunityId: string;
    opportunityNumber: string;
    title: string;
    agencyCode: string;
    agency: string;
    openDate: string;
    closeDate: string;
    oppStatus: string;
    awardCeiling: number;
    awardFloor: number;
    fundingInstruments?: string[];
    categories?: string[];
    eligibilities?: string[];
  }>;
}

/**
 * Detailed opportunity from Grants.gov.
 */
interface GrantsGovOpportunity {
  id: string;
  opportunityNumber: string;
  opportunityTitle: string;
  agencyCode: string;
  agencyName: string;
  awardCeiling: number;
  awardFloor: number;
  closeDate: string;
  postDate: string;
  eligibleApplicants: string[];
  fundingActivityCategories: string[];
  synopsis: string;
  applicationUrl: string;
}

/**
 * Grants.gov API client (updated for search2 API).
 */
export class GrantsGovClient {
  private baseUrl: string;

  constructor(_apiKey?: string) {
    // API key no longer required for search2 API
    this.baseUrl = GRANTS_GOV_BASE_URL;
  }

  /**
   * Search for grant opportunities using the new search2 API.
   */
  async search(options: GrantsGovSearchOptions = {}): Promise<RawGrantRecord[]> {
    const body = this.buildSearchBody(options);

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Grants.gov API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const data = (await response.json()) as GrantsGovResponse;
    return this.transformResults(data.opportunities || []);
  }

  /**
   * Get detailed information about a specific opportunity.
   */
  async getOpportunity(opportunityId: string): Promise<GrantsGovOpportunity | null> {
    try {
      const response = await fetch(GRANTS_GOV_DETAIL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ opportunityId }),
      });

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as GrantsGovOpportunity;
    } catch {
      return null;
    }
  }

  /**
   * Fetch all opportunities matching criteria, handling pagination.
   */
  async fetchAll(
    options: GrantsGovSearchOptions,
    onProgress?: (fetched: number, total: number) => void
  ): Promise<RawGrantRecord[]> {
    const allRecords: RawGrantRecord[] = [];
    const pageSize = options.rows || 100;
    let startIndex = 0;
    let totalHits = Infinity;

    while (startIndex < totalHits && startIndex < 1000) { // Limit to 1000 max
      const body = this.buildSearchBody({
        ...options,
        rows: pageSize,
        startIndex,
      });

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Grants.gov API error: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const data = (await response.json()) as GrantsGovResponse;
      totalHits = data.totalCount || 0;

      const records = this.transformResults(data.opportunities || []);
      allRecords.push(...records);

      startIndex += pageSize;

      if (onProgress) {
        onProgress(allRecords.length, totalHits);
      }

      // Rate limiting - wait between requests
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Stop if we got no results
      if (!data.opportunities || data.opportunities.length === 0) {
        break;
      }
    }

    return allRecords;
  }

  /**
   * Build JSON body for search2 API.
   */
  private buildSearchBody(options: GrantsGovSearchOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {};

    if (options.keyword) {
      body.keyword = options.keyword;
    }

    if (options.agency) {
      body.agencies = options.agency;
    }

    if (options.eligibility) {
      body.eligibilities = options.eligibility;
    }

    if (options.fundingInstrument) {
      body.fundingInstruments = options.fundingInstrument;
    }

    if (options.category) {
      body.fundingCategories = options.category;
    }

    if (options.oppStatus) {
      body.oppStatuses = options.oppStatus;
    }

    if (options.dateRange) {
      body.postedFrom = this.formatDate(options.dateRange.startDate);
      body.postedTo = this.formatDate(options.dateRange.endDate);
    }

    body.rows = options.rows || 25;
    body.startRecordNum = options.startIndex || 0;

    return body;
  }

  /**
   * Format date for API.
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Transform API results to RawGrantRecord format.
   */
  private transformResults(
    results: GrantsGovResponse['opportunities']
  ): RawGrantRecord[] {
    if (!results) return [];

    return results.map((opp) => ({
      opportunityId: opp.opportunityId,
      opportunityTitle: opp.title,
      agencyName: opp.agency || opp.agencyCode,
      awardCeiling: opp.awardCeiling || 0,
      awardFloor: opp.awardFloor || 0,
      closeDate: opp.closeDate,
      eligibleApplicants: opp.eligibilities || [],
      categoryOfFunding: opp.categories?.[0] || 'Other',
      applicationUrl: `https://www.grants.gov/search-results-detail/${opp.opportunityId}`,
    }));
  }
}

/**
 * Eligibility codes mapping.
 */
export const ELIGIBILITY_CODES: Record<string, string> = {
  '00': 'State governments',
  '01': 'County governments',
  '02': 'City or township governments',
  '04': 'Special district governments',
  '05': 'Independent school districts',
  '06': 'Public and State controlled institutions of higher education',
  '07': 'Native American tribal governments (Federally recognized)',
  '11': 'Native American tribal organizations',
  '12': 'Nonprofits with 501(c)(3) status',
  '13': 'Nonprofits without 501(c)(3) status',
  '20': 'Private institutions of higher education',
  '21': 'Individuals',
  '22': 'For profit organizations other than small businesses',
  '23': 'Small businesses',
  '25': 'Others',
  '99': 'Unrestricted',
};

/**
 * Funding category codes mapping.
 */
export const FUNDING_CATEGORIES: Record<string, string> = {
  AA: 'Arts',
  AG: 'Agriculture',
  BC: 'Business and Commerce',
  CD: 'Community Development',
  CP: 'Consumer Protection',
  DPR: 'Disaster Prevention and Relief',
  ED: 'Education',
  ELT: 'Employment, Labor, and Training',
  EN: 'Energy',
  ENV: 'Environment',
  FN: 'Food and Nutrition',
  HL: 'Health',
  HO: 'Housing',
  HU: 'Humanities',
  IIJ: 'Information and Statistics',
  IS: 'Income Security and Social Services',
  ISS: 'Information and Statistics',
  LJL: 'Law, Justice and Legal Services',
  NR: 'Natural Resources',
  O: 'Other',
  RA: 'Recovery Act',
  RD: 'Regional Development',
  ST: 'Science and Technology',
  T: 'Transportation',
};
