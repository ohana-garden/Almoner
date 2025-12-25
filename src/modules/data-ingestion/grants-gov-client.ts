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
  message: string;
  data: Array<{
    opportunity_id: string;
    opportunity_number: string;
    opportunity_title: string;
    agency_code: string;
    agency_name: string;
    post_date: string;
    close_date: string;
    opportunity_status: string;
    award_ceiling: number;
    award_floor: number;
    funding_instrument?: string;
    funding_category?: string;
    applicant_types?: string[];
  }>;
  pagination_info: {
    page_offset: number;
    page_size: number;
    total_pages: number;
    total_records: number;
  };
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

    const data = await response.json();
    console.log('Grants.gov API response keys:', Object.keys(data));
    console.log('Grants.gov API response sample:', JSON.stringify(data).slice(0, 1000));

    // Navigate the nested response structure
    // API returns: { errorcode, msg, token, data: { ... } }
    let opportunities: unknown[] = [];

    if (data.data && typeof data.data === 'object') {
      console.log('data.data keys:', Object.keys(data.data));
      // Try common nested paths
      opportunities = data.data.oppHits || data.data.opportunities ||
                      data.data.results || data.data.items ||
                      (Array.isArray(data.data) ? data.data : []);
    } else if (Array.isArray(data.data)) {
      opportunities = data.data;
    } else if (data.oppHits) {
      opportunities = data.oppHits;
    } else if (data.opportunities) {
      opportunities = data.opportunities;
    }

    if (!Array.isArray(opportunities)) {
      console.log('Could not find opportunities array. Full response:', JSON.stringify(data).slice(0, 2000));
      return [];
    }

    console.log(`Found ${opportunities.length} opportunities`);
    return this.transformResults(opportunities);
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

      const data = await response.json();
      console.log('fetchAll response keys:', Object.keys(data));

      // Navigate the nested response structure
      let opportunities: unknown[] = [];

      if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
        console.log('fetchAll data.data keys:', Object.keys(data.data));
        // Try common nested paths
        opportunities = data.data.oppHits || data.data.opportunities ||
                        data.data.results || data.data.items || [];
        // Get total from nested pagination
        totalHits = data.data.pagination_info?.total_records ||
                    data.data.totalCount || data.data.hitCount ||
                    data.pagination_info?.total_records ||
                    data.totalCount || data.hitCount || 0;
      } else if (Array.isArray(data.data)) {
        opportunities = data.data;
        totalHits = data.pagination_info?.total_records || data.totalCount || data.hitCount || 0;
      } else if (data.oppHits) {
        opportunities = data.oppHits;
        totalHits = data.hitCount || 0;
      } else if (data.opportunities) {
        opportunities = data.opportunities;
        totalHits = data.totalCount || 0;
      }

      if (!Array.isArray(opportunities)) {
        console.log('fetchAll: Could not find array. Full response:', JSON.stringify(data).slice(0, 2000));
        break;
      }

      console.log(`fetchAll: Found ${opportunities.length} opportunities, total: ${totalHits}`);

      const records = this.transformResults(opportunities);
      allRecords.push(...records);

      startIndex += pageSize;

      if (onProgress) {
        onProgress(allRecords.length, totalHits);
      }

      // Rate limiting - wait between requests
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Stop if we got no results
      if (opportunities.length === 0) {
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
      body.query = options.keyword;
    }

    if (options.agency) {
      body.agency = options.agency;
    }

    if (options.eligibility) {
      body.applicant_type = options.eligibility;
    }

    if (options.fundingInstrument) {
      body.funding_instrument = options.fundingInstrument;
    }

    if (options.category) {
      body.funding_category = options.category;
    }

    if (options.oppStatus) {
      body.opportunity_status = options.oppStatus;
    }

    if (options.dateRange) {
      body.post_date = {
        start_date: this.formatDate(options.dateRange.startDate),
        end_date: this.formatDate(options.dateRange.endDate),
      };
    }

    body.pagination = {
      page_size: options.rows || 25,
      page_offset: options.startIndex || 1,
    };

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
   * Handles both snake_case and camelCase field names.
   */
  private transformResults(
    results: unknown[]
  ): RawGrantRecord[] {
    if (!results || !Array.isArray(results)) return [];

    return results.map((item) => {
      const opp = item as Record<string, unknown>;
      return {
      opportunityId: String(opp.opportunity_id || opp.opportunityId || opp.id || ''),
      opportunityTitle: String(opp.opportunity_title || opp.opportunityTitle || opp.title || ''),
      agencyName: String(opp.agency_name || opp.agencyName || opp.agency || opp.agency_code || opp.agencyCode || ''),
      awardCeiling: Number(opp.award_ceiling || opp.awardCeiling || 0),
      awardFloor: Number(opp.award_floor || opp.awardFloor || 0),
      closeDate: String(opp.close_date || opp.closeDate || ''),
      eligibleApplicants: (opp.applicant_types || opp.eligibleApplicants || opp.eligibilities || []) as string[],
      categoryOfFunding: String(opp.funding_category || opp.fundingCategory || opp.category || 'Other'),
      applicationUrl: `https://www.grants.gov/search-results-detail/${opp.opportunity_id || opp.opportunityId || opp.id}`,
      };
    });
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
