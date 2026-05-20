export type AdStatus = 'Active' | 'Paused' | 'Completed' | 'Draft';
export type AdFormat = 'Display' | 'Video' | 'Native' | 'Audio' | 'CTV' | 'DOOH' | 'Search';
export type Platform = 'DV360' | 'Meta' | 'Google Ads' | 'The Trade Desk' | 'Amazon DSP' | 'TikTok' | 'LinkedIn';

export interface Ad {
  id: string;
  name: string;
  format: AdFormat;
  status: AdStatus;
  platform: Platform;
  flightStart: string;
  flightEnd: string;
  budget: number;
  cpm: number;
  // Plan columns above — performance below (live highlights)
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
  creativeUrl: string;
}

export interface Campaign {
  id: string;
  name: string;
  objective: string;
  totalBudget: number;
  flightStart: string;
  flightEnd: string;
  ads: Ad[];
}

export interface Client {
  id: string;
  name: string;
  logo: string; // initials fallback
  industry: string;
  campaigns: Campaign[];
}

export const mockClients: Client[] = [
  {
    id: 'client-1',
    name: 'Horizon Auto Group',
    logo: 'HA',
    industry: 'Automotive',
    campaigns: [
      {
        id: 'camp-1a',
        name: 'Q2 2025 Brand Awareness',
        objective: 'Brand Awareness',
        totalBudget: 280000,
        flightStart: '2025-04-01',
        flightEnd: '2025-06-30',
        ads: [
          {
            id: 'AD-HAG-001',
            name: 'Horizon EV Launch — 15s Pre-Roll',
            format: 'Video',
            status: 'Active',
            platform: 'DV360',
            flightStart: '2025-04-01',
            flightEnd: '2025-05-31',
            budget: 90000,
            cpm: 12.50,
            impressions: 5_820_000,
            clicks: 23_100,
            ctr: 0.40,
            spend: 72_750,
            creativeUrl: 'https://cdn.example.com/horizon/ev-launch-15s.mp4',
          },
          {
            id: 'AD-HAG-002',
            name: 'Horizon EV Launch — 300x250 Display',
            format: 'Display',
            status: 'Active',
            platform: 'DV360',
            flightStart: '2025-04-01',
            flightEnd: '2025-06-30',
            budget: 45000,
            cpm: 4.20,
            impressions: 8_100_000,
            clicks: 16_200,
            ctr: 0.20,
            spend: 34_020,
            creativeUrl: 'https://cdn.example.com/horizon/ev-300x250.png',
          },
          {
            id: 'AD-HAG-003',
            name: 'Trade-In Offer — Meta Feed',
            format: 'Native',
            status: 'Active',
            platform: 'Meta',
            flightStart: '2025-04-15',
            flightEnd: '2025-06-30',
            budget: 55000,
            cpm: 8.75,
            impressions: 3_420_000,
            clicks: 41_040,
            ctr: 1.20,
            spend: 29_925,
            creativeUrl: 'https://cdn.example.com/horizon/trade-in-meta.jpg',
          },
          {
            id: 'AD-HAG-004',
            name: 'Dealer Locator — Google Search',
            format: 'Search',
            status: 'Active',
            platform: 'Google Ads',
            flightStart: '2025-04-01',
            flightEnd: '2025-06-30',
            budget: 40000,
            cpm: 0,
            impressions: 620_000,
            clicks: 31_000,
            ctr: 5.00,
            spend: 38_200,
            creativeUrl: '',
          },
          {
            id: 'AD-HAG-005',
            name: 'Model X CTV Spot — 30s',
            format: 'CTV',
            status: 'Paused',
            platform: 'The Trade Desk',
            flightStart: '2025-05-01',
            flightEnd: '2025-06-30',
            budget: 50000,
            cpm: 28.00,
            impressions: 890_000,
            clicks: 0,
            ctr: 0,
            spend: 24_920,
            creativeUrl: 'https://cdn.example.com/horizon/ctv-30s.mp4',
          },
        ],
      },
      {
        id: 'camp-1b',
        name: 'Summer Sales Event',
        objective: 'Conversions',
        totalBudget: 120000,
        flightStart: '2025-06-01',
        flightEnd: '2025-07-31',
        ads: [
          {
            id: 'AD-HAG-006',
            name: 'Summer Sale — 728x90 Leaderboard',
            format: 'Display',
            status: 'Draft',
            platform: 'DV360',
            flightStart: '2025-06-01',
            flightEnd: '2025-07-31',
            budget: 30000,
            cpm: 3.80,
            impressions: 0,
            clicks: 0,
            ctr: 0,
            spend: 0,
            creativeUrl: 'https://cdn.example.com/horizon/summer-728x90.png',
          },
          {
            id: 'AD-HAG-007',
            name: 'Summer Sale — TikTok TopView',
            format: 'Video',
            status: 'Draft',
            platform: 'TikTok',
            flightStart: '2025-06-15',
            flightEnd: '2025-07-31',
            budget: 50000,
            cpm: 15.00,
            impressions: 0,
            clicks: 0,
            ctr: 0,
            spend: 0,
            creativeUrl: 'https://cdn.example.com/horizon/tiktok-topview.mp4',
          },
        ],
      },
    ],
  },
  {
    id: 'client-2',
    name: 'Bloom & Co.',
    logo: 'BC',
    industry: 'Retail / Beauty',
    campaigns: [
      {
        id: 'camp-2a',
        name: 'Spring Collection Launch',
        objective: 'Brand Awareness + Traffic',
        totalBudget: 95000,
        flightStart: '2025-03-15',
        flightEnd: '2025-05-15',
        ads: [
          {
            id: 'AD-BLM-001',
            name: 'Spring Lookbook — Instagram Stories',
            format: 'Video',
            status: 'Completed',
            platform: 'Meta',
            flightStart: '2025-03-15',
            flightEnd: '2025-04-30',
            budget: 30000,
            cpm: 10.20,
            impressions: 2_940_000,
            clicks: 52_920,
            ctr: 1.80,
            spend: 29_988,
            creativeUrl: 'https://cdn.example.com/bloom/spring-stories.mp4',
          },
          {
            id: 'AD-BLM-002',
            name: 'Spring Lookbook — Pinterest Promoted Pin',
            format: 'Native',
            status: 'Completed',
            platform: 'The Trade Desk',
            flightStart: '2025-03-15',
            flightEnd: '2025-05-15',
            budget: 20000,
            cpm: 6.50,
            impressions: 3_076_000,
            clicks: 30_760,
            ctr: 1.00,
            spend: 19_994,
            creativeUrl: 'https://cdn.example.com/bloom/pinterest-pin.png',
          },
          {
            id: 'AD-BLM-003',
            name: 'New Arrivals — Display Retargeting',
            format: 'Display',
            status: 'Completed',
            platform: 'Google Ads',
            flightStart: '2025-04-01',
            flightEnd: '2025-05-15',
            budget: 15000,
            cpm: 3.10,
            impressions: 4_838_000,
            clicks: 48_380,
            ctr: 1.00,
            spend: 14_998,
            creativeUrl: 'https://cdn.example.com/bloom/retargeting-300x250.png',
          },
        ],
      },
    ],
  },
  {
    id: 'client-3',
    name: 'NorthEdge Financial',
    logo: 'NF',
    industry: 'Financial Services',
    campaigns: [
      {
        id: 'camp-3a',
        name: 'Mortgage Rates Q2',
        objective: 'Lead Generation',
        totalBudget: 200000,
        flightStart: '2025-04-01',
        flightEnd: '2025-06-30',
        ads: [
          {
            id: 'AD-NEF-001',
            name: 'Rate Calculator — LinkedIn Sponsored',
            format: 'Native',
            status: 'Active',
            platform: 'LinkedIn',
            flightStart: '2025-04-01',
            flightEnd: '2025-06-30',
            budget: 80000,
            cpm: 42.00,
            impressions: 1_100_000,
            clicks: 11_000,
            ctr: 1.00,
            spend: 46_200,
            creativeUrl: 'https://cdn.example.com/northedge/linkedin-sponsored.png',
          },
          {
            id: 'AD-NEF-002',
            name: 'Home Loan — Google Ads Branded',
            format: 'Search',
            status: 'Active',
            platform: 'Google Ads',
            flightStart: '2025-04-01',
            flightEnd: '2025-06-30',
            budget: 60000,
            cpm: 0,
            impressions: 280_000,
            clicks: 22_400,
            ctr: 8.00,
            spend: 53_760,
            creativeUrl: '',
          },
          {
            id: 'AD-NEF-003',
            name: 'Savings Account — Programmatic Display',
            format: 'Display',
            status: 'Active',
            platform: 'DV360',
            flightStart: '2025-04-01',
            flightEnd: '2025-06-30',
            budget: 60000,
            cpm: 5.60,
            impressions: 6_250_000,
            clicks: 43_750,
            ctr: 0.70,
            spend: 35_000,
            creativeUrl: 'https://cdn.example.com/northedge/savings-300x600.png',
          },
        ],
      },
    ],
  },
];
