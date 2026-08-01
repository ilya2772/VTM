INSERT INTO "Instrument" (
  "id",
  "symbol",
  "displayName",
  "baseAsset",
  "quoteAsset",
  "source",
  "pythPriceFeedId",
  "priceExponent",
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES
  (
    'instrument-btc-usd',
    'BTC/USD',
    'Bitcoin / US Dollar',
    'BTC',
    'USD',
    'PYTH',
    '1',
    -8,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'instrument-eth-usd',
    'ETH/USD',
    'Ether / US Dollar',
    'ETH',
    'USD',
    'PYTH',
    '2',
    -8,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'instrument-sol-usd',
    'SOL/USD',
    'Solana / US Dollar',
    'SOL',
    'USD',
    'PYTH',
    '6',
    -8,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'instrument-xrp-usd',
    'XRP/USD',
    'XRP / US Dollar',
    'XRP',
    'USD',
    'PYTH',
    '14',
    -8,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("symbol") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "baseAsset" = EXCLUDED."baseAsset",
  "quoteAsset" = EXCLUDED."quoteAsset",
  "source" = EXCLUDED."source",
  "pythPriceFeedId" = EXCLUDED."pythPriceFeedId",
  "priceExponent" = EXCLUDED."priceExponent",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
