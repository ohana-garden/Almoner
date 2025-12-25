/**
 * Grants.gov API Client
 *
 * Fetches grant opportunities from the Grants.gov search2 API.
 * API: https://api.grants.gov/v1/api/search2
 *
 * Response structure:
 *   data.hitCount - total number of matching opportunities
 *   data.oppHits - array of opportunity summaries
 *
 * Pagination: uses startRecordNum (0-indexed offset) and rows (page size)
 */

import type { RawGrantRecord } from './index';

const GRANTS_GOV_SEARCH_URL = 'https://api.grants.gov/v1/api/search2';
const GRANTS_GOV_FETCH_URL = 'https://api.grants.gov/v1/api/fetchOpportunity';

/**
 * Search options for Grants.gov API.
 */
export interface GrantsGovSearchOptions {
  keyword?: string;
  agency?: string;
  eligibility?: string;
  fundingInstrument?: 'CA' | 'G' | 'PC' | 'O';
  category?: string;
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  oppStatus?: 'posted' | 'closed' | 'archived' | 'forecasted';
  rows?: number;
  startRecordNum?: number;
}

/**
 * Opportunity hit from search2 API response.
 */
interface OpportunityHit {
  opportunityNumber: string;
  opportunityTitle: string;
  opportunityCategory?: { description: string };
  fundingInstruments?: Array<{ description: string }>;
  fundingActivityCategories?: Array<{ description: string }>;
  cfdaList?: string[];
  cfdas?: Array<{ cfdaNumber: string }>;
  postingDate: string;
  lastUpdatedDate?: string;
  closingDate?: string;
  awardFloor?: number;
  awardCeiling?: number;
  applicantTypes?: Array<{ description: string }>;
  applicantEligibilityDesc?: string;
  agencyCode?: string;
  agencyName?: string;
  synopsis?: { synopsisDesc?: string };
}

/**
 * Grants.gov API client for the search2 endpoint.
 */
export class GrantsGovClient {
  constructor(_apiKey?: string) {
    // API key no longer required for search2 API
  }

  /**
   * Search for grant opportunities.
   */
  async search(options: GrantsGovSearchOptions = {}): Promise<RawGrantRecord[]> {
    const body = this.buildSearchBody(options);
    console.log('Grants.gov search request:', JSON.stringify(body));

    const response = await fetch(GRANTS_GOV_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Grants.gov API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const json = await response.json();
    console.log('Grants.gov response keys:', Object.keys(json));

    // Response structure: { data: { hitCount, oppHits: [...] } }
    const data = json.data;
    if (!data) {
      console.log('No data field in response:', JSON.stringify(json).slice(0, 500));
      return [];
    }

    console.log('data keys:', Object.keys(data));
    const oppHits = data.oppHits;
    const hitCount = data.hitCount || 0;

    if (!Array.isArray(oppHits)) {
      console.log('oppHits is not an array:', typeof oppHits);
      return [];
    }

    console.log(`Found ${oppHits.length} opportunities (total: ${hitCount})`);
    return this.transformResults(oppHits);
  }

  /**
   * Fetch all opportunities with pagination.
   */
  async fetchAll(
    options: GrantsGovSearchOptions,
    onProgress?: (fetched: number, total: number) => void
  ): Promise<RawGrantRecord[]> {
    const allRecords: RawGrantRecord[] = [];
    const rows = options.rows || 100;
    let startRecordNum = 0;
    let hitCount = Infinity;
    const maxRecords = 1000; // Safety limit

    while (startRecordNum < hitCount && startRecordNum < maxRecords) {
      const body = this.buildSearchBody({
        ...options,
        rows,
        startRecordNum,
      });

      console.log(`Fetching page at offset ${startRecordNum}...`);

      const response = await fetch(GRANTS_GOV_SEARCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Grants.gov API error: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const json = await response.json();
      const data = json.data;

      if (!data) {
        console.log('No data in response, stopping');
        break;
      }

      hitCount = data.hitCount || 0;
      const oppHits = data.oppHits;

      if (!Array.isArray(oppHits) || oppHits.length === 0) {
        console.log('No more results, stopping');
        break;
      }

      console.log(`Got ${oppHits.length} opportunities (total: ${hitCount})`);

      const records = this.transformResults(oppHits);
      allRecords.push(...records);

      if (onProgress) {
        onProgress(allRecords.length, hitCount);
      }

      startRecordNum += oppHits.length;

      // Rate limiting - 1 second between requests as per API guidelines
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(`Fetched ${allRecords.length} total opportunities`);
    return allRecords;
  }

  /**
   * Get detailed information about a specific opportunity.
   */
  async getOpportunity(opportunityId: string): Promise<OpportunityHit | null> {
    try {
      const response = await fetch(GRANTS_GOV_FETCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId }),
      });

      if (!response.ok) {
        return null;
      }

      const json = await response.json();
      return json.data || null;
    } catch {
      return null;
    }
  }

  /**
   * Build request body for search2 API.
   */
  private buildSearchBody(options: GrantsGovSearchOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
      rows: options.rows || 25,
      startRecordNum: options.startRecordNum || 0,
    };

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

    return body;
  }

  /**
   * Transform API results to RawGrantRecord format.
   */
  private transformResults(oppHits: OpportunityHit[]): RawGrantRecord[] {
    return oppHits.map((opp) => {
      // Extract agency name from various possible fields
      const agencyName = opp.agencyName || opp.agencyCode || '';

      // Extract eligible applicants from applicantTypes array
      const eligibleApplicants = opp.applicantTypes
        ? opp.applicantTypes.map((t) => t.description)
        : [];

      // Extract funding category from fundingActivityCategories
      const categoryOfFunding = opp.fundingActivityCategories?.[0]?.description || 'Other';

      // Build application URL
      const applicationUrl = `https://www.grants.gov/search-results-detail/${opp.opportunityNumber}`;

      return {
        opportunityId: opp.opportunityNumber,
        opportunityTitle: opp.opportunityTitle,
        agencyName,
        awardCeiling: opp.awardCeiling || 0,
        awardFloor: opp.awardFloor || 0,
        closeDate: opp.closingDate || '',
        eligibleApplicants,
        categoryOfFunding,
        applicationUrl,
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
