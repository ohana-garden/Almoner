/**
 * Grants.gov API Client
 *
 * Fetches grant opportunities from the Grants.gov API.
 * API Docs: https://www.grants.gov/web-services
 *
 * Note: Grants.gov has rate limits and requires registration for production use.
 */

import type { RawGrantRecord } from './index';

const GRANTS_GOV_BASE_URL = 'https://www.grants.gov/grantsws/rest/opportunities/search';

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
 * Response from Grants.gov API.
 */
interface GrantsGovResponse {
  oppHits: number;
  oppSearch: Array<{
    id: string;
    number: string;
    title: string;
    agency: string;
    openDate: string;
    closeDate: string;
    oppStatus: string;
    docType: string;
    cfdaNumber: string;
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
 * Grants.gov API client.
 */
export class GrantsGovClient {
  private apiKey?: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    this.baseUrl = GRANTS_GOV_BASE_URL;
  }

  /**
   * Search for grant opportunities.
   */
  async search(options: GrantsGovSearchOptions = {}): Promise<RawGrantRecord[]> {
    const params = this.buildSearchParams(options);
    const url = `${this.baseUrl}?${params.toString()}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Grants.gov API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const data = (await response.json()) as GrantsGovResponse;
    return this.transformResults(data.oppSearch);
  }

  /**
   * Get detailed information about a specific opportunity.
   */
  async getOpportunity(opportunityId: string): Promise<GrantsGovOpportunity | null> {
    const url = `https://www.grants.gov/grantsws/rest/opportunity/details?oppId=${opportunityId}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    try {
      const response = await fetch(url, { headers });

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

    while (startIndex < totalHits) {
      const params = this.buildSearchParams({
        ...options,
        rows: pageSize,
        startIndex,
      });

      const url = `${this.baseUrl}?${params.toString()}`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Grants.gov API error: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const data = (await response.json()) as GrantsGovResponse;
      totalHits = data.oppHits;

      const records = this.transformResults(data.oppSearch);
      allRecords.push(...records);

      startIndex += pageSize;

      if (onProgress) {
        onProgress(allRecords.length, totalHits);
      }

      // Rate limiting - wait between requests
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return allRecords;
  }

  /**
   * Build URL search params from options.
   */
  private buildSearchParams(options: GrantsGovSearchOptions): URLSearchParams {
    const params = new URLSearchParams();

    if (options.keyword) {
      params.set('keyword', options.keyword);
    }

    if (options.agency) {
      params.set('agency', options.agency);
    }

    if (options.eligibility) {
      params.set('eligibilities', options.eligibility);
    }

    if (options.fundingInstrument) {
      params.set('fundingInstruments', options.fundingInstrument);
    }

    if (options.category) {
      params.set('fundingCategories', options.category);
    }

    if (options.oppStatus) {
      params.set('oppStatuses', options.oppStatus);
    }

    if (options.dateRange) {
      params.set('startDate', this.formatDate(options.dateRange.startDate));
      params.set('endDate', this.formatDate(options.dateRange.endDate));
    }

    params.set('rows', String(options.rows || 25));
    params.set('startIndex', String(options.startIndex || 0));

    return params;
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
    results: GrantsGovResponse['oppSearch']
  ): RawGrantRecord[] {
    return results.map((opp) => ({
      opportunityId: opp.id,
      opportunityTitle: opp.title,
      agencyName: opp.agency,
      awardCeiling: 0, // Need to fetch details for this
      awardFloor: 0,
      closeDate: opp.closeDate,
      eligibleApplicants: [], // Need to fetch details
      categoryOfFunding: opp.docType,
      applicationUrl: `https://www.grants.gov/search-results-detail/${opp.id}`,
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
