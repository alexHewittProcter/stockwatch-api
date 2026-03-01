import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3002', 10),

  finnhub: {
    apiKey: process.env.FINNHUB_API_KEY || '',
    baseUrl: 'https://finnhub.io/api/v1',
    wsUrl: 'wss://ws.finnhub.io',
    rateLimit: 60, // calls per minute (free tier)
  },

  alphaVantage: {
    apiKey: process.env.ALPHA_VANTAGE_API_KEY || '',
    baseUrl: 'https://www.alphavantage.co/query',
  },

  alpaca: {
    apiKey: process.env.ALPACA_API_KEY || '',
    secretKey: process.env.ALPACA_SECRET_KEY || '',
    paper: process.env.ALPACA_PAPER !== 'false',
    get baseUrl() {
      return this.paper
        ? 'https://paper-api.alpaca.markets'
        : 'https://api.alpaca.markets';
    },
    get dataUrl() {
      return 'https://data.alpaca.markets';
    },
  },

  polling: {
    activeInterval: 5000,
    inactiveTimeout: 300_000, // 5 min
    reducedInterval: 20_000,  // 1/4 speed
    deepInactiveTimeout: 900_000, // 15 min
    deepInactiveInterval: 300_000, // 5 min
    pauseTimeout: 3_600_000, // 1 hr
  },

  db: {
    path: './stockwatch.db',
  },
} as const;
